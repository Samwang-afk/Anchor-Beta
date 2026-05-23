import type { Tab } from '../App'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'launch',      label: '启动',  icon: '⚡' },
  { id: 'vine',        label: '藤蔓',  icon: '🌿' },
  { id: 'achievement', label: '成就',  icon: '🏆' },
  { id: 'settings',   label: '设置',  icon: '⚙️' },
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
          <span className="nav-tab-icon">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
