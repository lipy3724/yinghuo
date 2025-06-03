document.addEventListener('DOMContentLoaded', function() {
    // 全局变量
    let uploadedImageUrl = null;
    
    // 下拉菜单交互
    const dropdown = document.querySelector('.dropdown');
    if (dropdown) {
        dropdown.addEventListener('click', function() {
            // 这里可以添加下拉菜单的展开/收起逻辑
            console.log('Dropdown clicked');
        });
    }

    // 上传区域交互 - 直接点击打开编辑器
    const uploadBox = document.querySelector('.upload-box');
    if (uploadBox) {
        uploadBox.addEventListener('click', function() {
            // 直接打开编辑器
            openEditor();
        });
    }

    // 重置按钮
    const resetBtn = document.querySelector('#resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            // 重置表单
            const uploadBox = document.querySelector('.upload-box');
            if (uploadBox) {
                uploadBox.innerHTML = '<span class="upload-icon">+</span>';
            }
            
            // 重置上传的图片URL
            uploadedImageUrl = null;
        });
    }

    // 打开工作台按钮
    const submitBtn = document.querySelector('#submitBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', function() {
            openEditor();
        });
    }

    // 打开编辑器函数
    function openEditor() {
        // 构建编辑器URL
        const editorBaseUrl = 'https://editor.d.design/editor/index.html/#/translate';
        
        // 构建参数对象 - 根据API说明进行调整
        const params = {
            apiHost: 'aibcn', // 平台代码：aibcn代表aidge官网中文站点
            trial: true, // 使用试用额度
            lang: 'zh-cn', // 中文界面
            charge: true, // 开启生产拦截
            reEdit: false, // 默认不开启再次编辑
            // 不传递imageUrl，让编辑器自己处理图片上传
            sourceLanguage: 'zh', // 源语言代码：中文
            targetLanguage: 'en' // 目标语言代码：英文
        };
        
        // 转换为URL参数字符串
        const queryString = Object.keys(params)
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
            .join('&');
        
        // 完整的编辑器URL
        const editorUrl = `${editorBaseUrl}?${queryString}`;
        console.log("打开编辑器URL:", editorUrl);
        
        // 在新窗口打开编辑器
        window.open(editorUrl, '_blank');
    }

    // 侧边栏项目交互
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    sidebarItems.forEach(item => {
        item.addEventListener('click', function() {
            // 移除所有选中状态
            sidebarItems.forEach(i => i.classList.remove('selected'));
            // 添加当前项目的选中状态
            this.classList.add('selected');
        });
    });
    
    // 保存图片到服务器
    async function saveImageResult(data) {
        try {
            // 获取原始图片和处理后的图片URL
            let originalImageUrl = null;
            let processedImageUrl = null;
            
            if (Array.isArray(data) && data.length > 0) {
                // 如果返回的是数组，处理第一个结果
                if (data[0].url) {
                    processedImageUrl = data[0].url;
                    originalImageUrl = data[0].originalUrl || null;
                }
            } else if (data && data.url) {
                // 如果返回的是单个对象
                processedImageUrl = data.url;
                originalImageUrl = data.originalUrl || null;
            }
            
            if (!processedImageUrl) {
                console.error("保存失败：无效的图片URL");
                return false;
            }
            
            // 准备要发送的数据
            const resultData = {
                originalImageUrl: originalImageUrl,
                processedImageUrl: processedImageUrl,
                processTime: new Date().toISOString(),
                processType: '图片翻译', // 可根据实际功能修改
                description: '图片翻译处理结果'
            };
            
            // 发送到服务器API
            const response = await fetch('/api/save-result', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(resultData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('图片结果已保存到下载中心:', result);
                return true;
            } else {
                console.error('保存到下载中心失败:', result.error);
                return false;
            }
        } catch (error) {
            console.error('保存到下载中心出错:', error);
            return false;
        }
    }
    
    // 监听编辑器消息
    window.addEventListener('message', function(event) {
        const { data, action, biz, errMessage, code } = event.data || {};
        
        console.log('收到编辑器消息:', event.data);
        
        // 记录业务ID用于后续响应
        let receiveBiz = biz;
        
        // 处理生产拦截
        if (action === 'generate') {
            // 获取图片数量
            const imageNum = data?.imageNum || 1;
            console.log("用户请求生成图片，数量:", imageNum);
            
            // 这里应当调用后端API记录使用情况
            // 由于script.js是前端入口页面，需要用户先登录，所以需要实现一个trackFeatureUsage函数
            // 这里简化为直接返回true，表示允许继续
            const canProceed = true;
            
            // 响应编辑器请求
            event.source.postMessage({
                biz: receiveBiz,
                action: 'respond',
                success: canProceed
            }, '*');
            
            console.log("已允许继续生产流程");
            return;
        }
        
        if (action === 'taskSuccess') {
            // 生成任务成功
            console.log('生成任务成功:', data);
        } else if (action === 'submit') {
            // 用户点击保存按钮
            console.log('用户保存结果:', data);
            
            // 保存结果到下载中心
            saveImageResult(data).then(success => {
                if (success) {
                    alert('图片已保存到下载中心!');
                } else {
                    alert('保存失败，请重试');
                }
            });
        } else if (action === 'download') {
            // 用户点击下载按钮
            console.log('用户下载结果:', data);
            
            // 同时保存到下载中心
            saveImageResult(data).then(success => {
                if (success) {
                    console.log('图片已保存到下载中心');
                }
            });
        } else if (action === 'error') {
            // 发生错误
            console.error('编辑器错误:', data);
            alert('发生错误: ' + (data.errMessage || '未知错误'));
        } else if (action === 'pageReady') {
            // 页面准备就绪
            console.log('编辑器页面已准备就绪');
        }
    });

    // 检查用户权限并重定向
    function checkAuthAndRedirect(url) {
        const token = localStorage.getItem('authToken');
        if (token) {
            window.location.href = url;
        } else {
            window.location.href = '/login.html?redirect=' + encodeURIComponent(url);
        }
    }

    // 检查用户登录状态并更新UI
    function updateLoginStatus() {
        const token = localStorage.getItem('authToken');
        const userInfo = localStorage.getItem('user');
        
        const loginBtn = document.getElementById('login-btn');
        const userInfoEl = document.getElementById('user-info');
        
        if (token && userInfo && loginBtn && userInfoEl) {
            try {
                const user = JSON.parse(userInfo);
                
                // 更新UI显示登录状态
                loginBtn.classList.add('hidden');
                userInfoEl.classList.remove('hidden');
                
                const usernameDisplay = document.getElementById('username-display');
                if (usernameDisplay) {
                    usernameDisplay.textContent = user.username || '用户';
                }
            } catch (e) {
                console.error('解析用户信息出错:', e);
            }
        }
    }

    // 页面加载时执行
    updateLoginStatus();
}); 