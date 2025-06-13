// 全局登出处理函数
function logout() {
    console.log('执行全局登出函数');
    
    try {
        // 清除所有与登录相关的本地存储
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        localStorage.removeItem('adminAuthToken');
        localStorage.removeItem('adminUser');
        
        // 清除可能存在的会话cookie
        document.cookie.split(";").forEach(function(c) {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        
        console.log('已清除所有登录信息');
        
        // 重定向到登录页面
        setTimeout(function() {
            window.location.href = '/login.html';
        }, 100);
        
        return true;
    } catch (e) {
        console.error('登出过程中发生错误:', e);
        return false;
    }
}

// 用户登出函数 - 只清除用户相关的登录信息
async function userLogout() {
    console.log('执行用户登出函数');
    
    try {
        // 获取认证令牌
        const authToken = localStorage.getItem('authToken');
        
        // 如果有令牌，调用后端API登出
        if (authToken) {
            try {
                // 调用登出API
                const response = await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    console.log('服务器会话已成功失效');
                } else {
                    console.warn('调用登出API失败，状态码:', response.status);
                }
            } catch (apiError) {
                console.error('调用登出API出错:', apiError);
                // 即使API调用失败，依然继续清除本地存储
            }
        }
        
        // 只清除用户相关的本地存储，保留管理员登录信息
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        
        // 清除用户相关的会话cookie
        document.cookie.split(";").forEach(function(c) {
            // 只清除用户相关的cookie，不清除admin前缀的cookie
            const cookieName = c.replace(/^ +/, "").split("=")[0];
            if (!cookieName.startsWith('admin')) {
                document.cookie = cookieName + "=;expires=" + new Date().toUTCString() + ";path=/";
            }
        });
        
        console.log('已清除用户登录信息');
        
        // 如果当前是用户页面，重定向到登录页面
        if (!window.location.pathname.includes('admin')) {
            setTimeout(function() {
                window.location.href = '/login.html';
            }, 100);
        }
        
        return true;
    } catch (e) {
        console.error('用户登出过程中发生错误:', e);
        return false;
    }
}

// 管理员登出函数 - 只清除管理员相关的登录信息
async function adminLogout() {
    console.log('执行管理员登出函数');
    
    try {
        // 获取管理员认证令牌
        const adminToken = localStorage.getItem('adminAuthToken');
        
        // 如果有令牌，调用后端API登出
        if (adminToken) {
            try {
                // 调用管理员登出API
                const response = await fetch('/api/admin/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${adminToken}`
                    }
                });
                
                if (response.ok) {
                    console.log('管理员会话已成功失效');
                } else {
                    console.warn('调用管理员登出API失败，状态码:', response.status);
                }
            } catch (apiError) {
                console.error('调用管理员登出API出错:', apiError);
                // 即使API调用失败，依然继续清除本地存储
            }
        }
        
        // 只清除管理员相关的本地存储
        localStorage.removeItem('adminAuthToken');
        localStorage.removeItem('adminUser');
        
        // 清除管理员相关的会话cookie
        document.cookie.split(";").forEach(function(c) {
            const cookieName = c.replace(/^ +/, "").split("=")[0];
            if (cookieName.startsWith('admin')) {
                document.cookie = cookieName + "=;expires=" + new Date().toUTCString() + ";path=/";
            }
        });
        
        console.log('已清除管理员登录信息');
        
        // 如果当前是管理员页面，重定向到管理员登录页面
        if (window.location.pathname.includes('admin')) {
            setTimeout(function() {
                window.location.href = '/admin-login.html';
            }, 100);
        }
        
        return true;
    } catch (e) {
        console.error('管理员登出过程中发生错误:', e);
        return false;
    }
}

// 验证会话有效性的函数
async function verifySession() {
    try {
        // 检查是否有令牌
        const authToken = localStorage.getItem('authToken');
        if (!authToken) {
            console.log('未找到认证令牌，用户未登录');
            return false;
        }
        
        // 调用后端验证API
        const response = await fetch('/api/auth/verify', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        // 获取响应数据以检查是否被强制登出
        let responseData = null;
        try {
            responseData = await response.json();
        } catch (e) {
            console.error('解析响应数据失败:', e);
        }
        
        // 如果返回401或403，表示会话已失效或被终止
        if (response.status === 401 || response.status === 403) {
            console.log('会话已失效或被管理员终止，执行登出操作');
            
            // 检查是否是被管理员强制登出
            const isForceLogout = responseData && 
                                 responseData.data && 
                                 responseData.data.userSessionTerminated === true;
            
            if (isForceLogout) {
                console.log('管理员已强制登出此用户的所有设备');
                // 显示提示消息
                alert('您的账号已被管理员强制下线，请重新登录');
            }
            
            // 仅执行用户登出，不影响管理员登录状态
            userLogout();
            return false;
        }
        
        return responseData && responseData.success === true;
    } catch (error) {
        console.error('验证会话出错:', error);
        return false;
    }
}

// 页面加载时自动验证会话
document.addEventListener('DOMContentLoaded', function() {
    // 如果存在认证令牌，则验证会话
    if (localStorage.getItem('authToken')) {
        verifySession();
    }
    
    // 每5分钟定期验证会话
    setInterval(verifySession, 5 * 60 * 1000);
});

// 暴露给全局作用域
window.logout = logout;
window.userLogout = userLogout;
window.adminLogout = adminLogout;
window.verifySession = verifySession; 