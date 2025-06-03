const sequelize = require('./db');

/**
 * 修复用户表索引问题
 * MySQL有最多64个索引键的限制，此脚本检查并删除多余的索引
 */
async function fixUserTableIndexes() {
  try {
    // 连接数据库
    await sequelize.authenticate();
    console.log('数据库连接成功。');

    // 获取users表的所有索引
    const [indexes] = await sequelize.query(`
      SHOW INDEX FROM users;
    `);
    
    console.log(`检测到 ${indexes.length} 个索引`);
    
    // 按照Key_name分组索引
    const indexGroups = {};
    indexes.forEach(idx => {
      if (!indexGroups[idx.Key_name]) {
        indexGroups[idx.Key_name] = [];
      }
      indexGroups[idx.Key_name].push(idx);
    });
    
    // 保留必要的索引：PRIMARY、username_UNIQUE、phone_UNIQUE
    const essentialIndexes = ['PRIMARY', 'username_UNIQUE', 'phone_UNIQUE'];
    const indexesToDrop = [];
    
    for (const [keyName, idxList] of Object.entries(indexGroups)) {
      if (!essentialIndexes.includes(keyName)) {
        indexesToDrop.push(keyName);
      }
    }
    
    console.log(`将移除 ${indexesToDrop.length} 个非必要索引...`);
    
    // 删除非必要索引
    for (const indexName of indexesToDrop) {
      try {
        await sequelize.query(`
          ALTER TABLE users DROP INDEX \`${indexName}\`;
        `);
        console.log(`成功删除索引: ${indexName}`);
      } catch (err) {
        console.error(`删除索引 ${indexName} 时出错:`, err.message);
      }
    }
    
    // 检查并添加必要的唯一索引
    // 检查username唯一索引
    try {
      const [usernameIndex] = await sequelize.query(`
        SHOW INDEX FROM users WHERE Key_name = 'username_UNIQUE';
      `);
      
      if (usernameIndex.length === 0) {
        await sequelize.query(`
          ALTER TABLE users ADD CONSTRAINT username_UNIQUE UNIQUE (username);
        `);
        console.log('添加username唯一索引成功');
      }
    } catch (err) {
      console.error('处理username索引时出错:', err.message);
    }
    
    // 检查phone唯一索引
    try {
      const [phoneIndex] = await sequelize.query(`
        SHOW INDEX FROM users WHERE Key_name = 'phone_UNIQUE';
      `);
      
      if (phoneIndex.length === 0) {
        await sequelize.query(`
          ALTER TABLE users ADD CONSTRAINT phone_UNIQUE UNIQUE (phone);
        `);
        console.log('添加phone唯一索引成功');
      }
    } catch (err) {
      console.error('处理phone索引时出错:', err.message);
    }
    
    console.log('索引修复完成');
  } catch (error) {
    console.error('修复索引时出错:', error);
  } finally {
    // 关闭连接
    await sequelize.close();
  }
}

// 执行修复
fixUserTableIndexes().then(() => {
  console.log('索引修复完成，请重启服务器');
  process.exit(0);
}).catch((err) => {
  console.error('执行修复脚本时出错:', err);
  process.exit(1);
}); 