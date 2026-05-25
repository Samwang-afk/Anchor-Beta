import { useMemo } from 'react'

interface Props {
  message: string
  points: number
  hasMoreTasks: boolean
  onClose: () => void
}

export function EncourageModal({ message, points, hasMoreTasks, onClose }: Props) {
  const otterSrc = useMemo(
    () => `/otter${Math.floor(Math.random() * 5) + 1}.png`,
    []
  )
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'linear-gradient(170deg, #fbc8dc 0%, #fecdd3 45%, #fee2e2 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '56px 24px 40px',
      animation: 'fadeIn 0.35s ease',
    }}>
      {/* DONE title with sparkles */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ color: '#be185d', fontSize: 11 }}>✦</span>
          <span style={{ color: '#9f1239', fontSize: 11 }}>✦</span>
        </div>
        <p style={{ fontSize: 20, fontWeight: 800, letterSpacing: 4, color: '#9f1239' }}>DONE！</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 6 }}>
          <span style={{ color: '#be185d', fontSize: 9 }}>✦</span>
          <span style={{ color: '#9f1239', fontSize: 12 }}>✦</span>
          <span style={{ color: '#be185d', fontSize: 9 }}>✦</span>
        </div>
      </div>

      {/* Otto happy */}
      <img src={otterSrc} style={{ width: 100, height: 100, objectFit: 'contain' }} />

      {/* Encouragement card */}
      <div style={{
        marginTop: 28,
        background: 'rgba(255,255,255,0.82)',
        borderRadius: 20,
        padding: '20px 24px',
        width: '100%',
        textAlign: 'center',
        backdropFilter: 'blur(6px)',
      }}>
        <p style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.85, color: '#1a1a1a' }}>
          {message}
        </p>
        <p style={{ marginTop: 10, fontSize: 13, color: '#9f1239', fontStyle: 'italic' }}>— Otto</p>
      </div>

      {/* Points */}
      <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: '#0f766e' }}>+{points}</span>
        <img src="/otter-coin.png" style={{ width: 32, height: 32, objectFit: 'contain' }} />
      </div>

      {/* Button */}
      <button
        onClick={onClose}
        style={{
          marginTop: 'auto',
          width: '100%',
          padding: '16px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.9)',
          border: 'none',
          fontSize: 16,
          fontWeight: 600,
          color: '#1a1a1a',
          cursor: 'pointer',
          boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
        }}
      >
        {hasMoreTasks ? '继续冲！' : '收下，回首页'}
      </button>
    </div>
  )
}
