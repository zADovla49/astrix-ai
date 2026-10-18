import type { Task } from './types'

const pad = (n: number) => String(n).padStart(2, '0')
export const fmtLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
export const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseLocal = (s: string) => new Date(s)
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const startOfWeek = (d: Date) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - x.getDay())
  return x
}

/** The occurrence strictly after `from` for a recurring task. */
export function advance(t: Pick<Task, 'repeat' | 'interval' | 'days'>, from: Date): Date {
  const interval = Math.max(1, t.interval || 1)
  const d = new Date(from)
  if (t.repeat === 'daily') {
    d.setDate(d.getDate() + interval)
    return d
  }
  if (t.repeat === 'weekly') {
    const days = t.days.length ? t.days : [from.getDay()]
    const base = startOfWeek(from)
    for (let i = 1; i <= 7 * interval * 2 + 7; i++) {
      const c = new Date(from)
      c.setDate(c.getDate() + i)
      if (!days.includes(c.getDay())) continue
      const weeks = Math.round((startOfWeek(c).getTime() - base.getTime()) / (7 * 864e5))
      if (weeks % interval === 0) return c
    }
    d.setDate(d.getDate() + 7 * interval)
    return d
  }
  if (t.repeat === 'monthly') {
    const day = d.getDate()
    d.setDate(1)
    d.setMonth(d.getMonth() + interval)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(day, last))
    return d
  }
  return d
}

/** Next due for a recurring task after it was completed/skipped (always in the future). */
export function nextDue(t: Task, now = new Date()): string {
  let next = advance(t, t.due ? parseLocal(t.due) : now)
  let guard = 0
  while (next.getTime() <= now.getTime() && guard++ < 800) next = advance(t, next)
  return fmtLocal(next)
}

/** First valid occurrence at/after now for a freshly created recurring task. */
export function firstDue(t: Task, now = new Date()): string | null {
  if (!t.due) return null
  if (t.repeat === 'none') return t.due
  let d = parseLocal(t.due)
  const days = t.days.length ? t.days : [d.getDay()]
  if (t.repeat === 'weekly' && !days.includes(d.getDay())) {
    // snap to the first selected weekday on/after the chosen date
    for (let i = 1; i <= 7; i++) {
      const c = new Date(d)
      c.setDate(c.getDate() + i)
      if (days.includes(c.getDay())) { d = c; break }
    }
  }
  let guard = 0
  while (d.getTime() < now.getTime() - 60_000 && guard++ < 800) d = advance({ ...t, days }, d)
  return fmtLocal(d)
}

export function repeatLabel(t: Pick<Task, 'repeat' | 'interval' | 'days'>): string {
  const n = Math.max(1, t.interval || 1)
  if (t.repeat === 'daily') return n === 1 ? 'Every day' : `Every ${n} days`
  if (t.repeat === 'monthly') return n === 1 ? 'Every month' : `Every ${n} months`
  if (t.repeat === 'weekly') {
    const ds = t.days.length ? [...t.days].sort() : []
    const names = ds.map((d) => DAY_NAMES[d]).join(', ')
    const every = n === 1 ? 'Weekly' : `Every ${n} weeks`
    return names ? `${every} · ${names}` : every
  }
  return ''
}

export type Bucket = 'overdue' | 'today' | 'upcoming' | 'someday' | 'done'
export function bucketOf(t: Task, now = new Date()): Bucket {
  if (t.done) return 'done'
  if (!t.due) return 'someday'
  const d = parseLocal(t.due)
  if (d.getTime() < now.getTime() && fmtDate(d) !== fmtDate(now)) return 'overdue'
  if (fmtDate(d) === fmtDate(now)) return d.getTime() < now.getTime() ? 'overdue' : 'today'
  return 'upcoming'
}

export function describeDue(due: string | null, now = new Date()): string {
  if (!due) return 'No date'
  const d = parseLocal(due)
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const dd = new Date(d); dd.setHours(0, 0, 0, 0)
  const diff = Math.round((dd.getTime() - today.getTime()) / 864e5)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const hasTime = !(d.getHours() === 0 && d.getMinutes() === 0)
  let day: string
  if (diff === 0) day = 'Today'
  else if (diff === 1) day = 'Tomorrow'
  else if (diff === -1) day = 'Yesterday'
  else if (diff > 1 && diff < 7) day = DAY_LONG[d.getDay()]
  else day = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
  return hasTime ? `${day} · ${time}` : day
}

// ───────────── ICS export (real calendar reminders outside the app) ─────────────
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const icsStamp = (s: string) => s.replace(/[-:]/g, '') + '00'
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function eventFor(t: Task): string[] {
  const start = t.due || fmtLocal(new Date())
  const lines = [
    'BEGIN:VEVENT',
    `UID:${t.id}@astrix-ai`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART:${icsStamp(start)}`,
    `DURATION:PT${t.durationMin || 30}M`,
    `SUMMARY:${esc(t.title)}`,
  ]
  if (t.notes) lines.push(`DESCRIPTION:${esc(t.notes)}`)
  const n = Math.max(1, t.interval || 1)
  if (t.repeat === 'daily') lines.push(`RRULE:FREQ=DAILY;INTERVAL=${n}`)
  if (t.repeat === 'weekly') {
    const days = t.days.length ? t.days : [new Date(start).getDay()]
    lines.push(`RRULE:FREQ=WEEKLY;INTERVAL=${n};BYDAY=${days.map((d) => BYDAY[d]).join(',')}`)
  }
  if (t.repeat === 'monthly') lines.push(`RRULE:FREQ=MONTHLY;INTERVAL=${n}`)
  lines.push('BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(t.title)}`, 'END:VALARM', 'END:VEVENT')
  return lines
}

export function buildIcs(tasks: Task[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ASTRIX AI//Planner//EN', 'CALSCALE:GREGORIAN', ...tasks.flatMap(eventFor), 'END:VCALENDAR'].join('\r\n')
}

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
