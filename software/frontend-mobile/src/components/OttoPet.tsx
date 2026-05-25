interface Props {
  mood?: 'neutral' | 'happy'
  size?: number
}

export function OttoPet({ mood = 'neutral', size = 80 }: Props) {
  const inner = size * 0.7
  return (
    <div style={{
      width: size, height: size,
      background: '#fff',
      borderRadius: Math.round(size * 0.22),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 4px 20px rgba(0,0,0,0.13)',
      flexShrink: 0,
    }}>
      <svg width={inner} height={inner} viewBox="0 0 60 60" fill="none">
        <rect x="4" y="4" width="52" height="52" rx="16" fill="#7B4728" />
        <ellipse cx="30" cy="13" rx="20" ry="5" fill="rgba(255,255,255,0.12)" />
        <circle cx="22" cy="26" r="4.5" fill="#1a0800" />
        <circle cx="38" cy="26" r="4.5" fill="#1a0800" />
        <circle cx="23.5" cy="24.2" r="1.6" fill="white" opacity="0.65" />
        <circle cx="39.5" cy="24.2" r="1.6" fill="white" opacity="0.65" />
        {mood === 'happy' && (
          <path d="M20 37 Q30 46 40 37" stroke="#1a0800" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        )}
      </svg>
    </div>
  )
}
