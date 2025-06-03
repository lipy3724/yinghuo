/**
 * 阿里云API代理服务
 * 负责处理阿里云视觉智能API调用的签名和请求
 */
const crypto = require('crypto');
const axios = require('axios');
const querystring = require('querystring');
require('dotenv').config();

/**
 * 调用阿里云服饰分割API (基于ViapiAPI)
 * @param {Object} params 请求参数
 * @returns {Promise<Object>} API响应结果
 */
async function callClothSegmentationApi(params) {
    try {
        // 获取API密钥
        const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
        const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;

        if (!accessKeyId || !accessKeySecret) {
            throw new Error('缺少阿里云API密钥配置');
        }

        // 准备公共参数
        const commonParams = {
            Format: 'JSON',
            Version: '2019-12-30',
            AccessKeyId: accessKeyId,
            SignatureMethod: 'HMAC-SHA1',
            Timestamp: new Date().toISOString(),
            SignatureVersion: '1.0',
            SignatureNonce: generateNonce(),
            Action: 'SegmentCloth' // 固定为服饰分割API
        };

        // 合并请求参数
        const requestParams = {
            ...commonParams
        };

        // 添加图片URL参数 - 确保使用ImageURL作为参数名
        if (params.ImageURL) {
            requestParams.ImageURL = params.ImageURL;
        }

        // 添加服饰类别参数，使用标准的ClothClass.N格式
        if (params.ClothClasses && Array.isArray(params.ClothClasses) && params.ClothClasses.length > 0) {
            params.ClothClasses.forEach((className, index) => {
                requestParams[`ClothClass.${index + 1}`] = className;
            });
        }

        // 添加可选的输出模式参数
        if (params.OutMode !== undefined) {
            requestParams.OutMode = params.OutMode;
        }

        // 添加可选的返回格式参数
        if (params.ReturnForm) {
            requestParams.ReturnForm = params.ReturnForm;
        }

        // 生成签名
        const signature = generateSignature(requestParams, accessKeySecret);
        requestParams.Signature = signature;

        // 构建请求URL和参数
        const endpoint = 'https://imageseg.cn-shanghai.aliyuncs.com/';
        const queryParams = querystring.stringify(requestParams);
        const requestUrl = `${endpoint}?${queryParams}`;

        console.log('阿里云API请求URL:', requestUrl);

        // 发送请求
        const response = await axios.get(requestUrl);
        
        console.log('阿里云API响应数据:', JSON.stringify(response.data, null, 2));
        
        return response.data;
    } catch (error) {
        console.error('阿里云API调用错误:', error);
        
        // 提取阿里云API的错误信息
        if (error.response && error.response.data) {
            throw new Error(`阿里云API错误: ${error.response.data.Message || error.message}`);
        }
        
        throw error;
    }
}

/**
 * 使用DashScope API调用阿里云服饰分割API
 * @param {Object} params 请求参数
 * @returns {Promise<Object>} API响应结果
 */
async function callDashScopeClothSegmentation(params) {
    try {
        const apiKey = process.env.DASHSCOPE_API_KEY;
        
        if (!apiKey) {
            throw new Error('缺少阿里云DashScope API密钥配置');
        }
        
        console.log('DashScope服饰分割请求参数:', params);
        
        // 构建请求参数
        const requestData = {
            model: "cv-segment-garment", // 使用服饰分割模型
            input: {
                image_url: params.ImageURL,
            },
            parameters: {}
        };
        
        // 添加服饰类别 - 转换格式
        if (params.ClothClasses && Array.isArray(params.ClothClasses) && params.ClothClasses.length > 0) {
            requestData.parameters.cloth_classes = params.ClothClasses;
        }
        
        // 添加返回类型
        if (params.ReturnForm) {
            requestData.parameters.return_form = params.ReturnForm.toLowerCase();
        }
        
        // 添加输出模式
        if (params.OutMode !== undefined) {
            requestData.parameters.out_mode = parseInt(params.OutMode);
        }
        
        console.log('DashScope API请求数据:', JSON.stringify(requestData, null, 2));
        
        // 发送请求
        const response = await axios({
            method: 'POST',
            url: 'https://dashscope.aliyuncs.com/api/v1/services/cv/segment/garment', // 更新为正确的API端点
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'X-DashScope-Async': 'enable' // 添加异步请求头
            },
            data: requestData
        });
        
        console.log('DashScope API响应状态:', response.status);
        console.log('DashScope API响应数据:', JSON.stringify(response.data, null, 2));
        
        // 检查是否为异步任务响应
        if (response.data.output && response.data.output.task_id) {
            // 返回异步任务ID
            const taskId = response.data.output.task_id;
            console.log(`接收到异步任务ID: ${taskId}`);
            
            // 构建任务状态响应
            return {
                RequestId: response.data.request_id,
                Data: {
                    TaskId: taskId,
                    TaskStatus: response.data.output.task_status || 'PENDING'
                }
            };
        }
        
        // 将DashScope API的响应格式转换为我们的标准格式
        return transformDashScopeResponse(response.data);
    } catch (error) {
        console.error('DashScope API调用错误:', error);
        
        // 提取DashScope API的错误信息
        let errorMessage = error.message;
        let errorCode = 'InternalError';
        
        if (error.response && error.response.data) {
            const responseData = error.response.data;
            errorMessage = responseData.message || responseData.error_message || error.message;
            errorCode = responseData.code || responseData.error_code || 'InternalError';
        }
        
        throw {
            Message: `DashScope API错误: ${errorMessage}`,
            Code: errorCode
        };
    }
}

