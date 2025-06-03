const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./User');

// 定义支付订单模型
const PaymentOrder = sequelize.define('payment_order', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  order_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  amount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '充值积分金额'
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    comment: '人民币金额'
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded'),
    allowNull: false,
    defaultValue: 'pending'
  },
  payment_method: {
    type: DataTypes.ENUM('alipay'),
    allowNull: false
  },
  transaction_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '第三方支付交易ID'
  },
  payment_time: {
    type: DataTypes.DATE,
    allowNull: true
  },
  qrcode_expire_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '二维码过期时间'
  }
}, {
  tableName: 'payment_orders',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// 设置关联关系
PaymentOrder.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(PaymentOrder, { foreignKey: 'user_id', as: 'payments' });

module.exports = PaymentOrder; 