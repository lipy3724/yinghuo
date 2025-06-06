const express = require('express');
const router = express.Router();
const axios = require('axios');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const { FeatureUsage } = require('../models/FeatureUsage');
const ImageHistory = require('../models/ImageHistory');
const { sequelize } = require('../config/db');
const multer = require('multer');
const { uploadFile } = require('../utils/ossService'); // 导入OSS上传服务
const fs = require('fs');

// 配置文件上传存储
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function(req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

// 创建upload中间件
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 30 * 1024 * 1024 } // 30MB限制
});

// 视频结果模型
const VideoResult = require('../models/VideoResult');

// 存储用户创建的视频任务
const userTasks = {};
// 任务状态缓存，避免过于频繁地请求阿里云API
const taskStatusCache = {
  // taskId: {
  //   status: 'PENDING', // 任务状态
  //   lastFetchTime: timestamp, // 上次从阿里云API获取状态的时间
  //   data: {...} // 上次API返回的完整数据
  // }
};

// 任务状态查询最小间隔 (单位: ms)
const STATUS_QUERY_MIN_INTERVAL = {
  'PENDING': 10000,  // 排队中状态，10秒查询一次
  'RUNNING': 5000,   // 处理中状态，5秒查询一次
  'default': 3000    // 默认状态，3秒查询一次
};

/**
 * @route   POST /api/text-to-video/create
 * @desc    创建文生视频任务
 * @access  私有
 */
router.post('/create', protect, async (req, res) => {
  try {
    const { prompt, model, size } = req.body;
    const userId = req.user.id;
    
    console.log('收到视频生成请求:', { prompt, model, size, userId });
    
    // 参数验证
    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: '请提供视频描述(prompt)'
      });
    }
    
    if (!model || !['wanx2.1-t2v-turbo', 'wanx2.1-t2v-plus'].includes(model)) {
      return res.status(400).json({
        success: false,
        message: '请提供有效的模型名称'
      });
    }
    
    if (!size) {
      return res.status(400).json({
        success: false,
        message: '请提供视频尺寸'
      });
    }
    
    // 费用计算 - 积分制
    const costPerSecond = model === 'wanx2.1-t2v-turbo' ? 13.2 : 70; // 改为13.2积分/秒，使5秒视频总计为66积分
    const estimatedCost = costPerSecond * 5; // 假设生成5秒视频
    
    // 查询用户积分
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 检查用户积分是否足够，但暂不扣除
    if (user.credits < estimatedCost) {
      return res.status(400).json({
        success: false,
        message: `积分不足，需要约${estimatedCost}积分，当前积分${user.credits}`
      });
    }
    
    try {
      // 检查API密钥是否存在
      if (!process.env.DASHSCOPE_API_KEY) {
        console.error('DASHSCOPE_API_KEY 环境变量未设置');
        return res.status(500).json({
          success: false,
          message: 'API密钥未配置，请联系管理员'
        });
      }
      
      console.log('调用阿里云文生视频API，使用的密钥前缀：', process.env.DASHSCOPE_API_KEY.substring(0, 6) + '...');
      
      // 准备请求体 - 按照阿里云API文档格式构建
      const requestBody = {
        model: model,
        input: {
          prompt: prompt
        },
        parameters: {
          size: size, // 使用前端传递的size参数，与阿里云API文档一致
          duration: 5,
          prompt_extend: true
        }
      };
      
      console.log('API请求体:', JSON.stringify(requestBody));
      
      // 调用阿里云文生视频API
      console.log('开始调用阿里云文生视频API...');
      const response = await axios.post(
        'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
        requestBody,
        {
          headers: {
            'X-DashScope-Async': 'enable',
            'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 设置30秒超时
        }
      );
      
      console.log('阿里云API响应:', JSON.stringify(response.data, null, 2));
      
      // 获取任务ID
      if (!response.data || !response.data.output || !response.data.output.task_id) {
        console.error('API响应中未找到task_id:', response.data);
        return res.status(500).json({
          success: false,
          message: 'API响应格式异常，未找到任务ID'
        });
      }
      
      const taskId = response.data.output.task_id;
      console.log('成功获取任务ID:', taskId);
      const task_status = response.data.output.task_status || 'PENDING';
      
      // 规范化任务状态 - 非成功或失败的状态都视为生成中(RUNNING)
      const normalizedStatus = 
        task_status === 'SUCCEEDED' ? 'SUCCEEDED' :
        task_status === 'FAILED' ? 'FAILED' : 'RUNNING';
      
      // 存储任务信息
      if (!userTasks[userId]) {
        userTasks[userId] = [];
      }
      
      userTasks[userId].unshift({
        id: taskId,
        prompt,
        model,
        size,
        status: normalizedStatus, // 使用规范化后的状态
        createdAt: new Date().toISOString(),
        cost: estimatedCost // 存储任务预计消耗积分，在任务成功后扣除
      });
      
      // 记录功能使用
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      
      let featureUsage = await FeatureUsage.findOne({
        where: {
          userId,
          featureName: 'text-to-video'
        }
      });
      
      if (!featureUsage) {
        featureUsage = await FeatureUsage.create({
          userId,
          featureName: 'text-to-video',
          usageCount: 1,
          lastUsedAt: today,
          resetDate: todayStr
        });
      } else {
        // 如果是新的一天，重置使用次数
        if (featureUsage.resetDate !== todayStr) {
          featureUsage.usageCount = 1;
          featureUsage.resetDate = todayStr;
        } else {
          featureUsage.usageCount += 1;
        }
        
        featureUsage.lastUsedAt = today;
        await featureUsage.save();
      }
      
      // 返回任务ID - 使用与阿里云一致的响应格式，完全匹配SDK返回格式
      const createResponse = {
        output: {
          task_id: taskId,
          task_status: normalizedStatus, // 使用规范化后的状态
          // 如果阿里云API返回了submit_time，则使用它
          submit_time: response.data.output.submit_time || new Date().toISOString().replace('T', ' ').split('.')[0],
          // 如果阿里云API返回了原始提示词，则使用它，否则使用用户输入的提示词
          orig_prompt: response.data.output.orig_prompt || prompt
        },
        request_id: response.data.request_id || null,
        // SDK响应格式包含状态码
        status_code: response.status,
        // 以下字段是为了保持与前端的兼容性
        success: true,
        taskId: taskId,
        message: '视频生成任务已创建，正在处理中'
      };
      
      console.log('返回创建任务响应:', JSON.stringify(createResponse, null, 2));
      return res.json(createResponse);
    } catch (error) {
      console.error('API调用失败:', error);
      
      // 准备错误响应
      const errorResponse = {
        success: false,
        status_code: error.response ? error.response.status : 500,
        code: 'ApiCallError',
        message: '创建视频生成任务失败',
        request_id: null
      };
      
      if (error.response && error.response.data) {
        console.error('API错误响应:', error.response.status, error.response.data);
        
        // 阿里云响应格式处理
        const errorData = error.response.data;
        
        if (errorData.code) {
          // 错误信息直接在响应根级别
          errorResponse.code = errorData.code;
          errorResponse.message = errorData.message || errorResponse.message;
          errorResponse.request_id = errorData.request_id || null;
          
          // 如果是参数错误，以阿里云格式返回
          if (errorData.code === 'InvalidParameter' || errorData.code.startsWith('Invalid')) {
            return res.status(error.response.status).json({
              code: errorData.code,
              message: errorData.message || '参数错误',
              request_id: errorData.request_id || null,
              // 兼容前端
              success: false
            });
          }
        } else if (errorData.output && errorData.output.code) {
          // 错误信息在output字段下
          return res.status(error.response.status).json({
            output: {
              code: errorData.output.code,
              message: errorData.output.message || '任务创建失败'
            },
            request_id: errorData.request_id || null,
            // 兼容前端
            success: false
          });
        }
        
        return res.status(error.response.status).json(errorResponse);
      } else if (error.request) {
        console.error('未收到API响应:', error.request);
        errorResponse.code = 'RequestTimeout';
        errorResponse.message = '创建视频生成任务失败: 服务器无响应';
        
        return res.status(500).json(errorResponse);
      } else {
        console.error('请求配置错误:', error.message);
        errorResponse.code = 'ConfigError';
        errorResponse.message = `创建视频生成任务失败: ${error.message}`;
        
        return res.status(500).json(errorResponse);
      }
    }
  } catch (error) {
    console.error('处理文生视频请求出错:', error);
    return res.status(500).json({
      success: false,
      code: 'InternalServerError',
      message: '服务器内部错误',
      request_id: null
    });
  }
});

