let timer = null;
let timeLeft = 0;
let isBreak = false;
let settings = {
  focusTime: 50 * 60, // 50分钟专注时间
  breakTime: 10 * 60  // 10分钟休息时间
};

// 保存当前打开的计时器窗口ID
let timerWindowId = null;

// 初始化状态
function initTimer() {
  timeLeft = settings.focusTime;
  // 重置窗口状态
  timerWindowId = null;
}

// 计算窗口居中位置的辅助函数
function calculateCenteredPosition(windowWidth, windowHeight, display) {
  console.log('计算窗口居中位置:', { windowWidth, windowHeight });
  console.log('显示器信息:', display ? {
    width: display.workArea.width,
    height: display.workArea.height,
    left: display.workArea.left,
    top: display.workArea.top
  } : '无显示器信息');
  
  // 确保窗口尺寸合理
  windowWidth = Math.min(Math.max(windowWidth, 200), 1200);  // 最小200px，最大1200px
  windowHeight = Math.min(Math.max(windowHeight, 200), 1000); // 最小200px，最大1000px
  
  // 如果提供了显示器信息，使用它，否则使用默认值
  // 注意：在多显示器环境中，workArea.left和workArea.top可能不为0
  const screenWidth = display ? display.workArea.width : 1920;
  const screenHeight = display ? display.workArea.height : 1080;
  const screenLeft = display ? display.workArea.left : 0;
  const screenTop = display ? display.workArea.top : 0;
  
  // 计算精确的居中位置，考虑屏幕偏移
  const left = screenLeft + Math.round((screenWidth - windowWidth) / 2);
  const top = screenTop + Math.round((screenHeight - windowHeight) / 2);
  
  // 确保窗口位置不会是负数
  const safeLeft = Math.max(screenLeft, left);
  const safeTop = Math.max(screenTop, top);
  
  console.log('计算的窗口位置:', { left: safeLeft, top: safeTop, width: windowWidth, height: windowHeight });
  
  return { 
    left: safeLeft, 
    top: safeTop, 
    width: windowWidth, 
    height: windowHeight 
  };
}

// 找到真正的主显示器
function findPrimaryDisplay(displays) {
  // 查找设置了isPrimary标志的显示器
  const primary = displays.find(display => display.isPrimary);
  if (primary) return primary;
  
  // 如果没有找到isPrimary标志，则查找是否有isInternal标志（笔记本电脑内置屏幕）
  const internal = displays.find(display => display.isInternal);
  
  // 如果也没有找到内置屏幕，则使用第一个显示器
  return primary || internal || displays[0];
}

// 播放音频
async function playNotification(type) {
  try {
    console.log('准备播放音频并显示提示窗口');
    
    // 根据当前类型设置正确的模式和时间
    // 注意：type参数表示当前结束的是什么类型的计时
    if (type === 'focus') {
      // 专注结束后，切换到休息模式
      isBreak = true;
      timeLeft = settings.breakTime;
      console.log('专注时间结束，切换到休息模式');
    } else {
      // 休息结束后，切换到专注模式
      isBreak = false;
      timeLeft = settings.focusTime;
      console.log('休息时间结束，切换到专注模式');
    }
    
    // 广播新状态
    broadcastState(false);
    
    // 获取屏幕信息
    const screen = await chrome.system.display.getInfo();
    // 找到主显示器
    const primaryDisplay = findPrimaryDisplay(screen);
    console.log('检测到的主显示器:', primaryDisplay);
    
    // 设置窗口大小和位置
    const windowWidth = 400;
    const windowHeight = 600;
    
    // 使用通用函数计算居中位置
    const position = calculateCenteredPosition(windowWidth, windowHeight, primaryDisplay);

    // 创建新窗口
    chrome.windows.create({
      url: `index.html?autoplay=${type}&mode=${type}&isBreak=${isBreak}&isEndScreen=true`,
      type: 'popup',
      width: position.width,
      height: position.height,
      left: position.left,
      top: position.top
    }, (window) => {
      // 保存通知窗口ID（这不会覆盖计时器窗口ID，因为它们是不同的窗口）
      console.log('通知窗口已创建，ID:', window.id);
      
      // 确保窗口位置正确
      setTimeout(() => {
        try {
          chrome.windows.get(window.id, {}, (createdWindow) => {
            if (chrome.runtime.lastError) {
              console.log('获取窗口信息失败:', chrome.runtime.lastError);
              return;
            }
            
            // 检查窗口位置是否如预期
            if (createdWindow.left !== position.left || createdWindow.top !== position.top) {
              console.log('窗口位置不正确，进行调整');
              chrome.windows.update(window.id, {
                left: position.left,
                top: position.top
              });
            }
          });
        } catch (e) {
          console.error('校正窗口位置出错:', e);
        }
      }, 100);
      
      // 监听窗口关闭事件
      chrome.windows.onRemoved.addListener(function windowClosedListener(windowId) {
        if (windowId === window.id) {
          console.log('通知窗口被关闭');
          chrome.windows.onRemoved.removeListener(windowClosedListener);
        }
      });
    });

    // 同时尝试在现有popup中播放音频（如果存在的话）
    chrome.runtime.sendMessage({
      type: 'PLAY_SOUND',
      payload: {
        soundType: type
      }
    }).catch(() => {
      // 忽略错误，这是正常的
      console.log('现有popup中的音频播放可能失败，但不影响新窗口');
    });
    
    return true;
  } catch (error) {
    console.error('音频处理过程出错:', error);
    return false;
  }
}

