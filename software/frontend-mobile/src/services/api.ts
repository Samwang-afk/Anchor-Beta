const BASE = '/api'

export interface Task {
  content: string
  estimatedMinutes: number
  sessionIndex?: number
}

export interface OrganizeResult {
  tasks: Task[]
  suggestedTaskIndex: number
}

export async function organizeThoughts(text: string, inspiration?: string[]): Promise<OrganizeResult> {
  const res = await fetch(`${BASE}/organize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, inspiration }),
  })
  if (!res.ok) {
    throw new Error(`服务器异常 (${res.status})，请检查后端是否启动`)
  }
  const data = await res.json()
  return { tasks: data.tasks ?? [], suggestedTaskIndex: data.suggestedTaskIndex ?? 0 }
}

export async function getEncouragement(task: string, duration: number): Promise<string> {
  const res = await fetch(`${BASE}/encourage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, duration }),
  })
  const data = await res.json()
  return data.message ?? '太棒了，你做到了！'
}

export async function transcribeAudio(pcmData: ArrayBuffer): Promise<string> {
  const res = await fetch(`${BASE}/stt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: pcmData,
  })
  const data = await res.json()
  return data.text ?? ''
}
