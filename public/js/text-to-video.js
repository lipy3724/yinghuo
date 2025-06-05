// 全局变量
let selectedResolution = '1280*720';
let selectedModel = 'wanx2.1-t2v-turbo'; // 默认使用Turbo模型，不再提供选择
let selectedQuality = '720P'; // 新增：默认选择720P分辨率
let tasks = [];
let pollingIntervals = {};
let currentUser = null;
let userCredits = 0;
let authToken = localStorage.getItem('authToken');
let pollingTasks = [];
let errorCount = 0;
// 轮询配置
const pollingConfig = {
    initialInterval: 5000,     // 初始轮询间隔(5秒)
    maxInterval: 30000,        // 最大轮询间隔(30秒)
    pendingInterval: 10000,    // 排队状态下的轮询间隔(10秒)
    runningInterval: 15000,    // 运行状态下的轮询间隔(15秒)
    maxRetries: 3,             // 最大连续错误重试次数
    retryInterval: 10000       // 错误重试间隔(10秒)
};

// DOM元素
const generateBtn = document.getElementById('generate-btn');
const promptInput = document.getElementById('prompt');
const previewContainer = document.getElementById('preview-container');
const tasksContainer = document.getElementById('tasks-container');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const refreshTasksBtn = document.getElementById('refresh-tasks-btn');
const userCreditsElement = document.getElementById('user-credits');
const loginBtn = document.getElementById('login-btn');
const userMenuBtn = document.getElementById('user-menu-btn');

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

// 初始化页面
document.addEventListener('DOMContentLoaded', () => {
    console.log('文生视频页面初始化...');
    
    // 检查按钮是否正确找到
    if (!generateBtn) {
        console.error('找不到生成按钮元素！');
    } else {
        console.log('已找到生成按钮，设置点击事件');
        // 移除可能已有的事件监听器
        generateBtn.removeEventListener('click', generateVideo);
        // 添加调试版本的点击处理
        generateBtn.addEventListener('click', () => {
            console.log('生成按钮被点击！');
            generateVideo();
        });
    }
    
    checkAuthStatus();
    loadUserTasks();
    
    // 视频分辨率选择
    document.querySelectorAll('.resolution-quality-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const quality = btn.dataset.quality;
            
            // 更新按钮样式
            document.querySelectorAll('.resolution-quality-btn').forEach(b => {
                b.classList.remove('bg-indigo-100', 'border-indigo-500', 'text-indigo-700');
            });
            btn.classList.add('bg-indigo-100', 'border-indigo-500', 'text-indigo-700');
            
            // 设置选中的分辨率
            selectedQuality = quality;
            console.log('选择了分辨率质量:', selectedQuality);
            
            // 显示对应的视频比例选项
            const ratio480Container = document.getElementById('ratio-480p-container');
            const ratio720Container = document.getElementById('ratio-720p-container');
            
            if (quality === '480P') {
                ratio480Container.style.display = 'grid';
                ratio720Container.style.display = 'none';
                
                // 默认选中480P的16:9
                const defaultRatioBtn = document.querySelector('#ratio-480p-container .resolution-btn[data-resolution="832*480"]');
                if (defaultRatioBtn) {
                    // 先重置所有按钮样式
                    document.querySelectorAll('#ratio-480p-container .resolution-btn').forEach(b => {
                        b.classList.remove('bg-indigo-100', 'border-indigo-500', 'text-indigo-700');
                    });
                    // 设置选中样式
                    defaultRatioBtn.classList.add('bg-indigo-100', 'border-indigo-500', 'text-indigo-700');
                    selectedResolution = defaultRatioBtn.dataset.resolution;
                    console.log('默认选择了480P的比例:', selectedResolution);
                }
            } else {
                ratio480Container.style.display = 'none';
                ratio720Container.style.display = 'grid';
                
                // 默认选中720P的16:9
                const defaultRatioBtn = document.querySelector('#ratio-720p-container .resolution-btn[data-resolution="1280*720"]');
                if (defaultRatioBtn) {
                    // 先重置所有按钮样式
                    document.querySelectorAll('#ratio-720p-container .resolution-btn').forEach(b => {
                        b.classList.remove('bg-indigo-100', 'border-indigo-500', 'text-indigo-700');
                    });
                    // 设置选中样式
                    defaultRatioBtn.classList.add('bg-indigo-100', 'border-indigo-500', 'text-indigo-700');
                    selectedResolution = defaultRatioBtn.dataset.resolution;
                    console.log('默认选择了720P的比例:', selectedResolution);
                }
                
                // 确保1:1和4:3按钮在正确位置
                document.querySelector('#ratio-720p-container .resolution-btn:nth-child(3)').style.gridColumn = '1';
                document.querySelector('#ratio-720p-container .resolution-btn:nth-child(4)').style.gridColumn = '2';
            }
            
            showToast(`已选择${quality}视频分辨率`, 'info');
        });
    });
    
    // 视频比例选择
    document.querySelectorAll('.resolution-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // 找到当前按钮所在的容器
            const container = btn.closest('#ratio-720p-container, #ratio-480p-container');
            if (!container) return;
            
            // 只重置当前容器内的按钮样式
            container.querySelectorAll('.resolution-btn').forEach(b => {
                b.classList.remove('bg-indigo-100', 'border-indigo-500', 'text-indigo-700');
            });
            
            // 设置当前按钮的选中样式
            btn.classList.add('bg-indigo-100', 'border-indigo-500', 'text-indigo-700');
            selectedResolution = btn.dataset.resolution;
            
            console.log('选择了视频比例:', btn.textContent.trim().split('\n')[0], '分辨率:', selectedResolution, '质量:', selectedQuality);
            showToast('选择了视频比例: ' + btn.textContent.trim().split('\n')[0], 'info');
        });
    });
    
    // 刷新任务列表
    refreshTasksBtn.addEventListener('click', loadUserTasks);
});

