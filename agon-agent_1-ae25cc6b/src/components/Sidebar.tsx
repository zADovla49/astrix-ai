import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BrainCircuit, Check, ListChecks, LogOut, MessageSquare, Pencil, Plus, Search, Settings, Trash2, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { useUI, type View } from '../lib/ui'
import { bucketOf } from '../lib/recurrence'
import type { Chat } from '../lib/types'
import { Confirm, Logo, Wordmark } from './ui'

function group(chats: Chat[]) {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const t = start.getTime(), day = 864e5
  const g: Record<string, Chat[]> = { Today: [], Yesterday: [], 'Previous 7 days': [], Earlier: [] }
  for (const c of chats) {
    if (c.updatedAt >= t) g.Today.push(c)
    else if (c.updatedAt >= t - day) g.Yesterday.push(c)
    else if (c.updatedAt >= t - 7 * day) g['Previous 7 days'].push(c)
    else g.Earlier.push(c)
  }
  return Object.entries(g).filter(([, v]) => v.length)
}

function ChatRow({ chat, active, onOpen }: { chat: Chat; active: boolean; onOpen: () => void }) {
  const { renameChat, deleteChat } = useStore.getState()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(chat.title)
  const [confirm, setConfirm] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select() } }, [editing])
  const save = () => { renameChat(chat.id, val); setEditing(false) }

  return (
    <>
      <motion.div layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} className={`group relative flex items-center rounded-xl transition-colors ${active ? 'bg-gold/10 shadow-[inset_2px_0_0_#d4af37]' : 'hover:bg-hover'}`}>
        {editing ? (
          <div className="flex w-full items-center gap-1 p-1.5">
            <input ref={ref} value={val} maxLength={80} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(chat.title); setEditing(false) } }} className="field !rounded-lg !px-2.5 !py-1.5 !text-[13px]" aria-label="Rename chat" />
            <button className="icon-btn !h-7 !w-7 !text-ok" onClick={save} aria-label="Save name"><Check size={15} /></button>
            <button className="icon-btn !h-7 !w-7" onClick={() => { setVal(chat.title); setEditing(false) }} aria-label="Cancel"><X size={15} /></button>
          </div>
        ) : (
          <>
            <button onClick={onOpen} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left">
              <MessageSquare size={14} className={active ? 'shrink-0 text-gold' : 'shrink-0 text-dim'} />
              <span className={`truncate text-[13px] ${active ? 'font-semibold text-cream' : 'text-mute group-hover:text-cream'}`}>{chat.title}</span>
            </button>
            <div className="mr-1 flex shrink-0 gap-0.5 md:hidden md:group-hover:flex">
              <button className="icon-btn !h-7 !w-7" onClick={() => { setVal(chat.title); setEditing(true) }} aria-label="Rename chat"><Pencil size={13} /></button>
              <button className="icon-btn !h-7 !w-7 hover:!text-danger" onClick={() => setConfirm(true)} aria-label="Delete chat"><Trash2 size={13} /></button>
            </div>
          </>
        )}
      </motion.div>
      <Confirm open={confirm} onClose={() => setConfirm(false)} title="Delete this chat?" message={`“${chat.title}” and all of its messages will be permanently removed.`} onConfirm={() => deleteChat(chat.id)} />
    </>
  )
}

export default function Sidebar({ onLogout }: { onLogout: () => void }) {
  const chats = useStore((s) => s.chats)
  const tasks = useStore((s) => s.tasks)
  const memCount = useStore((s) => s.memories.length)
  const activeId = useStore((s) => s.activeChatId)
  const name = useStore((s) => s.settings.userName)
  const { view, setView, setSidebarOpen } = useUI()
  const [q, setQ] = useState('')

  const dueCount = useMemo(() => tasks.filter((t) => { const b = bucketOf(t); return b === 'today' || b === 'overdue' }).length, [tasks])
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)
    return s ? list.filter((c) => c.title.toLowerCase().includes(s) || c.messages.some((m) => m.content.toLowerCase().includes(s))) : list
  }, [chats, q])
  const groups = useMemo(() => group(filtered), [filtered])

  const open = (id: string | null) => { useStore.getState().setActive(id); setView('chat') }
  const nav: { v: View; label: string; icon: typeof ListChecks; badge?: number }[] = [
    { v: 'planner', label: 'Planner', icon: ListChecks, badge: dueCount },
    { v: 'memory', label: 'Memory', icon: BrainCircuit, badge: memCount },
    { v: 'settings', label: 'Settings', icon: Settings },
  ]

  return (
    <div className="flex h-full w-full flex-col border-r border-line bg-panel">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <Logo size={30} glow />
        <div className="leading-none">
          <Wordmark className="text-[15px]" />
          <div className="mt-1.5 font-display text-[9px] tracking-[.5em] text-gold/60">AI ASSISTANT</div>
        </div>
        <button className="icon-btn ml-auto md:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18} /></button>
      </div>

      <div className="px-3">
        <button onClick={() => open(null)} className="btn btn-ghost w-full !justify-start !border-gold/30 !bg-gold/[.06] !py-2.5 hover:!bg-gold/[.12]">
          <Plus size={17} className="text-gold" /> New chat
        </button>
        <div className="relative mt-3">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" className="field !rounded-xl !py-2 !pl-9 !text-[13px]" aria-label="Search chats" />
        </div>
      </div>

      <div className="scroll mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {groups.length === 0 && (
          <p className="px-3 py-8 text-center text-[13px] text-dim">{q ? 'No chats match your search.' : 'Your conversations will appear here.'}</p>
        )}
        <AnimatePresence initial={false}>
          {groups.map(([label, list]) => (
            <div key={label} className="mb-3">
              <div className="px-3 pb-1 pt-2 text-[10.5px] font-bold tracking-[.14em] text-dim uppercase">{label}</div>
              <div className="space-y-0.5">
                {list.map((c) => <ChatRow key={c.id} chat={c} active={view === 'chat' && c.id === activeId} onOpen={() => open(c.id)} />)}
              </div>
            </div>
          ))}
        </AnimatePresence>
      </div>

      <div className="border-t border-line p-3">
        <nav className="mb-2 space-y-0.5">
          {nav.map(({ v, label, icon: Icon, badge }) => (
            <button key={v} onClick={() => setView(v)} className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${view === v ? 'bg-gold/10 text-gold-bright' : 'text-mute hover:bg-hover hover:text-cream'}`}>
              <Icon size={17} />
              {label}
              {!!badge && <span className={`ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-bold ${v === 'planner' ? 'bg-gold text-[#17120a]' : 'bg-raised text-mute'}`}>{badge}</span>}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-raised/60 p-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-bright to-gold-deep font-display text-sm text-[#17120a]">{name.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-bold">{name}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-mute"><span className="h-1.5 w-1.5 rounded-full bg-ok" /> Signed in</div>
          </div>
          <button className="icon-btn" onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
        </div>
      </div>
    </div>
  )
}
