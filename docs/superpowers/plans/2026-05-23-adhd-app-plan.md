# ADHD 执行督促 App — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个帮助 ADHD 用户克服启动困难的 PWA + 轻量后端 + ESP32C3 固件完整系统

**Architecture:** 前端 React+Vite PWA 负责 UI 和蓝牙通信，后端 Node.js+Express 代理所有 AI API 调用，ESP32C3 通过 BLE 收发指令控制蜂鸣器和检测轻拍。

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind CSS + IndexedDB (idb) | Node.js + Express + OpenAI SDK | Arduino (ESP32C3 + ArduinoBLE)

---

## 文件结构

```
adhd-app/
├── frontend/
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── public/
│   │   └── manifest.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── pages/
│       │   ├── LaunchPage.tsx        # 启动页（核心）
│       │   ├── VinePage.tsx          # 藤蔓生长轴
│       │   ├── AchievementPage.tsx   # 成就统计
│       │   └── SettingsPage.tsx      # 设置 + 商城占位
│       ├── components/
│       │   ├── BottomNav.tsx         # 底部4 tab导航
│       │   ├── TaskStickyNote.tsx    # 便签样式任务卡片
│       │   ├── CountdownTimer.tsx    # 倒计时组件
│       │   ├── EncourageModal.tsx    # 鼓励弹窗
│       │   ├── VineTimeline.tsx      # 单条藤蔓时间轴
│       │   └── CalendarHeatmap.tsx   # 日历热力图
│       ├── hooks/
│       │   ├── useBluetooth.ts       # Web Bluetooth 连接管理
│       │   └── useSpeech.ts          # Web Speech API 语音输入
│       ├── services/
│       │   └── api.ts                # 后端 API 调用封装
│       └── db/
│           └── index.ts              # IndexedDB schema + CRUD
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js                  # Express 入口
│       └── routes/
│           ├── organize.js           # POST /api/organize
│           ├── encourage.js          # POST /api/encourage
│           └── stt.js                # POST /api/stt
└── firmware/
    └── adhd_buzzer/
        └── adhd_buzzer.ino           # ESP32C3 BLE + 蜂鸣器 + 轻拍检测
```

---

## Phase 1: 项目脚手架

### Task 1: 后端初始化

**Files:**
- Create: `backend/package.json`
- Create: `backend/.env.example`
- Create: `backend/src/index.js`

- [ ] **Step 1: 初始化后端**

```bash
cd D:/STUDY/vibecoding/adhd-app
mkdir backend && cd backend
npm init -y
npm install express cors dotenv openai multer
npm install -D nodemon
```

- [ ] **Step 2: 创建 .env.example**

```
LLM_API_KEY=your_llm_api_key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
STT_API_KEY=your_stt_api_key
PORT=3001
```

复制一份为 `.env` 并填入真实 key。

- [ ] **Step 3: 创建 src/index.js**

```js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/organize', require('./routes/organize'));
app.use('/api/encourage', require('./routes/encourage'));
app.use('/api/stt', require('./routes/stt'));

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on ${PORT}`));
```

- [ ] **Step 4: 在 package.json 加启动脚本**

```json
"scripts": {
  "dev": "nodemon src/index.js",
  "start": "node src/index.js"
}
```

- [ ] **Step 5: 验证**

```bash
npm run dev
# 应看到: Backend running on 3001
curl http://localhost:3001/health
# 应返回: {"ok":true}
```

---

### Task 2: 前端初始化

**Files:**
- Create: `frontend/` (Vite 项目)

- [ ] **Step 1: 创建 Vite + React + TS 项目**

```bash
cd D:/STUDY/vibecoding/adhd-app
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install idb tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: 配置 Tailwind，修改 vite.config.ts**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 }
})
```

- [ ] **Step 3: 修改 src/index.css**

```css
@import "tailwindcss";
```

- [ ] **Step 4: 验证**

```bash
npm run dev
# 浏览器打开 http://localhost:5173，能看到 Vite+React 默认页
```

---

### Task 3: PWA 配置

**Files:**
- Create: `frontend/public/manifest.json`
- Modify: `frontend/index.html`
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: 安装 vite-plugin-pwa**

```bash
cd frontend
npm install -D vite-plugin-pwa
```

- [ ] **Step 2: 更新 vite.config.ts**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'ADHD 启动器',
        short_name: 'ADHD',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
  server: { port: 5173 }
})
```

