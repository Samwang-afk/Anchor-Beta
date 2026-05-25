import { useState, useRef, useCallback, useEffect } from 'react'

interface Props {
  onStartSignal?: () => void
  onStopSignal?:  () => void
  onCompleteSignal?: () => void
}

type DevicePayload = Record<string, unknown>

async function readMessageData(data: MessageEvent['data']): Promise<string> {
  if (typeof data === 'string') return data
  if (data instanceof Blob) return data.text()
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
  return String(data)
}

export function useDevice({ onStartSignal, onStopSignal, onCompleteSignal }: Props) {
  const [connected, setConnected] = useState(false)

  const wsRef         = useRef<WebSocket | null>(null)
  const onStartRef    = useRef(onStartSignal)
  const onStopRef     = useRef(onStopSignal)
  const onCompleteRef = useRef(onCompleteSignal)
  onStartRef.current    = onStartSignal
  onStopRef.current     = onStopSignal
  onCompleteRef.current = onCompleteSignal

  useEffect(() => {
    let destroyed = false
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url      = `${protocol}//${window.location.host}/ws/app`

    function connect() {
      if (destroyed) return
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onmessage = async (event) => {
        try {
          const raw = await readMessageData(event.data)
          const msg = JSON.parse(raw)
          if (msg.type === 'device_connected')    setConnected(true)
          if (msg.type === 'device_disconnected') setConnected(false)
          if (msg.sig  === 'start')    onStartRef.current?.()
          if (msg.sig  === 'stop')     onStopRef.current?.()
          if (msg.sig  === 'complete') onCompleteRef.current?.()
        } catch { /* ignore non-JSON */ }
      }

      ws.onclose = () => {
        setConnected(false)
        if (!destroyed) setTimeout(connect, 3000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      destroyed = true
      wsRef.current?.close()
    }
  }, [])

  const sendDeviceMessage = useCallback((payload: DevicePayload) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload))
    }
  }, [])

  const sendPlayMusic = useCallback(() => {
    sendDeviceMessage({ cmd: 'play' })
  }, [sendDeviceMessage])

  const simulateStart = useCallback(() => onStartRef.current?.(), [])
  const simulateStop  = useCallback(() => onStopRef.current?.(),  [])
  const simulateComplete = useCallback(() => onCompleteRef.current?.(), [])

  return { connected, sendDeviceMessage, sendPlayMusic, simulateStart, simulateStop, simulateComplete }
}
