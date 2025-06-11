const User = require('../models/User');
const { FeatureUsage } = require('../models/FeatureUsage');
const { Op } = require('sequelize');

// 功能配置
const FEATURES = {
  // 图像处理功能
  'image-upscaler': { creditCost: 5, freeUsage: 2 },
  'marketing-images': { creditCost: 15, freeUsage: 2 },
  'cutout': { creditCost: 3, freeUsage: 2 },
  'translate': { creditCost: 4, freeUsage: 2 },
  'scene-generator': { creditCost: 10, freeUsage: 2 },
  'image-removal': { creditCost: 5, freeUsage: 2 },
  'model-skin-changer': { creditCost: 20, freeUsage: 2 },
  'clothing-simulation': { creditCost: 20, freeUsage: 2 },
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
    // 获取功能配置
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
        // 更新使用记录
        usage.usageCount += 1;
        usage.lastUsedAt = new Date();
        await usage.save();
        
        // 添加使用信息到请求对象
        req.featureUsage = {
          usageType: 'free',
          remainingFreeUsage: featureConfig.freeUsage - usage.usageCount,
          creditCost: 0
        };
        
        return next();
      }
      
      // 处理积分计算
      let creditCost = 0;
      
      // 根据功能类型计算积分消耗
      if (typeof featureConfig.creditCost === 'function') {
        // 针对不同功能获取duration参数
        let duration = 0;
        
        if (featureName === 'MULTI_IMAGE_TO_VIDEO') {
          // 多图转视频，从body中获取duration参数
          duration = parseInt(req.body.duration) || 30; // 默认30秒
          creditCost = featureConfig.creditCost(duration);
          console.log(`计算多图转视频积分: 时长=${duration}秒, 消耗积分=${creditCost}`);
        } 
        else if (featureName === 'VIDEO_SUBTITLE_REMOVER') {
          // 视频去除字幕，从查询参数或body中获取duration
          duration = parseInt(req.query.duration || req.body.duration) || 30;
          creditCost = featureConfig.creditCost(duration);
          console.log(`计算视频去除字幕积分: 时长=${duration}秒, 消耗积分=${creditCost}`);
        }
        else if (featureName === 'DIGITAL_HUMAN_VIDEO') {
          // 数字人视频功能，改为在结果返回后根据生成视频时长计费
          // 这里仅做权限检查，不预先扣除积分
          console.log(`数字人视频功能权限检查，积分将在任务完成后根据实际生成视频时长扣除`);
          
          // 将请求标记为数字人视频任务，在请求对象中添加标记
          req.isDigitalHumanVideo = true;
          
          // 这里只需要检查用户是否有最低积分限制（例如20积分）
          creditCost = 20; // 仅检查用户是否有至少20积分，实际不会扣除
        }
        else if (featureName === 'VIDEO_STYLE_REPAINT') {
          // 视频风格重绘功能，不预先扣除积分，而是在任务完成后扣除
          console.log(`视频风格重绘功能权限检查 - 跳过积分扣除`);
          
          // 将请求标记为视频风格重绘任务，在请求对象中添加标记
          req.isVideoStyleRepaint = true;
          
          // 这里只需要检查用户是否有最低积分限制（例如10积分）
          creditCost = 10; // 仅检查用户是否有至少10积分，实际不会扣除
        }
        else {
          // 其他需要动态计算积分的功能
          creditCost = featureConfig.creditCost(req.body);
        }
      } else {
        // 固定积分消耗
        creditCost = featureConfig.creditCost;
      }
      
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
      
      // 对于数字人视频功能和视频风格重绘功能，不在此扣除积分，而是在任务完成后根据实际生成视频时长扣除
      if (featureName === 'DIGITAL_HUMAN_VIDEO' || featureName === 'VIDEO_STYLE_REPAINT') {
        // 更新使用记录，但不扣除积分
        usage.usageCount += 1;
        usage.lastUsedAt = new Date();
        await usage.save();
        
        // 添加使用信息到请求对象
        req.featureUsage = {
          usageType: 'delayed_payment',
          creditCost: 0, // 实际积分消耗将在任务完成后计算
          remainingCredits: user.credits
        };
        
        next();
        return;
      }
      
      // 扣除积分 (对于非数字人视频功能)
      user.credits -= creditCost;
      await user.save();
      
      // 更新使用记录
      usage.usageCount += 1;
      usage.lastUsedAt = new Date();
      
      // 对于亚马逊助手功能，保存更详细的使用记录
      if (featureName.startsWith('amazon_') || featureName === 'product_comparison' || featureName === 'product_improvement_analysis' || featureName === 'fba_claim_email') {
        try {
          // 解析现有详情
          let details = {};
          try {
            details = usage.details ? JSON.parse(usage.details) : {};
          } catch (e) {
            details = {};
          }
          
          // 准备任务列表
          const tasks = details.tasks || [];
          
          // 获取请求正文的摘要信息
          let requestSummary = '';
          if (req.body) {
            if (req.body.prompt) {
              requestSummary = req.body.prompt.substring(0, 100) + '...';
            } else if (req.body.productName) {
              requestSummary = req.body.productName;
            } else if (req.body.review) {
              requestSummary = req.body.review.substring(0, 100) + '...';
            } else if (req.body.productKeywords) {
              requestSummary = req.body.productKeywords;
            } else {
              // 尝试从请求体中获取任何可能的标识符
              const keys = Object.keys(req.body);
              if (keys.length > 0) {
                const key = keys[0];
                if (typeof req.body[key] === 'string') {
                  requestSummary = `${key}: ${req.body[key].substring(0, 50)}...`;
                } else {
                  requestSummary = `使用了 ${keys.join(', ')} 参数`;
                }
              } else {
                requestSummary = '使用了亚马逊助手功能';
              }
            }
          }
          
          // 添加新的任务记录
          const taskId = Date.now().toString(); // 使用时间戳作为任务ID
          tasks.push({
            taskId: taskId,
            creditCost: creditCost,
            timestamp: new Date(),
            summary: requestSummary
          });
          
          // 更新总积分消耗
          usage.credits = (usage.credits || 0) + creditCost;
          
          // 更新使用记录详情
          usage.details = JSON.stringify({
            ...details,
            tasks: tasks
          });
        } catch (detailsError) {
          console.error('保存亚马逊助手功能使用详情失败:', detailsError);
          // 继续处理，不影响用户使用
        }
      }
      
      await usage.save();
      
      // 添加使用信息到请求对象
      req.featureUsage = {
        usageType: 'paid',
        creditCost: creditCost,
        remainingCredits: user.credits
      };
      
      next();
    } catch (error) {
      console.error('检查功能访问权限出错:', error);
      res.status(500).json({
        success: false,
        message: '服务器错误，无法验证访问权限',
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