- [ ] **Step 3: 放一张图标到 public/ 目录**

暂时用任意 192×192 和 512×512 的 PNG，命名为 `icon-192.png` 和 `icon-512.png`。

- [ ] **Step 4: 验证**

```bash
npm run build && npm run preview
# 用 Chrome 打开，DevTools → Application → Manifest 应能看到 PWA 配置
```

---

## Phase 2: 后端 API

### Task 4: /api/organize — 思绪整理

**Files:**
- Create: `backend/src/routes/organize.js`

- [ ] **Step 1: 创建 organize.js**

```js
const express = require('express');
const OpenAI = require('openai');
const router = express.Router();

const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL,
});

router.post('/', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  const completion = await client.chat.completions.create({
    model: process.env.LLM_MODEL,
    messages: [
      {
        role: 'system',
        content: `你是一个帮助ADHD用户的助手。用户会分享混乱的思绪。
请将其整理为3-5条极简可执行的最小动作（每条不超过15字）。
返回JSON格式：{"tasks": ["动作1", "动作2", ...]}`
      },
      { role: 'user', content: text }
    ],
    response_format: { type: 'json_object' }
  });

  const result = JSON.parse(completion.choices[0].message.content);
  res.json(result);
});

module.exports = router;
```

- [ ] **Step 2: 测试**

```bash
curl -X POST http://localhost:3001/api/organize \
  -H "Content-Type: application/json" \
  -d '{"text":"我有好多事情要做，作业没写，还要发邮件，脑子一团乱"}'
# 应返回: {"tasks": ["打开作业本写第一题", "写邮件标题", ...]}
```

---

### Task 5: /api/encourage — 鼓励语生成

**Files:**
- Create: `backend/src/routes/encourage.js`

- [ ] **Step 1: 创建 encourage.js**

```js
const express = require('express');
const OpenAI = require('openai');
const router = express.Router();

const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL,
});

router.post('/', async (req, res) => {
  const { task, duration } = req.body;

  const completion = await client.chat.completions.create({
    model: process.env.LLM_MODEL,
    messages: [
      {
        role: 'system',
        content: `你是一个充满感染力的ADHD教练。用户刚完成了一个任务，给出一句极具感染力的鼓励（不超过30字），要有力量感，像在欢呼！`
      },
      { role: 'user', content: `完成任务：${task}，用时：${duration}秒` }
    ]
  });

  res.json({ message: completion.choices[0].message.content });
});

module.exports = router;
```

- [ ] **Step 2: 测试**

```bash
curl -X POST http://localhost:3001/api/encourage \
  -H "Content-Type: application/json" \
  -d '{"task":"打开作业本写第一题","duration":300}'
# 应返回有感染力的鼓励语
```

---

### Task 6: /api/stt — 语音转文字

**Files:**
- Create: `backend/src/routes/stt.js`

- [ ] **Step 1: 创建 stt.js**

```js
const express = require('express');
const OpenAI = require('openai');
const multer = require('multer');
const fs = require('fs');
const router = express.Router();
const upload = multer({ dest: 'uploads/' });

const client = new OpenAI({
  apiKey: process.env.STT_API_KEY,
  baseURL: process.env.LLM_BASE_URL,
});

router.post('/', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'audio file required' });

  try {
    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: 'whisper-1',
      language: 'zh',
    });
    res.json({ text: transcription.text });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

module.exports = router;
```

- [ ] **Step 2: 确保 uploads/ 目录存在**

```bash
mkdir -p backend/uploads
```

- [ ] **Step 3: 验证（有音频文件时）**

```bash
curl -X POST http://localhost:3001/api/stt \
  -F "audio=@test.webm"
# 应返回: {"text": "转写的文字"}
```

---

## Phase 3: 前端数据层 + 骨架

### Task 7: IndexedDB 数据层

**Files:**
- Create: `frontend/src/db/index.ts`

- [ ] **Step 1: 创建 db/index.ts**

