const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const crypto = require('crypto');

// 添加安全配置API端点，供前端获取配置信息 - 通用版本
router.get('/api-configs/:feature', protect, async (req, res) => {
  try {
    const feature = req.params.feature;
    
    // 所有功能使用相同的APP_KEY和SECRET_KEY
    // 只返回必要的配置信息，不包含完整的secretKey
    const config = {
      apiMap: {
        signature: '/open/api/signature' // 签名接口路径
      },
      appKey: process.env.IMAGE_REMOVAL_APP_KEY,
      // 不要直接传递secretKey到前端
    };
    
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('获取API配置信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取配置信息失败'
    });
  }
});

// 添加API签名生成端点 - 所有功能共用
router.post('/open/api/signature', protect, async (req, res) => {
  try {
    const { timestamp, nonce } = req.body;
    
    if (!timestamp || !nonce) {
      return res.status(400).json({
        success: false,
        message: '缺少必要的参数'
      });
    }
    
    // 使用服务器上的secretKey计算签名
    const secretKey = process.env.IMAGE_REMOVAL_SECRET_KEY;
    const appKey = process.env.IMAGE_REMOVAL_APP_KEY;
    
    // 计算签名
    const signStr = `appKey=${appKey}&nonce=${nonce}&timestamp=${timestamp}`;
    const signature = crypto.createHmac('sha256', secretKey)
                           .update(signStr)
                           .digest('hex');
    
    res.json({
      success: true,
      data: {
        signature
      }
    });
  } catch (error) {
    console.error('生成API签名失败:', error);
    res.status(500).json({
      success: false,
      message: '生成签名失败'
    });
  }
});

module.exports = router; 