import { useState, useRef, useCallback } from 'react'

// Float32 (-1~1) 转 Int16 PCM
function float32ToInt16(samples: Float32Array): ArrayBuffer {
  const int16 = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return int16.buffer
}

// 简单线性重采样：fromRate → 16000
function resampleSimple(samples: Float32Array, fromRate: number): Float32Array {
  const ratio = fromRate / 16000
  const newLen = Math.floor(samples.length / ratio)
  const result = new Float32Array(newLen)
  for (let i = 0; i < newLen; i++) {
    const srcIdx = i * ratio
    const idx0 = Math.floor(srcIdx)
    const idx1 = Math.min(idx0 + 1, samples.length - 1)
    const frac = srcIdx - idx0
    result[i] = samples[idx0] * (1 - frac) + samples[idx1] * frac
  }
  return result
}

export function useSpeech() {
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const streamingTextRef = useRef('')

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sendIntervalRef = useRef<number | null>(null)
  const chunkQueueRef = useRef<Float32Array[]>([])
  const resolveRef = useRef<((v: string) => void) | null>(null)
  const finalizedRef = useRef('')
  // 防止竞态：当前录音是否应该继续
  const activeRef = useRef(false)

  // 同步 state 到 ref
  function updateStreamText(t: string) {
    streamingTextRef.current = t
    setStreamingText(t)
  }

  // 从队列取出 PCM 数据，定时通过 WebSocket 发送
  function startSending(ws: WebSocket, sourceRate: number) {
    sendIntervalRef.current = window.setInterval(() => {
      if (chunkQueueRef.current.length === 0) return

      const chunks = chunkQueueRef.current
      chunkQueueRef.current = []

      const totalLen = chunks.reduce((sum, c) => sum + c.length, 0)
      const combined = new Float32Array(totalLen)
      let offset = 0
      for (const c of chunks) {
        combined.set(c, offset)
        offset += c.length
      }

      const pcm = sourceRate !== 16000
        ? resampleSimple(combined, sourceRate)
        : combined

      const buffer = float32ToInt16(pcm)
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(buffer)
      }
    }, 160)
  }

  // 清空剩余队列数据并发送
  function flushRemaining(ws: WebSocket, sourceRate: number) {
    if (chunkQueueRef.current.length === 0) return
    const chunks = chunkQueueRef.current
    chunkQueueRef.current = []

    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0)
    const combined = new Float32Array(totalLen)
    let offset = 0
    for (const c of chunks) {
      combined.set(c, offset)
      offset += c.length
    }

    const pcm = sourceRate !== 16000
      ? resampleSimple(combined, sourceRate)
      : combined

    const buffer = float32ToInt16(pcm)
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(buffer)
    }
  }

  function cleanupAudio() {
    activeRef.current = false
    if (processorRef.current) {
      try { processorRef.current.disconnect() } catch {}
      processorRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (wsRef.current) {
      try { wsRef.current.close() } catch {}
      wsRef.current = null
    }
  }

  function finalize() {
    if (sendIntervalRef.current !== null) {
      clearInterval(sendIntervalRef.current)
      sendIntervalRef.current = null
    }
    cleanupAudio()

    const resolve = resolveRef.current
    if (resolve) {
      resolveRef.current = null
      // 优先用百度返回的 FIN_TEXT，其次用 streamingText
      const result = finalizedRef.current || streamingTextRef.current
      setRecording(false)
      setTranscribing(false)
      resolve(result)
    } else {
      // 即使没有 resolve，也要重置 UI 状态
      setRecording(false)
      setTranscribing(false)
    }
  }

  const startRecording = useCallback(async () => {
    // 防止重复启动
    if (activeRef.current) return
    activeRef.current = true
    updateStreamText('')
    finalizedRef.current = ''

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      activeRef.current = false
      alert('无法获取麦克风权限，请在浏览器设置中允许麦克风访问')
      return
    }
    // 如果在 getUserMedia 期间被取消了，立即释放资源
    if (!activeRef.current) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    streamRef.current = stream

    let audioContext: AudioContext
    try {
      audioContext = new AudioContext({ sampleRate: 16000 })
    } catch {
      audioContext = new AudioContext()
    }
    audioContextRef.current = audioContext

    // 再次检查是否被取消
    if (!activeRef.current) {
      cleanupAudio()
      return
    }

    const sourceRate = audioContext.sampleRate

    // 连接 WebSocket 到后端代理
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/stt`)
    wsRef.current = ws
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      if (!activeRef.current) {
        ws.close()
        return
      }
      startSending(ws, sourceRate)
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'MID_TEXT') {
          updateStreamText(msg.text || '')
        } else if (msg.type === 'FIN_TEXT') {
          updateStreamText(msg.text || '')
          finalizedRef.current = msg.text || ''
        } else if (msg.type === 'END') {
          ws.close()
        } else if (msg.type === 'ERROR') {
          console.error('stt ws error:', msg.error)
          alert(`语音识别失败：${msg.error}`)
          ws.close()
        }
      } catch {
        // 忽略
      }
    }

    ws.onclose = () => {
      finalize()
    }

    ws.onerror = () => {
      finalize()
    }

    // 最后一次检查
    if (!activeRef.current) {
      cleanupAudio()
      return
    }

    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor
    chunkQueueRef.current = []

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0)
      chunkQueueRef.current.push(new Float32Array(inputData))
    }

    source.connect(processor)
    processor.connect(audioContext.destination)
    setRecording(true)
  }, [])

  const stopRecording = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      // 标记录音结束，这会阻止 startRecording 中的竞态代码继续
      activeRef.current = false
      setTranscribing(true)

      const ws = wsRef.current
      const sourceRate = audioContextRef.current?.sampleRate || 16000

      // 停掉音频采集（不再有新数据入队）
      cleanupAudio()

      // 停止定时发送
      if (sendIntervalRef.current !== null) {
        clearInterval(sendIntervalRef.current)
        sendIntervalRef.current = null
      }

      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setRecording(false)
        setTranscribing(false)
        resolve(streamingTextRef.current)
        return
      }

      // 把队列里剩余的 PCM 发出去
      flushRemaining(ws, sourceRate)

      // 保存 resolve，等 ws.onclose 时调用
      resolveRef.current = resolve

      // 发送 FINISH 帧
      ws.send(JSON.stringify({ type: 'FINISH' }))
    })
  }, [])

  return { recording, transcribing, streamingText, startRecording, stopRecording }
}
