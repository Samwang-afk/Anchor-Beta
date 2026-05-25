import { useState, useRef, useCallback, useEffect } from 'react'

interface Props {
  onStartSignal: () => void
  onStopSignal:  () => void
}

export function useDevice({ onStartSignal, onStopSignal }: Props) {
  const [connected, setConnected] = useState(false)

  const wsRef      = useRef<WebSocket | null>(null)
  const onStartRef = useRef(onStartSignal)
  const onStopRef  = useRef(onStopSignal)
  onStartRef.current = onStartSignal
  onStopRef.current  = onStopSignal

  useEffect(() => {
    let destroyed = false
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url      = `${protocol}//${window.location.host}/ws/app`

    function connect() {
      if (destroyed) return
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string)
          if (msg.type === 'device_connected')    setConnected(true)
          if (msg.type === 'device_disconnected') setConnected(false)
          if (msg.sig  === 'start') onStartRef.current()
          if (msg.sig  === 'stop')  onStopRef.current()
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

  const sendPlayMusic = useCallback(() => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ cmd: 'play' }))
    }
  }, [])

  const simulateStart = useCallback(() => onStartRef.current(), [])
  const simulateStop  = useCallback(() => onStopRef.current(),  [])

  return { connected, sendPlayMusic, simulateStart, simulateStop }
}
