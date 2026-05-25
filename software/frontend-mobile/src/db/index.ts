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
  created_at: number           // 生成时间
  input_text: string           // 用户原始输入
  tasks: SessionTask[]         // 任务列表
  suggestedTaskIndex?: number  // AI 推荐的最重要最紧急任务序号
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
  _db = await openDB<AppDB>('focusdock', 2, {
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
export async function createSession(
  inputText: string,
  tasks: { content: string; estimatedMinutes: number }[],
  suggestedTaskIndex?: number,
): Promise<number> {
  const session: Omit<TaskSession, 'id'> = {
    created_at: Date.now(),
    input_text: inputText,
    tasks: tasks.map(t => ({ content: t.content, estimatedMinutes: t.estimatedMinutes, done: false })),
    suggestedTaskIndex,
  }
  return (await db()).add('task_sessions', session)
}

/** 获取会话详情 */
export async function getSession(id: number): Promise<TaskSession | undefined> {
  return (await db()).get('task_sessions', id)
}

/** 获取所有会话（最新在前）*/
export async function getAllSessions(): Promise<TaskSession[]> {
  const sessions = await (await db()).getAll('task_sessions')
  return sessions.sort((a, b) => b.created_at - a.created_at)
}

/** 填充演示数据：生成过去 N 天的假会话，用于预览成就页效果 */
export async function seedDemoData(days = 65) {
  const d = await db()
  const inputs = [
    '整理房间，做作业，跑步半小时',
    '准备会议材料，回复邮件，买菜',
    '学习英语，看书，整理笔记',
    '完成项目报告，打电话给朋友',
    '锻炼身体，学新技能，做午饭',
    '清理桌面，写日记，散步',
    '复习课程，整理文档，联系同学',
  ]
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  for (let i = days; i >= 0; i--) {
    if (Math.random() < 0.18) continue          // ~18% 概率跳过某天
    const dayTs = now.getTime() - i * 86400000
    const completions = Math.ceil(Math.random() * 5) // 1-5 次完成
    const taskList = Array.from({ length: completions + 1 }, (_, j) => ({
      content: `示例任务 ${j + 1}`,
      estimatedMinutes: 10 + Math.floor(Math.random() * 20),
      done: j < completions,
      completedAt: j < completions ? dayTs + j * 1200000 : undefined,
      durationSeconds: j < completions ? 300 + Math.floor(Math.random() * 900) : undefined,
    }))
    const session: Omit<TaskSession, 'id'> = {
      created_at: dayTs,
      input_text: inputs[Math.floor(Math.random() * inputs.length)],
      tasks: taskList,
      suggestedTaskIndex: 0,
    }
    await d.add('task_sessions', session)
  }
}

/** 删除所有演示数据（input_text 包含"示例任务"的会话）*/
export async function clearDemoData() {
  const d = await db()
  const all = await d.getAll('task_sessions')
  for (const s of all) {
    if (s.tasks.some(t => t.content.startsWith('示例任务'))) {
      await d.delete('task_sessions', s.id!)
    }
  }
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
