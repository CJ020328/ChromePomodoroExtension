import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Slider,
  Stack,
  TextField,
  Paper,
  InputAdornment,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SettingsIcon from '@mui/icons-material/Settings';
import { alpha } from '@mui/material/styles';

interface TimerSettings {
  focusTime: number;
  breakTime: number;
}

interface TimerState {
  timeLeft: number;
  isBreak: boolean;
  isRunning: boolean;
  settings: TimerSettings;
}

const Timer: React.FC = () => {
  const [state, setState] = useState<TimerState>({
    timeLeft: 50 * 60,
    isBreak: false,
    isRunning: false,
    settings: {
      focusTime: 50,
      breakTime: 10,
    }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [isEndScreen, setIsEndScreen] = useState(false);

  // 初始化时获取后台状态
  useEffect(() => {
    // 检查 URL 参数
    const urlParams = new URLSearchParams(window.location.search);
    const isBreakParam = urlParams.get('isBreak');
    const isEndScreenParam = urlParams.get('isEndScreen');
    
    if (isEndScreenParam === 'true') {
      setIsEndScreen(true);
    }
    
    // 初始化状态和启动轮询
    const initState = () => {
      console.log('初始化计时器状态并启动轮询');
      // 获取后台状态
      chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response: TimerState) => {
        if (response) {
          console.log('初始化时收到后台状态:', response);
          // 如果 URL 中指定了 isBreak 参数，使用该参数
          if (isBreakParam !== null) {
            response.isBreak = isBreakParam === 'true';
          }
          setState(response);
        }
      });
    };

    // 初始化
    initState();
    
    // 每秒轮询一次状态作为备份机制
    const pollTimer = setInterval(() => {
      chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response: TimerState) => {
        if (response) {
          // 只在计时器运行时或状态明显不同时更新
          if (response.isRunning || 
              response.timeLeft !== state.timeLeft || 
              response.isBreak !== state.isBreak) {
            console.log('轮询更新状态:', response);
            setState(prev => ({
              ...prev,
              ...response,
              // 如果 URL 中指定了 isBreak 参数，保持该状态
              isBreak: isBreakParam !== null ? isBreakParam === 'true' : response.isBreak
            }));
          }
        }
      });
    }, 1000);

    // 监听后台状态更新
    const listener = (message: any) => {
      if (message.type === 'TIME_UPDATE') {
        console.log('收到状态更新消息:', message.payload);
        
        // 确保发送响应以确认收到
        try {
          chrome.runtime.sendMessage({ type: 'STATE_UPDATE_RECEIVED' });
        } catch (e) {
          // 忽略错误
        }
        
        // 合并状态，但保持URL参数优先级
        setState(prev => {
          const newState = {
            ...prev,
            ...message.payload,
          };
          
          // 如果URL指定了休息模式，则保持该状态
          if (isBreakParam !== null) {
            newState.isBreak = isBreakParam === 'true';
          }
          
          return newState;
        });
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    
    // 清理函数
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      clearInterval(pollTimer);
    };
  }, []);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleStartPause = () => {
    // 立即更新本地状态，提供即时反馈
    const newRunningState = !state.isRunning;
    setState(prev => ({
      ...prev,
      isRunning: newRunningState
    }));
    
    const messageType = newRunningState ? 'START_TIMER' : 'PAUSE_TIMER';
    console.log(`发送${messageType}命令，当前模式:`, state.isBreak ? '休息' : '专注');
    
    // 发送消息到后台并确认
    const sendMessage = () => {
      chrome.runtime.sendMessage({
        type: messageType,
        payload: messageType === 'START_TIMER' ? {
          // 当开始计时时，明确指定应该使用哪种模式
          // resetMode=true 表示强制设置为专注模式，false表示休息模式
          resetMode: !state.isBreak
        } : undefined
      }, (response) => {
        // 如果收到响应，使用响应更新状态
        if (response) {
          console.log('计时器状态变更响应:', response);
          setState(prev => ({
            ...prev,
            ...response
          }));
        } else if (chrome.runtime.lastError) {
          console.error('计时器命令出错:', chrome.runtime.lastError);
          // 尝试再次发送消息
          setTimeout(sendMessage, 200);
        }
      });
    };
    
    // 首次发送
    sendMessage();
    
    // 强制同步检查 - 确保状态已更改
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response: TimerState) => {
        if (response && response.isRunning !== newRunningState) {
          console.log('状态同步检查失败，再次发送命令');
          sendMessage();
        }
      });
    }, 500);
  };

  const handleReset = () => {
    chrome.runtime.sendMessage({ type: 'RESET_TIMER' });
  };

  const handleSettingsChange = (
    setting: keyof TimerSettings,
    value: number | string
  ) => {
    const numValue = typeof value === 'string' ? parseInt(value, 10) : value;
    if (isNaN(numValue) || numValue < 1 || numValue > (setting === 'focusTime' ? 59 : 20)) return;

    const newSettings = {
      ...state.settings,
      [setting]: numValue
    };

    // 只有在计时器未运行，且当前模式与设置匹配时才更新 timeLeft
    if (!state.isRunning && 
        ((setting === 'focusTime' && !state.isBreak) || 
         (setting === 'breakTime' && state.isBreak))) {
      setState(prev => ({
        ...prev,
        settings: newSettings,
        timeLeft: numValue * 60
      }));
    } else {
      setState(prev => ({
        ...prev,
        settings: newSettings
      }));
    }

    // 发送更新到后台
    chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      payload: newSettings
    });
  };

  // 获取当前模式的主题色
  const getThemeColors = () => {
    return state.isBreak ? {
      primary: '#3498db',    // 休息模式：明亮的蓝色
      secondary: '#87ceeb',  // 休息模式：天蓝色
      background: '#f0f8ff', // 休息模式：爱丽丝蓝
      text: '#2c3e50'       // 深色文字
    } : {
      primary: '#ff6b6b',    // 专注模式：红色
      secondary: '#ff8787',  // 专注模式：浅红色
      background: '#fff5f5', // 专注模式：浅粉色背景
      text: '#2d3436'       // 深色文字
    };
  };

  const colors = getThemeColors();

  // 获取当前模式的文案
  const getModeText = () => {
    if (state.isBreak) {
      return {
        title: '休息时间',
        buttonText: state.isRunning ? '暂停休息' : '开始休息',
        settingsTitle: '休息时间设置'
      };
    } else {
      return {
        title: '专注时间',
        buttonText: state.isRunning ? '暂停专注' : '开始专注',
        settingsTitle: '专注时间设置'
      };
    }
  };

  const modeText = getModeText();

  return (
    <Box 
      sx={{ 
        textAlign: 'center', 
        width: '100vw',  // 使用视窗宽度
        height: '100vh', // 使用视窗高度
        background: colors.primary,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center', // 始终居中
        margin: 0,
        padding: 0,
        position: 'fixed', // 固定位置
        top: 0,
        left: 0
      }}
    >
      {isEndScreen ? (
        <Paper
          elevation={3}
          sx={{
            p: 4,
            borderRadius: 3,
            background: alpha(colors.background, 0.95),
            backdropFilter: 'blur(10px)',
            width: '90%',
            maxWidth: '500px',
            textAlign: 'center',
            position: 'relative', // 相对定位
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto' // 水平居中
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%'
            }}
          >
            <Typography 
              variant="h4" 
              sx={{ 
                mt: 3,
                mb: 3,
                color: colors.primary,
                fontWeight: 'bold',
                textAlign: 'center',
                fontSize: { xs: '1.8rem', sm: '2.2rem' }  // 响应式字体大小
              }}
            >
              {state.isBreak ? '休息时间结束！' : '专注时间结束！'}
            </Typography>
            <Typography 
              variant="h6" 
              sx={{ 
                mb: 4,
                color: colors.text,
                textAlign: 'center',
                fontSize: { xs: '1.2rem', sm: '1.4rem' }  // 响应式字体大小
              }}
            >
              {state.isBreak ? '准备开始新的专注吧！' : '该休息一下了！'}
            </Typography>
            <Stack 
              direction="row" 
              spacing={2} 
              justifyContent="center"
              sx={{ width: '100%', mt: 2 }}
            >
              <IconButton
                onClick={handleStartPause}
                sx={{
                  backgroundColor: colors.primary,
                  color: 'white',
                  padding: '24px',  // 增大按钮尺寸
                  '&:hover': {
                    backgroundColor: alpha(colors.primary, 0.8),
                  }
                }}
                size="large"
              >
                <PlayArrowIcon sx={{ fontSize: 40 }} />  // 增大图标尺寸
              </IconButton>
            </Stack>
          </Box>
        </Paper>
      ) : (
        <>
          <img 
            src={state.isBreak ? "/images/break-icon.png" : "/images/icon128.png"}
            alt={state.isBreak ? "Break Timer" : "Focus Timer"}
            style={{
              width: '64px',
              height: '64px',
              marginBottom: '16px',
              filter: 'drop-shadow(0px 4px 8px rgba(0,0,0,0.2))'
            }}
          />

          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: '30px',
              background: alpha(colors.background, 0.95),
              backdropFilter: 'blur(10px)',
              width: '90%',
              maxWidth: '360px',
              transition: 'all 0.3s ease-in-out',
              height: 'auto',  // 改为自动高度
              minHeight: showSettings ? '500px' : '320px',  // 设置最小高度
              boxShadow: `
                0 2px 4px ${alpha(colors.text, 0.1)},
                0 8px 16px ${alpha(colors.text, 0.1)},
                0 16px 32px ${alpha(colors.text, 0.1)},
                inset 0 0 0 1px ${alpha(colors.primary, 0.05)}
              `,
              overflow: 'visible',  // 允许内容溢出
              position: 'relative',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: `
                  0 4px 8px ${alpha(colors.text, 0.12)},
                  0 12px 24px ${alpha(colors.text, 0.12)},
                  0 24px 48px ${alpha(colors.text, 0.12)},
                  inset 0 0 0 1px ${alpha(colors.primary, 0.08)}
                `
              }
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                transition: 'all 0.3s ease-in-out'  // 添加过渡动画
              }}
            >
              <Typography 
                variant="h5" 
                gutterBottom
                sx={{
                  color: colors.text,
                  fontWeight: 'bold',
                  fontSize: '1.5rem'
                }}
              >
                {modeText.title}
              </Typography>

              <Typography 
                variant="h2" 
                sx={{ 
                  color: colors.primary,
                  fontWeight: 'bold',
                  fontSize: '3.5rem',
                  lineHeight: 1.2
                }}
              >
                {formatTime(state.timeLeft)}
              </Typography>

              <Stack
                direction="row"
                spacing={2}
                justifyContent="center"
                sx={{ 
                  mb: showSettings ? 3 : 0,
                  transition: 'all 0.3s ease-in-out'
                }}
              >
                <IconButton
                  onClick={handleStartPause}
                  sx={{
                    backgroundColor: state.isRunning ? colors.secondary : colors.primary,
                    color: 'white',
                    width: '56px',
                    height: '56px',
                    '&:hover': {
                      backgroundColor: alpha(state.isRunning ? colors.secondary : colors.primary, 0.8),
                      transform: 'scale(1.05)'
                    },
                    transition: 'all 0.2s ease-in-out'
                  }}
                  size="large"
                  title={modeText.buttonText}
                >
                  {state.isRunning ? <PauseIcon /> : <PlayArrowIcon />}
                </IconButton>
                <IconButton
                  onClick={handleReset}
                  sx={{
                    backgroundColor: colors.secondary,
                    color: 'white',
                    width: '56px',
                    height: '56px',
                    '&:hover': {
                      backgroundColor: alpha(colors.secondary, 0.8),
                      transform: 'scale(1.05)'
                    },
                    transition: 'all 0.2s ease-in-out'
                  }}
                  size="large"
                  title="重置"
                >
                  <RestartAltIcon />
                </IconButton>
                <IconButton
                  onClick={() => setShowSettings(!showSettings)}
                  sx={{
                    backgroundColor: alpha(colors.text, 0.8),
                    color: 'white',
                    width: '56px',
                    height: '56px',
                    '&:hover': {
                      backgroundColor: colors.text,
                      transform: 'scale(1.05)'
                    },
                    transition: 'all 0.2s ease-in-out'
                  }}
                  size="large"
                  title="设置"
                >
                  <SettingsIcon />
                </IconButton>
              </Stack>

              <Box
                sx={{
                  width: '100%',
                  height: 'auto',  // 改为自动高度
                  opacity: showSettings ? 1 : 0,
                  transition: 'all 0.3s ease-in-out',
                  overflow: 'visible',  // 允许内容溢出
                  display: showSettings ? 'block' : 'none'  // 使用display来控制显示
                }}
              >
                {showSettings && (
                  <Box sx={{ pt: 2, pb: 1 }}>
                    <Typography sx={{ color: colors.text, mb: 1, fontWeight: 'bold' }}>
                      专注时间设置 (分钟)
                    </Typography>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                      <Slider
                        value={state.settings.focusTime}
                        min={1}
                        max={59}
                        onChange={(_, value) => handleSettingsChange('focusTime', value as number)}
                        valueLabelDisplay="auto"
                        sx={{
                          color: '#ff6b6b',
                          '& .MuiSlider-thumb': {
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                          }
                        }}
                      />
                      <TextField
                        value={state.settings.focusTime}
                        onChange={(e) => handleSettingsChange('focusTime', e.target.value)}
                        type="number"
                        InputProps={{
                          inputProps: { min: 1, max: 59 },
                          endAdornment: <InputAdornment position="end">分钟</InputAdornment>,
                        }}
                        sx={{ 
                          width: '120px',
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '15px',
                            '& fieldset': {
                              borderColor: alpha('#ff6b6b', 0.5),
                            },
                            '&:hover fieldset': {
                              borderColor: '#ff6b6b',
                            },
                            '&.Mui-focused fieldset': {
                              borderColor: '#ff6b6b',
                            }
                          }
                        }}
                      />
                    </Stack>

                    <Typography sx={{ color: colors.text, mb: 1, mt: 2, fontWeight: 'bold' }}>
                      休息时间设置 (分钟)
                    </Typography>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Slider
                        value={state.settings.breakTime}
                        min={1}
                        max={20}
                        onChange={(_, value) => handleSettingsChange('breakTime', value as number)}
                        valueLabelDisplay="auto"
                        sx={{
                          color: '#3498db',
                          '& .MuiSlider-thumb': {
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                          }
                        }}
                      />
                      <TextField
                        value={state.settings.breakTime}
                        onChange={(e) => handleSettingsChange('breakTime', e.target.value)}
                        type="number"
                        InputProps={{
                          inputProps: { min: 1, max: 20 },
                          endAdornment: <InputAdornment position="end">分钟</InputAdornment>,
                        }}
                        sx={{ 
                          width: '120px',
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '15px',
                            '& fieldset': {
                              borderColor: alpha('#3498db', 0.5),
                            },
                            '&:hover fieldset': {
                              borderColor: '#3498db',
                            },
                            '&.Mui-focused fieldset': {
                              borderColor: '#3498db',
                            }
                          }
                        }}
                      />
                    </Stack>
                  </Box>
                )}
              </Box>
            </Box>
          </Paper>
        </>
      )}
    </Box>
  );
};

export default Timer; 