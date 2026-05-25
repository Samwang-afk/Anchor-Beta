import { useState, useRef, useCallback } from 'react'

function float32ToInt16(samples: Float32Array): ArrayBuffer {
  const int16 = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return int16.buffer
}

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

export function useSpeech(onTranscribed?: (text: string) => void) {
  const [recording, setRecording]       = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const streamingTextRef  = useRef('')
  const onTranscribedRef  = useRef(onTranscribed)
  onTranscribedRef.current = onTranscribed

  const wsRef           = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef    = useRef<ScriptProcessorNode | null>(null)
  const streamRef       = useRef<MediaStream | null>(null)
  const sendIntervalRef = useRef<number | null>(null)
  const chunkQueueRef   = useRef<Float32Array[]>([])
  const resolveRef      = useRef<((v: string) => void) | null>(null)
  const finalizedRef    = useRef('')
  const activeRef       = useRef(false)
  const sourceRateRef   = useRef(16000)

  function updateStreamText(t: string) {
    streamingTextRef.current = t
    setStreamingText(t)
  }

  function startSending(ws: WebSocket, sourceRate: number) {
    sendIntervalRef.current = window.setInterval(() => {
      if (chunkQueueRef.current.length === 0) return
      const chunks = chunkQueueRef.current
      chunkQueueRef.current = []
      const totalLen = chunks.reduce((sum, c) => sum + c.length, 0)
      const combined = new Float32Array(totalLen)
      let offset = 0
      for (const c of chunks) { combined.set(c, offset); offset += c.length }
      const pcm = sourceRate !== 16000 ? resampleSimple(combined, sourceRate) : combined
      if (ws.readyState === WebSocket.OPEN) ws.send(float32ToInt16(pcm))
    }, 160)
  }

  function flushRemaining(ws: WebSocket, sourceRate: number) {
    if (chunkQueueRef.current.length === 0) return
    const chunks = chunkQueueRef.current
    chunkQueueRef.current = []
    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0)
    const combined = new Float32Array(totalLen)
    let offset = 0
    for (const c of chunks) { combined.set(c, offset); offset += c.length }
    const pcm = sourceRate !== 16000 ? resampleSimple(combined, sourceRate) : combined
    if (ws.readyState === WebSocket.OPEN) ws.send(float32ToInt16(pcm))
  }

  // 只停音频采集，不动 WebSocket
  function stopAudio() {
    if (processorRef.current) {
      try { processorRef.current.disconnect() } catch {}
      processorRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (sendIntervalRef.current !== null) {
      clearInterval(sendIntervalRef.current)
      sendIntervalRef.current = null
    }
  }

  // 完全清理（含 WS）
  function cleanupAll() {
    stopAudio()
    if (wsRef.current) {
      try { wsRef.current.close() } catch {}
      wsRef.current = null
    }
  }

  function finalize() {
    cleanupAll()
    const result = finalizedRef.current || streamingTextRef.current
    setRecording(false)
    setTranscribing(false)
    onTranscribedRef.current?.(result)
    const resolve = resolveRef.current
    if (resolve) {
      resolveRef.current = null
      resolve(result)
    }
  }

  const startRecording = useCallback(async () => {
    if (activeRef.current) return
    activeRef.current = true
    updateStreamText('')
    finalizedRef.current = ''

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      activeRef.current = false
      alert('无法获取麦克风权限，请在浏览器设置中允许麦克风访问')
      return
    }
    if (!activeRef.current) { stream.getTracks().forEach(t => t.stop()); return }
    streamRef.current = stream

    let audioContext: AudioContext
    try {
      audioContext = new AudioContext({ sampleRate: 16000 })
    } catch {
      audioContext = new AudioContext()
    }
    audioContextRef.current = audioContext
    sourceRateRef.current = audioContext.sampleRate

    if (!activeRef.current) { cleanupAll(); return }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/stt`)
    wsRef.current = ws
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      if (!activeRef.current) { ws.close(); return }
      startSending(ws, audioContext.sampleRate)
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string)
        if (msg.type === 'MID_TEXT') updateStreamText(msg.text || '')
        else if (msg.type === 'FIN_TEXT') {
          if (msg.text) updateStreamText(msg.text)           // 空结果不覆盖 MID_TEXT 内容
          finalizedRef.current = msg.text || streamingTextRef.current
        }
        else if (msg.type === 'END') ws.close()
        else if (msg.type === 'ERROR') { console.error('stt error:', msg.error); alert(`语音识别失败：${msg.error}`); ws.close() }
      } catch { /* ignore */ }
    }

    ws.onclose = () => finalize()
    ws.onerror = () => finalize()

    if (!activeRef.current) { cleanupAll(); return }

    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor
    chunkQueueRef.current = []
    processor.onaudioprocess = (e) => {
      chunkQueueRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)))
    }
    source.connect(processor)
    processor.connect(audioContext.destination)
    setRecording(true)
  }, [])

  const stopRecording = useCallback((): Promise<string> => {
    // 防止重复调用（onPointerLeave + onPointerUp 同时触发时）
    if (!activeRef.current) return Promise.resolve(streamingTextRef.current)
    activeRef.current = false

    // 立刻把 recording 状态置 false，按钮视觉立即响应
    setRecording(false)
    setTranscribing(true)

    const ws = wsRef.current
    const sourceRate = sourceRateRef.current
    stopAudio()

    return new Promise((resolve) => {
      if (!ws) {
        setTranscribing(false)
        resolve(streamingTextRef.current)
        return
      }

      const sendFinish = () => {
        flushRemaining(ws, sourceRate)
        resolveRef.current = resolve
        try { ws.send(JSON.stringify({ type: 'FINISH' })) } catch { finalize() }
      }

      if (ws.readyState === WebSocket.OPEN) {
        sendFinish()
      } else if (ws.readyState === WebSocket.CONNECTING) {
        ws.addEventListener('open', sendFinish, { once: true })
        ws.addEventListener('error', () => { setTranscribing(false); resolve('') }, { once: true })
      } else {
        setTranscribing(false)
        resolve(streamingTextRef.current)
      }
    })
  }, [])

  return { recording, transcribing, streamingText, startRecording, stopRecording }
}
