import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  Bell, BrainCircuit, CheckCircle2, CircleAlert, Database, Download, Eye, EyeOff, Globe, KeyRound, Loader2, LogOut, Menu, Sparkles, Trash2, Upload, User, Video, ImageIcon, ShieldCheck, ChevronDown,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { useUI } from '../lib/ui'
import { changePassword, resetPassword } from '../lib/api'
import { getCred } from '../lib/auth'
import { downloadText } from '../lib/recurrence'
import type { Settings, WebMode } from '../lib/types'
import { Confirm, PageHeader, Segmented, Toggle } from './ui'

function Section({ icon, title, desc, children }: { icon: ReactNode; title: string; desc?: string; children: ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="card p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3.5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gold/25 bg-gold/[.08] text-gold">{icon}</div>
        <div>
          <h2 className="text-base font-bold">{title}</h2>
          {desc && <p className="mt-0.5 text-[13px] text-mute">{desc}</p>}
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </motion.section>
  )
}

function Row({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        {desc && <div className="text-xs text-mute">{desc}</div>}
      </div>
      {children}
    </div>
  )
}

function PwField({ id, label, value, onChange, autoComplete }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="relative">
        <input id={id} type={show ? 'text' : 'password'} className="field pr-11" value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} />
        <button type="button" className="icon-btn absolute right-1.5 top-1/2 -translate-y-1/2" onClick={() => setShow((s) => !s)} aria-label={show ? `Hide ${label}` : `Show ${label}`}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
      </div>
    </div>
  )
}