// 生成视频
function generateVideo() {
    console.log('开始执行视频生成函数...');
    
    const prompt = promptInput.value.trim();
    console.log('用户输入的提示词:', prompt);
    
    if (!prompt) {
        console.warn('提示词为空，终止请求');
        showToast('请输入视频描述', 'error');
        return;
    }
    
    // 检查认证状态
    const authToken = localStorage.getItem('authToken');
    console.log('认证Token是否存在:', !!authToken);
    
    if (!currentUser) {
        console.warn('用户未登录，终止请求');
        showToast('请先登录', 'error');
        window.location.href = '/login.html';
        return;
    }
    
    // 积分检查
    const costPerSecond = 13.2; // Turbo模型固定为13.2积分/秒，5秒视频总计66积分
    const estimatedCost = costPerSecond * 5; // 假设5秒视频
    console.log('用户积分:', userCredits, '需要积分:', estimatedCost);
    
    if (userCredits < estimatedCost) {
        console.warn('积分不足，终止请求');
        showToast(`积分不足，需要约${estimatedCost}积分，请充值`, 'error');
        return;
    }
    
    // 显示加载遮罩
    loadingOverlay.classList.remove('hidden');
    loadingMessage.textContent = '正在提交视频生成请求...';
    
    // 准备与Java SDK一致的请求格式
    const requestBody = {
        prompt: prompt,
        model: selectedModel,
        size: selectedResolution, // 确保使用用户选择的分辨率
        quality: selectedQuality  // 添加分辨率质量参数
    };
    
    // 记录详细的参数信息，便于调试
    console.log('发送视频生成请求:', {
        prompt: prompt,
        model: selectedModel,
        size: selectedResolution,
        quality: selectedQuality,
        详细说明: `选择了${selectedQuality}分辨率，视频比例为${selectedResolution}`
    });
    console.log('请求URL:', '/api/text-to-video/create');
    console.log('请求方法: POST');
    
    // 创建AbortController用于请求超时处理
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
    
    // 调用API生成视频
    fetch('/api/text-to-video/create', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
    })
    .then(response => {
        clearTimeout(timeoutId); // 清除超时
        console.log('收到服务器响应:', {
            status: response.status,
            statusText: response.statusText
        });
        
        if (!response.ok) {
            return response.json().then(data => {
                console.error('服务器返回错误:', data);
                throw new Error(data.message || '请求失败，服务器返回错误');
            });
        }
        return response.json();
    })
    .then(data => {
        console.log('服务器返回任务数据:', data);
        
        if (!data.success) {
            console.error('API返回错误状态:', data);
            throw new Error(data.message || '服务器返回异常响应');
        }
        
        // 兼容处理taskId字段 (服务器可能返回taskId或task_id)
        const taskId = data.taskId || data.task_id;
        
        if (!taskId) {
            console.error('服务器未返回有效的taskId');
            throw new Error('服务器未返回有效的taskId');
        }
        
        console.log('获取到任务ID:', taskId);
        console.log('请求的分辨率参数:', selectedResolution, '质量:', selectedQuality);
        loadingMessage.textContent = '视频生成任务已提交，正在处理中...';
        
        // 将任务添加到任务列表
        const task = {
            id: taskId,
            prompt: promptInput.value.trim(),
            status: 'PENDING',
            model: selectedModel,
            size: selectedResolution,
            quality: selectedQuality, // 添加分辨率质量信息
            createdAt: new Date().toISOString()
        };
        
        // 添加任务到列表并渲染
        tasks.unshift(task);
        renderTasks();
        
        // 立即开始轮询任务状态
        console.log(`开始轮询新创建的任务: ${taskId}`);
        startPollingTaskStatus(taskId);
        
        // 在预览区域显示任务进度
        showGenerationProgress(task);
        
        // 立即滚动到预览区域，让用户看到生成进度
        previewContainer.scrollIntoView({ behavior: 'smooth' });
        
        // 隐藏加载遮罩，显示成功消息
        setTimeout(() => {
            loadingOverlay.classList.add('hidden');
            showToast('视频生成任务已提交，正在后台处理...', 'success');
        }, 1500);
    })
    .catch(error => {
        clearTimeout(timeoutId); // 确保清除超时
        console.error('视频生成请求失败:', error);
        
        // 处理请求超时
        if (error.name === 'AbortError') {
            console.error('请求超时');
            showToast('请求超时，请稍后重试', 'error');
        } else {
            showToast(error.message || '视频生成失败，请重试', 'error');
        }
        
        loadingOverlay.classList.add('hidden');
    });
}

