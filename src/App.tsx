import React, { useEffect, useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Timer from './components/Timer';
import { Box, Container, Typography, Button, Paper } from '@mui/material';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#ff6b6b',
    },
    secondary: {
      main: '#4ecdc4',
    },
  },
});

function App() {
  const [mode, setMode] = useState<string | null>(null);

  useEffect(() => {
    // 监听来自 background 的音频播放请求
    const handleMessage = (message: any) => {
      if (message.type === 'PLAY_SOUND') {
        const audio = new Audio(chrome.runtime.getURL(`sounds/${message.payload.soundType}-end.mp3`));
        audio.play().catch(error => {
          console.error('音频播放失败:', error);
        });
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    
    // 检查 URL 参数
    const urlParams = new URLSearchParams(window.location.search);
    const autoplay = urlParams.get('autoplay');
    const modeParam = urlParams.get('mode');
    
    if (autoplay) {
      const audio = new Audio(chrome.runtime.getURL(`sounds/${autoplay}-end.mp3`));
      audio.play().catch(error => {
        console.error('自动播放音频失败:', error);
      });
    }

    if (modeParam) {
      setMode(modeParam);
    }

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const handleContinue = () => {
    // 发送消息到 background 开始下一个阶段
    chrome.runtime.sendMessage({ type: 'START_TIMER' });
    // 关闭当前窗口
    window.close();
  };

  const handlePause = () => {
    // 关闭当前窗口
    window.close();
  };

  // 如果是完成提示界面
  if (mode === 'focus' || mode === 'break') {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Container>
          <Box
            sx={{
              minWidth: '300px',
              minHeight: '400px',
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Paper
              elevation={3}
              sx={{
                p: 4,
                borderRadius: 4,
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(10px)',
                maxWidth: '90%',
                width: '320px',
                textAlign: 'center'
              }}
            >
              <Typography 
                variant="h5" 
                gutterBottom
                sx={{ color: mode === 'focus' ? '#00b894' : '#ff4757', mb: 3 }}
              >
                {mode === 'focus' ? '专注时间结束！' : '休息时间结束！'}
              </Typography>
              <Typography 
                variant="body1" 
                sx={{ mb: 4, color: '#2d3436' }}
              >
                {mode === 'focus' 
                  ? '太棒了！你已经完成了一个专注时段。\n要开始休息了吗？' 
                  : '休息得怎么样？\n准备开始新的专注了吗？'}
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleContinue}
                  sx={{
                    bgcolor: mode === 'focus' ? '#00b894' : '#ff4757',
                    '&:hover': {
                      bgcolor: mode === 'focus' ? '#00cec9' : '#ff6b6b',
                    }
                  }}
                >
                  {mode === 'focus' ? '开始休息' : '开始专注'}
                </Button>
                <Button
                  variant="outlined"
                  onClick={handlePause}
                  sx={{ color: '#2d3436', borderColor: '#2d3436' }}
                >
                  稍后再说
                </Button>
              </Box>
            </Paper>
          </Box>
        </Container>
      </ThemeProvider>
    );
  }

  // 默认显示计时器界面
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container>
        <Box
          sx={{
            minWidth: '300px',
            minHeight: '400px',
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Timer />
        </Box>
      </Container>
    </ThemeProvider>
  );
}

export default App; 