// 发送状态更新
function broadcastState(isRunning = true) {
  const frontendState = prepareStateForFrontend();
  frontendState.isRunning = isRunning; // 确保使用传入的isRunning参数
  
  const state = {
    type: 'TIME_UPDATE',
    payload: frontendState
  };
  
  console.log('广播状态:', state.payload);
  
  // 确保消息传递的可靠性
  function broadcastWithConfirmation(retries = 3) {
    // 尝试给所有连接发送消息
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(state, (response) => {
        // 确认已收到
        if (response) {
          console.log('状态广播已确认');
          resolve(true);
        } else {
          // 忽略错误，可能没有连接的popup
          resolve(false);
        }
      }).catch(() => {
        // 忽略错误，返回false
        resolve(false);
      });
    }).catch(() => {
      // 忽略Promise错误
      return false;
    });
  }
  
  // 初始发送
  try {
    broadcastWithConfirmation();
  } catch (e) {
    console.log('广播出错，忽略:', e);
  }
  
  // 延迟再次发送 (备份机制)
  setTimeout(() => {
    try {
      broadcastWithConfirmation();
    } catch (e) {
      console.log('延迟广播出错，忽略:', e);
    }
  }, 100);
  
  // 延迟发送到标签页 (如果有)
  try {
    setTimeout(() => {
      chrome.tabs.query({}, function(tabs) {
        for (let i = 0; i < tabs.length; i++) {
          try {
            chrome.tabs.sendMessage(tabs[i].id, state).catch(() => {
              // 忽略错误
            });
          } catch (e) {
            // 忽略错误
          }
        }
      });
    }, 50);
  } catch (error) {
    console.error('广播状态时出错:', error);
  }
}

// 显示通知并等待用户响应
function showNotification(title, message) {
  return new Promise((resolve) => {
    const notificationId = 'pomodoro-notification-' + Date.now();
    
    // 创建通知
    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('images/icon128.png'),
      title: title,
      message: message,
      buttons: [
        { title: '开始下一个阶段' },
        { title: '暂停' }
      ],
      requireInteraction: true,
      priority: 2
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('通知创建失败:', chrome.runtime.lastError);
      } else {
        console.log('通知创建成功');
      }
    });

    // 监听通知按钮点击
    const buttonClickHandler = (clickedId, buttonIndex) => {
      if (clickedId === notificationId) {
        console.log('通知按钮被点击:', buttonIndex);
        chrome.notifications.clear(notificationId);
        chrome.notifications.onButtonClicked.removeListener(buttonClickHandler);
        resolve(buttonIndex === 0);
      }
    };

    chrome.notifications.onButtonClicked.addListener(buttonClickHandler);
  });
}

