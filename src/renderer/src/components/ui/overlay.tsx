import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Icon } from './primitives'

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  size = 'md'
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}): JSX.Element {
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className={cn(
              'relative z-10 w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-glass',
              widths[size],
              className
            )}
          >
            {title && (
              <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <h3 className="font-display font-semibold">{title}</h3>
                <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg focus-ring">
                  <Icon name="X" size={18} />
                </button>
              </div>
            )}
            <div className="max-h-[80vh] overflow-y-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */
export interface TabItem {
  id: string
  label: string
  icon?: string
}
export function Tabs({
  items,
  value,
  onChange,
  className
}: {
  items: TabItem[]
  value: string
  onChange: (id: string) => void
  className?: string
}): JSX.Element {
  return (
    <div className={cn('flex items-center gap-1 border-b border-border', className)}>
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium transition-colors focus-ring',
              active ? 'text-brand' : 'text-muted hover:text-fg'
            )}
          >
            {item.icon && <Icon name={item.icon} size={15} />}
            {item.label}
            {active && (
              <motion.span
                layoutId="tab-underline"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
