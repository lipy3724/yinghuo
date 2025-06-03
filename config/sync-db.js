const sequelize = require('./db');
const User = require('../models/User');
const { FeatureUsage } = require('../models/FeatureUsage');
const ImageHistory = require('../models/ImageHistory');

/**
 * 同步数据库表结构
 */
async function syncDatabase() {
  try {
    console.log('开始同步数据库表结构...');
    
    // 同步User表 - 使用force:false而不是alter:true以避免索引问题
    await User.sync({ force: false });
    console.log('User表同步完成');
    
    // 同步FeatureUsage表
    await FeatureUsage.sync({ force: false });
    console.log('FeatureUsage表同步完成');
    
    // 同步ImageHistory表
    await ImageHistory.sync({ force: false });
    console.log('ImageHistory表同步完成');
    
    console.log('所有表同步完成');
  } catch (error) {
    console.error('同步数据库表结构时出错:', error);
    throw error;
  }
}

module.exports = syncDatabase; 