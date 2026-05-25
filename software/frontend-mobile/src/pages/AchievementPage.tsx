import { useEffect, useState } from 'react'
import { getStats, getAllSessions, seedDemoData, clearDemoData, type Stats } from '../db'

const GRID_W = 11
const GRID_H = 11
const TOTAL = GRID_W * GRID_H

function fmtTime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h${m}m`
  return `${m}分钟`
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(base: Date, n: number) {
  const d = new Date(base)
  d.setDate(d.getDate() + n)
  return d
}

export function AchievementPage() {
  const [stats, setStats]       = useState<Stats | null>(null)
  const [heatmap, setHeatmap]   = useState<Record<string, number>>({})
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [pixelColors, setPixelColors] = useState<Array<[number, number, number]>>([])
  const [seeding, setSeeding]   = useState(false)

  // Sample pixel colors from otter image via offscreen canvas
  useEffect(() => {
    const img = new Image()
    img.src = '/otter-pixel.png'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = GRID_W
      canvas.height = GRID_H
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0, GRID_W, GRID_H)
      const { data } = ctx.getImageData(0, 0, GRID_W, GRID_H)
      const colors: Array<[number, number, number]> = []
      for (let i = 0; i < TOTAL; i++) {
        colors.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]])
      }
      setPixelColors(colors)
    }
  }, [])

  function loadData() {
    getStats().then(setStats)
    getAllSessions().then(sessions => {
      const map: Record<string, number> = {}
      let earliest = Date.now()
      sessions.forEach(session => {
        if (session.created_at < earliest) earliest = session.created_at
        session.tasks
          .filter(t => t.done && t.completedAt)
          .forEach(t => {
            const day = new Date(t.completedAt!).toISOString().slice(0, 10)
            map[day] = (map[day] ?? 0) + 1
          })
      })
      setHeatmap(map)
      const d = new Date(sessions.length > 0 ? earliest : Date.now())
      d.setHours(0, 0, 0, 0)
      setStartDate(d)
    })
  }

  // Load sessions → daily completion counts + earliest start date
  useEffect(() => { loadData() }, [])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const activeDays = startDate
    ? Math.min(Math.floor((today.getTime() - startDate.getTime()) / 86400000) + 1, TOTAL)
    : 0

  const litCells = Array.from({ length: TOTAL }, (_, idx) => {
    if (idx >= activeDays) return 0
    const cellDate = startDate ? dayKey(addDays(startDate, idx)) : ''
    return heatmap[cellDate] ?? 0
  })
  const fullyLit = litCells.filter(c => c >= 5).length

  const gap = 2
  const containerW = Math.min((typeof window !== 'undefined' ? window.innerWidth : 390) - 32, 360)
  const cellSize = Math.floor((containerW - gap * (GRID_W - 1)) / GRID_W)

  return (
    <div style={{ padding: '0 16px 24px' }}>
      <h1 className="page-header" style={{ padding: '20px 0 20px' }}>水獭的宝箱</h1>

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

      {/* Pixel otter reveal grid */}
      <div style={{ marginTop: 28 }}>
        <p className="section-label">水獭打卡图</p>
        <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.38)', marginTop: 2, marginBottom: 12 }}>
          每天完成任务点亮一格，坚持 {TOTAL} 天点亮完整水獭！
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${GRID_W}, ${cellSize}px)`,
          gap,
          width: 'fit-content',
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          {Array.from({ length: TOTAL }, (_, idx) => {
            const count = litCells[idx]
            const isActive = idx < activeDays
            const [r, g, b] = pixelColors[idx] ?? [160, 140, 120]

            let bg: string
            if (!isActive) {
              // Future day: completely dark
              bg = 'rgba(0,0,0,0.06)'
            } else if (count === 0) {
              // Active but no completions: very faint pixel color
              bg = `rgba(${r},${g},${b},0.12)`
            } else {
              // Lit: opacity grows from 0.2 to 1.0 as count goes 1→5
              const opacity = 0.2 + Math.min(count / 5, 1) * 0.8
              bg = `rgba(${r},${g},${b},${opacity})`
            }

            return (
              <div
                key={idx}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: bg,
                  transition: 'background-color 0.4s ease',
                }}
              />
            )
          })}
        </div>

        <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.35)', marginTop: 10 }}>
          已解锁 {activeDays} 天 · 完全点亮 {fullyLit} 格
        </p>
      </div>

      {stats && (
        <div style={{
          marginTop: 24,
          background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
          borderRadius: 20, padding: '16px 18px',
          border: '2px solid rgba(251,191,36,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#92400E' }}>🎁 水獭收集箱</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <img src="/otter-coin.png" style={{ width: 18, height: 18, objectFit: 'contain' }} />
              <span style={{ fontSize: 16, fontWeight: 800, color: '#D97706' }}>{stats.points}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
            {[1, 2, 3, 4].map(n => (
              <div key={n} style={{
                flex: 1, aspectRatio: '1',
                background: 'rgba(255,255,255,0.6)',
                borderRadius: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
              }}>
                <img
                  src={`/otter${n}.png`}
                  style={{ width: '85%', height: '85%', objectFit: 'contain' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 演示数据按钮 */}
      <div style={{ marginTop: 32, display: 'flex', gap: 10 }}>
        <button
          disabled={seeding}
          onClick={async () => {
            setSeeding(true)
            await seedDemoData(65)
            loadData()
            setSeeding(false)
          }}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: '1.5px dashed rgba(0,0,0,0.18)',
            background: 'transparent', fontSize: 13, color: 'rgba(0,0,0,0.45)', cursor: 'pointer',
          }}
        >
          {seeding ? '生成中…' : '填充 65 天演示数据'}
        </button>
        <button
          onClick={async () => {
            await clearDemoData()
            loadData()
          }}
          style={{
            padding: '10px 16px', borderRadius: 10, border: '1.5px dashed rgba(0,0,0,0.12)',
            background: 'transparent', fontSize: 13, color: 'rgba(0,0,0,0.3)', cursor: 'pointer',
          }}
        >
          清除
        </button>
      </div>
    </div>
  )
}
