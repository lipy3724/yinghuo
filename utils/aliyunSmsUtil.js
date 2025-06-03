/**
 * 阿里云短信服务工具
 * 用于发送短信验证码
 */
const Dysmsapi20170525 = require('@alicloud/dysmsapi20170525');
const OpenApi = require('@alicloud/openapi-client');
const Util = require('@alicloud/tea-util');
const Credential = require('@alicloud/credentials');

// 阿里云短信服务配置
const SMS_CONFIG = {
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID, // 从环境变量获取AccessKey ID
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET, // 从环境变量获取AccessKey Secret
  endpoint: 'dysmsapi.aliyuncs.com', // 短信服务的API端点
  signName: process.env.ALIYUN_SMS_SIGN_NAME, // 短信签名名称
  templateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE // 短信模板CODE
};

/**
 * 创建阿里云短信客户端
 * @returns {Promise<Dysmsapi20170525>} 短信客户端实例
 */
async function createClient() {
  const accessKeyId = SMS_CONFIG.accessKeyId;
  const accessKeySecret = SMS_CONFIG.accessKeySecret;
  
  const config = new OpenApi.Config({
    // 您的AccessKey ID
    accessKeyId: accessKeyId,
    // 您的AccessKey Secret
    accessKeySecret: accessKeySecret,
  });
  
  // 访问的域名
  config.endpoint = SMS_CONFIG.endpoint;
  
  return new Dysmsapi20170525.default(config);
}

/**
 * 发送短信验证码
 * @param {string} phoneNumber 手机号码
 * @param {string} code 验证码
 * @returns {Promise<Object>} 发送结果
 */
async function sendSmsCode(phoneNumber, code) {
  try {
    console.log('准备发送短信验证码:', {
      phoneNumber,
      code,
      signName: SMS_CONFIG.signName,
      templateCode: SMS_CONFIG.templateCode
    });

    // 检查配置是否完整
    if (!SMS_CONFIG.accessKeyId || !SMS_CONFIG.accessKeySecret || !SMS_CONFIG.signName || !SMS_CONFIG.templateCode) {
      console.error('SMS配置不完整:', {
        accessKeyId: SMS_CONFIG.accessKeyId ? '已设置' : '未设置',
        accessKeySecret: SMS_CONFIG.accessKeySecret ? '已设置' : '未设置',
        signName: SMS_CONFIG.signName,
        templateCode: SMS_CONFIG.templateCode
      });
      return {
        success: false,
        message: 'SMS配置不完整，请检查环境变量'
      };
    }

    // 创建客户端
    const client = await createClient();
    
    // 创建请求
    const sendSmsRequest = new Dysmsapi20170525.SendSmsRequest({
      phoneNumbers: phoneNumber,
      signName: SMS_CONFIG.signName,
      templateCode: SMS_CONFIG.templateCode,
      templateParam: JSON.stringify({ code })
    });
    
    // 运行时选项
    const runtime = new Util.RuntimeOptions({});
    
    console.log('发送短信请求参数:', {
      phoneNumbers: phoneNumber,
      signName: SMS_CONFIG.signName,
      templateCode: SMS_CONFIG.templateCode,
      templateParam: JSON.stringify({ code })
    });
    
    // 发送短信
    const response = await client.sendSmsWithOptions(sendSmsRequest, runtime);
    
    console.log('阿里云短信发送结果:', response.body);
    
    // 返回发送结果
    return {
      success: response.body.code === 'OK',
      message: response.body.message,
      requestId: response.body.requestId,
      bizId: response.body.bizId
    };
  } catch (error) {
    console.error('发送短信验证码失败:', error);
    
    // 更详细的错误信息
    if (error.data) {
      console.error('错误详情:', error.data);
    }
    
    return {
      success: false,
      message: error.message || '发送短信验证码失败',
      error: error
    };
  }
}

module.exports = {
  sendSmsCode
}; 