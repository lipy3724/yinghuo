'use strict';

// 添加备注字段到用户表
module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // 检查字段是否已存在
      const tableDesc = await queryInterface.describeTable('users');
      
      if (!tableDesc.remark) {
        console.log('添加 remark 字段到 users 表');
    await queryInterface.addColumn('users', 'remark', {
      type: Sequelize.STRING(200),
      allowNull: true,
          defaultValue: null
        });
        console.log('remark 字段添加成功');
      } else {
        console.log('remark 字段已存在，跳过');
      }
      return Promise.resolve();
    } catch (error) {
      console.error('迁移出错:', error);
      return Promise.reject(error);
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // 回滚时删除字段
    await queryInterface.removeColumn('users', 'remark');
      return Promise.resolve();
    } catch (error) {
      console.error('回滚出错:', error);
      return Promise.reject(error);
    }
  }
}; 