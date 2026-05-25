# Frontend Notes

FocusDock 包含两个 React + Vite 前端，它们共享同一个 Node.js 后端 API 和 WebSocket 设备通道。

## 应用

| 应用 | 目录 | 用途 | 默认端口 |
| --- | --- | --- | --- |
| 移动端 PWA | `software/frontend-mobile` | 主演示界面，适合手机竖屏使用 | `5173` |
| 桌面端 Demo | `software/frontend-web` | 横屏/桌面展示界面 | `5174` |

两个前端都会通过 Vite proxy 将 `/api` 和 `/ws` 转发到后端 `localhost:3001`。

## frontend-mobile

主要页面：

- `LaunchPage.tsx`：思绪输入、任务选择、硬件触发专注、倒计时、完成鼓励。
- `VinePage.tsx`：今日计划和任务列表。
- `AchievementPage.tsx`：专注统计、收藏图、成长展示。
- `SettingsPage.tsx`：设备状态和基础设置。

关键组件：

- `FullscreenCountdown.tsx`：硬件放置后进入的全屏专注倒计时。
- `EncourageModal.tsx`：任务完成后的鼓励弹窗。
- `TaskStickyNote.tsx`：任务卡片。
- `BottomNav.tsx`：底部导航。
- `OttoPet.tsx`：OTTO 水獭角色显示。

关键 hooks：

- `useDevice.ts`：连接 `/ws/app`，接收设备的 `start`、`stop`、`complete` 信号。
- `useSpeech.ts`：录音并调用后端语音转写接口。

本地数据：

- `src/db/index.ts` 使用 IndexedDB 保存任务、会话和统计。

## 硬件联动流程

1. 网页连接 `WS /ws/app`。
2. ESP32 连接 `WS /ws/device`。
3. 用户把手机放到 Dock 上，ESP32 发送 `{"sig":"start"}`。
4. 网页进入全屏状态，显示 Dock placed 和 25 分钟专注倒计时。
5. 用户完成当前小任务后触摸硬件，ESP32 发送 `{"sig":"complete"}`。
6. 网页标记小任务完成，生成鼓励语，并发送 `{"cmd":"congrats","message":"..."}` 给 ESP32。
7. 网页进入短休息或下一个任务。

## 运行

```bash
cd software/backend
npm install
cp .env.example .env
npm run start
```

```bash
cd software/frontend-mobile
npm install
npm run dev
```

```bash
cd software/frontend-web
npm install
npm run dev
```