/**
 * @route   GET /api/text-to-video/status/:taskId
 * @desc    获取文生视频任务状态
 * @access  私有
 */
router.get('/status/:taskId', protect, async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;
    const forceRefresh = req.query.force === 'true'; // 是否强制刷新状态
    
    console.log(`查询任务状态: taskId=${taskId}, userId=${userId}, forceRefresh=${forceRefresh}`);
    
    // 参数验证
    if (!taskId) {
      return res.status(400).json({
        success: false,
        code: 'InvalidParameter',
        message: '请提供任务ID',
        request_id: null
      });
    }
    
    // 检查是否是用户的任务
    if (!userTasks[userId] || !userTasks[userId].find(task => task.id === taskId)) {
      console.log(`任务不存在或不属于当前用户: taskId=${taskId}, userId=${userId}`);
      return res.status(404).json({
        success: false,
        code: 'TaskNotFound',
        message: '任务不存在或不属于当前用户',
        request_id: null
      });
    }
    
    // 检查状态缓存
    const now = Date.now();
    const cachedStatus = taskStatusCache[taskId];
    const userTaskIndex = userTasks[userId].findIndex(task => task.id === taskId);
    const currentStatus = userTaskIndex !== -1 ? userTasks[userId][userTaskIndex].status : null;
    
    // 获取当前状态的最小查询间隔
    const minInterval = currentStatus && STATUS_QUERY_MIN_INTERVAL[currentStatus] 
      ? STATUS_QUERY_MIN_INTERVAL[currentStatus] 
      : STATUS_QUERY_MIN_INTERVAL.default;
    
    // 如果有缓存且未超过最小间隔，且非强制刷新状态，则返回缓存的状态
    if (cachedStatus && 
        now - cachedStatus.lastFetchTime < minInterval && 
        !forceRefresh &&
        // 如果状态是SUCCEEDED或FAILED，缓存可以长期有效
        (cachedStatus.status === 'SUCCEEDED' || cachedStatus.status === 'FAILED' || (now - cachedStatus.lastFetchTime < 30000))) {
      console.log(`返回缓存的任务状态: ${taskId} => ${cachedStatus.status}, 缓存时间: ${new Date(cachedStatus.lastFetchTime).toISOString()}`);
      
      // 返回缓存的响应
      return res.json(cachedStatus.data);
    }
    
    try {
      console.log(`发送API请求查询任务状态: taskId=${taskId}`);
      
      // 调用阿里云查询任务状态API（严格按照阿里云文档构建URL）
      const response = await axios.get(
        `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`
          },
          timeout: 15000 // 设置15秒超时
        }
      );
      
      console.log('任务状态API响应:', JSON.stringify(response.data, null, 2));
      
      // 验证响应格式（阿里云返回格式标准验证）
      if (!response.data) {
        console.error('API返回空响应');
        return res.status(500).json({
          success: false,
          code: 'EmptyResponse',
          message: 'API返回空响应',
          request_id: null
        });
      }
      
      // 存在错误码时的处理
      if (response.data.code) {
        console.error('API返回错误码:', response.data.code, response.data.message);
        return res.status(400).json({
          success: false,
          code: response.data.code,
          message: response.data.message || '查询任务状态失败',
          request_id: response.data.request_id || null
        });
      }
      
      // 检查是否包含必要字段
      if (!response.data.output) {
        console.error('API响应格式异常,缺少output字段:', response.data);
        return res.status(500).json({
          success: false,
          code: 'InvalidResponse',
          message: 'API响应格式异常,缺少output字段',
          request_id: response.data.request_id || null
        });
      }
      
      if (!response.data.output.task_status) {
        console.error('API响应中未找到task_status:', response.data);
        return res.status(500).json({
          success: false,
          code: 'InvalidResponse',
          message: 'API响应格式异常，未找到任务状态',
          request_id: response.data.request_id || null
        });
      }
      
      const taskStatus = response.data.output.task_status;
      console.log(`任务状态: taskId=${taskId}, status=${taskStatus}, request_id=${response.data.request_id || '无'}`);
      
      // 规范化任务状态 - 只有SUCCEEDED和FAILED是终态，其他都视为RUNNING
      const normalizedStatus = 
        taskStatus === 'SUCCEEDED' ? 'SUCCEEDED' :
        taskStatus === 'FAILED' ? 'FAILED' : 'RUNNING';
        
      console.log(`规范化后的任务状态: ${normalizedStatus} (原始状态: ${taskStatus})`);
      
      // 更新本地任务状态
      const userTaskIndex = userTasks[userId].findIndex(task => task.id === taskId);
      if (userTaskIndex !== -1) {
        // 保存旧状态，用于判断是否是首次成功
        const previousStatus = userTasks[userId][userTaskIndex].status;
        const isFirstSuccess = normalizedStatus === 'SUCCEEDED' && previousStatus !== 'SUCCEEDED';
        
        console.log(`任务状态变化: ${previousStatus} -> ${normalizedStatus}, 是否首次成功: ${isFirstSuccess}`);
        
        // 更新任务状态
        userTasks[userId][userTaskIndex].status = normalizedStatus;
        
        // 如果任务完成，记录视频URL
        if (normalizedStatus === 'SUCCEEDED') {
          // 检查视频URL
          let videoUrl = null;
          
          // 阿里云可能会在不同位置返回视频URL
          if (response.data.output.video_url) {
            videoUrl = response.data.output.video_url;
          } else if (response.data.output.result && response.data.output.result.video_url) {
            videoUrl = response.data.output.result.video_url;
          } else if (response.data.output.result && response.data.output.result.urls && response.data.output.result.urls.length > 0) {
            videoUrl = response.data.output.result.urls[0];
          }
          
          if (!videoUrl) {
            console.error('任务成功但未找到视频URL:', response.data);
            return res.status(500).json({
              success: false,
              code: 'MissingVideoUrl',
              message: '任务成功但未找到视频URL',
              request_id: response.data.request_id || null
            });
          }
          
          // 如果是首次成功（状态从非SUCCEEDED变为SUCCEEDED），扣除积分
          if (isFirstSuccess) {
            // 获取任务消耗的积分
            const taskCost = userTasks[userId][userTaskIndex].cost || 0;
            console.log(`准备扣除积分: 任务ID=${taskId}, 积分=${taskCost}, 用户ID=${userId}`);
            
            if (taskCost > 0) {
              try {
                // 查询用户最新积分
                const user = await User.findByPk(userId);
                if (user) {
                  const oldCredits = user.credits;
                  // 扣除积分
                  user.credits -= taskCost;
                  await user.save();
                  console.log(`任务完成，扣除用户积分: ${oldCredits} -> ${user.credits}, 扣除了${taskCost}积分`);
                  
                  // 将更新后的积分添加到响应中
                  responseData.output.credits = user.credits;
                } else {
                  console.error(`未找到用户(ID=${userId})，无法扣除积分`);
                }
              } catch (creditError) {
                console.error('扣除积分失败:', creditError);
                // 继续处理，不影响视频展示功能
              }
            }
          }
          
          userTasks[userId][userTaskIndex].videoUrl = videoUrl;
          console.log(`任务完成，视频URL已保存: ${videoUrl}`);
          
          // 记录到图片历史
          try {
            await ImageHistory.create({
              userId,
              processedImageUrl: videoUrl,
              processType: '文生视频',
              description: userTasks[userId][userTaskIndex].prompt,
              metadata: JSON.stringify({
                model: userTasks[userId][userTaskIndex].model,
                size: userTasks[userId][userTaskIndex].size
              })
            });
            console.log('视频记录已保存到历史记录');
          } catch (historyError) {
            console.error('保存历史记录失败:', historyError);
            // 继续处理，不影响主要功能
          }
        }
      }
      
      // 获取视频URL (如果有)
      let videoUrl = null;
      if (normalizedStatus === 'SUCCEEDED') {
        // 阿里云返回成功结果可能的几种格式：
        // 1. output.video_url
        // 2. output.result.video_url 
        // 3. output.result.urls[0]
        if (response.data.output.video_url) {
          videoUrl = response.data.output.video_url;
        } else if (response.data.output.result && response.data.output.result.video_url) {
          videoUrl = response.data.output.result.video_url;
        } else if (response.data.output.result && response.data.output.result.urls && response.data.output.result.urls.length > 0) {
          videoUrl = response.data.output.result.urls[0];
        }
      }
      
      // 构建符合阿里云SDK响应格式的响应
      const responseData = {
        status_code: 200, // 成功状态码
        success: true,
        output: {
          task_status: normalizedStatus, // 使用规范化后的状态
          task_id: taskId
        },
        request_id: response.data.request_id || null
      };
      
      // 模拟SDK的wait函数行为 - 只在视频生成成功或失败时返回完整结果
      if (normalizedStatus === 'SUCCEEDED' || normalizedStatus === 'FAILED') {
        if (videoUrl) {
          // 成功状态下的处理
          responseData.output.video_url = videoUrl;
          
          // 如果有时间信息，添加到响应中
          if (response.data.output.submit_time) {
            responseData.output.submit_time = response.data.output.submit_time;
          }
          
          if (response.data.output.scheduled_time) {
            responseData.output.scheduled_time = response.data.output.scheduled_time;
          }
          
          if (response.data.output.end_time) {
            responseData.output.end_time = response.data.output.end_time;
          }
          
          // 如果有提示词信息，添加到响应中
          if (response.data.output.orig_prompt) {
            responseData.output.orig_prompt = response.data.output.orig_prompt;
          } else if (userTaskIndex !== -1) {
            responseData.output.orig_prompt = userTasks[userId][userTaskIndex].prompt || '';
          }
          
          if (response.data.output.actual_prompt) {
            responseData.output.actual_prompt = response.data.output.actual_prompt;
          }
          
          // 兼容老版本前端
          responseData.status = normalizedStatus;
          responseData.videoUrl = videoUrl;
          responseData.task_id = taskId;
          responseData.task_status = normalizedStatus;
          responseData.video_url = videoUrl;
        } else if (normalizedStatus === 'FAILED') {
          // 失败状态下的处理
          if (response.data.output.code) {
            responseData.output.code = response.data.output.code;
            responseData.output.message = response.data.output.message || '任务执行失败';
            // SDK格式错误响应处理
            responseData.code = response.data.output.code;
            responseData.message = response.data.output.message || '任务执行失败';
          }
        }
      } else {
        // 其他状态（PENDING/RUNNING）时只返回最基本的信息
        console.log(`任务仍在处理中: ${normalizedStatus}`);
      }
      
      // 如果有用量信息，添加到响应中
      if (response.data.usage) {
        responseData.usage = response.data.usage;
        
        // 确保usage包含所有必要字段
        if (!responseData.usage.video_duration && normalizedStatus === 'SUCCEEDED') {
          responseData.usage.video_duration = 5; // 默认5秒
        }
        
        if (!responseData.usage.video_ratio && userTaskIndex !== -1) {
          responseData.usage.video_ratio = userTasks[userId][userTaskIndex].size || '1280*720'; 
        }
        
        if (!responseData.usage.video_count && normalizedStatus === 'SUCCEEDED') {
          responseData.usage.video_count = 1; // 默认生成1个视频
        }
      } else if (normalizedStatus === 'SUCCEEDED') {
        // 如果阿里云未返回用量信息但任务成功，添加默认用量信息
        responseData.usage = {
          video_duration: 5, // 默认5秒
          video_ratio: userTaskIndex !== -1 ? userTasks[userId][userTaskIndex].size || '1280*720' : '1280*720',
          video_count: 1
        };
      }
      
      // 更新任务状态缓存
      taskStatusCache[taskId] = {
        status: normalizedStatus, // 使用规范化后的状态
        lastFetchTime: now,
        data: responseData
      };
      
      // 如果任务已完成或失败，可以保留较长时间的缓存
      if (normalizedStatus === 'SUCCEEDED' || normalizedStatus === 'FAILED') {
        console.log(`任务已完成或失败，设置长期缓存: ${taskId} => ${normalizedStatus}`);
        // 这些状态是终态，可以缓存更长时间
        // taskStatusCache会保留在内存中，直到服务器重启
      }
      
      console.log('返回任务状态响应:', JSON.stringify(responseData, null, 2));
      return res.json(responseData);
    } catch (error) {
      // 如果有缓存但请求失败，返回稍旧的缓存数据
      if (cachedStatus && (now - cachedStatus.lastFetchTime < 60000)) { // 一分钟内的缓存仍可用
        console.log(`API请求失败，但返回缓存数据: ${taskId} => ${cachedStatus.status}`);
        return res.json(cachedStatus.data);
      }
      
      console.error('获取任务状态失败:', error);
      
      // 准备错误响应 - 与SDK错误响应格式一致
      const errorResponse = {
        success: false,
        status_code: error.response ? error.response.status : 500,
        code: 'UnknownError',
        message: '获取任务状态失败',
        request_id: null
      };
      
      if (error.response && error.response.data) {
        // 阿里云API返回的错误
        console.error('API错误响应:', error.response.status, error.response.data);
        
        // 阿里云响应格式处理 - 可能在response.data下或response.data.output下
        const errorData = error.response.data;
        
        if (errorData.code) {
          // 错误信息直接在响应根级别 - 与SDK错误格式一致
          return res.status(error.response.status).json({
            status_code: error.response.status,
            code: errorData.code,
            message: errorData.message || '获取任务状态失败',
            request_id: errorData.request_id || null,
            success: false // 兼容前端
          });
        } else if (errorData.output && errorData.output.code) {
          // 错误信息在output字段下 - 构建与SDK错误格式一致的响应
          return res.status(error.response.status).json({
            status_code: error.response.status,
            code: errorData.output.code,
            message: errorData.output.message || '任务执行失败',
            output: {
              task_id: taskId,
              task_status: 'FAILED',
              code: errorData.output.code,
              message: errorData.output.message || '任务执行失败'
            },
            request_id: errorData.request_id || null,
            success: false // 兼容前端
          });
        }
        
        return res.status(error.response.status).json(errorResponse);
      } else if (error.request) {
        // 请求已发送但未收到响应
        console.error('未收到API响应:', error.request);
        errorResponse.code = 'RequestTimeout';
        errorResponse.message = '获取任务状态失败: 服务器无响应';
        
        return res.status(500).json(errorResponse);
      } else {
        // 请求配置错误
        console.error('请求配置错误:', error.message);
        errorResponse.code = 'ConfigError';
        errorResponse.message = `获取任务状态失败: ${error.message}`;
        
        return res.status(500).json(errorResponse);
      }
    }
  } catch (error) {
    console.error('处理获取任务状态请求出错:', error);
    return res.status(500).json({
      success: false,
      code: 'InternalServerError',
      message: '服务器内部错误',
      request_id: null
    });
  }
});

