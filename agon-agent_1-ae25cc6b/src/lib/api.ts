import { BASE, getToken, clearToken, getCred, setCred, clearCred } from './auth'
import type { Message, ServerConfig, Source } from './types'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function authHeaders(): Record<string, string> {
  const t = getToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

function unauth() {
  clearToken()
  window.dispatchEvent(new CustomEvent('astrix:unauth'))
}

export async function api<T = unknown>(route: string, body?: unknown): Promise<T> {
  let r: Response
  try {
    r = await fetch(`${BASE}?r=${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: authHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection.', 0)
  }
  const j = await r.json().catch(() => ({}))
  if (r.status === 401 && route !== 'login') unauth()
  if (!r.ok) throw new ApiError(j.error || `Request failed (${r.status})`, r.status)
  return j as T
}

export const getConfig = () => api<ServerConfig>('config')

export async function changePassword(current: string, next: string) {
  const j = await api<{ cred?: string; storage?: 'server' | 'device' }>('change', { current, next, cred: getCred() || undefined })
  if (j.storage === 'server') clearCred()
  else if (j.cred) setCred(j.cred)
  return j.storage || 'device'
}
export async function resetPassword(current: string) {
  await api('reset', { current, cred: getCred() || undefined })
  clearCred()
}

// ───────── chat streaming ─────────
export interface WireMessage {
  role: 'user' | 'assistant'
  content: string
  images?: { name: string; dataUrl: string }[]
}

export function toWire(messages: Message[]): WireMessage[] {
  const usable = messages.filter((m) => !(m.role === 'assistant' && !m.content.trim()))
  let lastImg = -1
  usable.forEach((m, i) => { if (m.attachments?.some((a) => a.kind === 'image' && a.dataUrl)) lastImg = i })
  const last = usable.length - 1
  return usable.slice(-40).map((m) => {
    const idx = usable.indexOf(m)
    let content = m.content
    for (const a of m.attachments || []) {
      if (!a.text) continue
      const cap = idx === last ? 40000 : 6000
      const label = a.textLabel || 'Attached file'
      content += `\n\n[Attached ${label}: ${a.name}]\n\`\`\`\n${a.text.slice(0, cap)}\n\`\`\``
    }
    for (const a of m.attachments || []) {
      if (a.kind === 'image' && !a.text && idx !== lastImg) content += `\n\n[Attached image: ${a.name} (shown earlier)]`
    }
    const w: WireMessage = { role: m.role, content }
    if (idx === lastImg) w.images = (m.attachments || []).filter((a) => a.kind === 'image' && a.dataUrl).map((a) => ({ name: a.name, dataUrl: a.dataUrl as string }))
    return w
  })
}

export interface StreamHandlers {
  onStatus?: (t: string) => void
  onSources?: (s: Source[]) => void
  onMeta?: (model: string) => void
  onToken: (t: string) => void
}

export async function streamChat(body: Record<string, unknown>, h: StreamHandlers, signal: AbortSignal) {
  let r: Response
  try {
    r = await fetch(`${BASE}?r=chat`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body), signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError('Cannot reach the server. Check your connection.', 0)
  }
  if (r.status === 401) { unauth(); throw new ApiError('Session expired. Please sign in again.', 401) }
  if (!r.ok || !r.body) {
    const j = await r.json().catch(() => ({}))
    throw new ApiError(j.error || `Request failed (${r.status})`, r.status)
  }
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i)
      buf = buf.slice(i + 2)
      const line = block.split('\n').find((l) => l.startsWith('data:'))
      if (!line) continue
      let ev: { type: string; text?: string; sources?: Source[]; model?: string; error?: string }
      try { ev = JSON.parse(line.slice(5).trim()) } catch { continue }
      if (ev.type === 'token' && ev.text) h.onToken(ev.text)
      else if (ev.type === 'status') h.onStatus?.(ev.text || '')
      else if (ev.type === 'sources' && ev.sources) h.onSources?.(ev.sources)
      else if (ev.type === 'meta' && ev.model) h.onMeta?.(ev.model)
      else if (ev.type === 'error') throw new ApiError(ev.error || 'The AI request failed.', 500)
    }
  }
}
