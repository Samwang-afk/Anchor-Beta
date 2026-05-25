import type { Task } from '../db'

interface Props {
  nodes: Task[]
  color: string
}

export function VineTimeline({ nodes, color }: Props) {
  if (nodes.length === 0) {
    return (
      <div className="empty-hint">
        还没有记录<br />完成一个任务后<br />这里会长出第一个节点 🌱
      </div>
    )
  }

  const sorted = [...nodes].sort((a, b) => (a.completed_at ?? 0) - (b.completed_at ?? 0))

  return (
    <div className="vine-list">
      <div className="vine-sprout">🌱</div>
      {sorted.map((node, i) => (
        <div key={node.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          <div className="vine-stem" style={{ backgroundColor: color }} />
          <div className="vine-node">
            <div className="vine-dot" style={{ backgroundColor: color }} />
            <div className="vine-card">
              <p style={{ fontSize: 14, fontWeight: 500 }}>{node.content}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {new Date(node.completed_at!).toLocaleDateString('zh-CN')}
                {' · '}
                {Math.round((node.duration_seconds ?? 0) / 60)} 分钟
              </p>
            </div>
          </div>
          {i === sorted.length - 1 && (
            <div className="vine-stem" style={{ backgroundColor: color, opacity: 0.15 }} />
          )}
        </div>
      ))}
    </div>
  )
}
