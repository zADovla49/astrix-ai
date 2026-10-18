import { create } from 'zustand'
import type { ServerConfig } from './types'

export type View = 'chat' | 'planner' | 'memory' | 'settings'
export type ToastKind = 'info' | 'success' | 'error' | 'memory'
export interface Toast { id: number; text: string; kind: ToastKind }

interface UI {
  view: View
  setView: (v: View) => void
  sidebarOpen: boolean
  setSidebarOpen: (o: boolean) => void
  draft: string
  setDraft: (d: string) => void
  config: ServerConfig | null
  setConfig: (c: ServerConfig | null) => void
  toasts: Toast[]
  toast: (text: string, kind?: ToastKind) => void
  dismiss: (id: number) => void
}

let n = 0
export const useUI = create<UI>((set) => ({
  view: 'chat',
  setView: (view) => set({ view, sidebarOpen: false }),
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  draft: '',
  setDraft: (draft) => set({ draft }),
  config: null,
  setConfig: (config) => set({ config }),
  toasts: [],
  toast: (text, kind = 'info') => {
    const id = ++n
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 6500 : 4200)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