/**
 * 将DashScope API的响应格式转换为标准格式
 * @param {Object} dashScopeResponse DashScope API的响应数据
 * @returns {Object} 标准格式的响应数据
 */
function transformDashScopeResponse(dashScopeResponse) {
    const result = {
        RequestId: dashScopeResponse.request_id,
        Data: {
            Elements: [],
            ImageURL: '',
            ClassUrl: {}
        }
    };
    
    if (dashScopeResponse.output && dashScopeResponse.output.image_url) {
        result.Data.ImageURL = dashScopeResponse.output.image_url;
    }
    
    if (dashScopeResponse.output && dashScopeResponse.output.class_urls) {
        // 将DashScope的class_urls对象转换为我们的ClassUrl格式
        result.Data.ClassUrl = dashScopeResponse.output.class_urls;
    }
    
    return result;
}

/**
 * 生成随机字符串作为签名随机数
 */
function generateNonce() {
    return 'nonce_' + Date.now() + '_' + Math.random().toString(36).substr(2, 16);
}

/**
 * 生成阿里云API签名
 * @param {Object} params 请求参数
 * @param {string} accessKeySecret 访问密钥
 * @returns {string} 签名字符串
 */
function generateSignature(params, accessKeySecret) {
    // 1. 按参数名称字典序排序
    const sortedKeys = Object.keys(params).sort();
    
    // 2. 构建规范化请求字符串
    const canonicalizedQueryString = sortedKeys
        .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
        .join('&');
    
    // 3. 构建待签名字符串
    const stringToSign = 'GET&' + encodeURIComponent('/') + '&' + encodeURIComponent(canonicalizedQueryString);
    
    // 4. 计算签名
    const hmac = crypto.createHmac('sha1', accessKeySecret + '&');
    hmac.update(stringToSign);
    
    return hmac.digest('base64');
}

/**
 * 调用阿里云视频字幕擦除API
 * @param {Object} params 请求参数
 * @returns {Promise<Object>} API响应结果
 */
