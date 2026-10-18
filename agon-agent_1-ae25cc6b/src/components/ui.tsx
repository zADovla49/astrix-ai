import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, BrainCircuit, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useUI } from '../lib/ui'

export function Logo({ size = 36, glow = false, spin = false }: { size?: number; glow?: boolean; spin?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={glow ? { filter: 'drop-shadow(0 0 14px rgba(212,175,55,.55))' } : undefined} className={spin ? 'animate-spin-slow' : undefined}>
      <defs>
        <linearGradient id="lg" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fbe9a0" />
          <stop offset=".55" stopColor="#d4af37" />
          <stop offset="1" stopColor="#9a7414" />
        </linearGradient>
      </defs>
      <g stroke="url(#lg)" strokeWidth="5.5" strokeLinecap="round">
        <path d="M32 7v50" />
        <path d="M10.4 19.5l43.2 25" />
        <path d="M10.4 44.5l43.2-25" />
      </g>
      <circle cx="32" cy="32" r="6" fill="#07070a" stroke="url(#lg)" strokeWidth="3" />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display tracking-[.28em] ${className}`}>
      <span className="gold-text">ASTRIX</span>
    </span>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors ${checked ? 'border-gold bg-gold/25' : 'border-line bg-raised'}`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className={`absolute top-0.5 h-4.5 w-4.5 rounded-full ${checked ? 'right-0.5 bg-gold-bright shadow-[0_0_10px_rgba(244,217,122,.7)]' : 'left-0.5 bg-mute'}`}
        style={{ height: 18, width: 18 }}
      />
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex w-full rounded-xl border border-line bg-raised/60 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`relative flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${value === o.value ? 'text-[#17120a]' : 'text-mute hover:text-cream'}`}
        >
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join('')}`} className="absolute inset-0 rounded-lg bg-gradient-to-br from-gold-bright to-gold" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className={`card card-gold scroll max-h-[92vh] w-full overflow-y-auto rounded-b-none p-5 sm:rounded-b-2xl sm:p-6 ${wide ? 'max-w-xl' : 'max-w-md'}`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{title}</h2>
              <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Confirm({ open, title, message, confirmLabel = 'Delete', onConfirm, onClose }: { open: boolean; title: string; message: string; confirmLabel?: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex gap-3">
        <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-danger/10 text-danger"><AlertTriangle size={18} /></div>
        <p className="text-sm leading-relaxed text-mute">{message}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger" onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
      </div>
    </Modal>
  )
}

const ICONS = { info: Info, success: CheckCircle2, error: XCircle, memory: BrainCircuit }
const TONE = { info: 'text-gold-bright', success: 'text-ok', error: 'text-danger', memory: 'text-gold-bright' }

export function Toasts() {
  const { toasts, dismiss } = useUI()
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[120] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2 md:left-auto md:right-5 md:translate-x-0">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICONS[t.kind]
          return (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }} className="glass pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 shadow-2xl shadow-black/60" role="status">
              <Icon size={18} className={`mt-0.5 shrink-0 ${TONE[t.kind]}`} />
              <p className="flex-1 text-sm leading-snug">{t.text}</p>
              <button className="text-dim hover:text-cream" onClick={() => dismiss(t.id)} aria-label="Dismiss"><X size={14} /></button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-gold/25 bg-gold/5 text-gold">{icon}</div>
      <h3 className="text-base font-bold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-mute">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-mute">{subtitle}</p>
      </div>
      {actions}
    </div>
  )
}
