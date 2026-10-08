import { Icon } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Small floating toolbar shown near an active text selection inside the reader.
 * Positioned (absolutely) by the parent via `style.left` / `style.top`.
 */
export function SelectionToolbar({
  x,
  y,
  onAskAi,
  onCopy,
  className
}: {
  x: number
  y: number
  onAskAi: () => void
  onCopy: () => void
  className?: string
}): JSX.Element {
  return (
    <div
      className={cn(
        'absolute z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-surface p-1 shadow-glass animate-fade-in',
        className
      )}
      style={{ left: x, top: y }}
      // Prevent the mousedown from clearing the window selection.
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        onClick={onAskAi}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand hover:bg-brand-soft focus-ring"
      >
        <Icon name="Sparkles" size={14} /> Ask AI
      </button>
      <span className="h-4 w-px bg-border" />
      <button
        onClick={onCopy}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-fg/80 hover:bg-surface-2 hover:text-fg focus-ring"
      >
        <Icon name="Copy" size={14} /> Copy
      </button>
    </div>
  )
}