// 开始计时
function startTimer() {
  const currentMode = isBreak ? '休息' : '专注';
  console.log(`尝试启动${currentMode}计时器, 当前状态:`, 
    { timeLeft, isBreak, timerActive: !!timer });
  
  // 如果计时器已经在运行，先清除它
  if (timer) {
    console.log('计时器已在运行，清除旧计时器');
    clearInterval(timer);
    timer = null;
  }
  
  // 确保使用正确的时间
  if (timeLeft <= 0) {
    console.log(`${currentMode}时间为0，重置时间`);
    timeLeft = isBreak ? settings.breakTime : settings.focusTime;
  }
  
  console.log(`开始新的${currentMode}计时器, 时间:`, timeLeft);
  
  // 确保在设置计时器前先清除任何旧的计时器
  clearInterval(timer);
  
  // 设置新的计时器
  timer = setInterval(() => {
    if (timeLeft > 0) {
      timeLeft--;
      broadcastState(true);
      
      // 当剩余3秒时提醒
      if (timeLeft === 3) {
        const title = isBreak ? '休息时间即将结束' : '专注时间即将结束';
        const message = '还剩3秒';
        showNotification(title, message);
      }
    }
    
    if (timeLeft <= 0) {
      clearInterval(timer);
      timer = null;
      
      // 确保显示0
      broadcastState(false);
      
      console.log('计时结束，开始处理结束流程');
      
      // 播放音频并显示通知
      playNotification(isBreak ? 'break' : 'focus')
        .then(audioPlayed => {
          console.log('音频播放状态:', audioPlayed ? '成功' : '失败');
          
          const title = isBreak ? '休息时间结束！' : '专注时间结束！';
          const message = isBreak ? '要开始新的专注吗？' : '该休息一下了！';
          return showNotification(title, message);
        })
        .then((shouldContinue) => {
          console.log('用户选择:', shouldContinue ? '继续' : '暂停');
          
          if (shouldContinue) {
            console.log('开始下一个阶段');
            startTimer();
          } else {
            console.log('暂停等待用户操作');
          }
        })
        .catch(error => {
          console.error('结束流程处理出错:', error);
          broadcastState(false);
        });
    }
  }, 1000);
  
  // 立即广播状态更新
  broadcastState(true);
  
  // 500毫秒后再次广播，确保前端已更新
  setTimeout(() => {
    broadcastState(true);
  }, 500);
}

// 暂停计时
function pauseTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  broadcastState(false);
}

// 重置计时器
function resetTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  
  isBreak = false;
  timeLeft = settings.focusTime;
  broadcastState(false);
}

// 更新设置
function updateSettings(newSettings) {
  // 将接收到的分钟数转换为秒数
  const convertedSettings = {};
  if (newSettings.focusTime !== undefined) {
    convertedSettings.focusTime = newSettings.focusTime * 60;
  }
  if (newSettings.breakTime !== undefined) {
    convertedSettings.breakTime = newSettings.breakTime * 60;
  }
  
  settings = { ...settings, ...convertedSettings };
  if (!timer) {
    timeLeft = isBreak ? settings.breakTime : settings.focusTime;
    broadcastState(false);
  }
}

// 准备发送给前端的状态数据，转换设置中的秒为分钟
function prepareStateForFrontend() {
  return {
    timeLeft: Math.max(0, timeLeft),
    isBreak,
    isRunning: !!timer,
    settings: {
      focusTime: Math.round(settings.focusTime / 60),
      breakTime: Math.round(settings.breakTime / 60)
    }
  };
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('收到消息:', message.type);
  
  try {
    switch (message.type) {
      case 'START_TIMER':
        // 在启动前检查是否需要重置时间
        if (message.payload && typeof message.payload.resetMode !== 'undefined') {
          const resetMode = message.payload.resetMode;
          console.log('设置计时器模式:', resetMode ? '专注' : '休息');
          isBreak = !resetMode;
          timeLeft = isBreak ? settings.breakTime : settings.focusTime;
        }
        
        startTimer();
        // 延迟发送响应，确保状态已更新
        setTimeout(() => {
          try {
            sendResponse(prepareStateForFrontend());
          } catch (e) {
            console.error('发送START_TIMER响应出错:', e);
          }
        }, 50);
        return true; // 保持通道开放以进行异步响应
      case 'PAUSE_TIMER':
        pauseTimer();
        // 返回计时器当前状态
        sendResponse(prepareStateForFrontend());
        break;
      case 'RESET_TIMER':
        resetTimer();
        // 返回计时器当前状态
        sendResponse(prepareStateForFrontend());
        break;
      case 'UPDATE_SETTINGS':
        updateSettings(message.payload);
        sendResponse(prepareStateForFrontend());
        break;
      case 'GET_STATE':
        // 延迟发送以确保最新状态
        setTimeout(() => {
          try {
            console.log('发送当前状态:', { 
              timeLeft: Math.max(0, timeLeft), 
              isBreak, 
              isRunning: !!timer 
            });
            sendResponse(prepareStateForFrontend());
          } catch (e) {
            console.error('发送状态响应出错:', e);
          }
        }, 0);
        // 必须返回true以保持消息通道开放，允许异步响应
        return true;
        break;
      default:
        // 默认发送状态
        sendResponse(prepareStateForFrontend());
    }
  } catch (error) {
    console.error('消息处理出错:', error);
    // 出错时也返回当前状态
    try {
      sendResponse(prepareStateForFrontend());
    } catch (e) {
      console.error('错误处理中发送响应失败:', e);
    }
  }
  
  return true; // 保持通道开放以进行异步响应
});

