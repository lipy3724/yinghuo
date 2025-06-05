// 全局变量
let uploadedImage = null;
let userCredits = 0;
let currentUser = null;
let taskId = null;
let pollingInterval = null;

// 立即检查用户登录状态
(function checkLoginStatus() {
    const authToken = localStorage.getItem('authToken');
    const userInfo = localStorage.getItem('user');
    
    if (!authToken || !userInfo) {
        // 用户未登录，将目标URL保存为主页而非当前页面，然后重定向到登录页面
        localStorage.setItem('redirectAfterLogin', '/');
        window.location.href = '/login.html';
    }
})();

document.addEventListener('DOMContentLoaded', function() {
    // DOM元素
    const uploadArea = document.getElementById('upload-area');
    const imageUpload = document.getElementById('image-upload');
    const originalImage = document.getElementById('original-image');
    const originalImagePlaceholder = document.getElementById('original-image-placeholder');
    const outputVideoContainer = document.getElementById('output-video-container');
    const outputVideo = document.getElementById('output-video');
    const outputVideoPlaceholder = document.getElementById('output-video-placeholder');
    const videoWrapper = document.getElementById('video-wrapper');
    const generateBtn = document.getElementById('generate-btn');
    const promptInput = document.getElementById('prompt-input');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingMessage = document.getElementById('loading-message');
    const userCreditsElement = document.getElementById('user-credits');
    const loginBtn = document.getElementById('login-btn');
    const userMenuBtn = document.getElementById('user-menu-btn');
    const smartRewriteToggle = document.getElementById('smart-rewrite-toggle');
    const toggleSlider = document.getElementById('toggle-slider');
    const toggleBackground = document.getElementById('toggle-background');
    
    // 初始化开关状态
    updateToggleStyle();
    
    // 添加开关事件监听
    if (smartRewriteToggle) {
        smartRewriteToggle.addEventListener('change', function() {
            updateToggleStyle();
        });
    }
    
    // 更新开关样式
    function updateToggleStyle() {
        const isChecked = document.getElementById('smart-rewrite-toggle').checked;
        const toggleBackground = document.getElementById('toggle-background');
        const toggleSlider = document.getElementById('toggle-slider');
        
        if (isChecked) {
            toggleBackground.classList.remove('bg-gray-200');
            toggleBackground.classList.add('bg-indigo-500');
            toggleSlider.style.transform = 'translateX(14px)';
        } else {
            toggleBackground.classList.remove('bg-indigo-500');
            toggleBackground.classList.add('bg-gray-200');
            toggleSlider.style.transform = 'translateX(0)';
        }
    }
    
    // 检查用户登录状态
    checkAuthStatus();
    
    // 图片上传处理
    uploadArea.addEventListener('click', () => {
        imageUpload.click();
    });
    
    imageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleImageFile(file);
        }
    });
    
    // 拖放上传
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, unhighlight, false);
    });
    
    uploadArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        
        if (file && file.type.startsWith('image/')) {
            handleImageFile(file);
        } else {
            alert('请上传图片文件！');
        }
    });
    
    // 生成按钮点击
    generateBtn.addEventListener('click', () => {
        if (!uploadedImage) {
            alert('请先上传图片！');
            return;
        }
        
        const prompt = promptInput.value.trim();
        if (!prompt) {
            alert('请输入提示词！');
            return;
        }
        
        // 检查用户是否登录
        const authToken = localStorage.getItem('authToken');
        if (!authToken) {
            alert('请先登录！');
            window.location.href = '/login.html';
            return;
        }
        
        // 读取智能改写开关状态
        const useSmartRewrite = smartRewriteToggle.checked;
        
        // 显示加载中
        loadingOverlay.classList.remove('hidden');
        loadingMessage.textContent = '准备处理，请稍候...';
        
        // 先上传图片，获取图片URL
        uploadImageToServer(uploadedImage)
            .then(imageUrl => {
                if (imageUrl) {
                    // 创建通义万相图生视频任务
                    createVideoGenerationTask(prompt, imageUrl, useSmartRewrite);
                } else {
                    throw new Error('图片上传失败');
                }
            })
            .catch(error => {
                loadingOverlay.classList.add('hidden');
                alert('处理失败: ' + error.message);
                console.error('处理失败:', error);
            });
    });
    
    // 提示词教程链接
    document.getElementById('prompt-guide-link').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('prompt-tutorial-modal').style.display = 'block';
        document.body.style.overflow = 'hidden'; // 防止背景滚动
    });
    
    // 辅助函数
    function handleImageFile(file) {
        if (file.size > 30 * 1024 * 1024) {
            alert('图片大小不能超过30MB！');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            uploadedImage = event.target.result;
            originalImage.src = uploadedImage;
            originalImage.classList.remove('hidden');
            originalImagePlaceholder.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    }
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    function highlight() {
        uploadArea.classList.add('border-indigo-500', 'bg-indigo-50');
    }
    
    function unhighlight() {
        uploadArea.classList.remove('border-indigo-500', 'bg-indigo-50');
    }
    
    // 上传图片到服务器获取URL
    async function uploadImageToServer(base64Image) {
        loadingMessage.textContent = '正在上传图片...';
        
        try {
            // 从Base64中提取实际数据部分
            const base64Data = base64Image.split(',')[1];
            
            // 创建FormData对象
            const formData = new FormData();
            
            // 将Base64转换为Blob
            const blob = base64ToBlob(base64Data);
            formData.append('image', blob, 'image.jpg');
            
            // 发送请求
            const response = await fetch('/api/upload-image', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: formData
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || '图片上传失败');
            }
            
            const data = await response.json();
            return data.output?.img_url || data.imageUrl; // 修改这里以兼容后端返回的data.output.img_url格式
        } catch (error) {
            console.error('图片上传错误:', error);
            throw new Error('图片上传失败: ' + error.message);
        }
    }
    
    // Base64转Blob
    function base64ToBlob(base64Data) {
        const byteCharacters = atob(base64Data);
        const byteArrays = [];
        
        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }
        
        return new Blob(byteArrays, { type: 'image/jpeg' });
    }
    
    // 创建通义万相图生视频任务
    async function createVideoGenerationTask(prompt, imageUrl, useSmartRewrite) {
        loadingMessage.textContent = '正在提交视频生成任务...';
        
        try {
            // 准备请求数据
            const requestData = {
                model: "wanx2.1-i2v-turbo", // 可选 wanx2.1-i2v-turbo 或 wanx2.1-i2v-plus
                input: {
                    prompt: prompt,
                    img_url: imageUrl
                },
                parameters: {
                    resolution: "720P",     // 可选 480P 或 720P
                    prompt_extend: useSmartRewrite  // 智能改写开关状态
                }
            };
            
            console.log('提交任务数据:', JSON.stringify(requestData, null, 2));
            
            // 通过服务器代理调用阿里云API
            const response = await fetch('/api/text-to-video/image-to-video', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(requestData)
            });
            
            // 获取响应数据（即使状态码不是200也尝试解析）
            const data = await response.json();
            console.log('API响应:', JSON.stringify(data, null, 2));
            
            if (!response.ok) {
                throw new Error(data.message || `请求失败(${response.status}): ${JSON.stringify(data)}`);
            }
            
            if (data.output && data.output.task_id) {
                taskId = data.output.task_id;
                loadingMessage.textContent = '任务提交成功，正在处理中...';
                
                // 开始轮询任务状态
                startPollingTaskStatus();
            } else {
                throw new Error(`未获取到有效的任务ID: ${JSON.stringify(data)}`);
            }
        } catch (error) {
            console.error('任务创建错误:', error);
            loadingOverlay.classList.add('hidden');
            alert('创建任务失败: ' + error.message);
        }
    }
    
    // 开始轮询任务状态
    function startPollingTaskStatus() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }
        
        // 生成视频需要的时间比较长，设置较长的轮询间隔
        pollingInterval = setInterval(checkTaskStatus, 15000); // 每15秒检查一次
        
        // 立即执行一次
        checkTaskStatus();
    }
    
    // 检查任务状态
    async function checkTaskStatus() {
        if (!taskId) return;
        
        try {
            loadingMessage.textContent = '正在处理视频，请耐心等待（处理时间约3-10分钟）...';
            
            const response = await fetch(`/api/text-to-video/task-status/${taskId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || '获取任务状态失败');
            }
            
            const data = await response.json();
            
            // 处理任务状态
            if (data.output && data.output.task_status) {
                const status = data.output.task_status;
                
                if (status === 'SUCCEEDED') {
                    // 任务成功完成，获取视频URL
                    const videoUrl = data.output.video_url;
                    
                    if (videoUrl) {
                        // 停止轮询
                        clearInterval(pollingInterval);
                        pollingInterval = null;
                        
                        // 显示视频
                        showGeneratedVideo(videoUrl);
                        
                        // 隐藏加载遮罩
                        loadingOverlay.classList.add('hidden');
                        
                        // 保存任务结果到服务器（可选）
                        saveVideoResultToServer(taskId, videoUrl, promptInput.value);
                    } else {
                        throw new Error('未获取到视频URL');
                    }
                } else if (status === 'FAILED') {
                    // 任务失败
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                    
                    loadingOverlay.classList.add('hidden');
                    alert('视频生成失败，请重试');
                } else {
                    // 任务仍在处理中（PENDING 或 RUNNING）
                    console.log(`任务状态: ${status}`);
                }
            }
        } catch (error) {
            console.error('检查任务状态错误:', error);
            // 不要在这里停止轮询，让它继续尝试
        }
    }
    
    // 显示生成的视频
    function showGeneratedVideo(videoUrl) {
        // 更新视频源
        outputVideo.src = videoUrl;
        
        // 显示视频元素，隐藏占位文本
        videoWrapper.classList.remove('hidden');
        outputVideoPlaceholder.classList.add('hidden');
        
        // 设置视频加载事件
        outputVideo.onloadeddata = function() {
            // 滚动到视频区域
            outputVideoContainer.scrollIntoView({ behavior: 'smooth' });
        };
        
        // 设置错误处理
        outputVideo.onerror = function() {
            alert('视频加载失败，请刷新页面重试');
            console.error('视频加载失败:', videoUrl);
        };
    }
    
    // 保存视频结果到服务器（可选）
    async function saveVideoResultToServer(taskId, videoUrl, prompt) {
        try {
            const requestData = {
                taskId: taskId,
                videoUrl: videoUrl,
                prompt: prompt,
                type: 'image-to-video'
            };
            
            await fetch('/api/save-video-result', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(requestData)
            });
            
            console.log('视频结果已保存到服务器');
        } catch (error) {
            console.error('保存视频结果错误:', error);
            // 忽略保存错误，不影响用户体验
        }
    }
});

// 检查用户登录状态
function checkAuthStatus() {
    const authToken = localStorage.getItem('authToken');
    const userInfo = localStorage.getItem('user');
    const loginBtn = document.getElementById('login-btn');
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userCreditsElement = document.getElementById('user-credits');
    
    if (authToken && userInfo) {
        // 用户已登录
        try {
            currentUser = JSON.parse(userInfo);
            document.getElementById('username-display').textContent = currentUser.username;
            
            // 显示用户菜单，隐藏登录按钮
            loginBtn.classList.add('hidden');
            userMenuBtn.classList.remove('hidden');
            
            // 获取用户积分
            fetchUserCredits();
        } catch (e) {
            console.error('解析用户信息出错:', e);
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
        }
    } else {
        // 用户未登录
        loginBtn.classList.remove('hidden');
        userMenuBtn.classList.add('hidden');
        userCreditsElement.textContent = '积分: 请登录';
    }
}

// 获取用户积分
function fetchUserCredits() {
    const authToken = localStorage.getItem('authToken');
    if (!authToken) return;
    
    fetch('/api/user/credits', {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(data => {
        userCredits = data.credits || 0;
        document.getElementById('user-credits').textContent = `积分: ${userCredits}`;
    })
    .catch(error => {
        console.error('获取用户积分出错:', error);
    });
} 