// 开始轮询任务状态
function startPollingTaskStatus(taskId) {
    console.log('开始轮询任务状态:', taskId);
    
    // 确保不要重复轮询
    if (pollingIntervals[taskId]) {
        clearInterval(pollingIntervals[taskId]);
    }
    
    // 初始化轮询状态
    const pollingState = {
        taskId,
        errorCount: 0,
        lastStatus: null,
        interval: pollingConfig.initialInterval,
        lastPollTime: Date.now()
    };
    
    // 轮询函数
    const pollFunction = async () => {
        // 检查距离上次轮询时间是否足够
        const now = Date.now();
        if (now - pollingState.lastPollTime < pollingState.interval) {
            return; // 时间间隔不够，跳过本次轮询
        }
        
        pollingState.lastPollTime = now;
        console.log(`正在查询任务状态: taskId=${taskId}, 当前间隔: ${pollingState.interval/1000}秒`);
        
        try {
            // 创建AbortController用于请求超时处理
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时
            
            // 发送请求
            const response = await fetch(`/api/text-to-video/status/${taskId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId); // 清除超时
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || '获取任务状态失败');
            }
            
            const data = await response.json();
            console.log(`任务状态响应数据:`, data);
            
            // 检查响应格式
            if (!data.success) {
                throw new Error(data.message || '获取任务状态出错');
            }
            
            // 重置错误计数
            pollingState.errorCount = 0;
            
            // 兼容处理状态字段 (服务器可能返回status或task_status)
            const taskStatus = data.status || data.task_status;
            
            // 兼容处理视频URL字段 (服务器可能返回videoUrl或video_url)
            const videoUrl = data.videoUrl || data.video_url;
            
            console.log(`任务状态: ${taskId} => ${taskStatus}, 请求ID: ${data.request_id || 'N/A'}`);
            
            // 根据任务状态调整轮询间隔
            if (taskStatus === 'PENDING') {
                // 排队中状态，使用较长间隔
                pollingState.interval = pollingConfig.pendingInterval;
            } else if (taskStatus === 'RUNNING') {
                // 运行中状态，使用中等间隔
                pollingState.interval = pollingConfig.runningInterval;
            }
            
            // 查找对应任务
            const taskIndex = tasks.findIndex(t => t.id === taskId);
            if (taskIndex === -1) {
                console.error(`未找到任务: ${taskId}`);
                clearInterval(pollingIntervals[taskId]);
                delete pollingIntervals[taskId];
                return;
            }
            
            // 更新任务状态
            const prevStatus = tasks[taskIndex].status;
            tasks[taskIndex].status = taskStatus;
            
            // 如果状态发生变化，记录日志
            if (prevStatus !== taskStatus) {
                console.log(`任务状态变化: ${prevStatus} -> ${taskStatus}`);
                // 状态变化时，立即进行下一次查询
                pollingState.lastPollTime = 0;
                
                // 如果状态变为成功，检查是否有积分信息
                if (prevStatus !== taskStatus && taskStatus === 'SUCCEEDED') {
                    // 检查响应中是否包含积分信息
                    if (data.output && data.output.credits !== undefined) {
                        console.log(`收到更新后的积分信息: ${data.output.credits}`);
                        userCredits = data.output.credits;
                        userCreditsElement.textContent = `积分: ${userCredits}`;
                    } else {
                        // 如果没有积分信息，主动刷新积分
                        console.log('未收到积分信息，主动刷新积分');
                        fetchUserCredits();
                    }
                }
            }
            
            // 更新视频URL（如果有）
            if (videoUrl) {
                console.log(`任务有视频URL: ${videoUrl}`);
                tasks[taskIndex].videoUrl = videoUrl;
            }
            
            // 重新渲染任务列表
            renderTasks();
            
            // 检查是否是最新生成的任务（任务列表中的第一个）
            const isNewestTask = taskIndex === 0;
            
            // 如果是最新任务或者之前已经在预览区域显示了这个任务，则更新预览区域
            if (isNewestTask || document.querySelector(`#preview-container video[data-task-id="${taskId}"]`)) {
                console.log(`更新预览区域显示任务: ${taskId}`);
                showGenerationProgress(tasks[taskIndex]);
            }
            
            // 如果任务已完成或失败，停止轮询
            if (taskStatus === 'SUCCEEDED') {
                console.log(`任务完成: ${taskId}, 视频URL: ${videoUrl}`);
                clearInterval(pollingIntervals[taskId]);
                delete pollingIntervals[taskId];
                
                // 刷新用户积分
                fetchUserCredits();
                
                // 显示成功消息
                showToast('视频生成成功！', 'success');
                
                // 无论是否是最新任务，只要视频生成成功就在预览区域显示
                showVideoPreview(videoUrl, taskId);
                
                // 滚动到预览区域
                previewContainer.scrollIntoView({ behavior: 'smooth' });
            } else if (taskStatus === 'FAILED') {
                console.log(`任务失败: ${taskId}`);
                clearInterval(pollingIntervals[taskId]);
                delete pollingIntervals[taskId];
                
                showToast('视频生成失败，请查看详情', 'error');
            }
            
            // 记录上次状态
            pollingState.lastStatus = taskStatus;
            
        } catch (error) {
            // 错误处理逻辑
            pollingState.errorCount++;
            
            // 处理请求超时
            if (error.name === 'AbortError') {
                console.error(`轮询超时: ${taskId}, 重试次数: ${pollingState.errorCount}`);
                // 超时时增加轮询间隔
                pollingState.interval = Math.min(pollingState.interval * 1.5, pollingConfig.maxInterval);
            } else {
                console.error(`轮询出错: ${taskId}, 错误: ${error.message}, 重试次数: ${pollingState.errorCount}`);
                
                // 只在连续错误超过阈值时显示提示
                if (pollingState.errorCount >= 2) {
                    showToast(`获取任务状态出错，已重试${pollingState.errorCount}次`, 'warning');
                }
                
                // 错误时增加轮询间隔
                pollingState.interval = Math.min(pollingState.interval * 1.5, pollingConfig.maxInterval);
            }
            
            // 如果连续错误次数过多，停止轮询
            if (pollingState.errorCount > pollingConfig.maxRetries) {
                console.error(`轮询错误次数过多，停止轮询: ${taskId}`);
                clearInterval(pollingIntervals[taskId]);
                delete pollingIntervals[taskId];
                showToast('获取任务状态失败，请稍后手动刷新', 'error');
            }
        }
    };
    
    // 立即执行一次轮询
    pollFunction();
    
    // 设置周期性轮询 (使用较短的检查间隔，但实际轮询频率由pollFunction控制)
    pollingIntervals[taskId] = setInterval(pollFunction, 2000);
}

