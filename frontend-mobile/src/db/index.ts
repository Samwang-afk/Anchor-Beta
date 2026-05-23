import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export interface Task {
  id?: number
  category_id: number
  content: string
  started_at: number
  completed_at?: number
  duration_seconds?: number
}

export interface Category {
  id?: number
  name: string
  color: string
}

export interface Stats {
  id: 1
  total_focus_seconds: number
  total_starts: number
  total_completions: number
  points: number
}

// AI 生成的单条待办（含预估时间）
export interface SessionTask {
  content: string
  estimatedMinutes: number
  done?: boolean        // 是否已完成
  completedAt?: number  // 完成时间戳
  durationSeconds?: number // 实际耗时
}

// 一次"整理思绪"产生的完整会话
export interface TaskSession {
  id?: number
  created_at: number    // 生成时间
  input_text: string    // 用户原始输入
  tasks: SessionTask[]  // 任务列表
}

interface AppDB extends DBSchema {
  tasks:         { key: number; value: Task;         indexes: { by_category: number } }
  categories:    { key: number; value: Category }
  stats:         { key: number; value: Stats }
  task_sessions: { key: number; value: TaskSession }
}

let _db: IDBPDatabase<AppDB> | null = null

async function db() {
  if (_db) return _db
  _db = await openDB<AppDB>('adhd-app', 2, {
    upgrade(db, oldVersion) {
      // v1：创建原始 3 张表
      if (oldVersion < 1) {
        const tasks = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true })
        tasks.createIndex('by_category', 'category_id')
        db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true })
        db.createObjectStore('stats', { keyPath: 'id' })
      }
      // v2：新增任务会话表
      if (oldVersion < 2) {
        db.createObjectStore('task_sessions', { keyPath: 'id', autoIncrement: true })
      }
    },
  })
  return _db
}

const DEFAULT_STATS: Stats = {
  id: 1,
  total_focus_seconds: 0,
  total_starts: 0,
  total_completions: 0,
  points: 0,
}

export async function getStats(): Promise<Stats> {
  return (await (await db()).get('stats', 1)) ?? DEFAULT_STATS
}

export async function addTask(task: Omit<Task, 'id'>): Promise<number> {
  return (await db()).add('tasks', task)
}

export async function completeTask(id: number, duration_seconds: number) {
  const d = await db()
  const task = await d.get('tasks', id)
  if (!task) return
  await d.put('tasks', { ...task, completed_at: Date.now(), duration_seconds })
  const stats = await getStats()
  await d.put('stats', {
    ...stats,
    total_focus_seconds: stats.total_focus_seconds + duration_seconds,
    total_completions:   stats.total_completions + 1,
    points:              stats.points + Math.floor(duration_seconds / 60) + 10,
  })
}

export async function incrementStarts() {
  const d = await db()
  const stats = await getStats()
  await d.put('stats', { ...stats, total_starts: stats.total_starts + 1 })
}

export async function addCategory(name: string, color: string): Promise<number> {
  return (await db()).add('categories', { name, color })
}

export async function getCategories(): Promise<Category[]> {
  return (await db()).getAll('categories')
}

export async function getTasksByCategory(category_id: number): Promise<Task[]> {
  return (await db()).getAllFromIndex('tasks', 'by_category', category_id)
}

export async function getAllTasks(): Promise<Task[]> {
  return (await db()).getAll('tasks')
}

// ══════════════════════════════════
//  任务会话（AI 生成的任务批次）
// ══════════════════════════════════

/** 创建新会话，保存 AI 返回的完整任务列表 */
export async function createSession(inputText: string, tasks: { content: string; estimatedMinutes: number }[]): Promise<number> {
  const session: Omit<TaskSession, 'id'> = {
    created_at: Date.now(),
    input_text: inputText,
    tasks: tasks.map(t => ({ content: t.content, estimatedMinutes: t.estimatedMinutes, done: false })),
  }
  return (await db()).add('task_sessions', session)
}

/** 获取会话详情 */
export async function getSession(id: number): Promise<TaskSession | undefined> {
  return (await db()).get('task_sessions', id)
}

/** 标记会话中某条任务为已完成 */
export async function completeSessionTask(sessionId: number, taskIndex: number, durationSeconds: number) {
  const d = await db()
  const session = await d.get('task_sessions', sessionId)
  if (!session) return
  const updatedTasks = [...session.tasks]
  if (updatedTasks[taskIndex]) {
    updatedTasks[taskIndex] = {
      ...updatedTasks[taskIndex],
      done: true,
      completedAt: Date.now(),
      durationSeconds,
    }
  }
  await d.put('task_sessions', { ...session, tasks: updatedTasks })
}
