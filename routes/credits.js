const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { FeatureUsage } = require('../models/FeatureUsage');
const User = require('../models/User');
const PaymentOrder = require('../models/PaymentOrder');
const { protect } = require('../middleware/auth');
const { FEATURES } = require('../middleware/featureAccess');
const crypto = require('crypto'); // 用于生成签名
const { v4: uuidv4 } = require('uuid');

// 确保全局变量存在 - 用于存储图像智能消除任务信息
if (!global.imageRemovalTasks) {
  global.imageRemovalTasks = {};
}

// 确保全局变量存在 - 用于存储场景图生成任务信息
if (!global.sceneGeneratorTasks) {
  global.sceneGeneratorTasks = {};
}

// 确保全局变量存在 - 用于存储图像上色任务信息
if (!global.imageColorizationTasks) {
  global.imageColorizationTasks = {};
}

// 确保全局变量存在 - 用于存储局部重绘任务信息
if (!global.localRedrawTasks) {
  global.localRedrawTasks = {};
}

// 确保全局变量存在 - 用于存储全局风格化任务信息
if (!global.globalStyleTasks) {
  global.globalStyleTasks = {};
}

// 确保全局变量存在 - 用于存储垫图任务信息
if (!global.diantuTasks) {
  global.diantuTasks = {};
}

// 确保全局变量存在 - 用于存储模特换肤任务信息
if (!global.modelSkinChangerTasks) {
  global.modelSkinChangerTasks = {};
}

// 确保全局变量存在 - 用于存储模特试衣任务信息
if (!global.clothingSimulationTasks) {
  global.clothingSimulationTasks = {};
}

// 确保全局变量存在 - 用于存储智能服饰分割任务信息
if (!global.clothingSegmentationTasks) {
  global.clothingSegmentationTasks = {};
}

// 确保全局变量存在 - 用于存储智能虚拟模特试穿任务信息
if (!global.virtualModelVtonTasks) {
  global.virtualModelVtonTasks = {};
}

// 确保全局变量存在 - 用于存储鞋靴虚拟试穿任务信息
if (!global.virtualShoeModelTasks) {
  global.virtualShoeModelTasks = {};
}

// 确保全局变量存在 - 用于存储文生图片任务信息
if (!global.textToImageTasks) {
  global.textToImageTasks = {};
}

// 确保全局变量存在 - 用于存储指令编辑任务信息
if (!global.imageEditTasks) {
  global.imageEditTasks = {};
}

// 确保全局变量存在 - 用于存储文生视频任务信息
if (!global.textToVideoTasks) {
  global.textToVideoTasks = {};
}

const db = require('../config/db');
const logger = require('../utils/logger');
const axios = require('axios'); // 添加axios用于直接HTTP请求
// 正确引入支付宝SDK v3.2.0版本
const AlipaySdk = require('alipay-sdk').default;
const AlipayFormData = require('alipay-sdk/lib/form').default;
// 引入支付宝API相关类 - 使用官方SDK中的类

// 修改支付宝SDK引入方式 - 直接使用官方SDK的原始类
const { 
  default: AlipayClient, 
  AlipayTradeQueryResponse, 
  WebAlipayTradeQueryResponse 
} = require('alipay-sdk/lib/alipay');

// 确保使用正确的原始API
const AlipayApi = require('alipay-sdk/lib/alipay').default;

// 日志调试支付宝SDK版本
logger.info('AlipaySdk version:', { version: require('alipay-sdk/package.json').version });
logger.info('支付宝SDK配置:', { 
  appId: process.env.ALIPAY_APP_ID,
  // 不输出私钥内容
  privateKeyLength: process.env.ALIPAY_PRIVATE_KEY ? process.env.ALIPAY_PRIVATE_KEY.length : 0,
  signType: 'RSA2',
  // 不输出公钥内容
  publicKeyLength: process.env.ALIPAY_PUBLIC_KEY ? process.env.ALIPAY_PUBLIC_KEY.length : 0
});

// 支付宝支付配置
// 判断是否使用沙箱环境
const isSandbox = process.env.NODE_ENV !== 'production';
const gateway = isSandbox ? 'https://openapi-sandbox.dl.alipaydev.com/gateway.do' : 'https://openapi.alipay.com/gateway.do';

// 支付宝支付配置 - 使用3.x版本的初始化方式
const alipaySdk = new AlipaySdk({
    appId: process.env.ALIPAY_APP_ID,
    privateKey: process.env.ALIPAY_PRIVATE_KEY,
    signType: 'RSA2',
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
    gateway: gateway,
    timeout: 30000, // 增加超时时间到30秒
    camelcase: true
});

// 创建直接访问API的客户端实例 - 按照CSDN文章方式初始化
// 这个是文档提到的标准做法
const directAlipayClient = new AlipayClient({
    appId: process.env.ALIPAY_APP_ID,
    privateKey: process.env.ALIPAY_PRIVATE_KEY,
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY, 
    gateway: gateway,
    timeout: 60000, // 设置更长的超时时间
    charset: 'UTF-8',
    version: '1.0',
    signType: 'RSA2'
});

/**
 * @route   GET /api/credits
 * @desc    获取当前用户积分和使用情况
 * @access  私有
 */
