import { useState, useCallback, useEffect, useRef } from 'react'
import { organizeThoughts, getEncouragement } from '../services/api'
import type { Task } from '../services/api'
import { useSpeech } from '../hooks/useSpeech'
import { TaskStickyNote } from '../components/TaskStickyNote'
import { FullscreenCountdown } from '../components/FullscreenCountdown'
import { EncourageModal } from '../components/EncourageModal'
import { OttoPet } from '../components/OttoPet'
import { OtterCarousel } from '../components/OtterCarousel'
import { addTask, completeTask, incrementStarts, createSession, completeSessionTask } from '../db'
import type { HardwareSignal, QuickTask } from '../App'

type Phase = 'input' | 'tasks' | 'countdown321' | 'dock_countdown' | 'timing_waiting' | 'timing' | 'encouraging' | 'resting'

const REST_SECONDS = 5 * 60
const DEFAULT_FOCUS_SECONDS = 25 * 60

// ── 灵感清单 hook（localStorage 持久化）──────────────────────────
function useInspiration() {
  const [items, setItems] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('inspiration') || '[]') } catch { return [] }
  })
  function save(next: string[]) { setItems(next); localStorage.setItem('inspiration', JSON.stringify(next)) }
  function add(text: string) { if (text.trim()) save([text.trim(), ...items]) }
  function remove(i: number) { save(items.filter((_, idx) => idx !== i)) }
  return { items, add, remove }
}

const NEXT_TASK_MESSAGES = [
  '太棒了！接下来试试这个～',
  '做得好！下一个也难不倒你 ✨',
  '继续加油，你比想象中更强 💪',
  '保持节奏，马上就到下一个了 🌟',
  '状态正佳！再来一个吧 🔥',
]

const FINAL_ENCOURAGEMENTS = [
  '🎊 天呐你太厉害了！！所有任务都完成了！\n\n今天的你简直无敌，每一分钟都在认真对待自己。ADHD 从来不是你的弱点，你用行动证明了你能掌控它。\n\n好好休息一下吧，你值得！🌈',
  '🏆 全员通关！！！\n\n看看今天完成了多少事——你把一团乱麻变成了一项项成就。这可不是每个人都能做到的。\n\n给自己鼓个掌吧，明天继续闪闪发光！✨',
  '🎉 哇哇哇全做完了！！\n\n你知道最难的是什么吗？是开始。而你已经不仅开始了，还一口气做到了最后。\n\n今天的大赢家就是你！回去好好犒劳自己～💖',
]

function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

function getFocusSeconds(task: Task | null) {
  const minutes = task?.estimatedMinutes
  if (!minutes || minutes <= 0) return DEFAULT_FOCUS_SECONDS
  return Math.max(60, Math.round(minutes * 60))
}

interface Props {
  device: {
    connected: boolean
    sendDeviceMessage: (payload: Record<string, unknown>) => void
    sendPlayMusic: () => void
    simulateStart: () => void
    simulateComplete: () => void
  }
  hardwareSignal: HardwareSignal | null
  quickTask?: QuickTask | null
  onQuickTaskConsumed?: () => void
  onOrganized?: () => void
  onFocusDone?: () => void
}

