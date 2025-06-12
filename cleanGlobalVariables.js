// 清理全局变量中与特定用户相关的任务记录
// 注意：此脚本需要在服务器运行环境中执行，才能访问到全局变量

// 要清理的用户ID
const TARGET_USER_ID = 9;

function cleanGlobalVariables() {
  console.log(`开始清理全局变量中用户ID为${TARGET_USER_ID}的任务记录...`);
  
  // 清理数字人视频任务
  let count = 0;
  if (global.digitalHumanTasks) {
    for (const taskId in global.digitalHumanTasks) {
      if (global.digitalHumanTasks[taskId].userId === TARGET_USER_ID) {
        delete global.digitalHumanTasks[taskId];
        count++;
      }
    }
    console.log(`已从 digitalHumanTasks 中移除 ${count} 条记录`);
  } else {
    console.log('全局变量 digitalHumanTasks 不存在');
  }
  
  // 清理视频去除字幕任务
  count = 0;
  if (global.videoSubtitleTasks) {
    for (const taskId in global.videoSubtitleTasks) {
      if (global.videoSubtitleTasks[taskId].userId === TARGET_USER_ID) {
        delete global.videoSubtitleTasks[taskId];
        count++;
      }
    }
    console.log(`已从 videoSubtitleTasks 中移除 ${count} 条记录`);
  } else {
    console.log('全局变量 videoSubtitleTasks 不存在');
  }
  
  // 清理视频风格重绘任务
  count = 0;
  if (global.videoStyleRepaintTasks) {
    for (const taskId in global.videoStyleRepaintTasks) {
      if (global.videoStyleRepaintTasks[taskId].userId === TARGET_USER_ID) {
        delete global.videoStyleRepaintTasks[taskId];
        count++;
      }
    }
    console.log(`已从 videoStyleRepaintTasks 中移除 ${count} 条记录`);
  } else {
    console.log('全局变量 videoStyleRepaintTasks 不存在');
  }
  
  // 清理图片上色任务
  count = 0;
  if (global.imageColorizationTasks) {
    for (const taskId in global.imageColorizationTasks) {
      if (global.imageColorizationTasks[taskId].userId === TARGET_USER_ID) {
        delete global.imageColorizationTasks[taskId];
        count++;
      }
    }
    console.log(`已从 imageColorizationTasks 中移除 ${count} 条记录`);
  } else {
    console.log('全局变量 imageColorizationTasks 不存在');
  }

  // 清理图片锐化任务
  count = 0;
  if (global.imageSharpeningTasks) {
    for (const taskId in global.imageSharpeningTasks) {
      if (global.imageSharpeningTasks[taskId].userId === TARGET_USER_ID) {
        delete global.imageSharpeningTasks[taskId];
        count++;
      }
    }
    console.log(`已从 imageSharpeningTasks 中移除 ${count} 条记录`);
  } else {
    console.log('全局变量 imageSharpeningTasks 不存在');
  }
  
  // 清理局部重绘任务
  count = 0;
  if (global.localRedrawTasks) {
    for (const taskId in global.localRedrawTasks) {
      if (global.localRedrawTasks[taskId].userId === TARGET_USER_ID) {
        delete global.localRedrawTasks[taskId];
        count++;
      }
    }
    console.log(`已从 localRedrawTasks 中移除 ${count} 条记录`);
  } else {
    console.log('全局变量 localRedrawTasks 不存在');
  }
  
  // 清理全局风格化任务
  count = 0;
  if (global.globalStyleTasks) {
    for (const taskId in global.globalStyleTasks) {
      if (global.globalStyleTasks[taskId].userId === TARGET_USER_ID) {
        delete global.globalStyleTasks[taskId];
        count++;
      }
    }
    console.log(`已从 globalStyleTasks 中移除 ${count} 条记录`);
  } else {
    console.log('全局变量 globalStyleTasks 不存在');
  }
  
  // 清理垫图任务
  count = 0;
  if (global.diantuTasks) {
    for (const taskId in global.diantuTasks) {
      if (global.diantuTasks[taskId].userId === TARGET_USER_ID) {
        delete global.diantuTasks[taskId];
        count++;
      }
    }
    console.log(`已从 diantuTasks 中移除 ${count} 条记录`);
  } else {
    console.log('全局变量 diantuTasks 不存在');
  }
  
  // 清理文生视频任务
  count = 0;
  if (global.textToVideoTasks) {
    for (const taskId in global.textToVideoTasks) {
      if (global.textToVideoTasks[taskId].userId === TARGET_USER_ID) {
        delete global.textToVideoTasks[taskId];
        count++;
      }
    }
    console.log(`已从 textToVideoTasks 中移除 ${count} 条记录`);
  } else {
    console.log('全局变量 textToVideoTasks 不存在');
  }
  
  // 清理图生视频任务
  count = 0;
  if (global.imageToVideoTasks) {
    for (const taskId in global.imageToVideoTasks) {
      if (global.imageToVideoTasks[taskId].userId === TARGET_USER_ID) {
        delete global.imageToVideoTasks[taskId];
        count++;
      }
    }
    console.log(`已从 imageToVideoTasks 中移除 ${count} 条记录`);
  } else {
    console.log('全局变量 imageToVideoTasks 不存在');
  }
  
  // 清理多图转视频任务
  count = 0;
  if (global.multiImageToVideoTasks) {
    for (const taskId in global.multiImageToVideoTasks) {
      if (global.multiImageToVideoTasks[taskId].userId === TARGET_USER_ID) {
        delete global.multiImageToVideoTasks[taskId];
        count++;
      }
    }
    console.log(`已从 multiImageToVideoTasks 中移除 ${count} 条记录`);
  } else {
    console.log('全局变量 multiImageToVideoTasks 不存在');
  }
  
  // 清理其他可能存在的全局任务变量
  // 根据系统中实际使用的全局变量添加更多清理代码
  
  console.log('全局变量清理完成');
}

// 导出清理函数，以便在服务器环境中调用
module.exports = cleanGlobalVariables;

// 如果直接运行此文件，则执行清理
if (require.main === module) {
  console.log('注意：此脚本需要在服务器运行环境中执行才能访问全局变量');
  console.log('如果在服务器外部运行，请将此文件导入到服务器代码中执行');
  
  // 如果不在服务器环境中，模拟一些全局变量用于测试
  if (typeof global.digitalHumanTasks === 'undefined') {
    global.digitalHumanTasks = {
      'task1': { userId: 9, creditCost: 36 },
      'task2': { userId: 10, creditCost: 36 },
      'task3': { userId: 9, creditCost: 72 }
    };
    console.log('已创建模拟的 digitalHumanTasks 用于测试');
  }
  
  // 执行清理
  cleanGlobalVariables();
} 