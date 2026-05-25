import { useEffect, useMemo, useState } from 'react'
import { getAllSessions, type TaskSession } from '../db'
import { OtterCarousel } from '../components/OtterCarousel'
import type { QuickTask } from '../App'

const CN_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

const OTTO_MESSAGES = [
  { zh: '开始很难，所以我陪你。', en: "Starting is hard. That's why I'm here." },
  { zh: '我们一起开始吧。', en: "Let's start together." },
  { zh: '你回来就好，我一直在。', en: "Come back anytime — I'll be here." },
  { zh: '你做的每一点，我都看见了。', en: 'I saw every little thing you did.' },
]

const ENCOURAGEMENTS = [
  '现在就开始吧！',
  '选它，立刻行动！',
  '你可以的！',
  '一步一步来，先做这个！',
  '就是它了，冲！',
]

const ALL_DONE_MSGS = [
  '🎊 天呐你太厉害了！所有任务都完成了！\n\n今天的你简直无敌，每一分钟都在认真对待自己。好好休息一下吧，你值得！🌈',
  '🏆 全员通关！\n\n看看今天完成了多少事——你把一团乱麻变成了一项项成就。给自己鼓个掌吧！✨',
  '🎉 哇哇哇全做完了！\n\n最难的是开始，而你不仅开始了，还一口气做到了最后。今天的大赢家就是你！💖',
]

interface Props {
  onQuickStart: (task: QuickTask) => void
}

