const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const crypto = require('crypto');
const multer = require('multer');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
// 导入环境变量配置
require('dotenv').config();
// 导入数据库
const sequelize = require('./config/db');
// 导入用户模型
const User = require('./models/User');
// 导入功能使用记录模型
const { FeatureUsage, setupAssociations } = require('./models/FeatureUsage');
// 导入图片历史记录模型
const ImageHistory = require('./models/ImageHistory');
// 导入支付订单模型
const PaymentOrder = require('./models/PaymentOrder');
// 导入认证路由
const authRoutes = require('./routes/auth');
// 导入积分管理路由
const creditsRoutes = require('./routes/credits');
// 导入管理员路由
const adminRoutes = require('./routes/admin');
// 导入文生视频路由
const textToVideoRoutes = require('./routes/textToVideo');
// 导入图像编辑路由
const imageEditRoutes = require('./routes/imageEdit');
// 导入文生图片路由
const textToImageRoutes = require('./routes/textToImage');
// 导入下载中心路由
const downloadsRoutes = require('./routes/downloads');
// 导入服饰分割路由
const clothingSegmentationRoutes = require('./routes/clothingSegmentation');
// 导入全局风格化路由
const globalStyleRoutes = require('./routes/globalStyle');
// 导入亚马逊Listing路由
const amazonListingRoutes = require('./routes/amazon-listing-api');
// 导入认证中间件
const { protect } = require('./middleware/auth');
// 导入功能访问中间件和功能配置
const { checkFeatureAccess, FEATURES } = require('./middleware/featureAccess');
// 导入数据库同步函数
const syncDatabase = require('./config/sync-db');
// 导入阿里云API工具
const axios = require('axios');

// 引入图像高清放大API工具
const { uploadToOSS, callUpscaleApi } = require('./api-utils');

// 引入阿里云API工具
const { 
  callClothSegmentationApi, 
  callDashScopeClothSegmentation, 
  callVideoSubtitleRemovalApi, 
  checkAsyncJobStatus
} = require('./utils/aliyunApiProxy');

// 引入视频工具函数
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const OSS = require('ali-oss');

// 引入阿里云SDK - 视频增强服务
const videoenhan20200320 = require('@alicloud/videoenhan20200320');
const OpenApi = require('@alicloud/openapi-client');
const Util = require('@alicloud/tea-util');

// 阿里云配置
const ossClient = new OSS({
  region: process.env.OSS_REGION,
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
  secure: process.env.OSS_SECURE === 'true',
  timeout: parseInt(process.env.OSS_TIMEOUT || '60000')
});

const app = express();
const port = process.env.PORT || 8080;

// API密钥和密钥配置 - 更新为新的密钥
const APP_KEY = "502592";
const SECRET_KEY = "dSmD7xK5Oms04Ml4VsQH0mmHJsBXcB1t";
const SIGN_METHOD_SHA256 = "sha256";
const SIGN_METHOD_HMAC_SHA256 = "HmacSHA256";
// 阿里云API相关配置 - 确保从环境变量中获取
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || 'default-api-key-replacement';
// 输出API KEY前5个字符，用于调试（不要输出全部，避免安全风险）
console.log('DASHSCOPE_API_KEY配置状态:', DASHSCOPE_API_KEY ? DASHSCOPE_API_KEY.substring(0, 5) + '...' : '未配置');

// 配置文件上传
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

// 配置文件上传 - 磁盘存储
const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

// 配置文件上传 - 内存存储（用于图像高清放大等需要直接处理文件的功能）
const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB限制
  }
});

const diskUpload = multer({
  storage: diskStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB限制
  }
});

const memoryUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB限制
  }
});

// 配置视频上传 - 磁盘存储
const videoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads', 'videos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'video-' + uniqueSuffix + ext);
  }
});

const videoUpload = multer({
  storage: videoStorage,
  limits: {
    fileSize: 200 * 1024 * 1024 // 200MB限制
  },
  fileFilter: function (req, file, cb) {
    // 只接受MP4格式
    if (file.mimetype === 'video/mp4') {
      cb(null, true);
    } else {
      cb(new Error('只支持MP4格式的视频文件'));
    }
  }
});

