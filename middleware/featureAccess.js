const User = require('../models/User');
const { FeatureUsage } = require('../models/FeatureUsage');
const { Op } = require('sequelize');
const { DataTypes } = require('sequelize');

// 功能配置
const FEATURES = {
  // 图像处理功能
  'image-upscaler': { creditCost: 10, freeUsage: 1 }, // 图片高清放大
  'marketing-images': { creditCost: 7, freeUsage: 1 }, // 产品营销图
  'cutout': { creditCost: 5, freeUsage: 1 }, // 抠图
  'translate': { creditCost: 5, freeUsage: 1 }, // 智能翻译
  'scene-generator': { creditCost: 7, freeUsage: 1 }, // 场景生成
  'image-removal': { creditCost: 7, freeUsage: 1 }, // 图像物体移除 
  'model-skin-changer': { creditCost: 10, freeUsage: 1 }, // 模特肤色替换
  'clothing-simulation': { creditCost: 5, freeUsage: 1 }, // 模拟试衣
  'text-to-video': { creditCost: 66, freeUsage: 1 }, // 文生视频功能，较高积分消耗
  'image-to-video': { creditCost: 66, freeUsage: 1 }, // 图生视频功能
  'IMAGE_EDIT': { creditCost: 7, freeUsage: 1 }, // 图像指令编辑功能
  'LOCAL_REDRAW': { creditCost: 7, freeUsage: 1 }, // 图像局部重绘功能
  'IMAGE_COLORIZATION': { creditCost: 7, freeUsage: 1 }, // 图像上色功能
  'IMAGE_EXPANSION': { creditCost: 7, freeUsage: 1 }, // 智能扩图功能
  'VIRTUAL_SHOE_MODEL': { creditCost: 25, freeUsage: 1 }, // 鞋靴虚拟试穿功能
  'TEXT_TO_IMAGE': { creditCost: 7, freeUsage: 1 }, // 文生图片功能
  'IMAGE_SHARPENING': { creditCost: 7, freeUsage: 1 }, // 模糊图片变清晰功能
  'CLOTH_SEGMENTATION': { creditCost: 2, freeUsage: 1 }, // 智能服饰分割功能
  'GLOBAL_STYLE': { creditCost: 7, freeUsage: 1 }, // 全局风格化功能
  'DIANTU': { creditCost: 7, freeUsage: 1 }, // 垫图功能
  
  // 亚马逊功能
  'amazon_video_script': { creditCost: 1, freeUsage: 0 }, // 亚马逊广告视频脚本生成
  'product_improvement_analysis': { creditCost: 1, freeUsage: 0 }, // 选品的改款分析和建议
  'amazon_brand_info': { creditCost: 1, freeUsage: 0 }, // 品牌信息收集和总结
  'amazon_brand_naming': { creditCost: 1, freeUsage: 0 }, // 亚马逊品牌起名
  'amazon_listing': { creditCost: 1, freeUsage: 0 }, // 亚马逊Listing写作与优化
  'amazon_search_term': { creditCost: 1, freeUsage: 0 }, // 亚马逊后台搜索词
  'amazon_review_analysis': { creditCost: 1, freeUsage: 0 }, // 亚马逊客户评论分析
  'amazon_consumer_insights': { creditCost: 1, freeUsage: 0 }, // 亚马逊消费者洞察专家
  'amazon_customer_email': { creditCost: 1, freeUsage: 0 }, // 亚马逊客户邮件回复
  'fba_claim_email': { creditCost: 1, freeUsage: 0 }, // FBA索赔邮件
  'amazon_review_generator': { creditCost: 1, freeUsage: 0 }, // 亚马逊评论生成
  'amazon_review_response': { creditCost: 1, freeUsage: 0 }, // 亚马逊评论回复
  'product_comparison': { creditCost: 1, freeUsage: 0 }, // 产品对比
  'amazon_post_creator': { creditCost: 1, freeUsage: 0 }, // 创建亚马逊Post
  'amazon_keyword_recommender': { creditCost: 1, freeUsage: 0 }, // 亚马逊关键词推荐
  'amazon_case_creator': { creditCost: 1, freeUsage: 0 }, // 亚马逊客服case内容
  
  // 新增功能
  'VIRTUAL_MODEL_VTON': { creditCost: 40, freeUsage: 1 }, // 智能虚拟模特试穿 模型vton1.0
  'VIDEO_SUBTITLE_REMOVER': { 
    creditCost: (duration) => {
      // 计算视频时长应消耗的积分
      // 默认每30秒30积分，不足30秒按30秒计算
      return Math.ceil(duration / 30) * 30;
    }, 
    freeUsage: 1 
  }, // 视频去除字幕 30积分/30秒
  'MULTI_IMAGE_TO_VIDEO': { 
    creditCost: (duration) => {
      // 计算视频时长应消耗的积分
      // 默认每30秒30积分，不足30秒按30秒计算
      return Math.ceil(duration / 30) * 30;
    }, 
    freeUsage: 1 
  }, // 多图转视频 30积分/30秒
  'DIGITAL_HUMAN_VIDEO': { 
    creditCost: (duration) => {
      // 计算视频时长应消耗的积分
      // 默认每秒9积分
      return Math.ceil(duration) * 9;
    }, 
    freeUsage: 1 
  },  // 视频数字人 9积分/秒
  'VIDEO_STYLE_REPAINT': { 
    creditCost: (duration, resolution = 540) => {
      // 根据分辨率和时长计算积分消耗
      // 540P: 3积分/秒
      // 720P: 6积分/秒
      const rate = resolution <= 540 ? 3 : 6;
      return Math.ceil(duration) * rate;
    }, 
    freeUsage: 1 
  }, // 视频风格重绘功能
  // 可以添加更多功能和对应的积分消耗
};

