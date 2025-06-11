'use strict';

// 添加备注字段到用户表
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 添加备注字段
    await queryInterface.addColumn('users', 'remark', {
      type: Sequelize.STRING(200),
      allowNull: true,
      defaultValue: null,
      after: 'isInternal'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // 回滚时移除备注字段
    await queryInterface.removeColumn('users', 'remark');
  }
}; 