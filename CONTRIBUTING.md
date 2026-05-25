# Contributing

FocusDock 目前是黑客松/演示项目。提交前请优先保证三件事：演示流程能跑通、硬件协议不破坏、仓库里没有真实密钥。

## 目录约定

- `software/frontend-mobile/`：主演示界面，移动端优先。
- `software/frontend-web/`：横屏或桌面演示界面。
- `software/backend/`：HTTP API、WebSocket 设备桥和语音转写接口。
- `hardware/micropython/`：ESP32 固件、VL53L0X 驱动和测试脚本。
- `docs/`：演示视频、截图、硬件说明和展示材料。

## 开发流程

1. 修改前先确认要改的是软件、硬件还是文档。
2. 前端改动后至少运行对应 Vite dev server，确认首页和硬件联动入口正常。
3. 后端改动后检查 `/health`、`/ws/app`、`/ws/device`。
4. 硬件改动后先用 `distjudge.py` 或 `vl53l0x_diag.py` 单独验证，再换成 `main_ws_fixed.py` 联调。
5. 提交前确认没有 `.env`、Wi-Fi 密码、服务器密码、真实 API Key、浏览器缓存或构建产物。

## 硬件协议

ESP32 发给后端：

```json
{"sig":"start"}
{"sig":"stop"}
{"sig":"complete"}
```

后端/网页发给 ESP32：

```json
{"cmd":"play"}
{"cmd":"congrats","message":"完成啦！"}
{"cmd":"rest","seconds":300}
```

新增字段要保持向后兼容。网页端应忽略未知字段，硬件端也应忽略未知命令。

## 发布检查

- README 中的演示视频和截图能打开。
- `software/backend/.env.example` 只包含占位值。
- `hardware/micropython/main_ws_fixed.py` 中 Wi-Fi 使用占位值。
- 没有提交 `node_modules/`、`dist/`、`.thonny_user/`、`__pycache__/`。
- License 保持非商业限制。
