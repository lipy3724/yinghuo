'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'lastActiveAt', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
      after: 'updatedAt'
    });
    
    // 将现有会话的最后活跃时间同步到用户表
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`
      UPDATE users u
      LEFT JOIN (
        SELECT userId, MAX(lastActiveAt) as lastActiveAt
        FROM user_sessions
        WHERE isActive = TRUE
        GROUP BY userId
      ) s ON u.id = s.userId
      SET u.lastActiveAt = s.lastActiveAt
      WHERE s.lastActiveAt IS NOT NULL
    `);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('users', 'lastActiveAt');
  }
}; 