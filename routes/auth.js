const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, invalidateAllSessions } = require('../middleware/auth');
const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { sendSmsCode } = require('../utils/aliyunSmsUtil');
const jwt = require('jsonwebtoken');
const UserSession = require('../models/UserSession');
const sequelize = require('../config/db');
const { generateToken, JWT_EXPIRE } = require('../utils/jwt');
require('dotenv').config();

/**
 * @route   POST /api/auth/register
 * @desc    注册新用户 (通过用户名和密码)
 * @access  公开
 */
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    // 检查用户名是否已存在
    const usernameExists = await User.findOne({ where: { username } });
    if (usernameExists) {
      return res.status(400).json({
        success: false,
        message: '用户名已被使用'
      });
    }

    // 创建新用户 - 密码会在模型钩子中自动加密
    const user = await User.create({
      username,
      password
    });

    // 生成JWT令牌
    const token = generateToken(user.id);

    // 返回用户信息和令牌，不包含密码
    res.status(201).json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
        token
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，注册失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/phone/send-code
 * @desc    发送手机验证码 (用于手机注册)
 * @access  公开
 */
router.post('/phone/send-code', async (req, res) => {
  const { phone } = req.body;

  try {
    // 验证手机号格式
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: '请输入有效的手机号'
      });
    }

    // 检查手机号是否已被注册
    const phoneExists = await User.findOne({ where: { phone } });
    if (phoneExists) {
      return res.status(400).json({
        success: false,
        message: '该手机号已被注册'
      });
    }

    // 生成随机验证码（6位数字）
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 保存验证码到数据库或临时存储
    // 这里我们先创建一个临时用户，如果用户完成注册则更新信息
    let user = await User.findOne({ where: { phone } });
    
    if (!user) {
      // 创建临时用户
      user = await User.create({
        username: `user_${phone.substring(7)}`, // 临时用户名，注册时会更新
        password: Math.random().toString(36).substring(2), // 临时密码，注册时会更新
        phone
      });
    }

    // 保存验证码和过期时间
    await user.saveSmsCode(code);

    // 发送短信验证码
    const result = await sendSmsCode(phone, code);

    if (result.success) {
      res.json({
        success: true,
        message: '验证码发送成功'
      });
    } else {
      res.status(500).json({
        success: false,
        message: '验证码发送失败: ' + result.message
      });
    }
  } catch (error) {
    console.error('发送验证码错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，发送验证码失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/phone/register
 * @desc    通过手机号注册
 * @access  公开
 */
router.post('/phone/register', async (req, res) => {
  const { phone, code, username, password } = req.body;

  try {
    // 验证必要字段
    if (!phone || !code || !username || !password) {
      return res.status(400).json({
        success: false,
        message: '所有字段都是必填项'
      });
    }

    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: '手机号格式不正确'
      });
    }

    // 检查用户名是否已存在
    const usernameExists = await User.findOne({ where: { username } });
    if (usernameExists) {
      return res.status(400).json({
        success: false,
        message: '用户名已被使用'
      });
    }

    // 查找临时用户
    const user = await User.findOne({ where: { phone } });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: '请先获取短信验证码'
      });
    }

    // 验证短信验证码
    if (!user.isValidSmsCode(code)) {
      return res.status(400).json({
        success: false,
        message: '验证码无效或已过期'
      });
    }

    // 更新用户信息
    user.username = username;
    user.password = password;
    
    // 清除验证码
    user.smsCode = null;
    user.smsCodeExpires = null;
    
    await user.save();

    // 生成JWT令牌
    const token = generateToken(user.id);

    // 返回用户信息和令牌
    res.status(201).json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        token
      }
    });
  } catch (error) {
    console.error('手机注册错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，注册失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/phone/login
 * @desc    通过手机号和验证码登录
 * @access  公开
 */
router.post('/phone/login', async (req, res) => {
  const { phone, code } = req.body;

  try {
    // 验证必要字段
    if (!phone || !code) {
      return res.status(400).json({
        success: false,
        message: '手机号和验证码为必填项'
      });
    }

    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: '手机号格式不正确'
      });
    }

    // 查找用户
    const user = await User.findOne({ where: { phone } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '该手机号未注册'
      });
    }

    // 验证短信验证码
    if (!user.isValidSmsCode(code)) {
      return res.status(401).json({
        success: false,
        message: '验证码无效或已过期'
      });
    }

    // 清除验证码
    user.smsCode = null;
    user.smsCodeExpires = null;
    await user.save();

    // 检查用户是否被封禁
    const banStatus = user.checkBanStatus();
    if (banStatus) {
      console.log(`手机登录失败: 用户已被封禁 - 用户=${user.username}`);
      
      // 格式化过期时间
      let expireMessage = '永久封禁';
      if (banStatus.expireAt) {
        const expireDate = new Date(banStatus.expireAt);
        expireMessage = `封禁至 ${expireDate.getFullYear()}-${(expireDate.getMonth() + 1).toString().padStart(2, '0')}-${expireDate.getDate().toString().padStart(2, '0')}`;
      }
      
      return res.status(403).json({
        success: false,
        message: '账号已被封禁',
        data: {
          isBanned: true,
          reason: banStatus.reason,
          expireMessage: expireMessage
        }
      });
    }

    // 生成JWT令牌
    const token = generateToken(user.id);

    // 返回用户信息和令牌
    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        token
      }
    });
  } catch (error) {
    console.error('手机登录错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，登录失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/phone/login-send-code
 * @desc    发送手机验证码 (用于手机登录)
 * @access  公开
 */
router.post('/phone/login-send-code', async (req, res) => {
  const { phone } = req.body;

  try {
    // 验证手机号格式
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: '请输入有效的手机号'
      });
    }

    // 检查手机号是否已注册
    const user = await User.findOne({ where: { phone } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '该手机号未注册'
      });
    }

    // 生成随机验证码（6位数字）
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 保存验证码和过期时间
    await user.saveSmsCode(code);

    // 发送短信验证码
    const result = await sendSmsCode(phone, code);

    if (result.success) {
      res.json({
        success: true,
        message: '验证码发送成功'
      });
    } else {
      res.status(500).json({
        success: false,
        message: '验证码发送失败: ' + result.message
      });
    }
  } catch (error) {
    console.error('发送登录验证码错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，发送验证码失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    用户登录
 * @access  公开
 */
router.post('/login', async (req, res) => {
  const { account, password } = req.body;

  try {
    console.log(`开始登录处理: 账号=${account}`);
    
    // 验证账号和密码
    if (!account || !password) {
      console.log('登录失败: 账号或密码为空');
      return res.status(400).json({
        success: false,
        message: '账号和密码为必填项'
      });
    }

    // 尝试按用户名查找用户
    let user = await User.findOne({ where: { username: account } });
    
    // 如果按用户名未找到，尝试按手机号查找
    if (!user && /^1[3-9]\d{9}$/.test(account)) {
      console.log('用户名未找到，尝试按手机号查找');
      user = await User.findOne({ where: { phone: account } });
    }
    
    // 如果用户不存在，返回错误
    if (!user) {
      console.log(`登录失败: 用户不存在 - ${account}`);
      return res.status(401).json({
        success: false,
        message: '账号或密码错误'
      });
    }

    console.log(`用户找到: id=${user.id}, username=${user.username}`);
    
    // 验证密码
    const isPasswordMatch = await user.matchPassword(password);
    
    // 如果密码不匹配，返回错误
    if (!isPasswordMatch) {
      console.log(`登录失败: 密码不匹配 - 用户=${user.username}`);
      return res.status(401).json({
        success: false,
        message: '账号或密码错误'
      });
    }

    // 检查用户是否被封禁
    const banStatus = user.checkBanStatus();
    if (banStatus) {
      console.log(`登录失败: 用户已被封禁 - 用户=${user.username}`);
      
      // 格式化过期时间
      let expireMessage = '永久封禁';
      if (banStatus.expireAt) {
        const expireDate = new Date(banStatus.expireAt);
        expireMessage = `封禁至 ${expireDate.getFullYear()}-${(expireDate.getMonth() + 1).toString().padStart(2, '0')}-${expireDate.getDate().toString().padStart(2, '0')}`;
      }
      
      return res.status(403).json({
        success: false,
        message: '账号已被封禁',
        data: {
          isBanned: true,
          reason: banStatus.reason,
          expireMessage: expireMessage
        }
      });
    }

    console.log(`密码验证成功，正在生成JWT令牌，用户=${user.username}`);
    
    // 生成JWT令牌并记录会话，指定为普通用户会话
    const { token, expiresAt } = await generateToken(user.id, req, JWT_EXPIRE, false);

    // 更新用户的最后活跃时间
    user.lastActiveAt = new Date();
    await user.save();

    // 获取当前用户的活跃会话数
    const activeSessionCount = await UserSession.getActiveSessionCount(user.id);

    console.log(`登录成功: 用户=${user.username}, id=${user.id}, 活跃会话数=${activeSessionCount}`);
    
    // 返回用户信息和令牌，不包含密码
    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        createdAt: user.createdAt,
        token,
        expiresAt,
        activeSessionCount
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({
      success: false,
      message: '服务器错误，登录失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/auth/user
 * @desc    获取当前用户信息
 * @access  私有
 */
router.get('/user', protect, async (req, res) => {
  try {
    // 从请求对象中获取用户ID
    const userId = req.user.id;
    
    // 查找用户，不返回密码
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 返回用户信息
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，获取用户信息失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/update-profile
 * @desc    更新用户基本信息
 * @access  私有
 */
router.post('/update-profile', protect, async (req, res) => {
  try {
    const { username } = req.body;
    const userId = req.user.id;

    // 验证用户名
    if (!username || username.trim() === '') {
      return res.status(400).json({
        success: false,
        message: '用户名不能为空'
      });
    }

    // 检查用户名是否已被其他用户使用
    const existingUser = await User.findOne({
      where: { 
        username,
        id: { [Op.ne]: userId } // 使用导入的Op
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '用户名已被使用'
      });
    }

    // 更新用户信息
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    user.username = username;
    await user.save();

    // 返回更新后的用户信息（不包含密码）
    res.json({
      success: true,
      message: '个人信息更新成功',
      data: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
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
 * @route   POST /api/auth/change-password
 * @desc    修改用户密码
 * @access  私有
 */
router.post('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // 验证输入
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '当前密码和新密码都是必填项'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: '新密码长度至少6位'
      });
    }

    // 查找用户
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 验证当前密码
    const isMatch = await user.matchPassword(currentPassword);
    
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: '当前密码不正确'
      });
    }

    // 更新密码
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error) {
    console.error('修改密码错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，修改密码失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/send-verification-code
 * @desc    发送手机验证码
 * @access  私有
 */
router.post('/send-verification-code', protect, async (req, res) => {
  try {
    const { phone } = req.body;
    
    // 验证手机号格式
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: '请输入有效的手机号'
      });
    }

    // 检查手机号是否已被其他用户绑定
    const existingUser = await User.findOne({
      where: { 
        phone,
        id: { [Op.ne]: req.user.id } // 使用导入的Op
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '该手机号已被其他账户绑定'
      });
    }

    // 生成随机验证码（6位数字）
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 在实际应用中，这里应该调用短信发送API
    // 为了演示，我们模拟发送验证码，并将其存储在会话中
    // 在生产环境中，应该使用Redis等存储验证码，并设置过期时间
    
    // 将验证码存储在req.session中(需要配置express-session)
    // req.session.verificationCode = {
    //   phone,
    //   code,
    //   expires: Date.now() + 5 * 60 * 1000 // 5分钟有效期
    // };
    
    // 由于我们没有配置session，这里为了演示，我们返回验证码
    // 在生产环境中，不应该这样做！
    res.json({
      success: true,
      message: '验证码发送成功',
      data: { code } // 仅用于演示！生产环境不要返回验证码
    });
  } catch (error) {
    console.error('发送验证码错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，发送验证码失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/bind-phone
 * @desc    绑定手机号
 * @access  私有
 */
router.post('/bind-phone', protect, async (req, res) => {
  try {
    const { phone, code } = req.body;
    const userId = req.user.id;
    
    // 验证手机号格式
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: '请输入有效的手机号'
      });
    }

    // 检查手机号是否已被其他用户绑定
    const existingUser = await User.findOne({
      where: { 
        phone,
        id: { [Op.ne]: userId } // 使用导入的Op
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '该手机号已被其他账户绑定'
      });
    }

    // 验证验证码
    // 在实际应用中，应该从session或Redis中获取验证码并验证
    // 为了演示，我们假设任何验证码都有效
    
    // 以下是验证验证码的示例代码（使用session）：
    // if (!req.session.verificationCode ||
    //     req.session.verificationCode.phone !== phone ||
    //     req.session.verificationCode.code !== code ||
    //     req.session.verificationCode.expires < Date.now()) {
    //   return res.status(400).json({
    //     success: false,
    //     message: '验证码无效或已过期'
    //   });
    // }
    
    // 更新用户手机号
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    user.phone = phone;
    await user.save();
    
    // 清除验证码
    // req.session.verificationCode = null;

    // 返回更新后的用户信息
    res.json({
      success: true,
      message: '手机号绑定成功',
      data: {
        id: user.id,
        username: user.username,
        phone: user.phone
      }
    });
  } catch (error) {
    console.error('绑定手机号错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，绑定手机号失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/register-with-phone
 * @desc    注册新用户并绑定手机号
 * @access  公开
 */
router.post('/register-with-phone', async (req, res) => {
  const { username, password, phone, code } = req.body;

  try {
    // 验证必要字段
    if (!username || !password || !phone || !code) {
      return res.status(400).json({
        success: false,
        message: '所有字段都是必填项'
      });
    }

    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: '手机号格式不正确'
      });
    }

    // 检查用户名是否已存在
    const usernameExists = await User.findOne({ where: { username } });
    if (usernameExists) {
      return res.status(400).json({
        success: false,
        message: '用户名已被使用'
      });
    }

    // 检查手机号是否已被注册
    const phoneExists = await User.findOne({ where: { phone } });
    
    // 验证临时用户和验证码
    if (!phoneExists) {
      return res.status(400).json({
        success: false,
        message: '请先获取短信验证码'
      });
    }

    // 验证短信验证码
    if (!phoneExists.isValidSmsCode(code)) {
      return res.status(400).json({
        success: false,
        message: '验证码无效或已过期'
      });
    }
    
    // 如果手机号对应的是临时用户，则更新该用户信息
    // 这里我们检查用户名是否是自动生成的临时用户名
    if (phoneExists.username.startsWith('user_')) {
      phoneExists.username = username;
      phoneExists.password = password;
      
      // 清除验证码
      phoneExists.smsCode = null;
      phoneExists.smsCodeExpires = null;
      
      await phoneExists.save();
      
      // 生成JWT令牌
      const token = generateToken(phoneExists.id);

      // 返回用户信息和令牌
      res.status(201).json({
        success: true,
        data: {
          id: phoneExists.id,
          username: phoneExists.username,
          phone: phoneExists.phone,
          token
        }
      });
    } else {
      // 如果手机号已被正式注册，不允许再次使用
      return res.status(400).json({
        success: false,
        message: '该手机号已被注册'
      });
    }
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，注册失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/phone/register-send-code
 * @desc    发送手机验证码 (用于手机注册)
 * @access  公开
 */
router.post('/phone/register-send-code', async (req, res) => {
  const { phone } = req.body;

  try {
    // 验证手机号格式
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: '请输入有效的手机号'
      });
    }

    // 检查手机号是否已被注册
    const phoneExists = await User.findOne({ where: { phone } });
    if (phoneExists && !phoneExists.username.startsWith('user_')) {
      return res.status(400).json({
        success: false,
        message: '该手机号已被注册'
      });
    }

    // 生成随机验证码（6位数字）
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 保存验证码到数据库或临时存储
    // 这里我们先创建一个临时用户，如果用户完成注册则更新信息
    let user = phoneExists;
    
    if (!user) {
      // 创建临时用户
      user = await User.create({
        username: `user_${phone.substring(7)}`, // 临时用户名，注册时会更新
        password: Math.random().toString(36).substring(2), // 临时密码，注册时会更新
        phone
      });
    }

    // 保存验证码和过期时间
    await user.saveSmsCode(code);

    // 发送短信验证码
    const result = await sendSmsCode(phone, code);

    if (result.success) {
      res.json({
        success: true,
        message: '验证码发送成功'
      });
    } else {
      res.status(500).json({
        success: false,
        message: '验证码发送失败: ' + result.message
      });
    }
  } catch (error) {
    console.error('发送验证码错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，发送验证码失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/forgot-password/send-code
 * @desc    忘记密码 - 发送验证码
 * @access  公开
 */
router.post('/forgot-password/send-code', async (req, res) => {
  const { phone } = req.body;

  try {
    // 验证手机号格式
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: '请输入有效的手机号'
      });
    }

    // 检查手机号是否已注册
    const user = await User.findOne({ where: { phone } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '该手机号未注册，请先注册账号'
      });
    }

    // 生成随机验证码（6位数字）
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 将验证码保存到用户记录中
    await user.saveSmsCode(code);

    // 发送短信验证码
    const result = await sendSmsCode(phone, code);

    if (result.success) {
      res.json({
        success: true,
        message: '验证码发送成功'
      });
    } else {
      res.status(500).json({
        success: false,
        message: '验证码发送失败: ' + result.message
      });
    }
  } catch (error) {
    console.error('忘记密码-发送验证码错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，发送验证码失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/forgot-password/verify-code
 * @desc    忘记密码 - 验证短信验证码
 * @access  公开
 */
router.post('/forgot-password/verify-code', async (req, res) => {
  const { phone, code } = req.body;

  try {
    // 验证必要字段
    if (!phone || !code) {
      return res.status(400).json({
        success: false,
        message: '手机号和验证码为必填项'
      });
    }

    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: '手机号格式不正确'
      });
    }

    // 查找用户
    const user = await User.findOne({ where: { phone } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '该手机号未注册'
      });
    }

    // 验证短信验证码
    if (!user.isValidSmsCode(code)) {
      return res.status(401).json({
        success: false,
        message: '验证码无效或已过期'
      });
    }

    // 生成临时验证令牌
    const token = generateToken(user.id, '30m'); // 30分钟有效期的令牌

    // 返回验证成功和令牌
    res.json({
      success: true,
      message: '验证成功',
      token
    });
  } catch (error) {
    console.error('忘记密码-验证码验证错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，验证失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/forgot-password/reset
 * @desc    忘记密码 - 重置密码
 * @access  公开
 */
router.post('/forgot-password/reset', async (req, res) => {
  const { phone, token, newPassword } = req.body;

  try {
    // 验证必要字段
    if (!phone || !token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '所有字段都是必填项'
      });
    }

    // 验证密码长度
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: '密码长度至少为6位'
      });
    }

    // 验证令牌并获取用户ID
    let userId;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.id;
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: '令牌无效或已过期，请重新验证'
      });
    }

    // 查找用户
    const user = await User.findOne({ 
      where: { 
        id: userId,
        phone 
      } 
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在或手机号不匹配'
      });
    }

    // 更新密码
    user.password = newPassword;
    
    // 清除验证码
    user.smsCode = null;
    user.smsCodeExpires = null;
    
    await user.save();

    res.json({
      success: true,
      message: '密码重置成功'
    });
  } catch (error) {
    console.error('重置密码错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，重置密码失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/auth/check-developer
 * @desc    检查用户是否拥有开发者权限
 * @access  私有
 */
router.get('/check-developer', protect, async (req, res) => {
  try {
    // 获取当前用户名
    const userId = req.user.id;
    const user = await User.findByPk(userId, {
      attributes: ['username']
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 检查是否是开发者账号(只有lilili1119才是开发者)
    const isDeveloper = user.username === 'lilili1119';

    res.json({
      success: true,
      isDeveloper
    });
  } catch (error) {
    console.error('检查开发者权限错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 检查用户是否已经登录的路由
router.get('/check-auth', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: '未提供令牌'
      });
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id, {
        attributes: { exclude: ['password'] }
      });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }
      
      res.json({
        success: true,
        data: {
          user
        }
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: '无效的令牌'
      });
    }
  } catch (error) {
    console.error('检查认证状态错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，无法验证认证状态'
    });
  }
});

/**
 * @route   GET /api/auth/verify
 * @desc    验证用户token并返回用户信息(包括管理员状态)
 * @access  公开
 */
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: '未提供令牌'
      });
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id, {
        attributes: ['id', 'username', 'isAdmin', 'credits', 'createdAt']
      });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }
      
      // 添加会话有效性检查
      const session = await UserSession.findOne({
        where: {
          token: token
        }
      });
      
      // 如果会话不存在，返回401
      if (!session) {
        console.log(`令牌 ${token.substring(0, 10)}... 没有对应的会话记录`);
        return res.status(401).json({ 
          success: false, 
          message: '会话不存在，请重新登录' 
        });
      }
      
      // 检查会话是否已被标记为无效
      if (!session.isActive) {
        console.log(`用户 ${user.id} 的会话已被管理员禁用`);
        return res.status(401).json({ 
          success: false, 
          message: '您的会话已被管理员终止，请重新登录',
          data: {
            userSessionTerminated: true,
            code: 'ADMIN_TERMINATED_SESSION'
          }
        });
      }
      
      // 检查会话是否已过期
      if (session.expiresAt < new Date()) {
        console.log(`用户 ${user.id} 的会话已过期`);
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
        { where: { id: user.id } }
      );
      
      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          isAdmin: user.isAdmin,
          credits: user.credits,
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: '无效的令牌'
      });
    }
  } catch (error) {
    console.error('验证用户错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，无法验证用户'
    });
  }
});

