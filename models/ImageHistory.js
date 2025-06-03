const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

/**
 * 图片处理历史记录模型
 */
const ImageHistory = sequelize.define('ImageHistory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '用户ID，可为空表示未登录用户'
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: '未命名图片',
    comment: '图片标题'
  },
  originalImageUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '原始图片URL'
  },
  imageUrl: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: '图片URL（可能是原始图片或处理后的图片）'
  },
  processedImageUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '处理后的图片URL'
  },
  type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'IMAGE_EDIT',
    comment: '图片类型：IMAGE_EDIT、TEXT_TO_VIDEO、IMAGE_TO_VIDEO等'
  },
  processType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: '图片处理',
    comment: '处理类型：图片翻译、营销图生成等'
  },
  processTime: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: DataTypes.NOW,
    comment: '处理时间'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '处理描述'
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '额外元数据，如语言设置、处理参数等'
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: '创建时间'
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: '更新时间'
  }
}, {
  tableName: 'image_histories',
  timestamps: true,
  indexes: [
    {
      name: 'idx_image_histories_user_id',
      fields: ['userId']
    },
    {
      name: 'idx_image_histories_type',
      fields: ['type']
    },
    {
      name: 'idx_image_histories_process_type',
      fields: ['processType']
    },
    {
      name: 'idx_image_histories_created_at',
      fields: ['createdAt']
    }
  ]
});

module.exports = ImageHistory; 