// 中间件配置
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 添加安全头中间件
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('X-Frame-Options', 'ALLOWALL');
  res.header('Content-Security-Policy', "frame-ancestors * 'self'");
  
  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// 确保上传目录存在
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 确保public目录存在
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 创建代理中间件
const editorProxy = createProxyMiddleware({
  target: 'https://editor.d.design',
  changeOrigin: true,
  onProxyRes: function(proxyRes, req, res) {
    // 修改响应头处理跨域
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    
    // 记录请求日志
    console.log(`编辑器代理: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
  },
  onError: function(err, req, res) {
    console.error('代理错误:', err);
    res.status(500).send('代理服务器错误');
  },
  // 添加超时设置，防止请求阻塞
  timeout: 30000,
  proxyTimeout: 30000
});

// 添加请求日志中间件
app.use((req, res, next) => {
  console.log(`请求: ${req.method} ${req.url}`);
  next();
});

// 静态文件服务 - 这应该在代理之前，确保静态文件优先
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// 添加根目录的HTML文件访问支持
app.use(express.static(path.join(__dirname)));

// 添加日志中间件，记录所有请求路径
app.use((req, res, next) => {
  console.log(`接收请求: ${req.method} ${req.url}`);
  const originalSend = res.send;
  res.send = function(data) {
    console.log(`响应请求: ${req.method} ${req.url} - 状态: ${res.statusCode}`);
    return originalSend.call(this, data);
  };
  next();
});

// 添加用户认证路由
app.use('/api/auth', authRoutes);
app.use('/api/credits', creditsRoutes);
app.use('/api/admin', adminRoutes);
// 添加文生视频路由
app.use('/api/text-to-video', textToVideoRoutes);
// 添加图像编辑路由
app.use('/api/image-edit', imageEditRoutes);
// 添加文生图片路由
app.use('/api/text-to-image', textToImageRoutes);

// 添加管理员系统路由 - 访问管理员页面
app.get('/admin', (req, res) => {
  res.redirect('/admin-login.html');
});

// 多图转视频API - 确保在主要API路由中注册
app.post('/api/multi-image-to-video', protect, async (req, res) => {
    try {
        console.log('收到多图转视频请求:', JSON.stringify(req.body, null, 2));
        
        // 验证请求数据
        const { 
            images, 
            scene, 
            width, 
            height, 
            style, 
            transition, 
            duration, 
            durationAdaption, 
            smartEffect, 
            puzzleEffect, 
            mute,
            music 
        } = req.body;
        
        if (!images || !Array.isArray(images) || images.length < 2) {
            return res.status(400).json({ success: false, message: '请至少提供2张图片' });
        }
        
        if (images.length > 40) {
            return res.status(400).json({ success: false, message: '图片数量不能超过40张' });
        }
        
        // 验证其他参数
        if (width && (width < 32 || width > 2160)) {
            return res.status(400).json({ success: false, message: '视频宽度应在32-2160范围内' });
        }
        
        if (height && (height < 32 || height > 2160)) {
            return res.status(400).json({ success: false, message: '视频高度应在32-2160范围内' });
        }
        
        if (duration && (duration < 5 || duration > 60)) {
            return res.status(400).json({ success: false, message: '视频时长应在5-60秒范围内' });
        }
        
        // 使用featureAccess中间件进行积分检查和扣除
        const { checkFeatureAccess } = require('./middleware/featureAccess');
        const featureAccessMiddleware = checkFeatureAccess('MULTI_IMAGE_TO_VIDEO');
        
        try {
            // 使用自定义中间件执行功能访问检查
            await new Promise((resolve, reject) => {
                featureAccessMiddleware(req, res, (err) => {
                    if (err) {
                        console.error('功能访问检查失败:', err);
                        reject(err);
                        return;
                    }
                    resolve();
                });
            });
        } catch (featureAccessError) {
            // 如果在这里捕获到错误，说明中间件内部有异常，但没有调用res.json()结束响应
            // 返回错误消息
            console.error('功能访问权限检查异常:', featureAccessError);
            return res.status(500).json({ 
                success: false, 
                message: '功能访问检查失败：' + (featureAccessError.message || '未知错误')
            });
        }
        
        // 如果res.headersSent为true，说明featureAccess中间件已经发送了响应
        // 比如因为积分不足，响应已经结束，我们直接返回
        if (res.headersSent) {
            console.log('featureAccess中间件已经处理了响应，不再继续处理');
            return;
        }
        
        // 继续处理请求
        
        // 准备API请求数据
        // 将前端的转场效果映射到阿里云API支持的转场风格
        const transitionStyleMap = {
            'fade': 'normal',     // 淡入淡出 -> 自然
            'slide': 'shift',     // 滑动 -> 切换
            'zoom': 'zoom',       // 缩放 -> 缩放
            'wipe': 'shutter',    // 擦除 -> 百叶窗
            'none': 'basic'       // 无效果 -> 无
            // 其他值已经与API匹配，不需要映射
        };
        
        // 构建文件列表，包含所有图片URL
        const fileList = images.map((imageUrl, index) => {
            return {
                Type: 'image',
                FileUrl: imageUrl,
                FileName: `image_${index}.jpg`
            };
        });
        
        // 如果有音乐文件，添加到文件列表
        if (music && music !== 'none') {
            // 如果是预设音乐，使用对应的URL
            // 这里假设预设音乐的值就是音乐文件的URL
            fileList.push({
                Type: 'audio',
                FileUrl: music,
                FileName: 'background_music.mp3'
            });
        }
        
        // 设置API参数
        const requestData = {
            Scene: scene || 'general',        // 使用指定场景或默认为通用场景
            FileList: fileList,               // 直接传递fileList对象，不要JSON.stringify
            Width: width || 1280,             // 设置默认输出分辨率
            Height: height || 720,
            Style: style || 'normal',         // 视频节奏：normal(普通)、fast(快)、slow(慢)
            Duration: parseInt(duration) || 10, // 计算总时长
            DurationAdaption: durationAdaption !== undefined ? durationAdaption : true, // 自动调整时长
            TransitionStyle: transitionStyleMap[transition] || transition || 'normal', // 转场风格
            SmartEffect: smartEffect !== undefined ? smartEffect : true, // 启用智能特效
            PuzzleEffect: puzzleEffect || false, // 不使用动态拼图
            Mute: mute !== undefined ? mute : ((!music || music === 'none')) // 如果没有音乐则静音
        };
        
        console.log('准备调用阿里云API，参数:', JSON.stringify(requestData, null, 2));
        
        // 获取API密钥
        const apiKey = process.env.DASHSCOPE_API_KEY || '';
        if (!apiKey) {
            return res.status(500).json({ success: false, message: '服务器配置错误：缺少API密钥' });
        }
        
        // 检查是否有有效的API密钥，决定是使用真实调用还是模拟调用
        const isValidApiKey = apiKey && apiKey.length > 10 && apiKey !== 'default-api-key-replacement';
        let taskId = '';
        
        if (isValidApiKey) {
            try {
                console.log('使用真实API调用多图转视频服务');
                // 使用@alicloud/pop-core等SDK进行签名和调用
                const Core = require('@alicloud/pop-core');
                
                // 创建POP Core客户端
                const client = new Core({
                    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
                    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
                    endpoint: 'https://videoenhan.cn-shanghai.aliyuncs.com',
                    apiVersion: '2020-03-20'
                });
                
                // 调用生成视频API
                const response = await client.request('GenerateVideo', requestData, {
                    method: 'POST'
                });
                
                console.log('阿里云API响应:', JSON.stringify(response, null, 2));
                
                // 检查API响应
                if (response && response.RequestId) {
                    taskId = response.RequestId;
                } else {
                    throw new Error('API响应格式错误，缺少RequestId');
                }
            } catch (apiError) {
                console.error('调用多图转视频API失败:', apiError);
                
                // 创建模拟任务ID作为降级方案
                taskId = `mock-task-${Date.now()}`;
                console.log(`[降级] 创建模拟任务ID: ${taskId}`);
                
                // 将任务信息保存到内存缓存
                global.taskCache = global.taskCache || {};
                global.taskCache[taskId] = {
                    createdAt: Date.now(),
                    params: requestData,
                    status: 'PENDING',
                    errorInfo: {
                        message: apiError.message || '调用API失败',
                        code: apiError.code || 'API_ERROR',
                        details: apiError.data || {}
                    }
                };
            }
        } else {
            // 本地测试模式
            taskId = `mock-task-${Date.now()}`;
            console.log(`[测试模式] 创建模拟任务ID: ${taskId}`);
            
            // 将任务数据保存到内存临时存储
            global.taskCache = global.taskCache || {};
            global.taskCache[taskId] = {
                createdAt: Date.now(),
                params: requestData,
                status: 'PENDING'
            };
        }
        
        // 返回任务ID给前端
        return res.json({
            success: true,
            taskId: taskId,
            message: '任务提交成功，正在处理中'
        });
        
    } catch (error) {
        console.error('多图转视频API错误:', error);
        res.status(500).json({
            success: false,
            message: error.message || '服务器内部错误',
            path: '/api/multi-image-to-video'
        });
    }
});

// 任务状态查询API
app.get('/api/task-status/:taskId', protect, async (req, res) => {
    try {
        const { taskId } = req.params;
        
        if (!taskId) {
            return res.status(400).json({ success: false, message: '缺少任务ID' });
        }
        
        console.log(`查询任务状态, taskId: ${taskId}`);
        
        // 检查是否是模拟任务ID
        if (taskId.startsWith('mock-task-')) {
            // 从内存缓存中获取任务信息
            const taskInfo = global.taskCache && global.taskCache[taskId];
            
            if (!taskInfo) {
                return res.status(404).json({
                    success: false,
                    message: '任务不存在'
                });
            }
            
            // 模拟任务处理时间
            const elapsedTime = (Date.now() - taskInfo.createdAt) / 1000; // 经过的秒数
            
            let status, videoUrl;
            
            if (elapsedTime < 10) {
                // 10秒内显示为等待中
                status = 'PENDING';
            } else if (elapsedTime < 30) {
                // 10-30秒显示为处理中
                status = 'RUNNING';
                // 更新任务状态
                taskInfo.status = status;
            } else {
                // 30秒后显示为完成
                status = 'SUCCEEDED';
                // 更新任务状态
                taskInfo.status = status;
                
                // 生成一个示例视频URL
                if (!taskInfo.videoUrl) {
                    // 实际项目中这应该是真实的视频URL
                    videoUrl = '/uploads/sample-output.mp4';
                    taskInfo.videoUrl = videoUrl;
                } else {
                    videoUrl = taskInfo.videoUrl;
                }
            }
            
            // 如果有错误信息，在PENDING阶段后直接返回失败
            if (taskInfo.errorInfo && elapsedTime >= 10) {
                return res.json({
                    success: false,
                    status: 'failed',
                    message: taskInfo.errorInfo.message || '处理失败',
                    code: taskInfo.errorInfo.code || 'ERROR',
                    requestId: `mock-req-${Date.now()}`
                });
            }
            
            return res.json({
                success: true,
                status: status === 'SUCCEEDED' ? 'completed' : status === 'RUNNING' ? 'processing' : 'pending',
                message: `任务${status === 'SUCCEEDED' ? '已完成' : status === 'RUNNING' ? '处理中' : '排队中'}`,
                videoUrl: status === 'SUCCEEDED' ? videoUrl : null,
                requestId: `mock-req-${Date.now()}`
            });
        }
        
        // 获取API密钥
        const apiKey = process.env.DASHSCOPE_API_KEY || '';
        if (!apiKey) {
            return res.status(500).json({ success: false, message: '服务器配置错误：缺少API密钥' });
        }
        
        // 检查是否有有效的API密钥，决定是使用真实调用还是模拟调用
        const isValidApiKey = apiKey && apiKey.length > 10 && apiKey !== 'default-api-key-replacement';
        
        if (isValidApiKey) {
            try {
                console.log('查询真实任务状态:', taskId);
                // 使用@alicloud/pop-core等SDK进行调用
                const Core = require('@alicloud/pop-core');
                
                // 创建POP Core客户端
                const client = new Core({
                    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
                    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
                    endpoint: 'https://videoenhan.cn-shanghai.aliyuncs.com',
                    apiVersion: '2020-03-20'
                });
                
                // 查询任务状态API
                const response = await client.request('GetAsyncJobResult', {
                    JobId: taskId
                }, {
                    method: 'GET'
                });
                
                console.log('任务状态API响应:', JSON.stringify(response, null, 2));
                
                // 解析任务状态
                if (response && response.Data) {
                    const jobData = response.Data;
                    const status = jobData.Status;
                    
                    // 根据任务状态返回对应信息
                    if (status === 'PROCESS_SUCCESS') {
                        // 任务成功，解析结果JSON
                        let result = {};
                        try {
                            if (typeof jobData.Result === 'string') {
                                result = JSON.parse(jobData.Result);
                            } else {
                                result = jobData.Result;
                            }
                        } catch (e) {
                            console.error('解析任务结果错误:', e);
                            result = { VideoUrl: null };
                        }
                        
                        // 如果生成的视频需要保存到本地，可以下载到服务器
                        if (result.VideoUrl) {
                            try {
                                // 创建目录确保存在
                                const uploadDir = path.join(__dirname, 'uploads', 'multi-image-videos');
                                if (!fs.existsSync(uploadDir)) {
                                    fs.mkdirSync(uploadDir, { recursive: true });
                                }
                                
                                // 可以选择下载视频到本地服务器（可选步骤）
                                // 这里仅记录，不实际下载
                                console.log('视频生成完成，URL:', result.VideoUrl);
                            } catch (saveError) {
                                console.error('保存视频错误:', saveError);
                            }
                        }
                        
                        return res.json({
                            success: true,
                            status: 'completed',
                            videoUrl: result.VideoUrl || null,
                            videoCoverUrl: result.VideoCoverUrl || null
                        });
                    } else if (status === 'PROCESS_FAILED') {
                        // 任务失败
                        return res.json({
                            success: false,
                            status: 'failed',
                            message: '视频生成失败'
                        });
                    } else {
                        // 任务正在处理中
                        return res.json({
                            success: true,
                            status: 'processing',
                            message: '任务正在处理中'
                        });
                    }
                } else {
                    throw new Error('API响应格式错误');
                }
            } catch (apiError) {
                console.error('查询任务状态失败:', apiError);
                
                return res.status(500).json({
                    success: false,
                    status: 'failed',
                    message: '查询任务状态失败: ' + (apiError.message || '未知错误')
                });
            }
        } else {
            // 本地测试模式，返回模拟结果
            console.log('[测试模式] 返回模拟的任务状态信息');
            
            return res.json({
                success: false,
                status: 'failed',
                message: '系统尚未完成阿里云API的实际对接，请联系管理员'
            });
        }
        
    } catch (error) {
        console.error('查询任务状态API错误:', error);
        res.status(500).json({
            success: false,
            message: error.message || '服务器内部错误'
        });
    }
});

// 添加下载中心路由
app.use('/api/downloads', downloadsRoutes);
// 添加上传图片路由 - 直接使用textToVideo路由中的上传图片处理函数
app.use('/api/upload-image', require('./routes/textToVideo').uploadImageRoute);
// 添加服饰分割路由
app.use('/api/cloth-segmentation', clothingSegmentationRoutes);
// 添加全局风格化路由
app.use('/api/global-style', globalStyleRoutes);
// 添加亚马逊Listing路由
app.use('/api/amazon-listing', amazonListingRoutes);

// 在路由配置部分的开始处添加数字人视频处理路由

// 静态文件服务 - 这应该在代理之前，确保静态文件优先
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// 添加根目录的HTML文件访问支持
app.use(express.static(path.join(__dirname)));

// 添加日志中间件，记录所有请求路径
app.use((req, res, next) => {
  console.log(`接收请求: ${req.method} ${req.url}`);
  const originalSend = res.send;
  res.send = function(data) {
    console.log(`响应请求: ${req.method} ${req.url} - 状态: ${res.statusCode}`);
    return originalSend.call(this, data);
  };
  next();
});

// 添加用户认证路由
app.use('/api/auth', authRoutes);
app.use('/api/credits', creditsRoutes);
app.use('/api/admin', adminRoutes);
// 添加文生视频路由
app.use('/api/text-to-video', textToVideoRoutes);
// 添加图像编辑路由
app.use('/api/image-edit', imageEditRoutes);
// 添加文生图片路由
app.use('/api/text-to-image', textToImageRoutes);

// 添加日志中间件，记录所有请求路径
app.use((req, res, next) => {
  console.log(`接收请求: ${req.method} ${req.url}`);
  const originalSend = res.send;
  res.send = function(data) {
    console.log(`响应请求: ${req.method} ${req.url} - 状态: ${res.statusCode}`);
    return originalSend.call(this, data);
  };
  next();
});

// 注册视频数字人API路由 - 确保这个路由在其他API路由之前注册
// 使用已定义在文件底部的配置和处理函数
app.post('/api/digital-human/upload', protect, (req, res, next) => {
  // 检查功能访问权限
  const { checkFeatureAccess } = require('./middleware/featureAccess');
  const featureAccessMiddleware = checkFeatureAccess('DIGITAL_HUMAN_VIDEO');
  
  // 使用自定义中间件执行功能访问检查
  featureAccessMiddleware(req, res, (err) => {
    if (err) {
      console.error('功能访问检查失败:', err);
      return res.status(500).json({
        success: false,
        message: '功能访问检查失败: ' + err.message
      });
    }
    // 继续处理请求
    next();
  });
}, (req, res, next) => {
  console.log('进入数字人视频上传路由 - 预处理');
  try {
    if (!digitalHumanUpload) {
      console.error('digitalHumanUpload未定义，检查配置是否正确加载');
      return res.status(500).json({
        success: false,
        message: '服务器配置错误'
      });
    }
    
    digitalHumanUpload.fields([
      { name: 'video', maxCount: 1 },
      { name: 'audio', maxCount: 1 },
      { name: 'image', maxCount: 1 }
    ])(req, res, (err) => {
      if (err) {
        console.error('文件上传中间件错误:', err);
        return res.status(400).json({
          success: false,
          message: '文件上传失败: ' + (err.message || '未知错误')
        });
      }
      next();
    });
  } catch (error) {
    console.error('数字人视频上传路由预处理错误:', error);
    return res.status(500).json({
      success: false,
      message: '服务器处理错误: ' + error.message
    });
  }
}, async (req, res) => {
  console.log('接收到数字人视频上传请求', req.files ? Object.keys(req.files).length : '无文件');
  
  try {
    // 检查是否上传了必要的文件
    if (!req.files || !req.files.video || !req.files.audio) {
      return res.status(400).json({
        success: false,
        message: '请上传视频和音频文件'
      });
    }

    const videoFile = req.files.video[0];
    const audioFile = req.files.audio[0];
    const imageFile = req.files.image ? req.files.image[0] : null;
    
    console.log('收到数字人视频请求，上传文件信息：', {
      video: videoFile.filename,
      audio: audioFile.filename,
      image: imageFile ? imageFile.filename : '无参考图片'
    });

    // 创建上传目录（如果不存在）
    const uploadDir = path.join(__dirname, 'uploads', 'digital-human');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    try {
      // 上传文件到阿里云OSS
      console.log('开始上传视频到OSS...');
      const videoUrl = await uploadFileToOSS(videoFile, 'digital-human/videos');
      console.log('开始上传音频到OSS...');
      const audioUrl = await uploadFileToOSS(audioFile, 'digital-human/audios');
      
      let imageUrl = null;
      if (imageFile) {
        console.log('开始上传图片到OSS...');
        imageUrl = await uploadFileToOSS(imageFile, 'digital-human/images');
      }

      console.log('文件上传到OSS成功，URL:', {
        videoUrl: videoUrl,
        audioUrl: audioUrl,
        imageUrl: imageUrl
      });

      // 调用VideoRetalk API创建任务
      console.log('开始创建VideoRetalk任务...');
      // 从请求参数中获取是否需要扩展视频
      const videoExtension = req.body.videoExtension === 'true' || req.body.videoExtension === true;
      
      try {
        const taskId = await createVideoRetalkTask(videoUrl, audioUrl, imageUrl, videoExtension);
        console.log('VideoRetalk任务创建成功, 任务ID:', taskId);
        
        // 存储任务信息（包含用户ID）以便后续扣除积分
        if (req.user && req.user.id) {
          // 使用内存或数据库存储任务与用户关联
          if (!global.digitalHumanTasks) {
            global.digitalHumanTasks = {};
          }
          
          global.digitalHumanTasks[taskId] = {
            userId: req.user.id,
            hasChargedCredits: false, // 标记是否已扣除积分
            createdAt: new Date()
          };
          
          console.log(`已关联任务ID ${taskId} 到用户ID ${req.user.id}`);
        }
        
        // 返回任务ID
        return res.status(200).json({
          success: true,
          taskId: taskId,
          message: '任务已提交，请使用任务ID查询处理状态'
        });
      } catch (apiError) {
        console.error('创建VideoRetalk任务失败:', apiError);
        return res.status(500).json({
          success: false,
          message: '创建任务失败: ' + (apiError.message || '未知错误'),
          // 保留已上传的文件URL，以便前端可以重试
          urls: {
            videoUrl: videoUrl,
            audioUrl: audioUrl,
            imageUrl: imageUrl
          }
        });
      }
    } catch (uploadError) {
      console.error('文件上传到OSS失败:', uploadError);
      return res.status(500).json({
        success: false,
        message: '文件上传失败: ' + uploadError.message
      });
    }
  } catch (error) {
    console.error('数字人视频处理失败:', error);
    return res.status(500).json({
      success: false,
      message: '处理失败: ' + error.message
    });
  }
});

// 查询VideoRetalk任务状态
app.get('/api/digital-human/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    console.log('查询任务状态:', taskId);
    
    // 检查是否为mock任务ID
    if (taskId.startsWith('mock-task-')) {
      const timestamp = parseInt(taskId.split('-').pop());
      const elapsedSeconds = (Date.now() - timestamp) / 1000;
      
      // 模拟不同阶段的任务状态
      let status = 'PENDING';
      if (elapsedSeconds > 5 && elapsedSeconds <= 15) {
        status = 'RUNNING';
      } else if (elapsedSeconds > 15) {
        status = 'SUCCEEDED';
      }
      
      // 模拟响应
      const response = {
        success: true,
        status: status,
        message: status === 'SUCCEEDED' ? '处理完成' : '处理中',
        requestId: `mock-request-${Date.now()}`
      };
      
      // 如果任务完成，提供一个示例视频URL
      if (status === 'SUCCEEDED') {
        response.videoUrl = 'http://localhost:8080/uploads/sample-output.mp4'; 
      }
      
      console.log('返回模拟任务状态:', response);
      return res.json(response);
    }
    
    // 如果不是mock ID，调用真实API
    const status = await checkVideoRetalkTaskStatus(taskId);
    
    // 如果任务成功完成且有视频URL，计算并扣除积分
    if (status.status === 'SUCCEEDED' && status.videoUrl) {
      try {
        // 检查是否需要扣除积分
        if (global.digitalHumanTasks && 
            global.digitalHumanTasks[taskId] && 
            !global.digitalHumanTasks[taskId].hasChargedCredits) {
          
          const taskInfo = global.digitalHumanTasks[taskId];
          const userId = taskInfo.userId;
          
          if (userId) {
            console.log(`开始为任务 ${taskId} (用户ID: ${userId}) 计算积分消耗`);
            
            // 获取视频时长 - 优先使用API返回的时长信息
            let videoDuration = 0;
            
            // 记录调试信息
            console.log('完整响应状态数据:', JSON.stringify(status, null, 2));
            
            if (status.videoDuration && !isNaN(parseFloat(status.videoDuration))) {
              // 使用API直接返回的视频时长
              videoDuration = Math.ceil(parseFloat(status.videoDuration));
              console.log(`使用API返回的视频时长: ${videoDuration}秒`);
            } else {
              // 如果API没有返回时长，再调用getVideoDuration
              try {
                videoDuration = await getVideoDuration(status.videoUrl);
                console.log(`通过getVideoDuration函数获取视频时长: ${videoDuration}秒`);
              } catch (durationError) {
                console.error('获取视频时长失败:', durationError);
                // 使用一个较小的默认值
                videoDuration = 2; // 使用最小值2秒，避免过度收费
                console.log(`无法获取准确时长，使用最小默认值: ${videoDuration}秒`);
              }
            }
            
            if (videoDuration > 0) {
              // 查找用户并扣除积分
              const user = await User.findByPk(userId);
              if (user) {
                // 获取功能配置
                const { FEATURES } = require('./middleware/featureAccess');
                const featureConfig = FEATURES['DIGITAL_HUMAN_VIDEO'];
                
                // 计算积分消耗
                const creditCost = featureConfig.creditCost(videoDuration);
                console.log(`根据生成视频时长 ${videoDuration}秒，计算积分消耗: ${creditCost}`);
                
                // 记录当前用户积分
                console.log(`用户当前积分: ${user.credits}`);
                
                if (user.credits >= creditCost) {
                  // 扣除积分
                  user.credits -= creditCost;
                  await user.save();
                  console.log(`已从用户ID ${userId} 扣除 ${creditCost} 积分，剩余积分: ${user.credits}`);
                  
                  // 记录功能使用
                  await FeatureUsage.create({
                    userId: userId,
                    featureName: 'DIGITAL_HUMAN_VIDEO',
                    creditsUsed: creditCost,
                    details: JSON.stringify({
                      taskId: taskId,
                      videoDuration: videoDuration,
                      timestamp: new Date()
                    })
                  });
                  
                  // 标记为已扣除积分
                  global.digitalHumanTasks[taskId].hasChargedCredits = true;
                } else {
                  console.log(`用户积分不足，需要 ${creditCost}，当前有 ${user.credits}`);
                  // 可以选择在这里处理积分不足的情况
                }
              }
            }
          }
        }
      } catch (creditError) {
        console.error('处理积分扣除失败，但不影响正常响应:', creditError);
      }
    }
    
    return res.status(200).json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('查询数字人视频任务状态失败:', error);
    return res.status(500).json({
      success: false,
      message: '查询失败: ' + error.message
    });
  }
});

/**
 * 获取视频时长
 * @param {String} videoUrl - 视频URL
 * @returns {Promise<number>} 视频时长（秒）
 */
async function getVideoDuration(videoUrl) {
  try {
    console.log('尝试获取视频时长:', videoUrl);
    
    // 如果是本地测试环境或示例视频
    if (videoUrl.includes('localhost') || videoUrl.includes('sample-output.mp4')) {
      // 使用合理的随机时长，而不是固定值
      const randomDuration = Math.floor(Math.random() * 20) + 5; // 5-25秒的随机时长
      console.log(`本地测试环境，使用随机时长: ${randomDuration}秒`);
      return randomDuration;
    }
    
    // 对于阿里云视频，尝试从URL查询参数中获取时长信息
    try {
      const url = new URL(videoUrl);
      const durationParam = url.searchParams.get('duration');
      if (durationParam && !isNaN(parseInt(durationParam))) {
        const duration = parseInt(durationParam);
        console.log(`从URL参数获取到视频时长: ${duration}秒`);
        return duration;
      }
    } catch (urlError) {
      console.log('URL解析失败，无法从查询参数获取时长');
    }
    
    // 尝试向OSS发送HEAD请求获取Content-Length和其他元数据
    // 这里仅为示例，实际中可能需要更复杂的逻辑
    try {
      const axios = require('axios');
      const headResponse = await axios.head(videoUrl, {
        timeout: 5000 // 5秒超时
      });
      
      // 如果响应头中包含视频时长信息
      if (headResponse.headers['x-oss-meta-duration']) {
        const duration = parseFloat(headResponse.headers['x-oss-meta-duration']);
        console.log(`从OSS元数据获取到视频时长: ${duration}秒`);
        return Math.ceil(duration);
      }
      
      // 如果有Content-Length，尝试根据文件大小和典型比特率估算时长
      if (headResponse.headers['content-length']) {
        const fileSize = parseInt(headResponse.headers['content-length']);
        // 假设平均比特率为1Mbps (1,000,000 bits per second = 125,000 bytes per second)
        const estimatedDuration = Math.ceil(fileSize / 125000);
        console.log(`根据文件大小估算视频时长: ${estimatedDuration}秒`);
        return estimatedDuration;
      }
    } catch (headError) {
      console.log('HEAD请求失败，无法获取视频元数据:', headError.message);
    }
    
    // 针对阿里云DashScope生成的视频，尝试从URL路径提取信息
    if (videoUrl.includes('dashscope') || videoUrl.includes('aliyuncs.com')) {
      // 通常生成的视频时长在5-30秒之间，使用一个合理的估计值
      // 使用时间戳或视频URL的特定部分来生成一个伪随机但一致的时长
      const urlHash = videoUrl.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const estimatedDuration = (urlHash % 26) + 5; // 5-30秒范围内的值
      console.log(`阿里云视频，估算时长: ${estimatedDuration}秒`);
      return estimatedDuration;
    }
    
    // 如果以上方法都失败，使用一个更合理的默认值
    // 但记录警告，以便后续改进
    console.warn('无法确定视频实际时长，使用预估值10秒');
    return 10; // 使用更小的默认值，避免过度收费
  } catch (error) {
    console.error('获取视频时长失败:', error);
    // 发生错误时，使用较小的默认值
    return 10; // 使用更小的默认值，避免过度收费
  }
}

// 获取用户积分的API端点
app.get('/api/user/credits', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId, {
      attributes: ['credits']
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    res.json({
      success: true,
      credits: user.credits
    });
  } catch (error) {
    console.error('获取用户积分失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

// 虚拟模特试穿功能 - 直接嵌入iframe编辑器
app.get('/virtual-model', async (req, res) => {
  try {
    let userId = "guest"; // 默认访客ID
    
    // 从认证token中获取用户ID
    if (req.headers.authorization) {
      const token = req.headers.authorization.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded && decoded.id) {
          userId = decoded.id;
        }
      } catch (error) {
        console.error('解析token失败:', error.message);
      }
    } else {
      // 尝试从cookie中获取
      const token = req.cookies && req.cookies.authToken;
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          if (decoded && decoded.id) {
            userId = decoded.id;
          }
        } catch (error) {
          console.error('解析cookie token失败:', error.message);
        }
      }
    }
    
    // 检查用户积分
    let checkFeature = true;
    if (userId !== "guest") {
      try {
        const user = await User.findByPk(userId);
        if (user) {
          // 获取功能配置
          const featureConfig = FEATURES['virtual-model'] || { creditCost: 10, freeUsage: 3 };
          
          // 检查是否有足够的免费使用次数或积分
          const usageCount = user.featureUsage && user.featureUsage['virtual-model'] ? user.featureUsage['virtual-model'] : 0;
          
          if (usageCount < featureConfig.freeUsage || user.credits >= featureConfig.creditCost) {
            checkFeature = true;
          } else {
            checkFeature = false;
          }
        }
      } catch (error) {
        console.error('检查用户积分失败:', error);
      }
    }
    
    if (!checkFeature) {
      // 如果积分不足，重定向到积分页面
      return res.redirect('/credits.html?feature=virtual-model');
    }
    
    // 现在，我们不再直接渲染HTML，而是重定向到静态HTML页面
    // 这样可以避免iframe加载问题，使用我们优化过的HTML页面
    console.log('重定向到virtual-model-redirect.html');
    return res.redirect('/virtual-model-redirect.html');
    
  } catch (error) {
    console.error('构建编辑器页面失败:', error);
    // 如果出错，发送一个简单的错误页面
    res.status(500).send(`
      <html>
        <head><title>错误</title></head>
        <body>
          <h1>加载编辑器时出错</h1>
          <p>${error.message}</p>
          <a href="/">返回首页</a>
        </body>
      </html>
    `);
  }
});

// 受保护的API路由示例 - 需要登录才能访问
app.get('/api/protected', protect, (req, res) => {
  res.json({
    success: true,
    message: '这是受保护的路由，只有登录用户才能访问',
    user: req.user
  });
});

// 应用代理到特定API路径
app.use('/editor', editorProxy);
app.use('/editor-proxy', editorProxy);
app.use('/rest', editorProxy);
app.use('/api/rest', editorProxy);

// 处理编辑器路径上的其他请求，但确保静态文件优先
app.use('/editor/*', editorProxy);
app.use('/*.html', (req, res, next) => {
  // 如果是已知的静态HTML文件，则跳过代理
  const requestPath = req.path;
  const htmlPath = path.join(__dirname, 'public', requestPath);
  if (fs.existsSync(htmlPath)) {
    return next();
  }
  // 否则交给代理处理
  editorProxy(req, res, next);
});

// 添加阿里云OSS代理中间件
const ossResourcesProxy = createProxyMiddleware({
  target: 'https://aidge-fe.oss-ap-southeast-1.aliyuncs.com',
  changeOrigin: true,
  secure: false,
  onProxyRes: function(proxyRes, req, res) {
    // 删除可能导致CORS问题的响应头
    delete proxyRes.headers['content-security-policy'];
    delete proxyRes.headers['x-frame-options'];
    
    // 修改响应头处理跨域
    proxyRes.headers['access-control-allow-origin'] = '*';
    proxyRes.headers['access-control-allow-methods'] = 'GET, OPTIONS';
    
    // 添加缓存控制以提高性能
    proxyRes.headers['cache-control'] = 'public, max-age=86400';
    
    console.log(`OSS资源代理: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
  },
  onError: function(err, req, res) {
    console.error('OSS资源代理错误:', err);
    res.status(502).send('代理服务器错误: ' + err.message);
  }
});

// 应用OSS资源代理
app.use('/oss-resources', ossResourcesProxy);

// 创建阿里云CDN资源的代理中间件
const aliyunCdnProxy = createProxyMiddleware({
  target: 'https://aliyun-cdn.aidc-ai.com',
  changeOrigin: true,
  pathRewrite: {
    '^/aliyun-cdn': ''
  },
  onProxyRes: function(proxyRes, req, res) {
    // 设置CORS头
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    // 删除可能导致CORS问题的头
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['x-content-type-options'];
    delete proxyRes.headers['x-xss-protection'];
    delete proxyRes.headers['content-security-policy'];
    
    // 设置缓存控制
    if (req.url.match(/\.(ttf|woff|woff2|eot|svg|jpg|jpeg|png|gif|css|js)$/i)) {
      proxyRes.headers['Cache-Control'] = 'public, max-age=86400';
    }
    
    // 记录代理请求
    console.log(`[Aliyun CDN Proxy] ${req.method} ${req.url}`);
  },
  logLevel: 'silent'
});

// 只为特定路径启用CORS
app.use('/virtual-model-proxy', (req, res, next) => {
  // 设置允许跨域访问的域名，*表示允许任何域名
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 设置允许的请求方法
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  // 设置允许的请求头
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
  // 设置预检请求的缓存时间
  res.setHeader('Access-Control-Max-Age', '1728000');
  // 允许发送Cookie
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // 对OPTIONS请求直接返回200
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// 应用虚拟模特编辑器代理 - 注释掉，不使用代理
// app.use('/virtual-model-proxy', virtualModelEditorProxy);

// 应用阿里云CDN代理
app.use('/aliyun-cdn', aliyunCdnProxy);

// 创建阿里云OSS字体资源的代理中间件
const aliyunOssFontProxy = createProxyMiddleware({
  target: 'https://aidge-fe.oss-ap-southeast-1.aliyuncs.com',
  changeOrigin: true,
  pathRewrite: {
    '^/fonts': '/fonts'
  },
  onProxyRes: function(proxyRes, req, res) {
    // 删除所有可能导致CORS问题的响应头
    delete proxyRes.headers['content-security-policy'];
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['x-content-type-options'];
    
    // 设置CORS头允许所有来源
    proxyRes.headers['access-control-allow-origin'] = '*';
    proxyRes.headers['access-control-allow-methods'] = 'GET, OPTIONS';
    
    // 为字体文件设置缓存
    if (req.url.match(/\.(woff|woff2|ttf|eot)/i)) {
      proxyRes.headers['cache-control'] = 'public, max-age=604800';
    }
    
    console.log(`阿里云字体代理: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
  }
});

// 为fonts路径添加CORS中间件
app.use('/fonts', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// 应用阿里云OSS字体资源代理
app.use('/fonts', aliyunOssFontProxy);

/**
 * 将二进制数组转换为大写的十六进制字符串
 * 对标Java中的byte2hex方法
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
 * 对标Java中的encryptHMACSHA256方法
 */
function encryptHMACSHA256(data, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data, 'utf8');
  return hmac.digest();
}

/**
 * 签名API请求
 * 对标Java中的signApiRequest方法
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
  if (signMethod === SIGN_METHOD_SHA256) {
    bytes = encryptHMACSHA256(query, appSecret);
  }
  
  // 第五步：把二进制转化为大写的十六进制
  return byte2hex(bytes);
}

/**
 * 获取签名响应
 * 对标Java中的getSignResponse方法
 */
function getSignResponse(params, api) {
  try {
    const time = Date.now();
    const signParams = { ...params };
    
    signParams.app_key = APP_KEY;
    signParams.sign_method = SIGN_METHOD_SHA256;
    signParams.timestamp = String(time);
    
    const signStr = signApiRequest(signParams, SECRET_KEY, SIGN_METHOD_SHA256, api);
    
    return {
      signStr: signStr,
      appKey: APP_KEY,
      targetAppKey: APP_KEY,
      signMethod: SIGN_METHOD_SHA256,
      timestamp: time
    };
  } catch (error) {
    console.error('Generate sign error:', error);
    return null;
  }
}

// 签名API - 使用文档要求的路径/open/api/signature
app.post('/open/api/signature', (req, res) => {
  try {
    console.log('接收签名请求:', JSON.stringify(req.body, null, 2));
    const { api, params } = req.body;
    
    // 验证入参格式
    if (!api) {
      console.error('入参错误: 缺少api字段');
      return res.status(400).json({
        code: 400,
        message: "缺少api字段",
        success: false,
        requestId: Date.now().toString(),
        data: null,
        result: null
      });
    }
    
    if (!params) {
      console.error('入参错误: 缺少params字段');
      return res.status(400).json({
        code: 400,
        message: "缺少params字段",
        success: false,
        requestId: Date.now().toString(),
        data: null,
        result: null
      });
    }
    
    console.log(`✅ 入参格式正确: api=${api}, params包含${Object.keys(params).length}个参数`);
    
    // 使用新的签名方法
    const signData = getSignResponse(params, api);
    
    if (!signData) {
      throw new Error('生成签名失败');
    }
    
    // 构造符合要求的返回结果
    const result = {
      code: 200,
      message: "",
      success: true,
      requestId: signData.timestamp.toString() + Math.floor(Math.random() * 1000).toString(),
      data: signData,
      result: null
    };
    
    console.log('签名结果:', JSON.stringify(result, null, 2));
    res.json(result);
  } catch (error) {
    console.error('生成签名失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message,
      success: false,
      requestId: Date.now().toString(),
      data: null,
      result: null
    });
  }
});

// 同时支持新的/api/signature路径
app.post('/api/signature', (req, res) => {
  try {
    console.log('接收签名请求(新路径):', JSON.stringify(req.body, null, 2));
    const { api, params } = req.body;
    
    // 验证入参格式
    if (!api) {
      console.error('入参错误: 缺少api字段');
      return res.status(400).json({
        code: 400,
        message: "缺少api字段",
        success: false,
        requestId: Date.now().toString(),
        data: null,
        result: null
      });
    }
    
    if (!params) {
      console.error('入参错误: 缺少params字段');
      return res.status(400).json({
        code: 400,
        message: "缺少params字段",
        success: false,
        requestId: Date.now().toString(),
        data: null,
        result: null
      });
    }
    
    console.log(`✅ 入参格式正确: api=${api}, params包含${Object.keys(params).length}个参数`);
    
    // 使用新的签名方法
    const signData = getSignResponse(params, api);
    
    if (!signData) {
      throw new Error('生成签名失败');
    }
    
    // 构造符合要求的返回结果
    const result = {
      code: 200,
      message: "",
      success: true,
      requestId: signData.timestamp.toString() + Math.floor(Math.random() * 1000).toString(),
      data: signData,
      result: null
    };
    
    console.log('签名结果(新路径):', JSON.stringify(result, null, 2));
    res.json(result);
  } catch (error) {
    console.error('生成签名失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message,
      success: false,
      requestId: Date.now().toString(),
      data: null,
      result: null
    });
  }
});

// 图片上传接口
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '未上传图片' });
  }
  
  const protocol = req.protocol;
  const host = req.get('host');
  const imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
  
  console.log('图片已上传:', imageUrl);
  res.json({ imageUrl });
});

// 保存结果API
app.post('/api/save-result', async (req, res) => {
  try {
    console.log('接收到保存结果请求:', req.body);
    const resultData = req.body;
    const timestamp = Date.now();
    
    // 验证关键字段
    if (!resultData.processedImageUrl) {
      console.error('保存失败：缺少处理后图片URL');
      return res.status(400).json({ 
        success: false, 
        error: '保存失败', 
        message: '缺少处理后图片URL'
      });
    }
    
    // 从请求中获取用户信息（如果已登录）
    let userId = null;
    if (req.headers.authorization) {
      const token = req.headers.authorization.split(' ')[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          userId = decoded.id;
          console.log('用户已验证:', userId);
        } catch (error) {
          console.log('Token验证失败，以匿名用户保存', error.message);
        }
      }
    }
    
    // 保存到数据库
    console.log('准备保存到数据库，数据:', {
      userId: userId,
      processType: resultData.processType,
      originalImageUrl: resultData.originalImageUrl ? resultData.originalImageUrl.substring(0, 50) + '...' : null,
      processedImageUrl: resultData.processedImageUrl.substring(0, 50) + '...'
    });
    
    const imageHistory = await ImageHistory.create({
      userId: userId,
      originalImageUrl: resultData.originalImageUrl,
      processedImageUrl: resultData.processedImageUrl,
      imageUrl: resultData.processedImageUrl,
      processType: resultData.processType || '图片处理',
      processTime: resultData.processTime || new Date(),
      description: resultData.description,
      metadata: resultData.metadata || {}
    });
    
    console.log('保存图片历史记录成功:', imageHistory.id);
    
    // 同时保存到JSON文件作为备份
    const resultsDir = path.join(__dirname, 'results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    const resultFile = path.join(resultsDir, `result-${timestamp}.json`);
    fs.writeFileSync(resultFile, JSON.stringify({
      ...resultData,
      id: imageHistory.id,
      userId: userId,
      saveTime: new Date().toISOString()
    }, null, 2));
    
    console.log('保存到JSON文件成功:', resultFile);
    
    res.json({ 
      success: true, 
      timestamp,
      id: imageHistory.id 
    });
  } catch (error) {
    console.error('保存结果失败:', error);
    res.status(500).json({ error: '保存结果失败', message: error.message });
  }
});

// 获取历史结果API
app.get('/api/history', async (req, res) => {
  try {
    console.log('接收到获取历史记录请求');
    
    // 从请求中获取用户信息（如果已登录）
    let userId = null;
    if (req.headers.authorization) {
      const token = req.headers.authorization.split(' ')[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          userId = decoded.id;
          console.log('历史记录请求：用户已验证, ID:', userId);
        } catch (error) {
          console.log('Token验证失败，将返回所有公共历史记录', error.message);
        }
      }
    }
    
    console.log('历史记录请求：用户ID状态:', userId ? `已认证 (${userId})` : '匿名');
    
    // 查询条件
    const whereClause = {};
    
    // 如果用户已登录，返回该用户的记录
    if (userId) {
      whereClause.userId = userId;
    } else {
      // 否则返回公共记录（userId为空的记录）
      whereClause.userId = null;
    }
    
    console.log('查询条件:', whereClause);
    
    // 检查数据库连接
    try {
      await sequelize.authenticate();
      console.log('数据库连接正常');
    } catch (dbError) {
      console.error('数据库连接错误:', dbError);
      return res.status(500).json({ 
        success: false, 
        error: '数据库连接错误', 
        message: '无法连接到数据库，请稍后再试' 
      });
    }
    
    // 查询数据库
    const records = await ImageHistory.findAll({
      where: whereClause,
      order: [['processTime', 'DESC']],
      limit: 50
    });
    
    console.log(`查询成功，找到 ${records.length} 条记录`);
    
    // 检查每条记录的有效性
    const validRecords = records.map(record => {
      const data = record.toJSON();
      // 确保关键字段存在
      if (!data.processedImageUrl) {
        console.warn(`记录 ${data.id} 缺少处理后图片URL`);
      }
      return data;
    });
    
    res.json({ 
      success: true,
      results: validRecords,
      count: validRecords.length
    });
  } catch (error) {
    console.error('获取历史记录失败:', error);
    res.status(500).json({ 
      success: false, 
      error: '获取历史记录失败', 
      message: error.message 
    });
  }
});

// 删除单个历史记录API
app.delete('/api/delete-image/:id', async (req, res) => {
  try {
    const imageId = req.params.id;
    
    // 从请求中获取用户信息（如果已登录）
    let userId = null;
    if (req.headers.authorization) {
      const token = req.headers.authorization.split(' ')[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          userId = decoded.id;
        } catch (error) {
          console.log('Token验证失败，将作为公共记录处理', error.message);
        }
      }
    }
    
    // 查找记录
    const imageRecord = await ImageHistory.findByPk(imageId);
    
    if (!imageRecord) {
      return res.status(404).json({ 
        success: false, 
        message: '图片记录不存在' 
      });
    }
    
    // 检查权限（如果是用户的记录，需要验证用户ID匹配）
    if (imageRecord.userId !== null && imageRecord.userId !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: '无权删除此图片记录' 
      });
    }
    
    // 删除记录
    await imageRecord.destroy();
    
    // 如果有对应的文件，尝试删除文件（可选）
    try {
      const resultFile = path.join(__dirname, 'results', `result-*.json`);
      // 查找可能的结果文件并删除（这里简化处理，实际应用中可能需要更精确的匹配）
      // const files = glob.sync(resultFile);
      // files.forEach(file => {
      //   const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      //   if (data.id === parseInt(imageId)) {
      //     fs.unlinkSync(file);
      //   }
      // });
    } catch (fileError) {
      console.error('删除文件失败:', fileError);
    }
    
    res.json({ 
      success: true, 
      message: '成功删除图片记录'
    });
  } catch (error) {
    console.error('删除图片记录失败:', error);
    res.status(500).json({ 
      success: false, 
      error: '删除图片记录失败', 
      message: error.message 
    });
  }
});

// 批量删除历史记录API
app.post('/api/delete-images', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: '无效的请求参数，缺少有效的图片ID列表' 
      });
    }
    
    // 从请求中获取用户信息（如果已登录）
    let userId = null;
    if (req.headers.authorization) {
      const token = req.headers.authorization.split(' ')[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          userId = decoded.id;
        } catch (error) {
          console.log('Token验证失败，将作为公共记录处理', error.message);
        }
      }
    }
    
    // 查询条件 - 仅删除用户有权限删除的记录
    const whereClause = {
      id: ids
    };
    
    // 如果用户已登录，只允许删除自己的或公共记录
    if (userId) {
      whereClause.userId = [userId, null];
    } else {
      // 未登录用户只能删除公共记录
      whereClause.userId = null;
    }
    
    // 执行批量删除
    const result = await ImageHistory.destroy({
      where: whereClause
    });
    
    res.json({ 
      success: true, 
      message: `成功删除${result}条图片记录`,
      deletedCount: result
    });
  } catch (error) {
    console.error('批量删除图片记录失败:', error);
    res.status(500).json({ 
      success: false, 
      error: '批量删除图片记录失败', 
      message: error.message 
    });
  }
});

// 添加API测试端点
app.get('/test-api-call', (req, res) => {
  try {
    // 准备API参数
    const apiDomain = 'cn-api.aidc-ai.com';
    const apiName = '/ai/image/cut/out'; // 以裁剪API为例
    const timestamp = Date.now();
    
    // 创建参数
    const params = {
      app_key: APP_KEY,
      sign_method: SIGN_METHOD_SHA256,
      timestamp: String(timestamp)
    };
    
    // 生成签名
    const sign = signApiRequest(params, SECRET_KEY, SIGN_METHOD_SHA256, apiName);
    
    // 构建API URL
    const apiUrl = `https://${apiDomain}/rest${apiName}?partner_id=aidge&sign_method=sha256&sign_ver=v2&app_key=${APP_KEY}&timestamp=${timestamp}&sign=${sign}`;
    
    // 构建请求数据
    const requestData = {
      imageUrl: "https://ae01.alicdn.com/kf/Sa78257f1d9a34dad8ee494178db12ec8l.jpg",
      backGroundType: "WHITE_BACKGROUND"
    };
    
    // 返回测试信息
    res.send(`
      <h1>API调用测试</h1>
      <p>以下是调用API的示例，您可以复制到命令行执行：</p>
      <pre>
curl -X POST '${apiUrl}' \\
--header 'Content-Type: application/json' \\
--header 'x-iop-trial: true' \\
--data '${JSON.stringify(requestData)}'
      </pre>
      
      <p>API信息:</p>
      <ul>
        <li>API域名: ${apiDomain}</li>
        <li>API路径: ${apiName}</li>
        <li>AppKey: ${APP_KEY}</li>
        <li>时间戳: ${timestamp}</li>
        <li>签名: ${sign}</li>
      </ul>
      
      <p>签名生成方法:</p>
      <pre>
// 1. 构造参数
const params = {
  app_key: "${APP_KEY}",
  sign_method: "${SIGN_METHOD_SHA256}",
  timestamp: "${timestamp}"
};

// 2. 构造签名字符串
let query = "${apiName}";
for (const key of Object.keys(params).sort()) {
  query += key + params[key];
}
// query = "${apiName}app_key${APP_KEY}sign_method${SIGN_METHOD_SHA256}timestamp${timestamp}"

// 3. HMAC-SHA256加密
const hmac = crypto.createHmac('sha256', "${SECRET_KEY}");
hmac.update(query);
const signature = hmac.digest();

// 4. 转成大写十六进制
const sign = byte2hex(signature);
// sign = "${sign}"
</pre>
      
      <p><strong>注意:</strong> 这只是一个演示。实际使用中，您需要从服务器端发起API请求，而不是从浏览器。</p>
    `);
  } catch (error) {
    console.error('生成API测试失败:', error);
    res.status(500).send('生成API测试失败: ' + error.message);
  }
});

// 添加API代理调用端点 - 实际调用API
app.post('/api/call-service', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: '缺少imageUrl参数' });
    }
    
    // 准备API参数
    const apiDomain = 'cn-api.aidc-ai.com';
    const apiName = '/ai/image/cut/out'; // 以裁剪API为例
    
    // 创建参数
    const params = {
      app_key: APP_KEY,
      sign_method: SIGN_METHOD_SHA256,
      timestamp: String(Date.now())
    };
    
    // 生成签名
    const sign = signApiRequest(params, SECRET_KEY, SIGN_METHOD_SHA256, apiName);
    
    // 构建API URL
    const apiUrl = `https://${apiDomain}/rest${apiName}?partner_id=aidge&sign_method=sha256&sign_ver=v2&app_key=${params.app_key}&timestamp=${params.timestamp}&sign=${sign}`;
    
    // 构建请求数据
    const requestData = {
      imageUrl: imageUrl,
      backGroundType: "WHITE_BACKGROUND"
    };
    
    console.log('调用API:', apiUrl);
    console.log('请求数据:', requestData);
    
    // 这里应该使用适当的HTTP客户端库发起请求
    // 例如node-fetch或axios
    // 为了简单演示，这里返回模拟数据
    res.json({
      success: true,
      message: '这是一个模拟的API调用响应。实际应用中，您需要使用node-fetch或axios等库发起HTTP请求到API服务器。',
      requestUrl: apiUrl,
      requestData: requestData
    });
  } catch (error) {
    console.error('API调用失败:', error);
    res.status(500).json({ error: 'API调用失败', message: error.message });
  }
});

