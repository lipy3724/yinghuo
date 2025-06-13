const express = require('express');
const axios = require('axios');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { FEATURES } = require('../middleware/featureAccess');
const { createUnifiedFeatureMiddleware } = require('../middleware/unifiedFeatureUsage');
const User = require('../models/User');
const { FeatureUsage } = require('../models/FeatureUsage');

// 配置API密钥和基础URL
const API_KEY = process.env.DASHSCOPE_API_KEY;
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
      // 使用统一的功能中间件（正确扣除积分）
      return createUnifiedFeatureMiddleware('IMAGE_COLORIZATION')(req, res, async () => {
        try {
          const response = await createTask(requestData);
          
          // 获取当前用户ID和积分消费信息（积分已在中间件中扣除）
          const userId = req.user.id;
          const creditCost = req.featureUsage?.creditCost || 0;
          const isFree = req.featureUsage?.isFree || false;
          
          // 生成唯一任务ID
          const taskId = response.data.output?.task_id || `colorization-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
          
          // 保存任务信息到全局变量
          if (!global.imageColorizationTasks) {
            global.imageColorizationTasks = {};
          }
          
          global.imageColorizationTasks[taskId] = {
            userId: userId,
            creditCost: creditCost, // 积分已在中间件中扣除
            hasChargedCredits: true, // 积分已在中间件中扣除
            timestamp: new Date(),
            imageUrl: requestData.input?.base_image_url,
            prompt: requestData.input?.prompt,
            isFree: isFree // 添加免费使用标记
          };
          
          console.log(`图像上色任务信息已保存: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}, 是否免费=${isFree}`);
          
          // 将任务信息保存到数据库
          try {
            const usage = await FeatureUsage.findOne({
              where: { 
                userId: userId, 
                featureName: 'IMAGE_COLORIZATION' 
              }
            });
            
            if (usage) {
              // 解析现有详情
              const details = JSON.parse(usage.details || '{}');
              // 准备任务列表
              const tasks = details.tasks || [];
              // 添加新任务
              tasks.push({
                taskId: taskId,
                creditCost: creditCost, // 积分已在中间件中扣除
                timestamp: new Date(),
                isFree: isFree // 添加免费使用标记
              });
              
              // 更新usage记录 - 更新details字段但不重复累加积分
              // 积分已在统一中间件中扣除，这里不需要再次累加
              usage.details = JSON.stringify({
                ...details,
                tasks: tasks
              });
              
              // 保存更新
              await usage.save();
              console.log(`图像上色任务信息已保存到数据库: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}`);
            } else {
              // 创建新记录
              await FeatureUsage.create({
                userId: userId,
                featureName: 'IMAGE_COLORIZATION',
                usageCount: 1,
                credits: 0, // 设置为0，积分已在统一中间件中扣除
                lastUsedAt: new Date(),
                details: JSON.stringify({
                  tasks: [{
                    taskId: taskId,
                    creditCost: creditCost, // 积分已在中间件中扣除
                    timestamp: new Date(),
                    isFree: isFree // 添加免费使用标记
                  }]
                })
              });
              console.log(`图像上色功能首次使用记录创建成功: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}`);
            }
          } catch (saveError) {
            console.error('保存图像上色任务详情失败:', saveError);
            // 继续响应，不中断流程
          }
          
          return res.status(response.status || 200).json(response.data);
        } catch (error) {
          handleApiError(error, res);
        }
      });
    } 
    // 如果是局部重绘功能，需要验证LOCAL_REDRAW权限
    else if (functionType === 'inpainting' || functionType === 'description_edit_with_mask') {
      // 使用统一的功能中间件（正确扣除积分）
      return createUnifiedFeatureMiddleware('LOCAL_REDRAW')(req, res, async () => {
        try {
          const response = await createTask(requestData);
          
          // 获取当前用户ID和积分消费信息
          const userId = req.user.id;
          const creditCost = req.featureUsage?.creditCost || 0;
          
          // 判断是否是免费使用
          const isFree = req.featureUsage?.isFree || false;
          
          // 生成唯一任务ID
          const taskId = response.data.output?.task_id || `redraw-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
          
          // 保存任务信息到全局变量
          if (!global.localRedrawTasks) {
            global.localRedrawTasks = {};
          }
          
          global.localRedrawTasks[taskId] = {
            userId: userId,
            creditCost: creditCost, // 积分已在中间件中扣除
            hasChargedCredits: true, // 积分已在中间件中扣除
            timestamp: new Date(),
            imageUrl: requestData.input?.base_image_url,
            prompt: requestData.input?.prompt,
            isFree: isFree // 添加免费使用标记
          };
          
          console.log(`局部重绘任务信息已保存: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}, 是否免费=${isFree}`);
          
          // 将任务信息保存到数据库
          try {
            const usage = await FeatureUsage.findOne({
              where: { 
                userId: userId, 
                featureName: 'LOCAL_REDRAW' 
              }
            });
            
            if (usage) {
              // 解析现有详情
              const details = JSON.parse(usage.details || '{}');
              // 准备任务列表
              const tasks = details.tasks || [];
              // 添加新任务
              tasks.push({
                taskId: taskId,
                creditCost: creditCost, // 积分已在中间件中扣除
                timestamp: new Date(),
                isFree: isFree // 添加免费使用标记
              });
              
              // 更新usage记录 - 更新details字段但不重复累加积分
              // 积分已在统一中间件中扣除，这里不需要再次累加
              usage.details = JSON.stringify({
                ...details,
                tasks: tasks
              });
              
              // 保存更新
              await usage.save();
              console.log(`局部重绘任务信息已保存到数据库: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}`);
            } else {
              // 创建新记录
              await FeatureUsage.create({
                userId: userId,
                featureName: 'LOCAL_REDRAW',
                usageCount: 1,
                credits: 0, // 设置为0，积分已在统一中间件中扣除
                lastUsedAt: new Date(),
                details: JSON.stringify({
                  tasks: [{
                    taskId: taskId,
                    creditCost: creditCost, // 积分已在中间件中扣除
                    timestamp: new Date(),
                    isFree: isFree // 添加免费使用标记
                  }]
                })
              });
              console.log(`局部重绘功能首次使用记录创建成功: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}`);
            }
          } catch (saveError) {
            console.error('保存局部重绘任务详情失败:', saveError);
            // 继续响应，不中断流程
          }
          
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
      // 使用统一的功能中间件（正确扣除积分）
      return createUnifiedFeatureMiddleware('IMAGE_EXPANSION')(req, res, async () => {
        try {
          const response = await createTask(requestData);
          
          // 获取当前用户ID和积分消费信息
          const userId = req.user.id;
          const creditCost = req.featureUsage?.creditCost || 0;
          
          // 判断是否是免费使用
          const isFree = req.featureUsage?.isFree || false;
          
          // 生成唯一任务ID
          const taskId = response.data.output?.task_id || `expand-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
          
          // 保存任务信息到全局变量
          if (!global.imageExpansionTasks) {
            global.imageExpansionTasks = {};
          }
          
          global.imageExpansionTasks[taskId] = {
            userId: userId,
            creditCost: creditCost, // 积分已在中间件中扣除
            hasChargedCredits: true, // 积分已在中间件中扣除
            timestamp: new Date(),
            imageUrl: requestData.input?.base_image_url,
            prompt: requestData.input?.prompt,
            isFree: isFree // 添加免费使用标记
          };
          
          console.log(`智能扩图任务信息已保存: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}, 是否免费=${isFree}`);
          
          // 将任务信息保存到数据库
          try {
            const usage = await FeatureUsage.findOne({
              where: { 
                userId: userId, 
                featureName: 'IMAGE_EXPANSION' 
              }
            });
            
            if (usage) {
              // 解析现有详情
              const details = JSON.parse(usage.details || '{}');
              // 准备任务列表
              const tasks = details.tasks || [];
              // 添加新任务
              tasks.push({
                taskId: taskId,
                creditCost: creditCost, // 积分已在中间件中扣除
                timestamp: new Date(),
                isFree: isFree // 添加免费使用标记
              });
              
              // 更新usage记录 - 更新details字段但不重复累加积分
              // 积分已在统一中间件中扣除，这里不需要再次累加
              usage.details = JSON.stringify({
                ...details,
                tasks: tasks
              });
              
              // 保存更新
              await usage.save();
              console.log(`智能扩图任务信息已保存到数据库: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}`);
            } else {
              // 如果记录不存在，创建新记录
              await FeatureUsage.create({
                userId: userId,
                featureName: 'IMAGE_EXPANSION',
                usageCount: 1,
                lastUsedAt: new Date(),
                credits: 0, // 设置为0，积分已在统一中间件中扣除
                details: JSON.stringify({
                  tasks: [{
                    taskId: taskId,
                    creditCost: creditCost, // 积分已在中间件中扣除
                    timestamp: new Date(),
                    isFree: isFree // 添加免费使用标记
                  }]
                })
              });
              console.log(`智能扩图功能首次使用记录创建成功: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}`);
            }
          } catch (saveError) {
            console.error('保存智能扩图任务详情失败:', saveError);
            // 继续响应，不中断流程
          }
          
          return res.status(response.status || 200).json(response.data);
        } catch (error) {
          handleApiError(error, res);
        }
      });
    }
    // 如果是模糊图片变清晰功能，需要验证IMAGE_SHARPENING权限
    else if (functionType === 'super_resolution') {
      // 使用统一的功能中间件（正确扣除积分）
      return createUnifiedFeatureMiddleware('IMAGE_SHARPENING')(req, res, async () => {
        try {
          const response = await createTask(requestData);
          
          // 获取当前用户ID和积分消费信息
          const userId = req.user.id;
          const creditCost = req.featureUsage?.creditCost || 0;
          
          // 判断是否是免费使用
          const isFree = req.featureUsage?.isFree || false;
          
          // 生成唯一任务ID
          const taskId = response.data.output?.task_id || `sharpen-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
          
          // 保存任务信息到全局变量
          if (!global.imageSharpeningTasks) {
            global.imageSharpeningTasks = {};
          }
          
          global.imageSharpeningTasks[taskId] = {
            userId: userId,
            creditCost: creditCost, // 积分已在中间件中扣除
            hasChargedCredits: true, // 积分已在中间件中扣除
            timestamp: new Date(),
            imageUrl: requestData.input?.base_image_url,
            prompt: requestData.input?.prompt,
            isFree: isFree // 添加免费使用标记
          };
          
          console.log(`图像锐化任务信息已保存: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}, 是否免费=${isFree}`);
          
          // 将任务信息保存到数据库
          try {
            const usage = await FeatureUsage.findOne({
              where: { 
                userId: userId, 
                featureName: 'IMAGE_SHARPENING' 
              }
            });
            
            if (usage) {
              // 解析现有详情
              const details = JSON.parse(usage.details || '{}');
              // 准备任务列表
              const tasks = details.tasks || [];
              // 添加新任务
              tasks.push({
                taskId: taskId,
                creditCost: creditCost, // 积分已在中间件中扣除
                timestamp: new Date(),
                isFree: isFree // 添加免费使用标记
              });
              
              // 更新usage记录 - 更新details字段但不重复累加积分
              // 积分已在统一中间件中扣除，这里不需要再次累加
              usage.details = JSON.stringify({
                ...details,
                tasks: tasks
              });
              
              // 保存更新
              await usage.save();
              console.log(`图像锐化任务信息已保存到数据库: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}`);
            } else {
              // 如果记录不存在，创建新记录
              await FeatureUsage.create({
                userId: userId,
                featureName: 'IMAGE_SHARPENING',
                usageCount: 1,
                lastUsedAt: new Date(),
                credits: 0, // 设置为0，积分已在统一中间件中扣除
                details: JSON.stringify({
                  tasks: [{
                    taskId: taskId,
                    creditCost: creditCost, // 积分已在中间件中扣除
                    timestamp: new Date(),
                    isFree: isFree // 添加免费使用标记
                  }]
                })
              });
              console.log(`图像锐化功能首次使用记录创建成功: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}`);
            }
          } catch (saveError) {
            console.error('保存图像锐化任务详情失败:', saveError);
            // 继续响应，不中断流程
          }
          
          return res.status(response.status || 200).json(response.data);
        } catch (error) {
          handleApiError(error, res);
        }
      });
    }
    // 如果是垫图功能，需要验证DIANTU权限
    else if (functionType === 'control_cartoon_feature') {
      // 使用统一的功能中间件（正确扣除积分）
      return createUnifiedFeatureMiddleware('DIANTU')(req, res, async () => {
        try {
          const response = await createTask(requestData);
          
          // 获取当前用户ID和积分消费信息
          const userId = req.user.id;
          const creditCost = req.featureUsage?.creditCost || FEATURES['DIANTU']?.creditCost || 5;
          
          // 判断是否是免费使用
          const isFree = req.featureUsage?.isFree || false;
          
          // 生成唯一任务ID
          const taskId = response.data.output?.task_id || `diantu-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
          
          // 保存任务信息到全局变量
          if (!global.diantuTasks) {
            global.diantuTasks = {};
          }
          
          global.diantuTasks[taskId] = {
            userId: userId,
            creditCost: creditCost, // 积分已在中间件中扣除
            hasChargedCredits: true, // 积分已在中间件中扣除
            timestamp: new Date(),
            imageUrl: requestData.input?.base_image_url,
            prompt: requestData.input?.prompt,
            isFree: isFree // 添加免费使用标记
          };
          
          console.log(`垫图任务信息已保存: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}, 是否免费=${isFree}`);
          
          // 将任务信息保存到数据库
          try {
            const usage = await FeatureUsage.findOne({
              where: { 
                userId: userId, 
                featureName: 'DIANTU' 
              }
            });
            
            if (usage) {
              // 解析现有详情
              const details = JSON.parse(usage.details || '{}');
              // 准备任务列表
              const tasks = details.tasks || [];
              // 添加新任务
              tasks.push({
                taskId: taskId,
                creditCost: creditCost, // 积分已在中间件中扣除
                timestamp: new Date(),
                isFree: isFree // 添加免费使用标记
              });
              
              // 更新usage记录 - 更新details字段但不重复累加积分
              // 积分已在统一中间件中扣除，这里不需要再次累加
              usage.details = JSON.stringify({
                ...details,
                tasks: tasks
              });
              
              // 保存更新
              await usage.save();
              console.log(`垫图任务信息已保存到数据库: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}`);
            } else {
              // 如果记录不存在，创建新记录
              await FeatureUsage.create({
                userId: userId,
                featureName: 'DIANTU',
                usageCount: 1,
                lastUsedAt: new Date(),
                credits: 0, // 设置为0，积分已在统一中间件中扣除
                details: JSON.stringify({
                  tasks: [{
                    taskId: taskId,
                    creditCost: creditCost, // 积分已在中间件中扣除
                    timestamp: new Date(),
                    isFree: isFree // 添加免费使用标记
                  }]
                })
              });
              console.log(`垫图功能首次使用记录创建成功: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}`);
            }
          } catch (saveError) {
            console.error('保存垫图任务详情失败:', saveError);
            // 继续响应，不中断流程
          }
          
          return res.status(response.status || 200).json(response.data);
        } catch (error) {
          handleApiError(error, res);
        }
      });
    }
    // 其他功能类型使用默认的IMAGE_EDIT权限
    else {
      return createUnifiedFeatureMiddleware('IMAGE_EDIT')(req, res, async () => {
        try {
          const response = await createTask(requestData);
          
          // 获取当前用户ID和积分消费信息
          const userId = req.user.id;
          const creditCost = req.featureUsage?.creditCost || 0;
          
          // 生成唯一任务ID
          const taskId = response.data.output?.task_id || `edit-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
          
          // 保存任务信息到全局变量
          if (!global.imageEditTasks) {
            global.imageEditTasks = {};
          }
          
          global.imageEditTasks[taskId] = {
            userId: userId,
            creditCost: creditCost,
            hasChargedCredits: true,
            timestamp: new Date(),
            imageUrl: requestData.input?.base_image_url,
            prompt: requestData.input?.prompt,
            function: requestData.input?.function || 'general_edit'
          };
          
          console.log(`指令编辑任务信息已保存: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}`);
          
          // 将任务信息保存到数据库
          try {
            // 查找现有记录
            let usage = await FeatureUsage.findOne({
              where: { 
                userId: userId, 
                featureName: 'IMAGE_EDIT' 
              }
            });
            
            if (usage) {
              // 解析现有详情
              let details = {};
              try {
                details = JSON.parse(usage.details || '{}');
              } catch (parseError) {
                details = {};
              }
              
              // 准备任务列表
              const tasks = details.tasks || [];
              
              // 添加新任务
              tasks.push({
                taskId: taskId,
                creditCost: creditCost,
                timestamp: new Date()
              });
              
              // 更新usage记录 - 更新details字段但不重复累加积分
              // 积分已在统一中间件中扣除，这里不需要再次累加
              usage.details = JSON.stringify({
                ...details,
                tasks: tasks
              });
              
              // 保存更新
              await usage.save();
              console.log(`指令编辑任务信息已保存到数据库: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}`);
            } else {
              // 创建新记录
              await FeatureUsage.create({
                userId: userId,
                featureName: 'IMAGE_EDIT',
                usageCount: 1,
                credits: 0, // 设置为0，积分已在统一中间件中扣除
                lastUsedAt: new Date(),
                details: JSON.stringify({
                  tasks: [{
                    taskId: taskId,
                    creditCost: creditCost,
                    timestamp: new Date()
                  }]
                })
              });
              console.log(`指令编辑功能首次使用记录创建成功: 用户ID=${userId}, 任务ID=${taskId}, 积分=${creditCost}`);
            }
          } catch (saveError) {
            console.error('保存指令编辑任务详情失败:', saveError);
            // 继续响应，不中断流程
          }
          
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
            
            // 如果任务成功完成，更新全局变量中的状态
            if (responseData.output?.task_status === 'SUCCEEDED') {
                // 尝试获取图片URL
                let resultUrl = '';
                if (responseData.output.results && responseData.output.results.length > 0) {
                    resultUrl = responseData.output.results[0].url;
                } else if (responseData.output.result_url) {
                    resultUrl = responseData.output.result_url;
                }
                
                // 更新全局变量中的任务状态
                const taskId = responseData.output.task_id;
                
                // 检查是否是指令编辑任务
                if (global.imageEditTasks && global.imageEditTasks[taskId]) {
                    global.imageEditTasks[taskId].status = 'SUCCEEDED';
                    global.imageEditTasks[taskId].resultUrl = resultUrl;
                    global.imageEditTasks[taskId].completedAt = new Date();
                    console.log(`更新指令编辑任务状态: taskId=${taskId}, status=SUCCEEDED`);
                }
            }
            // 如果任务失败，更新全局变量中的状态
            else if (responseData.output?.task_status === 'FAILED') {
                const taskId = responseData.output.task_id;
                const errorMessage = responseData.output.message || '任务执行失败';
                
                // 检查是否是指令编辑任务
                if (global.imageEditTasks && global.imageEditTasks[taskId]) {
                    global.imageEditTasks[taskId].status = 'FAILED';
                    global.imageEditTasks[taskId].errorMessage = errorMessage;
                    global.imageEditTasks[taskId].completedAt = new Date();
                    console.log(`更新指令编辑任务状态: taskId=${taskId}, status=FAILED, error=${errorMessage}`);
                }
            }
            
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