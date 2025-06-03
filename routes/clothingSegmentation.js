const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid'); // 需要安装uuid包: npm install uuid
const { callClothSegmentationApi } = require('../utils/aliyunApiProxy');
const axios = require('axios');
const { checkFeatureAccess } = require('../middleware/featureAccess');

/**
 * 服饰分割API - 创建任务
 * 使用阿里云视觉智能开放平台的服饰分割能力
 */
router.post('/create-task', protect, checkFeatureAccess('CLOTH_SEGMENTATION'), async (req, res) => {
    try {
        const { imageUrl, clothClasses, returnForm, outMode } = req.body;
        
        // 验证必要的参数
        if (!imageUrl) {
            return res.status(400).json({ message: '缺少图片URL参数' });
        }

        if (!clothClasses || !Array.isArray(clothClasses) || clothClasses.length === 0) {
            return res.status(400).json({ message: '请至少选择一个服饰类别' });
        }

        console.log('收到服饰分割请求:', {
            imageUrl,
            clothClasses,
            returnForm,
            outMode
        });
        
        // 构建符合阿里云标准API的参数格式
        const apiParams = {
            ImageURL: imageUrl,
            ClothClasses: clothClasses,
            OutMode: outMode !== undefined ? outMode : 1  // 默认使用1（指定类别组合分割结果）
        };
        
        // 添加可选参数
        if (returnForm) {
            apiParams.ReturnForm = returnForm;
        }
        
        console.log('调用阿里云API参数:', apiParams);
        
        // 调用阿里云标准API
        try {
            const apiResult = await callClothSegmentationApi(apiParams);
            console.log('阿里云API返回结果:', JSON.stringify(apiResult, null, 2));
            
            // 返回标准API结果
            return res.status(200).json(apiResult);
        } catch (apiError) {
            console.error('阿里云API调用失败:', apiError);
            return res.status(500).json({
                RequestId: uuidv4().replace(/-/g, '').toUpperCase(),
                Message: apiError.message || '服务器处理请求时出错',
                Code: apiError.Code || 'InternalError',
                success: false
            });
        }
    } catch (error) {
        console.error('服饰分割API错误:', error);
        return res.status(500).json({ 
            RequestId: uuidv4().replace(/-/g, '').toUpperCase(),
            Message: '服务器处理请求时出错', 
            Code: 'InternalError',
            success: false
        });
    }
});

/**
 * 服饰分割API - 查询任务状态
 * 用于获取异步任务的执行状态和结果
 */
router.get('/task-status/:taskId', protect, async (req, res) => {
    try {
        const { taskId } = req.params;
        
        if (!taskId) {
            return res.status(400).json({
                success: false,
                message: '任务ID不能为空'
            });
        }
        
        console.log(`查询服饰分割任务状态: ${taskId}`);
        
        // 从环境变量获取API密钥
        const apiKey = process.env.DASHSCOPE_API_KEY;
        
        if (!apiKey) {
            throw new Error('缺少阿里云DashScope API密钥配置');
        }
        
        // 准备请求头
        const headers = {
            'Authorization': `Bearer ${apiKey}`
        };
        
        // 查询任务状态
        const response = await axios.get(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, { headers });
        
        console.log('查询任务状态响应:', response.status, JSON.stringify(response.data, null, 2));
        
        const taskStatus = response.data.output.task_status;
        
        // 如果任务成功完成
        if (taskStatus === 'SUCCEEDED') {
            // 处理结果
            const result = {
                RequestId: response.data.request_id,
                Data: {
                    Elements: [],
                    ImageURL: '',
                    ClassUrl: {}
                }
            };
            
            // 提取主图URL
            if (response.data.output.results && response.data.output.results.length > 0) {
                if (response.data.output.results[0].url) {
                    result.Data.ImageURL = response.data.output.results[0].url;
                }
            } else if (response.data.output.result_url) {
                result.Data.ImageURL = response.data.output.result_url;
            } else if (response.data.output.image_url) {
                result.Data.ImageURL = response.data.output.image_url;
            }
            
            // 提取分类图URL
            if (response.data.output.class_urls) {
                result.Data.ClassUrl = response.data.output.class_urls;
            }
            
            return res.status(200).json(result);
        }
        // 如果任务失败
        else if (taskStatus === 'FAILED') {
            return res.status(500).json({
                success: false,
                RequestId: response.data.request_id,
                Message: response.data.output.message || '服饰分割任务失败',
                Code: response.data.output.code || 'TaskFailed',
                Data: null
            });
        }
        // 如果任务仍在处理中
        else {
            return res.status(200).json({
                success: true,
                RequestId: response.data.request_id,
                Message: '服饰分割任务正在处理中',
                taskStatus: taskStatus,
                Data: {
                    TaskId: taskId,
                    TaskStatus: taskStatus
                }
            });
        }
    } catch (error) {
        console.error('查询服饰分割任务状态出错:', error);
        
        if (error.response) {
            // 阿里云API错误
            return res.status(error.response.status || 500).json({
                success: false,
                message: '查询任务状态失败: ' + (error.response.data.message || error.message),
                error: error.response.data
            });
        }
        
        return res.status(500).json({
            success: false,
            message: '服务器错误，无法查询任务状态',
            error: error.message
        });
    }
});

module.exports = router; 