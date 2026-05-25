let appWs = null
let deviceWs = null
let lastDeviceSig = null
let lastDeviceSigAt = 0

const REPLAY_START_MS = 10 * 60 * 1000

function wsText(data) {
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  return String(data)
}

function handleAppWs(ws) {
  if (appWs && appWs !== ws) appWs.close()
  appWs = ws
  console.log('[DeviceHub] App connected')
  if (deviceWs && deviceWs.readyState === 1) {
    ws.send(JSON.stringify({ type: 'device_connected' }))
    if (lastDeviceSig === 'start' && Date.now() - lastDeviceSigAt < REPLAY_START_MS) {
      console.log('[DeviceHub] Replay last start to App')
      ws.send(JSON.stringify({ sig: 'start', replay: true }))
    }
  }

  ws.on('message', (data) => {
    if (deviceWs && deviceWs.readyState === 1) {
      const text = wsText(data)
      console.log('[DeviceHub] App -> ESP32:', text)
      deviceWs.send(text)
    }
  })

  ws.on('close', () => {
    console.log('[DeviceHub] App disconnected')
    if (appWs === ws) appWs = null
  })
  ws.on('error', () => { if (appWs === ws) appWs = null })
}

function handleDeviceWs(ws) {
  deviceWs = ws
  console.log('[DeviceHub] ESP32 connected')
  if (appWs && appWs.readyState === 1) {
    appWs.send(JSON.stringify({ type: 'device_connected' }))
  }

  ws.on('message', (data) => {
    const text = wsText(data)
    try {
      const msg = JSON.parse(text)
      if (msg && typeof msg.sig === 'string') {
        lastDeviceSig = msg.sig
        lastDeviceSigAt = Date.now()
      }
    } catch {}

    if (appWs && appWs.readyState === 1) {
      console.log('[DeviceHub] ESP32 -> App:', text)
      appWs.send(text)
    } else {
      console.log('[DeviceHub] ESP32 -> App skipped, no App connected:', text)
    }
  })

  ws.on('close', () => {
    console.log('[DeviceHub] ESP32 disconnected')
    if (deviceWs === ws) deviceWs = null
    lastDeviceSig = null
    lastDeviceSigAt = 0
    if (appWs && appWs.readyState === 1) {
      appWs.send(JSON.stringify({ type: 'device_disconnected' }))
    }
  })

  ws.on('error', () => {
    if (deviceWs === ws) deviceWs = null
  })
}

module.exports = { handleAppWs, handleDeviceWs }
