const cron = require('node-cron');
const ImageHistory = require('../models/ImageHistory');
const { Op } = require('sequelize');

/**
 * 清除过期的下载中心记录
 * 每小时执行一次，清除12小时前的记录
 */
function startCleanupTasks() {
  // 每小时的第0分钟执行清理任务
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('开始执行下载中心过期记录清理任务...');
      
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
      
      // 清除过期的下载记录（只清理图片记录，不清理视频记录）
      const deletedCount = await ImageHistory.destroy({
        where: {
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
        console.log(`✅ 下载中心清理任务完成：已清除 ${deletedCount} 条过期记录`);
      } else {
        console.log('✅ 下载中心清理任务完成：无过期记录需要清除');
      }
    } catch (error) {
      console.error('❌ 下载中心清理任务失败:', error);
    }
  });
  
  console.log('📅 下载中心定时清理任务已启动 (每小时执行一次)');
}

/**
 * 手动执行清理任务
 */
async function manualCleanup() {
  try {
    console.log('开始手动清理过期下载记录...');
    
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    
    const deletedCount = await ImageHistory.destroy({
      where: {
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
    
    console.log(`✅ 手动清理完成：已清除 ${deletedCount} 条过期记录`);
    return deletedCount;
  } catch (error) {
    console.error('❌ 手动清理失败:', error);
    throw error;
  }
}

module.exports = {
  startCleanupTasks,
  manualCleanup
}; 