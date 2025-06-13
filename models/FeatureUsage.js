const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./User');

// 定义功能使用记录模型
const FeatureUsage = sequelize.define('FeatureUsage', {
  // ID - 主键，自动增长
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // 用户ID - 关联到User表
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  // 功能名称
  featureName: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  // 使用次数
  usageCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  // 上次使用时间
  lastUsedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  // resetDate 字段保留，但不再用于重置免费次数
  resetDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  // 积分消费总额
  credits: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    comment: '该功能的积分消费总额'
  },
  // 详细使用记录，存储为JSON字符串
  details: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '详细使用记录，包含任务ID、时间戳、积分消费等信息'
  }
}, {
  tableName: 'feature_usages',
  timestamps: true,
  indexes: [
    // 联合索引，用于快速查找用户使用特定功能的记录
    {
      unique: true,
      fields: ['userId', 'featureName'],
      name: 'feature_usages_user_feature'
    }
  ]
});

// 我们在同步后再设置外键关联，避免同步过程中的外键问题
// 可以在启动服务器后手动执行
const setupAssociations = () => {
  FeatureUsage.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  User.hasMany(FeatureUsage, { foreignKey: 'userId', as: 'usages' });
};

module.exports = {
  FeatureUsage,
  setupAssociations
}; 