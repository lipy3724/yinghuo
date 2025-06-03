const winston = require('winston');
const path = require('path');
const fs = require('fs');
const util = require('util');

// 确保日志目录存在
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// 自定义格式化函数，更好地处理对象
const objectFormatter = (obj) => {
  if (obj === null || obj === undefined) {
    return '';
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  // 使用util.inspect进行更好的对象格式化
  return util.inspect(obj, { depth: 3, colors: false });
};

// 定义日志格式
const logFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  // 优化元数据处理
  let metaStr = '';
  if (Object.keys(meta).length) {
    if (meta.meta && typeof meta.meta === 'object') {
      metaStr = objectFormatter(meta.meta);
    } else {
      metaStr = objectFormatter(meta);
    }
  }
  
  return `${timestamp} [${level}]: ${message} ${metaStr}`;
});

// 创建logger实例
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    logFormat
  ),
  defaultMeta: { service: 'yinghuo-ai' },
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    // 文件输出 - 错误日志
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error' 
    }),
    // 文件输出 - 所有日志
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log') 
    })
  ],
});

// 为了简化使用，添加常用的日志方法
module.exports = {
  info: (message, meta = {}) => logger.info(message, { meta }),
  error: (message, meta = {}) => logger.error(message, { meta }),
  warn: (message, meta = {}) => logger.warn(message, { meta }),
  debug: (message, meta = {}) => logger.debug(message, { meta }),
  // 直接导出logger实例，以便需要时使用更多功能
  logger
}; 