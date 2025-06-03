const sequelize = require('./db');

// 修复数据库结构
async function fixDatabaseSchema() {
  try {
    // 连接数据库
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // 检查users表是否存在
    const [tables] = await sequelize.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_NAME = 'users' AND TABLE_SCHEMA = DATABASE()
    `);

    if (tables.length === 0) {
      console.log('用户表不存在，创建新表...');
      
      // 创建users表
      await sequelize.query(`
        CREATE TABLE users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(50) NOT NULL UNIQUE,
          email VARCHAR(100) NOT NULL UNIQUE,
          password VARCHAR(100) NOT NULL,
          phone VARCHAR(20) UNIQUE,
          smsCode VARCHAR(10),
          smsCodeExpires DATETIME,
          credits INT NOT NULL DEFAULT 0,
          lastRechargeTime DATETIME,
          createdAt DATETIME NOT NULL,
          updatedAt DATETIME NOT NULL
        )
      `);
      console.log('用户表创建成功');
      return;
    }

    // 检查email列是否存在
    const [emailColumn] = await sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'email' AND TABLE_SCHEMA = DATABASE()
    `);

    if (emailColumn.length === 0) {
      console.log('email列不存在，添加列...');
      
      // 添加email列
      await sequelize.query(`
        ALTER TABLE users 
        ADD COLUMN email VARCHAR(100) NOT NULL DEFAULT 'unknown@example.com' AFTER username
      `);
      console.log('email列添加成功');
      
      // 更新现有用户的email
      await sequelize.query(`
        UPDATE users 
        SET email = CONCAT(username, '@example.com') 
        WHERE email = 'unknown@example.com'
      `);
      console.log('已更新现有用户的email');
      
      // 添加唯一索引
      await sequelize.query(`
        ALTER TABLE users 
        ADD UNIQUE INDEX users_email_unique (email)
      `);
      console.log('email唯一索引添加成功');
    } else {
      console.log('email列已存在');
    }

    // 检查其他必要列
    const columnsToCheck = [
      { name: 'phone', type: 'VARCHAR(20)', defaultValue: 'NULL' },
      { name: 'smsCode', type: 'VARCHAR(10)', defaultValue: 'NULL' },
      { name: 'smsCodeExpires', type: 'DATETIME', defaultValue: 'NULL' },
      { name: 'credits', type: 'INT', defaultValue: '0 NOT NULL' },
      { name: 'lastRechargeTime', type: 'DATETIME', defaultValue: 'NULL' }
    ];

    for (const column of columnsToCheck) {
      const [result] = await sequelize.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'users' AND COLUMN_NAME = '${column.name}' AND TABLE_SCHEMA = DATABASE()
      `);

      if (result.length === 0) {
        console.log(`${column.name}列不存在，添加列...`);
        
        await sequelize.query(`
          ALTER TABLE users 
          ADD COLUMN ${column.name} ${column.type} DEFAULT ${column.defaultValue}
        `);
        console.log(`${column.name}列添加成功`);
      } else {
        console.log(`${column.name}列已存在`);
      }
    }

    console.log('数据库修复完成');
  } catch (error) {
    console.error('修复数据库出错:', error);
  } finally {
    // 关闭连接
    await sequelize.close();
  }
}

// 执行修复
fixDatabaseSchema().then(() => {
  console.log('数据库修复完成，请重启服务器');
  process.exit(0);
}).catch((err) => {
  console.error('执行修复脚本时出错:', err);
  process.exit(1);
}); 