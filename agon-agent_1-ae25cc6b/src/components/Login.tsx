import { useMemo, useRef, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { login } from '../lib/auth'
import { Logo, Wordmark } from './ui'

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [shakeKey, setShakeKey] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const particles = useMemo(
    () => Array.from({ length: 26 }, (_, i) => ({ id: i, x: (i * 37) % 100, y: (i * 53) % 100, s: 2 + (i % 4), d: 6 + (i % 7), delay: (i % 9) * 0.7 })),
    [],
  )

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!pw || busy) return
    setBusy(true)
    setError('')
    try {
      await login(pw, remember)
      onSuccess()
    } catch (err) {
      setError((err as Error).message)
      setShakeKey((k) => k + 1)
      setPw('')
      input.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-atmos relative grid h-full place-items-center overflow-hidden px-4">
      <div className="bg-grid pointer-events-none absolute inset-0" />
      {particles.map((p) => (
        <span key={p.id} className="animate-float pointer-events-none absolute rounded-full bg-gold-bright" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, animationDuration: `${p.d}s`, animationDelay: `${p.delay}s`, boxShadow: '0 0 10px rgba(244,217,122,.8)' }} />
      ))}

      <motion.div initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} className="relative w-full max-w-[420px]">
        <div className="relative mx-auto mb-7 grid h-28 w-28 place-items-center">
          <div className="animate-spin-slow absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 0deg, transparent 0 55%, rgba(244,217,122,.9) 75%, transparent 80%)', mask: 'radial-gradient(circle, transparent 60%, #000 61%)', WebkitMask: 'radial-gradient(circle, transparent 60%, #000 61%)' }} />
          <div className="absolute inset-3 rounded-full border border-gold/20" />
          <Logo size={56} glow />
        </div>

        <div className="mb-8 text-center">
          <Wordmark className="text-3xl sm:text-4xl" />
          <span className="ml-2 align-top font-display text-[11px] tracking-[.3em] text-gold/70">AI</span>
          <p className="mt-3 text-sm text-mute">Your private intelligence workspace</p>
        </div>

        <motion.form key={shakeKey} onSubmit={submit} animate={shakeKey ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : undefined} transition={{ duration: 0.45 }} className="glass card-gold rounded-2xl p-6 shadow-2xl shadow-black/70">
          <label htmlFor="pw" className="label">Startup password</label>
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gold/70" />
            <input
              id="pw"
              ref={input}
              autoFocus
              type={show ? 'text' : 'password'}
              value={pw}
              onChange={(e) => { setPw(e.target.value); if (error) setError('') }}
              autoComplete="current-password"
              placeholder="Enter password"
              className="field pl-10 pr-11"
              aria-invalid={!!error}
            />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 icon-btn" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          <div className="mt-2 min-h-5 text-[13px] text-danger" role="alert">{error}</div>

          <label className="mt-1 flex cursor-pointer items-center gap-2.5 text-[13px] text-mute select-none">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-[#d4af37]" />
            Keep me signed in on this device
          </label>

          <button type="submit" disabled={!pw || busy} className="btn btn-gold mt-5 w-full py-3 text-[15px]">
            {busy ? <><Loader2 size={17} className="animate-spin" /> Verifying…</> : 'Unlock ASTRIX'}
          </button>
        </motion.form>

        <p className="mt-5 flex items-center justify-center gap-2 text-xs text-dim">
          <ShieldCheck size={14} className="text-gold/60" /> Verified server-side · your AI keys never reach the browser
        </p>
      </motion.div>
    </div>
  )
}
