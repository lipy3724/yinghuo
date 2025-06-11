const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const OSS = require('ali-oss');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
// 加载环境变量
require('dotenv').config();

// API配置
const API_CONFIG = {
  APP_KEY: process.env.API_APP_KEY || "your-app-key",
  SECRET_KEY: process.env.API_SECRET_KEY || "your-secret-key",
  SIGN_METHOD_SHA256: process.env.API_SIGN_METHOD_SHA256 || "sha256",
  SIGN_METHOD_HMAC_SHA256: process.env.API_SIGN_METHOD_HMAC_SHA256 || "HmacSHA256",
  API_HOST: process.env.API_HOST || "https://api-host-url.com",
}

// OSS配置
const OSS_CONFIG = {
  region: process.env.OSS_REGION || "oss-region",
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || "your-access-key-id",
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || "your-access-key-secret",
  bucket: process.env.OSS_BUCKET || "your-bucket-name",
}

/**
 * 将二进制数组转换为大写的十六进制字符串
 */
function byte2hex(bytes) {
  let sign = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    let hex = (byte & 0xFF).toString(16);
    if (hex.length === 1) {
      sign += '0';
    }
    sign += hex.toUpperCase();
  }
  return sign;
}

/**
 * HMAC-SHA256加密实现
 */
function encryptHMACSHA256(data, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data, 'utf8');
  return hmac.digest();
}

/**
 * HMAC-SHA256加密实现 - 使用新的签名方式
 */
function hmacSha256(data, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  return hmac.digest('hex').toUpperCase();
}

/**
 * 签名API请求
 */
function signApiRequest(params, appSecret, signMethod, apiName) {
  // 第一步：检查参数是否已经排序
  const keys = Object.keys(params).sort();
  
  // 第二步和第三步：把API名和参数串在一起
  let query = apiName;
  
  for (const key of keys) {
    const value = params[key];
    if (key && value) {
      query += key + value;
    }
  }
  
  console.log('Query string for signing:', query);
  
  // 第四步：使用加密算法
  let bytes;
  if (signMethod === API_CONFIG.SIGN_METHOD_SHA256) {
    bytes = encryptHMACSHA256(query, appSecret);
  }
  
  // 第五步：把二进制转化为大写的十六进制
  return byte2hex(bytes);
}

/**
 * 获取签名响应
 */
function getSignParams(params, api) {
  try {
    const time = Date.now();
    const signParams = { ...params };
    
    signParams.app_key = API_CONFIG.APP_KEY;
    signParams.sign_method = API_CONFIG.SIGN_METHOD_SHA256;
    signParams.timestamp = String(time);
    
    const signStr = signApiRequest(signParams, API_CONFIG.SECRET_KEY, API_CONFIG.SIGN_METHOD_SHA256, api);
    
    return {
      appKey: API_CONFIG.APP_KEY,
      signStr,
      timestamp: time,
      signMethod: API_CONFIG.SIGN_METHOD_SHA256
    };
  } catch (error) {
    console.error('获取签名失败:', error);
    throw error;
  }
}

// 创建OSS客户端
const ossClient = new OSS({
  region: OSS_CONFIG.region,
  accessKeyId: OSS_CONFIG.accessKeyId,
  accessKeySecret: OSS_CONFIG.accessKeySecret,
  bucket: OSS_CONFIG.bucket,
});

/**
 * 上传文件到OSS
 * @param {Buffer} fileBuffer - 文件buffer
 * @param {String} fileName - 文件名
 * @returns {Promise<String>} - 返回OSS URL
 */
async function uploadToOSS(fileBuffer, fileName) {
  try {
    // 生成唯一的文件名避免冲突
    const extname = path.extname(fileName);
    // 针对鞋靴试穿功能使用特定目录
    const ossPath = `shoe-virtual-try/images/${Date.now()}-${uuidv4()}${extname}`;
    
    // 上传到OSS
    const result = await ossClient.put(ossPath, fileBuffer);
    console.log('文件上传到OSS成功:', result.url);
    
    return result.url;
  } catch (error) {
    console.error('上传到OSS失败:', error);
    throw error;
  }
}

