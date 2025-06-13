const { Sequelize } = require('sequelize');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('user_sessions', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      token: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      deviceInfo: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      ipAddress: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      userAgent: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      lastActiveAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // 添加索引
    await queryInterface.addIndex('user_sessions', ['userId'], {
      name: 'user_sessions_user_id'
    });
    await queryInterface.addIndex('user_sessions', ['token'], {
      name: 'user_sessions_token'
    });
    await queryInterface.addIndex('user_sessions', ['isActive'], {
      name: 'user_sessions_is_active'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // 删除表
    await queryInterface.dropTable('user_sessions');
  }
}; 