export function VinePage({ onQuickStart }: Props) {
  const [sessions, setSessions]       = useState<TaskSession[]>([])
  const [loaded, setLoaded]           = useState(false)
  const [selected, setSelected]       = useState<QuickTask | null>(null)
  const [allDoneDismissed, setAllDoneDismissed] = useState(false)
  const [msgIdx, setMsgIdx]           = useState(0)
  const [msgVisible, setMsgVisible]   = useState(true)
  const encouragement = useMemo(
    () => ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)], []
  )
  const allDoneMsg = useMemo(
    () => ALL_DONE_MSGS[Math.floor(Math.random() * ALL_DONE_MSGS.length)], []
  )

  useEffect(() => {
    getAllSessions().then(s => { setSessions(s); setLoaded(true) })
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setMsgVisible(false)
      setTimeout(() => {
        setMsgIdx(i => (i + 1) % OTTO_MESSAGES.length)
        setMsgVisible(true)
      }, 500)
    }, 5000)
    return () => clearInterval(id)
  }, [])

  // Reset dismissal when a new session is added (user organized again)
  useEffect(() => { setAllDoneDismissed(false) }, [sessions.length])

  const latestSession = sessions[0] as TaskSession | undefined
  const allTasks      = latestSession?.tasks ?? []
  const pendingItems  = allTasks
    .map((t, i) => ({ ...t, sessionId: latestSession!.id!, taskIndex: i }))
    .filter(t => !t.done)

  const allDone = loaded && !!latestSession && allTasks.length > 0 && pendingItems.length === 0

  function rowLabel(taskIndex: number, total: number) {
    if (total >= 3 && taskIndex === total - 1) return '生活小记'
    return `任务${CN_NUMS[taskIndex] ?? taskIndex + 1}`
  }

  // ── 全部完成庆祝页 ────────────────────────
  if (allDone && !allDoneDismissed) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'linear-gradient(170deg, #fbc8dc 0%, #fecdd3 45%, #fee2e2 100%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '56px 24px 40px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#9f1239', letterSpacing: 2 }}>全部完成！</p>
        </div>
        <OtterCarousel size={100} />
        <div style={{
          marginTop: 24, background: 'rgba(255,255,255,0.82)',
          borderRadius: 20, padding: '20px 24px', width: '100%',
          textAlign: 'center', backdropFilter: 'blur(6px)',
        }}>
          <p style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.85, color: '#1a1a1a', whiteSpace: 'pre-line' }}>
            {allDoneMsg}
          </p>
        </div>
        <button
          onClick={() => setAllDoneDismissed(true)}
          style={{
            marginTop: 'auto', width: '100%', padding: '16px',
            borderRadius: 16, background: 'rgba(255,255,255,0.9)',
            border: 'none', fontSize: 16, fontWeight: 600,
            color: '#1a1a1a', cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
          }}
        >
          🌟 太棒了！
        </button>
      </div>
    )
  }

  // ── 建议任务（始终是第一条待办）────────────
  const recommendedTask = pendingItems[0]
    ? {
        content:          pendingItems[0].content,
        estimatedMinutes: pendingItems[0].estimatedMinutes,
        sessionId:        pendingItems[0].sessionId,
        taskIndex:        pendingItems[0].taskIndex,
      }
    : null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 80px)', overflow: 'hidden',
      background: '#fff',
    }}>

      {/* ── Otto 寄语 ───────────────────────── */}
      <div style={{
        background: 'linear-gradient(180deg, #FCCB8A 0%, rgb(240,219,180) 48%, #FEF3D8 80%, #f5f5f4 100%)',
        padding: '24px 24px 22px',
        display: 'flex', alignItems: 'center',
        gap: 14, flexShrink: 0,
      }}>
        <img src="/激励水獭.png" style={{ width: 72, height: 72, objectFit: 'contain', flexShrink: 0 }} />
        <div style={{
          flex: 1,
          background: 'rgba(255,255,255,0.72)',
          borderRadius: 18,
          padding: '14px 16px',
          backdropFilter: 'blur(6px)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          opacity: msgVisible ? 1 : 0,
          transition: 'opacity 0.5s ease',
        }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.5 }}>
            {OTTO_MESSAGES[msgIdx].zh}
          </p>
          <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.42)', marginTop: 4, lineHeight: 1.5, fontStyle: 'italic' }}>
            {OTTO_MESSAGES[msgIdx].en}
          </p>
        </div>
      </div>

      {/* ── section header ─────────────────────── */}
      <div style={{ padding: '9px 16px 7px', background: '#EDECE8', flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,0.45)', letterSpacing: 0.5 }}>
          今日计划时间表
        </span>
      </div>

      {/* ── 任务列表（可滚动）─────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
        {!loaded ? null : pendingItems.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 10, padding: '44px 0', color: 'rgba(0,0,0,0.3)',
          }}>
            <span style={{ fontSize: 36 }}>📋</span>
            <p style={{ fontSize: 14, textAlign: 'center', lineHeight: 1.8 }}>
              今日还没有任务<br />去记录页整理一下吧～
            </p>
          </div>
        ) : (
          pendingItems.map((task, i) => {
            const qt: QuickTask = {
              content: task.content,
              estimatedMinutes: task.estimatedMinutes,
              sessionId: task.sessionId,
              taskIndex: task.taskIndex,
            }
            const isSel  = selected?.content === task.content
            const label  = rowLabel(task.taskIndex, allTasks.length)
            return (
              <div
                key={task.taskIndex}
                onClick={() => setSelected(isSel ? null : qt)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 20px',
                  background: isSel ? '#FFFBEB' : i % 2 === 0 ? '#FAFAF8' : '#fff',
                  borderLeft: `3px solid ${isSel ? '#FBBF24' : 'transparent'}`,
                  borderBottom: '1px solid rgba(0,0,0,0.05)',
                  cursor: 'pointer', transition: 'background 0.12s, border-color 0.12s',
                }}
              >
                <span style={{
                  fontSize: 12, fontWeight: 700,
                  color: isSel ? '#D97706' : 'rgba(0,0,0,0.32)',
                  minWidth: 56, flexShrink: 0,
                }}>
                  {label}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, color: '#1a1a1a', lineHeight: 1.4 }}>{task.content}</p>
                  <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.36)', marginTop: 2 }}>
                    预计 {task.estimatedMinutes} 分钟
                  </p>
                </div>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${isSel ? '#FBBF24' : 'rgba(0,0,0,0.15)'}`,
                  background: isSel ? '#FBBF24' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.12s',
                }}>
                  {isSel && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── 建议任务卡 ─────────────────────────── */}
      {recommendedTask && (
        <div
          onClick={() => setSelected(recommendedTask)}
          style={{
            margin: '0 16px 12px', flexShrink: 0,
            background: selected?.content === recommendedTask.content
              ? 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)'
              : 'linear-gradient(135deg, #FFFBF0 0%, #FEF3C7 100%)',
            border: `2px solid ${selected?.content === recommendedTask.content ? '#F59E0B' : 'rgba(251,191,36,0.45)'}`,
            borderRadius: 16, padding: '16px 18px', cursor: 'pointer',
            boxShadow: '0 3px 14px rgba(251,191,36,0.2)', transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 15 }}>⭐</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#B45309', letterSpacing: 0.5 }}>建议任务</span>
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#78350F', lineHeight: 1.45, marginBottom: 8 }}>
            {recommendedTask.content}
          </p>
          <p style={{ fontSize: 13, color: '#D97706', fontWeight: 500 }}>{encouragement}</p>
        </div>
      )}

      {/* ── 一键启动 ───────────────────────────── */}
      <div style={{
        padding: '14px 20px 18px', flexShrink: 0,
        background: '#fff', borderTop: '1px solid rgba(0,0,0,0.07)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <button
          onClick={() => {
            const task = selected ?? recommendedTask
            if (task) onQuickStart(task)
          }}
          disabled={!recommendedTask}
          style={{
            flex: 1, padding: '17px',
            borderRadius: 16, border: 'none',
            background: recommendedTask
              ? 'linear-gradient(135deg, #FBBF24 0%, #F97316 100%)'
              : 'rgba(0,0,0,0.07)',
            color: recommendedTask ? '#fff' : 'rgba(0,0,0,0.28)',
            fontSize: 17, fontWeight: 700,
            cursor: recommendedTask ? 'pointer' : 'default',
            boxShadow: recommendedTask ? '0 5px 20px rgba(251,191,36,0.4)' : 'none',
            transition: 'all 0.2s ease', letterSpacing: 0.5,
          }}
        >
          一键启动
        </button>
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          background: 'rgba(0,0,0,0.18)', flexShrink: 0,
        }} />
      </div>
    </div>
  )
}
