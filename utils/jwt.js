const jwt = require('jsonwebtoken');
const User = require('../models/User');
const UserSession = require('../models/UserSession');
require('dotenv').config();

// 从环境变量中获取JWT密钥和过期时间
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';

/**
 * 生成JWT令牌并记录会话
 * @param {number} id 用户ID
 * @param {object} req 请求对象，用于获取设备信息
 * @param {string} expiresIn 过期时间，例如：'30d'，'1h'，'30m'等
 * @param {boolean} isAdmin 是否为管理员登录
 * @returns {object} 包含token和过期时间的对象
 */
const generateToken = async (id, req = null, expiresIn = JWT_EXPIRE, isAdmin = false) => {
  // 生成JWT令牌
  const token = jwt.sign({ id, isAdmin }, JWT_SECRET, {
    expiresIn: expiresIn
  });

  // 计算过期时间
  const expiresAt = new Date();
  // 解析expiresIn字符串，例如'30d'，'1h'，'30m'
  const match = expiresIn.match(/^(\d+)([dhms])$/);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch(unit) {
      case 'd': // 天
        expiresAt.setDate(expiresAt.getDate() + value);
        break;
      case 'h': // 小时
        expiresAt.setHours(expiresAt.getHours() + value);
        break;
      case 'm': // 分钟
        expiresAt.setMinutes(expiresAt.getMinutes() + value);
        break;
      case 's': // 秒
        expiresAt.setSeconds(expiresAt.getSeconds() + value);
        break;
      default:
        // 默认30天
        expiresAt.setDate(expiresAt.getDate() + 30);
    }
  } else {
    // 默认30天
    expiresAt.setDate(expiresAt.getDate() + 30);
  }

  // 如果提供了请求对象，记录会话信息
  if (req) {
    try {
      let deviceInfo = 'Unknown Device';
      let ipAddress = req.ip || req.connection.remoteAddress;
      let userAgent = req.headers['user-agent'] || 'Unknown';

      // 尝试从User-Agent获取设备信息
      if (userAgent) {
        // 检测设备类型
        if (userAgent.match(/Android/i)) {
          deviceInfo = 'Android Device';
        } else if (userAgent.match(/iPhone|iPad|iPod/i)) {
          deviceInfo = 'iOS Device';
        } else if (userAgent.match(/Windows/i)) {
          deviceInfo = 'Windows Device';
        } else if (userAgent.match(/Mac/i)) {
          deviceInfo = 'Mac Device';
        } else if (userAgent.match(/Linux/i)) {
          deviceInfo = 'Linux Device';
        }
      }

      // 创建设备指纹，用于识别相同设备
      // 使用userAgent前128个字符和IP地址生成指纹
      const deviceFingerprint = require('crypto')
        .createHash('md5')
        .update(userAgent.substring(0, 128) + ipAddress + (isAdmin ? '-admin' : '-user'))
        .digest('hex');
      
      // 查找用户现有的同设备会话
      // 获取该用户的所有活跃会话
      const activeSessions = await UserSession.findAll({
        where: {
          userId: id,
          isActive: true,
          sessionType: isAdmin ? 'admin' : 'user'  // 只查找相同类型的会话
        }
      });
      
      // 在JavaScript中计算并比较设备指纹
      let existingSession = null;
      for (const session of activeSessions) {
        // 为每个会话计算设备指纹
        const sessionFingerprint = require('crypto')
          .createHash('md5')
          .update(session.userAgent.substring(0, 128) + session.ipAddress + (isAdmin ? '-admin' : '-user'))
          .digest('hex');
        
        // 如果指纹匹配，表示是同一设备
        if (sessionFingerprint === deviceFingerprint) {
          existingSession = session;
          break;
        }
      }

      if (existingSession) {
        // 如果找到相同设备的会话，更新它而不是创建新会话
        console.log(`为用户 ${id} 更新现有${isAdmin ? '管理员' : '用户'}会话记录，设备指纹: ${deviceFingerprint.substring(0, 8)}...`);
        
        existingSession.token = token;
        existingSession.lastActiveAt = new Date();
        existingSession.expiresAt = expiresAt;
        existingSession.isActive = true;
        await existingSession.save();
      } else {
        // 创建新的会话记录
        await UserSession.create({
          userId: id,
          token: token,
          deviceInfo: deviceInfo,
          ipAddress: ipAddress,
          userAgent: userAgent,
          isActive: true,
          lastActiveAt: new Date(),
          expiresAt: expiresAt,
          sessionType: isAdmin ? 'admin' : 'user'  // 设置会话类型
        });
        
        console.log(`为用户 ${id} 创建了新的${isAdmin ? '管理员' : '用户'}会话记录，设备指纹: ${deviceFingerprint.substring(0, 8)}...`);
      }
    } catch (error) {
      console.error('处理会话记录失败:', error);
      // 继续执行，不因为会话记录失败而阻止登录
    }
  }

  return {
    token,
    expiresAt
  };
};

module.exports = {
  generateToken,
  JWT_SECRET,
  JWT_EXPIRE
}; 