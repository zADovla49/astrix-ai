import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlarmClock, Bell, CalendarDays, CalendarPlus, Check, CheckCircle2, Clock, Download, FastForward, Flame, ListChecks, Menu, Pencil, Plus, Repeat, Trash2, Timer, Zap,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { useUI } from '../lib/ui'
import type { Priority, Repeat as RepeatT, Task } from '../lib/types'
import { DAY_NAMES, bucketOf, buildIcs, describeDue, downloadText, fmtDate, repeatLabel, type Bucket } from '../lib/recurrence'
import { Confirm, Empty, Modal, PageHeader, Segmented } from './ui'

type Filter = 'today' | 'upcoming' | 'all' | 'done'

interface Draft {
  id?: string
  title: string
  notes: string
  date: string
  time: string
  durationMin: string
  priority: Priority
  repeat: RepeatT
  interval: number
  days: number[]
}

const emptyDraft = (): Draft => ({
  title: '', notes: '', date: fmtDate(new Date()), time: '16:00', durationMin: '', priority: 'medium', repeat: 'none', interval: 1, days: [],
})

const ixlDraft = (): Draft => {
  const now = new Date()
  return { title: 'IXL practice session', notes: 'Weekly IXL math / language practice.', date: fmtDate(now), time: '16:00', durationMin: '25', priority: 'medium', repeat: 'weekly', interval: 1, days: [now.getDay()] }
}

const PRIORITY_STYLE: Record<Priority, string> = {
  high: 'border-danger/40 bg-danger/10 text-[#ff9d8e]',
  medium: 'border-gold/30 bg-gold/10 text-gold-bright',
  low: 'border-line bg-raised text-mute',
}

