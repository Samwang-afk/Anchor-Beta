import type { Task } from '../services/api'

const COLOR_CLASSES = [
  'sticky-yellow',
  'sticky-green',
  'sticky-pink',
  'sticky-blue',
  'sticky-orange',
]

interface Props {
  task: Task
  index: number
  selected: boolean
  onClick: () => void
}

export function TaskStickyNote({ task, index, selected, onClick }: Props) {
  const colorClass = COLOR_CLASSES[index % COLOR_CLASSES.length]
  return (
    <button
      className={`sticky-note ${colorClass} ${selected ? 'selected' : ''}`}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 700,
        background: 'rgba(0,0,0,0.12)',
        flexShrink: 0,
      }}>
        {selected ? '✓' : index}
      </span>
      <span style={{ flex: 1, lineHeight: 1.4 }}>
        {task.content}
      </span>
      <span style={{
        fontSize: 12,
        padding: '2px 10px',
        borderRadius: 20,
        background: 'rgba(0,0,0,0.1)',
        fontWeight: 600,
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}>
        ⏱ {task.estimatedMinutes}分钟
      </span>
    </button>
  )
}