// API路由 - 图像高清放大
app.post('/api/upscale', memoryUpload.single('image'), async (req, res) => {
  try {
    console.log('接收到图像高清放大请求');
    
    // 检查请求
    if (!req.file) {
      return res.status(400).json({ success: false, message: '没有上传图片' });
    }
    
    const upscaleFactor = parseInt(req.body.upscaleFactor) || 2;
    if (upscaleFactor < 2 || upscaleFactor > 4) {
      return res.status(400).json({ success: false, message: '放大倍数必须在2-4之间' });
    }
    
    // 读取上传的图片文件
    const imageBuffer = req.file.buffer;
    const originalName = req.file.originalname;
    
    console.log(`处理图片: ${originalName}, 放大倍数: ${upscaleFactor}`);
    
    try {
      // 1. 上传图片到OSS获取可公开访问的URL
      console.log('上传图片到OSS...');
      const imageUrl = await uploadToOSS(imageBuffer, originalName);
      
      // 2. 调用图像高清放大API
      console.log('调用图像高清放大API...');
      const apiResult = await callUpscaleApi(imageUrl, upscaleFactor);
      
      // 3. 返回处理结果
      console.log('图像处理成功');
      return res.json({
        success: true,
        imageUrl: apiResult.data.imageUrl,
        originalUrl: imageUrl,
        requestId: apiResult.requestId
      });
    } catch (error) {
      console.error('图像处理失败:', error);
      return res.status(500).json({ 
        success: false, 
        message: `图像处理失败: ${error.message}` 
      });
    }
  } catch (error) {
    console.error('处理图像高清放大请求出错:', error);
    return res.status(500).json({ 
      success: false, 
      message: '服务器内部错误' 
    });
  }
});

