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