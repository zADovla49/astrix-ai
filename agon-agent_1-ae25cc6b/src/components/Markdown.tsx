import { memo, useMemo, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, CalendarPlus, Copy, Loader2 } from 'lucide-react'
import type { Repeat, Source } from '../lib/types'
import { useStore } from '../lib/store'
import { useUI } from '../lib/ui'
import { DAY_NAMES, fmtDate, repeatLabel } from '../lib/recurrence'

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object' && 'props' in node) return textOf((node as { props: { children?: ReactNode } }).props.children)
  return ''
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-line bg-[#08080b]">
      <div className="flex items-center justify-between border-b border-line bg-raised/70 px-3.5 py-1.5">
        <span className="font-mono text-[11px] tracking-wider text-gold/80 uppercase">{lang || 'code'}</span>
        <button
          className="flex cursor-pointer items-center gap-1.5 text-xs text-mute transition-colors hover:text-gold-bright"
          onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1600) }}
        >
          {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
        </button>
      </div>
      <pre className="scroll overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-[#e8e2d0]"><code>{code}</code></pre>
    </div>
  )
}

interface Suggestion { title: string; durationMin?: number; time?: string; date?: string; repeat?: Repeat; days?: number[]; notes?: string }

function TaskSuggestions({ raw, streaming }: { raw: string; streaming: boolean }) {
  const addTask = useStore((s) => s.addTask)
  const toast = useUI((s) => s.toast)
  const [added, setAdded] = useState<Set<number>>(new Set())
  let items: Suggestion[] = []
  try {
    const j = JSON.parse(raw)
    items = (Array.isArray(j) ? j : [j]).filter((x) => x && typeof x.title === 'string').slice(0, 12)
  } catch { /* incomplete while streaming */ }
  if (!items.length) {
    return streaming ? <div className="my-3 flex items-center gap-2 text-sm text-mute"><Loader2 size={14} className="animate-spin text-gold" /> Preparing planner tasks…</div> : null
  }

  const add = (t: Suggestion, i: number) => {
    const repeat: Repeat = t.repeat && ['daily', 'weekly', 'monthly'].includes(t.repeat) ? t.repeat : 'none'
    const days = Array.isArray(t.days) ? t.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : []
    const date = t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : fmtDate(new Date())
    const time = t.time && /^\d{1,2}:\d{2}$/.test(t.time) ? t.time.padStart(5, '0') : '16:00'
    addTask({ title: t.title, notes: t.notes || '', durationMin: t.durationMin && t.durationMin > 0 ? Math.round(t.durationMin) : null, repeat, days, interval: 1, due: `${date}T${time}` })
    setAdded((s) => new Set(s).add(i))
    toast(`Added to planner: ${t.title}`, 'success')
  }

  return (
    <div className="my-4 space-y-2">
      {items.map((t, i) => (
        <div key={i} className="card card-gold flex items-center gap-3 p-3.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold"><CalendarPlus size={18} /></div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{t.title}</div>
            <div className="text-xs text-mute">
              {[t.durationMin && `${t.durationMin} min`, t.time, t.repeat && t.repeat !== 'none' ? repeatLabel({ repeat: t.repeat, interval: 1, days: t.days || [] }) : t.date, t.repeat === 'weekly' && !(t.days || []).length ? DAY_NAMES[new Date().getDay()] : ''].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button className={`btn ${added.has(i) ? 'btn-ghost' : 'btn-gold'} !px-3 !py-2`} disabled={added.has(i)} onClick={() => add(t, i)}>
            {added.has(i) ? <><Check size={15} /> Added</> : 'Add to planner'}
          </button>
        </div>
      ))}
    </div>
  )
}

function MarkdownInner({ content, sources, streaming }: { content: string; sources?: Source[]; streaming?: boolean }) {
  const text = useMemo(() => {
    if (!sources?.length) return content
    return content.replace(/\[(\d{1,2})\](?!\()/g, (m, n) => (sources[Number(n) - 1] ? `[${n}](#src-${n})` : m))
  }, [content, sources])

  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        if (href?.startsWith('#src-')) {
          const s = sources?.[Number(href.slice(5)) - 1]
          if (s) return <a href={s.url} target="_blank" rel="noopener noreferrer" title={`${s.title} — ${s.domain}`} className="mx-0.5 inline-grid h-[18px] min-w-[18px] -translate-y-0.5 place-items-center rounded-md border border-gold/40 bg-gold/10 px-1 align-middle text-[10px] font-bold !text-gold-bright !no-underline hover:bg-gold/25">{children}</a>
        }
        return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
      },
      pre({ children }) {
        const child = Array.isArray(children) ? children[0] : children
        const props = (child as { props?: { className?: string; children?: ReactNode } } | undefined)?.props
        const lang = /language-([\w-]+)/.exec(props?.className || '')?.[1] || ''
        const code = textOf(props?.children).replace(/\n$/, '')
        if (lang === 'astrix-tasks') return <TaskSuggestions raw={code} streaming={!!streaming} />
        return <CodeBlock lang={lang} code={code} />
      },
      table({ children }) {
        return <div className="scroll my-4 overflow-x-auto rounded-xl border border-line"><table>{children}</table></div>
      },
    }),
    [sources, streaming],
  )

  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{text}</ReactMarkdown>
    </div>
  )
}

export const Markdown = memo(MarkdownInner)
