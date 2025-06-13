const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

async function up() {
  try {
    console.log('开始添加用户封禁字段...');
    
    // 添加isBanned字段
    await sequelize.query(`
      ALTER TABLE users 
      ADD COLUMN isBanned BOOLEAN NOT NULL DEFAULT FALSE
      COMMENT '是否被封禁'
    `);
    console.log('添加isBanned字段成功');
    
    // 添加banReason字段
    await sequelize.query(`
      ALTER TABLE users 
      ADD COLUMN banReason VARCHAR(200) NULL
      COMMENT '封禁原因'
    `);
    console.log('添加banReason字段成功');
    
    // 添加banExpireAt字段
    await sequelize.query(`
      ALTER TABLE users 
      ADD COLUMN banExpireAt DATETIME NULL
      COMMENT '封禁到期时间'
    `);
    console.log('添加banExpireAt字段成功');
    
    console.log('用户封禁字段添加完成');
    return true;
  } catch (error) {
    console.error('添加用户封禁字段失败:', error);
    throw error;
  }
}

async function down() {
  try {
    console.log('开始回滚用户封禁字段...');
    
    // 删除banExpireAt字段
    await sequelize.query(`
      ALTER TABLE users 
      DROP COLUMN banExpireAt
    `);
    console.log('删除banExpireAt字段成功');
    
    // 删除banReason字段
    await sequelize.query(`
      ALTER TABLE users 
      DROP COLUMN banReason
    `);
    console.log('删除banReason字段成功');
    
    // 删除isBanned字段
    await sequelize.query(`
      ALTER TABLE users 
      DROP COLUMN isBanned
    `);
    console.log('删除isBanned字段成功');
    
    console.log('用户封禁字段回滚完成');
    return true;
  } catch (error) {
    console.error('回滚用户封禁字段失败:', error);
    throw error;
  }
}

module.exports = { up, down }; 