function Status({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-raised/40 p-3">
      {ok ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-ok" /> : <CircleAlert size={17} className="mt-0.5 shrink-0 text-gold" />}
      <div className="min-w-0">
        <div className="text-[13px] font-bold">{label}</div>
        <div className="text-xs leading-relaxed text-mute">{detail}</div>
      </div>
    </div>
  )
}

export default function SettingsView({ onLogout }: { onLogout: () => void }) {
  const settings = useStore((s) => s.settings)
  const cfg = useUI((s) => s.config)
  const toast = useUI((s) => s.toast)
  const setSidebarOpen = useUI((s) => s.setSidebarOpen)
  const up = (p: Partial<Settings>) => useStore.getState().updateSettings(p)

  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [conf, setConf] = useState('')
  const [pwErr, setPwErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<null | 'chats' | 'all' | 'reset-pw'>(null)
  const [setup, setSetup] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const [resetCur, setResetCur] = useState('')

  async function submitPw(e: FormEvent) {
    e.preventDefault()
    setPwErr('')
    if (next.length < 8) return setPwErr('New password must be at least 8 characters.')
    if (next !== conf) return setPwErr('New passwords do not match.')
    if (next === cur) return setPwErr('New password must be different from the current one.')
    setBusy(true)
    try {
      const where = await changePassword(cur, next)
      toast(where === 'server' ? 'Password changed and saved on the server.' : 'Password changed and saved for future visits on this device.', 'success')
      setCur(''); setNext(''); setConf('')
    } catch (err) { setPwErr((err as Error).message) } finally { setBusy(false) }
  }

  async function doResetPw() {
    setBusy(true)
    try { await resetPassword(resetCur); toast('Password reset to the default startup password.', 'success'); setResetCur('') }
    catch (err) { toast((err as Error).message, 'error') } finally { setBusy(false) }
  }

  function exportData() {
    const { chats, tasks, memories, settings: s } = useStore.getState()
    downloadText(`astrix-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'astrix-ai', version: 1, chats, tasks, memories, settings: s }, null, 2), 'application/json')
    toast('Backup downloaded', 'success')
  }
  async function importData(f?: File) {
    if (!f) return
    try {
      const ok = useStore.getState().importData(JSON.parse(await f.text()))
      toast(ok ? 'Backup restored' : 'That file is not a valid ASTRIX backup', ok ? 'success' : 'error')
    } catch { toast('Could not read that backup file', 'error') }
  }

  async function enableNotifications(v: boolean) {
    if (!v) return up({ notifications: false })
    if (!('Notification' in window)) return toast('This browser does not support notifications.', 'error')
    const p = await Notification.requestPermission()
    if (p === 'granted') up({ notifications: true })
    else toast('Notification permission was not granted.', 'error')
  }

  const hasDeviceCred = !!getCred()

  return (
    <div className="scroll h-full min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-4 md:hidden"><button className="icon-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={20} /></button></div>
        <PageHeader title="Settings" subtitle="Security, AI behaviour, and how ASTRIX works for you." />

        <div className="space-y-5 pb-12">
          <Section icon={<User size={19} />} title="Profile" desc="ASTRIX greets you by this name.">
            <div>
              <label className="label" htmlFor="s-name">Your name</label>
              <input id="s-name" className="field" value={settings.userName} maxLength={30} onChange={(e) => up({ userName: e.target.value })} onBlur={() => !settings.userName.trim() && up({ userName: 'Abdulloh' })} />
            </div>
          </Section>

          <Section icon={<Sparkles size={19} />} title="AI settings" desc="Model, creativity and personality of replies.">
            <div>
              <label className="label" htmlFor="s-model">Model</label>
              <div className="relative">
                <select id="s-model" className="field cursor-pointer pr-10" value={settings.model || cfg?.defaultModel || ''} onChange={(e) => up({ model: e.target.value })}>
                  {cfg?.models.map((m) => <option key={m.id} value={m.id} className="bg-panel">{m.label} — {m.provider}{m.vision ? ' (vision)' : ''}</option>)}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-mute" />
              </div>
            </div>
            <div>
              <div className="mb-2 flex justify-between"><span className="label !mb-0">Creativity</span><span className="font-mono text-xs text-gold-bright">{settings.temperature.toFixed(1)}</span></div>
              <input type="range" min={0} max={1.2} step={0.1} value={settings.temperature} onChange={(e) => up({ temperature: Number(e.target.value) })} className="w-full" aria-label="Creativity" />
              <div className="mt-1 flex justify-between text-[11px] text-dim"><span>Precise</span><span>Creative</span></div>
            </div>
            <div>
              <span className="label">Response style</span>
              <Segmented value={settings.style} onChange={(v) => up({ style: v })} options={[{ value: 'concise', label: 'Concise' }, { value: 'balanced', label: 'Balanced' }, { value: 'detailed', label: 'Detailed' }]} />
            </div>
            <div>
              <span className="label">Web search</span>
              <Segmented<WebMode> value={settings.webSearch} onChange={(v) => up({ webSearch: v })} options={[{ value: 'auto', label: 'Auto' }, { value: 'on', label: 'Always' }, { value: 'off', label: 'Off' }]} />
              <p className="mt-2 text-xs text-mute">Auto searches the web when a question needs fresh information. Pasted links are always read.</p>
            </div>
            <div>
              <label className="label" htmlFor="s-ci">Custom instructions</label>
              <textarea id="s-ci" rows={3} className="field resize-none" maxLength={1500} value={settings.customInstructions} onChange={(e) => up({ customInstructions: e.target.value })} placeholder="e.g. Explain things simply. Use examples. Keep answers under 200 words." />
            </div>
            <Row title="Use memory" desc="Share saved memories with the AI."><Toggle checked={settings.useMemory} onChange={(v) => up({ useMemory: v })} label="Use memory" /></Row>
            <Row title="Auto-save memory" desc="Learn lasting details from chats."><Toggle checked={settings.autoMemory} onChange={(v) => up({ autoMemory: v })} label="Auto-save memory" /></Row>
            <Row title="Task reminders" desc="Browser notification when a task is due (app open)."><Toggle checked={settings.notifications} onChange={enableNotifications} label="Task reminders" /></Row>
          </Section>

          <Section icon={<KeyRound size={19} />} title="Password & security" desc="Change the startup password. Verification happens on the server using salted scrypt hashing.">
            <form onSubmit={submitPw} className="space-y-4">
              <PwField id="pw-cur" label="Current password" value={cur} onChange={setCur} autoComplete="current-password" />
              <div className="grid gap-4 sm:grid-cols-2">
                <PwField id="pw-new" label="New password" value={next} onChange={setNext} autoComplete="new-password" />
                <PwField id="pw-conf" label="Confirm new password" value={conf} onChange={setConf} autoComplete="new-password" />
              </div>
              {pwErr && <p className="text-sm text-danger" role="alert">{pwErr}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <button className="btn btn-gold" type="submit" disabled={busy || !cur || !next || !conf}>{busy ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Change password'}</button>
                {hasDeviceCred && <button type="button" className="btn btn-ghost" onClick={() => setConfirm('reset-pw')}>Reset to default</button>}
              </div>
            </form>
            <div className="flex gap-3 rounded-xl border border-gold/20 bg-gold/[.04] p-3.5 text-xs leading-relaxed text-mute">
              <ShieldCheck size={17} className="mt-0.5 shrink-0 text-gold" />
              <div>
                {cfg?.passwordStorage === 'server'
                  ? 'Your password is stored server-side (salted hash in your database), so it works on every device.'
                  : 'Your new password is saved as a tamper-proof, hashed credential in this browser, so it is used on every future visit from this device. Other devices still use the default password until you also change it there — connect a Postgres database (DATABASE_URL) to sync it everywhere.'}
              </div>
            </div>
          </Section>

          <Section icon={<Globe size={19} />} title="Capabilities & setup" desc="What is live on this deployment, and what needs external setup.">
            {cfg ? (
              <>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Status ok label="AI chat" detail={cfg.keyless ? `Running on ${cfg.provider}. Add a provider key for stronger models.` : `Connected to ${cfg.provider}.`} />
                  <Status ok={cfg.vision} label="Image analysis" detail={cfg.vision ? 'A vision model is available — images are analysed visually.' : 'No vision key set: images are read with on-device OCR (text only). Add an OpenAI, Gemini or Anthropic key for true visual analysis.'} />
                  <Status ok label="Web search" detail={cfg.searchKeyed ? `Using ${cfg.search} with automatic fallbacks.` : 'Keyless search via Bing/DuckDuckGo/Wikipedia. Add TAVILY_API_KEY or BRAVE_API_KEY for more reliable results.'} />
                  <Status ok label="Links, YouTube & Instagram" detail="Public pages and YouTube metadata/transcripts are read server-side. Instagram works only for public posts and may be blocked; videos are analysed via captions, not frames." />
                  <Status ok={cfg.database} label="Cross-device storage" detail={cfg.database ? 'Postgres connected: password is synced server-side.' : 'Chats, tasks and memory live in this browser (export a backup in Data). Add DATABASE_URL to sync the password.'} />
                  <Status ok label="Authentication" detail={cfg.passwordFromEnv ? 'Startup password is set by the ASTRIX_PASSWORD server variable.' : 'Server-verified, rate-limited, signed 12h/30d sessions. Set AUTH_SECRET and ASTRIX_PASSWORD on the server to harden it.'} />
                </div>
                <button className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-gold-bright" onClick={() => setSetup((s) => !s)}>
                  <ChevronDown size={15} className={`transition-transform ${setup ? 'rotate-180' : ''}`} /> Environment variables (set in Vercel → Project → Settings)
                </button>
                {setup && (
                  <div className="scroll overflow-x-auto rounded-xl border border-line bg-[#08080b] p-4 font-mono text-[12px] leading-relaxed text-mute">
                    <div><span className="text-gold-bright">OPENAI_API_KEY</span> · <span className="text-gold-bright">ANTHROPIC_API_KEY</span> · <span className="text-gold-bright">GEMINI_API_KEY</span> · <span className="text-gold-bright">GROQ_API_KEY</span> · <span className="text-gold-bright">OPENROUTER_API_KEY</span></div>
                    <div className="text-dim"># any one enables premium models + vision (Groq: text)</div>
                    <div className="mt-2"><span className="text-gold-bright">AI_API_KEY</span> + <span className="text-gold-bright">AI_BASE_URL</span> + <span className="text-gold-bright">AI_MODEL</span> <span className="text-dim"># any OpenAI-compatible API</span></div>
                    <div className="mt-2"><span className="text-gold-bright">TAVILY_API_KEY</span> · <span className="text-gold-bright">BRAVE_API_KEY</span> · <span className="text-gold-bright">SERPER_API_KEY</span> <span className="text-dim"># premium web search</span></div>
                    <div className="mt-2"><span className="text-gold-bright">ASTRIX_PASSWORD</span> <span className="text-dim"># change the default startup password</span></div>
                    <div><span className="text-gold-bright">AUTH_SECRET</span> <span className="text-dim"># long random string for signing sessions</span></div>
                    <div><span className="text-gold-bright">DATABASE_URL</span> <span className="text-dim"># Postgres, to sync the changed password</span></div>
                  </div>
                )}
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-dim"><span className="flex items-center gap-1.5"><ImageIcon size={12} /> Images &amp; PDF/DOCX/text uploads</span><span className="flex items-center gap-1.5"><Video size={12} /> YouTube transcripts</span><span className="flex items-center gap-1.5"><BrainCircuit size={12} /> Memory</span></div>
              </>
            ) : <p className="text-sm text-mute">Loading…</p>}
          </Section>

          <Section icon={<Database size={19} />} title="Data" desc="Everything is stored privately in this browser.">
            <div className="flex flex-wrap gap-2.5">
              <button className="btn btn-ghost" onClick={exportData}><Download size={16} /> Export backup</button>
              <button className="btn btn-ghost" onClick={() => importRef.current?.click()}><Upload size={16} /> Import backup</button>
              <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { void importData(e.target.files?.[0]); e.target.value = '' }} />
              <button className="btn btn-danger" onClick={() => setConfirm('chats')}><Trash2 size={16} /> Delete all chats</button>
              <button className="btn btn-danger" onClick={() => setConfirm('all')}><Trash2 size={16} /> Erase everything</button>
            </div>
          </Section>

          <Section icon={<Bell size={19} />} title="Session">
            <button className="btn btn-ghost" onClick={onLogout}><LogOut size={16} /> Sign out</button>
          </Section>
        </div>
      </div>

      <Confirm open={confirm === 'chats'} onClose={() => setConfirm(null)} title="Delete all chats?" message="Every conversation will be permanently removed from this browser." confirmLabel="Delete chats" onConfirm={() => { useStore.getState().clearChats(); toast('All chats deleted', 'success') }} />
      <Confirm open={confirm === 'all'} onClose={() => setConfirm(null)} title="Erase everything?" message="Chats, tasks, memories and settings will be wiped from this browser. Your password is not affected." confirmLabel="Erase all" onConfirm={() => { useStore.getState().resetAll(); toast('All data erased', 'success') }} />
      {confirm === 'reset-pw' && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && setConfirm(null)}>
          <div className="card card-gold w-full max-w-md p-6">
            <h2 className="mb-1 text-lg font-bold">Reset to default password?</h2>
            <p className="mb-4 text-sm text-mute">Enter your current password to confirm.</p>
            <PwField id="pw-reset" label="Current password" value={resetCur} onChange={setResetCur} autoComplete="current-password" />
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => { setConfirm(null); setResetCur('') }}>Cancel</button>
              <button className="btn btn-gold" disabled={!resetCur || busy} onClick={async () => { await doResetPw(); setConfirm(null) }}>Reset password</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
