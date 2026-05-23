require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const rateLimit = require('express-rate-limit');
const { handleSttWs } = require('./ws/sttHandler');
const { handleAppWs, handleDeviceWs } = require('./ws/deviceHub');

const app = express();

app.use(cors());
app.use(express.json());

// LLM/STT 接口限流：每个 IP 每分钟最多 20 次
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
});
app.use('/api/organize', apiLimiter);
app.use('/api/encourage', apiLimiter);
app.use('/api/stt', apiLimiter);

// HTTP API 路由
app.use('/api/organize', require('./routes/organize'));
app.use('/api/encourage', require('./routes/encourage'));
app.use('/api/stt', require('./routes/stt'));

app.get('/health', (req, res) => res.json({ ok: true }));

// 托管前端构建产物（生产环境）
const distPath = path.join(__dirname, '../../frontend-mobile/dist');
app.use(express.static(distPath));
app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));

// 创建 HTTP 服务器，挂载 WebSocket
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// WebSocket 路由
server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);

  if (pathname === '/ws/stt') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleSttWs(ws);
    });
  } else if (pathname === '/ws/app') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleAppWs(ws);
    });
  } else if (pathname === '/ws/device') {
    // ESP32 必须携带设备密钥
    const params = new URL(request.url, `http://${request.headers.host}`).searchParams;
    if (params.get('secret') !== process.env.DEVICE_SECRET) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleDeviceWs(ws);
    });
  } else {
    socket.destroy();
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
