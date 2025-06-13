const sequelize = require('./config/db');
const { QueryTypes } = require('sequelize');

async function addLastActiveAtColumn() {
  const queryInterface = sequelize.getQueryInterface();
  
  try {
    console.log('开始添加lastActiveAt字段到users表...');
    
    // 检查字段是否已存在
    const checkColumnQuery = `
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'lastActiveAt'
      AND TABLE_SCHEMA = (SELECT DATABASE())
    `;
    
    const columns = await sequelize.query(checkColumnQuery, { type: QueryTypes.SELECT });
    
    if (columns.length > 0) {
      console.log('字段lastActiveAt已经存在，跳过添加操作');
    } else {
      // 添加字段
      await queryInterface.addColumn('users', 'lastActiveAt', {
        type: sequelize.Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
        after: 'updatedAt'
      });
      
      console.log('lastActiveAt字段添加成功');
    }
    
    // 将现有会话的最后活跃时间同步到用户表
    const updateQuery = `
      UPDATE users u
      LEFT JOIN (
        SELECT userId, MAX(lastActiveAt) as lastActiveAt
        FROM user_sessions
        WHERE isActive = TRUE
        GROUP BY userId
      ) s ON u.id = s.userId
      SET u.lastActiveAt = s.lastActiveAt
      WHERE s.lastActiveAt IS NOT NULL
    `;
    
    const [updatedRows] = await sequelize.query(updateQuery);
    console.log(`成功更新了 ${updatedRows} 个用户的最后活跃时间`);
    
    console.log('操作完成');
  } catch (error) {
    console.error('操作失败:', error);
  } finally {
    await sequelize.close();
  }
}

addLastActiveAtColumn(); 