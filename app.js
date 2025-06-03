// 加载环境变量
require('dotenv').config();

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

// 导入路由
const authRoutes = require('./routes/auth');
// 其他路由导入...
const clothingSegmentationRoutes = require('./routes/clothingSegmentation');

const app = express();

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 路由
app.use('/api/auth', authRoutes);
// 其他路由...
app.use('/api/cloth-segmentation', clothingSegmentationRoutes);

// 配置端口
const PORT = process.env.PORT || 3000;

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器已启动，监听端口: ${PORT}`);
}); 