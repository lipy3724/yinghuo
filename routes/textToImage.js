const express = require('express');
const axios = require('axios');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { checkFeatureAccess } = require('../middleware/featureAccess');
const { uploadToOSS } = require('../api-utils');

// 通义万相API密钥
const API_KEY = process.env.DASHSCOPE_API_KEY || 'sk-a53c9eb917ce49558997c6bc0edac820';
const API_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';
const API_TASK_URL = 'https://dashscope.aliyuncs.com/api/v1/tasks/';

/**
 * @route   POST /api/text-to-image/generate
 * @desc    生成文生图片 - 创建任务
 * @access  私有
 */
router.post('/generate', protect, checkFeatureAccess('TEXT_TO_IMAGE'), async (req, res) => {
  try {
    const { prompt, negativePrompt = '', size = '1024*1024', n = 1, prompt_extend = true, watermark = false } = req.body;
    const userId = req.user.id;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: '提示词不能为空'
      });
    }

    // 准备请求参数 - 使用V2版API
    const requestData = {
      model: "wanx2.1-t2i-turbo", // 升级到V2模型
      input: {
        prompt: prompt,
        negative_prompt: negativePrompt
      },
      parameters: {
        size: size.replace('x', '*'), // 确保使用*而不是x作为分隔符
        n: parseInt(n),
        prompt_extend: prompt_extend,
        watermark: watermark
      }
    };

    console.log('准备发送到通义万相的数据:', JSON.stringify(requestData, null, 2));

    // 准备请求头 - 添加异步任务头
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'X-DashScope-Async': 'enable' // 启用异步任务处理
    };

    // 调用通义万相API创建任务
    const response = await axios.post(API_BASE_URL, requestData, { headers });

    console.log('通义万相API创建任务响应:', response.status, JSON.stringify(response.data, null, 2));

    // 检查是否成功创建任务
    if (response.data && response.data.output && response.data.output.task_id) {
      const taskId = response.data.output.task_id;
      const taskStatus = response.data.output.task_status;

      // 获取功能配置信息
      const { FEATURES } = require('../middleware/featureAccess');
      const creditCost = FEATURES.TEXT_TO_IMAGE.creditCost;
      
      // 记录任务信息到全局变量，方便后续查询和积分统计
      global.textToImageTasks[taskId] = {
        userId: userId,
        prompt: prompt,
        timestamp: new Date(),
        creditCost: creditCost,
        hasChargedCredits: true
      };

      return res.json({
        success: true,
        message: '图片生成任务已创建',
        taskId: taskId,
        taskStatus: taskStatus,
        requestId: response.data.request_id
      });
    } else {
      return res.status(500).json({
        success: false,
        message: '创建图片生成任务失败',
        error: response.data.message || '未知错误'
      });
    }
  } catch (error) {
    console.error('创建图片生成任务出错:', error);
    
    if (error.response) {
      // 阿里云API错误
      return res.status(error.response.status).json({
        success: false,
        message: '创建图片生成任务失败: ' + (error.response.data.message || error.message),
        error: error.response.data
      });
    }
    
    return res.status(500).json({
      success: false,
      message: '服务器错误，无法创建图片生成任务',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/text-to-image/task/:taskId
 * @desc    查询文生图任务状态和结果
 * @access  私有
 */
router.get('/task/:taskId', protect, async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: '任务ID不能为空'
      });
    }

    // 准备请求头
    const headers = {
      'Authorization': `Bearer ${API_KEY}`
    };

    // 查询任务状态
    const response = await axios.get(`${API_TASK_URL}${taskId}`, { headers });

    console.log('查询任务状态响应:', response.status, JSON.stringify(response.data, null, 2));

    const taskStatus = response.data.output.task_status;

    // 如果任务成功完成
    if (taskStatus === 'SUCCEEDED') {
      // 记录任务完成状态到全局变量
      if (global.textToImageTasks && global.textToImageTasks[taskId]) {
        global.textToImageTasks[taskId].status = 'SUCCEEDED';
        global.textToImageTasks[taskId].completedAt = new Date();
        
        // 查找或创建数据库中的使用记录
        try {
          const { FeatureUsage } = require('../models/FeatureUsage');
          const userId = req.user.id;
          
          // 获取功能配置信息
          const { FEATURES } = require('../middleware/featureAccess');
          const creditCost = FEATURES.TEXT_TO_IMAGE.creditCost;
          
          // 查找现有记录
          let usage = await FeatureUsage.findOne({
            where: { userId, featureName: 'TEXT_TO_IMAGE' }
          });
          
          if (usage) {
            // 解析现有任务记录
            let details = {};
            try {
              details = usage.details ? JSON.parse(usage.details) : {};
            } catch (e) {
              details = {};
            }
            
            if (!details.tasks) {
              details.tasks = [];
            }
            
            // 检查任务是否已记录
            const taskExists = details.tasks.some(task => task.taskId === taskId);
            
            if (!taskExists) {
              // 添加新的任务记录
              details.tasks.push({
                taskId: taskId,
                creditCost: creditCost,
                timestamp: new Date(),
                prompt: global.textToImageTasks[taskId].prompt
              });
              
              // 更新使用记录
              // 不要再次增加usageCount，已经在featureAccess中间件中增加过一次
              // usage.usageCount += 1;
              // 不要累加积分，已在checkFeatureAccess中间件中扣除
              // usage.credits += creditCost;
              usage.details = JSON.stringify(details);
              usage.lastUsedAt = new Date();
              await usage.save();
              
              console.log(`已更新用户 ${userId} 的文生图片使用记录，添加任务 ${taskId}`);
            }
          } else {
            // 创建新记录
            await FeatureUsage.create({
              userId: userId,
              featureName: 'TEXT_TO_IMAGE',
              usageCount: 1,
              credits: 0, // 设置为0，因为积分已在checkFeatureAccess中间件中扣除
              details: JSON.stringify({
                tasks: [{
                  taskId: taskId,
                  creditCost: creditCost,
                  timestamp: new Date(),
                  prompt: global.textToImageTasks[taskId].prompt
                }]
              }),
              lastUsedAt: new Date()
            });
            
            console.log(`已为用户 ${userId} 创建文生图片使用记录，任务 ${taskId}`);
          }
        } catch (dbError) {
          console.error('保存文生图片使用记录失败:', dbError);
          // 继续处理，不影响用户使用
        }
      }
      
      // 根据文档返回格式处理结果
      if (response.data.output.results && response.data.output.results.length > 0) {
        // 获取图片URL列表 - 每个result对象中的url属性包含图片URL
        const imageUrls = response.data.output.results.map(result => result.url);
        
        return res.json({
          success: true,
          message: '图片生成成功',
          taskStatus: taskStatus,
          images: imageUrls,
          originalPrompt: response.data.output.results[0].orig_prompt || prompt,
          actualPrompt: response.data.output.results[0].actual_prompt || prompt,
          requestId: response.data.request_id
        });
      } else {
        // 检查是否有其他可能的结果格式
        console.log('任务成功但没有标准results数组，尝试查找其他结果格式');
        
        let imageUrls = [];
        
        // 检查task_metrics字段
        if (response.data.output.task_metrics) {
          console.log('找到task_metrics:', response.data.output.task_metrics);
        }
        
        // 尝试查找result_url字段
        if (response.data.output.result_url) {
          imageUrls.push(response.data.output.result_url);
        }
        
        // 尝试查找result_urls数组
        if (response.data.output.result_urls && response.data.output.result_urls.length > 0) {
          imageUrls = imageUrls.concat(response.data.output.result_urls);
        }
        
        if (imageUrls.length > 0) {
          return res.json({
            success: true,
            message: '图片生成成功(非标准格式)',
            taskStatus: taskStatus,
            images: imageUrls,
            requestId: response.data.request_id
          });
        }
        
        return res.status(500).json({
          success: false,
          message: '任务成功但未返回图片结果',
          taskStatus: taskStatus,
          rawResponse: response.data.output
        });
      }
    } 
    // 如果任务失败
    else if (taskStatus === 'FAILED') {
      // 更新全局变量中的任务状态
      if (global.textToImageTasks && global.textToImageTasks[taskId]) {
        global.textToImageTasks[taskId].status = 'FAILED';
        global.textToImageTasks[taskId].errorMessage = response.data.output.message || '未知错误';
        global.textToImageTasks[taskId].completedAt = new Date();
      }
      
      return res.status(500).json({
        success: false,
        message: '图片生成任务失败',
        taskStatus: taskStatus,
        error: response.data.output.message || '未知错误'
      });
    } 
    // 如果任务仍在处理中
    else {
      return res.json({
        success: true,
        message: '图片生成任务正在处理中',
        taskStatus: taskStatus,
        requestId: response.data.request_id
      });
    }
  } catch (error) {
    console.error('查询图片生成任务出错:', error);
    
    if (error.response) {
      // 阿里云API错误
      return res.status(error.response.status).json({
        success: false,
        message: '查询图片生成任务失败: ' + (error.response.data.message || error.message),
        error: error.response.data
      });
    }
    
    return res.status(500).json({
      success: false,
      message: '服务器错误，无法查询图片生成任务',
      error: error.message
    });
  }
});

module.exports = router; 