/**
 * @route   GET /api/text-to-video/tasks
 * @desc    获取用户所有文生视频任务
 * @access  私有
 */
router.get('/tasks', protect, (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`获取用户任务列表: userId=${userId}`);
    
    // 返回用户的所有任务
    const tasks = userTasks[userId] || [];
    
    console.log(`找到 ${tasks.length} 个任务`);
    
    return res.json(tasks);
  } catch (error) {
    console.error('获取用户任务列表出错:', error);
    return res.status(500).json({
      success: false,
      code: 'InternalServerError',
      message: '服务器内部错误',
      request_id: null
    });
  }
});

/**
 * @route   POST /api/text-to-video/image-to-video
 * @desc    创建图生视频任务
 * @access  Private
 */
router.post('/image-to-video', protect, async (req, res) => {
    try {
        const { model, input, parameters } = req.body;
        
        if (!model || !input || !input.prompt || !input.img_url) {
            return res.status(400).json({ 
                success: false, 
                message: '缺少必要参数' 
            });
        }
        
        // 验证模型名称
        if (!model.includes('wanx2.1-i2v')) {
            return res.status(400).json({
                success: false,
                message: '不支持的模型名称，图生视频应使用wanx2.1-i2v-turbo或wanx2.1-i2v-plus模型'
            });
        }
        
        // 准备调用阿里云图生视频API的请求
        const dashscopeRequest = {
            model: model,
            input: {
                prompt: input.prompt,
                img_url: input.img_url
            },
            parameters: parameters || {}
        };
        
        // 参数处理：如果有size参数，替换为resolution参数
        if (dashscopeRequest.parameters.size) {
            dashscopeRequest.parameters.resolution = dashscopeRequest.parameters.size;
            delete dashscopeRequest.parameters.size;
        }
        
        // 确保resolution参数为有效值：480P或720P
        if (dashscopeRequest.parameters.resolution) {
            const resolution = dashscopeRequest.parameters.resolution.toString().toUpperCase();
            if (!['480P', '720P'].includes(resolution)) {
                // 尝试转换如"1280*720"格式为标准档位
                if (resolution.includes('1280') || resolution.includes('720')) {
                    dashscopeRequest.parameters.resolution = '720P';
                } else if (resolution.includes('640') || resolution.includes('480')) {
                    dashscopeRequest.parameters.resolution = '480P';
                } else {
                    // 默认使用720P
                    dashscopeRequest.parameters.resolution = '720P';
                }
            } else {
                dashscopeRequest.parameters.resolution = resolution;
            }
        } else {
            // 默认设置为720P
            dashscopeRequest.parameters.resolution = '720P';
        }
        
        // 确保duration参数有效：对于wanx2.1-i2v-turbo可以是3、4或5，对于wanx2.1-i2v-plus只能是5
        if (dashscopeRequest.parameters.duration) {
            const duration = parseInt(dashscopeRequest.parameters.duration);
            if (model === 'wanx2.1-i2v-plus' && duration !== 5) {
                dashscopeRequest.parameters.duration = 5;
            } else if (model === 'wanx2.1-i2v-turbo' && ![3, 4, 5].includes(duration)) {
                dashscopeRequest.parameters.duration = 5;
            }
        } else {
            // 默认设置为5秒
            dashscopeRequest.parameters.duration = 5;
        }
        
        // 调用阿里云图生视频API
        console.log('调用阿里云图生视频API，使用的密钥前缀：', process.env.DASHSCOPE_API_KEY.substring(0, 6) + '...');
        console.log('请求参数:', JSON.stringify(dashscopeRequest, null, 2));
        
        // 验证img_url格式
        const imgUrl = dashscopeRequest.input.img_url;
        if (!imgUrl || !imgUrl.startsWith('http')) {
            console.error('图片URL格式不正确:', imgUrl);
            return res.status(400).json({
                status_code: 400,
                code: 'InvalidParameter',
                message: '图片URL格式不正确，必须是以http开头的完整URL',
                request_id: Date.now().toString()
            });
        }
        
        // 调用阿里云图生视频API，确保按照官方文档要求设置所有必要的请求头
        console.log('开始调用阿里云图生视频API...');
        console.log('完整请求地址:', 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis');
        console.log('请求头:', JSON.stringify({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY.substring(0, 6)}...`,
            'X-DashScope-Async': 'enable'
        }, null, 2));
        console.log('请求体:', JSON.stringify(dashscopeRequest, null, 2));
        
        try {
            const response = await axios.post(
                'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
                dashscopeRequest,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
                        'X-DashScope-Async': 'enable'
                    },
                    timeout: 30000 // 设置30秒超时
                }
            );
            
            const dashscopeResponse = response.data;
            console.log('阿里云API响应状态码:', response.status);
            console.log('阿里云API响应头:', JSON.stringify(response.headers, null, 2));
            console.log('阿里云API响应体:', JSON.stringify(dashscopeResponse, null, 2));
            
            // 检查响应格式
            if (!dashscopeResponse || !dashscopeResponse.output || !dashscopeResponse.output.task_id) {
                console.error('API响应中未找到task_id:', dashscopeResponse);
                return res.status(500).json({
                    status_code: 500,
                    code: 'InvalidResponse',
                    message: 'API响应格式异常，未找到任务ID',
                    request_id: null,
                    output: null,
                    usage: null
                });
            }
            
            const taskId = dashscopeResponse.output.task_id;
            console.log('成功获取任务ID:', taskId);
            
            // 创建任务记录（如果需要）
            // 可以根据需要在数据库中保存任务信息
            
            // 标准化响应格式
            if (!dashscopeResponse.status_code) {
                dashscopeResponse.status_code = 200;
            }
            if (dashscopeResponse.code === undefined) {
                dashscopeResponse.code = null;
            }
            if (!dashscopeResponse.message) {
                dashscopeResponse.message = "";
            }
            
            // 确保usage字段结构正确
            if (dashscopeResponse.output && dashscopeResponse.output.task_status === 'SUCCEEDED') {
                if (!dashscopeResponse.usage) {
                    dashscopeResponse.usage = {
                        video_count: 1,
                        video_duration: 5,
                        video_ratio: "standard"
                    };
                } else {
                    // 确保usage中有所有必要字段
                    if (!dashscopeResponse.usage.video_count) {
                        dashscopeResponse.usage.video_count = 1;
                    }
                    if (!dashscopeResponse.usage.video_duration) {
                        dashscopeResponse.usage.video_duration = 5;
                    }
                    if (!dashscopeResponse.usage.video_ratio) {
                        dashscopeResponse.usage.video_ratio = "standard";
                    }
                }
            } else if (!dashscopeResponse.usage) {
                dashscopeResponse.usage = null;
            }
            
            // 确保output字段下有所有必要的时间信息
            if (dashscopeResponse.output) {
                if (!dashscopeResponse.output.submit_time) {
                    dashscopeResponse.output.submit_time = new Date().toISOString().replace('T', ' ').substring(0, 23);
                }
                if (dashscopeResponse.output.task_status === 'SUCCEEDED' && !dashscopeResponse.output.scheduled_time) {
                    dashscopeResponse.output.scheduled_time = dashscopeResponse.output.submit_time;
                }
                if (dashscopeResponse.output.task_status === 'SUCCEEDED' && !dashscopeResponse.output.end_time) {
                    // 生成一个比submit_time晚几分钟的时间
                    const endTime = new Date(dashscopeResponse.output.submit_time.replace(' ', 'T'));
                    endTime.setMinutes(endTime.getMinutes() + 5);
                    dashscopeResponse.output.end_time = endTime.toISOString().replace('T', ' ').substring(0, 23);
                }
                
                // 确保video_url字段存在
                if (!dashscopeResponse.output.video_url) {
                    dashscopeResponse.output.video_url = "";
                }
            }
            
            // 返回响应 - 直接返回阿里云API原始响应，但确保格式一致
            return res.json(dashscopeResponse);
        } catch (error) {
            console.error('处理图生视频请求出错:', error);
            
            // 处理阿里云API错误
            if (error.response && error.response.data) {
                console.error('阿里云API返回错误:', error.response.data);
                // 标准化阿里云API错误格式
                const errorResponse = error.response.data;
                if (!errorResponse.status_code) {
                    errorResponse.status_code = error.response.status || 500;
                }
                if (errorResponse.code === undefined) {
                    errorResponse.code = null;
                }
                if (!errorResponse.usage) {
                    errorResponse.usage = null;
                }
                return res.status(error.response.status || 500).json(errorResponse);
            }
            
            // SDK风格的错误响应格式
            return res.status(500).json({
                status_code: 500,
                code: 'InternalServerError',
                message: '服务器处理异常: ' + error.message,
                request_id: null
            });
        }
    } catch (error) {
        console.error('处理图生视频请求出错:', error);
        return res.status(500).json({
            success: false,
            code: 'InternalServerError',
            message: '服务器处理异常: ' + error.message,
            request_id: null
        });
    }
});

/**
 * @route   GET /api/text-to-video/task-status/:taskId
 * @desc    获取图生视频任务状态
 * @access  Private
 */
router.get('/task-status/:taskId', protect, async (req, res) => {
    try {
        const { taskId } = req.params;
        
        if (!taskId) {
            return res.status(400).json({ 
                status_code: 400,
                code: 'InvalidParameter',
                message: '缺少任务ID',
                request_id: null,
                output: null,
                usage: null
            });
        }
        
        // 调用阿里云API获取任务状态
        const response = await axios.get(
            `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`
                },
                timeout: 15000 // 设置15秒超时
            }
        );
        
        const dashscopeResponse = response.data;
        console.log('任务状态查询响应:', JSON.stringify(dashscopeResponse, null, 2));
        
        // 标准化响应格式
        if (!dashscopeResponse.status_code) {
            dashscopeResponse.status_code = 200;
        }
        if (dashscopeResponse.code === undefined) {
            dashscopeResponse.code = null;
        }
        if (!dashscopeResponse.message) {
            dashscopeResponse.message = "";
        }
        
        // 确保usage字段结构正确
        if (dashscopeResponse.output && dashscopeResponse.output.task_status === 'SUCCEEDED') {
            if (!dashscopeResponse.usage) {
                dashscopeResponse.usage = {
                    video_count: 1,
                    video_duration: 5,
                    video_ratio: "standard"
                };
            } else {
                // 确保usage中有所有必要字段
                if (!dashscopeResponse.usage.video_count) {
                    dashscopeResponse.usage.video_count = 1;
                }
                if (!dashscopeResponse.usage.video_duration) {
                    dashscopeResponse.usage.video_duration = 5;
                }
                if (!dashscopeResponse.usage.video_ratio) {
                    dashscopeResponse.usage.video_ratio = "standard";
                }
            }
        } else if (!dashscopeResponse.usage) {
            dashscopeResponse.usage = null;
        }
        
        // 确保output字段下有所有必要的时间信息
        if (dashscopeResponse.output) {
            if (!dashscopeResponse.output.submit_time) {
                dashscopeResponse.output.submit_time = new Date().toISOString().replace('T', ' ').substring(0, 23);
            }
            if (dashscopeResponse.output.task_status === 'SUCCEEDED' && !dashscopeResponse.output.scheduled_time) {
                dashscopeResponse.output.scheduled_time = dashscopeResponse.output.submit_time;
            }
            if (dashscopeResponse.output.task_status === 'SUCCEEDED' && !dashscopeResponse.output.end_time) {
                // 生成一个比submit_time晚几分钟的时间
                const endTime = new Date(dashscopeResponse.output.submit_time.replace(' ', 'T'));
                endTime.setMinutes(endTime.getMinutes() + 5);
                dashscopeResponse.output.end_time = endTime.toISOString().replace('T', ' ').substring(0, 23);
            }
            
            // 确保video_url字段存在
            if (!dashscopeResponse.output.video_url) {
                dashscopeResponse.output.video_url = "";
            }
        }
        
        // 返回响应 - 直接返回阿里云API原始响应，但确保格式一致
        return res.json(dashscopeResponse);
    } catch (error) {
        console.error('获取任务状态出错:', error);
        
        // 处理阿里云API错误
        if (error.response && error.response.data) {
            console.error('阿里云API返回错误:', error.response.data);
            // 标准化阿里云API错误格式
            const errorResponse = error.response.data;
            if (!errorResponse.status_code) {
                errorResponse.status_code = error.response.status || 500;
            }
            if (errorResponse.code === undefined) {
                errorResponse.code = null;
            }
            if (!errorResponse.usage) {
                errorResponse.usage = null;
            }
            return res.status(error.response.status || 500).json(errorResponse);
        }
        
        // SDK风格的错误响应格式
        return res.status(500).json({
            status_code: 500,
            code: 'InternalServerError',
            message: '服务器处理异常: ' + error.message,
            request_id: null
        });
    }
});

/**
 * @route   POST /api/upload-image
 * @desc    上传图片获取URL
 * @access  Private
 */
router.post('/upload-image', protect, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                code: 'InvalidParameter',
                message: '未提供图片文件',
                request_id: null
            });
        }
        
        // 获取上传的文件路径
        const filePath = req.file.path;
        let imageUrl;
        
        try {
            // 确保文件存在
            if (!fs.existsSync(filePath)) {
                throw new Error(`上传的文件不存在: ${filePath}`);
            }
            
            // 使用OSS服务上传图片到阿里云
            console.log('开始将图片上传到阿里云OSS...');
            imageUrl = await uploadFile(filePath, 'images/');
            console.log('图片已成功上传到阿里云OSS:', imageUrl);
            
            if (!imageUrl || !imageUrl.startsWith('http')) {
                throw new Error('OSS未返回有效的URL');
            }
        } catch (ossError) {
            console.error('上传到阿里云OSS失败:', ossError);
            // 返回错误，不使用本地URL
            return res.status(500).json({
                code: 'OssUploadFailed',
                message: '上传图片到OSS失败: ' + ossError.message,
                request_id: null
            });
        }
        
        // 返回统一的响应格式
        return res.json({
            output: {
                img_url: imageUrl
            },
            imageUrl: imageUrl, // 兼容旧代码
            request_id: Date.now().toString() // 生成一个唯一ID作为请求ID
        });
    } catch (error) {
        console.error('图片上传处理错误:', error);
        return res.status(500).json({
            code: 'InternalServerError',
            message: '图片上传处理失败: ' + error.message,
            request_id: null
        });
    }
});

/**
 * @route   POST /api/save-video-result
 * @desc    保存视频生成结果
 * @access  Private
 */
router.post('/save-video-result', protect, async (req, res) => {
    try {
        const { taskId, videoUrl, prompt, type } = req.body;
        
        if (!taskId || !videoUrl) {
            return res.status(400).json({
                code: 'InvalidParameter',
                message: '缺少必要参数',
                request_id: null
            });
        }
        
        // 保存视频结果到数据库
        // 这里使用与文生视频相同的数据模型，但添加了type字段区分
        const result = new VideoResult({
            user: req.user.id,
            taskId: taskId,
            videoUrl: videoUrl,
            prompt: prompt,
            type: type || 'image-to-video',
            createdAt: new Date()
        });
        
        await result.save();
        
        // 返回响应 - 使用与API一致的响应格式
        return res.json({
            output: {
                task_id: taskId,
                task_status: 'SUCCEEDED',
                video_url: videoUrl
            },
            request_id: Date.now().toString() // 生成一个唯一ID作为请求ID
        });
    } catch (error) {
        console.error('保存视频结果错误:', error);
        return res.status(500).json({
            code: 'InternalServerError',
            message: '保存视频结果失败: ' + error.message,
            request_id: null
        });
    }
});

/**
 * @route   POST /api/text-to-video/image-to-video-sync
 * @desc    创建图生视频任务（同步API，与SDK行为一致）
 * @access  Private
 */
router.post('/image-to-video-sync', protect, async (req, res) => {
    try {
        const { model, prompt, img_url, parameters } = req.body;
        
        // 参数验证
        if (!model || !prompt || !img_url) {
            return res.status(400).json({ 
                status_code: 400,
                code: 'InvalidParameter',
                message: '缺少必要参数：model, prompt, img_url',
                request_id: null
            });
        }
        
        // 验证模型名称
        if (!model.includes('wanx2.1-i2v')) {
            return res.status(400).json({
                status_code: 400,
                code: 'InvalidParameter',
                message: '不支持的模型名称，图生视频应使用wanx2.1-i2v-turbo或wanx2.1-i2v-plus模型',
                request_id: null
            });
        }
        
        // 准备调用阿里云图生视频API的请求 - 与SDK格式一致
        const dashscopeRequest = {
            model: model,
            input: {
                prompt: prompt,
                img_url: img_url
            },
            parameters: parameters || {}
        };
        
        // 参数处理：确保分辨率正确
        if (dashscopeRequest.parameters.resolution) {
            const resolution = dashscopeRequest.parameters.resolution.toString().toUpperCase();
            if (!['480P', '720P'].includes(resolution)) {
                if (resolution.includes('1280') || resolution.includes('720')) {
                    dashscopeRequest.parameters.resolution = '720P';
                } else if (resolution.includes('640') || resolution.includes('480')) {
                    dashscopeRequest.parameters.resolution = '480P';
                } else {
                    dashscopeRequest.parameters.resolution = '720P';
                }
            } else {
                dashscopeRequest.parameters.resolution = resolution;
            }
        } else {
            dashscopeRequest.parameters.resolution = '720P';
        }
        
        // 确保duration参数有效
        if (dashscopeRequest.parameters.duration) {
            const duration = parseInt(dashscopeRequest.parameters.duration);
            if (model === 'wanx2.1-i2v-plus' && duration !== 5) {
                dashscopeRequest.parameters.duration = 5;
            } else if (model === 'wanx2.1-i2v-turbo' && ![3, 4, 5].includes(duration)) {
                dashscopeRequest.parameters.duration = 5;
            }
        } else {
            dashscopeRequest.parameters.duration = 5;
        }
        
        console.log('调用阿里云图生视频同步API，请求参数:', JSON.stringify(dashscopeRequest, null, 2));
        
        // 同步调用阿里云图生视频API (不使用X-DashScope-Async头)
        const response = await axios.post(
            'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
            dashscopeRequest,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`
                },
                timeout: 60000 // 同步API需要更长的超时时间，设为60秒
            }
        );
        
        // 返回阿里云原始响应 - 同步API直接返回结果，包含video_url
        return res.json(response.data);
    } catch (error) {
        console.error('同步调用图生视频API出错:', error);
        
        // 错误处理
        if (error.response && error.response.data) {
            // 直接返回阿里云API原始错误格式
            return res.status(error.response.status || 500).json(error.response.data);
        }
        
        // SDK风格的错误响应格式
        return res.status(500).json({
            status_code: 500,
            code: 'InternalServerError',
            message: '服务器处理异常: ' + error.message,
            request_id: null
        });
    }
});