/**
 * 检查用户是否可以使用特定功能
 * @param {string} featureName 功能名称
 */
const checkFeatureAccess = (featureName) => {
  return async (req, res, next) => {
    const featureConfig = FEATURES[featureName];
    
    if (!featureConfig) {
      return res.status(400).json({
        success: false,
        message: '无效的功能名称'
      });
    }

    try {
      const userId = req.user.id;
      
      // 获取今天的日期，仅用于记录
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
      
      // 检查是否在免费使用次数内
      if (usage.usageCount < featureConfig.freeUsage) {
        // 在免费使用次数内，允许使用
        console.log(`用户ID ${userId} 使用 ${featureName} 功能的免费次数 ${usage.usageCount + 1}/${featureConfig.freeUsage}`);
        
        // 获取用户信息，以便正确设置remainingCredits
        const user = await User.findByPk(userId);
        
        // 将免费使用信息添加到请求对象
        req.featureUsage = {
          usageType: 'free',
          creditCost: 0,
          isFree: true,
          remainingCredits: user.credits,
          shouldUseTrackUsage: true // 标记应该使用track-usage API
        };
        
        next();
        return;
      }
      
      // 超过免费次数，需要检查积分是否足够
      let creditCost = 0;
      
      // 处理积分计算
      if (typeof featureConfig.creditCost === 'function') {
        // 动态计算积分的功能
        if (featureName === 'DIGITAL_HUMAN_VIDEO') {
          // 数字人视频功能，在结果返回后根据生成视频时长计费
          // 这里仅做权限检查，不预先扣除积分
          console.log(`数字人视频功能权限检查，积分将在任务完成后根据实际生成视频时长扣除`);
          creditCost = 20; // 仅检查用户是否有至少20积分，实际不会扣除
        }
        else if (featureName === 'VIDEO_STYLE_REPAINT') {
          // 视频风格重绘功能，不预先扣除积分，而是在任务完成后扣除
          console.log(`视频风格重绘功能权限检查 - 跳过积分扣除`);
          creditCost = 10; // 仅检查用户是否有至少10积分，实际不会扣除
        }
        else if (featureName === 'VIDEO_SUBTITLE_REMOVER') {
          // 视频去除字幕功能，不预先扣除积分，而是在任务完成后扣除
          console.log(`视频去除字幕功能权限检查 - 跳过积分扣除`);
          creditCost = 30; // 仅检查用户是否有至少30积分，实际不会扣除
        }
        else {
          // 其他需要动态计算积分的功能
          creditCost = featureConfig.creditCost(req.body);
        }
      } else {
        // 固定积分消耗
        creditCost = featureConfig.creditCost;
      }
      
      // 检查用户积分是否足够
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
      
      // 积分足够，允许使用功能
      // 不在这里扣除积分，而是标记需要使用track-usage API
      req.featureUsage = {
        usageType: 'paid',
        creditCost: creditCost,
        isFree: false,
        remainingCredits: user.credits,
        shouldUseTrackUsage: true // 标记应该使用track-usage API
      };
      
      console.log(`用户ID ${userId} 使用 ${featureName} 功能权限检查通过，需要消耗 ${creditCost} 积分`);
      
      next();
    } catch (error) {
      console.error('功能访问权限检查出错:', error);
      res.status(500).json({
        success: false,
        message: '服务器错误，无法验证功能访问权限',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
};

// 导出模块
module.exports = {
  checkFeatureAccess,
  FEATURES
}; 