```ts
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface Task {
  id?: number;
  category_id: number;
  content: string;
  started_at: number;
  completed_at?: number;
  duration_seconds?: number;
}

interface Category {
  id?: number;
  name: string;
  color: string;
}

interface Stats {
  id: 1;
  total_focus_seconds: number;
  total_starts: number;
  total_completions: number;
  points: number;
}

interface AppDB extends DBSchema {
  tasks: { key: number; value: Task; indexes: { by_category: number } };
  categories: { key: number; value: Category };
  stats: { key: number; value: Stats };
}

let db: IDBPDatabase<AppDB>;

export async function getDB() {
  if (db) return db;
  db = await openDB<AppDB>('adhd-app', 1, {
    upgrade(db) {
      const tasks = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
      tasks.createIndex('by_category', 'category_id');
      db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
      db.createObjectStore('stats', { keyPath: 'id' });
    },
  });
  return db;
}

export async function getStats(): Promise<Stats> {
  const db = await getDB();
  return (await db.get('stats', 1)) ?? {
    id: 1, total_focus_seconds: 0, total_starts: 0, total_completions: 0, points: 0
  };
}

export async function addTask(task: Omit<Task, 'id'>): Promise<number> {
  const db = await getDB();
  return db.add('tasks', task);
}

export async function completeTask(id: number, duration_seconds: number) {
  const db = await getDB();
  const task = await db.get('tasks', id);
  if (!task) return;
  await db.put('tasks', { ...task, completed_at: Date.now(), duration_seconds });
  const stats = await getStats();
  await db.put('stats', {
    ...stats,
    total_focus_seconds: stats.total_focus_seconds + duration_seconds,
    total_completions: stats.total_completions + 1,
    points: stats.points + Math.floor(duration_seconds / 60) + 10,
  });
}

export async function incrementStarts() {
  const db = await getDB();
  const stats = await getStats();
  await db.put('stats', { ...stats, total_starts: stats.total_starts + 1 });
}

export async function getTasksByCategory(category_id: number): Promise<Task[]> {
  const db = await getDB();
  return db.getAllFromIndex('tasks', 'by_category', category_id);
}

export async function getCategories(): Promise<Category[]> {
  const db = await getDB();
  return db.getAll('categories');
}

export async function addCategory(name: string, color: string): Promise<number> {
  const db = await getDB();
  return db.add('categories', { name, color });
}

export async function getAllTasks(): Promise<Task[]> {
  const db = await getDB();
  return db.getAll('tasks');
}
```

- [ ] **Step 2: 验证编译**

```bash
cd frontend && npx tsc --noEmit
# 应无报错
```

---

### Task 8: App 骨架 + 底部导航

**Files:**
- Create: `frontend/src/components/BottomNav.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 创建 BottomNav.tsx**

```tsx
type Tab = 'launch' | 'vine' | 'achievement' | 'settings';

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
}

export function BottomNav({ active, onChange }: Props) {
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'launch', label: '启动', icon: '⚡' },
    { id: 'vine', label: '藤蔓', icon: '🌿' },
    { id: 'achievement', label: '成就', icon: '🏆' },
    { id: 'settings', label: '设置', icon: '⚙️' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#1a1a2e] border-t border-white/10 flex">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 flex flex-col items-center py-3 text-xs gap-1 transition-colors
            ${active === t.id ? 'text-violet-400' : 'text-white/40'}`}
        >
          <span className="text-xl">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: 修改 App.tsx**

```tsx
import { useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { LaunchPage } from './pages/LaunchPage';
import { VinePage } from './pages/VinePage';
import { AchievementPage } from './pages/AchievementPage';
import { SettingsPage } from './pages/SettingsPage';

type Tab = 'launch' | 'vine' | 'achievement' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('launch');

  const pages: Record<Tab, JSX.Element> = {
    launch: <LaunchPage />,
    vine: <VinePage />,
    achievement: <AchievementPage />,
    settings: <SettingsPage />,
  };

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white max-w-md mx-auto relative">
      <div className="pb-20">{pages[tab]}</div>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
```

- [ ] **Step 3: 创建四个页面占位文件**

```tsx
// src/pages/LaunchPage.tsx
export function LaunchPage() { return <div className="p-4">启动页</div>; }

// src/pages/VinePage.tsx
export function VinePage() { return <div className="p-4">藤蔓页</div>; }

// src/pages/AchievementPage.tsx
export function AchievementPage() { return <div className="p-4">成就页</div>; }

// src/pages/SettingsPage.tsx
export function SettingsPage() { return <div className="p-4">设置页</div>; }
```

- [ ] **Step 4: 验证**

```bash
npm run dev
# 浏览器应看到底部4个 tab 可以点击切换
```

---

## Phase 4: 启动页（核心功能）

### Task 9: 后端 API 服务层

**Files:**
- Create: `frontend/src/services/api.ts`

- [ ] **Step 1: 创建 api.ts**

```ts
const BASE = 'http://localhost:3001';

export async function organizeThoughts(text: string): Promise<string[]> {
  const res = await fetch(`${BASE}/api/organize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  return data.tasks ?? [];
}

export async function getEncouragement(task: string, duration: number): Promise<string> {
  const res = await fetch(`${BASE}/api/encourage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, duration }),
  });
  const data = await res.json();
  return data.message ?? '太棒了！';
}