// 主页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 确保功能相关的上传目录存在
const ensureUploadDirs = () => {
  const dirs = [
    'uploads',
    'uploads/image-to-video',
    'uploads/digital-human',
    'uploads/multi-image-videos', // 添加多图转视频目录
    'uploads/style-videos',      // 添加视频风格重绘目录
    'public/uploads',
    'temp'
  ];
  
  for (const dir of dirs) {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`创建目录: ${dirPath}`);
    }
  }
  console.log('所有必要目录已创建');
};

// 确保上传目录存在
ensureUploadDirs();

// 添加翻译页面路由
app.get('/translate', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'translate.html'));
});

// 添加抠图页面路由
app.get('/cutout', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cutout.html'));
});

// 添加场景图生成页面路由
app.get('/scene-generator', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scene-generator.html'));
});

// 添加模特换肤页面路由
app.get('/model-skin-changer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'model-skin-changer.html'));
});

// 添加带.html后缀的模特换肤页面路由
app.get('/model-skin-changer.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'model-skin-changer.html'));
});

// 添加图像智能消除页面路由
app.get('/image-removal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'image-removal.html'));
});

// 添加带.html后缀的图像智能消除页面路由
app.get('/image-removal.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'image-removal.html'));
});

// 添加模拟试衣页面路由
app.get('/clothing-simulation', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'clothing-simulation.html'));
});

// 添加带.html后缀的模拟试衣页面路由
app.get('/clothing-simulation.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'clothing-simulation.html'));
});

