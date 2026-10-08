import { AnimatePresence, motion } from 'framer-motion'
import { useUiStore } from '@/store/useUiStore'
import { Icon } from '@/components/ui'
import { cn } from '@/lib/utils'

const ICONS = { info: 'Info', success: 'CheckCircle2', error: 'AlertCircle' } as const
const STYLES = {
  info: 'text-info',
  success: 'text-success',
  error: 'text-danger'
} as const

export function Toaster(): JSX.Element {
  const toasts = useUiStore((s) => s.toasts)
  const remove = useUiStore((s) => s.removeToast)

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-80 flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-glass"
          >
            <Icon name={ICONS[t.type]} size={18} className={cn('mt-0.5 shrink-0', STYLES[t.type])} />
            <p className="flex-1 text-sm">{t.message}</p>
            <button onClick={() => remove(t.id)} className="text-muted hover:text-fg">
              <Icon name="X" size={15} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
