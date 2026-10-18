import { useMemo, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BrainCircuit, Check, Menu, Pencil, Plus, Search, Sparkles, Trash2, User, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { useUI } from '../lib/ui'
import type { Memory } from '../lib/types'
import { Confirm, Empty, PageHeader, Toggle } from './ui'

function Row({ m }: { m: Memory }) {
  const { updateMemory, deleteMemory } = useStore.getState()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(m.text)
  const save = () => { updateMemory(m.id, val); setEditing(false) }
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -24 }} className="card group flex items-start gap-3 p-3.5">
      <div className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${m.source === 'auto' ? 'bg-gold/10 text-gold' : 'bg-raised text-mute'}`}>
        {m.source === 'auto' ? <Sparkles size={15} /> : <User size={15} />}
      </div>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input autoFocus className="field !py-1.5" value={val} maxLength={220} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(m.text); setEditing(false) } }} aria-label="Edit memory" />
        ) : (
          <p className="text-sm leading-relaxed">{m.text}</p>
        )}
        <p className="mt-1 text-[11px] text-dim">{m.source === 'auto' ? 'Learned from chat' : 'Added by you'} · {new Date(m.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</p>
      </div>
      <div className="flex shrink-0 gap-0.5 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
        {editing ? (
          <>
            <button className="icon-btn !text-ok" onClick={save} aria-label="Save"><Check size={16} /></button>
            <button className="icon-btn" onClick={() => { setVal(m.text); setEditing(false) }} aria-label="Cancel"><X size={16} /></button>
          </>
        ) : (
          <>
            <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit memory"><Pencil size={15} /></button>
            <button className="icon-btn hover:!text-danger" onClick={() => deleteMemory(m.id)} aria-label="Delete memory"><Trash2 size={15} /></button>
          </>
        )}
      </div>
    </motion.div>
  )
}

export default function MemoryView() {
  const memories = useStore((s) => s.memories)
  const settings = useStore((s) => s.settings)
  const setSidebarOpen = useUI((s) => s.setSidebarOpen)
  const toast = useUI((s) => s.toast)
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [confirm, setConfirm] = useState(false)

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? memories.filter((m) => m.text.toLowerCase().includes(s)) : memories
  }, [memories, q])

  function add(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    if (useStore.getState().addMemory(text, 'manual')) { toast('Memory saved', 'success'); setText('') }
    else toast('ASTRIX already remembers that.', 'info')
  }

  return (
    <div className="scroll h-full min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-4 md:hidden"><button className="icon-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={20} /></button></div>
        <PageHeader title="Memory" subtitle="Useful details ASTRIX remembers about you across every chat." />

        <div className="card card-gold divide-y divide-line">
          <div className="flex items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">Use memory in chats</div>
              <div className="text-xs text-mute">Saved details are shared with the AI so replies feel personal.</div>
            </div>
            <Toggle checked={settings.useMemory} onChange={(v) => useStore.getState().updateSettings({ useMemory: v })} label="Use memory in chats" />
          </div>
          <div className="flex items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">Save useful details automatically</div>
              <div className="text-xs text-mute">ASTRIX picks out lasting facts and preferences from your messages. Passwords and secrets are ignored.</div>
            </div>
            <Toggle checked={settings.autoMemory} onChange={(v) => useStore.getState().updateSettings({ autoMemory: v })} label="Auto-save memory" />
          </div>
        </div>

        <form onSubmit={add} className="mt-5 flex gap-2">
          <input className="field" value={text} onChange={(e) => setText(e.target.value)} maxLength={220} placeholder="Teach ASTRIX something, e.g. “I do IXL for 25 minutes every week”" aria-label="New memory" />
          <button className="btn btn-gold" type="submit" disabled={!text.trim()}><Plus size={17} /> <span className="hidden sm:inline">Remember</span></button>
        </form>

        <div className="mt-6 flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-dim" />
            <input className="field !pl-10" placeholder={`Search ${memories.length} memories`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search memories" />
          </div>
          {memories.length > 0 && <button className="btn btn-danger" onClick={() => setConfirm(true)}><Trash2 size={15} /> <span className="hidden sm:inline">Clear all</span></button>}
        </div>

        <div className="mt-4 space-y-2.5 pb-10">
          <AnimatePresence mode="popLayout" initial={false}>{list.map((m) => <Row key={m.id} m={m} />)}</AnimatePresence>
          {list.length === 0 && (
            <div className="card">
              <Empty icon={<BrainCircuit size={26} />} title={q ? 'No matches' : 'Nothing remembered yet'} text={q ? 'Try a different search.' : 'Tell ASTRIX things like “remember that I prefer short answers”, or add a memory above.'} />
            </div>
          )}
        </div>
      </div>
      <Confirm open={confirm} onClose={() => setConfirm(false)} title="Clear all memories?" message={`This permanently erases all ${memories.length} saved memories.`} confirmLabel="Clear all" onConfirm={() => { useStore.getState().clearMemories(); toast('Memory cleared', 'success') }} />
    </div>
  )
}