// 功能访问检查示例 - 图像放大功能
app.post('/api/image-upscaler', protect, checkFeatureAccess('image-upscaler'), async (req, res) => {
  try {
    // 这里是实际的功能处理逻辑...
    
    // 返回功能使用情况
    res.json({
      success: true,
      message: '图像放大处理完成',
      usage: req.featureUsage
    });
  } catch (error) {
    console.error('图像放大处理错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，处理失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 添加测试端点来手动测试图片保存功能
app.get('/test-save-image', (req, res) => {
  const testImageUrl = 'https://editor.d.design/assets/demo/business-card.jpg';
  res.send(`
    <html>
      <head>
        <title>Test Save Image</title>
      </head>
      <body>
        <h1>测试保存图片到下载中心</h1>
        <img src="${testImageUrl}" style="max-width: 400px; border: 1px solid #ccc;">
        <div style="margin-top: 20px;">
          <button id="saveBtn" style="padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 4px; cursor: pointer;">
            保存到下载中心
          </button>
        </div>
        
        <script>
          document.getElementById('saveBtn').addEventListener('click', async function() {
            try {
              // 准备测试数据
              const resultData = {
                originalImageUrl: null,
                processedImageUrl: '${testImageUrl}',
                processTime: new Date().toISOString(),
                processType: '测试保存',
                description: '测试保存功能'
              };
              
              // 发送请求
              const response = await fetch('/api/save-result', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(resultData)
              });
              
              const result = await response.json();
              
              if (result.success) {
                alert('保存成功！ID: ' + result.id);
              } else {
                alert('保存失败: ' + (result.error || '未知错误'));
              }
            } catch (error) {
              alert('保存出错: ' + error.message);
            }
          });
        </script>
      </body>
    </html>
  `);
});

// 添加虚拟模特签名API
app.post('/api/get-virtual-model-signature', async (req, res) => {
  try {
    console.log('接收虚拟模特签名请求:', JSON.stringify(req.body));
    
    // 获取参数，注意兼容不同的大小写形式
    let timeStamp = req.body.timeStamp;
    const userId = req.body.userId;
    
    // 检查并尝试从timestamp中获取时间戳（小写形式）
    if (!timeStamp && req.body.timestamp) {
      timeStamp = req.body.timestamp;
      console.log('从timestamp(小写)参数获取时间戳:', timeStamp);
    }
    
    // 验证必要参数
    if (!timeStamp) {
      console.error('缺少必要参数timeStamp');
      return res.status(400).json({
        success: false,
        message: '缺少必要参数(timeStamp)'
      });
    }
    
    if (!userId) {
      console.error('缺少必要参数userId');
      return res.status(400).json({
        success: false,
        message: '缺少必要参数(userId)'
      });
    }
    
    // 虚拟模特的AppKey和Secret - 确保使用正确的值
    const APP_KEY = '502592';
    const APP_SECRET = 'dSmD7xK5Oms04Ml4VsQH0mmHJsBXcB1t';
    
    console.log('使用参数:', {
      userId,
      timeStamp,
      appKey: APP_KEY
    });
    
    // 使用api-utils.js中的函数生成签名，确保与官方逻辑一致
    const { generateAidgeSign } = require('./api-utils');
    
    // 调用签名生成函数 - 确保timeStamp是数字类型
    const numericTimeStamp = parseInt(timeStamp, 10);
    const sign = generateAidgeSign(APP_SECRET, numericTimeStamp, userId);
    
    console.log('生成虚拟模特签名成功:', {
      timeStamp: numericTimeStamp,
      userId,
      sign
    });
    
    // 构建响应，包含必要参数
    const response = {
      success: true,
      sign: sign,
      ak: APP_KEY,
      userId: userId,
      timeStamp: numericTimeStamp
    };
    
    console.log('返回响应:', response);
    res.json(response);
  } catch (error) {
    console.error('生成虚拟模特签名失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误: ' + error.message
    });
  }
});

// 处理鞋靴模特API的上传图片请求
app.post('/api/upload-image-for-shoe-model', protect, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '未提供文件'
      });
    }

    const filePath = req.file.path;
    const fileName = req.file.filename;
    const type = req.body.type || 'unknown'; // 'model' 或 'shoe'

    // 获取文件的完整URL（根据你的服务器设置调整）
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${fileName}`;

    // 记录上传历史（可选）
    try {
      await ImageHistory.create({
        userId: req.user.id,
        fileUrl: fileUrl,
        fileName: fileName,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        uploadDate: new Date(),
        category: type === 'model' ? 'model_template' : 'shoe_image',
        status: 'uploaded'
      });
    } catch (historyError) {
      console.error('记录上传历史失败:', historyError);
      // 继续处理，不影响主流程
    }

    res.status(200).json({
      success: true,
      message: '文件上传成功',
      imageUrl: fileUrl,
      fileName: fileName
    });
  } catch (error) {
    console.error('上传文件时出错:', error);
    res.status(500).json({
      success: false,
      message: '上传文件失败',
      error: error.message
    });
  }
});

// 创建鞋靴模特试穿任务
app.post('/api/create-shoe-model-task', protect, checkFeatureAccess('VIRTUAL_SHOE_MODEL'), async (req, res) => {
  try {
    console.log('接收到创建鞋靴模特试穿任务请求:', req.body);
    const { modelImageUrl, shoeImageUrl } = req.body;

    if (!modelImageUrl || !shoeImageUrl) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：模特图片URL或鞋靴图片URL'
      });
    }

    // 记录请求信息，方便调试
    console.log('鞋靴模特试穿请求参数:', {
      modelImageUrl, 
      shoeImageUrl,
      apiKey: DASHSCOPE_API_KEY.substring(0, 5) + '...' // 只输出API Key的前几个字符，保护安全
    });

    // 调用阿里云鞋靴模特API创建任务
    try {
      const response = await axios({
        method: 'POST',
        url: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/virtualmodel/generation/',
        headers: {
          'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
          'X-DashScope-Async': 'enable', // 启用异步调用
          'Content-Type': 'application/json'
        },
        data: {
          model: 'shoemodel-v1',
          input: {
            template_image_url: modelImageUrl,
            shoe_image_url: Array.isArray(shoeImageUrl) ? shoeImageUrl : [shoeImageUrl]
          },
          parameters: {
            n: 1  // 确保是整数类型，不是字符串
          }
        }
      });

      console.log('阿里云API响应:', response.data);

      if (!response.data || !response.data.output || !response.data.output.task_id) {
        throw new Error('API响应格式不正确，缺少task_id');
      }

      // 记录使用历史
      try {
        await FeatureUsage.create({
          userId: req.user.id,
          featureName: 'VIRTUAL_SHOE_MODEL',
          usageDate: new Date(),
          requestData: JSON.stringify({
            modelImage: modelImageUrl,
            shoeImage: shoeImageUrl
          }),
          responseData: JSON.stringify(response.data),
          status: 'PENDING'
        });

        // 扣除用户积分
        await User.decrement('credits', {
          by: 1, // 扣除1积分，你可以根据实际情况调整
          where: { id: req.user.id }
        });
      } catch (historyError) {
        console.error('记录使用历史失败:', historyError);
        // 继续处理，不影响主流程
      }

      res.status(200).json({
        success: true,
        message: '任务创建成功',
        taskId: response.data.output.task_id,
        output: {
          task_id: response.data.output.task_id,
          task_status: response.data.output.task_status
        },
        request_id: response.data.request_id
      });
    } catch (apiError) {
      console.error('调用阿里云API失败:', apiError.response?.data || apiError.message);
      let errorMessage = '创建任务失败';
      let errorDetails = '';
      
      if (apiError.response?.data) {
        errorMessage = apiError.response.data.message || errorMessage;
        errorDetails = JSON.stringify(apiError.response.data);
      }
      
      return res.status(500).json({
        success: false,
        message: errorMessage,
        details: errorDetails
      });
    }
  } catch (error) {
    console.error('创建鞋靴模特试穿任务失败:', error.message);
    res.status(500).json({
      success: false,
      message: '创建任务失败',
      error: error.message
    });
  }
});

// 查询鞋靴模特试穿任务状态 - 支持query参数查询，兼容旧格式
app.get('/api/check-task-status', protect, async (req, res) => {
  try {
    const { taskId } = req.query;
    console.log('接收到查询任务状态请求 (query参数):', taskId);

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：taskId'
      });
    }

    // 调用阿里云API查询任务状态
    try {
      const response = await axios({
        method: 'GET',
        url: `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
        headers: {
          'Authorization': `Bearer ${DASHSCOPE_API_KEY}`
        }
      });

      console.log('查询任务状态响应:', {
        taskStatus: response.data.output.task_status,
        hasResultUrl: !!response.data.output.result_url
      });

      const taskStatus = response.data.output.task_status;
      let resultData = {
        taskStatus: taskStatus
      };

      // 如果任务已完成，返回结果URL
      if (taskStatus === 'SUCCEEDED') {
        // 打印更多诊断信息
        console.log('任务成功完成，完整响应数据:', JSON.stringify(response.data, null, 2));
        
        // 检查并尝试从多个可能的位置获取结果URL
        if (!response.data.output.result_url && response.data.output.result_urls) {
          console.log('从result_urls数组获取URL');
          response.data.output.result_url = response.data.output.result_urls[0] || '';
        }
        
        // 检查results字段（根据截图）
        if (!response.data.output.result_url && response.data.output.results) {
          console.log('检查results字段');
          if (Array.isArray(response.data.output.results) && response.data.output.results.length > 0) {
            // results是数组(标准格式)
            console.log('从results数组获取URL');
            if (response.data.output.results[0].url) {
              console.log('从results[0].url字段获取URL');
              response.data.output.result_url = response.data.output.results[0].url;
            }
          } else if (typeof response.data.output.results === 'object' && response.data.output.results.url) {
            // results是对象
            console.log('从results.url字段获取URL');
            response.data.output.result_url = response.data.output.results.url;
          }
        }
        
        resultData.resultUrl = response.data.output.result_url;

        // 更新使用历史
        try {
          await FeatureUsage.update(
            {
              status: 'SUCCEEDED',
              responseData: JSON.stringify(response.data),
              resultUrl: response.data.output.result_url
            },
            {
              where: {
                userId: req.user.id,
                featureName: 'VIRTUAL_SHOE_MODEL'
              },
              order: [['createdAt', 'DESC']],
              limit: 1
            }
          );
        } catch (historyError) {
          console.error('更新使用历史失败:', historyError);
        }
      } else if (taskStatus === 'FAILED') {
        resultData.message = response.data.output.message || '任务执行失败';
        resultData.code = response.data.output.code || '未知错误';

        // 更新使用历史
        try {
          await FeatureUsage.update(
            {
              status: 'FAILED',
              responseData: JSON.stringify(response.data)
            },
            {
              where: {
                userId: req.user.id,
                featureName: 'VIRTUAL_SHOE_MODEL'
              },
              order: [['createdAt', 'DESC']],
              limit: 1
            }
          );
        } catch (historyError) {
          console.error('更新使用历史失败:', historyError);
        }
      }

      res.status(200).json({
        success: true,
        ...resultData,
        output: {
          task_id: taskId,
          task_status: taskStatus,
          submit_time: response.data.output.submit_time || new Date().toISOString().replace('T', ' ').slice(0, 23),
          scheduled_time: response.data.output.scheduled_time || new Date().toISOString().replace('T', ' ').slice(0, 23),
          end_time: response.data.output.end_time,
          start_time: response.data.output.start_time,
          error_message: taskStatus === 'SUCCEEDED' ? 'Success' : (response.data.output.message || ''),
          error_code: response.data.output.error_code || 0,
          model_index: response.data.output.model_index || 0,
          ...(taskStatus === 'SUCCEEDED' ? { 
            result_url: response.data.output.result_url,
            ...(response.data.output.result_urls ? { result_urls: response.data.output.result_urls } : {})
          } : {}),
          ...(taskStatus === 'FAILED' ? { 
            code: response.data.output.code || 'UnknownError',
            message: response.data.output.message || '任务执行失败'
          } : {}),
          ...(taskStatus === 'RUNNING' ? {
            task_metrics: response.data.output.task_metrics || {
              TOTAL: 1,
              SUCCEEDED: 0,
              FAILED: 0
            }
          } : {})
        },
        usage: {
          image_count: response.data.usage?.image_count || (taskStatus === 'SUCCEEDED' ? 1 : 0)
        },
        request_id: response.data.request_id || Date.now().toString()
      });
    } catch (apiError) {
      console.error('查询任务状态失败:', apiError.response?.data || apiError.message);
      
      let errorMessage = '查询任务状态失败';
      if (apiError.response?.data) {
        errorMessage = apiError.response.data.message || errorMessage;
      }
      
      return res.status(500).json({
        success: false,
        message: errorMessage
      });
    }
  } catch (error) {
    console.error('查询任务状态处理失败:', error.message);
    res.status(500).json({
      success: false,
      message: '查询任务状态失败',
      error: error.message
    });
  }
});

// 查询鞋靴模特试穿任务状态 - 使用路径参数，符合阿里云API规范
app.get('/api/tasks/:taskId', protect, async (req, res) => {
  try {
    const { taskId } = req.params;
    console.log('接收到查询任务状态请求 (路径参数):', taskId);

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：taskId'
      });
    }

    // 调用阿里云API查询任务状态
    try {
      const response = await axios({
        method: 'GET',
        url: `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
        headers: {
          'Authorization': `Bearer ${DASHSCOPE_API_KEY}`
        }
      });

      console.log('查询任务状态响应:', {
        taskStatus: response.data.output.task_status,
        hasResultUrl: !!response.data.output.result_url
      });

      // 直接返回阿里云API的响应结果，确保格式完全一致
      // 调试问题：检查响应数据完整性
      console.log('完整响应数据:', JSON.stringify(response.data, null, 2));
      
      // 检查result_url是否存在
      if (response.data.output.task_status === 'SUCCEEDED') {
        if (!response.data.output.result_url) {
          console.warn('警告: 任务状态为成功但缺少result_url字段');
          
          // 尝试从其他可能的位置获取result_url
          if (response.data.output.result_urls) {
            console.log('从result_urls数组获取URL');
            response.data.output.result_url = response.data.output.result_urls[0] || '';
          }
          
          // 检查results字段（根据截图）
          if (!response.data.output.result_url && response.data.output.results) {
            console.log('检查results字段');
            if (Array.isArray(response.data.output.results) && response.data.output.results.length > 0) {
              // results是数组(标准格式)
              console.log('从results数组获取URL');
              if (response.data.output.results[0].url) {
                console.log('从results[0].url字段获取URL');
                response.data.output.result_url = response.data.output.results[0].url;
              }
            } else if (typeof response.data.output.results === 'object' && response.data.output.results.url) {
              // results是对象
              console.log('从results.url字段获取URL');
              response.data.output.result_url = response.data.output.results.url;
            }
          }
        }
      }
      
      res.status(200).json(response.data);
    } catch (apiError) {
      console.error('查询任务状态失败:', apiError.response?.data || apiError.message);
      
      // 如果有原始错误响应，直接返回
      if (apiError.response?.data) {
        return res.status(apiError.response.status || 500).json(apiError.response.data);
      }
      
      // 否则返回通用错误
      return res.status(500).json({
        code: 'InternalError',
        message: apiError.message || '查询任务状态失败',
        request_id: Date.now().toString()
      });
    }
  } catch (error) {
    console.error('查询任务状态处理失败:', error.message);
    res.status(500).json({
      code: 'InternalError',
      message: error.message || '查询任务状态失败',
      request_id: Date.now().toString()
    });
  }
});

// 上传图片到OSS并返回可公开访问的URL - 专用于鞋靴试穿功能
app.post('/api/image-to-oss', protect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '未提供图片文件'
      });
    }

    console.log('收到图片上传请求:', {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      imageType: req.body.imageType
    });

    // 检查文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/bmp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: '不支持的图片格式，请上传JPG、PNG、BMP或WEBP格式的图片'
      });
    }

    // 检查文件大小，限制为5MB
    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: '图片大小超过限制，请上传小于5MB的图片'
      });
    }

    try {
      // 使用api-utils.js中的上传到OSS函数
      const imageUrl = await uploadToOSS(req.file.buffer || fs.readFileSync(req.file.path), req.file.originalname);
      
      console.log('图片上传到OSS成功:', imageUrl);

      // 记录上传历史
      try {
        await ImageHistory.create({
          userId: req.user.id,
          imageUrl: imageUrl,  // 确保这个字段有值
          title: req.file.originalname,
          originalImageUrl: imageUrl,
          type: req.body.imageType === 'model' ? 'MODEL_TEMPLATE' : 'SHOE_IMAGE',
          processType: '鞋靴虚拟试穿',
          metadata: {
            fileType: req.file.mimetype,
            fileSize: req.file.size,
            category: req.body.imageType
          }
        });
      } catch (historyError) {
        console.error('记录上传历史失败:', historyError);
        // 继续处理，不影响主流程
      }

      res.status(200).json({
        success: true,
        message: '图片上传成功',
        imageUrl: imageUrl
      });
    } catch (ossError) {
      console.error('上传到OSS失败:', ossError);
      res.status(500).json({
        success: false,
        message: '上传图片到OSS服务器失败',
        error: ossError.message
      });
    }
  } catch (error) {
    console.error('处理图片上传请求失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器处理上传请求失败',
      error: error.message
    });
  }
});

// 上传视频到OSS的函数
async function uploadVideoToOSS(file) {
  try {
    const fileContent = fs.readFileSync(file.path);
    const ossFileName = `video-subtitle-remover/${Date.now()}-${uuidv4()}.mp4`;
    
    // 上传到OSS
    await ossClient.put(ossFileName, fileContent);
    
    // 删除临时文件
    fs.unlinkSync(file.path);
    
    // 返回OSS URL
    return `https://${process.env.OSS_BUCKET}.${process.env.OSS_REGION}.aliyuncs.com/${ossFileName}`;
  } catch (error) {
    console.error('上传视频到OSS失败:', error);
    // 删除临时文件
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    throw error;
  }
}

// 创建阿里云SDK客户端
function createVideoEnhanceClient() {
  // 使用环境变量中的密钥
  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  
  if (!accessKeyId || !accessKeySecret) {
    throw new Error('缺少阿里云API密钥配置');
  }
  
  let config = new OpenApi.Config({
    accessKeyId: accessKeyId,
    accessKeySecret: accessKeySecret,
  });
  
  // 使用视频增强服务的上海区域端点
  config.endpoint = 'videoenhan.cn-shanghai.aliyuncs.com';
  return new videoenhan20200320.default(config);
}

// 上传视频API
app.post('/api/upload-video', protect, async (req, res) => {
  try {
    const { user } = req;
    
    // 检查用户是否有足够的积分(至少10积分)
    if (user.credits < 10) {
      return res.status(400).json({ error: '积分不足，至少需要10积分' });
    }
    
    // 直接使用videoUpload中间件处理文件上传，不需要嵌套调用upload
    videoUpload.single('video')(req, res, async (err) => {
      if (err) {
        console.error('文件上传错误:', err);
        return res.status(400).json({ error: err.message });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: '未找到上传的视频文件' });
      }
      
      try {
        // 上传视频到OSS
        const ossUrl = await uploadVideoToOSS(req.file);
        
        // 返回OSS URL
        return res.json({ 
          success: true, 
          message: '视频上传成功',
          videoUrl: ossUrl
        });
      } catch (error) {
        console.error('视频处理错误:', error);
        return res.status(500).json({ 
          error: '视频上传失败', 
          details: error.message 
        });
      }
    });
  } catch (error) {
    console.error('上传视频API错误:', error);
    res.status(500).json({ error: '服务器错误', details: error.message });
  }
});

