import { useEffect, useState } from 'react'

interface Props {
  taskContent: string
  onDone: () => void
}

const SEQUENCE = [
  { text: '5', delay: 1000, bg: 'linear-gradient(160deg, #FDE68A 0%, #FEF3C7 100%)', color: '#92400E' },
  { text: '4', delay: 1000, bg: 'linear-gradient(160deg, #FDBA74 0%, #FED7AA 100%)', color: '#9A3412' },
  { text: '3', delay: 1000, bg: 'linear-gradient(160deg, #F9A8D4 0%, #FCE7F3 100%)', color: '#9D174D' },
  { text: '2', delay: 1000, bg: 'linear-gradient(160deg, #93C5FD 0%, #DBEAFE 100%)', color: '#1E3A8A' },
  { text: '1', delay: 1000, bg: 'linear-gradient(160deg, #86EFAC 0%, #DCFCE7 100%)', color: '#14532D' },
  { text: '开始！', delay: 800, bg: 'linear-gradient(160deg, #A7F3D0 0%, #D1FAE5 100%)', color: '#065F46' },
]

export function FullscreenCountdown({ taskContent, onDone }: Props) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (step >= SEQUENCE.length) { onDone(); return }
    const t = setTimeout(() => setStep(s => s + 1), SEQUENCE[step].delay)
    return () => clearTimeout(t)
  }, [step, onDone])

  const current = SEQUENCE[Math.min(step, SEQUENCE.length - 1)]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: current.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 32,
      transition: 'background 0.3s ease',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.7)',
        borderRadius: 16,
        padding: '16px 24px',
        fontSize: 17,
        fontWeight: 600,
        color: '#1a1a1a',
        width: '80%',
        textAlign: 'center',
        backdropFilter: 'blur(4px)',
      }}>
        {taskContent}
      </div>

      <div key={step} style={{
        fontSize: 112,
        fontWeight: 800,
        color: current.color,
        lineHeight: 1,
        animation: 'popIn 0.35s ease-out',
      }}>
        {current.text}
      </div>

      <style>{`
        @keyframes popIn {
          0%   { transform: scale(1.5); opacity: 0; }
          100% { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  )
}
