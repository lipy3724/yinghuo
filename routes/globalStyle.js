const express = require('express');
const axios = require('axios');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { checkFeatureAccess, FEATURES } = require('../middleware/featureAccess');
const User = require('../models/User');
const { FeatureUsage } = require('../models/FeatureUsage');

// 通义万相API密钥
const API_KEY = process.env.DASHSCOPE_API_KEY;
// 全局风格化API基础URL
const API_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis';

/**
 * @route   POST /api/global-style/create-task
 * @desc    创建全局风格化任务
 * @access  私有
 */
router.post('/create-task', protect, checkFeatureAccess('GLOBAL_STYLE'), async (req, res) => {
  try {
    const { imageUrl, prompt, strength } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({
        code: "InvalidParameter",
        message: "缺少必要参数: imageUrl",
        request_id: `req_${Date.now()}`
      });
    }
    
    if (!prompt) {
      return res.status(400).json({
        code: "InvalidParameter",
        message: "缺少必要参数: prompt",
        request_id: `req_${Date.now()}`
      });
    }
    
    // 检查strength参数是否有效，如果无效使用默认值0.5
    const strengthValue = typeof strength === 'number' && strength >= 0 && strength <= 1 
      ? strength 
      : 0.5;
    
    // 检查prompt内容，确保不含有可能导致JSON解析错误的特殊字符
    const sanitizedPrompt = sanitizeJsonString(prompt);
    
    console.log(`创建全局风格化任务: ${sanitizedPrompt}, 强度: ${strengthValue}`);
    
    // 构建请求数据
    const requestData = {
      "model": "wanx2.1-imageedit",
      "input": {
        "function": "stylization_all", // 全局风格化的function参数
        "prompt": sanitizedPrompt,
        "base_image_url": imageUrl
      },
      "parameters": {
        "n": 1,
        "strength": strengthValue // 添加风格化强度参数
      }
    };
    
    console.log('发送到通义万相的数据:', JSON.stringify(requestData, null, 2));
    
    // 创建任务
    const response = await createTask(requestData);
    
    // 获取当前用户ID和积分消费信息
    const userId = req.user.id;
    const creditCost = req.featureUsage?.creditCost || FEATURES['GLOBAL_STYLE'].creditCost;
    
    // 获取任务ID
    const taskId = response.data.output?.task_id || `style-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    
    // 保存任务信息到全局变量
    if (!global.globalStyleTasks) {
      global.globalStyleTasks = {};
    }
    
    global.globalStyleTasks[taskId] = {
      userId: userId,
      creditCost: creditCost,
      hasChargedCredits: true,
      timestamp: new Date(),
      prompt: sanitizedPrompt,
      strength: strengthValue
    };
    
    console.log(`全局风格化任务信息已保存: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}`);
    
    // 将任务信息保存到数据库
    try {
      // 查找或创建FeatureUsage记录
      const [usage, created] = await FeatureUsage.findOrCreate({
        where: { 
          userId: userId, 
          featureName: 'GLOBAL_STYLE' 
        },
        defaults: {
          usageCount: 0,
          lastUsedAt: new Date(),
          credits: 0,
          details: '{}'
        }
      });
      
      // 解析现有详情
      const details = JSON.parse(usage.details || '{}');
      // 准备任务列表
      const tasks = details.tasks || [];
      // 添加新任务
      tasks.push({
        taskId: taskId,
        creditCost: creditCost,
        timestamp: new Date(),
          prompt: sanitizedPrompt,
          strength: strengthValue
      });
      
      // 更新usage记录 - 同时记录credits字段
      const currentCredits = usage.credits || 0;
      usage.credits = currentCredits + creditCost;
      usage.usageCount += 1;
      usage.lastUsedAt = new Date();
      usage.details = JSON.stringify({
        ...details,
        tasks: tasks
      });
      
      // 保存更新
      await usage.save();
      console.log(`全局风格化任务信息已保存到数据库: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}`);
    } catch (saveError) {
      console.error('保存全局风格化任务详情失败:', saveError);
      // 继续响应，不中断流程
    }
    
    // 确保返回有效的JSON格式
    res.status(response.status || 200).json(response.data);
  } catch (error) {
    handleApiError(error, res);
  }
});

/**
 * @route   GET /api/global-style/task-status
 * @desc    查询全局风格化任务状态
 * @access  Private
 */
router.get('/task-status', protect, async (req, res) => {
  try {
    const { taskId } = req.query;
    
    if (!taskId || !/^[0-9a-f-]+$/i.test(taskId)) {
      return res.status(400).json({
        code: "InvalidParameter",
        message: '无效的任务ID',
        request_id: `req_${Date.now()}`
      });
    }
    
    console.log(`查询全局风格化任务状态: ${taskId}`);
    
    // 准备请求头
    const headers = {
      'Authorization': `Bearer ${API_KEY}`
    };
    
    // 构建请求URL
    const url = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`;
    
    try {
      // 发送查询任务状态请求
      const response = await axios.get(url, { headers });
      
      console.log(`任务状态查询响应: ${response.status}, 任务状态: ${response.data.output?.task_status || '未知'}`);
      
      // 这里处理响应，提取出需要的图像URL
      const taskStatus = response.data.output?.task_status || 'UNKNOWN';
      
      // 如果任务成功，返回图像URL
      if (taskStatus === 'SUCCEEDED') {
        // 从结果中获取图像URL
        const results = response.data.output?.results || [];
        const imageUrl = results.length > 0 ? results[0]?.url : null;
        
        return res.status(200).json({
          status: taskStatus,
          imageUrl: imageUrl,
          request_id: response.data.request_id
        });
      }
      
      // 如果任务失败，返回错误信息
      if (taskStatus === 'FAILED') {
        return res.status(200).json({
          status: taskStatus,
          message: response.data.output?.message || '风格化任务失败',
          code: response.data.output?.code || 'ProcessingFailed',
          request_id: response.data.request_id
        });
      }
      
      // 如果任务仍在处理中，返回当前状态
      return res.status(200).json({
        status: taskStatus,
        request_id: response.data.request_id
      });
    } catch (error) {
      // 处理API请求错误
      console.error('查询任务状态失败:', error);
      
      if (error.response) {
        return res.status(error.response.status || 500).json({
          status: 'FAILED',
          code: error.response.data.code || "InternalServerError",
          message: error.response.data.message || '查询任务状态失败',
          request_id: error.response.data.request_id || `req_${Date.now()}`
        });
      }
      
      return res.status(500).json({
        status: 'FAILED',
        code: "InternalServerError",
        message: '查询任务状态失败: ' + error.message,
        request_id: `req_${Date.now()}`
      });
    }
  } catch (error) {
    console.error('查询任务状态路由错误:', error);
    
    return res.status(500).json({
      status: 'FAILED',
      code: "InternalServerError",
      message: '查询任务状态失败: ' + error.message,
      request_id: `req_${Date.now()}`
    });
  }
});

