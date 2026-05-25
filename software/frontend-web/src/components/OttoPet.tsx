interface Props {
  mood?: 'neutral' | 'happy'
  size?: number
}

export function OttoPet({ mood = 'neutral', size = 80 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <rect width="80" height="80" rx="20" fill="#7B4728" />
      <ellipse cx="28" cy="34" rx="7" ry="8" fill="white" />
      <ellipse cx="52" cy="34" rx="7" ry="8" fill="white" />
      <ellipse cx="28" cy="35" rx="4" ry="5" fill="#2d1a0e" />
      <ellipse cx="52" cy="35" rx="4" ry="5" fill="#2d1a0e" />
      {mood === 'happy' ? (
        <path d="M28 54 Q40 64 52 54" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" />
      ) : (
        <path d="M30 56 Q40 60 50 56" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      )}
    </svg>
  )
}
