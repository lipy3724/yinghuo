const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const crypto = require('crypto');
const multer = require('multer');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 8080;

// API密钥和密钥配置 - 更新为新的密钥
const APP_KEY = "502592";
const SECRET_KEY = "dSmD7xK5Oms04Ml4VsQH0mmHJsBXcB1t";
const SIGN_METHOD_SHA256 = "sha256";
const SIGN_METHOD_HMAC_SHA256 = "HmacSHA256";

// 配置文件上传
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB限制
  }
});

// 中间件配置
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));
// 添加根目录静态文件服务
app.use(express.static(path.join(__dirname)));

// 确保上传目录存在
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 确保public目录存在
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

/**
 * 将二进制数组转换为大写的十六进制字符串
 * 对标Java中的byte2hex方法
 */
function byte2hex(bytes) {
  let sign = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    let hex = (byte & 0xFF).toString(16);
    if (hex.length === 1) {
      sign += '0';
    }
    sign += hex.toUpperCase();
  }
  return sign;
}

/**
 * HMAC-SHA256加密实现
 * 对标Java中的encryptHMACSHA256方法
 */
function encryptHMACSHA256(data, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data, 'utf8');
  return hmac.digest();
}

/**
 * 签名API请求
 * 对标Java中的signApiRequest方法
 */
function signApiRequest(params, appSecret, signMethod, apiName) {
  // 第一步：检查参数是否已经排序
  const keys = Object.keys(params).sort();
  
  // 第二步和第三步：把API名和参数串在一起
  let query = apiName;
  
  for (const key of keys) {
    const value = params[key];
    if (key && value) {
      query += key + value;
    }
  }
  
  console.log('Query string for signing:', query);
  
  // 第四步：使用加密算法
  let bytes;
  if (signMethod === SIGN_METHOD_SHA256) {
    bytes = encryptHMACSHA256(query, appSecret);
  }
  
  // 第五步：把二进制转化为大写的十六进制
  return byte2hex(bytes);
}

/**
 * 获取签名响应
 * 对标Java中的getSignResponse方法
 */
function getSignResponse(params, api) {
  try {
    const time = Date.now();
    const signParams = { ...params };
    
    signParams.app_key = APP_KEY;
    signParams.sign_method = SIGN_METHOD_SHA256;
    signParams.timestamp = String(time);
    
    const signStr = signApiRequest(signParams, SECRET_KEY, SIGN_METHOD_SHA256, api);
    
    return {
      signStr: signStr,
      appKey: APP_KEY,
      targetAppKey: APP_KEY,
      signMethod: SIGN_METHOD_SHA256,
      timestamp: time
    };
  } catch (error) {
    console.error('Generate sign error:', error);
    return null;
  }
}