export async function transcribeAudio(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append('audio', blob, 'recording.webm');
  const res = await fetch(`${BASE}/api/stt`, { method: 'POST', body: form });
  const data = await res.json();
  return data.text ?? '';
}
```

---

### Task 10: TaskStickyNote 便签组件

**Files:**
- Create: `frontend/src/components/TaskStickyNote.tsx`

- [ ] **Step 1: 创建 TaskStickyNote.tsx**

```tsx
interface Props {
  task: string;
  selected: boolean;
  onClick: () => void;
  color?: string;
}

const colors = [
  'bg-yellow-200 text-yellow-900',
  'bg-green-200 text-green-900',
  'bg-pink-200 text-pink-900',
  'bg-blue-200 text-blue-900',
  'bg-orange-200 text-orange-900',
];

export function TaskStickyNote({ task, selected, onClick, color }: Props) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left p-4 rounded shadow-md font-medium text-sm
        transition-all duration-200 border-2
        ${color ?? colors[0]}
        ${selected
          ? 'border-violet-500 scale-105 shadow-violet-400/40 shadow-lg'
          : 'border-transparent hover:scale-102'}
      `}
      style={{ fontFamily: 'cursive', transform: selected ? 'rotate(0deg)' : `rotate(${Math.random() * 2 - 1}deg)` }}
    >
      {selected && <span className="mr-2">✓</span>}
      {task}
    </button>
  );
}
```

---

### Task 11: useSpeech — 语音输入 hook

**Files:**
- Create: `frontend/src/hooks/useSpeech.ts`

- [ ] **Step 1: 创建 useSpeech.ts**

```ts
import { useState, useRef } from 'react';
import { transcribeAudio } from '../services/api';

export function useSpeech() {
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    chunksRef.current = [];
    mr.ondataavailable = e => chunksRef.current.push(e.data);
    mr.start();
    mediaRef.current = mr;
    setRecording(true);
  }

  async function stopRecording(): Promise<string> {
    return new Promise(resolve => {
      const mr = mediaRef.current;
      if (!mr) return resolve('');
      mr.onstop = async () => {
        setLoading(true);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const text = await transcribeAudio(blob);
        setLoading(false);
        resolve(text);
      };
      mr.stop();
      mr.stream.getTracks().forEach(t => t.stop());
      setRecording(false);
    });
  }

  return { recording, loading, startRecording, stopRecording };
}
```

---

### Task 12: CountdownTimer 组件

**Files:**
- Create: `frontend/src/components/CountdownTimer.tsx`

- [ ] **Step 1: 创建 CountdownTimer.tsx**

```tsx
import { useEffect, useState } from 'react';

interface Props {
  onComplete: (seconds: number) => void;
  onTick?: (elapsed: number) => void;
}

export function CountdownTimer({ onComplete, onTick }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setElapsed(e => {
        const next = e + 1;
        onTick?.(next);
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  function fmt(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-7xl font-mono font-bold text-violet-300">{fmt(elapsed)}</div>
      <p className="text-white/50 text-sm">轻拍设备完成任务</p>
      <button
        onClick={() => { setRunning(false); onComplete(elapsed); }}
        className="px-6 py-2 bg-white/10 rounded-full text-sm text-white/70"
      >
        手动完成
      </button>
    </div>
  );
}
```

---

### Task 13: useBluetooth — 蓝牙 hook

**Files:**
- Create: `frontend/src/hooks/useBluetooth.ts`

- [ ] **Step 1: 创建 useBluetooth.ts**

