import { useState, useEffect, useCallback, useRef } from 'react'
import { BottomNav } from './components/BottomNav'
import { LaunchPage } from './pages/LaunchPage'
import { VinePage } from './pages/VinePage'
import { AchievementPage } from './pages/AchievementPage'
import { SettingsPage } from './pages/SettingsPage'
import { useDevice } from './hooks/useDevice'
import { getAllSessions } from './db'

export type Tab = 'launch' | 'vine' | 'achievement' | 'settings'

export interface QuickTask {
  content: string
  estimatedMinutes: number
  sessionId?: number
  taskIndex?: number
  fromHardware?: boolean
}

export type HardwareSignal = {
  type: 'stop' | 'complete'
  seq: number
}

export default function App() {
  const [splash, setSplash]   = useState(true)
  const [tab, setTab]         = useState<Tab>('launch')
  const [quickTask, setQuickTask] = useState<QuickTask | null>(null)
  const [vineKey, setVineKey] = useState(0)
  const [hardwareSignal, setHardwareSignal] = useState<HardwareSignal | null>(null)
  const hardwareSeqRef = useRef(0)
  const lastHardwareStartRef = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 2000)
    return () => clearTimeout(t)
  }, [])

  function handleTabChange(t: Tab) {
    if (t === 'vine') setVineKey(k => k + 1)
    setTab(t)
  }

  function handleQuickStart(task: QuickTask) {
    setQuickTask(task)
    setTab('launch')
  }

  function handleOrganized() {
    setVineKey(k => k + 1)
    setTab('vine')
  }

  function handleFocusDone() {
    setVineKey(k => k + 1)
    setTab('vine')
  }

  async function getNextHardwareTask(): Promise<QuickTask> {
    const sessions = await getAllSessions()
    const latest = sessions[0]
    if (latest) {
      const pending = latest.tasks
        .map((task, index) => ({ task, index }))
        .find(item => !item.task.done)
      if (pending) {
        return {
          content: pending.task.content,
          estimatedMinutes: pending.task.estimatedMinutes,
          sessionId: latest.id,
          taskIndex: pending.index,
          fromHardware: true,
        }
      }
    }
    return {
      content: '专注一会儿',
      estimatedMinutes: 25,
      fromHardware: true,
    }
  }

  const handleHardwareStart = useCallback(() => {
    const now = Date.now()
    if (now - lastHardwareStartRef.current < 1200) return
    lastHardwareStartRef.current = now

    ;(async () => {
      const task = await getNextHardwareTask()
      setQuickTask(task)
      setTab('launch')
    })()
  }, [])

  const handleHardwareStop = useCallback(() => {
    hardwareSeqRef.current += 1
    setHardwareSignal({ type: 'stop', seq: hardwareSeqRef.current })
    setTab('launch')
  }, [])

  const handleHardwareComplete = useCallback(() => {
    hardwareSeqRef.current += 1
    setHardwareSignal({ type: 'complete', seq: hardwareSeqRef.current })
    setTab('launch')
  }, [])

  const device = useDevice({
    onStartSignal: handleHardwareStart,
    onStopSignal: handleHardwareStop,
    onCompleteSignal: handleHardwareComplete,
  })

  if (splash) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src="/首先出现.png" style={{ width: '100vw', height: '100vh', objectFit: 'contain' }} />
      </div>
    )
  }

  return (
    <div className="app">
      <div className="page-content">
        {tab === 'launch' && (
          <LaunchPage
            device={device}
            hardwareSignal={hardwareSignal}
            quickTask={quickTask}
            onQuickTaskConsumed={() => setQuickTask(null)}
            onOrganized={handleOrganized}
            onFocusDone={handleFocusDone}
          />
        )}
        {tab === 'vine' && <VinePage key={vineKey} onQuickStart={handleQuickStart} />}
        {tab === 'achievement' && <AchievementPage />}
        {tab === 'settings' && <SettingsPage />}
      </div>
      <BottomNav active={tab} onChange={handleTabChange} />
    </div>
  )
}
