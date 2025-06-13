const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// 定义用户会话模型
const UserSession = sequelize.define('UserSession', {
  // 会话ID - 主键，自动增长
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // 用户ID - 关联到User表
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  // JWT令牌
  token: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  // 设备信息
  deviceInfo: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  // IP地址
  ipAddress: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  // 用户代理字符串
  userAgent: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // 会话是否有效
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  // 最后活动时间
  lastActiveAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  // 过期时间
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  // 会话类型（admin或user）
  sessionType: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'user'
  },
  // 会话创建时间
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  // 会话更新时间
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  // 其他模型配置
  tableName: 'user_sessions', // 表名
  timestamps: true, // 自动管理createdAt和updatedAt字段
  indexes: [
    {
      fields: ['userId'],
      name: 'user_sessions_user_id'
    },
    {
      fields: ['token'],
      name: 'user_sessions_token'
    },
    {
      fields: ['isActive'],
      name: 'user_sessions_is_active'
    }
  ]
});

// 创建与User模型的关联
const User = require('./User');
UserSession.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(UserSession, { foreignKey: 'userId' });

// 实例方法 - 使会话失效
UserSession.prototype.invalidate = async function() {
  this.isActive = false;
  await this.save();
  return true;
};

// 静态方法 - 清理过期会话
UserSession.cleanupExpiredSessions = async function() {
  const now = new Date();
  const result = await UserSession.update(
    { isActive: false },
    { where: { expiresAt: { [sequelize.Sequelize.Op.lt]: now }, isActive: true } }
  );
  return result[0]; // 返回更新的记录数
};

// 静态方法 - 获取用户的活跃会话数
UserSession.getActiveSessionCount = async function(userId) {
  const count = await UserSession.count({
    where: {
      userId,
      isActive: true,
      expiresAt: { [sequelize.Sequelize.Op.gt]: new Date() }
    }
  });
  return count;
};

// 静态方法 - 获取用户的所有活跃会话
UserSession.getActiveSessions = async function(userId) {
  const sessions = await UserSession.findAll({
    where: {
      userId,
      isActive: true,
      expiresAt: { [sequelize.Sequelize.Op.gt]: new Date() }
    },
    order: [['lastActiveAt', 'DESC']]
  });
  return sessions;
};

module.exports = UserSession; 