router.get('/', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 获取用户信息
    const user = await User.findByPk(userId, {
      attributes: ['id', 'username', 'credits', 'lastRechargeTime']
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 获取当天日期
    const today = new Date().toISOString().split('T')[0];
    
    // 获取用户所有功能的使用情况
    const usages = await FeatureUsage.findAll({
      where: { userId }
    });
    
    // 按功能整理使用情况
    const featureUsages = {};
    Object.keys(FEATURES).forEach(featureName => {
      const usage = usages.find(u => u.featureName === featureName);
      const config = FEATURES[featureName];
      
      // 计算剩余免费次数 - 不再考虑resetDate，直接根据总使用次数计算
      let remainingFreeUsage = config.freeUsage;
      if (usage) {
        remainingFreeUsage = Math.max(0, config.freeUsage - usage.usageCount);
      }
      
      featureUsages[featureName] = {
        name: featureName,
        creditCost: config.creditCost,
        freeUsageLimit: config.freeUsage,
        remainingFreeUsage: remainingFreeUsage,
        lastUsed: usage ? usage.lastUsedAt : null
      };
    });
    
    // 返回用户积分和使用情况
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          credits: user.credits,
          lastRechargeTime: user.lastRechargeTime
        },
        featureUsages
      }
    });
  } catch (error) {
    console.error('获取积分信息错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，获取积分信息失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/credits/recharge
 * @desc    为用户充值积分
 * @access  私有
 */
router.post('/recharge', protect, async (req, res) => {
  const { amount, paymentMethod, transactionId } = req.body;
  const userId = req.user.id;
  
  // 验证充值金额
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: '请输入有效的充值金额'
    });
  }
  
  try {
    // 在实际应用中，这里应该调用支付API进行实际扣款
    // 为演示目的，我们假设支付已成功
    
    // 更新用户积分
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 更新积分和充值时间
    user.credits += parseInt(amount);
    user.lastRechargeTime = new Date();
    await user.save();
    
    // 返回更新后的积分信息
    res.json({
      success: true,
      message: '积分充值成功',
      data: {
        credits: user.credits,
        rechargeAmount: amount,
        lastRechargeTime: user.lastRechargeTime
      }
    });
  } catch (error) {
    console.error('积分充值错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，积分充值失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/credits/pricing
 * @desc    获取所有功能的价格信息
 * @access  公开
 */
router.get('/pricing', (req, res) => {
  // 创建价格列表
  const pricing = Object.keys(FEATURES).map(featureName => {
    const feature = FEATURES[featureName];
    return {
      name: featureName,
      creditCost: feature.creditCost,
      freeUsage: feature.freeUsage
    };
  });
  
  res.json({
    success: true,
    data: {
      pricing
    }
  });
});

/**
 * 检查是否为开发者账号(lilili1119)的中间件
 */
const checkDeveloper = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['username']
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 只允许lilili1119用户访问开发者功能
    if (user.username !== 'lilili1119') {
      return res.status(403).json({
        success: false,
        message: '无访问权限'
      });
    }

    next();
  } catch (error) {
    console.error('检查开发者权限错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @route   POST /api/credits/dev/set-credits
 * @desc    开发者模式 - 设置用户积分
 * @access  私有 (仅开发者账号)
 */
router.post('/dev/set-credits', protect, checkDeveloper, async (req, res) => {
  const { amount } = req.body;
  const userId = req.user.id;
  
  // 验证积分金额
  if (amount === undefined || isNaN(amount)) {
    return res.status(400).json({
      success: false,
      message: '请输入有效的积分数量'
    });
  }
  
  try {
    // 更新用户积分
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 设置积分
    user.credits = parseInt(amount);
    await user.save();
    
    // 返回更新后的积分信息
    res.json({
      success: true,
      message: '积分设置成功',
      data: {
        credits: user.credits
      }
    });
  } catch (error) {
    console.error('开发者模式设置积分错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，积分设置失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/credits/dev/reset-usage
 * @desc    开发者模式 - 重置功能使用次数
 * @access  私有 (仅开发者账号)
 */
router.post('/dev/reset-usage', protect, checkDeveloper, async (req, res) => {
  const { featureName } = req.body;
  const userId = req.user.id;
  
  try {
    // 如果是重置所有功能
    if (featureName === 'all') {
      // 重置该用户的所有功能使用记录
      await FeatureUsage.destroy({
        where: { userId }
      });
      
      return res.json({
        success: true,
        message: '已重置所有功能的使用次数'
      });
    }
    
    // 验证功能是否存在
    if (!FEATURES[featureName]) {
      return res.status(400).json({
        success: false,
        message: '无效的功能名称'
      });
    }
    
    // 删除特定功能的使用记录
    await FeatureUsage.destroy({
      where: {
        userId,
        featureName
      }
    });
    
    res.json({
      success: true,
      message: `已重置 ${featureName} 的使用次数`
    });
  } catch (error) {
    console.error('开发者模式重置功能使用次数错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，重置功能使用次数失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/credits/track-usage
 * @desc    记录功能使用情况（用于编辑器功能）
 * @access  私有
 */
router.post('/track-usage', protect, async (req, res) => {
  const { action, featureName } = req.body;
  const userId = req.user.id;
  
  // 验证功能名称
  if (!featureName || !FEATURES[featureName]) {
    return res.status(400).json({
      success: false,
      message: '无效的功能名称'
    });
  }

  try {
    // 获取功能配置
    const featureConfig = FEATURES[featureName];
    
    // 获取当天日期，仅用于记录
    const today = new Date().toISOString().split('T')[0];
    
    // 查找或创建该用户对该功能的使用记录
    let [usage, created] = await FeatureUsage.findOrCreate({
      where: {
        userId,
        featureName
      },
      defaults: {
        usageCount: 0,
        lastUsedAt: new Date(),
        resetDate: today
      }
    });

    // 如果是仅查看页面(page_view)不计入使用次数
    const isPageView = action === 'page_view';
    
    if (isPageView) {
      // 页面访问不扣费，只返回当前状态
      return res.json({
        success: true,
        data: {
          featureName,
          usageType: 'page_view',
          creditCost: 0,
          remainingFreeUsage: Math.max(0, featureConfig.freeUsage - usage.usageCount),
          freeUsageLimit: featureConfig.freeUsage,
          freeUsageUsed: usage.usageCount
        }
      });
    }

    // 计算积分消耗（使用与统一中间件相同的逻辑）
    let creditCost = 0;
    if (typeof featureConfig.creditCost === 'function') {
      creditCost = featureConfig.creditCost(req.body);
    } else {
      creditCost = featureConfig.creditCost;
    }

    // 检查是否在免费使用次数内
    let usageType = 'free';
    let finalCreditCost = 0;
    
    if (usage.usageCount >= featureConfig.freeUsage) {
      // 超过免费次数，检查用户积分
      const user = await User.findByPk(userId);
      
      if (user.credits < creditCost) {
        return res.status(402).json({
          success: false,
          message: '您的免费试用次数已用完，积分不足',
          data: {
            requiredCredits: creditCost,
            currentCredits: user.credits,
            freeUsageLimit: featureConfig.freeUsage,
            freeUsageUsed: usage.usageCount
          }
        });
      }
      
      // 扣除积分
      user.credits -= creditCost;
      await user.save();
      
      usageType = 'paid';
      finalCreditCost = creditCost;
      
      console.log(`用户ID ${userId} 使用 ${featureName} 功能，扣除 ${creditCost} 积分，剩余 ${user.credits} 积分`);
    } else {
      console.log(`用户ID ${userId} 使用 ${featureName} 功能的免费次数 ${usage.usageCount + 1}/${featureConfig.freeUsage}`);
    }
    
    // 更新使用次数
    usage.usageCount += 1;
    usage.lastUsedAt = new Date();
    await usage.save();

    // 生成任务ID并保存任务详情
    const taskId = `${featureName}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    
    // 保存任务详情到全局变量（为了兼容现有逻辑）
    const taskInfo = {
      userId: userId,
      creditCost: finalCreditCost,
      hasChargedCredits: usageType === 'paid',
      isFree: usageType === 'free',
      timestamp: new Date()
    };

    // 根据功能类型保存到对应的全局变量
    switch (featureName) {
      case 'scene-generator':
        global.sceneGeneratorTasks[taskId] = taskInfo;
        break;
      case 'image-removal':
        global.imageRemovalTasks[taskId] = taskInfo;
        break;
      case 'marketing-images':
        global.marketingImagesTasks[taskId] = taskInfo;
        break;
      case 'translate':
        global.translateTasks[taskId] = taskInfo;
        break;
      // 可以根据需要添加更多功能
    }

    // 保存任务详情到数据库
    try {
      const details = JSON.parse(usage.details || '{}');
      const tasks = details.tasks || [];
      
      tasks.push({
        taskId: taskId,
        creditCost: finalCreditCost,
        isFree: usageType === 'free',
        timestamp: new Date()
      });
      
      usage.details = JSON.stringify({
        ...details,
        tasks: tasks
      });
      
      await usage.save();
      console.log(`任务详情已保存: 功能=${featureName}, 任务ID=${taskId}, 积分=${finalCreditCost}, 是否免费=${usageType === 'free'}`);
    } catch (e) {
      console.error('保存任务详情失败:', e);
    }

    // 返回结果
    res.json({
      success: true,
      data: {
        featureName,
        usageType,
        creditCost: finalCreditCost,
        isFree: usageType === 'free',
        remainingFreeUsage: Math.max(0, featureConfig.freeUsage - usage.usageCount),
        freeUsageLimit: featureConfig.freeUsage,
        freeUsageUsed: usage.usageCount,
        taskId: taskId
      }
    });

  } catch (error) {
    console.error(`功能 ${featureName} 使用记录处理错误:`, error);
    res.status(500).json({
      success: false,
      message: '服务器错误，无法验证功能访问权限'
    });
  }
});

/**
 * @route   GET /api/credits/usage
 * @desc    获取用户积分使用历史记录
 * @access  私有
 */
router.get('/usage', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 30; // 默认查询30天内记录
    
    // 获取当前日期和指定天数前的日期
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // 创建日期标签和空数据数组（用于图表显示）
    const dateLabels = [];
    const usageData = [];
    
    // 生成从开始日期到今天的所有日期
    for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
      dateLabels.push(d.toISOString().split('T')[0].substring(5)); // 格式为MM-DD
      usageData.push(0); // 初始化为0
    }
    
    // 获取用户的所有功能使用记录，不限时间范围，包含ID字段用于后续更新
    const usages = await FeatureUsage.findAll({
      where: { userId },
      attributes: ['id', 'featureName', 'usageCount', 'lastUsedAt', 'resetDate', 'credits', 'details']
    });
    
    // 初始化功能使用统计
    let featureUsageStats = {};
    let usageRecords = [];
    
    // 跟踪总积分消费和总使用次数
    let totalCreditsUsed = 0;
    let totalAllTimeCreditsUsed = 0;
    let totalUsageCount = 0;
    
    // 添加跟踪统计
    console.log(`开始处理用户ID=${userId}的积分使用统计，总共${usages.length}条功能使用记录`);
    
    // 从featureAccess模块获取功能配置
    const { FEATURES } = require('../middleware/featureAccess');
    
    // 处理每种功能
    Object.keys(FEATURES).forEach(featureName => {
      // 初始化该功能的使用情况
      let totalFeatureCreditCost = 0;
      let allTimeFeatureCreditCost = 0;
      
      // 查找该功能的使用记录
      const usage = usages.find(u => u.featureName === featureName);
      
      console.log(`开始处理${featureName}功能的积分统计，用户ID: ${userId}`);
      
      // 如果没有使用记录，则跳过
      if (!usage) {
        return;
      }
      // 初始化任务列表变量，确保每个功能都有这个变量
      let tasks = [];
      
      // 首先计算该功能的总积分消费（不受时间范围限制）
      if (usage.credits) {
        allTimeFeatureCreditCost = usage.credits;
      }
      
      console.log(`开始处理${featureName}功能的积分统计，用户ID: ${userId}`);
      
      // 从数据库details字段获取任务记录
          if (usage.details) {
            try {
              const details = JSON.parse(usage.details);
          console.log(`成功解析${featureName}功能的details字段:`, details ? '有数据' : '无数据');
              
              if (details && details.tasks && Array.isArray(details.tasks)) {
            console.log(`${featureName}功能的details中包含${details.tasks.length}条任务记录`);
            
            // 先排序任务按时间从新到旧
            details.tasks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                // 过滤出时间范围内的任务
                tasks = details.tasks.filter(task => 
                  new Date(task.timestamp) >= startDate
                );
                
            console.log(`${featureName}功能过滤后在时间范围内的任务数量: ${tasks.length}`);
                
                // 获取任务ID集合，用于去重 - 这很重要，防止任务被重复计算
                const taskIds = new Set(tasks.map(task => task.taskId));
            console.log(`从数据库获取到${tasks.length}条${featureName}任务记录，唯一任务ID数量: ${taskIds.size}`);
            
            // 进行去重处理 - 始终执行去重，防止多个记录条目引用同一任务ID
              console.log(`对${featureName}功能的任务记录进行去重处理`);
              const uniqueTasks = [];
              const processedTaskIds = new Set();
              
              // 首先获取每个任务ID对应的最新任务记录
              const taskMap = new Map();
              for (const task of tasks) {
                const taskId = task.taskId;
                if (!taskId) continue; // 跳过没有任务ID的记录
                
                // 如果是首次遇到此任务ID或者此任务更新，则更新记录
                if (!taskMap.has(taskId) || 
                    (task.creditUpdated && !taskMap.get(taskId).creditUpdated) ||
                    (task.timestamp && new Date(task.timestamp) > new Date(taskMap.get(taskId).timestamp || 0))) {
                  taskMap.set(taskId, task);
                }
              }
              
              // 将最新的任务记录添加到结果中
              for (const task of taskMap.values()) {
                uniqueTasks.push(task);
              }
              
              console.log(`${featureName}功能去重后任务数量从${tasks.length}减少到${uniqueTasks.length}`);
              tasks = uniqueTasks;
            
            // 计算时间范围内的积分消费 - 只统计非免费使用的积分消费
                totalFeatureCreditCost = tasks.reduce((total, task) => {
                  // 如果是免费使用，则不计入积分消费
                  if (task.isFree) {
                    console.log(`跳过免费使用的任务ID=${task.taskId || '未知'}, 积分=0`);
                    return total;
                  }
                  const cost = task.creditCost || 0;
                  console.log(`统计付费任务ID=${task.taskId || '未知'}, 积分=${cost}`);
                  return total + cost;
                }, 0);
            console.log(`从${featureName}功能的任务记录计算的时间范围内积分消费: ${totalFeatureCreditCost}`);
            }
          } catch (parseError) {
          console.error(`解析${featureName}功能的details字段失败:`, parseError);
        }
      }
        
        // 将每次任务作为单独的使用记录
                if (tasks.length > 0) {
        console.log(`将${featureName}功能的${tasks.length}条任务添加到使用记录中`);
        
        tasks.forEach(task => {
          // 免费使用时积分为0
          const creditCost = task.isFree ? 0 : (task.creditCost || 0);
          const taskDate = new Date(task.timestamp || now);
          let description = `使用${getLocalFeatureName(featureName)}功能`;
          
          // 根据功能类型生成不同的描述
          if (featureName === 'DIGITAL_HUMAN_VIDEO') {
            const videoDuration = task.videoDuration || task.duration || task.actualDuration || 0;
            description = `生成${videoDuration}秒视频`;
          } else if (featureName === 'MULTI_IMAGE_TO_VIDEO' || featureName === 'VIDEO_SUBTITLE_REMOVER' || featureName === 'VIDEO_STYLE_REPAINT') {
            // 视频风格重绘和视频相关功能可能在多个字段保存了视频时长
            // 检查所有可能的时长字段，确保至少有一个有效值
            let duration = task.actualDuration || task.duration || task.videoDuration || 0;
            
            // 特别针对视频风格重绘，从任务详情中寻找更多可能的字段
            if (featureName === 'VIDEO_STYLE_REPAINT' && duration === 0) {
              // 如果没找到时长信息，尝试查看是否有分辨率和计算的积分信息来估算时长
              const creditCost = task.creditCost || 0;
              const resolution = task.resolution || task.min_len || 540;
              const rate = resolution <= 540 ? 3 : 6;
              
              // 如果有积分信息和费率，可以反推时长
              if (creditCost > 0 && rate > 0) {
                duration = Math.ceil(creditCost / rate);
                console.log(`通过积分和费率估算视频时长: ${creditCost}积分 / ${rate}积分/秒 = ${duration}秒`);
              }
            }
            
            description = `处理${duration}秒视频`;
          }
          
          // 添加单独的使用记录
          usageRecords.push({
            date: taskDate.toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            }).replace(/\//g, '-'),
            feature: getLocalFeatureName(featureName),
            description: description,
            credits: task.isFree ? "免费" : creditCost, // 免费使用显示"免费"而不是数值0
            isFree: !!task.isFree // 确保将免费使用标记传递给前端
          });
          
          // 更新对应日期的使用量 - 仅统计非免费使用
          // 对于免费使用，不更新积分消费数据
          if (!task.isFree) {
            const numericCreditCost = typeof creditCost === 'number' ? creditCost : 0;
            if (numericCreditCost > 0) {
              const dateIndex = dateLabels.findIndex(date => 
                date === taskDate.toISOString().split('T')[0].substring(5)
              );
              if (dateIndex !== -1) {
                usageData[dateIndex] += numericCreditCost;
              }
            }
          }
        });
      }
      
      // 记录最终统计结果
      console.log(`${featureName}功能统计完成 - 任务数量:${tasks.length}, 积分消费:${totalFeatureCreditCost}`);
      
      // 开始处理图片翻译功能的积分统计，用户ID: ${userId}
      if (featureName === 'translate') {
        // 图片翻译功能的特殊处理
        // 修复积分计算重复问题，仅使用实际任务数量
        let actualUsageCount = 0;
        
        // 如果有任务记录，使用任务的数量而不是数据库中的usageCount
        if (tasks && tasks.length > 0) {
          // 对于图片翻译，统计实际任务数即可，数据库记录可能重复
          actualUsageCount = tasks.length;
          console.log(`图片翻译功能使用任务数量作为实际使用次数: ${actualUsageCount}`);
        } else {
          // 没有任务记录则使用数据库中的记录
          actualUsageCount = usage ? usage.usageCount : 0;
        }
        
        // 将实际使用次数应用到featureUsageStats
        featureUsageStats[featureName] = {
          name: getLocalFeatureName(featureName),
          credits: totalFeatureCreditCost,
          count: actualUsageCount,
          usageCount: actualUsageCount
        };
        
        // 累加总积分消费和总使用次数
        totalCreditsUsed += totalFeatureCreditCost;
        totalAllTimeCreditsUsed += allTimeFeatureCreditCost;
        totalUsageCount += actualUsageCount;
        
        console.log(`设置${featureName}功能的最终统计次数: ${featureUsageStats[featureName].usageCount}`);
      } 
      // 开始处理图生视频功能的积分统计，用户ID: ${userId}
      else if (featureName === 'image-to-video') {
        // 图生视频功能的特殊处理
        // 修复积分计算重复问题，仅使用实际任务数量
        let actualUsageCount = 0;
        
        // 如果有任务记录，使用任务的数量而不是数据库中的usageCount
        if (tasks && tasks.length > 0) {
          // 对于图生视频，统计实际任务数即可，数据库记录可能重复
          actualUsageCount = tasks.length;
          console.log(`图生视频功能使用任务数量作为实际使用次数: ${actualUsageCount}`);
        } else {
          // 没有任务记录则使用数据库中的记录
          actualUsageCount = usage ? usage.usageCount : 0;
        }
        
        // 将实际使用次数应用到featureUsageStats
        featureUsageStats[featureName] = {
          name: getLocalFeatureName(featureName),
          credits: totalFeatureCreditCost,
          count: actualUsageCount,
          usageCount: actualUsageCount
        };
        
        // 累加总积分消费和总使用次数
        totalCreditsUsed += totalFeatureCreditCost;
        totalAllTimeCreditsUsed += allTimeFeatureCreditCost;
        totalUsageCount += actualUsageCount;
        
        console.log(`设置${featureName}功能的最终统计次数: ${featureUsageStats[featureName].usageCount}`);
      } 
      // 特别处理图片高清放大功能(IMAGE_SHARPENING)
      else if (featureName === 'IMAGE_SHARPENING' || featureName === 'image-upscaler' || featureName === 'IMAGE_COLORIZATION' || 
               featureName === 'GLOBAL_STYLE' || featureName === 'LOCAL_REDRAW' || featureName === 'DIANTU' ||
               featureName === 'text-to-video' || featureName === 'image-to-video' || 
               featureName === 'MULTI_IMAGE_TO_VIDEO' || featureName === 'VIDEO_STYLE_REPAINT' || featureName === 'DIGITAL_HUMAN_VIDEO') {
        // 图片和视频相关功能的特殊处理（图片高清放大、图片上色、全局风格化、局部重绘、垫图、文生视频、图生视频、多图转视频、视频风格重绘）
        // 修复积分计算重复问题，仅使用实际任务数量
        let actualUsageCount = 0;
        
        // 如果有任务记录，使用任务的数量而不是数据库中的usageCount
        if (tasks && tasks.length > 0) {
          // 统计实际任务数即可，数据库记录可能重复
          actualUsageCount = tasks.length;
          
          // 根据功能名称设置显示名称
          let featureNameDisplay = '';
          switch(featureName) {
            case 'IMAGE_COLORIZATION': 
              featureNameDisplay = '图片上色'; 
              break;
            case 'IMAGE_SHARPENING':
            case 'image-upscaler':
              featureNameDisplay = '图片高清放大';
              break;
            case 'GLOBAL_STYLE':
              featureNameDisplay = '全局风格化';
              break;
            case 'LOCAL_REDRAW':
              featureNameDisplay = '局部重绘';
              break;
            case 'DIANTU':
              featureNameDisplay = '垫图';
              break;
            case 'DIGITAL_HUMAN_VIDEO':
              featureNameDisplay = '视频数字人';
              break;
            default:
              featureNameDisplay = getLocalFeatureName(featureName);
          }
          
          console.log(`${featureNameDisplay}功能使用任务数量作为实际使用次数: ${actualUsageCount}`);
          
          // 计算免费任务和付费任务的数量
          const freeTasks = tasks.filter(task => task.isFree === true);
          const paidTasks = tasks.filter(task => !task.isFree);
          console.log(`${featureNameDisplay}功能免费任务数: ${freeTasks.length}, 付费任务数: ${paidTasks.length}`);
          
          // 验证积分消费是否正确
          const calculatedCost = paidTasks.reduce((sum, task) => sum + (task.creditCost || 0), 0);
          console.log(`${featureNameDisplay}功能积分计算: 从任务计算=${calculatedCost}，当前值=${totalFeatureCreditCost}`);
          
          // 始终使用从任务计算得出的积分消费，这样可以确保免费任务不会被计入
          totalFeatureCreditCost = calculatedCost;
          
          // 更新任务列表，确保免费任务正确标记
          for (const task of tasks) {
            if (task.isFree === undefined) {
              console.log(`发现未标记是否免费的任务ID=${task.taskId || '未知'}，检查积分值确定是否免费`);
              task.isFree = !task.creditCost || task.creditCost === 0;
              console.log(`根据积分值${task.creditCost}将任务标记为${task.isFree ? '免费' : '付费'}`);
            }
          }
        } else {
          // 没有任务记录则使用数据库中的记录
          actualUsageCount = usage ? usage.usageCount : 0;
          
          // 根据功能名称设置显示名称
          let featureNameDisplay = '';
          switch(featureName) {
            case 'IMAGE_COLORIZATION': 
              featureNameDisplay = '图片上色'; 
              break;
            case 'IMAGE_SHARPENING':
            case 'image-upscaler':
              featureNameDisplay = '图片高清放大';
              break;
            case 'GLOBAL_STYLE':
              featureNameDisplay = '全局风格化';
              break;
            case 'LOCAL_REDRAW':
              featureNameDisplay = '局部重绘';
              break;
            case 'DIANTU':
              featureNameDisplay = '垫图';
              break;
            case 'DIGITAL_HUMAN_VIDEO':
              featureNameDisplay = '视频数字人';
              break;
            default:
              featureNameDisplay = getLocalFeatureName(featureName);
          }
          
          console.log(`${featureNameDisplay}功能没有任务记录，使用数据库记录的使用次数: ${actualUsageCount}`);
        }
        
        // 确保功能统计数据正确反映实际使用情况，包括免费使用和付费使用
        featureUsageStats[featureName] = {
          name: getLocalFeatureName(featureName),
          credits: totalFeatureCreditCost,
          count: actualUsageCount,
          usageCount: actualUsageCount,
          freeTasks: tasks ? tasks.filter(task => task.isFree === true).length : 0,
          paidTasks: tasks ? tasks.filter(task => !task.isFree).length : 0
        };
        
        // 仅累加付费使用的积分消费
        totalCreditsUsed += totalFeatureCreditCost;
        totalAllTimeCreditsUsed += allTimeFeatureCreditCost;
        totalUsageCount += actualUsageCount;
        
        console.log(`设置${featureName}功能的最终统计: 总次数=${featureUsageStats[featureName].usageCount}, 积分消费=${totalFeatureCreditCost}, 免费次数=${featureUsageStats[featureName].freeTasks}, 付费次数=${featureUsageStats[featureName].paidTasks}`);
      } else {
        // 获取正确的使用次数 - 对于大多数功能，我们应该使用实际任务数
        // 对于亚马逊助手功能，需要额外处理可能出现的重复计数问题
        let actualUsageCount;
        
        // 对于亚马逊类型的功能，使用任务数作为实际使用次数，避免前端重复记录问题
        if (featureName.startsWith('amazon_') || featureName === 'product_comparison' || 
            featureName === 'product_improvement_analysis' || featureName === 'fba_claim_email') {
          // 使用去重后的任务数作为实际使用次数，防止重复计数
          actualUsageCount = tasks.length > 0 ? tasks.length : (usage ? usage.usageCount : 0);
          console.log(`亚马逊助手功能${featureName}使用任务数作为实际使用次数: ${actualUsageCount}`);
        } else {
          // 其他功能仍然使用数据库记录的使用次数
          actualUsageCount = usage ? usage.usageCount : 0;
        }
        
        // 对于数字人视频等特殊功能，已经在任务记录中计算了积分消费，直接使用任务记录的积分总和
        if (featureName === 'DIGITAL_HUMAN_VIDEO' || featureName === 'MULTI_IMAGE_TO_VIDEO' || 
            featureName === 'VIDEO_SUBTITLE_REMOVER' || featureName === 'VIDEO_STYLE_REPAINT' ||
            featureName === 'IMAGE_EXPANSION' || featureName === 'IMAGE_SHARPENING' ||
            featureName === 'image-upscaler' || featureName === 'scene-generator' ||
            featureName === 'marketing-images' || featureName === 'translate' || featureName === 'cutout' ||
            featureName === 'VIRTUAL_MODEL_VTON' || featureName === 'IMAGE_COLORIZATION' ||
            featureName === 'GLOBAL_STYLE' || featureName === 'DIANTU' || featureName === 'image-removal' ||
            featureName === 'LOCAL_REDRAW' || featureName === 'text-to-video' || featureName === 'image-to-video') {
          // 这些功能已经在任务中计算了积分消费，不需要再使用数据库记录中的积分
          console.log(`特殊功能${featureName}，使用任务记录中的积分消费: ${totalFeatureCreditCost}`);
          
          // 修复多图转视频功能积分统计问题
          if (featureName === 'MULTI_IMAGE_TO_VIDEO' && totalFeatureCreditCost === 0 && tasks.length > 0) {
            // 根据任务数量和默认积分消耗计算
            totalFeatureCreditCost = tasks.length * 30; // 每个任务默认30积分
            console.log(`修复多图转视频功能积分统计: ${tasks.length}个任务 x 30积分 = ${totalFeatureCreditCost}积分`);
            
            // 确保每个任务都有正确的记录添加到usageRecords中
            for (const task of tasks) {
              // 为每个任务创建使用记录
              if (!usageRecords.some(record => record.taskId === task.taskId)) {
                // 添加到使用记录
                const recordDate = formatDate(task.timestamp || new Date());
                usageRecords.push({
                  date: recordDate,
                  feature: getLocalFeatureName(featureName),
                  description: task.description || '多图转视频',
                  credits: 30, // 每个任务30积分
                  taskId: task.taskId,
                  isFree: false
                });
                
                // 更新时段积分消费统计
                // 将30积分添加到对应日期的usageData中
                const dateStr = recordDate.split(' ')[0]; // 只取日期部分
                const dateIndex = dateLabels.indexOf(dateStr);
                if (dateIndex !== -1) {
                  usageData[dateIndex] += 30;
                  console.log(`为日期 ${dateStr} 添加了30积分消费，累计: ${usageData[dateIndex]}`);
                }
                
                console.log(`为多图转视频任务ID=${task.taskId}添加了使用记录`);
              }
            }
            
            // 确保总消费积分更新
            totalCreditsUsed += totalFeatureCreditCost;
            console.log(`更新总积分消费: ${totalCreditsUsed} (新增多图转视频积分: ${totalFeatureCreditCost})`);
          }
        } 
        // 对于其他功能，仍然使用数据库记录的积分消费
        else if (usage && usage.credits > 0) {
          // 总积分使用最准确的来源是数据库记录
          totalFeatureCreditCost = usage.credits;
          console.log(`使用数据库记录的${featureName}功能积分消费作为最终统计: ${totalFeatureCreditCost}`);
        }
        
        console.log(`${featureName}功能最终使用次数: ${actualUsageCount} (数据库记录: ${usage ? usage.usageCount : 0}, 任务数: ${tasks.length})`);
        
        // 将功能记录添加到统计数据中
          featureUsageStats[featureName] = {
            name: getLocalFeatureName(featureName),
            credits: totalFeatureCreditCost,
        count: actualUsageCount,
        usageCount: actualUsageCount
      };
      
      // 累加总积分消费和总使用次数
      totalCreditsUsed += totalFeatureCreditCost;
      totalAllTimeCreditsUsed += allTimeFeatureCreditCost;
      totalUsageCount += actualUsageCount;
      
      console.log(`设置${featureName}功能的最终统计次数: ${featureUsageStats[featureName].usageCount}`);
    }
  });
    
    // 按日期降序排序
    usageRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // 计算功能使用百分比
    const featureUsage = [];
    
    // 修改逻辑：即使totalCreditsUsed为0，也显示功能使用情况
    // 定义不同功能的颜色 - 使用完全不同的鲜明颜色方案
    const colors = {
      // 主要原色系
      'image-upscaler': 'rgb(220, 53, 69)',        // 图像高清放大 - 鲜红色
      'text-to-video': 'rgb(176, 15, 20)',         // 文生视频 - 深红色
      'VIDEO_STYLE_REPAINT': 'rgb(240, 96, 96)',   // 视频风格重绘 - 浅红色
      
      // 橙色系
      'VIDEO_SUBTITLE_REMOVER': 'rgb(253, 126, 20)', // 视频去除字幕 - 橙色
      'cutout': 'rgb(255, 193, 7)',                // 商品换背景 - 金黄色
      'IMAGE_EDIT': 'rgb(214, 158, 46)',           // 图像指令编辑 - 金棕色
      
      // 黄色系
      'amazon_review_analysis': 'rgb(255, 236, 0)',  // 亚马逊客户评论分析 - 鲜黄色
      
      // 绿色系 - 使用不同色调
      'translate': 'rgb(16, 185, 129)',            // 图片翻译 - 蓝绿色
      'IMAGE_EXPANSION': 'rgb(170, 222, 40)',      // 智能扩图 - 黄绿色（柠檬绿）
      'IMAGE_SHARPENING': 'rgb(40, 167, 69)',      // 模糊图片变清晰 - 深绿色
      'IMAGE_COLORIZATION': 'rgb(0, 230, 118)',    // 图像上色 - 浅绿色
      
      // 蓝色系 - 使用不同色调
      'DIGITAL_HUMAN_VIDEO': 'rgb(7, 71, 166)',    // 视频数字人 - 深蓝色
      'scene-generator': 'rgb(32, 156, 238)',      // 场景图生成 - 天蓝色
      'GLOBAL_STYLE': 'rgb(0, 123, 255)',          // 全局风格化 - 亮蓝色
      'image-to-video': 'rgb(13, 71, 161)',        // 图生视频 - 海军蓝
      'marketing-images': 'rgb(83, 109, 254)',     // AI营销图生成 - 靛蓝色
      
      // 青色系
      'VIRTUAL_MODEL_VTON': 'rgb(0, 188, 212)',    // 智能虚拟模特试穿 - 青色
      
      // 紫色系 - 使用不同色调
      'model-skin-changer': 'rgb(139, 92, 246)',   // 模特换肤 - 紫色
      'CLOTH_SEGMENTATION': 'rgb(96, 19, 186)',    // 智能服饰分割 - 深紫色
      'MULTI_IMAGE_TO_VIDEO': 'rgb(186, 104, 200)', // 多图转视频 - 淡紫色
      'LOCAL_REDRAW': 'rgb(233, 30, 99)',          // 局部重绘 - 粉红色
      
      // 棕色系
      'clothing-simulation': 'rgb(130, 74, 54)',   // 模拟试衣 - 棕色
      
      // 灰黑系
      'image-removal': 'rgb(52, 58, 64)',          // 图像智能消除 - 深灰色
      'DIANTU': 'rgb(73, 80, 87)',                 // 垫图 - 灰色
      
      // 亚马逊功能相关颜色
      'amazon_video_script': 'rgb(75, 192, 192)',     // 亚马逊广告视频脚本生成
      'product_improvement_analysis': 'rgb(255, 159, 64)', // 选品的改款分析和建议
      'amazon_brand_info': 'rgb(54, 162, 235)',      // 品牌信息收集和总结
      'amazon_brand_naming': 'rgb(255, 99, 132)',    // 亚马逊品牌起名
      'amazon_listing': 'rgb(255, 206, 86)',         // 亚马逊Listing写作与优化
      'amazon_search_term': 'rgb(153, 102, 255)',    // 亚马逊后台搜索词
      'amazon_review_analysis': 'rgb(255, 159, 64)', // 亚马逊客户评论分析
      'amazon_consumer_insights': 'rgb(54, 162, 235)', // 亚马逊消费者洞察专家
      'amazon_customer_email': 'rgb(255, 99, 132)',  // 亚马逊客户邮件回复
      'fba_claim_email': 'rgb(75, 192, 192)',    // FBA索赔邮件
      'amazon_review_generator': 'rgb(153, 102, 255)', // 亚马逊评论生成
      'amazon_review_response': 'rgb(255, 159, 64)', // 亚马逊评论回复
      'product_comparison': 'rgb(255, 159, 64)',     // 产品对比
      'amazon_post_creator': 'rgb(75, 192, 192)',    // 创建亚马逊Post
      'amazon_keyword_recommender': 'rgb(153, 102, 255)', // 亚马逊关键词推荐
      'amazon_case_creator': 'rgb(255, 159, 64)',     // 亚马逊客服case内容
      'DIANTU': '垫图',
    };
    
    Object.keys(featureUsageStats).forEach(key => {
      const stat = featureUsageStats[key];
      // 添加所有有使用记录的功能，即使credits为0
      if (stat.count > 0) {
        // 为多图转视频功能添加usageCount属性，用于前端统计
        const item = {
          name: stat.name,
          credits: stat.credits,
          percentage: totalCreditsUsed > 0 ? parseFloat(((stat.credits / totalCreditsUsed) * 100).toFixed(2)) : 0,
          color: colors[key] || 'rgb(107, 114, 128)' // 默认颜色
        };
        
        // 为所有功能添加使用次数属性
          item.usageCount = stat.count;
        
        // 记录日志
        if (key === 'DIGITAL_HUMAN_VIDEO') {
          console.log(`添加视频数字人使用次数: ${stat.count}`);
        } else if (key === 'MULTI_IMAGE_TO_VIDEO') {
          console.log(`添加多图转视频使用次数: ${stat.count}`);
        } else if (key === 'VIDEO_STYLE_REPAINT') {
          console.log(`添加视频风格重绘使用次数: ${stat.count}`);
        } else if (key === 'VIDEO_SUBTITLE_REMOVER') {
          console.log(`添加视频去除字幕使用次数: ${stat.count}`);
        }
        
        featureUsage.push(item);
      }
    });
    
    // 按使用次数降序排序 (如果积分消费都是0，则按使用次数排序)
    if (totalCreditsUsed === 0) {
      featureUsage.sort((a, b) => {
        const statA = featureUsageStats[Object.keys(featureUsageStats).find(key => 
          featureUsageStats[key].name === a.name)];
        const statB = featureUsageStats[Object.keys(featureUsageStats).find(key => 
          featureUsageStats[key].name === b.name)];
        return statB.count - statA.count;
      });
    } else {
      // 按消费积分降序排序
      featureUsage.sort((a, b) => b.credits - a.credits);
    }
    
    // 返回数据
    res.json({
      success: true,
      data: {
        summary: {
          totalCreditsUsed,
          totalAllTimeCreditsUsed,
          totalUsageCount,
          featureCount: Object.keys(featureUsageStats).length
        },
        chartData: {
          labels: dateLabels,
          data: usageData
        },
        featureUsage,
        usageRecords,
        totalRecords: usageRecords.length
      }
    });
  } catch (error) {
    console.error('获取积分使用历史出错:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，无法获取积分使用历史',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 获取功能的本地化名称
 */
function getLocalFeatureName(featureName) {
  const featureNames = {
    'image-upscaler': '图像高清放大',
    'marketing-images': 'AI营销图生成',
    'cutout': '商品换背景',
    'translate': '图片翻译',
    'scene-generator': '场景图生成',
    'image-removal': '图像智能消除',
    'model-skin-changer': '模特换肤',
    'clothing-simulation': '模拟试衣',
    'text-to-video': '文生视频',
    'image-to-video': '图生视频',
    'IMAGE_EDIT': '指令编辑',
    'LOCAL_REDRAW': '局部重绘',
    'IMAGE_COLORIZATION': '图像上色',
    'IMAGE_EXPANSION': '智能扩图',
    'VIRTUAL_SHOE_MODEL': '鞋靴虚拟试穿',
    'TEXT_TO_IMAGE': '文生图片',
    'IMAGE_SHARPENING': '模糊图片变清晰',
    'CLOTH_SEGMENTATION': '智能服饰分割',
    'GLOBAL_STYLE': '全局风格化',
    'VIRTUAL_MODEL_VTON': '智能虚拟模特试穿',
    'VIDEO_SUBTITLE_REMOVER': '视频去除字幕',
    'MULTI_IMAGE_TO_VIDEO': '多图转视频',
    'DIGITAL_HUMAN_VIDEO': '视频数字人',
    'VIDEO_STYLE_REPAINT': '视频风格重绘',
    'DIANTU': '垫图',
    'amazon_video_script': '亚马逊广告视频脚本生成',
    'product_improvement_analysis': '选品的改款分析和建议',
    'amazon_brand_info': '品牌信息收集和总结',
    'amazon_brand_naming': '亚马逊品牌起名',
    'amazon_listing': '亚马逊Listing写作与优化',
    'amazon_search_term': '亚马逊后台搜索词',
    'amazon_review_analysis': '亚马逊客户评论分析',
    'amazon_consumer_insights': '亚马逊消费者洞察专家',
    'amazon_customer_email': '亚马逊客户邮件回复',
    'fba_claim_email': 'FBA索赔邮件',
    'amazon_review_generator': '亚马逊评论生成',
    'amazon_review_response': '亚马逊评论回复',
    'product_comparison': '产品对比',
    'amazon_post_creator': '创建亚马逊Post',
    'amazon_keyword_recommender': '亚马逊关键词推荐',
    'amazon_case_creator': '亚马逊客服case内容'
  };
  
  return featureNames[featureName] || featureName;
}

// 添加formatDate函数定义
function formatDate(date) {
  if (!date) return '';
  try {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch (e) {
    console.error('日期格式化错误:', e);
    return '';
  }
}

// 创建支付宝支付订单
router.post('/alipay/create', protect, async (req, res) => {
    try {
        const { amount } = req.body;
        
        if (!amount || isNaN(amount) || amount < 10) {
            return res.status(400).json({ success: false, message: '无效的充值金额' });
        }
        
        // 使用Sequelize ORM方式创建订单记录
        logger.info('开始创建订单', { amount, userId: req.user.id });
        const orderNumber = `AL${Date.now()}${Math.floor(Math.random() * 1000)}`;
        
        // 计算对应的人民币金额
        let price = 0;
        if (parseInt(amount) === 800) price = 99;
        else if (parseInt(amount) === 3980) price = 399;
        else if (parseInt(amount) === 6730) price = 599;
        else if (parseInt(amount) === 12500) price = 999;
        else if (parseInt(amount) === 198) price = 59;
        else price = Math.ceil(parseInt(amount) * 0.12); // 默认比例
        
        // 使用Sequelize ORM创建订单
        const order = await PaymentOrder.create({
            user_id: req.user.id,
            amount: parseInt(amount),
            price: price,
            status: 'pending',
            payment_method: 'alipay',
            order_number: orderNumber,
            qrcode_expire_time: new Date(Date.now() + 15 * 60 * 1000) // 二维码15分钟有效期
        });
        
        logger.info('订单创建成功', { 
            orderId: order.id, 
            orderNumber: order.order_number 
        });
        
        // 使用表单方式创建支付宝支付链接 - 这是最简单可靠的方式
        try {
            // 创建表单实例
            const formData = new AlipayFormData();
            // 设置返回格式为页面跳转格式
            formData.setMethod('get');
            
            // 设置支付页面回跳地址 - 使用自定义路由
            formData.addField('returnUrl', `${process.env.BASE_URL}/api/credits/alipay/return`);
            // 设置异步通知地址
            formData.addField('notifyUrl', `${process.env.BASE_URL}/api/credits/alipay/notify`);
            
            // 设置业务数据
            formData.addField('bizContent', JSON.stringify({
                out_trade_no: orderNumber,               // 订单号
                product_code: 'FAST_INSTANT_TRADE_PAY',  // 产品码
                total_amount: price.toFixed(2),          // 订单金额
                subject: `萤火AI积分充值-${amount}积分`,  // 订单标题
                body: `萤火AI积分充值-${amount}积分`,     // 订单描述
                timeout_express: '15m'                   // 设置订单超时时间为15分钟
            }));
            
            logger.info('准备调用支付宝支付接口', { 
                orderNumber, 
                price, 
                returnUrl: `${process.env.BASE_URL}/api/credits/alipay/return`,
                notifyUrl: `${process.env.BASE_URL}/api/credits/alipay/notify`
            });
            
            // 调用 SDK 生成支付链接
            const paymentUrl = await alipaySdk.exec(
                'alipay.trade.page.pay', // 统一下单接口
                {},                      // 无需额外参数
                { formData: formData }   // 传入表单参数
            );
            
            logger.info('支付宝支付链接生成成功', { 
                orderNumber, 
                paymentUrl: paymentUrl ? (paymentUrl.substring(0, 100) + '...') : '链接为空'
            });
            
            // 如果生成URL成功
            if (paymentUrl) {
                return res.json({
                    success: true,
                    data: {
                        orderId: order.id,
                        orderNumber: order.order_number,
                        paymentUrl: paymentUrl,
                        expireTime: order.qrcode_expire_time
                    }
                });
            } else {
                // 未能生成URL
                logger.error('无法生成支付宝支付链接', { orderNumber });
                await order.update({ status: 'failed' });
                
                return res.status(500).json({
                    success: false,
                    message: '生成支付链接失败，请稍后重试'
                });
            }
        } catch (sdkError) {
            logger.error('支付宝SDK调用失败', { 
                error: sdkError.message, 
                stack: sdkError.stack,
                userId: req.user.id,
                orderNumber
            });
            
            // 更新订单状态为失败
            await order.update({ status: 'failed' });
            
            return res.status(500).json({ 
                success: false, 
                message: '调用支付宝接口失败，请稍后重试', 
                error: sdkError.message 
            });
        }
    } catch (error) {
        logger.error('创建支付宝订单出错', { 
            error: error.message, 
            stack: error.stack,
            userId: req.user.id
        });
        res.status(500).json({ 
            success: false, 
            message: '创建支付订单失败，请稍后重试', 
            error: error.message 
        });
    }
});

// 支付宝支付结果同步回调接口
router.get('/alipay/return', async (req, res) => {
    try {
        const params = req.query;
        logger.info('收到支付宝同步回调', { 
            params: JSON.stringify(params),
            outTradeNo: params.out_trade_no,
            tradeNo: params.trade_no
        });
        
        // 如果包含了trade_no，表示支付可能已经成功
        if (params.trade_no && params.out_trade_no) {
            // 查询订单
            const order = await PaymentOrder.findOne({
                where: { order_number: params.out_trade_no }
            });
            
            if (order && order.status !== 'completed') {
                // 主动查询一次支付宝订单状态
                try {
                    const formData = new AlipayFormData();
                    formData.setMethod('get');
                    
                    formData.addField('bizContent', JSON.stringify({
                        out_trade_no: params.out_trade_no
                    }));
                    
                    const tradeQueryResult = await alipaySdk.exec(
                        'alipay.trade.query',
                        {},
                        { formData: formData }
                    );
                    
                    // 尝试解析查询结果
                    try {
                        const queryResponse = JSON.parse(tradeQueryResult);
                        
                        // 如果交易成功或交易完成
                        if (queryResponse.alipay_trade_query_response && 
                            (queryResponse.alipay_trade_query_response.trade_status === 'TRADE_SUCCESS' || 
                             queryResponse.alipay_trade_query_response.trade_status === 'TRADE_FINISHED')) {
                            
                            // 更新订单状态
                            order.status = 'completed';
                            order.transaction_id = params.trade_no || queryResponse.alipay_trade_query_response.trade_no;
                            order.payment_time = new Date();
                            await order.save();
                            
                            // 更新用户积分
                            const user = await User.findByPk(order.user_id);
                            if (user) {
                                user.credits = user.credits + order.amount;
                                user.lastRechargeTime = new Date();
                                await user.save();
                                
                                logger.info('同步回调: 用户积分已更新', { 
                                    userId: user.id, 
                                    credits: user.credits,
                                    amount: order.amount
                                });
                            }
                            
                            logger.info('同步回调: 订单已标记为完成', { 
                                orderNumber: order.order_number 
                            });
                        }
                    } catch (parseError) {
                        logger.warn('同步回调: 解析查询结果失败', { 
                            error: parseError.message 
                        });
                    }
                } catch (queryError) {
                    logger.warn('同步回调: 查询订单状态出错', { 
                        error: queryError.message 
                    });
                }
            }
        }
        
        // 无论处理结果如何，都重定向到结果页面，让前端页面继续查询处理
        res.redirect(`/credits-result.html?out_trade_no=${params.out_trade_no}&trade_no=${params.trade_no || ''}`);
    } catch (error) {
        logger.error('处理支付宝同步回调出错', { 
            error: error.message, 
            stack: error.stack,
            query: req.query
        });
        res.redirect('/credits-result.html?error=process_failed');
    }
});

// 查询支付宝订单状态
router.get('/alipay/query/:orderNumber', protect, async (req, res) => {
    try {
        const { orderNumber } = req.params;
        
        // 查询订单
        const order = await PaymentOrder.findOne({
            where: { 
                order_number: orderNumber,
                user_id: req.user.id
            }
        });
        
        if (!order) {
            return res.status(404).json({ success: false, message: '订单不存在' });
        }
        
        if (order.status === 'completed') {
            return res.json({
                success: true,
                data: {
                    status: 'completed',
                    message: '充值成功',
                    credits: order.amount
                }
            });
        }
        
        // 检查二维码是否过期
        const now = new Date();
        if (order.qrcode_expire_time && now > new Date(order.qrcode_expire_time)) {
            logger.info('订单二维码已过期', { orderNumber });
            return res.json({
                success: true,
                data: {
                    status: 'expired',
                    message: '支付二维码已过期，请重新发起支付'
                }
            });
        }
        
        // 尝试主动查询一次订单状态 - 使用AlipaySdk查询
        try {
            const formData = new AlipayFormData();
            formData.setMethod('get');
            
            formData.addField('bizContent', JSON.stringify({
                out_trade_no: orderNumber
            }));
            
            // 执行查询
            const tradeQueryResult = await alipaySdk.exec(
                'alipay.trade.query',
                {},
                { formData: formData }
            );
            
            // 尝试解析查询结果
            try {
                const queryResponse = JSON.parse(tradeQueryResult);
                logger.info('订单查询结果', { 
                    orderNumber,
                    tradeStatus: queryResponse.alipay_trade_query_response ? 
                        queryResponse.alipay_trade_query_response.trade_status : '未知'
                });
                
                // 如果交易成功或交易完成
                if (queryResponse.alipay_trade_query_response && 
                    (queryResponse.alipay_trade_query_response.trade_status === 'TRADE_SUCCESS' || 
                     queryResponse.alipay_trade_query_response.trade_status === 'TRADE_FINISHED')) {
                    
                    // 更新订单状态
                    order.status = 'completed';
                    order.transaction_id = queryResponse.alipay_trade_query_response.trade_no;
                    order.payment_time = new Date();
                    await order.save();
                    
                    // 更新用户积分
                    const user = await User.findByPk(order.user_id);
                    if (user) {
                        user.credits = user.credits + order.amount;
                        user.lastRechargeTime = new Date();
                        await user.save();
                        
                        logger.info('用户积分已更新', { 
                            userId: user.id, 
                            orderId: order.id, 
                            credits: user.credits
                        });
                    }
                    
                    return res.json({
                        success: true,
                        data: {
                            status: 'completed',
                            message: '充值成功',
                            credits: order.amount
                        }
                    });
                }
            } catch (parseError) {
                logger.warn('解析订单查询结果失败', { 
                    error: parseError.message, 
                    orderNumber 
                });
            }
        } catch (queryError) {
            logger.warn('主动查询订单状态出错', { 
                error: queryError.message, 
                orderNumber 
            });
        }
        
        // 支付宝支付主要依赖异步通知进行状态更新
        // 这里只返回处理中状态，由前端定期查询，后端通过异步通知更新订单状态
        return res.json({
            success: true,
            data: {
                status: 'pending',
                message: '订单处理中，请在支付宝完成支付后返回此页面查看结果'
            }
        });
    } catch (error) {
        logger.error('查询支付宝订单状态处理失败', { 
            error: error.message, 
            stack: error.stack,
            userId: req.user.id 
        });
        res.status(500).json({ success: false, message: '查询订单状态失败', error: error.message });
    }
});

// 支付宝支付结果异步通知
router.post('/alipay/notify', async (req, res) => {
    try {
        const params = req.body;
        logger.info('收到支付宝异步通知', { 
            params: JSON.stringify(params),
            out_trade_no: params.out_trade_no, 
            trade_status: params.trade_status 
        });
        
        // 简单验证必要字段是否存在
        if (!params.out_trade_no || !params.trade_status) {
            logger.error('支付宝通知: 缺少必要字段', { params });
            return res.send('fail');
        }
        
        // 获取商户订单号
        const outTradeNo = params.out_trade_no;
        const tradeStatus = params.trade_status;
        
        // 查询订单
        const order = await PaymentOrder.findOne({
            where: { order_number: outTradeNo }
        });
        
        if (!order) {
            logger.error('支付宝通知: 订单不存在', { outTradeNo });
            return res.send('fail');
        }
        
        // 检查订单是否已处理
        if (order.status === 'completed') {
            logger.info('支付宝通知: 订单已处理', { outTradeNo });
            return res.send('success');
        }
        
        // 如果交易成功或完成
        if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
            // 更新订单状态
            order.status = 'completed';
            order.transaction_id = params.trade_no;
            order.payment_time = new Date();
            await order.save();
            
            // 更新用户积分
            const user = await User.findByPk(order.user_id);
            if (user) {
                user.credits = user.credits + order.amount;
                user.lastRechargeTime = new Date();
                await user.save();
                
                logger.info('支付宝通知: 积分已更新', { 
                    userId: order.user_id, 
                    orderId: order.id, 
                    amount: order.amount, 
                    credits: user.credits
                });
            }
            
            logger.info('支付宝通知: 充值成功', { 
                userId: order.user_id, 
                orderId: order.id, 
                amount: order.amount, 
                tradeNo: params.trade_no 
            });
            
            // 向支付宝返回成功
            return res.send('success');
        } else {
            // 其他交易状态，记录日志
            logger.info('支付宝通知: 交易未完成', { 
                outTradeNo, 
                tradeStatus 
            });
            return res.send('success');
        }
    } catch (error) {
        logger.error('处理支付宝通知出错', { 
            error: error.message, 
            stack: error.stack,
            body: req.body
        });
        res.send('fail');
    }
});

// 充值积分 (测试用，实际应用中会通过支付宝回调)
router.post('/recharge', protect, async (req, res) => {
    try {
        const { amount, paymentMethod, transactionId } = req.body;
        
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ success: false, message: '无效的充值金额' });
        }
        
        // 开始事务
        await db.query('BEGIN');
        
        // 增加用户积分
        const result = await db.query(
            'UPDATE users SET credits = credits + $1, last_recharge_time = NOW() WHERE id = $2 RETURNING credits, last_recharge_time',
            [amount, req.user.id]
        );
        
        // 记录充值记录
        await db.query(
            'INSERT INTO recharge_records (user_id, amount, payment_method, transaction_id) VALUES ($1, $2, $3, $4)',
            [req.user.id, amount, paymentMethod, transactionId]
        );
        
        // 提交事务
        await db.query('COMMIT');
        
        logger.info('用户充值积分成功', { 
            userId: req.user.id, 
            amount, 
            method: paymentMethod, 
            transactionId 
        });
        
        res.json({
            success: true,
            message: '积分充值成功',
            data: {
                credits: result.rows[0].credits,
                lastRechargeTime: result.rows[0].last_recharge_time
            }
        });
    } catch (error) {
        // 回滚事务
        await db.query('ROLLBACK');
        
        logger.error('充值积分出错', { error: error.message, userId: req.user.id });
        res.status(500).json({ success: false, message: '充值积分失败', error: error.message });
    }
});

// 设置用户积分 (开发者权限)
router.post('/dev/set-credits', protect, checkDeveloper, async (req, res) => {
    try {
        const { amount } = req.body;
        
        if (!amount || isNaN(amount) || amount < 0) {
            return res.status(400).json({ success: false, message: '无效的积分数量' });
        }
        
        const result = await db.query(
            'UPDATE users SET credits = $1 WHERE id = $2 RETURNING credits',
            [amount, req.user.id]
        );
        
        logger.info('开发者设置积分', { userId: req.user.id, newAmount: amount });
        
        res.json({
            success: true,
            message: '积分设置成功',
            data: {
                credits: result.rows[0].credits
            }
        });
    } catch (error) {
        logger.error('设置积分出错', { error: error.message, userId: req.user.id });
        res.status(500).json({ success: false, message: '设置积分失败', error: error.message });
    }
});

// 重置功能使用次数 (开发者权限)
router.post('/dev/reset-usage', protect, checkDeveloper, async (req, res) => {
    try {
        const { featureName } = req.body;
        
        if (!featureName) {
            return res.status(400).json({ success: false, message: '未指定功能名称' });
        }
        
        let query;
        let params;
        
        if (featureName === 'all') {
            // 重置所有功能的使用记录
            query = `DELETE FROM feature_usage WHERE user_id = $1`;
            params = [req.user.id];
        } else {
            // 重置指定功能的使用记录
            query = `DELETE FROM feature_usage 
                     WHERE user_id = $1 AND feature_id = (SELECT id FROM features WHERE name = $2)`;
            params = [req.user.id, featureName];
        }
        
        await db.query(query, params);
        
        logger.info('开发者重置功能使用次数', { 
            userId: req.user.id, 
            featureName: featureName === 'all' ? '所有功能' : featureName 
        });
        
        res.json({
            success: true,
            message: featureName === 'all' ? '所有功能使用次数已重置' : `${featureName} 功能使用次数已重置`
        });
    } catch (error) {
        logger.error('重置功能使用次数出错', { error: error.message, userId: req.user.id });
        res.status(500).json({ success: false, message: '重置功能使用次数失败', error: error.message });
    }
});

module.exports = router;