// 创建代理中间件
const editorProxy = createProxyMiddleware({
  target: 'https://editor.d.design',
  changeOrigin: true,
  pathRewrite: {
    '^/editor-proxy': '' // 重写路径
  },
  onProxyRes: function(proxyRes, req, res) {
    // 修改响应头处理跨域
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    
    // 记录请求日志
    console.log(`编辑器代理: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
  },
  onError: function(err, req, res) {
    console.error('代理错误:', err);
    res.status(500).send('代理服务器错误');
  }
});

// 应用代理到编辑器路由
app.use('/editor-proxy', editorProxy);

// 签名API - 使用文档要求的路径/open/api/signature
app.post('/open/api/signature', (req, res) => {
  try {
    console.log('接收签名请求:', JSON.stringify(req.body, null, 2));
    const { api, params } = req.body;
    
    // 验证入参格式
    if (!api) {
      console.error('入参错误: 缺少api字段');
      return res.status(400).json({
        code: 400,
        message: "缺少api字段",
        success: false,
        requestId: Date.now().toString(),
        data: null,
        result: null
      });
    }
    
    if (!params) {
      console.error('入参错误: 缺少params字段');
      return res.status(400).json({
        code: 400,
        message: "缺少params字段",
        success: false,
        requestId: Date.now().toString(),
        data: null,
        result: null
      });
    }
    
    console.log(`✅ 入参格式正确: api=${api}, params包含${Object.keys(params).length}个参数`);
    
    // 使用新的签名方法
    const signData = getSignResponse(params, api);
    
    if (!signData) {
      throw new Error('生成签名失败');
    }
    
    // 构造符合要求的返回结果
    const result = {
      code: 200,
      message: "",
      success: true,
      requestId: signData.timestamp.toString() + Math.floor(Math.random() * 1000).toString(),
      data: signData,
      result: null
    };
    
    console.log('签名结果:', JSON.stringify(result, null, 2));
    res.json(result);
  } catch (error) {
    console.error('生成签名失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message,
      success: false,
      requestId: Date.now().toString(),
      data: null,
      result: null
    });
  }
});

// 同时支持新的/api/signature路径
app.post('/api/signature', (req, res) => {
  try {
    console.log('接收签名请求(新路径):', JSON.stringify(req.body, null, 2));
    const { api, params } = req.body;
    
    // 验证入参格式
    if (!api) {
      console.error('入参错误: 缺少api字段');
      return res.status(400).json({
        code: 400,
        message: "缺少api字段",
        success: false,
        requestId: Date.now().toString(),
        data: null,
        result: null
      });
    }
    
    if (!params) {
      console.error('入参错误: 缺少params字段');
      return res.status(400).json({
        code: 400,
        message: "缺少params字段",
        success: false,
        requestId: Date.now().toString(),
        data: null,
        result: null
      });
    }
    
    console.log(`✅ 入参格式正确: api=${api}, params包含${Object.keys(params).length}个参数`);
    
    // 使用新的签名方法
    const signData = getSignResponse(params, api);
    
    if (!signData) {
      throw new Error('生成签名失败');
    }
    
    // 构造符合要求的返回结果
    const result = {
      code: 200,
      message: "",
      success: true,
      requestId: signData.timestamp.toString() + Math.floor(Math.random() * 1000).toString(),
      data: signData,
      result: null
    };
    
    console.log('签名结果(新路径):', JSON.stringify(result, null, 2));
    res.json(result);
  } catch (error) {
    console.error('生成签名失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message,
      success: false,
      requestId: Date.now().toString(),
      data: null,
      result: null
    });
  }
});

// 图片上传接口
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '未上传图片' });
  }
  
  const protocol = req.protocol;
  const host = req.get('host');
  const imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
  
  console.log('图片已上传:', imageUrl);
  res.json({ imageUrl });
});

// 保存结果API
app.post('/api/save-result', (req, res) => {
  try {
    const resultData = req.body;
    const timestamp = Date.now();
    
    // 保存结果到JSON文件
    const resultsDir = path.join(__dirname, 'results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    const resultFile = path.join(resultsDir, `result-${timestamp}.json`);
    fs.writeFileSync(resultFile, JSON.stringify(resultData, null, 2));
    
    console.log('保存结果文件:', resultFile);
    
    // 如果结果包含图片URL，可以选择下载图片到本地
    if (resultData.imageUrl) {
      // 这里可以添加下载图片的逻辑
      console.log('图片URL:', resultData.imageUrl);
    }
    
    res.json({ success: true, timestamp });
  } catch (error) {
    console.error('保存结果失败:', error);
    res.status(500).json({ error: '保存结果失败', message: error.message });
  }
});

// 获取历史结果API
app.get('/api/history', (req, res) => {
  try {
    const resultsDir = path.join(__dirname, 'results');
    if (!fs.existsSync(resultsDir)) {
      return res.json({ results: [] });
    }
    
    const files = fs.readdirSync(resultsDir)
      .filter(file => file.endsWith('.json'))
      .sort((a, b) => {
        // 按时间戳排序（降序）
        const timeA = parseInt(a.split('-')[1]);
        const timeB = parseInt(b.split('-')[1]);
        return timeB - timeA;
      });
    
    const results = files.slice(0, 10).map(file => {
      const content = fs.readFileSync(path.join(resultsDir, file), 'utf8');
      try {
        return JSON.parse(content);
      } catch (e) {
        return { error: '无效的JSON文件', file };
      }
    });
    
    res.json({ results });
  } catch (error) {
    console.error('获取历史记录失败:', error);
    res.status(500).json({ error: '获取历史记录失败', message: error.message });
  }
});

// 添加API测试端点
app.get('/test-api-call', (req, res) => {
  try {
    // 准备API参数
    const apiDomain = 'cn-api.aidc-ai.com';
    const apiName = '/ai/image/cut/out'; // 以裁剪API为例
    const timestamp = Date.now();
    
    // 创建参数
    const params = {
      app_key: APP_KEY,
      sign_method: SIGN_METHOD_SHA256,
      timestamp: String(timestamp)
    };
    
    // 生成签名
    const sign = signApiRequest(params, SECRET_KEY, SIGN_METHOD_SHA256, apiName);
    
    // 构建API URL
    const apiUrl = `https://${apiDomain}/rest${apiName}?partner_id=aidge&sign_method=sha256&sign_ver=v2&app_key=${APP_KEY}&timestamp=${timestamp}&sign=${sign}`;
    
    // 构建请求数据
    const requestData = {
      imageUrl: "https://ae01.alicdn.com/kf/Sa78257f1d9a34dad8ee494178db12ec8l.jpg",
      backGroundType: "WHITE_BACKGROUND"
    };
    
    // 返回测试信息
    res.send(`
      <h1>API调用测试</h1>
      <p>以下是调用API的示例，您可以复制到命令行执行：</p>
      <pre>
curl -X POST '${apiUrl}' \\
--header 'Content-Type: application/json' \\
--header 'x-iop-trial: true' \\
--data '${JSON.stringify(requestData)}'
      </pre>
      
      <p>API信息:</p>
      <ul>
        <li>API域名: ${apiDomain}</li>
        <li>API路径: ${apiName}</li>
        <li>AppKey: ${APP_KEY}</li>
        <li>时间戳: ${timestamp}</li>
        <li>签名: ${sign}</li>
      </ul>
      
      <p>签名生成方法:</p>
      <pre>
// 1. 构造参数
const params = {
  app_key: "${APP_KEY}",
  sign_method: "${SIGN_METHOD_SHA256}",
  timestamp: "${timestamp}"
};

// 2. 构造签名字符串
let query = "${apiName}";
for (const key of Object.keys(params).sort()) {
  query += key + params[key];
}
// query = "${apiName}app_key${APP_KEY}sign_method${SIGN_METHOD_SHA256}timestamp${timestamp}"

// 3. HMAC-SHA256加密
const hmac = crypto.createHmac('sha256', "${SECRET_KEY}");
hmac.update(query);
const signature = hmac.digest();

// 4. 转成大写十六进制
const sign = byte2hex(signature);
// sign = "${sign}"
</pre>
      
      <p><strong>注意:</strong> 这只是一个演示。实际使用中，您需要从服务器端发起API请求，而不是从浏览器。</p>
    `);
  } catch (error) {
    console.error('生成API测试失败:', error);
    res.status(500).send('生成API测试失败: ' + error.message);
  }
});

// 添加API代理调用端点 - 实际调用API
app.post('/api/call-service', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: '缺少imageUrl参数' });
    }
    
    // 准备API参数
    const apiDomain = 'cn-api.aidc-ai.com';
    const apiName = '/ai/image/cut/out'; // 以裁剪API为例
    
    // 创建参数
    const params = {
      app_key: APP_KEY,
      sign_method: SIGN_METHOD_SHA256,
      timestamp: String(Date.now())
    };
    
    // 生成签名
    const sign = signApiRequest(params, SECRET_KEY, SIGN_METHOD_SHA256, apiName);
    
    // 构建API URL
    const apiUrl = `https://${apiDomain}/rest${apiName}?partner_id=aidge&sign_method=sha256&sign_ver=v2&app_key=${params.app_key}&timestamp=${params.timestamp}&sign=${sign}`;
    
    // 构建请求数据
    const requestData = {
      imageUrl: imageUrl,
      backGroundType: "WHITE_BACKGROUND"
    };
    
    console.log('调用API:', apiUrl);
    console.log('请求数据:', requestData);
    
    // 这里应该使用适当的HTTP客户端库发起请求
    // 例如node-fetch或axios
    // 为了简单演示，这里返回模拟数据
    res.json({
      success: true,
      message: '这是一个模拟的API调用响应。实际应用中，您需要使用node-fetch或axios等库发起HTTP请求到API服务器。',
      requestUrl: apiUrl,
      requestData: requestData
    });
  } catch (error) {
    console.error('API调用失败:', error);
    res.status(500).json({ error: 'API调用失败', message: error.message });
  }
});

// 主页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 添加翻译页面路由
app.get('/translate', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'translate.html'));
});

// 404处理
app.use((req, res) => {
  res.status(404).send('找不到请求的页面');
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).send('服务器内部错误');
});

// 启动服务器
app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
  console.log(`上传的图片可以通过 http://localhost:${port}/uploads/ 访问`);
}); 