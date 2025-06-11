'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // 检查字段是否已存在
      const tableDesc = await queryInterface.describeTable('users');
      
      if (!tableDesc.isInternal) {
        console.log('添加 isInternal 字段到 users 表');
    await queryInterface.addColumn('users', 'isInternal', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
        console.log('isInternal 字段添加成功');
      } else {
        console.log('isInternal 字段已存在，跳过');
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
    await queryInterface.removeColumn('users', 'isInternal');
      return Promise.resolve();
    } catch (error) {
      console.error('回滚出错:', error);
      return Promise.reject(error);
    }
  }
}; 