import { useEffect, useState } from 'react'
import { getStats, getAllTasks, type Stats } from '../db'

function fmtTime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h${m}m`
  return `${m}分钟`
}

export function AchievementPage() {
  const [stats, setStats]   = useState<Stats | null>(null)
  const [heatmap, setHeatmap] = useState<Record<string, number>>({})

  useEffect(() => {
    getStats().then(setStats)
    getAllTasks().then(tasks => {
      const map: Record<string, number> = {}
      tasks.filter(t => t.completed_at).forEach(t => {
        const day = new Date(t.completed_at!).toISOString().slice(0, 10)
        map[day] = (map[day] ?? 0) + 1
      })
      setHeatmap(map)
    })
  }, [])

  // 最近 49 天（7×7 格）
  const days: string[] = []
  for (let i = 48; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }

  return (
    <div style={{ padding: '0 16px 24px' }}>
      <h1 className="page-header" style={{ padding: '20px 0 20px' }}>成就</h1>

      {stats && (
        <div className="stats-grid">
          {[
            { label: '专注时长', value: fmtTime(stats.total_focus_seconds) },
            { label: '开始次数', value: `${stats.total_starts}` },
            { label: '完成次数', value: `${stats.total_completions}` },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <p className="section-label">最近 7 周打卡记录</p>
        <div className="heatmap">
          {days.map(d => {
            const count   = heatmap[d] ?? 0
            const opacity = count === 0 ? 0.07 : Math.min(0.15 + count * 0.25, 1)
            return (
              <div
                key={d}
                className="heatmap-cell"
                style={{ backgroundColor: `rgba(245,158,11,${opacity})` }}
                title={`${d}：${count} 次`}
              />
            )
          })}
        </div>
      </div>

      {stats && (
        <div className="points-banner" style={{ marginTop: 24 }}>
          <p style={{ fontSize: 13, color: 'var(--orange)' }}>当前积分</p>
          <p style={{ fontSize: 48, fontWeight: 800, color: 'var(--orange)', lineHeight: 1.1, marginTop: 4 }}>
            {stats.points}
          </p>
        </div>
      )}
    </div>
  )
}
