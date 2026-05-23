let appWs     = null  // 前端连接
let deviceWs  = null  // ESP32 连接

function handleAppWs(ws) {
  appWs = ws
  // 告知前端当前设备状态
  if (deviceWs && deviceWs.readyState === 1) {
    ws.send(JSON.stringify({ type: 'device_connected' }))
  }

  // 前端 → ESP32
  ws.on('message', (data) => {
    if (deviceWs && deviceWs.readyState === 1) {
      deviceWs.send(data)
    }
  })

  ws.on('close', () => { if (appWs === ws) appWs = null })
  ws.on('error', () => { if (appWs === ws) appWs = null })
}

function handleDeviceWs(ws) {
  deviceWs = ws
  console.log('[DeviceHub] ESP32 已连接')

  // 通知前端设备上线
  if (appWs && appWs.readyState === 1) {
    appWs.send(JSON.stringify({ type: 'device_connected' }))
  }

  // ESP32 → 前端
  ws.on('message', (data) => {
    if (appWs && appWs.readyState === 1) {
      appWs.send(data)
    }
  })

  ws.on('close', () => {
    console.log('[DeviceHub] ESP32 已断开')
    if (deviceWs === ws) deviceWs = null
    if (appWs && appWs.readyState === 1) {
      appWs.send(JSON.stringify({ type: 'device_disconnected' }))
    }
  })

  ws.on('error', () => {
    if (deviceWs === ws) deviceWs = null
  })
}

module.exports = { handleAppWs, handleDeviceWs }
