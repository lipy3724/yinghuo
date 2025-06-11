const sequelize = require('./config/db');
const migration = require('./migrations/add_remark_to_users');

async function runMigration() {
  try {
    console.log('开始执行迁移: 添加remark字段到users表');
    await migration.up(sequelize.getQueryInterface(), sequelize.Sequelize);
    console.log('迁移成功完成!');
    process.exit(0);
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  }
}

runMigration(); 