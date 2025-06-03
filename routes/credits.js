const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { FeatureUsage } = require('../models/FeatureUsage');
const { protect } = require('../middleware/auth');
const { FEATURES } = require('../middleware/featureAccess');
const db = require('../config/db');
const logger = require('../utils/logger');
const axios = require('axios'); // 添加axios用于直接HTTP请求
const crypto = require('crypto'); // 用于生成签名
// 正确引入支付宝SDK v3.2.0版本
const AlipaySdk = require('alipay-sdk').default;
const AlipayFormData = require('alipay-sdk/lib/form').default;
// 引入支付宝API相关类 - 使用官方SDK中的类
const PaymentOrder = require('../models/PaymentOrder');

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
    
    // 检查是否在免费使用次数内
    let usageType = 'free';
    let creditCost = 0;
    
    // 仅对实际使用功能(非page_view)收费
    if (!isPageView && usage.usageCount >= featureConfig.freeUsage) {
      // 超过免费次数，检查用户积分
      const user = await User.findByPk(userId);
      
      if (user.credits < featureConfig.creditCost) {
        return res.status(402).json({
          success: false,
          message: '您的免费试用次数已用完，积分不足',
          data: {
            requiredCredits: featureConfig.creditCost,
            currentCredits: user.credits,
            freeUsageLimit: featureConfig.freeUsage,
            freeUsageUsed: usage.usageCount
          }
        });
      }
      
      // 扣除积分
      user.credits -= featureConfig.creditCost;
      await user.save();
      
      usageType = 'paid';
      creditCost = featureConfig.creditCost;
    }
    
    // 仅对实际使用功能(非page_view)增加使用次数
    if (!isPageView) {
      usage.usageCount += 1;
    }
    
    usage.lastUsedAt = new Date();
    await usage.save();
    
    // 返回使用信息
    res.json({
      success: true,
      message: '功能使用记录已更新',
      data: {
        featureName,
        action,
        usageType,
        creditCost,
        remainingFreeUsage: Math.max(0, featureConfig.freeUsage - usage.usageCount)
      }
    });
  } catch (error) {
    console.error('记录功能使用出错:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，无法记录功能使用',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
    
    // 获取用户的功能使用记录
    const usages = await FeatureUsage.findAll({
      where: { userId },
      attributes: ['featureName', 'usageCount', 'lastUsedAt', 'resetDate']
    });
    
    // 创建功能使用统计数据
    const featureUsageStats = {};
    let totalCreditsUsed = 0;
    let totalUsageCount = 0;
    
    // 获取用户使用记录
    // 实际项目中应该有一个UsageHistory表记录每次使用的详细信息
    // 这里简化处理，仅基于FeatureUsage数据生成模拟记录
    const usageRecords = [];
    
    usages.forEach(usage => {
      const featureName = usage.featureName;
      const config = FEATURES[featureName];
      
      // 跳过未配置的功能
      if (!config) return;
      
      // 模拟功能使用记录（在真实环境中应该从数据库查询）
      if (usage.lastUsedAt && new Date(usage.lastUsedAt) >= startDate) {
        // 添加此功能的使用记录
        const lastUsedDate = new Date(usage.lastUsedAt);
        
        // 计算功能消费的积分总额 - 修正计算逻辑
        // 只有超过免费使用次数的部分才会消耗积分
        const paidUsageCount = Math.max(0, usage.usageCount - config.freeUsage);
        
        // 处理不同类型的积分消耗计算
        let creditCost = 0;
        if (typeof config.creditCost === 'function') {
          // 对于动态计算积分的功能，使用默认值
          // 这里简化处理，实际应该从使用记录中获取
          creditCost = paidUsageCount > 0 ? paidUsageCount * 10 : 0; // 默认10积分/次
        } else {
          // 固定积分消耗
          creditCost = paidUsageCount * config.creditCost;
        }
        
        totalCreditsUsed += creditCost;
        totalUsageCount += usage.usageCount;
        
        // 如果这个功能有使用记录，添加到统计数据中 (即使creditCost为0)
        if (usage.usageCount > 0) {
          // 功能消费占比
          featureUsageStats[featureName] = {
            name: getLocalFeatureName(featureName),
            credits: creditCost,
            count: usage.usageCount
          };
          
          // 为图表更新对应日期的使用量
          // 这里简化处理，将使用量记录在最后使用日期
          const dateIndex = dateLabels.findIndex(date => 
            date === lastUsedDate.toISOString().split('T')[0].substring(5)
          );
          if (dateIndex !== -1) {
            usageData[dateIndex] += creditCost;
          }
          
          // 添加使用记录 (即使creditCost为0也添加)
          usageRecords.push({
            date: lastUsedDate.toISOString().replace('T', ' ').substring(0, 16),
            feature: getLocalFeatureName(featureName),
            description: `功能使用 (${usage.usageCount}次)`,
            credits: creditCost
          });
        }
      }
    });
    
    // 计算功能使用百分比
    const featureUsage = [];
    
    // 修改逻辑：即使totalCreditsUsed为0，也显示功能使用情况
    // 定义不同功能的颜色
    const colors = {
      'image-upscaler': 'rgb(239, 68, 68)',     // 图像高清放大
      'marketing-images': 'rgb(99, 102, 241)',  // AI营销图生成
      'cutout': 'rgb(245, 158, 11)',           // 商品换背景
      'translate': 'rgb(16, 185, 129)',         // 图片翻译
      'scene-generator': 'rgb(59, 130, 246)',   // 场景图生成
      'image-removal': 'rgb(236, 72, 153)',     // 图像智能消除
      'model-skin-changer': 'rgb(139, 92, 246)', // 模特换肤
      'clothing-simulation': 'rgb(75, 85, 99)',  // 模拟试衣
      'text-to-video': 'rgb(255, 0, 0)',         // 文生视频
      'image-to-video': 'rgb(0, 0, 255)',         // 图生视频
      'IMAGE_EDIT': 'rgb(255, 255, 0)',           // 图像指令编辑
      'LOCAL_REDRAW': 'rgb(255, 0, 255)',          // 局部重绘
      'IMAGE_COLORIZATION': 'rgb(0, 255, 128)',     // 图像上色
      'CLOTH_SEGMENTATION': 'rgb(128, 0, 128)',     // 智能服饰分割
      'GLOBAL_STYLE': 'rgb(0, 128, 255)',          // 全局风格化
      'VIRTUAL_MODEL_VTON': 'rgb(0, 175, 185)',     // 智能虚拟模特试穿
      'VIDEO_SUBTITLE_REMOVER': 'rgb(220, 120, 30)',  // 视频去除字幕
      'MULTI_IMAGE_TO_VIDEO': 'rgb(155, 89, 182)',    // 多图转视频
      'DIGITAL_HUMAN_VIDEO': 'rgb(41, 128, 185)',     // 视频数字人
      'amazon_video_script': 'rgb(75, 192, 192)',     // 亚马逊广告视频脚本生成
      'product_improvement_analysis': 'rgb(255, 159, 64)', // 选品的改款分析和建议
      'amazon_brand_info': 'rgb(54, 162, 235)',      // 品牌信息收集和总结
      'amazon_brand_naming': 'rgb(255, 99, 132)',    // 亚马逊品牌起名
      'amazon_listing': 'rgb(255, 206, 86)',         // 亚马逊Listing写作与优化
      'amazon_search_term': 'rgb(153, 102, 255)',    // 亚马逊后台搜索词
      'amazon_review_analysis': 'rgb(255, 159, 64)', // 亚马逊客户评论分析
      'amazon_consumer_insights': 'rgb(54, 162, 235)', // 亚马逊消费者洞察专家
      'amazon_customer_email': 'rgb(255, 99, 132)',  // 亚马逊客户邮件回复
      'amazon_post_creator': 'rgb(75, 192, 192)',    // 创建亚马逊Post
      'amazon_keyword_recommender': 'rgb(153, 102, 255)', // 亚马逊关键词推荐
      'product_comparison': 'rgb(255, 159, 64)',     // 产品对比
    };
    
    Object.keys(featureUsageStats).forEach(key => {
      const stat = featureUsageStats[key];
      // 添加所有有使用记录的功能，即使credits为0
      if (stat.count > 0) {
        featureUsage.push({
          name: stat.name,
          credits: stat.credits,
          percentage: totalCreditsUsed > 0 ? parseFloat(((stat.credits / totalCreditsUsed) * 100).toFixed(2)) : 0,
          color: colors[key] || 'rgb(107, 114, 128)' // 默认颜色
        });
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