export interface Attachment {
  id: string
  kind: 'image' | 'file'
  name: string
  mime: string
  size: number
  /** Full-size (compressed) image, memory only — never persisted */
  dataUrl?: string
  /** Small preview that is persisted with history */
  thumb?: string
  /** Extracted text (documents) or OCR text (images) */
  text?: string
  textLabel?: string
  note?: string
}

export interface Source {
  title: string
  url: string
  domain: string
  kind?: 'search' | 'page' | 'video' | 'social' | 'file' | string
  ok?: boolean
  snippet?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  attachments?: Attachment[]
  sources?: Source[]
  error?: string
  model?: string
  status?: string
  streaming?: boolean
}

export interface Chat {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  autoTitled?: boolean
}

export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly'
export type Priority = 'low' | 'medium' | 'high'

export interface Task {
  id: string
  title: string
  notes: string
  /** local datetime 'YYYY-MM-DDTHH:mm' or null */
  due: string | null
  durationMin: number | null
  priority: Priority
  done: boolean
  completedAt: string | null
  repeat: Repeat
  interval: number
  days: number[]
  completions: string[]
  createdAt: number
}

export interface Memory {
  id: string
  text: string
  source: 'auto' | 'manual'
  createdAt: number
}

export type WebMode = 'auto' | 'on' | 'off'

export interface Settings {
  userName: string
  model: string
  temperature: number
  style: 'concise' | 'balanced' | 'detailed'
  customInstructions: string
  webSearch: WebMode
  autoMemory: boolean
  useMemory: boolean
  notifications: boolean
}

export interface ServerConfig {
  defaultModel: string
  provider: string
  keyless: boolean
  models: { id: string; label: string; provider: string; vision: boolean }[]
  vision: boolean
  search: string
  searchKeyed: boolean
  database: boolean
  passwordStorage: 'server' | 'device'
  passwordFromEnv: boolean
}

export const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))
