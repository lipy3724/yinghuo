const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const VideoResult = sequelize.define('VideoResult', {
    user: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    taskId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    videoUrl: {
        type: DataTypes.STRING,
        allowNull: false
    },
    prompt: {
        type: DataTypes.TEXT
    },
    type: {
        type: DataTypes.ENUM('text-to-video', 'image-to-video'),
        defaultValue: 'text-to-video'
    },
    model: {
        type: DataTypes.STRING
    },
    resolution: {
        type: DataTypes.STRING
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: false
});

module.exports = VideoResult; 