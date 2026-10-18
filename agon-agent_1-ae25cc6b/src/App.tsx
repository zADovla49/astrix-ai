import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { clearToken, getToken } from './lib/auth'
import { getConfig } from './lib/api'
import { useUI } from './lib/ui'
import { useStore } from './lib/store'
import { describeDue } from './lib/recurrence'
import Login from './components/Login'
import Welcome from './components/Welcome'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import PlannerView from './components/PlannerView'
import MemoryView from './components/MemoryView'
import SettingsView from './components/SettingsView'
import { Logo, Toasts } from './components/ui'

type Phase = 'checking' | 'login' | 'app'

function useTaskReminders(active: boolean) {
  const notified = useRef<Set<string>>(new Set(JSON.parse(sessionStorage.getItem('astrix.notified') || '[]')))
  useEffect(() => {
    if (!active) return
    const check = () => {
      const now = Date.now()
      for (const t of useStore.getState().tasks) {
        if (t.done || !t.due) continue
        const at = new Date(t.due).getTime()
        const key = `${t.id}@${t.due}`
        if (at <= now && now - at < 15 * 60_000 && !notified.current.has(key)) {
          notified.current.add(key)
          sessionStorage.setItem('astrix.notified', JSON.stringify([...notified.current].slice(-200)))
          useUI.getState().toast(`Task due: ${t.title}${t.durationMin ? ` (${t.durationMin} min)` : ''}`, 'info')
          if (useStore.getState().settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
            try { new Notification('ASTRIX · Task due', { body: `${t.title} — ${describeDue(t.due)}`, icon: '/favicon.svg' }) } catch { /* ignore */ }
          }
        }
      }
    }
    check()
    const i = setInterval(check, 20_000)
    return () => clearInterval(i)
  }, [active])
}

export default function App() {
  const [phase, setPhase] = useState<Phase>(getToken() ? 'checking' : 'login')
  const [welcome, setWelcome] = useState(false)
  const view = useUI((s) => s.view)
  const sidebarOpen = useUI((s) => s.sidebarOpen)
  const setSidebarOpen = useUI((s) => s.setSidebarOpen)
  const setConfig = useUI((s) => s.setConfig)
  const name = useStore((s) => s.settings.userName)

  useTaskReminders(phase === 'app')

  const boot = useCallback(async () => {
    try {
      setConfig(await getConfig())
      setPhase('app')
    } catch {
      // 401 handled by the unauth event; network errors fall back to login
      setPhase(getToken() ? 'app' : 'login')
    }
  }, [setConfig])

  useEffect(() => { if (getToken()) void boot() }, [boot])
  useEffect(() => {
    const h = () => { setPhase('login'); setConfig(null) }
    window.addEventListener('astrix:unauth', h)
    const q = () => useUI.getState().toast('Browser storage is full — export a backup and delete old chats.', 'error')
    window.addEventListener('astrix:quota', q)
    return () => { window.removeEventListener('astrix:unauth', h); window.removeEventListener('astrix:quota', q) }
  }, [setConfig])

  const logout = useCallback(() => {
    clearToken()
    setConfig(null)
    useUI.getState().setView('chat')
    setPhase('login')
  }, [setConfig])

  const onLogin = useCallback(async () => {
    setWelcome(true)
    useUI.getState().setView('chat')
    useStore.getState().setActive(null)
    await boot()
  }, [boot])

  if (phase === 'checking') {
    return (
      <div className="bg-atmos grid h-full place-items-center">
        <div className="flex flex-col items-center gap-4"><Logo size={52} glow spin /><Loader2 size={18} className="animate-spin text-gold" /></div>
      </div>
    )
  }
  if (phase === 'login') return (<><Login onSuccess={onLogin} /><Toasts /></>)

  return (
    <div className="bg-atmos flex h-full overflow-hidden">
      <aside className="hidden h-full w-[290px] shrink-0 md:block"><Sidebar onLogout={logout} /></aside>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSidebarOpen(false)} />
            <motion.aside className="fixed inset-y-0 left-0 z-[70] w-[84vw] max-w-[310px] md:hidden" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
              <Sidebar onLogout={logout} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="relative flex h-full min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={view} className="flex h-full min-w-0 flex-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {view === 'chat' && <ChatView />}
            {view === 'planner' && <PlannerView />}
            {view === 'memory' && <MemoryView />}
            {view === 'settings' && <SettingsView onLogout={logout} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>{welcome && <Welcome name={name} onDone={() => setWelcome(false)} />}</AnimatePresence>
      <Toasts />
    </div>
  )
}
