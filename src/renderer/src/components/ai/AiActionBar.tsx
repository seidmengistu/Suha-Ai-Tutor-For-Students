import { AI_ACTIONS, type AiAction } from '@shared/constants'
import { Icon } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Row of one-click AI teaching actions (Explain, Quiz, Diagram, …). Hides
 * selection-only actions when there is no highlighted text and fills the
 * {{selection}} / {{topic}} placeholders before running.
 */
export function AiActionBar({
  actions = AI_ACTIONS,
  selection,
  topic,
  onRun,
  disabled,
  className
}: {
  actions?: AiAction[]
  selection?: string
  topic?: string
  onRun: (prompt: string, action: AiAction) => void
  disabled?: boolean
  className?: string
}): JSX.Element {
  const visible = actions.filter((a) => !a.needsSelection || (selection && selection.trim().length > 0))

  function fill(action: AiAction): string {
    let prompt = action.prompt
    if (selection) prompt = prompt.replace('{{selection}}', selection.slice(0, 1500))
    if (topic) prompt = prompt.replace('{{topic}}', topic)
    return prompt.replace('{{selection}}', '').replace('{{topic}}', topic ?? 'this topic')
  }

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {visible.map((action) => (
        <button
          key={action.id}
          disabled={disabled}
          onClick={() => onRun(fill(action), action)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-fg/80 transition-colors hover:border-brand/40 hover:bg-brand-soft hover:text-brand disabled:opacity-50 focus-ring"
        >
          <Icon name={action.icon} size={13} />
          {action.label}
        </button>
      ))}
    </div>
  )
}