// 创建一个单独的上传图片路由处理函数
const uploadImageRoute = express.Router();

uploadImageRoute.post('/', protect, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                code: 'InvalidParameter',
                message: '未提供图片文件',
                request_id: null
            });
        }
        
        // 获取上传的文件路径
        const filePath = req.file.path;
        let imageUrl;
        
        try {
            // 确保文件存在
            if (!fs.existsSync(filePath)) {
                throw new Error(`上传的文件不存在: ${filePath}`);
            }
            
            // 使用OSS服务上传图片到阿里云
            console.log('开始将图片上传到阿里云OSS...');
            imageUrl = await uploadFile(filePath, 'images/');
            console.log('图片已成功上传到阿里云OSS:', imageUrl);
            
            if (!imageUrl || !imageUrl.startsWith('http')) {
                throw new Error('OSS未返回有效的URL');
            }
        } catch (ossError) {
            console.error('上传到阿里云OSS失败:', ossError);
            // 返回错误，不使用本地URL
            return res.status(500).json({
                code: 'OssUploadFailed',
                message: '上传图片到OSS失败: ' + ossError.message,
                request_id: null
            });
        }
        
        // 返回统一的响应格式
        return res.json({
            output: {
                img_url: imageUrl
            },
            imageUrl: imageUrl, // 兼容旧代码
            request_id: Date.now().toString() // 生成一个唯一ID作为请求ID
        });
    } catch (error) {
        console.error('图片上传处理错误:', error);
        return res.status(500).json({
            code: 'InternalServerError',
            message: '图片上传处理失败: ' + error.message,
            request_id: null
        });
    }
});

module.exports = router;
module.exports.uploadImageRoute = uploadImageRoute; 