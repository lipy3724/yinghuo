const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateToken, protect } = require('../middleware/auth');
const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { sendSmsCode } = require('../utils/aliyunSmsUtil');
const jwt = require('jsonwebtoken');

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

    console.log(`密码验证成功，正在生成JWT令牌，用户=${user.username}`);
    
    // 生成JWT令牌
    const token = generateToken(user.id);

    console.log(`登录成功: 用户=${user.username}, id=${user.id}`);
    
    // 返回用户信息和令牌，不包含密码
    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        createdAt: user.createdAt,
        token
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

module.exports = router; 