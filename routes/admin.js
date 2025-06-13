const express = require('express');
const router = express.Router();
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('../models/User');
const UserSession = require('../models/UserSession');
const { FeatureUsage } = require('../models/FeatureUsage');
const PaymentOrder = require('../models/PaymentOrder');
const ImageHistory = require('../models/ImageHistory');
const VideoResult = require('../models/VideoResult');
const { protect, checkAdmin, invalidateAllSessions } = require('../middleware/auth');
const { FEATURES } = require('../middleware/featureAccess');
const { Op } = require('sequelize');
const { generateToken, JWT_EXPIRE } = require('../utils/jwt');

/**
 * @route   GET /api/admin/users
 * @desc    获取所有用户列表
 * @access  私有 (仅管理员)
 */
router.get('/users', protect, checkAdmin, async (req, res) => {
  try {
    // 分页参数
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // 搜索参数
    const search = req.query.search || '';
    
    // 构建查询条件
    const whereCondition = {};
    if (search) {
      whereCondition[Op.or] = [
        { username: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } }
      ];
    }
    
    // 查询用户列表
    const { count, rows: users } = await User.findAndCountAll({
      where: whereCondition,
      attributes: ['id', 'username', 'phone', 'credits', 'isAdmin', 'isInternal', 'remark', 'createdAt', 'lastRechargeTime', 'isBanned', 'banReason', 'banExpireAt'],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });
    
    // 获取每个用户的活跃会话数
    const now = new Date();
    const userIds = users.map(user => user.id);
    
    // 查询每个用户的活跃会话数
    const sessionCounts = await UserSession.findAll({
      attributes: [
        'userId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'sessionCount']
      ],
      where: {
        userId: { [Op.in]: userIds },
        isActive: true,
        expiresAt: { [Op.gt]: now }
      },
      group: ['userId']
    });
    
    // 将会话数添加到用户数据中
    const sessionCountMap = {};
    sessionCounts.forEach(session => {
      sessionCountMap[session.userId] = parseInt(session.getDataValue('sessionCount'));
    });
    
    const usersWithSessionCounts = users.map(user => {
      const userData = user.toJSON();
      userData.activeSessionCount = sessionCountMap[user.id] || 0;
      // 确保备注字段存在并正确传递
      console.log(`用户 ${userData.id} ${userData.username} 的备注:`, userData.remark);
      return userData;
    });
    
    // 计算总页数
    const totalPages = Math.ceil(count / limit);
    
    res.json({
      success: true,
      data: {
        users: usersWithSessionCounts,
        pagination: {
          total: count,
          page,
          limit,
          totalPages
        }
      }
    });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，获取用户列表失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/admin/users/:id
 * @desc    获取单个用户详情
 * @access  私有 (仅管理员)
 */
router.get('/users/:id', protect, checkAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // 查询用户信息
    const user = await User.findByPk(userId, {
      attributes: ['id', 'username', 'phone', 'credits', 'isAdmin', 'isInternal', 'remark', 'createdAt', 'lastRechargeTime', 'isBanned', 'banReason', 'banExpireAt', 'lastActiveAt']
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 添加最后活动时间到用户数据
    const userData = user.toJSON();
    
    // 如果用户本身没有记录最后活动时间，则尝试从会话中获取
    if (!userData.lastActiveAt) {
      const lastActiveSession = await UserSession.findOne({
        where: {
          userId: userId,
          isActive: true,
          expiresAt: { [Op.gt]: new Date() }
        },
        order: [['lastActiveAt', 'DESC']]
      });
      
      if (lastActiveSession) {
        userData.lastActiveAt = lastActiveSession.lastActiveAt;
      }
    }
    
    // 查询用户功能使用情况
    const usages = await FeatureUsage.findAll({
      where: { userId },
      attributes: ['featureName', 'usageCount', 'lastUsedAt']
    });
    
    res.json({
      success: true,
      data: {
        user: userData,
        usages
      }
    });
  } catch (error) {
    console.error('获取用户详情错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，获取用户详情失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   PUT /api/admin/users/:id
 * @desc    更新用户信息
 * @access  私有 (仅管理员)
 */
router.put('/users/:id', protect, checkAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { username, phone, credits, isAdmin, isInternal, remark, password } = req.body;
    
    // 查询用户
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 更新用户信息
    if (username !== undefined) user.username = username;
    if (phone !== undefined) user.phone = phone === '' ? null : phone; // 如果手机号为空字符串，则设置为null
    if (credits !== undefined) user.credits = parseInt(credits);
    if (isAdmin !== undefined) user.isAdmin = Boolean(isAdmin);
    if (isInternal !== undefined) user.isInternal = Boolean(isInternal);
    if (remark !== undefined) user.remark = remark;
    
    // 如果提供了新密码，更新密码
    if (password) {
      user.password = password; // 模型中有密码哈希钩子
    }
    
    await user.save();
    
    res.json({
      success: true,
      message: '用户信息更新成功',
      data: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        credits: user.credits,
        isAdmin: user.isAdmin,
        isInternal: user.isInternal,
        remark: user.remark,
        createdAt: user.createdAt,
        lastRechargeTime: user.lastRechargeTime
      }
    });
  } catch (error) {
    console.error('更新用户信息错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，更新用户信息失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    删除用户
 * @access  私有 (仅管理员)
 */
router.delete('/users/:id', protect, checkAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    console.log(`尝试删除用户ID: ${userId}`);
    
    // 查询用户
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 不允许删除自己
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({
        success: false,
        message: '不能删除当前登录的管理员账号'
      });
    }
    
    // 开启事务
    const transaction = await sequelize.transaction();
    
    try {
      console.log(`开始删除用户 ${userId} 的关联记录`);
      
      // 1. 删除用户会话
      await UserSession.destroy({
        where: { userId: userId },
        transaction
      });
      console.log(`已删除用户 ${userId} 的会话记录`);
      
      // 2. 删除功能使用记录
      await FeatureUsage.destroy({
        where: { userId: userId },
        transaction
      });
      console.log(`已删除用户 ${userId} 的功能使用记录`);
      
      // 3. 删除支付订单
      await PaymentOrder.destroy({
        where: { user_id: userId },
        transaction
      });
      console.log(`已删除用户 ${userId} 的支付订单`);
      
      // 4. 删除图片历史
      await ImageHistory.destroy({
        where: { userId: userId },
        transaction
      });
      console.log(`已删除用户 ${userId} 的图片历史`);
      
      // 5. 删除视频结果
      try {
        // 先检查表是否存在
        const [results] = await sequelize.query(
          "SHOW TABLES LIKE 'video_results'",
          { type: sequelize.QueryTypes.SELECT }
        );
        
        if (results) {
          // 如果表存在，使用原始SQL查询删除
          await sequelize.query(
            "DELETE FROM video_results WHERE user = :userId",
            { 
              replacements: { userId },
              type: sequelize.QueryTypes.DELETE,
              transaction
            }
          );
          console.log(`已删除用户 ${userId} 的视频结果`);
        } else {
          console.log(`视频结果表不存在，跳过删除`);
        }
      } catch (err) {
        console.log(`删除视频结果时出错，但将继续执行：`, err.message);
      }
      
      // 最后删除用户本身
      await user.destroy({ transaction });
      console.log(`已删除用户 ${userId}`);
      
      // 提交事务
      await transaction.commit();
      
      res.json({
        success: true,
        message: '用户删除成功'
      });
    } catch (error) {
      // 回滚事务
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('删除用户错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，删除用户失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/admin/users/:id/credits
 * @desc    修改用户积分
 * @access  私有 (仅管理员)
 */
router.post('/users/:id/credits', protect, checkAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { credits, operation, amount } = req.body;
    
    // 查询用户
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 根据操作类型修改积分
    if (operation === 'set' && credits !== undefined) {
      // 设置为指定积分
      user.credits = parseInt(credits);
    } else if (operation === 'add' && amount !== undefined) {
      // 增加积分
      user.credits += parseInt(amount);
    } else if (operation === 'subtract' && amount !== undefined) {
      // 减少积分
      const newCredits = user.credits - parseInt(amount);
      user.credits = Math.max(0, newCredits); // 确保积分不小于0
    } else {
      return res.status(400).json({
        success: false,
        message: '无效的操作或参数'
      });
    }
    
    // 更新最后充值时间
    if (operation === 'add') {
      user.lastRechargeTime = new Date();
    }
    
    await user.save();
    
    res.json({
      success: true,
      message: '用户积分修改成功',
      data: {
        id: user.id,
        username: user.username,
        credits: user.credits,
        lastRechargeTime: user.lastRechargeTime
      }
    });
  } catch (error) {
    console.error('修改用户积分错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，修改用户积分失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/admin/statistics
 * @desc    获取系统统计数据
 * @access  私有 (仅管理员)
 */
router.get('/statistics', protect, checkAdmin, async (req, res) => {
  try {
    // 获取用户总数
    const userCount = await User.count();
    
    // 获取总积分消费
    const usages = await FeatureUsage.findAll({
      attributes: ['featureName', 'usageCount']
    });
    
    // 计算积分消费统计
    let totalCreditsUsed = 0;
    let totalUsageCount = 0;
    const featureStats = {};
    
    // 功能名称中英文映射
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
    
    usages.forEach(usage => {
      const featureName = usage.featureName;
      const config = FEATURES[featureName];
      
      if (!config) return;
      
      // 计算消费的积分
      const paidUsageCount = Math.max(0, usage.usageCount - config.freeUsage);
      let creditCost = 0;
      
      if (typeof config.creditCost === 'function') {
        creditCost = paidUsageCount > 0 ? paidUsageCount * 10 : 0;
      } else {
        creditCost = paidUsageCount * config.creditCost;
      }
      
      totalCreditsUsed += creditCost;
      totalUsageCount += usage.usageCount;
      
      // 按功能统计
      if (!featureStats[featureName]) {
        featureStats[featureName] = {
          name: featureNames[featureName] || featureName, // 使用中文名称
          usageCount: 0,
          creditCost: 0
        };
      }
      
      featureStats[featureName].usageCount += usage.usageCount;
      featureStats[featureName].creditCost += creditCost;
    });
    
    // 转换为数组并排序
    const featureUsage = Object.values(featureStats).sort((a, b) => b.creditCost - a.creditCost);
    
    res.json({
      success: true,
      data: {
        userCount,
        totalCreditsUsed,
        totalUsageCount,
        featureCount: Object.keys(featureStats).length,
        featureUsage
      }
    });
  } catch (error) {
    console.error('获取统计数据错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，获取统计数据失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/admin/create-admin
 * @desc    创建管理员账号
 * @access  私有 (仅管理员)
 */
router.post('/create-admin', protect, checkAdmin, async (req, res) => {
  try {
    const { username, password, phone } = req.body;
    
    // 验证必要字段
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码为必填项'
      });
    }
    
    // 检查用户名是否已存在
    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '用户名已被使用'
      });
    }
    
    // 如果提供了手机号，检查是否已被使用
    if (phone) {
      const phoneExists = await User.findOne({ where: { phone } });
      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: '手机号已被使用'
        });
      }
    }
    
    // 创建管理员账号
    const admin = await User.create({
      username,
      password,
      phone: phone || null,
      isAdmin: true,
      credits: 1000 // 默认给新管理员1000积分
    });
    
    res.status(201).json({
      success: true,
      message: '管理员账号创建成功',
      data: {
        id: admin.id,
        username: admin.username,
        isAdmin: admin.isAdmin,
        credits: admin.credits,
        createdAt: admin.createdAt
      }
    });
  } catch (error) {
    console.error('创建管理员账号错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，创建管理员账号失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/admin/payment-records
 * @desc    获取所有用户的充值记录
 * @access  私有 (仅管理员)
 */
router.get('/payment-records', protect, checkAdmin, async (req, res) => {
  try {
    // 分页参数
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // 搜索参数
    const userId = req.query.userId ? parseInt(req.query.userId) : null;
    const status = req.query.status || null;
    
    // 构建查询条件
    const whereCondition = {};
    if (userId) {
      whereCondition.user_id = userId;
    }
    if (status) {
      whereCondition.status = status;
    }
    
    console.log('充值记录API请求参数:', { userId, status, page, limit });
    console.log('查询条件:', whereCondition);
    
    // 查询支付订单
    const { count, rows: orders } = await PaymentOrder.findAndCountAll({
      where: whereCondition,
      order: [['created_at', 'DESC']],
      limit,
      offset,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'phone']
      }]
    });
    
    // 计算总页数
    const totalPages = Math.ceil(count / limit);
    
    // 获取充值总金额
    const totalAmount = await PaymentOrder.sum('price', {
      where: {
        ...whereCondition,
        status: 'completed'
      }
    }) || 0;
    
    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          total: count,
          page,
          limit,
          totalPages
        },
        stats: {
          totalAmount: parseFloat(totalAmount).toFixed(2),
          totalOrders: count
        }
      }
    });
  } catch (error) {
    console.error('获取充值记录错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，获取充值记录失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/admin/feature-usage
 * @desc    获取功能使用统计
 * @access  私有 (仅管理员)
 */
router.get('/feature-usage', protect, checkAdmin, async (req, res) => {
  try {
    // 分页参数
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // 搜索参数
    const userId = req.query.userId ? parseInt(req.query.userId) : null;
    const featureName = req.query.featureName || null;
    
    console.log('功能使用记录API请求参数:', { userId, featureName, page, limit });
    
    // 构建查询条件
    const whereCondition = {};
    if (userId) {
      whereCondition.userId = userId;
    }
    if (featureName) {
      whereCondition.featureName = featureName;
    }
    
    // 限制只返回最近一周的记录
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    whereCondition.lastUsedAt = {
      [Op.gte]: oneWeekAgo
    };
    
    console.log('查询条件:', whereCondition);
    
    // 查询功能使用记录
    const { count, rows: usages } = await FeatureUsage.findAndCountAll({
      where: whereCondition,
      order: [['lastUsedAt', 'DESC']],
      limit,
      offset,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'phone']
      }]
    });
    
    // 计算总页数
    const totalPages = Math.ceil(count / limit);
    
    // 获取功能使用总次数
    const totalUsage = await FeatureUsage.sum('usageCount', {
      where: whereCondition
    }) || 0;
    
    // 获取功能列表
    const features = await FeatureUsage.findAll({
      attributes: ['featureName', [sequelize.fn('SUM', sequelize.col('usageCount')), 'totalUsage']],
      group: ['featureName'],
      order: [[sequelize.fn('SUM', sequelize.col('usageCount')), 'DESC']]
    });
    
    // 功能名称中英文映射
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
      'amazon_case_creator': '亚马逊客服case内容',
      'virtual-model': '虚拟模特',
      'DIANTU': '垫图'
    };
    
    const responseData = {
      usages: usages.map(usage => {
        const plainUsage = usage.get({ plain: true });
        // 添加中文名称
        if (plainUsage.featureName && featureNames[plainUsage.featureName]) {
          plainUsage.featureNameCN = featureNames[plainUsage.featureName];
        }
        return plainUsage;
      }),
      pagination: {
        total: count,
        page,
        limit,
        totalPages
      },
      stats: {
        totalUsage,
        features: features.map(f => ({
          name: featureNames[f.featureName] || f.featureName, // 使用中文名称
          originalName: f.featureName, // 保留原始名称
          usage: f.getDataValue('totalUsage')
        }))
      }
    };
    
    console.log(`找到 ${count} 条功能使用记录`);
    
    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('获取功能使用统计错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，获取功能使用统计失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/admin/daily-payments
 * @desc    获取每日充值统计数据
 * @access  私有 (仅管理员)
 */
router.get('/daily-payments', protect, checkAdmin, async (req, res) => {
  try {
    // 获取查询参数
    const days = parseInt(req.query.days) || 30; // 默认30天
    
    // 计算日期范围
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // 格式化日期为MySQL格式
    const formatDate = (date) => {
      return date.toISOString().split('T')[0];
    };
    
    // 查询每日充值数据
    const dailyPayments = await sequelize.query(`
      SELECT 
        DATE(payment_time) as date,
        SUM(price) as total_amount,
        COUNT(*) as order_count
      FROM payment_orders
      WHERE 
        status = 'completed' 
        AND payment_time BETWEEN '${formatDate(startDate)}' AND '${formatDate(endDate)} 23:59:59'
      GROUP BY DATE(payment_time)
      ORDER BY date ASC
    `, { type: sequelize.QueryTypes.SELECT });
    
    // 生成所有日期的数组，包括没有充值记录的日期
    const allDates = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dateStr = formatDate(currentDate);
      
      // 查找该日期是否有充值记录
      const existingData = dailyPayments.find(item => formatDate(new Date(item.date)) === dateStr);
      
      allDates.push({
        date: dateStr,
        total_amount: existingData ? parseFloat(existingData.total_amount).toFixed(2) : '0.00',
        order_count: existingData ? existingData.order_count : 0
      });
      
      // 增加一天
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    res.json({
      success: true,
      data: allDates
    });
  } catch (error) {
    console.error('获取每日充值统计错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，获取每日充值统计失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/admin/users-by-date
 * @desc    获取指定日期注册的用户
 * @access  私有 (仅管理员)
 */
router.get('/users-by-date', protect, checkAdmin, async (req, res) => {
  try {
    // 获取日期参数
    const date = req.query.date;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: '请提供日期参数'
      });
    }
    
    // 构建查询条件 - 查询指定日期的用户
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999); // 设置为当天的最后一毫秒
    
    const users = await User.findAll({
      where: {
        createdAt: {
          [Op.between]: [startDate, endDate]
        }
      },
      attributes: ['id', 'username', 'phone', 'credits', 'isAdmin', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      success: true,
      data: {
        date,
        users,
        count: users.length
      }
    });
  } catch (error) {
    console.error('获取指定日期注册用户错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，获取指定日期注册用户失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/admin/delete-user-usage
 * @desc    删除特定用户的所有功能使用记录
 * @access  私有 (仅管理员)
 */
router.post('/delete-user-usage', protect, checkAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    
    // 验证用户ID
    if (!userId || isNaN(parseInt(userId))) {
      return res.status(400).json({
        success: false,
        message: '请提供有效的用户ID'
      });
    }
    
    console.log(`管理员 ${req.user.username}(ID: ${req.user.id}) 请求删除用户ID为 ${userId} 的所有功能使用记录`);
    
    // 步骤1：从数据库中删除记录
    // 首先查询该用户有哪些功能使用记录
    const userRecords = await FeatureUsage.findAll({
      where: { userId: parseInt(userId) }
    });
    
    if (userRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: `未找到用户ID为 ${userId} 的功能使用记录`
      });
    }
    
    // 记录删除前的信息
    const usageInfo = userRecords.map(record => ({
      featureName: record.featureName,
      usageCount: record.usageCount,
      credits: record.credits || 0,
      lastUsedAt: record.lastUsedAt
    }));
    
    // 执行删除操作
    const deleteResult = await FeatureUsage.destroy({
      where: { userId: parseInt(userId) }
    });
    
    // 步骤2：清理全局变量中的记录
    let globalCleanupResults = {};
    
    // 清理数字人视频任务
    let count = 0;
    if (global.digitalHumanTasks) {
      for (const taskId in global.digitalHumanTasks) {
        if (global.digitalHumanTasks[taskId].userId === parseInt(userId)) {
          delete global.digitalHumanTasks[taskId];
          count++;
        }
      }
      globalCleanupResults.digitalHumanTasks = count;
    }
    
    // 清理视频去除字幕任务
    count = 0;
    if (global.videoSubtitleTasks) {
      for (const taskId in global.videoSubtitleTasks) {
        if (global.videoSubtitleTasks[taskId].userId === parseInt(userId)) {
          delete global.videoSubtitleTasks[taskId];
          count++;
        }
      }
      globalCleanupResults.videoSubtitleTasks = count;
    }
    
    // 清理视频风格重绘任务
    count = 0;
    if (global.videoStyleRepaintTasks) {
      for (const taskId in global.videoStyleRepaintTasks) {
        if (global.videoStyleRepaintTasks[taskId].userId === parseInt(userId)) {
          delete global.videoStyleRepaintTasks[taskId];
          count++;
        }
      }
      globalCleanupResults.videoStyleRepaintTasks = count;
    }
    
    // 记录操作日志
    console.log(`成功删除用户ID为 ${userId} 的 ${deleteResult} 条功能使用记录`);
    console.log(`全局变量清理结果:`, globalCleanupResults);
    
    res.json({
      success: true,
      message: `成功删除用户ID为 ${userId} 的 ${deleteResult} 条功能使用记录`,
      data: {
        databaseRecords: {
          deleted: deleteResult,
          records: usageInfo
        },
        globalVariables: globalCleanupResults
      }
    });
  } catch (error) {
    console.error('删除用户功能使用记录错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，删除用户功能使用记录失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/admin/users
 * @desc    创建新用户（普通用户或内部用户）
 * @access  私有 (仅管理员)
 */
router.post('/users', protect, checkAdmin, async (req, res) => {
  try {
    const { username, password, phone, credits, isAdmin, isInternal } = req.body;
    
    // 基本验证
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }
    
    // 检查用户名是否已存在
    const existingUser = await User.findOne({
      where: { username }
    });
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '用户名已被使用'
      });
    }
    
    // 如果提供了手机号，检查是否已被使用
    if (phone) {
      const existingPhone = await User.findOne({
        where: { phone }
      });
      
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: '手机号已被使用'
        });
      }
    }
    
    // 创建新用户
    const user = await User.create({
      username,
      password,
      phone: phone || null,
      credits: credits ? parseInt(credits) : 0,
      isAdmin: Boolean(isAdmin),
      isInternal: Boolean(isInternal)
    });
    
    res.status(201).json({
      success: true,
      message: '用户创建成功',
      data: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        credits: user.credits,
        isAdmin: user.isAdmin,
        isInternal: user.isInternal,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('创建用户错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，创建用户失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/admin/users/:id/ban
 * @desc    封禁用户
 * @access  私有 (仅管理员)
 */
router.post('/users/:id/ban', protect, checkAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { reason, expireDays } = req.body;
    
    // 查询用户
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 不允许封禁管理员
    if (user.isAdmin) {
      return res.status(400).json({
        success: false,
        message: '不能封禁管理员账号'
      });
    }
    
    // 设置封禁信息
    user.isBanned = true;
    user.banReason = reason || '违反用户协议';
    
    // 如果指定了过期天数，计算过期时间
    if (expireDays) {
      const expireAt = new Date();
      expireAt.setDate(expireAt.getDate() + parseInt(expireDays));
      user.banExpireAt = expireAt;
    } else {
      // 不指定则为永久封禁
      user.banExpireAt = null;
    }
    
    await user.save();
    
    res.json({
      success: true,
      message: '用户已被封禁',
      data: {
        id: user.id,
        username: user.username,
        isBanned: user.isBanned,
        banReason: user.banReason,
        banExpireAt: user.banExpireAt
      }
    });
  } catch (error) {
    console.error('封禁用户错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，封禁用户失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/admin/users/:id/unban
 * @desc    解封用户
 * @access  私有 (仅管理员)
 */
router.post('/users/:id/unban', protect, checkAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // 查询用户
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 如果用户未被封禁
    if (!user.isBanned) {
      return res.status(400).json({
        success: false,
        message: '该用户未被封禁'
      });
    }
    
    // 解除封禁
    user.isBanned = false;
    user.banReason = null;
    user.banExpireAt = null;
    
    await user.save();
    
    res.json({
      success: true,
      message: '用户已解除封禁',
      data: {
        id: user.id,
        username: user.username,
        isBanned: user.isBanned
      }
    });
  } catch (error) {
    console.error('解除封禁错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，解除封禁失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/admin/users/:id/reset-password
 * @desc    管理员重置用户密码
 * @access  私有 (仅管理员)
 */
router.post('/users/:id/reset-password', protect, checkAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { newPassword } = req.body;
    
    // 验证新密码
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: '新密码不能为空且长度至少为6位'
      });
    }
    
    // 查询用户
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 更新密码 (模型钩子会自动加密密码)
    user.password = newPassword;
    await user.save();
    
    res.json({
      success: true,
      message: '用户密码重置成功'
    });
  } catch (error) {
    console.error('重置用户密码错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，重置用户密码失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/admin/users/:id/sessions
 * @desc    获取指定用户的活跃会话
 * @access  私有 (仅管理员)
 */
router.get('/users/:id/sessions', protect, checkAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // 查询用户
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 获取用户的所有活跃会话
    const sessions = await UserSession.findAll({
      where: {
        userId: userId,
        isActive: true,
        expiresAt: { [Op.gt]: new Date() }
      },
      order: [['lastActiveAt', 'DESC']]
    });
    
    // 格式化会话信息
    const formattedSessions = sessions.map(session => ({
      id: session.id,
      deviceInfo: session.deviceInfo,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      lastActiveAt: session.lastActiveAt,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt
    }));
    
    res.json({
      success: true,
      data: {
        sessions: formattedSessions,
        activeSessionCount: sessions.length
      }
    });
  } catch (error) {
    console.error('获取用户会话错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，获取用户会话失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/admin/cleanup-sessions
 * @desc    清理所有过期会话
 * @access  私有 (仅管理员)
 */
router.post('/cleanup-sessions', protect, checkAdmin, async (req, res) => {
  try {
    // 清理过期会话
    const count = await UserSession.cleanupExpiredSessions();
    
    res.json({
      success: true,
      message: `已清理 ${count} 个过期会话`,
      data: {
        cleanedCount: count
      }
    });
  } catch (error) {
    console.error('清理过期会话错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，清理过期会话失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/admin/users/:id/logout-all
 * @desc    登出用户的所有设备
 * @access  私有 (仅管理员)
 */
router.post('/users/:id/logout-all', protect, checkAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // 获取管理员的当前令牌 - 确保不会登出管理员自己
    const adminToken = req.headers.authorization.split(' ')[1];
    
    // 在使会话失效前，先获取用户的最后活跃时间
    const lastActiveSession = await UserSession.findOne({
      where: {
        userId: userId,
        isActive: true,
        sessionType: 'user'  // 只查找普通用户会话
      },
      order: [['lastActiveAt', 'DESC']]
    });
    
    // 如果找到活跃会话，保存最后活跃时间到用户记录
    if (lastActiveSession) {
      await User.update(
        { lastActiveAt: lastActiveSession.lastActiveAt },
        { where: { id: userId } }
      );
    }
    
    // 使所有普通用户会话失效，不影响管理员会话
    const result = await UserSession.update(
      {
        isActive: false,
        expiresAt: new Date() // 立即过期
      },
      {
        where: {
          userId: userId,
          isActive: true,
          sessionType: 'user'  // 只使普通用户会话失效
        }
      }
    );
    
    console.log(`管理员使用户 ${userId} 的 ${result[0]} 个普通会话失效`);
    
    res.json({
      success: true,
      message: `已成功登出用户的所有设备 (${result[0]}个)`
    });
  } catch (error) {
    console.error('登出用户所有设备错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，操作失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/admin/login
 * @desc    管理员登录
 * @access  公开
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // 验证必要字段
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码为必填项'
      });
    }
    
    // 查询用户
    const user = await User.findOne({ where: { username } });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }
    
    // 验证密码
    const isMatch = await user.matchPassword(password);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }
    
    // 检查用户是否为管理员
    if (!user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: '没有管理员权限'
      });
    }
    
    // 生成JWT令牌，指定为管理员会话
    const { token, expiresAt } = await generateToken(user.id, req, JWT_EXPIRE, true);
    
    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        token,
        expiresAt
      }
    });
  } catch (error) {
    console.error('管理员登录错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，登录失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/admin/logout
 * @desc    管理员登出
 * @access  私有 (需要管理员认证)
 */
router.post('/logout', protect, checkAdmin, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 获取当前会话的令牌
    const currentToken = req.headers.authorization.split(' ')[1];
    
    // 查找当前会话
    const session = await UserSession.findOne({
      where: {
        token: currentToken,
        userId: userId,
        sessionType: 'admin'
      }
    });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: '管理员会话不存在'
      });
    }
    
    // 在使会话失效前，先保存最后活跃时间到用户记录
    await User.update(
      { lastActiveAt: session.lastActiveAt || new Date() },
      { where: { id: userId } }
    );
    
    // 使会话失效
    session.isActive = false;
    session.expiresAt = new Date(); // 立即过期
    await session.save();
    
    console.log(`管理员 ${userId} 主动登出了会话 ${session.id}`);
    
    res.json({
      success: true,
      message: '管理员已成功登出'
    });
  } catch (error) {
    console.error('管理员登出错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，登出失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router; 