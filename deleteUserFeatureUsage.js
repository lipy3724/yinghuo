// 删除特定用户的所有功能使用记录
const { FeatureUsage } = require('./models/FeatureUsage');
const sequelize = require('./config/db');

// 删除userId为9的用户的所有功能使用记录
async function deleteUserFeatureUsage() {
  try {
    console.log('开始删除用户ID为9的所有功能使用记录...');
    
    // 首先查询该用户有哪些功能使用记录
    const userRecords = await FeatureUsage.findAll({
      where: { userId: 9 }
    });
    
    console.log(`找到 ${userRecords.length} 条用户ID为9的功能使用记录`);
    
    // 记录每条记录的信息，便于确认
    userRecords.forEach((record, index) => {
      console.log(`${index + 1}. 功能: ${record.featureName}, 使用次数: ${record.usageCount}, 积分消费: ${record.credits || 0}`);
    });
    
    // 删除所有记录
    const deleteResult = await FeatureUsage.destroy({
      where: { userId: 9 }
    });
    
    console.log(`成功删除 ${deleteResult} 条用户ID为9的功能使用记录`);
    
    // 确认是否删除成功
    const remainingRecords = await FeatureUsage.findAll({
      where: { userId: 9 }
    });
    
    if (remainingRecords.length === 0) {
      console.log('确认: 用户ID为9的所有功能使用记录已全部删除');
    } else {
      console.log(`警告: 仍有 ${remainingRecords.length} 条记录未删除`);
    }
    
  } catch (error) {
    console.error('删除用户功能使用记录时出错:', error);
  } finally {
    // 关闭数据库连接
    await sequelize.close();
    console.log('数据库连接已关闭');
  }
}

// 执行删除操作
deleteUserFeatureUsage(); 