/**
 * @route   GET /api/auth/sessions
 * @desc    获取当前用户的所有活跃会话
 * @access  私有
 */
router.get('/sessions', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 获取当前用户的所有活跃会话
    const sessions = await UserSession.getActiveSessions(userId);
    
    // 获取当前会话的令牌
    const currentToken = req.headers.authorization.split(' ')[1];
    
    // 标记当前会话
    const formattedSessions = sessions.map(session => {
      const isCurrentSession = session.token === currentToken;
      
      return {
        id: session.id,
        deviceInfo: session.deviceInfo,
        ipAddress: session.ipAddress,
        lastActiveAt: session.lastActiveAt,
        createdAt: session.createdAt,
        isCurrentSession
      };
    });
    
    res.json({
      success: true,
      data: {
        sessions: formattedSessions,
        activeSessionCount: sessions.length
      }
    });
  } catch (error) {
    console.error('获取会话列表错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，获取会话列表失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/sessions/logout-all
 * @desc    登出所有其他设备
 * @access  私有
 */
router.post('/sessions/logout-all', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 获取当前会话的令牌
    const currentToken = req.headers.authorization.split(' ')[1];
    
    // 使所有其他会话失效
    const invalidatedCount = await invalidateAllSessions(userId, currentToken);
    
    res.json({
      success: true,
      message: `成功登出其他 ${invalidatedCount} 个设备`,
      data: {
        invalidatedCount
      }
    });
  } catch (error) {
    console.error('登出其他设备错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，登出其他设备失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/sessions/:id/logout
 * @desc    登出指定会话
 * @access  私有
 */
router.post('/sessions/:id/logout', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessionId = req.params.id;
    
    // 获取当前会话的令牌
    const currentToken = req.headers.authorization.split(' ')[1];
    
    // 查找要登出的会话
    const session = await UserSession.findOne({
      where: {
        id: sessionId,
        userId: userId
      }
    });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: '会话不存在或不属于当前用户'
      });
    }
    
    // 检查是否是当前会话
    if (session.token === currentToken) {
      return res.status(400).json({
        success: false,
        message: '不能登出当前会话，请使用登出功能'
      });
    }
    
    // 在使会话失效前，先保存最后活跃时间到用户记录
    await User.update(
      { lastActiveAt: session.lastActiveAt || new Date() },
      { where: { id: userId } }
    );
    
    // 使会话失效
    await session.invalidate();
    
    res.json({
      success: true,
      message: '成功登出指定设备',
      data: {
        sessionId
      }
    });
  } catch (error) {
    console.error('登出指定设备错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，登出指定设备失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    使当前会话失效
 * @access  私有
 */
router.post('/logout', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 获取当前会话的令牌
    const currentToken = req.headers.authorization.split(' ')[1];
    
    // 查找当前会话
    const session = await UserSession.findOne({
      where: {
        token: currentToken,
        userId: userId
      }
    });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: '会话不存在'
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
    
    console.log(`用户 ${userId} 主动登出了会话 ${session.id}`);
    
    res.json({
      success: true,
      message: '登出成功'
    });
  } catch (error) {
    console.error('登出错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，登出失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router; 