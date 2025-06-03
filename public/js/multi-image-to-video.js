// 全局变量
let uploadedImages = [];  // 存储上传的多张图片
let userCredits = 0;
let currentUser = null;
let taskId = null;
let pollingInterval = null;
let customMusicFile = null;

// 简化登录检查，不再立即重定向
function checkLoginStatus() {
    const authToken = localStorage.getItem('authToken');
    const userInfo = localStorage.getItem('user');
    
    if (authToken && userInfo) {
        try {
            currentUser = JSON.parse(userInfo);
            return true;
        } catch (error) {
            console.error('解析用户信息错误:', error);
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
        }
    }
    return false;
}

document.addEventListener('DOMContentLoaded', function() {
    // DOM元素
    const uploadArea = document.getElementById('upload-area');
    const imageUpload = document.getElementById('image-upload');
    const thumbnailContainer = document.getElementById('thumbnail-container');
    const outputVideoContainer = document.getElementById('output-video-container');
    const outputVideo = document.getElementById('output-video');
    const outputVideoPlaceholder = document.getElementById('output-video-placeholder');
    const videoWrapper = document.getElementById('video-wrapper');
    const generateBtn = document.getElementById('generate-btn');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingMessage = document.getElementById('loading-message');
    const userCreditsElement = document.getElementById('user-credits');
    const loginBtn = document.getElementById('login-btn');
    const userMenuBtn = document.getElementById('user-menu-btn');
    const backgroundMusic = document.getElementById('background-music');
    const customMusicUpload = document.getElementById('custom-music-upload');
    const musicFile = document.getElementById('music-file');
    
    // 新增DOM元素引用
    const sceneType = document.getElementById('scene-type');
    const videoWidth = document.getElementById('video-width');
    const videoHeight = document.getElementById('video-height');
    const videoStyle = document.getElementById('video-style');
    const transitionStyle = document.getElementById('transition-style');
    const durationInput = document.getElementById('duration-input');
    const durationAdaption = document.getElementById('duration-adaption');
    const smartEffect = document.getElementById('smart-effect');
    const puzzleEffect = document.getElementById('puzzle-effect');
    const muteVideo = document.getElementById('mute-video');
    
    // 背景音乐选择变化事件
    if (backgroundMusic) {
        backgroundMusic.addEventListener('change', function() {
            if (this.value === 'custom') {
                customMusicUpload.classList.remove('hidden');
            } else {
                customMusicUpload.classList.add('hidden');
            }
        });
    }
    
    // 自定义音乐上传
    if (customMusicUpload) {
        const customMusicArea = customMusicUpload.querySelector('.upload-area');
        if (customMusicArea) {
            customMusicArea.addEventListener('click', () => {
                musicFile.click();
            });
        }
    }
    
    if (musicFile) {
        musicFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 10 * 1024 * 1024) {
                    alert('音乐文件大小不能超过10MB！');
                    return;
                }
                
                customMusicFile = file;
                const customMusicArea = customMusicUpload.querySelector('.upload-area');
                if (customMusicArea) {
                    customMusicArea.innerHTML = `
                        <i class="ri-music-line text-xl text-indigo-500 mb-1"></i>
                        <p class="text-indigo-500 text-center text-xs px-2">${file.name}</p>
                    `;
                }
            }
        });
    }
    
    // 检查登录状态但不强制重定向
    const isLoggedIn = checkLoginStatus();
    
    // 图片上传处理
    if (uploadArea && imageUpload) {
        uploadArea.addEventListener('click', () => {
            imageUpload.click();
        });
        
        imageUpload.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files.length) {
                handleImageFiles(files);
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
            const files = dt.files;
            
            const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
            
            if (imageFiles.length > 0) {
                handleImageFiles(imageFiles);
            } else {
                alert('请上传图片文件！');
            }
        });
    }
    
    // 生成按钮点击
    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            if (uploadedImages.length < 2) {
                alert('请至少上传2张图片！');
                return;
            }
            
            // 检查用户是否登录
            if (!isLoggedIn) {
                alert('请先登录！');
                window.location.href = '/login.html';
                return;
            }
            
            // 获取参数
            const scene = sceneType ? sceneType.value : 'costume'; // 默认为服饰场景
            const width = videoWidth ? (parseInt(videoWidth.value) || 1280) : 1280;
            const height = videoHeight ? (parseInt(videoHeight.value) || 720) : 720;
            const style = videoStyle ? videoStyle.value : 'normal';
            const transition = transitionStyle ? transitionStyle.value : 'normal';
            const duration = durationInput ? (parseInt(durationInput.value) || 10) : 10;
            const isDurationAdaption = durationAdaption ? durationAdaption.checked : true;
            const isSmartEffect = smartEffect ? smartEffect.checked : true;
            const isPuzzleEffect = puzzleEffect ? puzzleEffect.checked : false;
            const isMute = muteVideo ? muteVideo.checked : false;
            const musicType = backgroundMusic ? backgroundMusic.value : 'none';
            
            // 验证参数
            if (width < 32 || width > 2160 || height < 32 || height > 2160) {
                alert('视频分辨率应在32-2160范围内');
                return;
            }
            
            if (duration < 5 || duration > 60) {
                alert('视频时长应在5-60秒范围内');
                return;
            }
            
            // 显示加载中
            if (loadingOverlay) {
                loadingOverlay.classList.remove('hidden');
            }
            if (loadingMessage) {
                loadingMessage.textContent = '准备处理，请稍候...';
            }
            
            // 上传图片，获取图片URL
            uploadImagesToServer(uploadedImages)
                .then(imageUrls => {
                    if (imageUrls && imageUrls.length) {
                        // 如果选择了自定义音乐，先上传音乐文件
                        if (musicType === 'custom' && customMusicFile) {
                            return uploadMusicToServer(customMusicFile).then(musicUrl => {
                                return { imageUrls, musicUrl };
                            });
                        } else {
                            return { imageUrls, musicUrl: musicType !== 'none' ? musicType : null };
                        }
                    } else {
                        throw new Error('图片上传失败');
                    }
                })
                .then(data => {
                    // 创建多图转视频任务
                    createVideoGenerationTask(
                        data.imageUrls,
                        scene,
                        width,
                        height,
                        style,
                        transition,
                        duration,
                        isDurationAdaption,
                        isSmartEffect,
                        isPuzzleEffect,
                        isMute,
                        data.musicUrl
                    );
                })
                .catch(error => {
                    if (loadingOverlay) {
                        loadingOverlay.classList.add('hidden');
                    }
                    alert('处理失败: ' + error.message);
                    console.error('处理失败:', error);
                });
        });
    }
    
    // 辅助函数
    function handleImageFiles(files) {
        // 限制最多上传20张图片
        if (uploadedImages.length + files.length > 20) {
            alert('最多只能上传20张图片！');
            return;
        }
        
        // 处理多张图片
        Array.from(files).forEach(file => {
            if (file.size > 10 * 1024 * 1024) {
                alert(`图片 ${file.name} 大小超过10MB，已跳过`);
                return;
            }
            
            const reader = new FileReader();
            reader.onload = (event) => {
                const imageData = {
                    id: Date.now() + Math.random().toString(36).substr(2, 9),
                    file: file,
                    dataUrl: event.target.result,
                    name: file.name
                };
                
                uploadedImages.push(imageData);
                
                // 更新缩略图显示
                updateThumbnails();
            };
            reader.readAsDataURL(file);
        });
    }
    
    function updateThumbnails() {
        if (!thumbnailContainer) return;
        
        thumbnailContainer.innerHTML = '';
        
        uploadedImages.forEach((image, index) => {
            const thumbnail = document.createElement('div');
            thumbnail.className = 'thumbnail-item relative';
            thumbnail.dataset.id = image.id;
            thumbnail.setAttribute('draggable', 'true');
            
            thumbnail.innerHTML = `
                <div class="thumbnail">
                    <img src="${image.dataUrl}" alt="${image.name}">
                    <span class="order-badge">${index + 1}</span>
                </div>
                <button class="delete-btn" data-id="${image.id}">×</button>
            `;
            
            thumbnailContainer.appendChild(thumbnail);
            
            const deleteBtn = thumbnail.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', () => {
                uploadedImages = uploadedImages.filter(img => img.id !== image.id);
                updateThumbnails();
            });
        });
        
        // 如果有图片，显示缩略图容器，否则隐藏
        if (uploadedImages.length > 0) {
            thumbnailContainer.classList.remove('hidden');
            setupDragAndDrop(); // 设置拖拽排序
        } else {
            thumbnailContainer.classList.add('hidden');
        }
    }
    
    function setupDragAndDrop() {
        const items = document.querySelectorAll('.thumbnail-item');
        
        items.forEach(item => {
            item.addEventListener('dragstart', handleDragStart);
            item.addEventListener('dragover', handleDragOver);
            item.addEventListener('dragenter', handleDragEnter);
            item.addEventListener('dragleave', handleDragLeave);
            item.addEventListener('drop', handleDrop);
            item.addEventListener('dragend', handleDragEnd);
        });
        
        let dragSrcEl = null;
        
        function handleDragStart(e) {
            this.classList.add('dragging');
            dragSrcEl = this;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', this.innerHTML);
        }
        
        function handleDragOver(e) {
            if (e.preventDefault) {
                e.preventDefault();
            }
            e.dataTransfer.dropEffect = 'move';
            return false;
        }
        
        function handleDragEnter(e) {
            this.classList.add('over');
        }
        
        function handleDragLeave(e) {
            this.classList.remove('over');
        }
        
        function handleDrop(e) {
            e.stopPropagation();
            
            if (dragSrcEl !== this) {
                // 获取拖拽的图片ID和目标位置的图片ID
                const draggedId = dragSrcEl.dataset.id;
                const targetId = this.dataset.id;
                
                // 找到对应的索引
                const draggedIndex = uploadedImages.findIndex(img => img.id === draggedId);
                const targetIndex = uploadedImages.findIndex(img => img.id === targetId);
                
                // 交换位置
                if (draggedIndex !== -1 && targetIndex !== -1) {
                    const temp = uploadedImages[draggedIndex];
                    uploadedImages.splice(draggedIndex, 1);
                    uploadedImages.splice(targetIndex, 0, temp);
                    
                    // 更新UI
                    updateThumbnails();
                }
            }
            
            return false;
        }
        
        function handleDragEnd(e) {
            items.forEach(item => {
                item.classList.remove('over', 'dragging');
            });
        }
    }
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    function highlight() {
        if (uploadArea) {
            uploadArea.classList.add('border-indigo-500', 'bg-indigo-50');
        }
    }
    
    function unhighlight() {
        if (uploadArea) {
            uploadArea.classList.remove('border-indigo-500', 'bg-indigo-50');
        }
    }
    
    // 上传多张图片到服务器获取URL
    async function uploadImagesToServer(images) {
        loadingMessage.textContent = '正在上传图片...';
        
        try {
            const uploadPromises = images.map(async (imageData, index) => {
                // 使用原始文件对象
                const file = imageData.file;
                
                // 删除data:image/jpeg;base64,前缀获取纯base64数据
                const base64Data = imageData.dataUrl.replace(/^data:image\/\w+;base64,/, '');
                
                // 创建FormData对象
                const formData = new FormData();
                
                // 将Base64转换为Blob
                const blob = base64ToBlob(base64Data);
                formData.append('image', blob, `image_${index}.jpg`);
                
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
                return data.output?.img_url || data.imageUrl;
            });
            
            // 等待所有图片上传完成
            return Promise.all(uploadPromises);
        } catch (error) {
            console.error('图片上传错误:', error);
            throw new Error('图片上传失败: ' + error.message);
        }
    }
    
    // 上传音乐文件
    async function uploadMusicToServer(file) {
        loadingMessage.textContent = '正在上传音乐文件...';
        
        try {
            const formData = new FormData();
            formData.append('audio', file);
            
            // 发送请求
            const response = await fetch('/api/upload-audio', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: formData
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || '音乐文件上传失败');
            }
            
            const data = await response.json();
            return data.audioUrl;
        } catch (error) {
            console.error('音乐上传错误:', error);
            throw new Error('音乐上传失败: ' + error.message);
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
    
    // 创建多图转视频任务
    async function createVideoGenerationTask(
        imageUrls,
        scene,
        width,
        height,
        style,
        transitionStyle,
        duration,
        durationAdaption,
        smartEffect,
        puzzleEffect,
        mute,
        musicUrl
    ) {
        loadingMessage.textContent = '正在提交视频生成任务...';
        
        try {
            // 准备请求数据
            const requestData = {
                images: imageUrls,
                scene: scene,
                width: width,
                height: height,
                style: style,
                transition: transitionStyle,
                duration: duration,
                durationAdaption: durationAdaption,
                smartEffect: smartEffect,
                puzzleEffect: puzzleEffect,
                mute: mute,
                music: musicUrl
            };
            
            console.log('提交任务数据:', JSON.stringify(requestData, null, 2));
            
            // 通过服务器代理调用API
            const response = await fetch('/api/multi-image-to-video', {
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
                // 处理积分不足的情况
                if (response.status === 402) {
                    if (loadingOverlay) {
                        loadingOverlay.classList.add('hidden');
                    }
                    
                    // 显示积分不足提示
                    let errorMessage = '积分不足，无法生成视频。';
                    if (data.data && data.data.requiredCredits) {
                        errorMessage += `\n需要 ${data.data.requiredCredits} 积分，当前剩余 ${data.data.currentCredits} 积分。`;
                        errorMessage += `\n视频时长 ${duration} 秒，计费规则：30积分/30秒，不足30秒按30秒计算。`;
                    }
                    
                    // 跳转到积分充值页面
                    if (confirm(errorMessage + '\n\n是否前往积分中心充值？')) {
                        window.location.href = '/credits.html';
                    }
                    
                    return;
                }
                
                throw new Error(data.message || `请求失败(${response.status}): ${JSON.stringify(data)}`);
            }
            
            if (data.taskId) {
                taskId = data.taskId;
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
        
        // 设置较短的轮询间隔
        pollingInterval = setInterval(checkTaskStatus, 5000); // 每5秒检查一次
        
        // 立即执行一次
        checkTaskStatus();
    }
    
    // 检查任务状态
    async function checkTaskStatus() {
        if (!taskId) return;
        
        try {
            loadingMessage.textContent = '正在处理视频，请耐心等待（处理时间约1-3分钟）...';
            
            const response = await fetch(`/api/task-status/${taskId}`, {
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
            if (data.status) {
                const status = data.status;
                
                if (status === 'completed') {
                    // 任务成功完成，获取视频URL
                    const videoUrl = data.videoUrl;
                    
                    if (videoUrl) {
                        // 停止轮询
                        clearInterval(pollingInterval);
                        pollingInterval = null;
                        
                        // 显示视频
                        showGeneratedVideo(videoUrl);
                        
                        // 隐藏加载遮罩
                        loadingOverlay.classList.add('hidden');
                    } else {
                        throw new Error('未获取到视频URL');
                    }
                } else if (status === 'failed') {
                    // 任务失败
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                    
                    loadingOverlay.classList.add('hidden');
                    alert('视频生成失败，请重试');
                } else {
                    // 任务仍在处理中
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
        if (!outputVideo || !videoWrapper || !outputVideoPlaceholder) return;
        
        // 隐藏加载中
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }
        
        // 更新视频源
        outputVideo.src = videoUrl;
        
        // 显示视频，隐藏占位图
        videoWrapper.classList.remove('hidden');
        outputVideoPlaceholder.classList.add('hidden');
        
        // 确保视频元素可见
        outputVideo.style.display = 'block';
        
        // 添加加载事件监听器以确保视频加载成功
        outputVideo.onloadeddata = function() {
            console.log("视频加载成功，准备播放");
            // 尝试自动播放视频
            outputVideo.play().catch(err => console.log("自动播放失败:", err));
        };
        
        // 设置下载按钮
        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            // 显示下载按钮
            downloadBtn.classList.remove('hidden');
            
            // 移除所有现有的事件监听器
            const newBtn = downloadBtn.cloneNode(true);
            downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);
            
            // 添加新的事件监听器
            newBtn.addEventListener('click', function(e) {
                e.preventDefault(); // 阻止默认行为
                
                console.log('开始下载视频:', videoUrl);
                
                // 显示下载中的状态
                loadingOverlay.classList.remove('hidden');
                loadingMessage.textContent = '正在准备下载...';
                
                // 使用fetch获取视频内容为blob
                fetch(videoUrl)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error('视频下载失败，状态码: ' + response.status);
                        }
                        return response.blob();
                    })
                    .then(blob => {
                        // 创建一个blob URL
                        const blobUrl = URL.createObjectURL(blob);
                        
                        // 创建下载链接
                        const link = document.createElement('a');
                        link.href = blobUrl;
                        link.download = `多图生成视频_${Date.now()}.mp4`;
                        link.style.display = 'none';
                        
                        // 触发点击下载
                        document.body.appendChild(link);
                        link.click();
                        
                        // 延迟后释放blob URL和移除链接
                        setTimeout(() => {
                            URL.revokeObjectURL(blobUrl);
                            document.body.removeChild(link);
                            loadingOverlay.classList.add('hidden');
                        }, 200);
                    })
                    .catch(error => {
                        console.error('下载视频出错:', error);
                        alert('下载视频失败: ' + error.message);
                        loadingOverlay.classList.add('hidden');
                        
                        // 二次尝试 - 通过window.open
                        if (confirm('直接下载失败，是否尝试在新窗口中打开视频？')) {
                            window.open(videoUrl, '_blank');
                        }
                    });
            });
        }
    }
    
    // 如果用户已登录，获取用户积分
    if (checkLoginStatus()) {
        fetchUserCredits();
    }
});

// 获取用户积分
async function fetchUserCredits() {
    try {
        const response = await fetch('/api/user/credits', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('获取用户积分失败');
        }
        
        const data = await response.json();
        userCredits = data.credits || 0;
        
        // 更新UI显示
        const creditsDisplay = document.getElementById('credits-display');
        if (creditsDisplay) {
            creditsDisplay.textContent = userCredits;
        }
    } catch (error) {
        console.error('获取积分错误:', error);
    }
} 