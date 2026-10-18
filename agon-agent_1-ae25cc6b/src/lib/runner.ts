import { api, streamChat, toWire } from './api'
import { useStore } from './store'
import { useUI } from './ui'
import type { Attachment, Message } from './types'
import { uid } from './types'

const controllers = new Map<string, AbortController>()
export const isRunning = (chatId: string) => controllers.has(chatId)
export function stopChat(chatId: string) { controllers.get(chatId)?.abort() }

const MEMORY_HINT = /\b(i|i'm|im|i've|my|mine|me|we|our|remember|prefer|like|love|hate|always|never|every|weekly|daily|schedule|study|school|grade|working on|goal|favorite|favourite)\b/i

export async function sendMessage(chatId: string | null, text: string, attachments: Attachment[]) {
  const st = useStore.getState()
  const id = chatId && st.chats.some((c) => c.id === chatId) ? chatId : st.createChat()
  const user: Message = { id: uid(), role: 'user', content: text, createdAt: Date.now(), attachments: attachments.length ? attachments : undefined }
  useStore.getState().addMessage(id, user)
  const chat = useStore.getState().chats.find((c) => c.id === id)!
  if (chat.messages.length === 1) {
    const t = (text || attachments[0]?.name || 'New chat').replace(/\s+/g, ' ').trim()
    useStore.getState().renameChat(id, t.length > 42 ? t.slice(0, 42) + '…' : t, false)
  }
  await run(id)
  return id
}

export async function regenerate(chatId: string) {
  const chat = useStore.getState().chats.find((c) => c.id === chatId)
  if (!chat || isRunning(chatId)) return
  const last = chat.messages[chat.messages.length - 1]
  if (last?.role === 'assistant') useStore.getState().removeMessage(chatId, last.id)
  await run(chatId)
}

async function run(chatId: string) {
  const store = useStore.getState
  const history = store().chats.find((c) => c.id === chatId)!.messages
  const aId = uid()
  store().addMessage(chatId, { id: aId, role: 'assistant', content: '', createdAt: Date.now(), streaming: true, status: 'Thinking…' })
  const patch = (p: Partial<Message>) => useStore.getState().patchMessage(chatId, aId, p)

  const ctl = new AbortController()
  controllers.set(chatId, ctl)
  const s = store().settings
  const cfg = useUI.getState().config
  let acc = ''
  let raf = 0
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; patch({ content: acc, status: '' }) }) }
  let failed = false

  try {
    await streamChat(
      {
        messages: toWire(history),
        model: s.model || cfg?.defaultModel,
        temperature: s.temperature,
        style: s.style,
        customInstructions: s.customInstructions,
        webSearch: s.webSearch,
        userName: s.userName,
        memories: s.useMemory ? store().memories.slice(0, 50).map((m) => m.text) : [],
      },
      {
        onToken: (t) => { acc += t; schedule() },
        onStatus: (t) => { if (!acc) patch({ status: t || 'Thinking…' }) },
        onSources: (src) => patch({ sources: src }),
        onMeta: (m) => patch({ model: m }),
      },
      ctl.signal,
    )
  } catch (e) {
    if ((e as Error).name !== 'AbortError') {
      failed = true
      patch({ error: (e as Error).message || 'Something went wrong.' })
    }
  } finally {
    if (raf) cancelAnimationFrame(raf)
    patch({ content: acc, streaming: false, status: '' })
    controllers.delete(chatId)
  }
  if (failed || ctl.signal.aborted || !acc.trim()) return

  // Background polish: smart title + auto-memory (sequential to be gentle on rate limits)
  const chat = store().chats.find((c) => c.id === chatId)
  const userText = [...(chat?.messages || [])].reverse().find((m) => m.role === 'user')?.content || ''
  const applyTitle = (t: string) => {
    const cur = store().chats.find((c) => c.id === chatId)
    if (cur && !cur.autoTitled) store().renameChat(chatId, t || cur.title, true)
  }
  try {
    if (chat && !chat.autoTitled) {
      const { title } = await api<{ title: string }>('title', { userText: chat.messages[0]?.content || '', assistantText: acc })
      applyTitle(title)
    }
  } catch { applyTitle('') }
  try {
    if ((store().settings.autoMemory || /\bremember\b/i.test(userText)) && userText.length > 12 && MEMORY_HINT.test(userText)) {
      const { items } = await api<{ items: string[] }>('memory', { userText, assistantText: acc, existing: store().memories.slice(0, 40).map((m) => m.text) })
      const added = items.filter((t) => store().addMemory(t, 'auto'))
      if (added.length) useUI.getState().toast(`Saved to memory: ${added[0]}${added.length > 1 ? ` (+${added.length - 1})` : ''}`, 'memory')
    }
  } catch { /* background task, ignore */ }
}