async function callVideoSubtitleRemovalApi(params) {
    try {
        // 获取API密钥
        const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
        const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;

        if (!accessKeyId || !accessKeySecret) {
            throw new Error('缺少阿里云API密钥配置');
        }

        // 准备公共参数
        const commonParams = {
            Format: 'JSON',
            Version: '2020-03-20',
            AccessKeyId: accessKeyId,
            SignatureMethod: 'HMAC-SHA1',
            Timestamp: new Date().toISOString(),
            SignatureVersion: '1.0',
            SignatureNonce: generateNonce(),
            Action: 'EraseVideoSubtitles', // 固定为视频字幕擦除API
            RegionId: 'cn-shanghai'
        };

        // 合并请求参数，保证参数名与阿里云API一致
        // 参照官方文档：https://help.aliyun.com/zh/viapi/developer-reference/api-t470ol
        // 必须参数：VideoUrl, Action
        // 可选参数：BX, BY, BW, BH
        const requestParams = {
            ...commonParams,
            VideoUrl: params.VideoUrl
        };

        // 直接使用参数中的坐标参数 - 不做任何转换
        if (params.BX !== undefined) requestParams.BX = params.BX;
        if (params.BY !== undefined) requestParams.BY = params.BY;
        if (params.BW !== undefined) requestParams.BW = params.BW;
        if (params.BH !== undefined) requestParams.BH = params.BH;

        // 生成签名
        const signature = generateSignature(requestParams, accessKeySecret);
        requestParams.Signature = signature;

        // 构建请求URL和参数
        const endpoint = 'https://videoenhan.cn-shanghai.aliyuncs.com/';
        const queryParams = querystring.stringify(requestParams);

        console.log('阿里云视频字幕擦除API请求参数:', JSON.stringify(requestParams, null, 2));

        // 发送请求 - 尝试POST和GET两种方式
        let response;
        try {
            // 首先尝试POST
            response = await axios.post(endpoint, queryParams, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                timeout: 20000 // 20秒超时
            });
        } catch (postError) {
            console.error('视频字幕擦除API POST请求失败，尝试GET方法:', postError.message);
            // 如果POST失败，尝试GET
            response = await axios.get(`${endpoint}?${queryParams}`, {
                headers: {
                    'Accept': 'application/json'
                },
                timeout: 20000 // 20秒超时
            });
        }
        
        console.log('阿里云视频字幕擦除API响应状态:', response.status);
        console.log('阿里云视频字幕擦除API响应数据:', JSON.stringify(response.data, null, 2));
        
        // 检查结果，看是否有错误
        if (response.data && response.data.Code) {
            throw new Error(`阿里云API错误: ${response.data.Message || '未知错误'}, 代码: ${response.data.Code}`);
        }
        
        return response.data;
    } catch (error) {
        console.error('阿里云视频字幕擦除API调用错误:', error);
        
        // 提取阿里云API的错误信息
        if (error.response && error.response.data) {
            console.error('阿里云API错误响应:', JSON.stringify(error.response.data, null, 2));
            throw new Error(`阿里云API错误: ${error.response.data.Message || error.message}`);
        }
        
        throw error;
    }
}

/**
 * 查询阿里云异步任务状态
 * @param {string} jobId 任务ID
 * @returns {Promise<Object>} API响应结果
 */
async function checkAsyncJobStatus(jobId) {
    try {
        // 获取API密钥
        const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
        const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;

        if (!accessKeyId || !accessKeySecret) {
            throw new Error('缺少阿里云API密钥配置');
        }

        // 准备公共参数
        const commonParams = {
            Format: 'JSON',
            Version: '2020-03-20',
            AccessKeyId: accessKeyId,
            SignatureMethod: 'HMAC-SHA1',
            Timestamp: new Date().toISOString(),
            SignatureVersion: '1.0',
            SignatureNonce: generateNonce(),
            Action: 'GetAsyncJobResult', // 固定为查询异步任务结果API
            RegionId: 'cn-shanghai',
            JobId: jobId
        };

        // 生成签名
        const signature = generateSignature(commonParams, accessKeySecret);
        commonParams.Signature = signature;

        // 构建请求URL和参数
        const endpoint = 'https://videoenhan.cn-shanghai.aliyuncs.com/';
        const queryParams = querystring.stringify(commonParams);

        console.log('阿里云查询任务状态API请求参数:', JSON.stringify(commonParams, null, 2));

        // 发送请求 - 尝试GET方法
        let response;
        try {
            // 首先尝试POST
            response = await axios.post(endpoint, queryParams, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                timeout: 10000 // 10秒超时
            });
        } catch (postError) {
            console.error('POST请求失败，尝试GET方法:', postError.message);
            // 如果POST失败，尝试GET
            response = await axios.get(`${endpoint}?${queryParams}`, {
                headers: {
                    'Accept': 'application/json'
                },
                timeout: 10000
            });
        }
        
        console.log('阿里云查询任务状态API响应状态:', response.status);
        console.log('阿里云查询任务状态API响应数据:', JSON.stringify(response.data, null, 2));
        
        // 检查结果格式，确保返回正确
        if (!response.data || !response.data.Data) {
            console.warn('阿里云查询任务状态API返回的数据格式可能不正确:', response.data);
        }
        
        return response.data;
    } catch (error) {
        console.error('阿里云查询任务状态API调用错误:', error);
        
        // 提取阿里云API的错误信息
        if (error.response && error.response.data) {
            console.error('阿里云查询任务状态API错误响应:', JSON.stringify(error.response.data, null, 2));
            throw new Error(`阿里云API错误: ${error.response.data.Message || error.message}`);
        }
        
        throw error;
    }
}

module.exports = {
    callClothSegmentationApi,
    callDashScopeClothSegmentation,
    callVideoSubtitleRemovalApi,
    checkAsyncJobStatus
}; 