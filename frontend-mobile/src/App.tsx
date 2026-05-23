import { useState } from 'react'
import { BottomNav } from './components/BottomNav'
import { LaunchPage } from './pages/LaunchPage'
import { VinePage } from './pages/VinePage'
import { AchievementPage } from './pages/AchievementPage'
import { SettingsPage } from './pages/SettingsPage'

export type Tab = 'launch' | 'vine' | 'achievement' | 'settings'

export default function App() {
  const [tab, setTab] = useState<Tab>('launch')

  return (
    <div className="app">
      <div className="page-content">
        {tab === 'launch' && <LaunchPage />}
        {tab === 'vine' && <VinePage />}
        {tab === 'achievement' && <AchievementPage />}
        {tab === 'settings' && <SettingsPage />}
      </div>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}
