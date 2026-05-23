const WebSocket = require('ws');

/**
 * 处理前端 WebSocket 连接，作为百度实时语音识别的代理
 * 数据流：前端 ←→ 本WS ←→ 百度WS
 */
function handleSttWs(frontWs) {
  const appid = process.env.BAIDU_APPID;
  const appkey = process.env.BAIDU_APPKEY;

  if (!appid || !appkey) {
    frontWs.send(JSON.stringify({ type: 'ERROR', error: 'Baidu credentials not configured' }));
    frontWs.close();
    return;
  }

  const sn = `adhd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const baiduWs = new WebSocket(`wss://vop.baidu.com/realtime_asr?sn=${sn}`);

  let baiduOpen = false;
  let frontClosed = false;
  let baiduClosed = false;

  // 百度连接成功 → 发送 START 帧
  baiduWs.on('open', () => {
    baiduOpen = true;
    baiduWs.send(JSON.stringify({
      type: 'START',
      data: {
        appid: Number(appid),
        appkey: appkey,
        dev_pid: 15372,
        cuid: 'adhd-app-client',
        format: 'pcm',
        sample: 16000,
      },
    }));
  });

  // 收到百度返回 → 透传给前端
  baiduWs.on('message', (data) => {
    if (!frontClosed) {
      try {
        const msg = JSON.parse(data.toString());
        // 只转发 MID_TEXT（中间结果）和 FIN_TEXT（最终结果）
        if (msg.type === 'MID_TEXT' || msg.type === 'FIN_TEXT') {
          frontWs.send(JSON.stringify({
            type: msg.type,
            text: msg.result || '',
            isFinal: msg.type === 'FIN_TEXT',
          }));
        }
      } catch {
        // 忽略解析失败的消息
      }
    }
  });

  // 百度连接出错
  baiduWs.on('error', (err) => {
    console.error('baidu ws error:', err.message);
    if (!frontClosed) {
      frontWs.send(JSON.stringify({ type: 'ERROR', error: err.message }));
    }
    cleanup();
  });

  // 百度连接关闭
  baiduWs.on('close', () => {
    baiduClosed = true;
    if (!frontClosed) {
      frontWs.send(JSON.stringify({ type: 'END' }));
      frontWs.close();
    }
  });

  // 接收前端发来的数据（PCM 二进制帧 或 JSON 控制帧）
  frontWs.on('message', (data) => {
    if (Buffer.isBuffer(data)) {
      // 二进制帧 → PCM 音频数据，直接透传给百度
      if (baiduOpen && !baiduClosed) {
        baiduWs.send(data);
      }
    } else {
      // 文本帧 → 控制命令
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'FINISH') {
          // 前端说完了 → 发送结束帧给百度
          if (baiduOpen && !baiduClosed) {
            baiduWs.send(JSON.stringify({ type: 'FINISH' }));
          }
          // 留 3 秒等待百度返回最终结果
          setTimeout(() => cleanup(), 3000);
        } else if (msg.type === 'CANCEL') {
          if (baiduOpen && !baiduClosed) {
            baiduWs.send(JSON.stringify({ type: 'CANCEL' }));
          }
          cleanup();
        }
      } catch {
        // 忽略
      }
    }
  });

  // 前端断开
  frontWs.on('close', () => {
    frontClosed = true;
    cleanup();
  });

  frontWs.on('error', () => {
    frontClosed = true;
    cleanup();
  });

  function cleanup() {
    if (!baiduClosed) {
      try { baiduWs.close(); } catch {}
      baiduClosed = true;
    }
    if (!frontClosed) {
      try { frontWs.close(); } catch {}
      frontClosed = true;
    }
  }
}

module.exports = { handleSttWs };
