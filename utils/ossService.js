require('dotenv').config(); // 确保环境变量被加载
const OSS = require('ali-oss');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const unlinkAsync = promisify(fs.unlink);

console.log('OSS配置：', {
    region: process.env.OSS_REGION,
    bucket: process.env.OSS_BUCKET,
    secure: process.env.OSS_SECURE === 'true',
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID ? process.env.ALIYUN_ACCESS_KEY_ID.substring(0, 5) + '...' : undefined
});

// 创建OSS客户端
const client = new OSS({
    region: process.env.OSS_REGION,
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET,
    secure: process.env.OSS_SECURE === 'true',
    timeout: parseInt(process.env.OSS_TIMEOUT || '60000')
});

/**
 * 上传本地文件到OSS并返回公网可访问的URL
 * @param {string} localFilePath - 本地文件路径
 * @param {string} ossPath - OSS上的存储路径 (如: 'uploads/images/')
 * @returns {Promise<string>} - 返回公网可访问的URL
 */
const uploadFile = async (localFilePath, ossPath = 'uploads/') => {
    try {
        // 检查文件是否存在
        if (!fs.existsSync(localFilePath)) {
            throw new Error(`文件不存在: ${localFilePath}`);
        }

        // 处理文件名，避免中文或特殊字符问题
        const fileName = path.basename(localFilePath);
        const ossFileName = `${Date.now()}-${fileName}`;
        const ossFilePath = path.join(ossPath, ossFileName).replace(/\\/g, '/');
        
        console.log(`开始上传文件到OSS: ${localFilePath} -> ${ossFilePath}`);
        
        // 上传文件到OSS
        const result = await client.put(ossFilePath, localFilePath);
        
        if (!result.url) {
            // 如果没有直接返回URL，构建标准OSS URL
            const url = `https://${process.env.OSS_BUCKET}.${process.env.OSS_REGION}.aliyuncs.com/${ossFilePath}`;
            console.log('手动构建OSS URL:', url);
            
            // 清理本地临时文件
            try {
                await unlinkAsync(localFilePath);
                console.log(`已删除本地临时文件: ${localFilePath}`);
            } catch (unlinkError) {
                console.error(`删除本地临时文件失败: ${localFilePath}`, unlinkError);
            }
            
            return url;
        }
        
        // 清理本地临时文件
        try {
            await unlinkAsync(localFilePath);
            console.log(`已删除本地临时文件: ${localFilePath}`);
        } catch (unlinkError) {
            console.error(`删除本地临时文件失败: ${localFilePath}`, unlinkError);
            // 继续处理，不影响主流程
        }
        
        console.log('文件上传成功，URL:', result.url);
        return result.url;
    } catch (error) {
        console.error('OSS上传文件失败:', error);
        throw new Error(`OSS上传文件失败: ${error.message}`);
    }
};

module.exports = {
    client,
    uploadFile
}; 