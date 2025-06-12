const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { checkFeatureAccess } = require('../middleware/featureAccess');
const ImageHistory = require('../models/ImageHistory');
const { Op } = require('sequelize');

/**
 * @route   POST /api/downloads/save
 * @desc    保存图片到下载中心
 * @access  私有
 */
router.post('/save', protect, async (req, res) => {
  try {
    const { imageUrl, title, description, type } = req.body;
    const userId = req.user.id;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: '请提供图片URL'
      });
    }

    console.log('保存图片到下载中心:', {
      userId,
      title: title || '未命名图片',
      imageUrl: imageUrl.substring(0, 50) + '...',
      type: type || 'IMAGE_EDIT'
    });

    // 保存到图片历史记录
    try {
      const newImage = await ImageHistory.create({
        userId,
        title: title || '未命名图片',
        description: description || '',
        imageUrl,
        processedImageUrl: imageUrl, // 为了兼容旧模型，也设置processedImageUrl
        type: type || 'IMAGE_EDIT',
        processType: '图像指令编辑', // 添加processType字段
        createdAt: new Date(),
        updatedAt: new Date()
      });

      res.json({
        success: true,
        message: '图片已保存到下载中心',
        data: {
          id: newImage.id,
          imageUrl: newImage.imageUrl
        }
      });
    } catch (dbError) {
      console.error('数据库操作失败:', dbError);
      throw new Error(`数据库操作失败: ${dbError.message}`);
    }
  } catch (error) {
    console.error('保存图片到下载中心失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，无法保存图片',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/downloads
 * @desc    获取用户下载中心的图片列表
 * @access  私有
 */
router.get('/', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, type } = req.query;
    
    const offset = (page - 1) * limit;
    
    // 构建查询条件
    const whereCondition = { userId };
    if (type) {
      whereCondition.type = type;
    } else {
      // 排除特定类型，不在下载中心显示
      whereCondition.type = {
        [Op.notIn]: [
          'TEXT_TO_VIDEO_NO_DOWNLOAD',
          'IMAGE_TO_VIDEO_NO_DOWNLOAD',
          'MULTI_IMAGE_TO_VIDEO_NO_DOWNLOAD',
          'DIGITAL_HUMAN_VIDEO_NO_DOWNLOAD',
          'VIDEO_STYLE_REPAINT_NO_DOWNLOAD',
          'VIDEO_SUBTITLE_REMOVER_NO_DOWNLOAD'
        ]
      };
    }
    
    // 添加12小时过期条件 - 只返回12小时内的图片
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    whereCondition.createdAt = {
      [Op.gte]: twelveHoursAgo
    };
    
    // 获取图片列表
    const images = await ImageHistory.findAndCountAll({
      where: whereCondition,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      success: true,
      data: {
        images: images.rows,
        total: images.count,
        currentPage: parseInt(page),
        totalPages: Math.ceil(images.count / limit),
        expirationPeriod: 12 // 添加过期时间字段，表示12小时
      }
    });
  } catch (error) {
    console.error('获取下载中心图片列表失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，无法获取图片列表',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   DELETE /api/downloads/:id
 * @desc    从下载中心删除图片
 * @access  私有
 */
router.delete('/:id', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const imageId = req.params.id;
    
    // 查找并删除图片
    const deletedCount = await ImageHistory.destroy({
      where: {
        id: imageId,
        userId
      }
    });
    
    if (deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到该图片或您无权删除'
      });
    }
    
    res.json({
      success: true,
      message: '图片已从下载中心删除'
    });
  } catch (error) {
    console.error('删除下载中心图片失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，无法删除图片',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router; 