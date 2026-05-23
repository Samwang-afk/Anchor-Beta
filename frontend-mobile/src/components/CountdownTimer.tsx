import { useEffect, useState } from 'react'

interface Props {
  onComplete: (seconds: number) => void
}

function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

export function CountdownTimer({ onComplete }: Props) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      <div className="timer-display">{fmt(elapsed)}</div>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>轻拍设备或点按钮完成</p>
      <button
        className="btn btn-ghost"
        onClick={() => onComplete(elapsed)}
        style={{ width: '100%' }}
      >
        ✋ 手动完成
      </button>
    </div>
  )
}