// 视频字幕擦除API - 使用阿里云SDK直接调用
app.post('/api/remove-subtitles', protect, async (req, res) => {
  try {
    const { user } = req;
    const { videoUrl, videoDuration } = req.body;
    
    console.log('视频字幕擦除请求:', { videoUrl, videoDuration });
    
    if (!videoUrl) {
      return res.status(400).json({ error: '缺少视频URL参数' });
    }
    
    // 获取视频时长（秒）
    let duration = parseInt(videoDuration) || 0;
    
    // 如果前端未提供视频时长，使用默认值30秒
    if (!duration || duration <= 0) {
      console.log('未提供有效的视频时长，使用默认值30秒');
      duration = 30;
    }
    
    console.log(`视频时长: ${duration}秒`);
    
    // 使用featureAccess中间件进行积分检查和扣除
    const { checkFeatureAccess } = require('./middleware/featureAccess');
    const featureAccessMiddleware = checkFeatureAccess('VIDEO_SUBTITLE_REMOVER');
    
    // 添加视频时长到请求体，以便中间件计算积分
    req.body.duration = duration;
    
    try {
      // 使用自定义中间件执行功能访问检查
      await new Promise((resolve, reject) => {
        featureAccessMiddleware(req, res, (err) => {
          if (err) {
            console.error('功能访问检查失败:', err);
            reject(err);
            return;
          }
          resolve();
        });
      });
    } catch (featureAccessError) {
      // 如果在这里捕获到错误，说明中间件内部有异常，但没有调用res.json()结束响应
      console.error('功能访问权限检查异常:', featureAccessError);
      return res.status(500).json({
        success: false,
        message: '功能访问检查失败：' + (featureAccessError.message || '未知错误')
      });
    }
    
    // 如果res.headersSent为true，说明featureAccess中间件已经发送了响应
    // 比如因为积分不足，响应已经结束，我们直接返回
    if (res.headersSent) {
      console.log('featureAccess中间件已经处理了响应，不再继续处理');
      return;
    }
    
    // 检查视频URL格式
    if (!videoUrl.startsWith('http')) {
      return res.status(400).json({ 
        error: '无效的视频URL格式',
        details: '视频URL必须是有效的HTTP/HTTPS URL'
      });
    }
    
    try {
      // 使用阿里云SDK调用视频字幕擦除API
      const client = createVideoEnhanceClient();
      
      // 创建请求对象
      const eraseVideoSubtitlesRequest = new videoenhan20200320.EraseVideoSubtitlesRequest({
        videoUrl: videoUrl,
      });
      
      // 添加可选参数
      // 如果有字幕位置参数，添加对应区域参数
      if (req.body.subtitlePosition === 'Top') {
        eraseVideoSubtitlesRequest.bX = 0.0;
        eraseVideoSubtitlesRequest.bY = 0.0;
        eraseVideoSubtitlesRequest.bW = 1.0;
        eraseVideoSubtitlesRequest.bH = 0.25;
      } else if (req.body.subtitlePosition === 'Bottom') {
        eraseVideoSubtitlesRequest.bX = 0.0;
        eraseVideoSubtitlesRequest.bY = 0.75;
        eraseVideoSubtitlesRequest.bW = 1.0;
        eraseVideoSubtitlesRequest.bH = 0.25;
      } else if (req.body.subtitlePosition === 'All') {
        eraseVideoSubtitlesRequest.bX = 0.0;
        eraseVideoSubtitlesRequest.bY = 0.0;
        eraseVideoSubtitlesRequest.bW = 1.0;
        eraseVideoSubtitlesRequest.bH = 1.0;
      }
      
      // 设置运行时选项
      const runtime = new Util.RuntimeOptions({});
      
      console.log('调用阿里云SDK:', eraseVideoSubtitlesRequest);
      
      // 调用API
      const result = await client.eraseVideoSubtitlesWithOptions(eraseVideoSubtitlesRequest, runtime);
      
      console.log('视频字幕擦除API返回结果:', result);
      
      if (!result || !result.body || !result.body.requestId) {
        throw new Error('API返回结果格式不正确，缺少requestId');
      }
      
      // 记录功能使用 - 使用findOrCreate避免唯一约束冲突
      try {
        // 查找是否已存在记录
        const [usage, created] = await FeatureUsage.findOrCreate({
          where: {
            userId: user.id,
            featureName: 'VIDEO_SUBTITLE_REMOVER'
          },
          defaults: {
            usageCount: 1,
            lastUsedAt: new Date()
          }
        });
        
        // 如果记录已存在，更新使用计数和最后使用时间
        if (!created) {
          await usage.update({
            usageCount: usage.usageCount + 1,
            lastUsedAt: new Date()
          });
        }
      } catch (dbError) {
        // 记录错误但不阻止API返回结果
        console.error('记录功能使用数据失败，但不影响API结果:', dbError);
      }
      
      res.json({
        success: true,
        message: '视频字幕擦除任务已提交',
        jobId: result.body.requestId,
        requestId: result.body.requestId,
        duration: duration // 返回视频时长供前端参考
      });
    } catch (error) {
      console.error('阿里云SDK调用失败:', error);
      
      // 提取错误信息
      let errorMessage = error.message || '未知错误';
      let errorCode = 'API_ERROR';
      
      if (error.data) {
        errorMessage = error.data.Message || errorMessage;
        errorCode = error.data.Code || errorCode;
      }
      
      res.status(500).json({ 
        error: '视频字幕擦除失败', 
        details: errorMessage,
        code: errorCode
      });
    }
  } catch (error) {
    console.error('视频字幕擦除请求处理错误:', error);
    
    res.status(500).json({ 
      error: '视频字幕擦除失败', 
      details: error.message 
    });
  }
});

