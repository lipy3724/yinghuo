# 电商工具 - 图片文字翻译转换

这是一个使用Node.js开发的电商工具，主要功能是集成图片文字翻译功能。系统通过对接第三方API实现图片中文字的识别与多语言翻译。

## 功能特点

- 图片上传功能
- 对接第三方图片翻译编辑器
- 支持多种语言翻译
- 结果保存和下载

## 功能列表

- 电商工图实景图/电商海报智能生成
- 产品电商场景图/产品换场景/换背景
- 视频语音翻译
- 视频文字翻译
- 图片文字翻译转换
- 智能虚拟模特试衣
- 图像高清放大
- 跨境合规标签

## 技术栈

- 前端：HTML, CSS, JavaScript
- 后端：Node.js, Express
- 第三方集成：图片翻译编辑器API

## 安装与运行

### 前提条件

- Node.js (v12+)
- npm 或 yarn

### 安装步骤

1. 克隆或下载代码到本地

2. 安装依赖
```bash
npm install
```

3. 配置API密钥
   在`server.js`文件中，找到以下代码并替换为您的实际密钥：
```javascript
const APP_KEY = "YOUR_APP_KEY"; // 替换为实际的APP_KEY
const SECRET_KEY = "YOUR_SECRET_KEY"; // 替换为实际的SECRET_KEY
```

4. 启动服务器
```bash
npm start
```
或使用开发模式（自动重启）：
```bash
npm run dev
```

5. 访问应用
   打开浏览器访问: http://localhost:3000

## 使用说明

1. 在首页上传需要翻译的图片
2. 选择源语言和目标语言
3. 点击"打开工作台生成"按钮
4. 在打开的编辑器中可以进行进一步编辑和保存

## 使用方法

1. 直接在浏览器中打开 `index.html` 文件
2. 点击选择侧边栏中的功能
3. 根据页面指引上传图片并进行相应操作

## 文件结构

- `index.html` - 主页面HTML结构
- `styles.css` - 样式表
- `script.js` - 交互功能JavaScript代码
- `server.js` - Node.js服务器代码
- `package.json` - 项目依赖配置

## 注意事项

- 上传的图片不要超过10MB
- 请确保有稳定的网络连接，以便与翻译服务器通信
- 初次生成翻译需要一定时间，请耐心等待

## 备份和恢复

当前项目已创建以下备份文件:

1. `server.js.backup` - 服务器代码备份
2. `public/index.html.backup` - 前端页面备份

如需恢复，请使用以下命令:

```bash
# 恢复服务器代码
copy server.js.backup server.js

# 恢复前端页面
copy public\index.html.backup public\index.html

# 重启服务器
taskkill /f /im node.exe
node server.js
```

## 各功能详细说明

### 图像高清放大

图像高清放大功能允许用户将低分辨率图片提升到更高分辨率，同时保持图像清晰度和细节。本功能基于阿里云AI图像超分辨率API实现，支持2-4倍放大。

**功能特点：**
- 支持多种图片格式（JPG、PNG、WEBP等）
- 可选择2倍、4倍或自定义放大倍率
- 智能降噪和细节增强
- 自动将图片存储到阿里云OSS

**技术实现：**
- 前端：基于HTML、CSS和JavaScript实现的直观用户界面
- 后端：Node.js处理图片上传、调用阿里云API
- 存储：阿里云OSS对象存储
- API：阿里云超分辨率API（/ai/super/resolution）

**限制条件：**
- 输入图片尺寸需大于100×100像素，小于3000×3000像素
- 放大后的图片不能超过3000×3000像素
- 放大倍数范围：2-4倍

**使用方法：**
1. 在侧边栏菜单选择"图像高清放大"
2. 上传需要处理的图片（可拖拽或点击上传）
3. 选择所需的放大倍率（2-4倍）
4. 点击"开始放大"按钮
5. 等待处理完成后，可以预览和下载处理后的高清图像

**API调用示例：**
```javascript
// 上传图片到OSS
const imageUrl = await uploadToOSS(imageBuffer, fileName);

// 调用图像高清放大API
const apiResult = await callUpscaleApi(imageUrl, upscaleFactor);

// 获取处理结果
const resultImageUrl = apiResult.data.imageUrl;
```

**错误处理：**
- 如果图片尺寸不符合要求，系统会提示相应错误
- 如果API调用失败，会显示具体的错误信息
- 所有操作都有加载状态指示，提升用户体验