```ts
import { useState, useRef } from 'react';

// ESP32C3 固件中定义的 UUID（与固件保持一致）
const SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
const BUZZER_CHAR_UUID = '12345678-1234-1234-1234-123456789ab1';
const TAP_CHAR_UUID = '12345678-1234-1234-1234-123456789ab2';

export function useBluetooth(onTap: () => void) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const buzzerCharRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

  async function connect() {
    setConnecting(true);
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'ADHD-Buzzer' }],
        optionalServices: [SERVICE_UUID],
      });
      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);

      buzzerCharRef.current = await service.getCharacteristic(BUZZER_CHAR_UUID);

      const tapChar = await service.getCharacteristic(TAP_CHAR_UUID);
      await tapChar.startNotifications();
      tapChar.addEventListener('characteristicvaluechanged', () => onTap());

      device.addEventListener('gattserverdisconnected', () => setConnected(false));
      setConnected(true);
    } catch (e) {
      console.error('BLE connect failed', e);
    } finally {
      setConnecting(false);
    }
  }

  async function ringBuzzer() {
    if (!buzzerCharRef.current) return;
    await buzzerCharRef.current.writeValue(new Uint8Array([1]));
  }

  return { connected, connecting, connect, ringBuzzer };
}
```

---

### Task 14: LaunchPage — 完整实现

**Files:**
- Modify: `frontend/src/pages/LaunchPage.tsx`
- Create: `frontend/src/components/EncourageModal.tsx`

- [ ] **Step 1: 创建 EncourageModal.tsx**

```tsx
interface Props {
  message: string;
  points: number;
  onClose: () => void;
}

export function EncourageModal({ message, points, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1a2e] border border-violet-500/40 rounded-2xl p-8 mx-6 text-center shadow-2xl shadow-violet-500/20 animate-bounce-in">
        <div className="text-5xl mb-4">🎉</div>
        <p className="text-xl font-bold text-white leading-relaxed">{message}</p>
        <p className="mt-4 text-violet-400 text-sm">+{points} 积分</p>
        <button
          onClick={onClose}
          className="mt-6 w-full py-3 bg-violet-600 hover:bg-violet-500 rounded-xl text-white font-bold transition-colors"
        >
          继续！
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 实现完整 LaunchPage.tsx**

```tsx
import { useState } from 'react';
import { organizeThoughts, getEncouragement } from '../services/api';
import { useSpeech } from '../hooks/useSpeech';
import { useBluetooth } from '../hooks/useBluetooth';
import { TaskStickyNote } from '../components/TaskStickyNote';
import { CountdownTimer } from '../components/CountdownTimer';
import { EncourageModal } from '../components/EncourageModal';
import { addTask, completeTask, incrementStarts } from '../db';

type Phase = 'input' | 'tasks' | 'countdown' | 'done';

const NOTE_COLORS = [
  'bg-yellow-200 text-yellow-900',
  'bg-green-200 text-green-900',
  'bg-pink-200 text-pink-900',
  'bg-blue-200 text-blue-900',
  'bg-orange-200 text-orange-900',
];

