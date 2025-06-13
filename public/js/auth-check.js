/**
 * 统一的认证检查脚本
 * 用于所有功能页面，确保用户在会话失效或被管理员终止时能够正确登出
 */

// 检查用户认证状态
async function checkAuth(redirectOnFailure = true) {
    // 首先检查本地存储
    const authToken = localStorage.getItem('authToken');
    const userInfo = localStorage.getItem('user');
    
    if (!authToken || !userInfo) {
        console.log('本地存储中没有令牌或用户信息，认证失败');
        if (redirectOnFailure) {
            redirectToLogin();
        }
        return false;
    }
    
    // 验证会话是否有效
    try {
        // 如果verifySession函数可用，优先使用
        if (typeof window.verifySession === 'function') {
            const isValid = await window.verifySession();
            if (!isValid && redirectOnFailure) {
                redirectToLogin();
            }
            return isValid;
        }
        
        // 否则直接调用验证API
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
        
        // 如果会话无效，清除登录信息并重定向
        if (response.status === 401 || response.status === 403) {
            console.log('会话已失效或被管理员终止');
            
            // 检查是否是被管理员强制登出
            const isForceLogout = responseData && 
                                 responseData.data && 
                                 responseData.data.userSessionTerminated === true;
            
            if (isForceLogout) {
                console.log('管理员已强制登出此用户的所有设备');
                // 显示提示消息
                alert('您的账号已被管理员强制下线，请重新登录');
            }
            
            if (redirectOnFailure) {
                // 如果存在全局登出函数，使用它
                if (typeof window.userLogout === 'function') {
                    window.userLogout();
                } else if (typeof window.logout === 'function') {
                    window.logout();
                } else {
                    // 否则手动清除并重定向
                    clearAuthAndRedirect();
                }
            }
            return false;
        }
        
        if (!responseData || !responseData.success) {
            console.log('API返回验证失败');
            if (redirectOnFailure) {
                clearAuthAndRedirect();
            }
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('验证会话时出错:', error);
        if (redirectOnFailure) {
            clearAuthAndRedirect();
        }
        return false;
    }
}

// 重定向到登录页面，可选择保存当前URL用于登录后返回
function redirectToLogin() {
    const currentUrl = window.location.href;
    localStorage.setItem('redirectAfterLogin', currentUrl);
    window.location.href = '/login.html';
}

// 清除认证信息并重定向到登录页
function clearAuthAndRedirect() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    redirectToLogin();
}

// 检查功能访问权限
async function checkFeatureAccess(featureName) {
    // 首先检查基本认证
    const isAuthenticated = await checkAuth(false);
    if (!isAuthenticated) {
        redirectToLogin();
        return false;
    }
    
    // 可以在这里添加功能特定的访问检查逻辑
    return true;
}

// 页面加载时自动验证
document.addEventListener('DOMContentLoaded', function() {
    // 如果页面不是登录页或注册页，执行验证
    const isAuthPage = window.location.pathname.includes('login.html') || 
                      window.location.pathname.includes('register.html');
    
    if (!isAuthPage && localStorage.getItem('authToken')) {
        checkAuth();
    }
});

// 暴露给全局作用域
window.checkAuth = checkAuth;
window.checkFeatureAccess = checkFeatureAccess; 