import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Attachment, Chat, Memory, Message, Settings, Task } from './types'
import { uid } from './types'
import { fmtLocal, firstDue, nextDue } from './recurrence'

// Debounced localStorage so token streaming doesn't hammer disk; flushed on hide/unload.
const pending: Record<string, string> = {}
let timer: number | undefined
function flush() {
  for (const k of Object.keys(pending)) {
    try { localStorage.setItem(k, pending[k]) } catch { window.dispatchEvent(new CustomEvent('astrix:quota')) }
    delete pending[k]
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flush)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
}
const debouncedStorage = {
  getItem: (k: string) => localStorage.getItem(k),
  setItem: (k: string, v: string) => { pending[k] = v; window.clearTimeout(timer); timer = window.setTimeout(flush, 350) },
  removeItem: (k: string) => { delete pending[k]; localStorage.removeItem(k) },
}

export const DEFAULT_SETTINGS: Settings = {
  userName: 'Abdulloh',
  model: '',
  temperature: 0.7,
  style: 'balanced',
  customInstructions: '',
  webSearch: 'auto',
  autoMemory: true,
  useMemory: true,
  notifications: false,
}

interface State {
  chats: Chat[]
  activeChatId: string | null
  tasks: Task[]
  memories: Memory[]
  settings: Settings

  setActive: (id: string | null) => void
  createChat: (title?: string) => string
  renameChat: (id: string, title: string, final?: boolean) => void
  deleteChat: (id: string) => void
  clearChats: () => void
  addMessage: (chatId: string, m: Message) => void
  patchMessage: (chatId: string, id: string, patch: Partial<Message>) => void
  removeMessage: (chatId: string, id: string) => void

  addTask: (t: Partial<Task> & { title: string }) => Task
  updateTask: (id: string, patch: Partial<Task>) => void
  deleteTask: (id: string) => void
  completeTask: (id: string) => void
  skipTask: (id: string) => void

  addMemory: (text: string, source: Memory['source']) => boolean
  updateMemory: (id: string, text: string) => void
  deleteMemory: (id: string) => void
  clearMemories: () => void

  updateSettings: (p: Partial<Settings>) => void
  importData: (data: unknown) => boolean
  resetAll: () => void
}

const touch = (c: Chat): Chat => ({ ...c, updatedAt: Date.now() })

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      chats: [],
      activeChatId: null,
      tasks: [],
      memories: [],
      settings: DEFAULT_SETTINGS,

      setActive: (id) => set({ activeChatId: id }),
      createChat: (title = 'New chat') => {
        const c: Chat = { id: uid(), title, messages: [], createdAt: Date.now(), updatedAt: Date.now() }
        set((s) => ({ chats: [c, ...s.chats], activeChatId: c.id }))
        return c.id
      },
      renameChat: (id, title, final = true) =>
        set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, title: title.trim() || 'Untitled chat', autoTitled: final } : c)) })),
      deleteChat: (id) =>
        set((s) => ({ chats: s.chats.filter((c) => c.id !== id), activeChatId: s.activeChatId === id ? null : s.activeChatId })),
      clearChats: () => set({ chats: [], activeChatId: null }),
      addMessage: (chatId, m) =>
        set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? touch({ ...c, messages: [...c.messages, m] }) : c)) })),
      patchMessage: (chatId, id, patch) =>
        set((s) => ({
          chats: s.chats.map((c) => (c.id === chatId ? { ...c, messages: c.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) } : c)),
        })),
      removeMessage: (chatId, id) =>
        set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== id) } : c)) })),

      addTask: (t) => {
        const base: Task = {
          id: uid(), notes: '', due: null, durationMin: null, priority: 'medium', done: false, completedAt: null,
          repeat: 'none', interval: 1, days: [], completions: [], createdAt: Date.now(), ...t,
        }
        const task: Task = { ...base, due: firstDue(base) }
        set((s) => ({ tasks: [task, ...s.tasks] }))
        return task
      },
      updateTask: (id, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== id) return t
            const merged = { ...t, ...patch }
            if (merged.repeat !== 'none' && ('due' in patch || 'repeat' in patch || 'days' in patch)) merged.due = firstDue(merged)
            if (merged.repeat !== 'none') { merged.done = false; merged.completedAt = null }
            return merged
          }),
        })),
      deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
      completeTask: (id) =>
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== id) return t
            const nowIso = new Date().toISOString()
            if (t.repeat === 'none') return t.done ? { ...t, done: false, completedAt: null } : { ...t, done: true, completedAt: nowIso }
            return { ...t, completions: [...t.completions, nowIso], due: nextDue(t) }
          }),
        })),
      skipTask: (id) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id && t.repeat !== 'none' ? { ...t, due: nextDue(t) } : t)) })),

      addMemory: (text, source) => {
        const clean = text.trim()
        if (!clean) return false
        const dup = get().memories.some((m) => m.text.toLowerCase() === clean.toLowerCase())
        if (dup) return false
        set((s) => ({ memories: [{ id: uid(), text: clean, source, createdAt: Date.now() }, ...s.memories].slice(0, 200) }))
        return true
      },
      updateMemory: (id, text) => set((s) => ({ memories: s.memories.map((m) => (m.id === id ? { ...m, text: text.trim() || m.text } : m)) })),
      deleteMemory: (id) => set((s) => ({ memories: s.memories.filter((m) => m.id !== id) })),
      clearMemories: () => set({ memories: [] }),

      updateSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
      importData: (data) => {
        try {
          const d = data as { chats?: Chat[]; tasks?: Task[]; memories?: Memory[]; settings?: Partial<Settings> }
          if (!d || typeof d !== 'object') return false
          set((s) => ({
            chats: Array.isArray(d.chats) ? d.chats : s.chats,
            tasks: Array.isArray(d.tasks) ? d.tasks : s.tasks,
            memories: Array.isArray(d.memories) ? d.memories : s.memories,
            settings: d.settings ? { ...s.settings, ...d.settings } : s.settings,
            activeChatId: null,
          }))
          return true
        } catch { return false }
      },
      resetAll: () => set({ chats: [], tasks: [], memories: [], settings: DEFAULT_SETTINGS, activeChatId: null }),
    }),
    {
      name: 'astrix.data.v1',
      version: 1,
      storage: createJSONStorage(() => debouncedStorage),
      partialize: (s) => ({
        chats: s.chats.map((c) => ({
          ...c,
          messages: c.messages.map((m) => ({
            ...m,
            streaming: false,
            status: undefined,
            attachments: m.attachments?.map((a: Attachment) => ({ ...a, dataUrl: undefined, text: a.text ? a.text.slice(0, 12000) : undefined })),
          })),
        })),
        activeChatId: s.activeChatId,
        tasks: s.tasks,
        memories: s.memories,
        settings: s.settings,
      }) as State,
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<State>
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...(p.settings || {}) } }
      },
    },
  ),
)

export const todayStamp = () => fmtLocal(new Date())
