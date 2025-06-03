/**
 * 功能使用跟踪脚本
 * 用于在打开编辑器功能时记录使用情况
 */

// 记录功能使用
async function trackFeatureUsage(action, featureName) {
    try {
        // 如果只传递了一个参数，则它就是featureName
        if (featureName === undefined) {
            featureName = action;
            action = 'use'; // 默认action是'use'
        }

        // 获取用户token
        const authToken = localStorage.getItem('authToken');
        if (!authToken) {
            console.warn('用户未登录，将以访客身份使用功能');
            return true; // 允许未登录用户继续使用
        }
        
        const response = await fetch('/api/credits/track-usage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ action, featureName })
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('功能使用已记录:', result.data);
        } else {
            console.error('记录功能使用失败:', result.message);
            // 如果是积分不足，可以提示用户
            if (response.status === 402) {
                alert('您的免费试用次数已用完，积分不足，请充值后再使用。');
                // 跳转到积分管理页面
                window.location.href = '/credits.html';
                return false;
            }
        }
        
        return true;
    } catch (error) {
        console.error('跟踪功能使用出错:', error);
        // 出错时也允许继续使用，避免功能被阻塞
        return true;
    }
} 