const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');
const sequelize = require('../config/db');

// 定义用户模型
const User = sequelize.define('User', {
  // 用户ID - 主键，自动增长
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // 用户名 - 不能为空，且必须唯一
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    // 不在这里使用unique:true，我们会通过直接SQL定义索引
    validate: {
      notEmpty: true,
      len: [3, 50] // 用户名长度在3-50之间
    }
  },
  // 密码 - 不能为空
  password: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [6, 100] // 密码长度在6-100之间
    }
  },
  // 手机号 - 可以为空，但必须唯一
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    // 不在这里使用unique:true，我们会通过直接SQL定义索引
    validate: {
      is: /^1[3-9]\d{9}$/ // 验证是否为有效的手机号格式（中国大陆）
    }
  },
  // 短信验证码
  smsCode: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  // 验证码过期时间
  smsCodeExpires: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // 用户积分
  credits: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0, // 初始积分为0
    validate: {
      min: 0 // 积分不能为负数
    }
  },
  // 最后充值时间
  lastRechargeTime: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  },
  // 是否为管理员
  isAdmin: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false // 默认不是管理员
  },
  // 用户创建时间
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  // 用户信息更新时间
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  // 其他模型配置
  tableName: 'users', // 表名
  timestamps: true, // 自动管理createdAt和updatedAt字段
  indexes: [] // 不使用自动索引定义，避免索引过多问题
});

// 模型钩子 - 保存前加密密码
User.beforeCreate(async (user) => {
  // 如果密码已修改或是新用户，则加密密码
  if (user.password) {
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
  }
});

User.beforeUpdate(async (user) => {
  // 如果密码已修改，则加密密码
  if (user.changed('password')) {
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
  }
});

// 实例方法 - 验证密码是否匹配
User.prototype.matchPassword = async function(enteredPassword) {
  try {
    console.log(`尝试验证密码, 用户ID: ${this.id}`);
    if (!enteredPassword) {
      console.log('验证失败: 提供的密码为空');
      return false;
    }
    
    const isMatch = await bcrypt.compare(enteredPassword, this.password);
    console.log(`密码验证结果: ${isMatch ? '匹配成功' : '匹配失败'}`);
    return isMatch;
  } catch (error) {
    console.error('密码验证错误:', error);
    // 出错时返回false，确保安全
    return false;
  }
};

// 实例方法 - 验证短信验证码是否有效
User.prototype.isValidSmsCode = function(code) {
  // 检查验证码是否匹配且未过期
  return this.smsCode === code && 
         this.smsCodeExpires && 
         new Date() < new Date(this.smsCodeExpires);
};

// 实例方法 - 保存短信验证码
User.prototype.saveSmsCode = async function(code, expiresInMinutes = 5) {
  // 设置验证码和过期时间
  this.smsCode = code;
  
  // 设置过期时间 (默认5分钟)
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);
  this.smsCodeExpires = expiresAt;
  
  // 保存到数据库
  await this.save();
  
  return true;
};

module.exports = User; 