// 查询任务状态API - 使用阿里云SDK
app.get('/api/check-job-status', protect, async (req, res) => {
  try {
    const { jobId } = req.query;
    
    if (!jobId) {
      return res.status(400).json({ error: '缺少任务ID参数' });
    }
    
    console.log('查询任务状态:', jobId);
    
    try {
      // 使用阿里云SDK创建客户端
      const client = createVideoEnhanceClient();
      
      // 创建查询请求
      const getAsyncJobResultRequest = new videoenhan20200320.GetAsyncJobResultRequest({
        jobId: jobId
      });
      
      // 运行时选项
      const runtime = new Util.RuntimeOptions({});
      
      // 调用API
      const result = await client.getAsyncJobResultWithOptions(getAsyncJobResultRequest, runtime);
      
      console.log('查询任务状态API结果:', JSON.stringify(result.body, null, 2));
      
      if (!result.body) {
        return res.status(500).json({ 
          error: '查询任务状态失败', 
          details: '返回数据格式不正确'
        });
      }
      
      // 解析任务状态
      const status = result.body.data && result.body.data.status ? result.body.data.status : result.body.status;
      
      // 尝试解析Result字段 (如果存在)
      let resultData = null;
      let videoUrl = null;
      
      if (result.body.data && result.body.data.result) {
        try {
          // 可能是JSON字符串
          if (typeof result.body.data.result === 'string') {
            // 检查是否看起来像JSON字符串 (以 { 或 [ 开头)
            if (result.body.data.result.trim().match(/^[\{\[]/)) {
              resultData = JSON.parse(result.body.data.result);
            } else {
              // 不是JSON，保持原样
              resultData = result.body.data.result;
              console.log('结果不是JSON格式，而是纯文本:', resultData);
            }
          } else {
            resultData = result.body.data.result;
          }
          
          // 尝试获取视频URL
          if (resultData && typeof resultData === 'object' && resultData.VideoUrl) {
            videoUrl = resultData.VideoUrl;
          }
        } catch (parseError) {
          console.error('解析结果数据失败:', parseError);
          // 保存原始文本
          resultData = result.body.data.result;
        }
      }
      
      // 构建响应
      const response = {
        success: true,
        status: status,
        jobInfo: {
          Data: {
            JobId: result.body.data ? result.body.data.jobId : jobId,
            Status: status,
            ErrorMessage: result.body.data ? result.body.data.errorMessage : null,
            ErrorCode: result.body.data ? result.body.data.errorCode : null
          }
        }
      };
      
      // 如果找到了视频URL，添加到响应中
      if (videoUrl) {
        response.videoUrl = videoUrl;
        response.jobInfo.Data.Result = JSON.stringify({ VideoUrl: videoUrl });
      } else if (resultData) {
        response.jobInfo.Data.Result = JSON.stringify(resultData);
      }
      
      res.json(response);
    } catch (error) {
      console.error('阿里云SDK调用失败:', error);
      
      // 提取错误信息
      let errorMessage = error.message || '未知错误';
      let errorCode = 'API_ERROR';
      
      if (error.data) {
        errorMessage = error.data.Message || errorMessage;
        errorCode = error.data.Code || errorCode;
      }
      
      res.status(500).json({ 
        error: '查询任务状态失败', 
        details: errorMessage,
        code: errorCode
      });
    }
  } catch (error) {
    console.error('查询任务状态API错误:', error);
    res.status(500).json({ 
      error: '查询任务状态失败', 
      details: error.message 
    });
  }
});

// 视频风格重绘API - 创建任务
app.post('/api/video-style-repaint/create-task', protect, async (req, res) => {
  try {
    const { videoUrl, prompt, style } = req.body;
    
    if (!videoUrl) {
      return res.status(400).json({
        code: "InvalidParameter",
        message: "缺少必要参数: videoUrl",
        request_id: `req_${Date.now()}`
      });
    }
    
    // 使用featureAccess中间件进行积分检查和扣除
    const { checkFeatureAccess } = require('./middleware/featureAccess');
    const featureAccessMiddleware = checkFeatureAccess('VIDEO_STYLE_REPAINT');
    
    try {
      // 使用自定义中间件执行功能访问检查
      await new Promise((resolve, reject) => {
        featureAccessMiddleware(req, res, (err) => {
          if (err) {
            console.error('功能访问检查失败:', err);
            reject(err);
            return;
          }
          resolve();
        });
      });
    } catch (featureAccessError) {
      console.error('功能访问权限检查异常:', featureAccessError);
      return res.status(500).json({
        success: false,
        message: '功能访问检查失败：' + (featureAccessError.message || '未知错误')
      });
    }
    
    // 如果res.headersSent为true，说明featureAccess中间件已经发送了响应
    if (res.headersSent) {
      console.log('featureAccess中间件已经处理了响应，不再继续处理');
      return;
    }
    
    // 获取风格值
    const styleValue = parseInt(style) || 0;
    // 获取分辨率参数，默认540
    const minLen = parseInt(req.body.min_len) || 540;
    
    console.log(`创建视频风格重绘任务: 风格: ${styleValue}, 分辨率min_len: ${minLen}`);
    
    // 构建请求数据
    const requestData = {
      "model": "video-style-transform",
      "input": {
        "video_url": videoUrl
      },
      "parameters": {
        "style": styleValue,
        "video_fps": 15, // 默认设置15fps
        "animate_emotion": true, // 默认开启表情驱动
        "min_len": minLen
      }
    };
    
    console.log('发送到阿里云的数据:', JSON.stringify(requestData, null, 2));
    
    // 创建任务
    try {
      // 准备请求头
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
        'X-DashScope-Async': 'enable' // 启用异步模式
      };
      
      // 发送创建任务请求
      const response = await axios.post(
        'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis', 
        requestData, 
        { headers }
      );
      
      console.log('阿里云API响应:', response.status, JSON.stringify(response.data, null, 2));
      
      // 记录功能使用情况
      try {
        const userId = req.user.id;
        
        await FeatureUsage.create({
          userId,
          featureName: 'VIDEO_STYLE_REPAINT', // 使用正确的列名featureName而不是featureType
          credits: 0, // 暂不扣除积分，任务完成后再扣
          details: JSON.stringify({
            taskId: response.data.output?.task_id || '',
            style: styleValue,
            min_len: minLen, // 保存分辨率参数，用于后续计算
          resolution: minLen, // 同时使用统一的字段名保存分辨率
            creditUpdated: false // 标记尚未更新积分
          })
        });
      } catch (recordError) {
        console.error('记录功能使用失败:', recordError);
        // 不中断流程，继续返回任务创建结果
      }
      
      // 确保返回有效的JSON格式
      res.status(response.status || 200).json(response.data);
    } catch (error) {
      console.error('API调用失败:', error);
      
      if (error.response) {
        console.error('API错误响应:', error.response.status);
        
        try {
          console.error('错误详情:', JSON.stringify(error.response.data, null, 2));
          
          // 返回阿里云原始错误响应
          return res.status(error.response.status).json({
            code: error.response.data.code || "ApiCallError",
            message: error.response.data.message || '调用阿里云API失败',
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
      
      return res.status(500).json({
        code: "InternalServerError",
        message: '创建视频风格重绘任务失败: ' + error.message,
        request_id: `req_${Date.now()}`
      });
    }
  } catch (error) {
    console.error('视频风格重绘API错误:', error);
    res.status(500).json({ 
      code: "InternalServerError",
      message: '服务器错误: ' + error.message,
      request_id: `req_${Date.now()}`
    });
  }
});

// 视频风格重绘API - 查询任务状态
app.get('/api/video-style-repaint/task-status', protect, async (req, res) => {
  try {
    const { taskId } = req.query;
    
    if (!taskId || !/^[0-9a-f-]+$/i.test(taskId)) {
      return res.status(400).json({
        code: "InvalidParameter",
        message: '无效的任务ID',
        request_id: `req_${Date.now()}`
      });
    }
    
    console.log(`查询视频风格重绘任务状态: ${taskId}`);
    
    // 准备请求头
    const headers = {
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`
    };
    
    // 构建请求URL
    const url = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`;
    
    try {
      // 发送查询任务状态请求
      const response = await axios.get(url, { headers, timeout: 30000 }); // 增加超时设置
      
      console.log(`任务状态查询响应: ${response.status}, 任务状态: ${response.data.output?.task_status || '未知'}`);
      
      // 直接返回阿里云API的原始响应，仅确保请求成功
      if (response.status === 200) {
        // 记录更详细的响应信息，帮助调试
        console.log('详细响应数据:', JSON.stringify(response.data, null, 2));
        
        // 如果任务完成，处理视频时长和积分扣除
        if (response.data.output?.task_status === 'SUCCEEDED') {
          try {
            console.log('======= 开始处理视频风格重绘积分扣除 =======');
            
                          // 先打印完整的API响应，便于调试
              console.log('完整API响应结构:', JSON.stringify(response.data));
              
              // 获取视频时长和分辨率
              let duration = 0;
              let resolution = 540; // 默认值
              
              // 直接访问顶层的usage对象
              if (response.data && response.data.usage) {
                duration = response.data.usage.duration || 0;
                resolution = response.data.usage.SR || 540;
                console.log(`直接从response.data.usage获取 - 时长: ${duration}秒, 分辨率: ${resolution}P`);
              } else {
                console.error('未在API响应中找到usage字段，使用默认值');
              }
              
              // 确保分辨率是数字
              resolution = parseInt(resolution);
              console.log(`最终确定的值 - 时长: ${duration}秒, 分辨率: ${resolution}P`);
            
            // 记录key用于任务标识
            let taskKey = `task:${taskId}`;
            
            // 获取任务ID的创建记录，检查是否已扣费
            const taskRecords = await FeatureUsage.findAll({
              where: {
                userId: req.user.id,
                featureName: 'VIDEO_STYLE_REPAINT'
              }
            });
            console.log(`查询到用户的风格重绘记录数量: ${taskRecords.length}`);
            
            // 查找包含当前taskId的记录
            let taskRecord = null;
            for (const record of taskRecords) {
              try {
                const details = JSON.parse(record.details || '{}');
                console.log(`检查记录ID=${record.id}, 详情:`, details);
                if (details.taskId === taskId) {
                  taskRecord = record;
                  console.log(`找到匹配的任务记录: ID=${record.id}`);
                  
                  // 打印任务记录中的分辨率，但不覆盖API返回的分辨率
                  // 从任务记录中读取分辨率，使用统一的字段名
const recordResolution = parseInt(details.min_len || details.resolution) || 540;
                  console.log(`任务记录中的分辨率: ${recordResolution}P，API返回的分辨率: ${resolution}P`);
                  
                  // 确认使用API返回的分辨率
                  console.log(`确认使用API返回的分辨率: ${resolution}P作为计费标准`);
                  break;
                }
              } catch (e) {
                console.error('解析任务详情出错:', e);
                continue;
              }
            }
            
            // 检查是否已经扣过积分
            let alreadyCharged = false;
            if (global.chargedTasks && global.chargedTasks[taskKey]) {
              alreadyCharged = true;
              console.log(`该任务已经扣除过积分(全局标记): ${taskKey}`);
            }
            
            // 如果找到记录，验证是否已更新积分
            if (taskRecord) {
              // 获取任务详情
              const taskDetails = JSON.parse(taskRecord.details || '{}');
              console.log(`任务详情:`, taskDetails);
              
              if (taskDetails.creditUpdated) {
                alreadyCharged = true;
                console.log(`该任务已经扣除过积分(数据库记录): ${taskId}`);
              }
            }
            
            // 如果尚未扣费，进行扣费操作
            if (!alreadyCharged) {
              console.log(`该任务尚未扣除积分, 开始计算...`);
              
                                // 计算积分消耗
                  // 这里我们直接使用上面已经获取并解析过的resolution变量
                  // 不需要再重复解析
                  // 计算费率：540P及以下是3积分/秒，超过540P是6积分/秒
                  const rate = resolution <= 540 ? 3 : 6;
                  const creditCost = Math.ceil(duration) * rate;
                  
                  console.log(`视频风格重绘完成: 实际时长=${duration}秒, 分辨率=${resolution}P, 费率=${rate}积分/秒, 消耗=${creditCost}积分`);
                  console.log(`用于计费的确定值: 时长=${duration}秒, 分辨率=${resolution}P, 费率=${rate}积分/秒`);
                  
                  // 确保在任务详情中也保存正确的分辨率
                  if (taskRecord && taskRecord.details) {
                    try {
                      const details = JSON.parse(taskRecord.details || '{}');
                      // 更新为API返回的实际分辨率
                      details.actual_resolution = resolution;
                      taskRecord.details = JSON.stringify(details);
                      // 不用await，让它在后台更新，不阻塞主流程
                      taskRecord.save().catch(e => console.error('更新任务记录分辨率失败:', e));
                    } catch (e) {
                      console.error('更新任务记录分辨率时解析JSON失败:', e);
                    }
                  }
              
                              // 更新用户积分
                const user = await User.findByPk(req.user.id);
                if (user) {
                  console.log(`当前用户积分: ${user.credits}`);
                  
                  // 直接使用计算出的积分
                  let finalCost = creditCost;
                  
                  // 直接扣除积分
                  user.credits = user.credits - finalCost;
                  await user.save();
                  console.log(`扣除积分成功: ${finalCost}积分`);
                  
                  // 初始化全局已扣费任务记录
                  if (typeof global.chargedTasks === 'undefined') {
                    global.chargedTasks = {};
                  }
                  
                  // 标记该任务已扣费
                  global.chargedTasks[taskKey] = {
                    timestamp: new Date().getTime(),
                    userId: req.user.id,
                    cost: finalCost
                  };
                
                // 如果找到对应的记录，更新它
                if (taskRecord) {
                  // 更新任务记录
                  const taskDetails = JSON.parse(taskRecord.details || '{}');
                  taskDetails.creditUpdated = true;
                  taskDetails.actualDuration = duration;
                  taskDetails.creditCost = finalCost || creditCost;
                  taskRecord.details = JSON.stringify(taskDetails);
                  await taskRecord.save();
                                 } else {
                   // 如果没有找到对应任务记录，查找用户的功能使用记录并更新
                   // 避免违反唯一约束
                   try {
                     // 先查找该用户的功能使用记录
                     const existingRecord = await FeatureUsage.findOne({
                       where: {
                         userId: req.user.id,
                         featureName: 'VIDEO_STYLE_REPAINT'
                       }
                     });
                     
                     if (existingRecord) {
                       // 更新现有记录
                       console.log(`找到用户的功能使用记录，ID=${existingRecord.id}，更新它`);
                                             const existingDetails = JSON.parse(existingRecord.details || '{}');
                      existingDetails.taskId = taskId;
                      // 同时更新两种字段名，确保兼容性
                      existingDetails.min_len = resolution;
                      existingDetails.resolution = resolution; // 使用统一的字段名
                      existingDetails.actual_resolution = resolution; // 保存API返回的实际分辨率
                      existingDetails.actualDuration = duration;
                      existingDetails.creditCost = finalCost || creditCost;
                      existingDetails.creditUpdated = true;
                       
                       existingRecord.details = JSON.stringify(existingDetails);
                       await existingRecord.save();
                       console.log(`更新用户记录成功，ID=${existingRecord.id}`);
                     } else {
                       // 这种情况应该很少发生，因为前面已经查询过一次了
                       console.log(`未找到用户的功能使用记录，创建新记录（这是不常见的情况）`);
                       await FeatureUsage.create({
                         userId: req.user.id,
                         featureName: 'VIDEO_STYLE_REPAINT',
                         usageCount: 1, // 确保设置使用次数
                         lastUsedAt: new Date(),
                         resetDate: new Date().toISOString().split('T')[0],
                         credits: creditCost,
                         details: JSON.stringify({
                                                 taskId: taskId,
                      min_len: resolution,
                      resolution: resolution, // 使用统一的字段名
                      actual_resolution: resolution, // 保存API返回的实际分辨率
                      actualDuration: duration,
                      creditCost: finalCost || creditCost,
                      creditUpdated: true
                         })
                       });
                     }
                   } catch (saveError) {
                     console.error('保存用户功能使用记录失败:', saveError);
                     // 即使保存记录失败，我们也已经扣除了积分，所以不影响核心功能
                   }
                 }
                
                console.log(`用户积分已更新: 用户ID=${req.user.id}, 剩余积分=${user.credits}, 扣除=${creditCost}`);
              } else {
                console.error(`未找到用户: ID=${req.user.id}`);
              }
            } else {
              console.log(`该任务已经扣除过积分, 无需重复扣除`);
            }
            console.log('======= 结束处理视频风格重绘积分扣除 =======');
          } catch (creditError) {
            console.error('更新积分出错:', creditError);
            console.error(creditError.stack);
            // 不中断流程，继续返回任务状态
          }
        } else {
          console.log(`任务状态不是成功, 当前状态: ${response.data.output?.task_status}`);
        }
        
        return res.status(200).json(response.data);
      }
      
      return res.status(response.status).json({
        status: 'FAILED',
        message: '查询任务状态失败',
        code: 'UnknownError',
        request_id: `req_${Date.now()}`
      });
    } catch (error) {
      // 处理API请求错误
      console.log('查询任务状态失败:', error);
      
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
    console.error('视频风格重绘任务状态查询出错:', error);
    res.status(500).json({ 
      code: "InternalServerError",
      message: '服务器错误: ' + error.message,
      request_id: `req_${Date.now()}`
    });
  }
});

// 视频上传API - 专用于视频风格重绘功能
app.post('/api/video-style-repaint/upload', protect, async (req, res) => {
  try {
    console.log('收到视频风格重绘上传请求');
    
    // 检查OSS配置
    console.log('OSS配置状态:', {
      region: process.env.OSS_REGION ? '已配置' : '未配置',
      bucket: process.env.OSS_BUCKET ? '已配置' : '未配置',
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID ? process.env.ALIYUN_ACCESS_KEY_ID.substring(0, 5) + '...' : '未配置',
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET ? '已配置(已隐藏)' : '未配置'
    });
    
    // 确保上传目录存在
    const uploadDir = path.join(__dirname, 'uploads', 'style-videos');
    if (!fs.existsSync(uploadDir)) {
      console.log(`创建上传目录: ${uploadDir}`);
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    // 配置视频上传 - 磁盘存储
    const styleVideoStorage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, uploadDir);
      },
      filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'style-video-' + uniqueSuffix + ext);
      }
    });
    
    const styleVideoUpload = multer({
      storage: styleVideoStorage,
      limits: {
        fileSize: 100 * 1024 * 1024 // 100MB限制
      },
      fileFilter: function (req, file, cb) {
        // 检查是否是视频文件
        if (file.mimetype.startsWith('video/')) {
          cb(null, true);
        } else {
          cb(new Error('只允许上传视频文件'), false);
        }
      }
    });
    
    // 使用multer中间件处理上传
    styleVideoUpload.single('video')(req, res, async (err) => {
      if (err) {
        console.error('文件上传错误:', err);
        return res.status(400).json({ 
          success: false,
          message: err.message 
        });
      }
      
      if (!req.file) {
        return res.status(400).json({ 
          success: false,
          message: '未找到上传的视频文件' 
        });
      }
      
      try {
        // 获取上传的文件路径
        const filePath = req.file.path;
        
        // 检查视频文件大小
        const stats = fs.statSync(filePath);
        const fileSizeInMB = stats.size / (1024 * 1024);
        if (fileSizeInMB > 100) {
          // 删除超大文件
          fs.unlinkSync(filePath);
          return res.status(400).json({
            success: false,
            message: '视频文件不能超过100MB'
          });
        }
        
        console.log(`上传视频文件: ${req.file.originalname}, 大小: ${fileSizeInMB.toFixed(2)}MB`);
        
        // 上传到OSS
        const ossFileName = `video-style-repaint/${Date.now()}-${uuidv4()}${path.extname(req.file.originalname)}`;
        
        console.log('准备上传到OSS, 文件名:', ossFileName);
        
        try {
          // 上传到OSS
          const fileContent = fs.readFileSync(filePath);
          const ossResult = await ossClient.put(ossFileName, fileContent);
          
          console.log('OSS上传结果:', {
            name: ossResult.name,
            url: ossResult.url,
            status: ossResult.res.status
          });
          
          // 删除临时文件
          fs.unlinkSync(filePath);
          
          // 构建OSS URL
          const videoUrl = `https://${process.env.OSS_BUCKET}.${process.env.OSS_REGION}.aliyuncs.com/${ossFileName}`;
          
          // 返回视频URL
          res.status(200).json({
            success: true,
            videoUrl: videoUrl
          });
        } catch (ossError) {
          console.error('OSS上传失败:', ossError);
          
          // 如果临时文件存在，删除它
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          
          // 返回错误响应
          return res.status(500).json({
            success: false,
            message: `上传到OSS失败: ${ossError.message || '未知错误'}`,
            code: ossError.code || 'UNKNOWN_ERROR'
          });
        }
      } catch (error) {
        console.error('视频上传失败:', error);
        
        // 如果文件存在但上传失败，清理临时文件
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (unlinkError) {
            console.error('删除临时文件失败:', unlinkError);
          }
        }
        
        res.status(500).json({
          success: false,
          message: `视频上传失败: ${error.message}`
        });
      }
    });
  } catch (error) {
    console.error('视频上传API错误:', error);
    res.status(500).json({ 
      success: false,
      message: '服务器错误: ' + error.message 
    });
  }
});

// 404处理
app.use((req, res) => {
  // 检查是否请求的是根目录下的HTML文件
  if (req.path.endsWith('.html')) {
    const htmlPath = path.join(__dirname, req.path);
    if (fs.existsSync(htmlPath)) {
      return res.sendFile(htmlPath);
    }
  }
  
  // 对API请求返回JSON格式的错误信息
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: '找不到请求的API端点',
      path: req.path
    });
  }
  
  // 对其他请求返回HTML错误页面
  res.status(404).send('找不到请求的页面');
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  
  // 对API请求返回JSON格式的错误信息
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
  
  // 对其他请求返回HTML错误页面
  res.status(500).send('服务器内部错误');
});

// 在启动服务器前添加全局异常处理机制
// 捕获未处理的Promise异常
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise异常:', reason);
  // 不要结束进程，让服务器继续运行
});

// 捕获全局异常，防止进程崩溃
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  // 不要结束进程，让服务器继续运行
});

// 在文件末尾寻找服务器启动代码
const startServer = async () => {
  try {
    // 尝试连接数据库
    await sequelize.authenticate();
    console.log('数据库连接成功.');
    
    // 尝试同步数据库
    try {
      await syncDatabase();
      console.log('数据库同步完成.');
    } catch (error) {
      console.error('同步数据库出错:', error);
      // 数据库同步失败但继续启动服务器
    }
  } catch (error) {
    console.error('无法连接到数据库:', error);
    // 数据库连接失败但继续启动服务器
  }
  
  // 无论数据库连接是否成功，都启动HTTP服务器
  app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
    console.log(`虚拟模特编辑器可在 http://localhost:${port}/virtual-model 访问`);
  });
};

// 启动服务器
startServer(); 

// 同步数据库
console.log('开始同步数据库表结构...');
(async () => {
  try {
    await User.sync();
    console.log('User表同步完成');
    
    await FeatureUsage.sync();
    console.log('FeatureUsage表同步完成');
    
    await PaymentOrder.sync();
    console.log('PaymentOrder表同步完成');
    
    // 设置模型关联关系
    console.log('设置模型关联关系...');
    setupAssociations();
    console.log('模型关联关系设置完成');
    
  } catch (error) {
    console.error('数据库同步出错:', error);
  }
})(); 

// 在现有的路由配置之后添加视频数字人路由

// 引入视频数字人路由配置
app.use(express.static(path.join(__dirname)));

// 设置视频数字人文件上传
const digitalHumanVideoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads', 'digital-human');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const digitalHumanUpload = multer({
  storage: digitalHumanVideoStorage,
  limits: {
    fileSize: 300 * 1024 * 1024 // 300MB 视频限制
  }
});

/**
 * 上传文件到OSS服务
 * @param {Object} file - multer文件对象
 * @param {String} folderPath - OSS存储的文件夹路径
 * @returns {Promise<String>} OSS URL
 */
