import { useEffect, useState } from 'react'
import { getStats, type Stats } from '../db'
import { useDevice } from '../hooks/useDevice'

const SHOP_ITEMS = [
  { name: '手冲咖啡一杯',   points: 200, emoji: '☕' },
  { name: '贴纸一套',       points: 150, emoji: '🎨' },
  { name: '休息 30 分钟',   points: 100, emoji: '😴' },
  { name: '看一集剧',       points: 300, emoji: '🎬' },
  { name: '水獭周边徽章',   points: 500, emoji: '🦦' },
  { name: '下午茶时光',     points: 250, emoji: '🧋' },
]

const SETTINGS_ITEMS = [
  '硬件连接', '通知', '界面与显示', '帮助与反馈',
  '个性服务', '隐私政策', '使用条款', '更多',
]

function levelInfo(points: number) {
  const level = Math.floor(points / 200) + 1
  const xp    = points % 200
  return { level, xp, xpMax: 200 }
}

export function SettingsPage() {
  const [stats, setStats]       = useState<Stats | null>(null)
  const [showShop, setShowShop] = useState(false)
  const { connected } = useDevice({ onStartSignal: () => {}, onStopSignal: () => {} })

  useEffect(() => { getStats().then(setStats) }, [])

  const { level, xp, xpMax } = stats ? levelInfo(stats.points) : { level: 1, xp: 0, xpMax: 200 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', overflowY: 'auto', background: '#f5f5f3' }}>

      {/* 标题 */}
      <h1 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', padding: '20px 16px 12px', background: '#f5f5f3' }}>设置</h1>

      <div style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 用户卡片 */}
        <div style={{
          background: 'linear-gradient(135deg, #FDE68A 0%, #FCCB8A 100%)',
          borderRadius: 20, padding: '16px 18px',
          display: 'flex', gap: 14, alignItems: 'center',
        }}>
          <img src="/激励水獭.png" style={{ width: 68, height: 68, objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)', marginBottom: 2 }}>用户名称：林晴</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#78350F', marginBottom: 8 }}>
              专注探索者·Lv.{level}
            </p>
            <div style={{ background: 'rgba(255,255,255,0.5)', borderRadius: 999, height: 6, overflow: 'hidden' }}>
              <div style={{
                width: `${(xp / xpMax) * 100}%`, height: '100%',
                background: '#F59E0B', borderRadius: 999, transition: 'width 0.5s ease',
              }} />
            </div>
            <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 4 }}>
              经验值 {xp}/{xpMax}
            </p>
          </div>
        </div>

        {/* 状态栏 */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: '设备状态', value: connected ? '已连接' : '未连接', color: connected ? '#059669' : '#9ca3af', onClick: undefined },
            { label: '提示音',   value: '柔和音阶', color: '#1a1a1a', onClick: undefined },
            { label: 'OTTO币',  value: String(stats?.points ?? '—'), color: '#D97706', onClick: undefined },
            { label: '水獭商城', value: '🛍️', color: '#1a1a1a', onClick: () => setShowShop(true) },
          ].map(item => (
            <div
              key={item.label}
              onClick={item.onClick}
              style={{
                flex: 1, background: '#fff', borderRadius: 14,
                padding: '10px 6px', textAlign: 'center',
                cursor: item.onClick ? 'pointer' : 'default',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}
            >
              <p style={{ fontSize: 14, fontWeight: 700, color: item.color, lineHeight: 1.3 }}>{item.value}</p>
              <p style={{ fontSize: 10, color: 'rgba(0,0,0,0.42)', marginTop: 3 }}>{item.label}</p>
            </div>
          ))}
        </div>

        {/* 分区标签 */}
        <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,0.38)', paddingLeft: 4, marginBottom: -4 }}>搜索</p>

        {/* 设置列表 */}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {SETTINGS_ITEMS.map((item, i) => (
            <div
              key={item}
              onClick={() => alert('敬请期待')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '15px 18px',
                borderBottom: i < SETTINGS_ITEMS.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 15, color: '#1a1a1a' }}>{item}</span>
              <span style={{ color: 'rgba(0,0,0,0.28)', fontSize: 18, lineHeight: 1 }}>›</span>
            </div>
          ))}
        </div>
      </div>

      {/* 水獭商城底部弹窗 */}
      {showShop && (
        <div
          onClick={() => setShowShop(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.38)',
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', background: '#fff',
              borderRadius: '20px 20px 0 0',
              padding: '20px 16px 48px',
              maxHeight: '72vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <p style={{ fontWeight: 700, fontSize: 18 }}>🛍️ 水獭商城</p>
              <button
                onClick={() => setShowShop(false)}
                style={{ color: 'rgba(0,0,0,0.35)', fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
              >✕</button>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.42)', marginBottom: 16 }}>
              当前 OTTO 币：{stats?.points ?? 0} <img src="/otter-coin.png" style={{ width: 16, height: 16, objectFit: 'contain', verticalAlign: 'middle' }} />
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {SHOP_ITEMS.map(item => {
                const canAfford = (stats?.points ?? 0) >= item.points
                return (
                  <div key={item.name} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: '#fafaf8', borderRadius: 14, padding: '12px 14px',
                  }}>
                    <span style={{ fontSize: 28 }}>{item.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 600, fontSize: 15 }}>{item.name}</p>
                      <p style={{ fontSize: 13, color: '#D97706', marginTop: 2 }}>{item.points} OTTO 币</p>
                    </div>
                    <button
                      onClick={() => alert('敬请期待！')}
                      style={{
                        padding: '7px 16px', borderRadius: 999, border: 'none',
                        background: canAfford ? '#FBBF24' : 'rgba(0,0,0,0.07)',
                        color: canAfford ? '#fff' : 'rgba(0,0,0,0.28)',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      兑换
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