export function LaunchPage() {
  const [phase, setPhase] = useState<Phase>('input');
  const [text, setText] = useState('');
  const [tasks, setTasks] = useState<string[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [encourage, setEncourage] = useState<{ message: string; points: number } | null>(null);

  const { recording, startRecording, stopRecording } = useSpeech();

  const { connected, connecting, connect, ringBuzzer } = useBluetooth(async () => {
    // 用户轻拍设备 → 任务完成
    if (phase === 'countdown') handleComplete(0);
  });

  async function handleOrganize() {
    if (!text.trim()) return;
    setLoading(true);
    const result = await organizeThoughts(text);
    setTasks(result);
    setLoading(false);
    setPhase('tasks');
  }

  async function handleStart() {
    if (selected === null) return;
    const id = await addTask({
      category_id: 1,
      content: tasks[selected],
      started_at: Date.now(),
    });
    await incrementStarts();
    setTaskId(id);
    await ringBuzzer();
    setPhase('countdown');
  }

  async function handleComplete(duration: number) {
    if (taskId === null) return;
    await completeTask(taskId, duration);
    const msg = await getEncouragement(tasks[selected!], duration);
    const points = Math.floor(duration / 60) + 10;
    setEncourage({ message: msg, points });
    setPhase('done');
  }

  function reset() {
    setPhase('input');
    setText('');
    setTasks([]);
    setSelected(null);
    setEncourage(null);
    setTaskId(null);
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] p-4 flex flex-col">
      {/* 蓝牙状态栏 */}
      <div className="flex justify-end mb-4">
        <button
          onClick={connect}
          disabled={connecting}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            connected ? 'border-green-500 text-green-400' : 'border-white/20 text-white/40'
          }`}
        >
          {connecting ? '连接中…' : connected ? '● 已连接' : '○ 连接设备'}
        </button>
      </div>

      {phase === 'input' && (
        <div className="flex flex-col gap-4 flex-1">
          <h1 className="text-2xl font-bold text-white">说出你的烦恼</h1>
          <textarea
            className="flex-1 bg-white/5 border border-white/10 rounded-xl p-4 text-white resize-none min-h-[200px] focus:outline-none focus:border-violet-500"
            placeholder="把脑子里的一切倒出来…"
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div className="flex gap-3">
            <button
              onPointerDown={startRecording}
              onPointerUp={async () => { const t = await stopRecording(); setText(prev => prev + t); }}
              className={`flex-1 py-4 rounded-xl font-bold transition-colors ${
                recording ? 'bg-red-500 text-white' : 'bg-white/10 text-white'
              }`}
            >
              {recording ? '🔴 录音中…' : '🎙️ 按住说话'}
            </button>
            <button
              onClick={handleOrganize}
              disabled={loading || !text.trim()}
              className="flex-1 py-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-xl font-bold text-white transition-colors"
            >
              {loading ? '整理中…' : '整理思绪 →'}
            </button>
          </div>
        </div>
      )}

      {phase === 'tasks' && (
        <div className="flex flex-col gap-4 flex-1">
          <h2 className="text-xl font-bold text-white">选一个现在就能做的</h2>
          <div className="flex flex-col gap-3 flex-1">
            {tasks.map((t, i) => (
              <TaskStickyNote
                key={i}
                task={t}
                selected={selected === i}
                onClick={() => setSelected(i)}
                color={NOTE_COLORS[i % NOTE_COLORS.length]}
              />
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setPhase('input')} className="px-4 py-4 bg-white/10 rounded-xl text-white">
              ← 重新输入
            </button>
            <button
              onClick={handleStart}
              disabled={selected === null}
              className="flex-1 py-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-xl font-bold text-white transition-colors"
            >
              🚀 开始！
            </button>
          </div>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-6">
          <div className="text-center bg-yellow-200 text-yellow-900 rounded-xl p-4 w-full font-medium">
            {tasks[selected!]}
          </div>
          <CountdownTimer
            onComplete={handleComplete}
            onTick={() => {}}
          />
        </div>
      )}

      {phase === 'done' && !encourage && (
        <div className="flex items-center justify-center flex-1">
          <p className="text-white/50">加载鼓励中…</p>
        </div>
      )}

      {encourage && (
        <EncourageModal
          message={encourage.message}
          points={encourage.points}
          onClose={reset}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: 验证**

```bash
# 前端 + 后端都启动
# 在浏览器中：输入文字 → 点"整理思绪" → 看到便签 → 选择 → 点"开始！" → 倒计时
# 点"手动完成" → 看到鼓励弹窗
```

---

## Phase 5: 藤蔓页

### Task 15: VinePage + VineTimeline

**Files:**
- Create: `frontend/src/components/VineTimeline.tsx`
- Modify: `frontend/src/pages/VinePage.tsx`

- [ ] **Step 1: 创建 VineTimeline.tsx**

```tsx
interface VineNode {
  id: number;
  completed_at: number;
  duration_seconds: number;
  content: string;
}

interface Props {
  nodes: VineNode[];
  color: string;
}

export function VineTimeline({ nodes, color }: Props) {
  if (nodes.length === 0) {
    return <p className="text-white/30 text-center py-8 text-sm">还没有记录，开始你的第一次！</p>;
  }

  return (
    <div className="relative flex flex-col items-center gap-0">
      {nodes.map((node, i) => (
        <div key={node.id} className="flex flex-col items-center w-full">
          {/* 藤蔓连线 */}
          {i > 0 && (
            <div className="w-1 h-8 rounded-full" style={{ backgroundColor: color, opacity: 0.4 }} />
          )}
          {/* 节点 */}
          <div className="flex items-center gap-3 w-full px-4">
            <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <div className="flex-1 bg-white/5 rounded-xl p-3 border border-white/10">
              <p className="text-white text-sm">{node.content}</p>
              <p className="text-white/40 text-xs mt-1">
                {new Date(node.completed_at).toLocaleDateString('zh')}
                {' · '}
                {Math.round(node.duration_seconds / 60)} 分钟
              </p>
            </div>
          </div>
        </div>
      ))}
      {/* 生长顶端 */}
      <div className="w-1 h-8 rounded-full" style={{ backgroundColor: color, opacity: 0.2 }} />
      <div className="text-2xl">🌱</div>
    </div>
  );
}
```

- [ ] **Step 2: 实现 VinePage.tsx**

```tsx
import { useEffect, useState } from 'react';
import { getCategories, getTasksByCategory, addCategory } from '../db';
import { VineTimeline } from '../components/VineTimeline';

const PALETTE = ['#7c3aed', '#059669', '#dc2626', '#2563eb', '#d97706'];

export function VinePage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    getCategories().then(cats => {
      setCategories(cats);
      if (cats.length > 0) setActive(cats[0].id);
    });
  }, []);

  useEffect(() => {
    if (active === null) return;
    getTasksByCategory(active).then(tasks =>
      setNodes(tasks.filter(t => t.completed_at).sort((a, b) => a.completed_at! - b.completed_at!))
    );
  }, [active]);

  async function handleAdd() {
    if (!newName.trim()) return;
    const color = PALETTE[categories.length % PALETTE.length];
    const id = await addCategory(newName.trim(), color);
    const updated = [...categories, { id, name: newName.trim(), color }];
    setCategories(updated);
    setActive(id);
    setNewName('');
  }

  const activeCategory = categories.find(c => c.id === active);

  return (
    <div className="p-4 flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-white">我的藤蔓</h1>

      {/* 分类 tab */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map(c => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              active === c.id ? 'text-white' : 'bg-white/10 text-white/50'
            }`}
            style={active === c.id ? { backgroundColor: c.color } : {}}
          >
            {c.name}
          </button>
        ))}
        <div className="flex gap-1 flex-shrink-0">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="新类别"
            className="bg-white/10 rounded-full px-3 py-2 text-sm text-white w-20 focus:outline-none"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button onClick={handleAdd} className="bg-white/10 rounded-full px-3 py-2 text-white text-sm">+</button>
        </div>
      </div>

      {/* 藤蔓时间轴 */}
      {activeCategory && (
        <VineTimeline nodes={nodes} color={activeCategory.color} />
      )}
      {categories.length === 0 && (
        <p className="text-white/40 text-center py-12">先创建一个类别，比如"学习"、"运动"</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 验证**

```bash
# 打开藤蔓页 → 输入新类别名 → 按回车 → 看到新类别 tab
# 完成一个任务后切到此页，应看到节点
```

---

## Phase 6: 成就页 + 设置页

### Task 16: AchievementPage

**Files:**
- Modify: `frontend/src/pages/AchievementPage.tsx`

- [ ] **Step 1: 实现 AchievementPage.tsx**

```tsx
import { useEffect, useState } from 'react';
import { getStats, getAllTasks } from '../db';

export function AchievementPage() {
  const [stats, setStats] = useState<any>(null);
  const [heatmap, setHeatmap] = useState<Record<string, number>>({});

  useEffect(() => {
    getStats().then(setStats);
    getAllTasks().then(tasks => {
      const map: Record<string, number> = {};
      tasks.filter(t => t.completed_at).forEach(t => {
        const day = new Date(t.completed_at!).toISOString().slice(0, 10);
        map[day] = (map[day] ?? 0) + 1;
      });
      setHeatmap(map);
    });
  }, []);

  // 生成最近 7 周的日历格子
  const days: string[] = [];
  for (let i = 48; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  function fmtTime(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}小时${m}分` : `${m}分钟`;
  }

  return (
    <div className="p-4 flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-white">成就</h1>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: '专注时长', value: fmtTime(stats.total_focus_seconds) },
            { label: '开始次数', value: `${stats.total_starts}次` },
            { label: '完成次数', value: `${stats.total_completions}次` },
          ].map(s => (
            <div key={s.label} className="bg-white/5 rounded-xl p-4 text-center border border-white/10">
              <p className="text-2xl font-bold text-violet-400">{s.value}</p>
              <p className="text-white/50 text-xs mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div>
        <p className="text-white/50 text-sm mb-3">最近7周活跃记录</p>
        <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {days.map(d => {
            const count = heatmap[d] ?? 0;
            const opacity = count === 0 ? 0.08 : Math.min(0.2 + count * 0.2, 1);
            return (
              <div
                key={d}
                className="aspect-square rounded-sm"
                style={{ backgroundColor: `rgba(124, 58, 237, ${opacity})` }}
                title={`${d}: ${count}次`}
              />
            );
          })}
        </div>
      </div>

      {stats && (
        <div className="bg-violet-900/30 border border-violet-500/20 rounded-xl p-4 text-center">
          <p className="text-violet-300 text-sm">当前积分</p>
          <p className="text-4xl font-bold text-violet-400 mt-1">{stats.points}</p>
        </div>
      )}
    </div>
  );
}
```

---

### Task 17: SettingsPage

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: 实现 SettingsPage.tsx**

```tsx
import { useEffect, useState } from 'react';
import { getStats } from '../db';
import { useBluetooth } from '../hooks/useBluetooth';

export function SettingsPage() {
  const [stats, setStats] = useState<any>(null);
  const [showShop, setShowShop] = useState(false);
  const { connected, connecting, connect } = useBluetooth(() => {});

  useEffect(() => { getStats().then(setStats); }, []);

  const shopItems = [
    { name: '手冲咖啡一杯', points: 200, emoji: '☕' },
    { name: '贴纸一套', points: 150, emoji: '🎨' },
    { name: '休息30分钟', points: 100, emoji: '😴' },
  ];

  return (
    <div className="p-4 flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-white">设置</h1>

      {/* 蓝牙连接 */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <p className="text-white font-medium mb-3">硬件连接</p>
        <button
          onClick={connect}
          disabled={connecting || connected}
          className={`w-full py-3 rounded-xl font-bold transition-colors ${
            connected ? 'bg-green-600/30 text-green-400 border border-green-500/30'
            : 'bg-violet-600 hover:bg-violet-500 text-white'
          }`}
        >
          {connecting ? '连接中…' : connected ? '✓ 设备已连接' : '连接 ADHD 蜂鸣器'}
        </button>
      </div>

      {/* 积分 + 商城 */}
      {stats && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <p className="text-white font-medium">我的积分</p>
            <p className="text-2xl font-bold text-violet-400">{stats.points}</p>
          </div>
          <button
            onClick={() => setShowShop(true)}
            className="w-full py-3 bg-white/10 hover:bg-white/15 rounded-xl text-white transition-colors"
          >
            🛍️ 进入积分商城
          </button>
        </div>
      )}

      {/* 商城弹窗 */}
      {showShop && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end">
          <div className="bg-[#1a1a2e] rounded-t-2xl w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <p className="text-white font-bold text-lg">积分商城</p>
              <button onClick={() => setShowShop(false)} className="text-white/40">✕</button>
            </div>
            <div className="flex flex-col gap-3">
              {shopItems.map(item => (
                <div key={item.name} className="flex items-center gap-4 bg-white/5 rounded-xl p-4">
                  <span className="text-3xl">{item.emoji}</span>
                  <div className="flex-1">
                    <p className="text-white font-medium">{item.name}</p>
                    <p className="text-violet-400 text-sm">{item.points} 积分</p>
                  </div>
                  <button
                    onClick={() => alert('敬请期待！')}
                    className="px-4 py-2 bg-violet-600/40 text-violet-300 rounded-lg text-sm"
                  >
                    兑换
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Phase 7: 联调

### Task 18: 端到端联调（固件由硬件同学负责，BLE 通信代码在 useBluetooth.ts）

- [ ] **Step 1: 同时启动前后端**

```bash
# 终端1
cd backend && npm run dev

# 终端2
cd frontend && npm run dev
```

- [ ] **Step 2: 完整流程验证**

1. 浏览器打开 `http://localhost:5173`
2. 设置页 → 连接蓝牙设备 → 看到"设备已连接"
3. 启动页 → 输入文字 → 点"整理思绪" → 看到便签
4. 选一张便签 → 点"开始！" → 蜂鸣器响三声 → 倒计时开始
5. 轻拍硬件 → 鼓励弹窗弹出 → 积分增加
6. 切到藤蔓页 → 看到节点生长
7. 切到成就页 → 看到统计数据更新

- [ ] **Step 3: PWA 安装测试**

```bash
cd frontend && npm run build && npm run preview
# Chrome → 地址栏右侧"安装"按钮 → 添加到桌面
# 以 app 模式打开，验证竖屏锁定
```

---

*计划完成。共 19 个任务，覆盖后端 API、前端四页面、硬件固件、端到端联调。*
