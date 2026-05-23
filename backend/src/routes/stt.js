const express = require('express');
const WebSocket = require('ws');
const router = express.Router();

// 接收原始二进制 PCM 数据
router.post('/', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  const pcmBuffer = req.body;

  if (!Buffer.isBuffer(pcmBuffer) || pcmBuffer.length === 0) {
    return res.status(400).json({ error: 'audio data required' });
  }

  const appid = process.env.BAIDU_APPID;
  const appkey = process.env.BAIDU_APPKEY;

  if (!appid || !appkey) {
    console.error('stt error: Baidu credentials not configured');
    return res.status(500).json({ error: 'Baidu credentials not configured' });
  }

  const sn = `adhd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const text = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://vop.baidu.com/realtime_asr?sn=${sn}`);
      const results = [];
      const FRAME_SIZE = 5120; // 160ms × 16000Hz × 2bytes
      let offset = 0;
      let sendInterval;
      let closeTimeout;

      ws.on('open', () => {
        // 发送 START 帧（鉴权 + 参数）
        ws.send(JSON.stringify({
          type: 'START',
          data: {
            appid: Number(appid),
            appkey: appkey,
            dev_pid: 15372,        // 中文普通话 + 加强标点
            cuid: 'adhd-app-client',
            format: 'pcm',
            sample: 16000,
          },
        }));

        // 按 160ms 间隔发送 PCM 音频帧
        sendInterval = setInterval(() => {
          if (offset >= pcmBuffer.length) {
            clearInterval(sendInterval);
            // 发送结束帧
            ws.send(JSON.stringify({ type: 'FINISH' }));
            // 留 3 秒等待服务端返回最终结果后关闭
            closeTimeout = setTimeout(() => {
              ws.close();
            }, 3000);
            return;
          }
          const end = Math.min(offset + FRAME_SIZE, pcmBuffer.length);
          ws.send(pcmBuffer.subarray(offset, end));
          offset = end;
        }, 160);
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'FIN_TEXT' && msg.result) {
            results.push(msg.result);
          }
        } catch {
          // 忽略解析失败的消息
        }
      });

      ws.on('error', (err) => {
        clearInterval(sendInterval);
        clearTimeout(closeTimeout);
        reject(err);
      });

      ws.on('close', () => {
        clearInterval(sendInterval);
        clearTimeout(closeTimeout);
        resolve(results.join('') || '');
      });
    });

    res.json({ text });
  } catch (err) {
    console.error('stt error:', err.message);
    res.status(500).json({ error: 'STT request failed' });
  }
});

module.exports = router;
