const jwt = require('jsonwebtoken');
const User = require('../models/User');
const UserSession = require('../models/UserSession');
const sequelize = require('../config/db');
const { JWT_SECRET } = require('../utils/jwt');
require('dotenv').config();

/**
 * 保护路由中间件 - 验证用户是否登录
 * 用法：在需要保护的路由前添加此中间件
 * 例如: router.get('/profile', protect, profileController.getProfile);
 */
const protect = async (req, res, next) => {
  let token;

  // 检查请求头中是否有Authorization，且格式为Bearer token
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // 从请求头中获取token
      token = req.headers.authorization.split(' ')[1];

      // 验证token
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // 确定是否为管理员接口请求
      const isAdminRequest = req.originalUrl.includes('/api/admin');
      
      // 如果是管理员接口请求，但token不是管理员token，则拒绝访问
      if (isAdminRequest && !decoded.isAdmin) {
        return res.status(403).json({ 
          success: false, 
          message: '没有访问管理员接口的权限' 
        });
      }

      // 将用户信息添加到请求对象，不包含密码
      req.user = await User.findByPk(decoded.id, {
        attributes: { exclude: ['password'] }
      });

      // 检查用户是否存在
      if (!req.user) {
        return res.status(401).json({ 
          success: false, 
          message: '用户不存在或已被删除' 
        });
      }

      try {
        // 检查会话是否有效
        const session = await UserSession.findOne({
          where: {
            token: token,
            sessionType: decoded.isAdmin ? 'admin' : 'user'  // 根据token类型查找对应类型的会话
          }
        });

        // 如果会话不存在，直接拒绝访问
        if (!session) {
          console.log(`令牌 ${token.substring(0, 10)}... 没有对应的${decoded.isAdmin ? '管理员' : '用户'}会话记录`);
          return res.status(401).json({ 
            success: false, 
            message: '会话不存在，请重新登录' 
          });
        }
        
        // 检查会话是否已被标记为无效
        if (!session.isActive) {
          console.log(`用户 ${req.user.id} 的会话已被管理员禁用`);
          return res.status(401).json({ 
            success: false, 
            message: '您的会话已被管理员终止，请重新登录' 
          });
        }
        
        // 检查会话是否已过期
        if (session.expiresAt < new Date()) {
          console.log(`用户 ${req.user.id} 的会话已过期`);
          return res.status(401).json({ 
            success: false, 
            message: '会话已过期，请重新登录' 
          });
        }
        
        // 会话有效，更新最后活动时间
        session.lastActiveAt = new Date();
        await session.save();
        
        // 同时更新用户的最后活跃时间
        await User.update(
          { lastActiveAt: new Date() },
          { where: { id: req.user.id } }
        );
      } catch (error) {
        // 如果会话验证失败，记录错误并拒绝访问
        console.error('会话验证错误:', error);
        return res.status(401).json({ 
          success: false, 
          message: '会话验证失败，请重新登录' 
        });
      }

      next();
    } catch (error) {
      console.error('认证错误:', error);
      return res.status(401).json({ 
        success: false, 
        message: '未授权，令牌已失效或不正确' 
      });
    }
  } else if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: '未授权，请先登录' 
    });
  }
};

/**
 * 使指定用户的所有会话失效
 * @param {number} userId 用户ID
 * @param {string} currentToken 当前会话的令牌（可选，如果提供则不会使当前会话失效）
 * @param {string} sessionType 会话类型（可选，如果提供则只使指定类型的会话失效）
 * @returns {number} 使失效的会话数量
 */
const invalidateAllSessions = async (userId, currentToken = null, sessionType = null) => {
  try {
    const where = {
      userId: userId,
      isActive: true
    };

    // 如果提供了当前令牌，则不使当前会话失效
    if (currentToken) {
      where.token = {
        [sequelize.Sequelize.Op.ne]: currentToken
      };
    }
    
    // 如果提供了会话类型，则只使指定类型的会话失效
    if (sessionType) {
      where.sessionType = sessionType;
    }

    const result = await UserSession.update(
      { isActive: false },
      { where: where }
    );

    return result[0]; // 返回更新的记录数
  } catch (error) {
    console.error('使会话失效失败:', error);
    return 0;
  }
};

// 添加管理员权限验证中间件
const checkAdmin = async (req, res, next) => {
  try {
    // 先验证用户是否已登录
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 检查用户是否为管理员
    if (!user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: '没有管理员权限'
      });
    }
    
    next();
  } catch (error) {
    console.error('验证管理员权限出错:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，无法验证管理员权限',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  protect,
  checkAdmin,
  invalidateAllSessions
}; 