/**
 * 调用图像高清放大API
 * @param {String} imageUrl - 图片URL
 * @param {Number} upscaleFactor - 放大倍数
 * @returns {Promise<Object>} - API响应
 */
async function callUpscaleApi(imageUrl, upscaleFactor) {
  try {
    // 使用原始代码中的API路径
    const apiPath = "/ai/super/resolution";
    
    // 当前时间戳（毫秒）
    const timestamp = Date.now();
    
    // 按照原始代码的方式计算签名
    const signData = API_CONFIG.SECRET_KEY + timestamp;
    const sign = hmacSha256(signData, API_CONFIG.SECRET_KEY);
    
    // 构建API URL - 与原始代码保持一致
    const apiUrl = `https://cn-api.aidc-ai.com/rest${apiPath}?partner_id=aidge&sign_method=sha256&sign_ver=v2&app_key=${API_CONFIG.APP_KEY}&timestamp=${timestamp}&sign=${sign}`;
    
    // 构建请求参数 - 与原始代码保持一致
    const requestBody = {
      imageUrl: imageUrl,
      upscaleFactor: String(upscaleFactor)
    };
    
    // 打印日志
    console.log('调用图像高清放大API:', apiUrl);
    console.log('签名数据:', signData);
    
    // 准备请求头 - 与原始代码保持一致
    const headers = {
      'Content-Type': 'application/json',
      'x-iop-trial': 'true'  // 添加试用标记
    };
    
    console.log('请求头:', headers);
    console.log('请求参数:', requestBody);
    
    // 使用POST方法发送请求，参数放在请求体中
    const response = await axios.post(apiUrl, requestBody, { headers });
    
    console.log('API响应状态:', response.status);
    console.log('API完整响应:', JSON.stringify(response.data, null, 2));
    
    if (response.data && response.data.success) {
      console.log('API调用成功');
      return response.data;
    } else if (response.data && response.data.data) {
      // 可能是成功但格式不同
      console.log('API可能成功，检查data字段');
      return response.data;
    } else {
      console.error('API调用失败:', response.data);
      throw new Error(response.data.message || '图像处理失败');
    }
  } catch (error) {
    console.error('调用图像高清放大API失败:', error.message);
    throw new Error('图像处理失败');
  }
}

/**
 * 生成Aidge虚拟模特需要的签名
 * @param {string} secret - 加密密钥（即从Aidge官网获取到的secret）
 * @param {number} timeStamp - 当前的Unix时间戳（单位：秒）
 * @param {string} userId - 商户侧自定义的用户ID，可选
 * @returns {string} - 加签后的签名
 */
function generateAidgeSign(secret, timeStamp, userId) {
  try {
    // 使用TreeMap排序参数，在JS中可以使用Object.keys排序实现
    const params = {};
    params.timeStamp = timeStamp.toString();
    
    // 仅当userId非空时添加
    if (userId && userId.trim()) {
      params.userId = userId;
    }
    
    // 按key排序构建查询字符串（不含分隔符，直接拼接）
    const sortedKeys = Object.keys(params).sort();
    let query = '';
    
    for (const key of sortedKeys) {
      const value = params[key];
      // 检查key和value都不为空
      if (key && key.trim() && value && value.trim()) {
        query += key + value;
      }
    }
    
    // 使用HMAC-SHA256加密
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(query);
    
    // 转为大写的十六进制字符串
    return hmac.digest('hex').toUpperCase();
  } catch (error) {
    console.error('生成Aidge签名失败:', error);
    throw new Error('生成签名失败: ' + error.message);
  }
}

module.exports = {
  uploadToOSS,
  callUpscaleApi,
  generateAidgeSign
}; 