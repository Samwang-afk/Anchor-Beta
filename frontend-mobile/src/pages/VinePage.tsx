import { useEffect, useState } from 'react'
import { getCategories, getTasksByCategory, addCategory, type Category, type Task } from '../db'
import { VineTimeline } from '../components/VineTimeline'

const PALETTE = ['#7c3aed', '#059669', '#dc2626', '#2563eb', '#d97706', '#db2777']

export function VinePage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [activeId, setActiveId]     = useState<number | null>(null)
  const [nodes, setNodes]           = useState<Task[]>([])
  const [newName, setNewName]       = useState('')

  useEffect(() => {
    getCategories().then(cats => {
      setCategories(cats)
      if (cats.length > 0 && cats[0].id) setActiveId(cats[0].id)
    })
  }, [])

  useEffect(() => {
    if (activeId === null) return
    getTasksByCategory(activeId).then(tasks =>
      setNodes(tasks.filter(t => t.completed_at))
    )
  }, [activeId])

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return
    const color = PALETTE[categories.length % PALETTE.length]
    const id    = await addCategory(name, color)
    const newCat: Category = { id, name, color }
    setCategories(prev => [...prev, newCat])
    setActiveId(id)
    setNewName('')
  }

  const active = categories.find(c => c.id === activeId)

  return (
    <div style={{ padding: '0 16px' }}>
      <h1 className="page-header" style={{ padding: '20px 0 16px' }}>我的藤蔓</h1>

      <div className="cat-tabs">
        {categories.map(c => (
          <button
            key={c.id}
            className={`cat-tab ${activeId === c.id ? 'active' : ''}`}
            style={activeId === c.id ? { backgroundColor: c.color } : {}}
            onClick={() => setActiveId(c.id!)}
          >
            {c.name}
          </button>
        ))}
        <div className="cat-input-row">
          <input
            className="cat-input"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="新类别"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button className="cat-add-btn" onClick={handleAdd}>+</button>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        {categories.length === 0 ? (
          <div className="empty-hint">
            先创建一个类别吧<br />比如「学习」「运动」「工作」
          </div>
        ) : active ? (
          <VineTimeline nodes={nodes} color={active.color} />
        ) : null}
      </div>
    </div>
  )
}