export function LaunchPage({ device, hardwareSignal, quickTask, onQuickTaskConsumed, onOrganized, onFocusDone }: Props) {
  const [phase, setPhase]       = useState<Phase>('input')
  const [text, setText]         = useState('')
  const [tasks, setTasks]       = useState<Task[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [loading, setLoading]   = useState(false)
  const [taskId, setTaskId]     = useState<number | null>(null)
  const [elapsed, setElapsed]   = useState(0)
  const [encourage, setEncourage] = useState<{ message: string; points: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [allDoneEncourage, setAllDoneEncourage] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [doneCount, setDoneCount]         = useState(0)
  const [musicIdx, setMusicIdx]           = useState<number | null>(null)
  const [showMusicPicker, setShowMusicPicker] = useState(false)
  const [restRemaining, setRestRemaining] = useState(REST_SECONDS)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const phaseRef = useRef<Phase>('input')
  const tasksRef = useRef<Task[]>([])
  const selectedIndexRef = useRef<number | null>(null)
  const selectedTaskRef = useRef<Task | null>(null)
  const taskIdRef = useRef<number | null>(null)
  const elapsedRef = useRef(0)
  const timerRef   = useRef<number | null>(null)
  const handleCompleteCallbackRef = useRef<(seconds: number) => Promise<void>>(async () => {})

  const { recording, transcribing, streamingText, startRecording, stopRecording } = useSpeech(
    (result) => { if (result.trim()) setText(result) }
  )
  const inspiration = useInspiration()
  const [inspireDraft, setInspireDraft] = useState('')
  const [noteText, setNoteText]         = useState('')
  const [noteSaved, setNoteSaved]       = useState(false)
  const {
    connected,
    sendDeviceMessage,
    sendPlayMusic,
    simulateStart,
    simulateComplete,
  } = device

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    tasksRef.current = tasks
    if (selected !== null && tasks[selected]) {
      selectedTaskRef.current = tasks[selected]
    } else {
      selectedTaskRef.current = null
    }
  }, [selected, tasks])

  useEffect(() => {
    selectedIndexRef.current = selected
  }, [selected])

  useEffect(() => {
    taskIdRef.current = taskId
  }, [taskId])

  // streamingText → text 由 useSpeech 的 onTranscribed 回调负责，不再用 effect 同步

  function startTimer(durationSeconds = getFocusSeconds(selectedTaskRef.current)) {
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null }
    elapsedRef.current = 0
    setElapsed(0)
    timerRef.current = window.setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
      if (elapsedRef.current >= durationSeconds) {
        if (timerRef.current !== null) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
        handleCompleteCallbackRef.current(elapsedRef.current)
      }
    }, 1000)
  }

  function stopTimer() {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function playMusic(idx: number) {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    const src = ['/music-1.ogg', '/music-2.ogg', '/music-3.ogg'][idx]
    const audio = new Audio(src)
    audio.loop = true
    audio.play().catch(() => {})
    audioRef.current = audio
    setMusicIdx(idx)
  }

  function stopMusic() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setMusicIdx(null)
  }

  function requestBrowserFullscreen() {
    const root = document.documentElement
    if (!document.fullscreenElement && root.requestFullscreen) {
      root.requestFullscreen().catch(() => {})
    }
  }

  useEffect(() => () => { stopTimer(); stopMusic() }, [])

  useEffect(() => {
    if (phase !== 'resting') return
    setRestRemaining(REST_SECONDS)
    const id = window.setInterval(() => {
      setRestRemaining(prev => {
        if (prev <= 1) {
          window.clearInterval(id)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [phase])

  // 兜底：转写结束后 text 仍为空时，从 streamingText 补填
  const prevTranscribingRef = useRef(false)
  useEffect(() => {
    if (prevTranscribingRef.current && !transcribing) {
      setText(prev => prev.trim() ? prev : streamingText)
    }
    prevTranscribingRef.current = transcribing
  }, [transcribing, streamingText])

  // 从启动页一键专注：跳过整理步骤，直接倒计时
  useEffect(() => {
    if (!quickTask) return
    const task: Task = {
      content: quickTask.content,
      estimatedMinutes: quickTask.estimatedMinutes,
      sessionIndex: quickTask.taskIndex ?? 0,
    }
    stopTimer()
    setEncourage(null)
    setAllDoneEncourage(null)
    setError(null)
    setDoneCount(0)
    setElapsed(0)
    elapsedRef.current = 0
    if (quickTask.fromHardware) requestBrowserFullscreen()
    setTasks([task])
    setSelected(0)
    selectedTaskRef.current = task
    if (quickTask.sessionId !== undefined) setSessionId(quickTask.sessionId)
    ;(async () => {
      const id = await addTask({ category_id: 1, content: quickTask.content, started_at: Date.now() })
      setTaskId(id)
      await incrementStarts()
      if (quickTask.fromHardware) {
        phaseRef.current = 'dock_countdown'
        setPhase('dock_countdown')
      } else {
        setPhase('countdown321')
      }
    })()
    onQuickTaskConsumed?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickTask])

  // ESP32 -> App: phone removed, pause timer
  const onStopSignal = useCallback(() => {
    stopTimer()
    setPhase(prev => (prev === 'timing' || prev === 'dock_countdown' ? 'timing_waiting' : prev))
  }, [])

  // ESP32 -> App: hardware confirms completion
  const onCompleteSignal = useCallback(() => {
    if (phaseRef.current !== 'timing' && phaseRef.current !== 'dock_countdown' && phaseRef.current !== 'timing_waiting') return
    stopTimer()
    handleCompleteCallbackRef.current(elapsedRef.current)
  }, [])

  useEffect(() => {
    if (!hardwareSignal) return
    if (hardwareSignal.type === 'stop') onStopSignal()
    if (hardwareSignal.type === 'complete') onCompleteSignal()
  }, [hardwareSignal, onCompleteSignal, onStopSignal])

  async function handleOrganize() {
    if (!text.trim()) return
    setError(null)
    setLoading(true)
    try {
      const { tasks: result, suggestedTaskIndex } = await organizeThoughts(text, inspiration.items)
      if (!result || result.length === 0) {
        setError('AI 没有返回有效任务，请重新输入')
        return
      }
      const sid = await createSession(text, result, suggestedTaskIndex)
      setSessionId(sid)
      setTasks(result.map((t, i) => ({ ...t, sessionIndex: i })))
      setSelected(suggestedTaskIndex ?? null)
      setText('')
      setDoneCount(0)
      setPhase('tasks')
      onOrganized?.()
    } catch (err: any) {
      setError(err?.message || '整理失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  async function handleStart() {
    if (selected === null) return
    const task = tasks[selected]
    const id = await addTask({
      category_id: 1,
      content: task.content,
      started_at: Date.now(),
    })
    await incrementStarts()
    setTaskId(id)
    setError(null)
    setPhase('countdown321')
  }

  function handleCountdownDone() {
    sendPlayMusic()
    setPhase('timing_waiting')
  }

  function handleDockCountdownDone() {
    sendPlayMusic()
    phaseRef.current = 'timing'
    startTimer(getFocusSeconds(selectedTaskRef.current))
    setPhase('timing')
  }

  async function handleCompleteCallback(seconds: number) {
    if (phaseRef.current === 'encouraging' || phaseRef.current === 'resting') return
    phaseRef.current = 'encouraging'
    setElapsed(seconds)
    stopMusic()
    sendDeviceMessage({ cmd: 'congrats', message: '完成啦！休息一下再继续。' })
    sendDeviceMessage({ cmd: 'rest', message: '休息一下，保护大脑电量', seconds: REST_SECONDS })
    const task = selectedTaskRef.current
    if (task && selected !== null) {
      setTasks(prev => prev.filter((_, i) => i !== selected))
      if (sessionId !== null && task.sessionIndex !== undefined) {
        completeSessionTask(sessionId, task.sessionIndex, seconds)
      }
      setDoneCount(prev => prev + 1)
      setSelected(null)
      selectedTaskRef.current = null
    }
    setPhase('encouraging')
    if (taskIdRef.current !== null) {
      await completeTask(taskIdRef.current, seconds)
      taskIdRef.current = null
      setTaskId(null)
    }
    if (task) {
      try {
        const msg    = await getEncouragement(task.content, seconds)
        const points = Math.floor(seconds / 60) + 10
        setEncourage({ message: msg, points })
      } catch {
        const points = Math.floor(seconds / 60) + 10
        setEncourage({ message: '太棒了！你做到了！✨', points })
      }
    }
  }
  handleCompleteCallbackRef.current = handleCompleteCallback

  function handleContinue() {
    setEncourage(null)
    setRestRemaining(REST_SECONDS)
    setPhase('resting')
  }

  function finishRest() {
    if (onFocusDone) {
      // 从启动页发起的专注：完成后返回启动页，由启动页处理后续任务和全部完成
      onFocusDone()
    } else if (tasks.length > 0) {
      setSelected(0)
      setPhase('tasks')
    } else {
      const finalMsg = FINAL_ENCOURAGEMENTS[Math.floor(Math.random() * FINAL_ENCOURAGEMENTS.length)]
      setAllDoneEncourage(finalMsg)
      setPhase('encouraging')
    }
  }

  function reset() {
    stopTimer()
    setPhase('input')
    setText('')
    setTasks([])
    setSelected(null)
    setEncourage(null)
    setTaskId(null)
    setError(null)
    setDoneCount(0)
    setAllDoneEncourage(null)
    setSessionId(null)
    setRestRemaining(REST_SECONDS)
  }

  const selectedTask = selected !== null && tasks[selected] ? tasks[selected] : null
  const totalCount   = doneCount + tasks.length
  const nextTaskMsg  = doneCount > 0 ? NEXT_TASK_MESSAGES[(doneCount - 1) % NEXT_TASK_MESSAGES.length] : ''

  // ═══════════════════════════════════════════
  //  启动页（输入阶段）
  // ═══════════════════════════════════════════
  if (phase === 'input') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 80px)', background: '#fff' }}>
        {/* 橙色渐变英雄区 */}
        <div style={{
          background: 'linear-gradient(180deg, #FCCB8A 0%,rgb(240, 219, 180) 48%, #FEF3D8 80%, #fff 100%)',
          padding: '40px 24px 44px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 10, textAlign: 'center', position: 'relative',
        }}>
          {/* 设备状态 */}
          <div
            className={`pill ${connected ? 'connected' : ''}`}
            style={{ position: 'absolute', top: 14, right: 16 }}
          >
            <span>{connected ? '●' : '○'}</span>
            {connected ? '设备已连接' : '等待设备'}
          </div>

          {/* 装饰圆 */}
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FCCB8A', marginBottom: 2 }} />

          {/* Otter carousel */}
          <OtterCarousel size={100} />

          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginTop: 6 }}>
            让我们一起开始！
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.48)' }}>
            请随意记录下你想做的事：
          </p>
        </div>

        {/* 输入区 */}
        <div style={{ padding: '20px 16px 0', flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 12,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#dc2626', fontSize: 13, lineHeight: 1.5, flexShrink: 0,
            }}>⚠️ {error}</div>
          )}
          <textarea
            className="textarea"
            placeholder="准备周五的小组汇报…"
            value={recording || transcribing ? streamingText : (text || streamingText)}
            onChange={e => { if (!recording && !transcribing) setText(e.target.value) }}
            readOnly={recording || transcribing}
            style={{ minHeight: 120, flexShrink: 0 }}
          />
          <div className="btn-row" style={{ flexShrink: 0 }}>
            <button
              className={`btn btn-record ${recording ? 'recording' : ''}`}
              onPointerDown={startRecording}
              onPointerUp={() => stopRecording()}
              onPointerCancel={() => stopRecording()}
              onPointerLeave={() => stopRecording()}
            >
              {recording ? '🔴 录音中' : transcribing ? '⏳ 转换中' : '🎙️ 说话'}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleOrganize}
              disabled={loading || !text.trim()}
            >
              {loading ? '整理中…' : '整理思绪'}
            </button>
          </div>

          {/* 灵感清单 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden', paddingBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(0,0,0,0.4)', flexShrink: 0 }}>灵感清单</p>

            {/* 输入行 */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <input
                value={inspireDraft}
                onChange={e => setInspireDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && inspireDraft.trim()) { inspiration.add(inspireDraft); setInspireDraft('') } }}
                placeholder="随手记一个想法..."
                style={{
                  flex: 1, border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 999,
                  padding: '9px 16px', fontSize: 14, fontFamily: 'inherit',
                  background: '#fafaf8', color: '#1a1a1a', outline: 'none',
                }}
              />
              <button
                onClick={() => { if (inspireDraft.trim()) { inspiration.add(inspireDraft); setInspireDraft('') } }}
                disabled={!inspireDraft.trim()}
                style={{
                  width: 40, height: 40, borderRadius: 12, border: 'none',
                  background: '#FCCB8A', color: '#92400E', fontSize: 22, fontWeight: 700,
                  cursor: 'pointer', flexShrink: 0,
                  opacity: inspireDraft.trim() ? 1 : 0.5,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                +
              </button>
            </div>

            {/* 列表 */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {inspiration.items.length === 0 && (
                <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.28)', textAlign: 'center', padding: '16px 0' }}>
                  点击条目可导入到输入框
                </p>
              )}
              {inspiration.items.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '11px 14px', borderRadius: 12,
                    background: '#fff', border: '1px solid rgba(0,0,0,0.07)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                  }}
                >
                  <span
                    style={{ flex: 1, fontSize: 14, color: '#1a1a1a', lineHeight: 1.4, cursor: 'pointer' }}
                    onClick={() => setText(item)}
                  >
                    {item}
                  </span>
                  <button
                    onClick={() => inspiration.remove(i)}
                    style={{ color: 'rgba(0,0,0,0.25)', fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════
  //  任务清单阶段
  // ═══════════════════════════════════════════
  if (phase === 'tasks') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 16px 0', flex: 1 }}>
        <div className="ble-status-bar">
          <div className={`pill ${connected ? 'connected' : ''}`}>
            <span>{connected ? '●' : '○'}</span>
            {connected ? '设备已连接' : '等待设备'}
          </div>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>
          {doneCount > 0 ? nextTaskMsg : '我帮你整理好了最易执行的清单 ✨'}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          {doneCount > 0
            ? `已完成 ${doneCount}/${totalCount}，继续加油～`
            : '从第一个开始吧，慢慢来，不着急～'}
        </p>
        <div className="sticky-grid" style={{ flex: 1 }}>
          {tasks.map((t, i) => (
            <TaskStickyNote
              key={t.sessionIndex ?? i}
              task={t}
              index={i + 1}
              selected={selected === i}
              onClick={() => setSelected(i)}
            />
          ))}
        </div>
        <div className="btn-row" style={{ paddingBottom: 16 }}>
          <button className="btn btn-ghost" onClick={() => setPhase('input')}>
            ← {doneCount > 0 ? '返回首页' : '重写'}
          </button>
          <button className="btn btn-primary" onClick={handleStart} disabled={selected === null}>
            🚀 开始！
          </button>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════
  //  321 全屏倒计时
  // ═══════════════════════════════════════════
  if (phase === 'countdown321' && selectedTask) {
    return <FullscreenCountdown taskContent={selectedTask.content} onDone={handleCountdownDone} />
  }

  if (phase === 'dock_countdown' && selectedTask) {
    return (
      <FullscreenCountdown
        taskContent={selectedTask.content}
        title="Dock placed"
        subtitle="专注已开始！"
        compact
        onDone={handleDockCountdownDone}
      />
    )
  }

  // ═══════════════════════════════════════════
  //  专注页（等待信号 / 计时中）—— 绿色全屏
  // ═══════════════════════════════════════════
  if ((phase === 'timing_waiting' || phase === 'timing') && selectedTask) {
    const isTiming = phase === 'timing'
    const focusSeconds = getFocusSeconds(selectedTask)
    const remaining = Math.max(0, focusSeconds - elapsed)
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'linear-gradient(160deg, #A7F3D0 0%, #D1FAE5 100%)',
        display: 'flex', flexDirection: 'column',
        padding: '16px 16px 24px',
      }}>
        {/* 顶栏 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <span style={{
            background: 'rgba(255,255,255,0.72)',
            borderRadius: 999, padding: '5px 14px',
            fontSize: 13, fontWeight: 600, color: '#065f46',
          }}>
            {isTiming ? '专注中' : '准备中…'}
          </span>
        </div>

        {/* 主内容：竖屏布局 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 任务信息卡 */}
          <div style={{
            background: 'rgba(255,255,255,0.5)',
            borderRadius: 20, padding: '18px 20px',
            backdropFilter: 'blur(4px)',
          }}>
            <p style={{ fontSize: 12, color: '#065f46', opacity: 0.75, marginBottom: 6 }}>
              正在做（第 {doneCount + 1} 步 / 共 {totalCount} 步）
            </p>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#022c22', lineHeight: 1.4 }}>
              {selectedTask.content}
            </p>
            <div style={{ marginTop: 14, display: 'flex', gap: 16, alignItems: 'center' }}>
              <button
                onClick={() => setShowMusicPicker(true)}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontSize: 13, color: '#065f46', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                ♪ {musicIdx !== null ? ['专注放松', '深度专注', '学习专注'][musicIdx] : '选择音乐'}
              </button>
              <p style={{ fontSize: 13, color: '#065f46', display: 'flex', alignItems: 'center', gap: 4 }}>
                <img src="/otter-coin.png" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                已积累 {doneCount} 滴
              </p>
            </div>
          </div>

          {/* 计时器 */}
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            {isTiming ? (
              <div style={{
                fontSize: 72, fontWeight: 800, letterSpacing: 0,
                color: '#022c22', fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}>
                {fmt(remaining)}
              </div>
            ) : (
              <div style={{ fontSize: 48, lineHeight: 1 }}>🎵</div>
            )}
            <p style={{ fontSize: 13, color: '#065f46', opacity: 0.75, marginTop: 8 }}>
              {isTiming ? `专注倒计时 · 已坚持 ${fmt(elapsed)}` : 'Dock 放上后会自动开始倒计时'}
            </p>
          </div>

          {/* 水獭 + 便笺 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <img src="/水獭2.png" style={{ width: 72, height: 72, objectFit: 'contain' }} />
            <p style={{ fontSize: 13, color: '#065f46', opacity: 0.85 }}>Otto 和你一起专注</p>
            {/* 便笺 */}
            <div style={{
              width: '100%', background: 'rgba(255,255,255,0.6)',
              borderRadius: 14, padding: '12px 14px',
              backdropFilter: 'blur(4px)',
            }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#065f46', marginBottom: 6, opacity: 0.8 }}>
                📝 便笺 · 灵感随手记
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={noteText}
                  onChange={e => { setNoteText(e.target.value); setNoteSaved(false) }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && noteText.trim()) {
                      inspiration.add(noteText.trim())
                      setNoteText('')
                      setNoteSaved(true)
                      setTimeout(() => setNoteSaved(false), 2000)
                    }
                  }}
                  placeholder="突然想到什么，按 Enter 记下来…"
                  style={{
                    flex: 1, border: 'none', borderRadius: 10,
                    padding: '8px 12px', fontSize: 13,
                    background: 'rgba(255,255,255,0.8)',
                    color: '#022c22', outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={() => {
                    if (noteText.trim()) {
                      inspiration.add(noteText.trim())
                      setNoteText('')
                      setNoteSaved(true)
                      setTimeout(() => setNoteSaved(false), 2000)
                    }
                  }}
                  style={{
                    width: 36, height: 36, borderRadius: 10, border: 'none',
                    background: noteText.trim() ? '#34d399' : 'rgba(255,255,255,0.5)',
                    color: '#022c22', fontSize: 18, cursor: 'pointer', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s',
                  }}
                >+</button>
              </div>
              {noteSaved && (
                <p style={{ fontSize: 11, color: '#059669', marginTop: 5 }}>✓ 已加入灵感清单</p>
              )}
            </div>
          </div>

          {/* 底部操作区：已连接显示提示，未连接显示软件按钮 */}
          <div style={{ marginTop: 'auto' }}>
            {connected ? (
              // ESP32 已连接：轻拍设备即可触发，显示提示即可
              <div style={{
                width: '100%',
                background: 'rgba(255,255,255,0.45)',
                borderRadius: 18, padding: '18px',
                textAlign: 'center',
                backdropFilter: 'blur(4px)',
              }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#022c22' }}>
                  {isTiming ? '轻拍设备结束专注' : '轻拍设备开始专注'}
                </p>
                <p style={{ fontSize: 12, color: '#065f46', opacity: 0.65, marginTop: 4 }}>
                  设备已连接，等待你的指令
                </p>
              </div>
            ) : (
              // 未连接：软件按钮作为备用接口
              <button
                onClick={isTiming ? simulateComplete : simulateStart}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.8)',
                  borderRadius: 18, padding: '18px',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 4,
                  boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
                  border: 'none', cursor: 'pointer',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 700, color: '#022c22' }}>
                  {isTiming ? '标记完成' : '开始计时'}
                </span>
                <span style={{ fontSize: 12, color: '#065f46', opacity: 0.65 }}>
                  未连接设备时可手动操作
                </span>
              </button>
            )}
          </div>
        </div>

        {/* 音乐选择器 */}
        {showMusicPicker && (
          <div
            onClick={() => setShowMusicPicker(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              background: 'rgba(0,0,0,0.3)',
              display: 'flex', alignItems: 'flex-end',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', background: '#fff',
                borderRadius: '20px 20px 0 0',
                padding: '20px 16px 48px',
              }}
            >
              <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 14, color: '#1a1a1a' }}>♪ 选择专注音乐</p>
              {[
                { label: '专注放松', desc: 'ADHD Relief Music' },
                { label: '深度专注', desc: 'Deep Focus · Study' },
                { label: '学习专注', desc: 'Studying Music' },
              ].map((item, i) => (
                <div
                  key={i}
                  onClick={() => { musicIdx === i ? stopMusic() : playMusic(i); setShowMusicPicker(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', borderRadius: 14, marginBottom: 8, cursor: 'pointer',
                    background: musicIdx === i ? '#D1FAE5' : '#f5f5f3',
                    border: `2px solid ${musicIdx === i ? '#34d399' : 'transparent'}`,
                  }}
                >
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#022c22' }}>{item.label}</p>
                    <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.42)', marginTop: 2 }}>{item.desc}</p>
                  </div>
                  {musicIdx === i && <span style={{ fontSize: 18 }}>🎵</span>}
                </div>
              ))}
              {musicIdx !== null && (
                <button
                  onClick={() => { stopMusic(); setShowMusicPicker(false) }}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 12, border: 'none',
                    background: 'rgba(0,0,0,0.06)', fontSize: 14, color: 'rgba(0,0,0,0.5)',
                    cursor: 'pointer', marginTop: 4,
                  }}
                >
                  关闭音乐
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════
  //  休息阶段：完成一个小任务后先恢复一下
  // ═══════════════════════════════════════════
  if (phase === 'resting') {
    const hasMoreTasks = tasks.length > 0
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 180,
        background: 'linear-gradient(160deg, #DBEAFE 0%, #F0FDFA 100%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 24, textAlign: 'center',
      }}>
        <OttoPet mood="happy" size={96} />
        <p style={{ marginTop: 20, fontSize: 30, fontWeight: 800, color: '#0f766e' }}>
          休息一下
        </p>
        <p style={{ marginTop: 10, fontSize: 15, color: '#0f766e', lineHeight: 1.6, maxWidth: 320 }}>
          已完成一个小目标。喝水、眨眼、伸展一下，下一轮会更稳。
        </p>
        <div style={{
          marginTop: 28,
          fontSize: 76,
          fontWeight: 800,
          lineHeight: 1,
          color: '#064e3b',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {fmt(restRemaining)}
        </div>
        <p style={{ marginTop: 10, fontSize: 13, color: 'rgba(15,118,110,0.72)' }}>
          {restRemaining === 0 ? '休息完成，可以继续啦' : '默认 5 分钟短休息'}
        </p>
        <button
          className="btn btn-primary"
          onClick={finishRest}
          style={{ marginTop: 30, width: '100%', maxWidth: 320 }}
        >
          {restRemaining === 0
            ? (hasMoreTasks ? '开始下一步' : '查看完成奖励')
            : (hasMoreTasks ? '跳过休息，继续下一步' : '跳过休息，查看奖励')}
        </button>
      </div>
    )
  }

  // ═══════════════════════════════════════════
  //  鼓励阶段：等待 AI 响应
  // ═══════════════════════════════════════════
  if (phase === 'encouraging' && !encourage && !allDoneEncourage) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'linear-gradient(170deg, #fbc8dc 0%, #fecdd3 45%, #fee2e2 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16,
      }}>
        <OttoPet mood="happy" size={80} />
        <p style={{ color: '#9f1239', fontSize: 14, fontWeight: 500 }}>加载鼓励中…✨</p>
      </div>
    )
  }

  // ═══════════════════════════════════════════
  //  完成页（per-task 鼓励）
  // ═══════════════════════════════════════════
  if (encourage) {
    return (
      <EncourageModal
        message={encourage.message}
        points={encourage.points}
        hasMoreTasks={tasks.length > 0}
        onClose={handleContinue}
      />
    )
  }

  // ═══════════════════════════════════════════
  //  全部完成！隆重庆祝
  // ═══════════════════════════════════════════
  if (allDoneEncourage) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'linear-gradient(170deg, #fbc8dc 0%, #fecdd3 45%, #fee2e2 100%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '56px 24px 40px',
        animation: 'fadeIn 0.35s ease',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#9f1239', letterSpacing: 0 }}>全部完成！</p>
        </div>

        <OttoPet mood="happy" size={100} />

        <div style={{
          marginTop: 28, background: 'rgba(255,255,255,0.82)',
          borderRadius: 20, padding: '20px 24px', width: '100%',
          textAlign: 'center', backdropFilter: 'blur(6px)',
        }}>
          <p style={{
            fontSize: 15, fontWeight: 500, lineHeight: 1.85,
            color: '#1a1a1a', whiteSpace: 'pre-line',
          }}>
            {allDoneEncourage}
          </p>
        </div>

        <button
          onClick={reset}
          style={{
            marginTop: 'auto', width: '100%', padding: '16px',
            borderRadius: 999, background: 'rgba(255,255,255,0.9)',
            border: 'none', fontSize: 16, fontWeight: 600,
            color: '#1a1a1a', cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
          }}
        >
          🌟 回到首页
        </button>
      </div>
    )
  }

  return null
}
