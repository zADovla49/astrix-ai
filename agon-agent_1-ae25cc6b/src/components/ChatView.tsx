import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle, ArrowDown, ArrowUp, Check, ChevronDown, Copy, FileText, Film, Globe, Instagram, Link2, ListChecks, Loader2, Menu, Paperclip,
  RefreshCw, Sparkles, Square, TriangleAlert, Upload, X, FileSearch, CalendarClock, Telescope,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { useUI } from '../lib/ui'
import { isRunning, regenerate, sendMessage, stopChat } from '../lib/runner'
import { ACCEPT, formatSize, processFile } from '../lib/files'
import type { Attachment, Message, Source, WebMode } from '../lib/types'
import { Logo } from './ui'
import { Markdown } from './Markdown'

/* ───────────── sources ───────────── */
function SourceIcon({ s }: { s: Source }) {
  if (s.ok === false) return <TriangleAlert size={14} className="text-danger" />
  if (s.kind === 'video') return <Film size={14} className="text-gold" />
  if (s.kind === 'social') return <Instagram size={14} className="text-gold" />
  return <img src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`} alt="" width={14} height={14} className="rounded-sm" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} />
}

function Sources({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mt-4">
      <button onClick={() => setOpen((o) => !o)} className="mb-2 flex cursor-pointer items-center gap-2 text-xs font-bold tracking-[.12em] text-gold/80 uppercase">
        <Globe size={13} /> Sources · {sources.length}
        <ChevronDown size={13} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {sources.map((s, i) => (
                <a key={s.url + i} href={s.url} target="_blank" rel="noopener noreferrer" className={`group block rounded-xl border bg-raised/50 p-3 transition-all hover:-translate-y-0.5 hover:border-gold/50 hover:bg-gold/[.06] ${s.ok === false ? 'border-danger/30' : 'border-line'}`}>
                  <div className="flex items-center gap-2 text-[11px] text-mute">
                    <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border border-gold/30 bg-gold/10 text-[10px] font-bold text-gold-bright">{i + 1}</span>
                    <SourceIcon s={s} />
                    <span className="truncate">{s.domain}</span>
                    <Link2 size={12} className="ml-auto shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <div className="mt-1.5 line-clamp-2 text-[13px] leading-snug font-semibold text-cream">{s.title || s.url}</div>
                  {s.snippet && <div className={`mt-1 line-clamp-2 text-xs leading-snug ${s.ok === false ? 'text-danger/80' : 'text-dim'}`}>{s.snippet}</div>}
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ───────────── messages ───────────── */
function AttachmentView({ a }: { a: Attachment }) {
  if (a.kind === 'image' && (a.thumb || a.dataUrl)) {
    return (
      <a href={a.dataUrl || a.thumb} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-gold/25" title={a.name}>
        <img src={a.thumb || a.dataUrl} alt={a.name} className="h-28 w-auto max-w-[220px] object-cover" />
      </a>
    )
  }
  return (
    <div className="flex max-w-[240px] items-center gap-2.5 rounded-xl border border-gold/25 bg-black/30 px-3 py-2">
      <FileText size={18} className="shrink-0 text-gold" />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[13px] font-semibold">{a.name}</div>
        <div className="text-[11px] text-mute">{formatSize(a.size)}</div>
      </div>
    </div>
  )
}

function MessageItem({ m, chatId, isLast }: { m: Message; chatId: string; isLast: boolean }) {
  const [copied, setCopied] = useState(false)
  const name = useStore((s) => s.settings.userName)

  if (m.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[88%] sm:max-w-[75%]">
          {!!m.attachments?.length && <div className="mb-2 flex flex-wrap justify-end gap-2">{m.attachments.map((a) => <AttachmentView key={a.id} a={a} />)}</div>}
          {m.content && (
            <div className="rounded-2xl rounded-br-md border border-gold/25 bg-gradient-to-br from-gold/[.14] to-gold/[.05] px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words">{m.content}</div>
          )}
          <div className="mt-1 pr-1 text-right text-[11px] text-dim">{name}</div>
        </div>
      </motion.div>
    )
  }

  const showStatus = m.streaming && !m.content
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3.5">
      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-gold/30 bg-gold/[.07]"><Logo size={18} /></div>
      <div className="min-w-0 flex-1">
        {showStatus && (
          <div className="flex items-center gap-3 py-1.5 text-sm text-mute">
            <span className="flex gap-1"><i className="dot" /><i className="dot" style={{ animationDelay: '.15s' }} /><i className="dot" style={{ animationDelay: '.3s' }} /></span>
            <span>{m.status || 'Thinking\u2026'}</span>
          </div>
        )}
        {m.sources && m.streaming && !m.content && null}
        {m.content && (
          <div className={m.streaming ? 'cursor-blink' : ''}>
            <Markdown content={m.content} sources={m.sources} streaming={m.streaming} />
          </div>
        )}
        {m.sources && m.sources.length > 0 && <Sources sources={m.sources} />}
        {m.error && (
          <div className="mt-3 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/[.07] p-3.5 text-sm" role="alert">
            <AlertCircle size={17} className="mt-0.5 shrink-0 text-danger" />
            <div className="min-w-0 flex-1 text-[#ffc2b8]">{m.error}</div>
            {isLast && <button className="btn btn-ghost !px-3 !py-1.5 !text-xs" onClick={() => regenerate(chatId)}><RefreshCw size={13} /> Retry</button>}
          </div>
        )}
        {!m.streaming && m.content && (
          <div className="mt-2 flex items-center gap-1">
            <button className="icon-btn" aria-label="Copy reply" title="Copy" onClick={() => { navigator.clipboard?.writeText(m.content); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
              {copied ? <Check size={15} className="text-ok" /> : <Copy size={15} />}
            </button>
            {isLast && <button className="icon-btn" aria-label="Regenerate" title="Regenerate" onClick={() => regenerate(chatId)}><RefreshCw size={15} /></button>}
            {m.model && <span className="ml-2 truncate text-[11px] text-dim">{m.model}</span>}
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ───────────── empty state ───────────── */
const SUGGESTIONS = [
  { icon: CalendarClock, title: 'Plan my IXL time', text: 'Create a weekly 25-minute IXL practice session plan and add it to my planner.', tag: 'Planner' },
  { icon: Telescope, title: 'Search the web', text: 'What are the most important tech news stories today? Give me sources.', tag: 'Live web', web: true },
  { icon: Link2, title: 'Analyse a link or video', text: 'Summarise this: https://www.youtube.com/watch?v=', tag: 'Links & video' },
  { icon: FileSearch, title: 'Analyse a file', text: '', tag: 'Upload', pick: true },
]

function EmptyState() {
  const name = useStore((s) => s.settings.userName)
  const setDraft = useUI((s) => s.setDraft)
  const cfg = useUI((s) => s.config)
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-10 text-center">
      <motion.div initial={{ scale: 0.6, opacity: 0, rotate: -45 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} className="relative mb-6 grid h-24 w-24 place-items-center">
        <div className="animate-spin-slow absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 0deg, transparent 0 60%, rgba(244,217,122,.8) 80%, transparent 85%)', mask: 'radial-gradient(circle, transparent 62%, #000 63%)', WebkitMask: 'radial-gradient(circle, transparent 62%, #000 63%)' }} />
        <Logo size={48} glow />
      </motion.div>
      <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="gold-text text-3xl font-extrabold tracking-tight sm:text-5xl">Welcome back, {name}!</motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-3 text-base text-mute">What shall we work on today?</motion.p>
      <div className="mt-9 grid w-full gap-3 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => (
          <motion.button
            key={s.title}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + i * 0.07 }}
            whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}
            onClick={() => {
              if (s.web) useStore.getState().updateSettings({ webSearch: 'on' })
              if (s.pick) window.dispatchEvent(new Event('astrix:pick-file'))
              else setDraft(s.text)
            }}
            className="card group cursor-pointer p-4 text-left transition-colors hover:border-gold/50 hover:bg-gold/[.05]"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gold/10 text-gold transition-colors group-hover:bg-gold/20"><s.icon size={19} /></div>
              <div>
                <div className="text-sm font-bold">{s.title}</div>
                <div className="text-[11px] tracking-wider text-gold/60 uppercase">{s.tag}</div>
              </div>
            </div>
          </motion.button>
        ))}
      </div>
      {cfg && (
        <p className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-dim">
          <span className="flex items-center gap-1.5"><Sparkles size={12} className="text-gold/70" /> {cfg.provider}</span>
          <span className="flex items-center gap-1.5"><Globe size={12} className="text-gold/70" /> Search: {cfg.search}</span>
          <span className="flex items-center gap-1.5"><ListChecks size={12} className="text-gold/70" /> Planner &amp; memory ready</span>
        </p>
      )}
    </div>
  )
}

/* ───────────── composer ───────────── */
const WEB_NEXT: Record<WebMode, WebMode> = { auto: 'on', on: 'off', off: 'auto' }
const WEB_HELP: Record<WebMode, string> = {
  auto: 'Web search: Auto \u2014 searches when your question needs fresh info (click to change)',
  on: 'Web search: Always on (click to change)',
  off: 'Web search: Off (click to change)',
}

function Composer({ chatId, running, addFilesRef }: { chatId: string | null; running: boolean; addFilesRef: React.MutableRefObject<((f: File[]) => void) | null> }) {
  const [text, setText] = useState('')
  const [atts, setAtts] = useState<Attachment[]>([])
  const [processing, setProcessing] = useState<{ id: string; name: string; stage: string }[]>([])
  const ta = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const draft = useUI((s) => s.draft)
  const setDraft = useUI((s) => s.setDraft)
  const toast = useUI((s) => s.toast)
  const cfg = useUI((s) => s.config)
  const webMode = useStore((s) => s.settings.webSearch)
  const modelId = useStore((s) => s.settings.model) || cfg?.defaultModel
  const vision = cfg?.models.find((m) => m.id === modelId)?.vision ?? false

  const resize = useCallback(() => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 220) + 'px'
  }, [])

  useEffect(() => {
    if (!draft) return
    setText(draft)
    setDraft('')
    requestAnimationFrame(() => { ta.current?.focus(); resize() })
  }, [draft, setDraft, resize])
  useLayoutEffect(resize, [text, resize])
  useEffect(() => { ta.current?.focus() }, [chatId])
  useEffect(() => {
    const h = () => fileInput.current?.click()
    window.addEventListener('astrix:pick-file', h)
    return () => window.removeEventListener('astrix:pick-file', h)
  }, [])

  const addFiles = useCallback(async (files: File[]) => {
    for (const file of files.slice(0, 6)) {
      const id = Math.random().toString(36).slice(2)
      setProcessing((p) => [...p, { id, name: file.name || 'image', stage: 'Processing\u2026' }])
      try {
        const att = await processFile(file, { vision, onStage: (stage) => setProcessing((p) => p.map((x) => (x.id === id ? { ...x, stage } : x))) })
        setAtts((a) => (a.length >= 6 ? a : [...a, att]))
        if (att.note) toast(att.note, 'info')
      } catch (e) {
        toast((e as Error).message || `Couldn't read ${file.name}`, 'error')
      } finally {
        setProcessing((p) => p.filter((x) => x.id !== id))
      }
    }
  }, [vision, toast])
  useEffect(() => { addFilesRef.current = (f) => { void addFiles(f) } }, [addFiles, addFilesRef])

  const canSend = (text.trim().length > 0 || atts.length > 0) && !processing.length && !running

  function submit() {
    if (!canSend) return
    const t = text.trim()
    const a = atts
    setText('')
    setAtts([])
    void sendMessage(chatId, t, a)
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !window.matchMedia('(pointer: coarse)').matches) {
      e.preventDefault()
      submit()
    }
  }
  function onPaste(e: ClipboardEvent) {
    const files = [...e.clipboardData.files]
    if (files.length) { e.preventDefault(); void addFiles(files) }
  }

  const hasImage = atts.some((a) => a.kind === 'image')
  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-3 sm:px-4">
      <div className="glass rounded-[22px] p-2.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,.9)] transition-all focus-within:border-gold/50 focus-within:shadow-[0_0_0_3px_rgba(212,175,55,.1),0_20px_60px_-20px_rgba(212,175,55,.2)]">
        <AnimatePresence initial={false}>
          {(atts.length > 0 || processing.length > 0) && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="flex flex-wrap gap-2 px-1.5 pt-1 pb-2.5">
                {atts.map((a) => (
                  <div key={a.id} className="group relative flex items-center gap-2 rounded-xl border border-gold/25 bg-black/30 py-1.5 pr-3 pl-1.5">
                    {a.kind === 'image' ? <img src={a.thumb} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <div className="grid h-9 w-9 place-items-center rounded-lg bg-gold/10 text-gold"><FileText size={17} /></div>}
                    <div className="max-w-[150px] leading-tight">
                      <div className="truncate text-xs font-semibold">{a.name}</div>
                      <div className="text-[10.5px] text-mute">{a.textLabel === 'image \u2014 OCR text' ? 'OCR text read' : formatSize(a.size)}</div>
                    </div>
                    <button className="absolute -top-1.5 -right-1.5 grid h-5 w-5 cursor-pointer place-items-center rounded-full border border-line bg-raised text-mute hover:text-danger" onClick={() => setAtts((x) => x.filter((y) => y.id !== a.id))} aria-label={`Remove ${a.name}`}><X size={11} /></button>
                  </div>
                ))}
                {processing.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-xl border border-line bg-black/30 px-3 py-2 text-xs text-mute">
                    <Loader2 size={14} className="animate-spin text-gold" />
                    <span className="max-w-[130px] truncate">{p.name}</span>
                    <span className="text-dim">{p.stage}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <textarea
          ref={ta}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          rows={1}
          placeholder="Message ASTRIX…  (paste a link, attach a file, or ask anything)"
          aria-label="Message"
          className="scroll block max-h-[220px] w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-relaxed text-cream outline-none placeholder:text-dim"
        />

        <div className="flex items-center gap-1.5 px-1 pt-1">
          <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { void addFiles([...(e.target.files || [])]); e.target.value = '' }} />
          <button className="icon-btn !h-9 !w-9" onClick={() => fileInput.current?.click()} aria-label="Attach files or images" title="Attach images, PDF, DOCX, text, code"><Paperclip size={18} /></button>
          <button
            onClick={() => useStore.getState().updateSettings({ webSearch: WEB_NEXT[webMode] })}
            title={WEB_HELP[webMode]}
            aria-label={WEB_HELP[webMode]}
            className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-all ${webMode === 'on' ? 'border-gold bg-gold text-[#17120a] shadow-[0_0_18px_-4px_rgba(212,175,55,.9)]' : webMode === 'auto' ? 'border-gold/40 bg-gold/[.08] text-gold-bright' : 'border-line text-mute hover:text-cream'}`}
          >
            <Globe size={14} /> Web <span className="opacity-70">· {webMode === 'auto' ? 'Auto' : webMode === 'on' ? 'On' : 'Off'}</span>
          </button>
          {hasImage && !vision && <span className="hidden text-[11px] text-dim sm:block">Image read via OCR (no vision model)</span>}
          <div className="ml-auto">
            {running ? (
              <button className="btn btn-ghost !h-10 !w-10 !rounded-full !p-0 !border-gold/50" onClick={() => chatId && stopChat(chatId)} aria-label="Stop generating"><Square size={14} fill="currentColor" className="text-gold" /></button>
            ) : (
              <button className="btn btn-gold !h-10 !w-10 !rounded-full !p-0" disabled={!canSend} onClick={submit} aria-label="Send message"><ArrowUp size={19} strokeWidth={2.6} /></button>
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-dim">ASTRIX can make mistakes. Check important information.</p>
    </div>
  )
}

/* ───────────── model picker ───────────── */
function ModelPicker() {
  const cfg = useUI((s) => s.config)
  const model = useStore((s) => s.settings.model)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  if (!cfg) return <div className="h-8 w-32 animate-pulse rounded-lg bg-raised" />
  const cur = cfg.models.find((m) => m.id === (model || cfg.defaultModel)) || cfg.models[0]
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex max-w-[210px] cursor-pointer items-center gap-2 rounded-xl border border-line bg-raised/60 px-3 py-1.5 text-[13px] font-semibold transition-colors hover:border-gold/40" aria-haspopup="listbox" aria-expanded={open}>
        <Sparkles size={14} className="shrink-0 text-gold" />
        <span className="truncate">{cur?.label}</span>
        <ChevronDown size={14} className={`shrink-0 text-mute transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} className="glass absolute right-0 z-40 mt-2 w-72 rounded-xl p-1.5 shadow-2xl shadow-black" role="listbox">
            {cfg.models.map((m) => (
              <button key={m.id} role="option" aria-selected={m.id === cur?.id} onClick={() => { useStore.getState().updateSettings({ model: m.id }); setOpen(false) }} className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors hover:bg-gold/10 ${m.id === cur?.id ? 'text-gold-bright' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{m.label}</div>
                  <div className="truncate text-[11px] text-dim">{m.provider}{m.vision ? ' \u00b7 vision' : ''}</div>
                </div>
                {m.id === cur?.id && <Check size={15} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ───────────── main ───────────── */
export default function ChatView() {
  const activeId = useStore((s) => s.activeChatId)
  const chat = useStore((s) => s.chats.find((c) => c.id === s.activeChatId))
  const setSidebarOpen = useUI((s) => s.setSidebarOpen)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [showDown, setShowDown] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const addFilesRef = useRef<((f: File[]) => void) | null>(null)

  const messages = useMemo(() => chat?.messages ?? [], [chat])
  const last = messages[messages.length - 1]
  const running = !!last?.streaming && !!activeId && isRunning(activeId)

  const toBottom = useCallback((smooth = false) => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])
  useEffect(() => { stick.current = true; setShowDown(false); requestAnimationFrame(() => toBottom()) }, [activeId, toBottom])
  useEffect(() => { if (stick.current) toBottom() }, [messages.length, last?.content, last?.status, last?.sources?.length, toBottom])

  function onScroll() {
    const el = scroller.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    stick.current = near
    setShowDown(!near)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); dragDepth.current = 0; setDragging(false)
    if (e.dataTransfer.files.length) addFilesRef.current?.([...e.dataTransfer.files])
  }

  return (
    <div
      className="relative flex h-full min-w-0 flex-1 flex-col"
      onDragEnter={(e) => { e.preventDefault(); dragDepth.current++; setDragging(true) }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false) }}
      onDrop={onDrop}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line/70 px-3 sm:px-5">
        <button className="icon-btn md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-cream/90">{chat ? chat.title : 'New chat'}</h2>
        <ModelPicker />
      </header>

      <div ref={scroller} onScroll={onScroll} className="scroll min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-7 px-4 py-6 sm:px-5">
            {messages.map((m, i) => <MessageItem key={m.id} m={m} chatId={chat!.id} isLast={i === messages.length - 1} />)}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showDown && (
          <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => { stick.current = true; toBottom(true) }} className="glass absolute bottom-40 left-1/2 z-10 grid h-9 w-9 -translate-x-1/2 cursor-pointer place-items-center rounded-full text-gold hover:border-gold/60" aria-label="Scroll to latest">
            <ArrowDown size={17} />
          </motion.button>
        )}
      </AnimatePresence>

      <Composer chatId={activeId} running={running} addFilesRef={addFilesRef} />

      <AnimatePresence>
        {dragging && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/75 backdrop-blur-sm">
            <div className="rounded-3xl border-2 border-dashed border-gold/70 bg-gold/[.06] px-12 py-10 text-center">
              <Upload size={34} className="mx-auto mb-3 text-gold" />
              <div className="text-lg font-bold">Drop to attach</div>
              <div className="text-sm text-mute">Images, PDF, DOCX, text &amp; code files</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