function TaskForm({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const [d, setD] = useState<Draft>(emptyDraft())
  const [err, setErr] = useState('')
  const { addTask, updateTask } = useStore.getState()
  const toast = useUI((s) => s.toast)
  useEffect(() => { if (draft) { setD(draft); setErr('') } }, [draft])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const toggleDay = (n: number) => set('days', d.days.includes(n) ? d.days.filter((x) => x !== n) : [...d.days, n])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!d.title.trim()) return setErr('Give the task a title.')
    if (d.repeat !== 'none' && !d.date) return setErr('Recurring tasks need a start date.')
    if (d.repeat === 'weekly' && !d.days.length) return setErr('Pick at least one weekday.')
    const dur = d.durationMin ? Math.max(1, Math.min(1440, Number(d.durationMin))) : null
    const payload = {
      title: d.title.trim(), notes: d.notes.trim(), durationMin: dur, priority: d.priority, repeat: d.repeat,
      interval: Math.max(1, Math.min(52, Number(d.interval) || 1)), days: d.repeat === 'weekly' ? d.days : [],
      due: d.date ? `${d.date}T${d.time || '09:00'}` : null,
    }
    if (d.id) { updateTask(d.id, payload); toast('Task updated', 'success') }
    else { addTask(payload); toast(d.repeat !== 'none' ? 'Recurring task scheduled' : 'Task added', 'success') }
    onClose()
  }

  return (
    <Modal open={!!draft} onClose={onClose} title={d.id ? 'Edit task' : 'New task'} wide>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="t-title">Title</label>
          <input id="t-title" autoFocus className="field" value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. IXL practice session" maxLength={120} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="t-date">{d.repeat === 'none' ? 'Date' : 'Starts'}</label>
            <input id="t-date" type="date" className="field" value={d.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="t-time">Time</label>
            <input id="t-time" type="time" className="field" value={d.time} onChange={(e) => set('time', e.target.value)} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="t-dur">Duration (min)</label>
            <input id="t-dur" type="number" min={1} max={1440} className="field" value={d.durationMin} onChange={(e) => set('durationMin', e.target.value)} placeholder="25" />
          </div>
        </div>

        <div>
          <span className="label">Repeat</span>
          <Segmented<RepeatT> value={d.repeat} onChange={(v) => setD((x) => ({ ...x, repeat: v, days: v === 'weekly' && !x.days.length && x.date ? [new Date(x.date + 'T12:00').getDay()] : x.days }))} options={[{ value: 'none', label: 'Never' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
        </div>

        <AnimatePresence initial={false}>
          {d.repeat !== 'none' && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="space-y-3 rounded-xl border border-gold/20 bg-gold/[.04] p-3.5">
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-mute">Every</span>
                  <input type="number" min={1} max={52} className="field !w-20 !py-1.5 text-center" value={d.interval} onChange={(e) => set('interval', Number(e.target.value))} aria-label="Repeat interval" />
                  <span className="text-mute">{d.repeat === 'daily' ? 'day(s)' : d.repeat === 'weekly' ? 'week(s)' : 'month(s)'}</span>
                </div>
                {d.repeat === 'weekly' && (
                  <div>
                    <span className="label">On</span>
                    <div className="flex flex-wrap gap-1.5">
                      {DAY_NAMES.map((n, i) => (
                        <button type="button" key={n} onClick={() => toggleDay(i)} aria-pressed={d.days.includes(i)} className={`h-9 w-11 cursor-pointer rounded-lg border text-xs font-bold transition-all ${d.days.includes(i) ? 'border-gold bg-gold text-[#17120a]' : 'border-line text-mute hover:border-gold/50 hover:text-cream'}`}>{n}</button>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-xs text-mute">{repeatLabel({ repeat: d.repeat, interval: d.interval, days: d.days })}{d.durationMin ? ` · ${d.durationMin} min` : ''}{d.time ? ` · at ${d.time}` : ''}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div>
          <span className="label">Priority</span>
          <Segmented<Priority> value={d.priority} onChange={(v) => set('priority', v)} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
        </div>
        <div>
          <label className="label" htmlFor="t-notes">Notes</label>
          <textarea id="t-notes" rows={2} className="field resize-none" value={d.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional details…" maxLength={600} />
        </div>
        {err && <p className="text-sm text-danger" role="alert">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-gold">{d.id ? 'Save changes' : 'Add task'}</button>
        </div>
      </form>
    </Modal>
  )
}

function TaskCard({ t, onEdit, onDelete }: { t: Task; onEdit: () => void; onDelete: () => void }) {
  const { completeTask, skipTask } = useStore.getState()
  const toast = useUI((s) => s.toast)
  const bucket = bucketOf(t)
  const recurring = t.repeat !== 'none'
  const overdue = bucket === 'overdue'
  const [pulse, setPulse] = useState(false)

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30, transition: { duration: 0.2 } }} className={`card group flex gap-3.5 p-4 transition-colors hover:border-gold/30 ${t.done ? 'opacity-55' : ''} ${overdue ? '!border-danger/30' : ''}`}>
      <button
        onClick={() => { completeTask(t.id); setPulse(true); setTimeout(() => setPulse(false), 600); if (!t.done) toast(recurring ? `Done! Next: ${describeDue(useStore.getState().tasks.find((x) => x.id === t.id)?.due ?? null)}` : 'Task completed', 'success') }}
        aria-label={t.done ? 'Mark as not done' : 'Mark as done'}
        className={`mt-0.5 grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full border-2 transition-all ${t.done ? 'border-gold bg-gold text-[#17120a]' : 'border-dim hover:border-gold hover:bg-gold/10'} ${pulse ? 'animate-pulse-gold' : ''}`}
      >
        {t.done && <Check size={14} strokeWidth={3.5} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className={`text-[15px] font-bold ${t.done ? 'line-through decoration-gold/50' : ''}`}>{t.title}</h3>
          <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase ${PRIORITY_STYLE[t.priority]}`}>{t.priority}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute">
          {t.due && <span className={`flex items-center gap-1.5 ${overdue ? 'font-semibold text-danger' : ''}`}><Clock size={13} />{overdue ? 'Overdue · ' : ''}{describeDue(t.due)}</span>}
          {t.durationMin && <span className="flex items-center gap-1.5"><Timer size={13} />{t.durationMin} min</span>}
          {recurring && <span className="flex items-center gap-1.5 text-gold-bright"><Repeat size={13} />{repeatLabel(t)}</span>}
          {recurring && t.completions.length > 0 && <span className="flex items-center gap-1.5"><Flame size={13} className="text-gold" />{t.completions.length} completed</span>}
        </div>
        {t.notes && <p className="mt-2 text-[13px] leading-relaxed text-mute">{t.notes}</p>}
      </div>
      <div className="flex shrink-0 items-start gap-0.5 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
        {recurring && <button className="icon-btn" onClick={() => { skipTask(t.id); toast('Skipped to the next occurrence') }} aria-label="Skip this occurrence" title="Skip this occurrence"><FastForward size={15} /></button>}
        <button className="icon-btn" onClick={() => downloadText(`${t.title.replace(/[^\w]+/g, '-').toLowerCase()}.ics`, buildIcs([t]), 'text/calendar')} aria-label="Add to calendar (.ics)" title="Add to calendar (.ics)"><CalendarPlus size={15} /></button>
        <button className="icon-btn" onClick={onEdit} aria-label="Edit task" title="Edit"><Pencil size={15} /></button>
        <button className="icon-btn hover:!text-danger" onClick={onDelete} aria-label="Delete task" title="Delete"><Trash2 size={15} /></button>
      </div>
    </motion.div>
  )
}

export default function PlannerView() {
  const tasks = useStore((s) => s.tasks)
  const notif = useStore((s) => s.settings.notifications)
  const setSidebarOpen = useUI((s) => s.setSidebarOpen)
  const toast = useUI((s) => s.toast)
  const [filter, setFilter] = useState<Filter>('today')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [del, setDel] = useState<Task | null>(null)
  const [, tick] = useState(0)
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(i) }, [])

  const withBucket = useMemo(() => tasks.map((t) => ({ t, b: bucketOf(t) })), [tasks])
  const count = (...bs: Bucket[]) => withBucket.filter((x) => bs.includes(x.b)).length
  const stats = [
    { label: 'Due today', value: count('today', 'overdue'), icon: AlarmClock },
    { label: 'Upcoming', value: count('upcoming'), icon: CalendarDays },
    { label: 'Recurring', value: tasks.filter((t) => t.repeat !== 'none').length, icon: Repeat },
    { label: 'Completed', value: tasks.filter((t) => t.done).length + tasks.reduce((n, t) => n + t.completions.length, 0), icon: CheckCircle2 },
  ]

  const list = useMemo(() => {
    const pick = withBucket.filter(({ b }) => (filter === 'today' ? b === 'today' || b === 'overdue' : filter === 'upcoming' ? b === 'upcoming' : filter === 'done' ? b === 'done' : true))
    return pick
      .sort((a, b) => {
        if (a.t.done !== b.t.done) return a.t.done ? 1 : -1
        const ad = a.t.due ? new Date(a.t.due).getTime() : Infinity
        const bd = b.t.due ? new Date(b.t.due).getTime() : Infinity
        return ad - bd
      })
      .map((x) => x.t)
  }, [withBucket, filter])

  async function enableNotifications() {
    if (!('Notification' in window)) return toast('This browser does not support notifications.', 'error')
    const p = await Notification.requestPermission()
    if (p === 'granted') { useStore.getState().updateSettings({ notifications: true }); toast('Reminders enabled while ASTRIX is open', 'success') }
    else toast('Notification permission was not granted.', 'error')
  }

  const tabs: { v: Filter; label: string }[] = [{ v: 'today', label: 'Today' }, { v: 'upcoming', label: 'Upcoming' }, { v: 'all', label: 'All' }, { v: 'done', label: 'Done' }]

  return (
    <div className="scroll h-full min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-4 md:hidden"><button className="icon-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={20} /></button></div>
        <PageHeader
          title="Task planner"
          subtitle="Create, schedule and repeat tasks — like a weekly 25-minute IXL session."
          actions={
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-ghost" onClick={() => setDraft(ixlDraft())}><Zap size={16} className="text-gold" /> IXL · 25 min weekly</button>
              <button className="btn btn-gold" onClick={() => setDraft(emptyDraft())}><Plus size={17} /> New task</button>
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card relative overflow-hidden p-4">
              <s.icon size={44} className="absolute -right-2 -bottom-2 text-gold/[.07]" />
              <div className="text-2xl font-extrabold text-gold-bright sm:text-3xl">{s.value}</div>
              <div className="mt-0.5 text-xs font-semibold tracking-wide text-mute">{s.label}</div>
            </motion.div>
          ))}
        </div>

        {!notif && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-gold/20 bg-gold/[.05] p-3.5 text-sm">
            <Bell size={17} className="text-gold" />
            <span className="min-w-0 flex-1 text-mute">Get a reminder when a task is due while ASTRIX is open. Use the calendar button on a task for reminders everywhere.</span>
            <button className="btn btn-ghost !py-1.5" onClick={enableNotifications}>Enable reminders</button>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="w-full max-w-sm"><Segmented<Filter> value={filter} onChange={setFilter} options={tabs.map((t) => ({ value: t.v, label: t.label }))} /></div>
          {tasks.some((t) => t.due) && (
            <button className="btn btn-ghost !px-3 !py-2 !text-xs" onClick={() => downloadText('astrix-planner.ics', buildIcs(tasks.filter((t) => t.due)), 'text/calendar')}><Download size={14} /> <span className="hidden sm:inline">Export .ics</span></button>
          )}
        </div>

        <div className="mt-4 space-y-3 pb-10">
          <AnimatePresence mode="popLayout" initial={false}>
            {list.map((t) => <TaskCard key={t.id} t={t} onEdit={() => setDraft({ id: t.id, title: t.title, notes: t.notes, date: t.due?.slice(0, 10) || '', time: t.due?.slice(11, 16) || '09:00', durationMin: t.durationMin ? String(t.durationMin) : '', priority: t.priority, repeat: t.repeat, interval: t.interval, days: t.days })} onDelete={() => setDel(t)} />)}
          </AnimatePresence>
          {list.length === 0 && (
            <div className="card">
              <Empty
                icon={<ListChecks size={26} />}
                title={filter === 'done' ? 'Nothing completed yet' : tasks.length ? 'Nothing here' : 'No tasks yet'}
                text={tasks.length ? 'Switch tabs to see other tasks, or add a new one.' : 'Add your first task, or try the weekly IXL template to see recurring scheduling in action.'}
                action={<button className="btn btn-gold" onClick={() => setDraft(ixlDraft())}><Zap size={16} /> Schedule weekly IXL</button>}
              />
            </div>
          )}
        </div>
      </div>

      <TaskForm draft={draft} onClose={() => setDraft(null)} />
      <Confirm open={!!del} onClose={() => setDel(null)} title="Delete task?" message={`“${del?.title ?? ''}”${del && del.repeat !== 'none' ? ' and all of its future repeats' : ''} will be removed.`} onConfirm={() => del && useStore.getState().deleteTask(del.id)} />
    </div>
  )
}
