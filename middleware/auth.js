const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

// 从环境变量中获取JWT密钥和过期时间
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';

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

      // 将用户信息添加到请求对象，不包含密码
      req.user = await User.findByPk(decoded.id, {
        attributes: { exclude: ['password'] }
      });

      next();
    } catch (error) {
      console.error('认证错误:', error);
      return res.status(401).json({ 
        success: false, 
        message: '未授权，令牌已失效或不正确' 
      });
    }
  }

  // 如果没有token
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: '未授权，请先登录' 
    });
  }
};

/**
 * 生成JWT令牌
 * @param {number} id 用户ID
 * @param {string} expiresIn 过期时间，例如：'30d'，'1h'，'30m'等
 * @returns {string} JWT令牌
 */
const generateToken = (id, expiresIn = JWT_EXPIRE) => {
  return jwt.sign({ id }, JWT_SECRET, {
    expiresIn: expiresIn
  });
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
  generateToken,
  protect,
  checkAdmin
}; 