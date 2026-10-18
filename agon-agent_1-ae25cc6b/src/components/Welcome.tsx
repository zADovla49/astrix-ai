import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Logo } from './ui'

export default function Welcome({ name, onDone }: { name: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2300)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <motion.div className="bg-atmos fixed inset-0 z-[200] grid cursor-pointer place-items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.5 }} onClick={onDone}>
      <div className="bg-grid pointer-events-none absolute inset-0" />
      <div className="relative text-center">
        <motion.div initial={{ scale: 0.4, opacity: 0, rotate: -90 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }} className="mx-auto mb-7 w-fit">
          <Logo size={84} glow />
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.8 }} className="gold-text px-6 font-display text-2xl leading-snug sm:text-4xl">
          Welcome back, {name}!
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }} className="mt-4 text-sm tracking-[.2em] text-mute uppercase">
          Initialising your workspace
        </motion.p>
        <motion.div className="mx-auto mt-6 h-px bg-gradient-to-r from-transparent via-gold to-transparent" initial={{ width: 0 }} animate={{ width: 260 }} transition={{ delay: 0.9, duration: 1.2 }} />
      </div>
    </motion.div>
  )
}
