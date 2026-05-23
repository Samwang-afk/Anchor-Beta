import { useState, useCallback, useEffect, useRef } from 'react'
import { organizeThoughts, getEncouragement } from '../services/api'
import type { Task } from '../services/api'
import { useSpeech } from '../hooks/useSpeech'
import { useDevice } from '../hooks/useDevice'
import { TaskStickyNote } from '../components/TaskStickyNote'
import { FullscreenCountdown } from '../components/FullscreenCountdown'
import { EncourageModal } from '../components/EncourageModal'
import { OttoPet } from '../components/OttoPet'
import { addTask, completeTask, incrementStarts, createSession, completeSessionTask } from '../db'

type Phase = 'input' | 'tasks' | 'countdown321' | 'timing_waiting' | 'timing' | 'encouraging'

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

export function LaunchPage() {
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
  const [doneCount, setDoneCount] = useState(0)
  const elapsedRef = useRef(0)
  const timerRef   = useRef<number | null>(null)
  const handleCompleteCallbackRef = useRef<(seconds: number) => Promise<void>>(async () => {})

  const { recording, transcribing, streamingText, startRecording, stopRecording } = useSpeech()

  useEffect(() => {
    if (recording) setText(streamingText)
  }, [recording, streamingText])

  function startTimer() {
    elapsedRef.current = 0
    setElapsed(0)
    timerRef.current = window.setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
    }, 1000)
  }

  function stopTimer() {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => () => stopTimer(), [])

  // ESP32 → App：开始信号
  const onStartSignal = useCallback(() => {
    startTimer()
    setPhase('timing')
  }, [])

  // ESP32 → App：结束信号
  const onStopSignal = useCallback(() => {
    stopTimer()
    handleCompleteCallbackRef.current(elapsedRef.current)
  }, [])

  const {
    connected,
    sendPlayMusic,
    simulateStart,
    simulateStop,
  } = useDevice({ onStartSignal, onStopSignal })

  async function handleOrganize() {
    if (!text.trim()) return
    setError(null)
    setLoading(true)
    try {
      const result = await organizeThoughts(text)
      if (!result || result.length === 0) {
        setError('AI 没有返回有效任务，请重新输入')
        return
      }
      const sid = await createSession(text, result)
      setSessionId(sid)
      setTasks(result.map((t, i) => ({ ...t, sessionIndex: i })))
      setSelected(null)
      setDoneCount(0)
      setPhase('tasks')
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

  const selectedTaskRef = useRef<Task | null>(null)
  useEffect(() => {
    if (selected !== null && tasks[selected]) {
      selectedTaskRef.current = tasks[selected]
    }
  }, [selected, tasks])

  const taskIdRef = useRef<number | null>(null)
  useEffect(() => {
    taskIdRef.current = taskId
  }, [taskId])

  async function handleCompleteCallback(seconds: number) {
    setElapsed(seconds)
    const task = selectedTaskRef.current
    if (task && selected !== null) {
      setTasks(prev => prev.filter((_, i) => i !== selected))
      if (sessionId !== null && task.sessionIndex !== undefined) {
        completeSessionTask(sessionId, task.sessionIndex, seconds)
      }
      setDoneCount(prev => prev + 1)
      setSelected(null)
    }
    setPhase('encouraging')
    if (taskIdRef.current !== null) {
      await completeTask(taskIdRef.current, seconds)
    }
    if (task) {
      const msg    = await getEncouragement(task.content, seconds)
      const points = Math.floor(seconds / 60) + 10
      setEncourage({ message: msg, points })
    }
  }
  handleCompleteCallbackRef.current = handleCompleteCallback

  function handleContinue() {
    setEncourage(null)
    if (tasks.length > 0) {
      setSelected(null)
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

          {/* Otto */}
          <OttoPet mood="neutral" size={84} />

          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginTop: 6 }}>
            现在想做点什么？
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.48)' }}>
            说一句就好，不用想清楚
          </p>
        </div>

        {/* 输入区 */}
        <div style={{ padding: '20px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 12,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#dc2626', fontSize: 13, lineHeight: 1.5,
            }}>⚠️ {error}</div>
          )}
          <textarea
            className="textarea"
            placeholder="准备周五的小组汇报…"
            value={text}
            onChange={e => setText(e.target.value)}
            readOnly={recording}
            style={{ flex: 1, minHeight: 140 }}
          />
          <div className="btn-row" style={{ paddingBottom: 8 }}>
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

  // ═══════════════════════════════════════════
  //  专注页（等待信号 / 计时中）—— 绿色全屏
  // ═══════════════════════════════════════════
  if ((phase === 'timing_waiting' || phase === 'timing') && selectedTask) {
    const isTiming = phase === 'timing'
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
            <div style={{ marginTop: 14, display: 'flex', gap: 16 }}>
              <p style={{ fontSize: 13, color: '#065f46' }}>♪ 专注音乐·雨声</p>
              <p style={{ fontSize: 13, color: '#065f46' }}>🌊 已积累 {doneCount} 滴</p>
            </div>
          </div>

          {/* 计时器 */}
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            {isTiming ? (
              <div style={{
                fontSize: 72, fontWeight: 800, letterSpacing: -3,
                color: '#022c22', fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}>
                {fmt(elapsed)}
              </div>
            ) : (
              <div style={{ fontSize: 48, lineHeight: 1 }}>🎵</div>
            )}
            <p style={{ fontSize: 13, color: '#065f46', opacity: 0.75, marginTop: 8 }}>
              {isTiming ? '正在专注中…' : '音乐已响起，随时可以开始'}
            </p>
          </div>

          {/* Otto */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <OttoPet mood="neutral" size={72} />
            <p style={{ fontSize: 13, color: '#065f46', opacity: 0.85 }}>Otto 和你一起专注</p>
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
                onClick={isTiming ? simulateStop : simulateStart}
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
          <p style={{ fontSize: 22, fontWeight: 800, color: '#9f1239', letterSpacing: 2 }}>全部完成！</p>
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
