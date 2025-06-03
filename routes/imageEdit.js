const express = require('express');
const axios = require('axios');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { checkFeatureAccess, FEATURES } = require('../middleware/featureAccess');
const User = require('../models/User');
const { FeatureUsage } = require('../models/FeatureUsage');

// 通义万相API密钥
const API_KEY = process.env.DASHSCOPE_API_KEY || 'sk-a53c9eb917ce49558997c6bc0edac820';
// 修改回正确的API基础URL
const API_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis';

/**
 * @route   POST /api/image-edit/create-task
 * @desc    创建图像编辑任务
 * @access  私有
 */
router.post('/create-task', protect, async (req, res) => {
  try {
    const requestData = req.body;
    
    // 获取功能类型，根据功能类型使用不同的功能鉴权
    const functionType = requestData.input?.function;
    
    // 如果是图像上色功能，需要验证IMAGE_COLORIZATION权限
    if (functionType === 'colorization') {
      // 使用图像上色权限检查中间件
      return checkFeatureAccess('IMAGE_COLORIZATION')(req, res, async () => {
        try {
          const response = await createTask(requestData);
          return res.status(response.status || 200).json(response.data);
        } catch (error) {
          handleApiError(error, res);
        }
      });
    } 
    // 如果是局部重绘功能，需要验证LOCAL_REDRAW权限
    else if (functionType === 'inpainting' || functionType === 'description_edit_with_mask') {
      // 使用局部重绘权限检查中间件
      return checkFeatureAccess('LOCAL_REDRAW')(req, res, async () => {
        try {
          const response = await createTask(requestData);
          return res.status(response.status || 200).json(response.data);
        } catch (error) {
          handleApiError(error, res);
        }
      });
    }
    // 如果是智能扩图功能，需要验证IMAGE_EXPANSION权限
    // 检查是否为扩图请求：1) function为expand 或 2) parameters包含top_scale、bottom_scale等扩图参数
    else if (functionType === 'expand' || 
            (functionType === 'description_edit' && 
              (requestData.parameters?.outpainting_direction || 
               requestData.parameters?.outpainting_scale || 
               requestData.parameters?.expand_scales ||
               requestData.parameters?.top_scale ||
               requestData.parameters?.bottom_scale ||
               requestData.parameters?.left_scale ||
               requestData.parameters?.right_scale))) {
      // 使用智能扩图权限检查中间件
      return checkFeatureAccess('IMAGE_EXPANSION')(req, res, async () => {
        try {
          const response = await createTask(requestData);
          return res.status(response.status || 200).json(response.data);
        } catch (error) {
          handleApiError(error, res);
        }
      });
    }
    // 如果是模糊图片变清晰功能，需要验证IMAGE_SHARPENING权限
    else if (functionType === 'super_resolution') {
      // 使用模糊图片变清晰权限检查中间件
      return checkFeatureAccess('IMAGE_SHARPENING')(req, res, async () => {
        try {
          const response = await createTask(requestData);
          return res.status(response.status || 200).json(response.data);
        } catch (error) {
          handleApiError(error, res);
        }
      });
    }
    // 其他功能类型使用默认的IMAGE_EDIT权限
    else {
      return checkFeatureAccess('IMAGE_EDIT')(req, res, async () => {
        try {
          const response = await createTask(requestData);
          return res.status(response.status || 200).json(response.data);
        } catch (error) {
          handleApiError(error, res);
        }
      });
    }
  } catch (error) {
    handleApiError(error, res);
  }
});

/**
 * @route   GET /api/image-edit/task-status/:taskId
 * @desc    查询通义万相图像编辑任务状态
 * @access  Private
 */
