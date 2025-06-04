'use strict';

const sequelize = require('../config/db');

// 执行数据库迁移
async function runMigration() {
  try {
    console.log('开始执行数据库迁移...');
    
    // 添加 smsCode 字段
    await sequelize.query(`
      ALTER TABLE users 
      ADD COLUMN smsCode VARCHAR(10) DEFAULT NULL
    `);
    
    console.log('添加 smsCode 字段成功');
    
    // 添加 smsCodeExpires 字段
    await sequelize.query(`
      ALTER TABLE users 
      ADD COLUMN smsCodeExpires DATETIME DEFAULT NULL
    `);
    
    console.log('添加 smsCodeExpires 字段成功');
    
    console.log('数据库迁移完成!');
    process.exit(0);
  } catch (error) {
    console.error('数据库迁移失败:', error);
    process.exit(1);
  }
}

// 执行迁移
runMigration(); 