// 渲染任务列表
function renderTasks() {
    if (!tasksContainer) {
        console.error('找不到任务容器元素！');
        return;
    }

    if (tasks.length === 0) {
        tasksContainer.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <p>暂无视频生成记录</p>
            </div>
        `;
        return;
    }
    
    // 按创建时间降序排序
    tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // 清空容器
    tasksContainer.innerHTML = '';
    
    // 渲染每个任务
    tasks.forEach(task => {
        // 创建任务元素
        const taskElement = createTaskElement(task);
        tasksContainer.appendChild(taskElement);
        
        // 为进行中的任务启动轮询
        if (task.status === 'PENDING' || task.status === 'RUNNING') {
            startPollingTaskStatus(task.id);
            
            // 如果是最新任务，在预览区域显示进度
            if (task === tasks[0]) {
                showGenerationProgress(task);
            }
        }
    });
    
    // 添加预览按钮事件
    document.querySelectorAll('.preview-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const videoUrl = btn.dataset.url;
            showVideoPreview(videoUrl);
        });
    });
    
    // 添加删除按钮事件
    document.querySelectorAll('.delete-task-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const taskId = btn.dataset.taskId;
            confirmDeleteTask(taskId);
        });
    });
}

// 创建单个任务元素
function createTaskElement(task) {
    const taskElement = document.createElement('div');
    taskElement.className = 'video-task bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4';
    taskElement.id = `task-${task.id}`;
    
    // 任务状态标识
    let statusClass, statusText;
    
    switch (task.status) {
        case 'PENDING':
            statusClass = 'bg-yellow-100 text-yellow-800';
            statusText = '排队中';
            break;
        case 'RUNNING':
            statusClass = 'bg-blue-100 text-blue-800';
            statusText = '生成中';
            break;
        case 'SUCCEEDED':
            statusClass = 'bg-green-100 text-green-800';
            statusText = '已完成';
            break;
        case 'FAILED':
            statusClass = 'bg-red-100 text-red-800';
            statusText = '失败';
            break;
        default:
            statusClass = 'bg-gray-100 text-gray-800';
            statusText = '未知状态';
    }
    
    // 将分辨率转换为比例显示
    let aspectRatio = '';
    switch(task.size) {
        case '1280*720':
            aspectRatio = '16:9';
            break;
        case '720*1280':
            aspectRatio = '9:16';
            break;
        case '960*960':
            aspectRatio = '1:1';
            break;
        case '832*1088':
            aspectRatio = '3:4';
            break;
        case '1088*832':
            aspectRatio = '4:3';
            break;
        case '624*624':
            aspectRatio = '1:1 (旧版)';
            break;
        default:
            aspectRatio = task.size;
    }
    
    // 视频预览（仅当任务成功且有视频URL时）
    let videoPreview = '';
    if (task.status === 'SUCCEEDED' && task.videoUrl) {
        videoPreview = `
            <div class="mt-3">
                <video controls class="w-full rounded" style="max-height: 180px">
                    <source src="${task.videoUrl}" type="video/mp4">
                    您的浏览器不支持视频标签
                </video>
                <div class="flex justify-end mt-2">
                    <a href="${task.videoUrl}" class="text-indigo-600 hover:text-indigo-800 text-sm mr-3" download target="_blank">
                        <i class="ri-download-2-line mr-1"></i>下载
                    </a>
                    <button class="text-indigo-600 hover:text-indigo-800 text-sm preview-btn mr-3" data-url="${task.videoUrl}">
                        <i class="ri-fullscreen-line mr-1"></i>预览
                    </button>
                    <button class="text-red-600 hover:text-red-800 text-sm delete-task-btn" data-task-id="${task.id}">
                        <i class="ri-delete-bin-line mr-1"></i>删除
                    </button>
                </div>
            </div>
        `;
    } else {
        // 对于未完成的任务，只显示删除按钮
        videoPreview = `
            <div class="flex justify-end mt-2">
                <button class="text-red-600 hover:text-red-800 text-sm delete-task-btn" data-task-id="${task.id}">
                    <i class="ri-delete-bin-line mr-1"></i>删除
                </button>
            </div>
        `;
    }
    
    // 格式化时间戳
    const createdDate = new Date(task.createdAt);
    const formattedDate = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}-${String(createdDate.getDate()).padStart(2, '0')} ${String(createdDate.getHours()).padStart(2, '0')}:${String(createdDate.getMinutes()).padStart(2, '0')}`;
    
    taskElement.innerHTML = `
        <div class="flex justify-between">
            <div class="flex-1 pr-4">
                <p class="font-medium">${task.prompt}</p>
                <div class="flex mt-2 text-sm text-gray-500">
                    <span class="mr-4">${aspectRatio}</span>
                    <span class="mr-4">${task.quality || '720P'}</span>
                    <span>${formattedDate}</span>
                </div>
            </div>
            <div>
                <span class="px-2 py-1 text-xs rounded-full ${statusClass}">${statusText}</span>
            </div>
        </div>
        ${videoPreview}
    `;
    
    return taskElement;
}

// 在预览区域显示视频
function showVideoPreview(videoUrl, taskId = '') {
    previewContainer.innerHTML = `
        <video controls class="w-full h-full" data-task-id="${taskId}">
            <source src="${videoUrl}" type="video/mp4">
            您的浏览器不支持视频标签
        </video>
    `;
    
    // 确保视频元素加载并正确显示
    const videoElement = previewContainer.querySelector('video');
    videoElement.addEventListener('loadedmetadata', () => {
        // 视频元数据加载完成，确保宽高适配容器
        videoElement.style.maxHeight = '100%';
        videoElement.style.maxWidth = '100%';
        videoElement.style.objectFit = 'contain';
    });
    
    videoElement.addEventListener('error', () => {
        // 视频加载出错处理
        console.error('视频加载失败:', videoUrl);
        previewContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full">
                <p class="text-lg text-red-600 text-center">视频加载失败</p>
                <p class="text-sm text-gray-500 mt-2">请检查网络连接或视频链接是否有效</p>
            </div>
        `;
    });
    
    // 滚动到预览区域
    previewContainer.scrollIntoView({ behavior: 'smooth' });
}

// 加载用户任务
function loadUserTasks() {
    if (!localStorage.getItem('authToken')) {
        console.log('用户未登录，不加载任务');
        return;
    }
    
    console.log('加载用户任务...');
    
    fetch('/api/text-to-video/tasks', {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.message || '请求失败，服务器返回错误');
            });
        }
        return response.json();
    })
    .then(data => {
        console.log(`获取到 ${data.length} 个任务`);
        
        tasks = data;
        renderTasks();
        
        // 注意: renderTasks 函数现在会自动为待处理和处理中的任务启动轮询
        // 所以这里不需要再次启动轮询
    })
    .catch(error => {
        console.error('获取任务列表出错:', error);
        showToast(`获取任务列表失败: ${error.message}`, 'error');
    });
}

// 消息提示
function showToast(message, type = 'info') {
    // 创建toast元素
    const toast = document.createElement('div');
    
    // 根据类型设置样式
    let bgColor, textColor;
    if (type === 'success') {
        bgColor = 'bg-green-500';
        textColor = 'text-white';
    } else if (type === 'error') {
        bgColor = 'bg-red-500';
        textColor = 'text-white';
    } else if (type === 'warning') {
        bgColor = 'bg-yellow-500';
        textColor = 'text-white';
    } else {
        bgColor = 'bg-blue-500';
        textColor = 'text-white';
    }
    
    toast.className = `fixed top-4 right-4 ${bgColor} ${textColor} px-4 py-2 rounded shadow-md z-50 transition-opacity duration-300 opacity-0`;
    toast.innerText = message;
    
    // 添加到页面
    document.body.appendChild(toast);
    
    // 显示toast
    setTimeout(() => {
        toast.classList.replace('opacity-0', 'opacity-100');
    }, 10);
    
    // 自动隐藏
    setTimeout(() => {
        toast.classList.replace('opacity-100', 'opacity-0');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

// 检查用户登录状态
function checkAuthStatus() {
    const authToken = localStorage.getItem('authToken');
    const userInfo = localStorage.getItem('user');
    
    if (authToken && userInfo) {
        // 用户已登录
        try {
            currentUser = JSON.parse(userInfo);
            userMenuBtn.querySelector('span').textContent = currentUser.username;
            
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
    if (!localStorage.getItem('authToken')) {
        return;
    }
    
    fetch('/api/user/credits', {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
    })
    .then(response => response.json())
    .then(data => {
        userCredits = data.credits || 0;
        userCreditsElement.textContent = `积分: ${userCredits}`;
    })
    .catch(error => {
        console.error('获取用户积分出错:', error);
    });
}

// 从后端加载任务列表
function loadTasks() {
    // 此函数功能已被 loadUserTasks 取代，保留以确保兼容性
    loadUserTasks();
}

// 轮询任务状态
function pollTaskStatus(taskId) {
    // 如果已经存在轮询实例，不再创建新的
    if (pollingIntervals[taskId]) {
        console.log(`任务 ${taskId} 已经在轮询中，跳过`);
        return;
    }
    
    console.log(`开始轮询任务: ${taskId}`);
    
    // 直接使用统一的轮询函数
    startPollingTaskStatus(taskId);
}

// 显示生成进度和状态
function showGenerationProgress(task) {
    if (!previewContainer) return;
    
    // 根据状态显示不同内容
    if (task.status === 'SUCCEEDED' && task.videoUrl) {
        // 成功状态显示视频
        showVideoPreview(task.videoUrl);
    } else {
        // 其他状态显示加载动画和状态信息
        let statusText = '准备中...';
        let statusClass = 'text-gray-600';
        
        if (task.status === 'PENDING') {
            statusText = '排队中，请稍候...';
            statusClass = 'text-yellow-600';
        } else if (task.status === 'RUNNING') {
            statusText = '视频生成中，请稍候...';
            statusClass = 'text-blue-600';
        } else if (task.status === 'FAILED') {
            statusText = '视频生成失败';
            statusClass = 'text-red-600';
        }
        
        previewContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full">
                <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-500 mb-4"></div>
                <p class="text-lg ${statusClass} text-center">${statusText}</p>
                <p class="text-sm text-gray-500 mt-2">提示词: ${task.prompt}</p>
            </div>
        `;
    }
}

// 确认删除任务
function confirmDeleteTask(taskId) {
    console.log('确认删除任务:', taskId);
    if (!confirm('确定要删除这个视频任务吗？')) {
        console.log('用户取消删除操作');
        return;
    }
    
    console.log('用户确认删除，执行删除操作');
    deleteTask(taskId);
}

// 删除任务
function deleteTask(taskId) {
    console.log(`开始删除任务: ${taskId}`);
    
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        console.error('未找到认证Token，无法删除任务');
        showToast('请先登录', 'error');
        return;
    }
    
    // 查找任务对象，以获取完整信息
    const taskToDelete = tasks.find(task => task.id === taskId);
    if (!taskToDelete) {
        console.warn(`未找到ID为 ${taskId} 的任务对象，将尝试直接删除`);
    } else {
        console.log('找到要删除的任务:', taskToDelete);
    }
    
    // 检查删除操作是否成功执行的函数
    const removeTaskLocally = () => {
        // 从任务列表中移除
        const index = tasks.findIndex(task => task.id === taskId);
        if (index !== -1) {
            tasks.splice(index, 1);
            console.log('任务已从本地列表中移除');
            
            // 如果有轮询，停止轮询
            if (pollingIntervals[taskId]) {
                clearInterval(pollingIntervals[taskId]);
                delete pollingIntervals[taskId];
                console.log(`停止了任务 ${taskId} 的轮询`);
            }
            
            // 重新渲染任务列表
            renderTasks();
            
            // 如果删除的是当前预览的视频，清空预览
            const currentPreviewUrl = previewContainer.querySelector('video source')?.src;
            if (taskToDelete && taskToDelete.videoUrl === currentPreviewUrl) {
                console.log('删除的任务是当前预览的视频，清空预览区域');
                previewContainer.innerHTML = `
                    <div class="flex items-center justify-center h-full text-gray-500">
                        <p>您生成的视频将在这里显示</p>
                    </div>
                `;
            }
            
            showToast('任务已删除', 'success');
            return true;
        } else {
            console.warn('无法从本地删除：未在任务列表中找到该任务');
            return false;
        }
    };
    
    // 从控制台日志中获取正确的API端点
    const apiBaseUrl = '/api/text-to-video';
    const endpoints = [
        `${apiBaseUrl}/ta/${taskId}`,        // 根据网络请求日志
        `${apiBaseUrl}/tasks/${taskId}`,     // 标准格式
        `${apiBaseUrl}/task/${taskId}`,      // 单数形式
        `${apiBaseUrl}/delete/${taskId}`,    // 显式删除端点
        `${apiBaseUrl}/videos/${taskId}`     // 尝试视频资源路径
    ];
    
    // 创建一个Promise来处理本地删除选项
    const localDeletePromise = new Promise((resolve, reject) => {
        // 3秒后如果API调用没有成功，就询问是否本地删除
        setTimeout(() => {
            if (confirm('删除请求处理时间较长，是否直接从列表中移除任务？')) {
                if (removeTaskLocally()) {
                    resolve({ success: true, local: true });
                } else {
                    reject(new Error('无法从本地列表中移除任务'));
                }
            }
        }, 3000);
    });
    
    // API删除尝试函数
    const tryDeleteAPI = async () => {
        for (let i = 0; i < endpoints.length; i++) {
            const endpoint = endpoints[i];
            console.log(`尝试API端点(${i+1}/${endpoints.length}): ${endpoint}`);
            
            try {
                const response = await fetch(endpoint, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                console.log(`API响应(${endpoint}):`, response.status);
                
                if (response.ok) {
                    // 成功删除
                    return { success: true, endpoint };
                }
                
                // 尝试读取错误信息
                try {
                    const errorData = await response.json();
                    console.error('删除失败，服务器响应:', errorData);
                } catch (e) {
                    console.error('删除失败，无法解析响应:', e);
                }
            } catch (error) {
                console.error(`端点 ${endpoint} 请求失败:`, error);
            }
        }
        
        throw new Error('所有API尝试均失败');
    };
    
    // 使用Promise.race同时尝试API删除和本地删除选项
    Promise.race([tryDeleteAPI(), localDeletePromise])
    .then(result => {
        console.log('删除操作结果:', result);
        
        if (result.local) {
            console.log('通过本地选项删除任务');
        } else {
            console.log(`通过API成功删除任务: ${result.endpoint}`);
            removeTaskLocally(); // 确保本地状态也更新
        }
    })
    .catch(error => {
        console.error('删除失败:', error);
        
        // 最终失败的处理
        if (confirm('删除任务失败，是否从本地列表中移除？')) {
            if (removeTaskLocally()) {
                showToast('任务已从本地列表移除', 'warning');
            } else {
                showToast('无法移除任务', 'error');
            }
        } else {
            showToast(`删除失败: ${error.message}`, 'error');
        }
    });
} 