router.get('/task-status/:taskId', protect, async (req, res) => {
    try {
        const { taskId } = req.params;
        
        // 检查任务ID是否存在且有效
        if (!taskId || !/^[0-9a-f-]+$/i.test(taskId)) {
            return res.status(400).json({
                code: "InvalidParameter",
                message: '无效的任务ID',
                request_id: `req_${Date.now()}`
            });
        }
        
        console.log(`查询任务状态: ${taskId}`);
        
        // 准备请求头 - 确保与官方文档一致
        const headers = {
            'Authorization': `Bearer ${API_KEY}`
        };
        
        // 构建请求URL - 与官方文档保持一致
        const url = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`;
        
        console.log(`发送请求: GET ${url}`);
        
        try {
            // 发送查询任务状态请求
            const response = await axios.get(url, { headers });
            
            console.log(`任务状态查询响应: ${response.status}, 任务状态: ${response.data.output?.task_status || '未知'}`);
            
            // 记录详细响应以便调试
            const responseData = response.data;
            console.log('详细响应数据:', JSON.stringify(responseData, null, 2));
            
            // 直接返回原始响应，保持与官方文档完全一致的格式
            // 响应中包含:
            // 1. request_id
            // 2. output 对象:
            //    - task_id: 任务ID
            //    - task_status: 任务状态 (PENDING/RUNNING/SUCCEEDED/FAILED/CANCELED/UNKNOWN)
            //    - submit_time/scheduled_time/end_time: 时间信息
            //    - results: 结果数组 [{ url: "..." }] 或包含错误信息的对象
            //    - task_metrics: 任务统计信息 { TOTAL, SUCCEEDED, FAILED }
            //    - 错误时: code 和 message 字段
            // 3. usage 对象: { image_count: 图片数量 }
            return res.status(200).json(responseData);
        } catch (error) {
            // 特殊处理 InvalidParameter: function must in [...] 错误
            // 这是阿里云API的一个常见错误，需要做特殊处理
            if (error.response && 
                error.response.data && 
                error.response.data.code === 'InvalidParameter' && 
                error.response.data.message && 
                error.response.data.message.includes('function must in')) {
                
                console.log('检测到function参数错误，尝试处理...');
                
                // 创建一个模拟的任务失败响应，保持格式与API一致
                return res.status(200).json({
                    request_id: `req_${Date.now()}`,
                    output: {
                        task_id: taskId,
                        task_status: 'FAILED',
                        code: 'UnsupportedFunction',
                        message: '不支持的图像编辑功能类型',
                        task_metrics: {
                            TOTAL: 1,
                            SUCCEEDED: 0,
                            FAILED: 1
                        }
                    }
                });
            }
            
            // 其他错误按原方式处理
            throw error;
        }
    } catch (error) {
        console.error('查询任务状态失败:');
        
        if (error.response) {
            console.error(`状态码: ${error.response.status}`);
            console.error('响应数据:', error.response.data);
            
            // 返回阿里云原始错误响应，确保格式与官方文档一致
            return res.status(error.response.status || 500).json({
                code: error.response.data.code || "InternalServerError",
                message: error.response.data.message || '查询任务状态失败',
                request_id: error.response.data.request_id || `req_${Date.now()}`
            });
        }
        
        // 自定义错误格式，与官方文档保持一致
        return res.status(500).json({
            code: "InternalServerError",
            message: '查询任务状态失败: ' + error.message,
            request_id: `req_${Date.now()}`
        });
    }
});

/**
 * 创建图像编辑任务
 * @param {Object} requestData 请求数据
 * @returns {Promise<Object>} API响应结果
 */
async function createTask(requestData) {
  try {
    console.log('准备发送到通义万相的数据:', JSON.stringify(requestData, null, 2));
    
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
    console.error('API错误响应:', error.response.status, JSON.stringify(error.response.data, null, 2));
    
    // 返回阿里云原始错误响应
    return res.status(error.response.status).json({
      code: error.response.data.code || "ApiCallError",
      message: error.response.data.message || '调用阿里云API失败',
      request_id: error.response.data.request_id || `req_${Date.now()}`
    });
  }
  
  // 返回一般错误响应
  return res.status(500).json({
    code: "InternalServerError",
    message: 'API调用失败: ' + error.message,
    request_id: `req_${Date.now()}`
  });
}

module.exports = router; 