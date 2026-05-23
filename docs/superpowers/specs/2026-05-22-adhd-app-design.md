# ADHD 执行督促 App — 设计文档

## 概述

一个帮助 ADHD 用户克服启动困难、维持执行动力的 PWA 应用，联动 ESP32C3 硬件设备。

## 核心功能

### 1. 启动督促（启动页）
- 用户语音或文字输入混乱思绪
- 后端调用 AI 整理成 3-5 条最小可执行动作
- AI 返回的 3-5 条任务以**便签样式**展示（纸质质感卡片，可点击选中）
- 用户选择任务点击"开始" → 倒计时 + 蓝牙指令触发 ESP32C3 蜂鸣器
- 用户轻拍硬件 → ESP32C3 发 BLE 信号回网页 → AI 生成鼓励语以**弹窗形式**弹出 + 积分奖励

### 2. 藤蔓生长轴（记录页）
- 每个任务类别（用户自定义）一条独立竖向时间轴
- 每次完成任务后，该类别的藤蔓往上长出一个节点
- 节点显示：完成时间、专注时长

### 3. 成就页
- 总专注时长、总开始次数、总完成次数
- 日历热力图
- 当前积分

### 4. 设置页
- 蓝牙设备配对
- 积分余额 + 商城入口（占位展示，点击显示"敬请期待"）

## 技术架构

### 前端
- React + Vite，PWA，竖屏锁定
- Web Speech API（浏览器原生语音采集）
- Web Bluetooth API（连接 ESP32C3）
- IndexedDB（本地数据持久化）
- 底部4 tab导航：启动 / 藤蔓 / 成就 / 设置

### 后端
- Node.js + Express，轻量 API 代理
- `POST /api/stt` — 音频 → 语音转文字 API → 文本
- `POST /api/organize` — 混乱文本 → 语言模型 → 可执行任务列表
- `POST /api/encourage` — 完成任务信息 → 语言模型 → 鼓励语
- API keys 存 `.env`，不暴露给前端

### ESP32C3 固件
- BLE GATT 服务
- 接收"响铃"指令 → 触发蜂鸣器
- 检测轻拍（触摸引脚/加速度传感器）→ BLE Notify 通知网页

## 数据模型（IndexedDB）

### tasks
- id, category_id, content, ai_summary, started_at, completed_at, duration_seconds

### categories
- id, name, color

### stats（聚合缓存）
- total_focus_seconds, total_starts, total_completions, points

## 不在范围内
- 用户账号系统（纯本地）
- 真实商城交易
- 多设备数据同步