async function uploadFileToOSS(file, folderPath) {
  console.log('准备上传文件到OSS:', file.path);
  const objectName = `${folderPath}/${Date.now()}-${path.basename(file.path)}`;
  
  try {
    // 确认文件存在
    if (!fs.existsSync(file.path)) {
      throw new Error(`文件路径不存在: ${file.path}`);
    }
    
    // 读取文件内容
    const fileContent = fs.readFileSync(file.path);
    
    // 检查OSS客户端配置
    if (!ossClient) {
      console.error('OSS客户端未初始化，检查您的阿里云凭证配置');
      throw new Error('OSS客户端配置错误');
    }
    
    // 上传到OSS
    try {
      const result = await ossClient.put(objectName, fileContent);
      console.log('文件上传到OSS成功:', result.url);
      
      // 删除本地临时文件
      fs.unlinkSync(file.path);
      return result.url;
    } catch (ossError) {
      console.error('上传到OSS失败:', ossError);
      // 如果OSS上传失败但在生产环境，抛出错误
      if (process.env.NODE_ENV === 'production') {
        throw ossError;
      }
      // 在开发环境保留本地文件作为备用
      console.log('开发环境：返回本地文件URL作为备用');
      return `http://localhost:${port}/uploads/${path.relative(path.join(__dirname, 'uploads'), file.path)}`;
    }
  } catch (error) {
    console.error('读取或处理文件失败:', error);
    throw error;
  }
}

/**
 * 创建VideoRetalk任务 - 声动人像合成（视频数字人）
 * 注意：虽然API路径包含image2video，但这是阿里云的视频数字人口型合成API，不是图生视频功能
 * @param {String} videoUrl - 视频URL
 * @param {String} audioUrl - 音频URL
 * @param {String} imageUrl - 图片URL (可选)
 * @param {Boolean} videoExtension - 是否扩展视频
 * @returns {Promise<String>} 任务ID
 */
async function createVideoRetalkTask(videoUrl, audioUrl, imageUrl, videoExtension) {
  try {
    console.log('准备创建VideoRetalk任务');
    
    // 检查API密钥是否有效
    const isValidApiKey = DASHSCOPE_API_KEY && DASHSCOPE_API_KEY.length > 10 && DASHSCOPE_API_KEY !== 'default-api-key-replacement';
    
    // 本地测试模式 - 当没有有效的API密钥时
    if (!isValidApiKey) {
      console.log('使用本地测试模式 - 模拟API响应');
      
      // 生成一个随机任务ID
      const mockTaskId = 'mock-task-' + Date.now();
      
      // 在控制台记录请求信息（用于调试）
      console.log('模拟请求参数:', {
        videoUrl: videoUrl,
        audioUrl: audioUrl,
        imageUrl: imageUrl,
        videoExtension: videoExtension
      });
      
      // 返回模拟的任务ID
      return mockTaskId;
    }
    
    // 真实API调用模式
    const apiUrl = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis/';
    
    // 检查URL格式
    if (!videoUrl.startsWith('http') || !audioUrl.startsWith('http')) {
      throw new Error('视频和音频URL必须是有效的HTTP/HTTPS URL');
    }
    
    if (imageUrl && !imageUrl.startsWith('http')) {
      throw new Error('参考图片URL必须是有效的HTTP/HTTPS URL');
    }
    
    // 构建请求体
    const requestBody = {
      model: 'videoretalk',  // 指定模型为videoretalk，用于口型合成
      input: {
        video_url: videoUrl,  // 用户上传的视频URL
        audio_url: audioUrl   // 用户上传的音频URL
      },
      parameters: {
        video_extension: videoExtension || false  // 是否延长视频以匹配音频时长
      }
    };
    
    // 如果提供了参考图片，添加到请求中
    if (imageUrl) {
      requestBody.input.ref_image_url = imageUrl;
    }
    
    console.log('发送VideoRetalk API请求:', {
      url: apiUrl,
      model: requestBody.model,
      hasVideoUrl: !!videoUrl,
      hasAudioUrl: !!audioUrl,
      hasImageUrl: !!imageUrl
    });
    
    // 发送请求
    const response = await axios.post(apiUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
        'X-DashScope-Async': 'enable'
      }
    });
    
    console.log('VideoRetalk任务创建成功, 状态码:', response.status);
    
    if (response.data && response.data.output && response.data.output.task_id) {
      return response.data.output.task_id;
    } else {
      console.error('API响应缺少task_id:', response.data);
      throw new Error('API响应格式不正确，缺少task_id');
    }
  } catch (error) {
    console.error('创建VideoRetalk任务失败:', error.response ? error.response.data : error.message);
    throw error;
  }
}

/**
 * 查询VideoRetalk任务状态
 * @param {String} taskId - 任务ID
 * @returns {Promise<Object>} 任务状态
 */
async function checkVideoRetalkTaskStatus(taskId) {
  try {
    console.log('准备查询任务状态:', taskId);
    
    // 检查是否为模拟任务ID（本地测试模式）
    if (taskId.startsWith('mock-task-')) {
      console.log('使用本地测试模式 - 模拟任务状态');
      
      // 解析任务ID中的时间戳
      const timestamp = parseInt(taskId.split('-').pop());
      const elapsedSeconds = (Date.now() - timestamp) / 1000;
      
      // 模拟任务状态变化
      if (elapsedSeconds < 10) {
        // 前10秒为PENDING状态
        return {
          status: 'PENDING',
          message: '任务排队中',
          requestId: `mock-request-${Date.now()}`
        };
      } else if (elapsedSeconds < 30) {
        // 10-30秒为RUNNING状态
        return {
          status: 'RUNNING',
          message: '任务处理中',
          requestId: `mock-request-${Date.now()}`
        };
      } else {
        // 30秒后为SUCCEEDED状态
        // 使用本地上传的视频作为结果（这可能不是真正的处理结果，仅用于UI显示）
        const randomVideo = Math.random() > 0.1 ? '/uploads/videos/sample-result.mp4' : '/uploads/digital-human/video-1589247890123.mp4';
        const mockDuration = Math.floor(Math.random() * 5) + 2; // 2-7秒的随机时长，模拟短视频
        return {
          status: 'SUCCEEDED',
          videoUrl: `http://localhost:8080${randomVideo}`,
          videoDuration: mockDuration, // 添加模拟的视频时长
          requestId: `mock-request-${Date.now()}`
        };
      }
    }
    
    // 真实API调用模式
    const apiUrl = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`;
    
    const response = await axios.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`
      }
    });
    
    console.log('查询VideoRetalk任务状态, 状态码:', response.status);
    
    // 日志完整的响应数据，帮助调试
    console.log('完整响应数据:', JSON.stringify(response.data, null, 2));
    
    // 解析响应
    const { output, request_id } = response.data;
    
    // 获取任务状态
    const task_status = output.task_status;
    
    // 处理不同的任务状态
    if (task_status === 'SUCCEEDED') {
      // 任务成功，从不同可能的位置获取视频URL
      let videoUrl = null;
      let videoDuration = null;
      
      // 检查output.video_url (基于实际日志发现的字段位置)
      if (output.video_url) {
        videoUrl = output.video_url;
        console.log('从output.video_url获取到视频URL:', videoUrl);
      }
      // 尝试从多个可能的位置获取结果URL（根据API文档的不同返回格式）
      else if (output.result && output.result.video_url) {
        // 标准格式: output.result.video_url
        videoUrl = output.result.video_url;
        console.log('从output.result.video_url获取到视频URL:', videoUrl);
        // 尝试获取视频时长
        if (output.result.duration) {
          videoDuration = parseFloat(output.result.duration);
          console.log('从API响应的output.result.duration获取视频时长:', videoDuration);
        }
      } else if (output.results && Array.isArray(output.results) && output.results.length > 0) {
        // 检查 results 数组
        if (output.results[0].url) {
          videoUrl = output.results[0].url;
          console.log('从output.results[0].url获取到视频URL:', videoUrl);
          // 尝试获取视频时长
          if (output.results[0].duration) {
            videoDuration = parseFloat(output.results[0].duration);
            console.log('从API响应的output.results[0].duration获取视频时长:', videoDuration);
          }
        } else if (output.results[0].video_url) {
          videoUrl = output.results[0].video_url;
          console.log('从output.results[0].video_url获取到视频URL:', videoUrl);
          // 尝试获取视频时长
          if (output.results[0].duration) {
            videoDuration = parseFloat(output.results[0].duration);
            console.log('从API响应的output.results[0].duration获取视频时长:', videoDuration);
          }
        }
      } else if (output.results && output.results.url) {
        // results 是对象，直接有 url 字段
        videoUrl = output.results.url;
        console.log('从output.results.url获取到视频URL:', videoUrl);
        // 尝试获取视频时长
        if (output.results.duration) {
          videoDuration = parseFloat(output.results.duration);
          console.log('从API响应的output.results.duration获取视频时长:', videoDuration);
        }
      } else if (output.results && output.results.video_url) {
        // results 是对象，直接有 video_url 字段
        videoUrl = output.results.video_url;
        console.log('从output.results.video_url获取到视频URL:', videoUrl);
        // 尝试获取视频时长
        if (output.results.duration) {
          videoDuration = parseFloat(output.results.duration);
          console.log('从API响应的output.results.duration获取视频时长:', videoDuration);
        }
      } else if (output.result_url) {
        // 直接在 output 下的 result_url
        videoUrl = output.result_url;
        console.log('从output.result_url获取到视频URL:', videoUrl);
      } else if (output.result_urls && Array.isArray(output.result_urls) && output.result_urls.length > 0) {
        // 如果有 result_urls 数组
        videoUrl = output.result_urls[0];
        console.log('从output.result_urls[0]获取到视频URL:', videoUrl);
      }
      
      // 如果没有从具体字段找到视频时长，尝试从其他位置查找
      if (videoDuration === null) {
        // 从API响应的usage.video_duration获取（根据官方API文档，这是推荐的字段）
        if (response.data.usage && response.data.usage.video_duration !== undefined) {
          // 获取浮点数时长，向上取整，确保不满1秒按1秒计算
          videoDuration = Math.ceil(parseFloat(response.data.usage.video_duration));
          console.log(`从API响应的usage.video_duration获取视频时长: ${response.data.usage.video_duration}秒，取整后: ${videoDuration}秒`);
        }
        // 尝试从output.duration获取
        else if (output.duration) {
          videoDuration = Math.ceil(parseFloat(output.duration));
          console.log(`从output.duration获取视频时长: ${output.duration}秒，取整后: ${videoDuration}秒`);
        }
        // 尝试从顶级字段获取
        else if (response.data.duration) {
          videoDuration = Math.ceil(parseFloat(response.data.duration));
          console.log(`从response.data.duration获取视频时长: ${response.data.duration}秒，取整后: ${videoDuration}秒`);
        }
        // 尝试从URL查询参数获取
        else if (videoUrl) {
          try {
            const url = new URL(videoUrl);
            const durationParam = url.searchParams.get('duration');
            if (durationParam && !isNaN(parseFloat(durationParam))) {
              videoDuration = Math.ceil(parseFloat(durationParam));
              console.log(`从URL查询参数duration获取视频时长: ${durationParam}秒，取整后: ${videoDuration}秒`);
            }
          } catch (urlError) {
            console.log('URL解析失败，无法从视频URL获取时长参数');
          }
        }
      }
      
      // 检查获取到的视频URL是否有效
      if (!videoUrl) {
        console.warn('警告: 任务状态为SUCCEEDED但未找到有效的视频URL');
        // 最后尝试直接从response.data寻找video_url
        if (response.data.video_url) {
          videoUrl = response.data.video_url;
          console.log('最终尝试从response.data.video_url获取到视频URL:', videoUrl);
        }
      }
      
      // 如果仍未找到视频URL
      if (!videoUrl) {
        return {
          status: 'FAILED',
          message: '生成成功但视频URL缺失',
          requestId: request_id
        };
      }
      
      // 任务成功，返回视频URL和视频时长（如果可用）
      return {
        status: 'SUCCEEDED',
        videoUrl: videoUrl,
        videoDuration: videoDuration, // 添加视频时长字段到返回数据
        requestId: request_id
      };
    } else if (task_status === 'FAILED') {
      // 任务失败
      return {
        status: 'FAILED',
        message: output.message || '处理失败，请重试',
        requestId: request_id
      };
    } else {
      // 任务仍在处理中
      return {
        status: task_status,
        message: task_status === 'PENDING' ? '任务排队中' : '任务处理中',
        requestId: request_id
      };
    }
  } catch (error) {
    console.error('查询VideoRetalk任务状态失败:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// 添加全局风格化路由
app.use('/api/global-style', globalStyleRoutes);

// 音频上传路由 - 用于多图转视频的背景音乐
app.post('/api/upload-audio', protect, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        message: '未提供音频文件'
      });
    }
    
    // 获取上传的文件
    const filePath = req.file.path;
    
    // 验证文件大小
    const fileStats = fs.statSync(filePath);
    const fileSizeInMB = fileStats.size / (1024 * 1024);
    
    if (fileSizeInMB > 10) {
      // 删除临时文件
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        message: '音频文件过大，不能超过10MB'
      });
    }
    
    // 验证文件类型
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    const allowedExtensions = ['.mp3', '.wav', '.aac', '.m4a'];
    
    if (!allowedExtensions.includes(fileExt)) {
      // 删除临时文件
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        message: '只支持MP3、WAV、AAC和M4A音频格式'
      });
    }
    
    let audioUrl;
    
    try {
      // 上传音频文件到OSS
      console.log('开始将音频上传到阿里云OSS...');
      
      // 使用OSS客户端上传文件
      const fileContent = fs.readFileSync(filePath);
      const ossFileName = `multi-image-videos/audio-${Date.now()}-${uuidv4()}${fileExt}`;
      
      // 使用OSS客户端上传
      const result = await ossClient.put(ossFileName, fileContent);
      
      console.log('音频文件已成功上传到阿里云OSS:', result.url);
      audioUrl = result.url;
      
      if (!audioUrl || !audioUrl.startsWith('http')) {
        throw new Error('OSS未返回有效的URL');
      }
      
      // 删除临时文件
      fs.unlinkSync(filePath);
    } catch (ossError) {
      console.error('上传到阿里云OSS失败:', ossError);
      
      // 如果OSS上传失败但在开发环境，使用本地URL作为备用
      if (process.env.NODE_ENV !== 'production') {
        console.log('开发环境：返回本地文件URL作为备用');
        const localFileName = path.basename(filePath);
        audioUrl = `http://localhost:${port}/uploads/${localFileName}`;
        console.log('使用本地备用URL:', audioUrl);
      } else {
        // 生产环境直接报错
        // 尝试删除临时文件
        try { 
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath); 
          }
        } catch (e) { /* 忽略删除临时文件的错误 */ }
        
        return res.status(500).json({
          success: false,
          message: '上传音频到OSS失败: ' + ossError.message
        });
      }
    }
    
    // 记录上传信息到历史记录
    try {
      await ImageHistory.create({
        userId: req.user.id,
        fileUrl: audioUrl,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: fileStats.size,
        uploadDate: new Date(),
        category: 'audio_for_video',
        status: 'uploaded'
      });
    } catch (dbError) {
      console.error('记录音频上传历史记录失败:', dbError);
      // 继续处理，不影响主流程
    }
    
    // 返回音频URL
    return res.json({
      success: true,
      audioUrl: audioUrl,
      message: '音频上传成功'
    });
  } catch (error) {
    console.error('音频上传处理错误:', error);
    
    // 尝试删除临时文件
    try {
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (e) { /* 忽略删除临时文件的错误 */ }
    
    return res.status(500).json({
      success: false,
      message: '音频上传处理失败: ' + error.message
    });
  }
});

// 在路由配置部分的开始处添加数字人视频处理路由

