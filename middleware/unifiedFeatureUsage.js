const { FeatureUsage } = require('../models/FeatureUsage');
const User = require('../models/User');
const { FEATURES } = require('./featureAccess');

/**
 * 统一的功能使用中间件
 * 实现免费次数检查→积分扣除→记录生成的完整逻辑
 * @param {string} featureName - 功能名称
 * @param {object} options - 可选配置
 * @param {function} options.calculateCreditCost - 动态计算积分消耗的函数
 * @returns {function} Express中间件函数
 */
const createUnifiedFeatureMiddleware = (featureName, options = {}) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      
      // 验证功能名称
      if (!featureName || !FEATURES[featureName]) {
        return res.status(400).json({
          success: false,
          message: '无效的功能名称'
        });
      }

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
      
      // 计算积分消耗
      let creditCost = 0;
      if (typeof featureConfig.creditCost === 'function') {
        // 动态计算积分
        if (options.calculateCreditCost) {
          creditCost = options.calculateCreditCost(req, featureConfig);
        } else {
          creditCost = featureConfig.creditCost(req.body);
        }
      } else {
        // 固定积分消耗
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
      
      // 将使用信息添加到请求对象
      req.featureUsage = {
        featureName,
        usageType,
        creditCost: finalCreditCost,
        isFree: usageType === 'free',
        remainingFreeUsage: Math.max(0, featureConfig.freeUsage - usage.usageCount),
        usage: usage // 传递usage对象，方便后续保存任务详情
      };
      
      console.log(`功能 ${featureName} 使用记录已处理:`, {
        usageType,
        creditCost: finalCreditCost,
        isFree: usageType === 'free'
      });
      
      next();
    } catch (error) {
      console.error(`功能 ${featureName} 使用记录处理错误:`, error);
      res.status(500).json({
        success: false,
        message: '服务器错误，无法验证功能访问权限'
      });
    }
  };
};

/**
 * 保存任务详情到数据库
 * @param {object} usage - FeatureUsage实例
 * @param {object} taskInfo - 任务信息
 * @param {string} taskInfo.taskId - 任务ID
 * @param {number} taskInfo.creditCost - 积分消耗
 * @param {boolean} taskInfo.isFree - 是否免费
 * @param {object} taskInfo.extraData - 额外数据
 */
const saveTaskDetails = async (usage, taskInfo) => {
  try {
    // 解析现有详情
    const details = JSON.parse(usage.details || '{}');
    const tasks = details.tasks || [];
    
    // 检查任务ID是否已存在
    const isTaskExists = tasks.some(task => task.taskId === taskInfo.taskId);
    
    if (!isTaskExists) {
      // 添加新任务
      tasks.push({
        taskId: taskInfo.taskId,
        creditCost: taskInfo.creditCost,
        isFree: taskInfo.isFree,
        timestamp: new Date(),
        ...taskInfo.extraData
      });
      
      // 更新usage记录
      if (!taskInfo.isFree) {
        usage.credits = (usage.credits || 0) + taskInfo.creditCost;
      }
      usage.details = JSON.stringify({
        ...details,
        tasks: tasks
      });
      
      await usage.save();
      console.log(`任务详情已保存: 任务ID=${taskInfo.taskId}, 积分=${taskInfo.creditCost}, 是否免费=${taskInfo.isFree}`);
    } else {
      console.log(`任务ID ${taskInfo.taskId} 已存在，跳过保存`);
    }
  } catch (error) {
    console.error('保存任务详情失败:', error);
    throw error;
  }
};

/**
 * 创建数字人视频功能中间件 - 预扣积分，任务完成后调整
 * @param {Function} getDynamicCredits - 动态获取积分消耗的函数
 * @returns {Function} Express中间件函数
 */
const createDigitalHumanMiddleware = (getDynamicCredits) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const featureName = 'DIGITAL_HUMAN_VIDEO';
      
      // 获取功能配置
      const featureConfig = FEATURES[featureName];
      if (!featureConfig) {
        return res.status(500).json({
          success: false,
          message: '功能配置未找到'
        });
      }
      
      // 检查用户是否存在
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }
      
      // 获取或创建功能使用记录
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      
      let usage = await FeatureUsage.findOne({
        where: { userId, featureName }
      });
      
      if (!usage) {
        usage = await FeatureUsage.create({
          userId,
          featureName,
          usageCount: 0,
          credits: 0,
          lastUsedAt: today,
          resetDate: todayStr,
          details: JSON.stringify({ tasks: [] })
        });
      } else if (usage.resetDate !== todayStr) {
        // 新的一天，重置计数
        usage.usageCount = 0;
        usage.resetDate = todayStr;
        await usage.save();
      }
      
      // 检查是否还有免费次数
      const isFreeUsage = usage.usageCount < featureConfig.freeUsage;
      
      // 对于数字人视频功能，积分检查和扣除将在上传后进行
      // 这里只记录使用信息，不预先扣除积分或更新使用次数
      
      // 将使用信息添加到请求对象
      req.featureUsage = {
        usage,
        featureConfig,
        usageType: isFreeUsage ? 'free' : 'paid',
        getDynamicCredits, // 传递动态积分计算函数
        isFreeUsage: isFreeUsage // 标记是否为免费使用
      };
      
      console.log(`数字人视频功能中间件: 用户${userId}, 今日使用${usage.usageCount}/${featureConfig.freeUsage}, 类型: ${req.featureUsage.usageType}`);
      
      next();
    } catch (error) {
      console.error('数字人视频功能中间件错误:', error);
      return res.status(500).json({
        success: false,
        message: '服务器内部错误'
      });
    }
  };
};

module.exports = {
  createUnifiedFeatureMiddleware,
  createDigitalHumanMiddleware,
  saveTaskDetails
}; 