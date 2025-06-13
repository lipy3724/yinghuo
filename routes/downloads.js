const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const ImageHistory = require('../models/ImageHistory');
const { Op } = require('sequelize');
const { manualCleanup } = require('../utils/cleanupTasks');

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

    // 检查类型是否为视频相关，如果是则拒绝保存
    const requestType = type || 'IMAGE_EDIT';
    if (requestType.toLowerCase().includes('video') || 
        requestType.toUpperCase().includes('VIDEO')) {
      return res.status(400).json({
        success: false,
        message: '下载中心只保存图片，不保存视频'
      });
    }

    console.log('保存图片到下载中心:', {
      userId,
      title: title || '未命名图片',
      imageUrl: imageUrl.substring(0, 50) + '...',
      type: requestType
    });

    // 保存到图片历史记录
    try {
      const newImage = await ImageHistory.create({
        userId,
        title: title || '未命名图片',
        description: description || '',
        imageUrl,
        processedImageUrl: imageUrl, // 为了兼容旧模型，也设置processedImageUrl
        type: requestType,
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
    
    // 首先清除过期的记录（12小时前的记录）
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    
    try {
      const deletedCount = await ImageHistory.destroy({
        where: {
          userId,
          createdAt: {
            [Op.lt]: twelveHoursAgo
          },
          type: {
            [Op.and]: [
              { [Op.notLike]: '%VIDEO%' },
              { [Op.notLike]: '%video%' },
              { [Op.notIn]: [
                'TEXT_TO_VIDEO_NO_DOWNLOAD',
                'IMAGE_TO_VIDEO_NO_DOWNLOAD',
                'MULTI_IMAGE_TO_VIDEO_NO_DOWNLOAD',
                'DIGITAL_HUMAN_VIDEO_NO_DOWNLOAD',
                'VIDEO_STYLE_REPAINT_NO_DOWNLOAD',
                'VIDEO_SUBTITLE_REMOVER_NO_DOWNLOAD',
                'text-to-video',
                'image-to-video',
                'multi-image-to-video',
                'video-style-repaint',
                'digital-human-video',
                'video-subtitle-remover'
              ]}
            ]
          }
        }
      });
      
      if (deletedCount > 0) {
        console.log(`用户 ${userId} 的 ${deletedCount} 条过期下载记录已自动清除`);
      }
    } catch (cleanupError) {
      console.error('清除过期下载记录失败:', cleanupError);
      // 清除失败不影响正常查询，继续执行
    }
    
    // 构建查询条件 - 现在只查询有效的记录
    const whereCondition = { 
      userId,
      createdAt: {
        [Op.gte]: twelveHoursAgo
      }
    };
    
    if (type) {
      // 即使指定了类型，也要确保不是视频类型
      whereCondition.type = type;
      whereCondition.type = {
        [Op.and]: [
          { [Op.eq]: type },
          { [Op.notLike]: '%VIDEO%' },
          { [Op.notLike]: '%video%' }
        ]
      };
    } else {
      // 只显示图片相关类型，完全排除所有视频相关类型
      whereCondition.type = {
        [Op.and]: [
          { [Op.notLike]: '%VIDEO%' },
          { [Op.notLike]: '%video%' },
          { [Op.notIn]: [
            'TEXT_TO_VIDEO_NO_DOWNLOAD',
            'IMAGE_TO_VIDEO_NO_DOWNLOAD', 
            'MULTI_IMAGE_TO_VIDEO_NO_DOWNLOAD',
            'DIGITAL_HUMAN_VIDEO_NO_DOWNLOAD',
            'VIDEO_STYLE_REPAINT_NO_DOWNLOAD',
            'VIDEO_SUBTITLE_REMOVER_NO_DOWNLOAD',
            'text-to-video',
            'image-to-video',
            'multi-image-to-video',
            'video-style-repaint',
            'digital-human-video',
            'video-subtitle-remover'
          ]}
        ]
      };
    }
    
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

/**
 * @route   POST /api/downloads/cleanup
 * @desc    手动清理过期的下载记录
 * @access  私有
 */
router.post('/cleanup', protect, async (req, res) => {
  try {
    console.log(`用户 ${req.user.id} 触发手动清理过期下载记录`);
    
    const deletedCount = await manualCleanup();
    
    res.json({
      success: true,
      message: `清理完成，已删除 ${deletedCount} 条过期记录`,
      data: {
        deletedCount
      }
    });
  } catch (error) {
    console.error('手动清理过期下载记录失败:', error);
    res.status(500).json({
      success: false,
      message: '清理失败，请稍后重试',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router; 