// 初始化
initTimer();

// 监听浏览器关闭或扩展卸载事件
chrome.runtime.onSuspend.addListener(() => {
  console.log('扩展被卸载或浏览器关闭');
  // 清理所有计时器
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  // 尝试关闭窗口
  if (timerWindowId !== null) {
    try {
      chrome.windows.remove(timerWindowId).catch(() => {});
      timerWindowId = null;
    } catch (e) {
      // 忽略错误
    }
  }
});

// 监听快捷键命令
chrome.commands.onCommand.addListener((command) => {
  console.log('收到快捷键命令:', command);
  
  switch (command) {
    case 'show-timer':
      // 显示计时器状态窗口
      showTimerStatus();
      break;
    case 'toggle-timer':
      // 开始或暂停计时器
      toggleTimer();
      break;
  }
});

// 显示计时器状态窗口
function showTimerStatus() {
  console.log('切换计时器状态窗口');
  
  // 检查是否已有窗口打开
  if (timerWindowId !== null) {
    // 尝试关闭现有窗口
    chrome.windows.get(timerWindowId, {}, (windowInfo) => {
      if (!chrome.runtime.lastError && windowInfo) {
        console.log('关闭现有计时器窗口');
        chrome.windows.remove(timerWindowId);
        timerWindowId = null;
      } else {
        // 窗口可能已被用户关闭，重置ID并创建新窗口
        console.log('窗口不存在，创建新窗口');
        timerWindowId = null;
        createTimerWindow();
      }
    });
  } else {
    // 没有窗口打开，创建新窗口
    createTimerWindow();
  }
}

// 创建计时器窗口的辅助函数
function createTimerWindow() {
  // 获取屏幕信息
  chrome.system.display.getInfo().then(screen => {
    // 找到主显示器
    const primaryDisplay = findPrimaryDisplay(screen);
    console.log('检测到的主显示器:', primaryDisplay);
    
    // 设置窗口大小
    const windowWidth = 400;
    const windowHeight = 600;
    
    // 使用通用函数计算居中位置
    const position = calculateCenteredPosition(windowWidth, windowHeight, primaryDisplay);

    // 创建新窗口显示计时器
    chrome.windows.create({
      url: `index.html?source=shortcut`,
      type: 'popup',
      width: position.width,
      height: position.height,
      left: position.left,
      top: position.top
    }, (window) => {
      // 保存窗口ID以便后续关闭
      timerWindowId = window.id;
      console.log('计时器窗口已创建，ID:', timerWindowId);
      
      // 确保窗口位置正确
      setTimeout(() => {
        try {
          chrome.windows.get(window.id, {}, (createdWindow) => {
            if (chrome.runtime.lastError) {
              console.log('获取窗口信息失败:', chrome.runtime.lastError);
              return;
            }
            
            // 检查窗口位置是否如预期
            if (createdWindow.left !== position.left || createdWindow.top !== position.top) {
              console.log('窗口位置不正确，进行调整');
              chrome.windows.update(window.id, {
                left: position.left,
                top: position.top
              });
            }
          });
        } catch (e) {
          console.error('校正窗口位置出错:', e);
        }
      }, 100);
      
      // 监听窗口关闭事件
      chrome.windows.onRemoved.addListener(function windowClosedListener(windowId) {
        if (windowId === timerWindowId) {
          console.log('计时器窗口被关闭');
          timerWindowId = null;
          chrome.windows.onRemoved.removeListener(windowClosedListener);
        }
      });
    });
  });
}

// 开始或暂停计时器
function toggleTimer() {
  console.log('切换计时器状态');
  
  if (timer) {
    // 计时器正在运行，暂停它
    pauseTimer();
    
    // 通知前端
    broadcastState(false);
  } else {
    // 计时器未运行，启动它
    startTimer();
  }
}