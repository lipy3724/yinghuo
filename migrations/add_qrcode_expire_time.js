const { Sequelize } = require('sequelize');
const db = require('../config/db');

async function migrate() {
  try {
    console.log('开始添加 qrcode_expire_time 字段...');
    
    // 检查字段是否已存在
    const checkField = await db.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'payment_orders'
      AND COLUMN_NAME = 'qrcode_expire_time'
      AND TABLE_SCHEMA = ?
    `, {
      replacements: [process.env.DB_NAME],
      type: Sequelize.QueryTypes.SELECT
    });
    
    if (checkField.length === 0) {
      // 添加字段
      await db.query(`
        ALTER TABLE payment_orders
        ADD COLUMN qrcode_expire_time DATETIME NULL COMMENT '二维码过期时间'
      `);
      console.log('成功添加 qrcode_expire_time 字段');
    } else {
      console.log('qrcode_expire_time 字段已存在，无需添加');
    }
    
    console.log('迁移完成');
  } catch (error) {
    console.error('迁移出错:', error);
  }
}

migrate(); 