/**
 * 创建全局风格化任务
 * @param {Object} requestData 请求数据
 * @returns {Promise<Object>} API响应结果
 */
async function createTask(requestData) {
  try {
    // 准备请求头
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'X-DashScope-Async': 'enable' // 启用异步模式
    };
    
    // 发送创建任务请求
    const response = await axios.post(API_BASE_URL, requestData, { headers });
    
    console.log('通义万相API响应:', response.status, JSON.stringify(response.data, null, 2));
    
    return { status: response.status, data: response.data };
  } catch (error) {
    console.error('创建任务失败:', error);
    throw error;
  }
}

/**
 * 处理API错误
 * @param {Error} error 错误对象
 * @param {Object} res 响应对象
 */
function handleApiError(error, res) {
  console.error('API调用失败:', error);
  
  if (error.response) {
    console.error('API错误响应:', error.response.status);
    
    try {
      console.error('错误详情:', JSON.stringify(error.response.data, null, 2));
      
      // 确保错误消息是安全的JSON字符串
      let errorMessage = error.response.data.message || '调用阿里云API失败';
      if (typeof errorMessage === 'string') {
        errorMessage = sanitizeJsonString(errorMessage);
      }
      
      // 返回阿里云原始错误响应
      return res.status(error.response.status).json({
        code: error.response.data.code || "ApiCallError",
        message: errorMessage,
        request_id: error.response.data.request_id || `req_${Date.now()}`
      });
    } catch (jsonError) {
      console.error('解析错误响应失败:', jsonError);
      return res.status(500).json({
        code: "InternalServerError",
        message: '处理API响应失败，请稍后再试',
        request_id: `req_${Date.now()}`
      });
    }
  }
  
  // 返回一般错误响应
  return res.status(500).json({
    code: "InternalServerError",
    message: 'API调用失败: ' + sanitizeJsonString(error.message),
    request_id: `req_${Date.now()}`
  });
}

/**
 * 处理字符串以确保它可以安全地作为JSON字符串
 * @param {string} str 原始字符串
 * @returns {string} 处理后的安全字符串
 */
function sanitizeJsonString(str) {
  if (typeof str !== 'string') return '';
  
  // 替换可能导致JSON解析错误的特殊字符
  return str.replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t')
            .replace(/\f/g, '\\f');
}

module.exports = router; 