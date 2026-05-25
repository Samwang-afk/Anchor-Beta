import type { Tab } from '../App'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'launch',      label: '记录',  icon: '/icon1.png' },
  { id: 'vine',        label: '启动',  icon: '/icon2.png' },
  { id: 'achievement', label: '总结',  icon: '/icon3.png' },
  { id: 'settings',   label: '设置',  icon: '/icon4.png' },
]

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="bottom-nav">
      {TABS.map(t => (
        <button
          key={t.id}
          className={`nav-tab ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <img
            src={t.icon}
            style={{
              width: 26, height: 26, objectFit: 'contain',
              opacity: active === t.id ? 1 : 0.45,
              transition: 'opacity 0.15s',
            }}
          />
          {t.label}
        </button>
      ))}
    </nav>
  )
}
