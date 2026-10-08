import { cn } from '@/lib/utils'
import { Card, CardContent, Icon } from '@/components/ui'
import type { Achievement } from '@shared/types'

/**
 * Resolve a CSS custom property (a space-separated RGB triplet such as
 * "16 185 129") into an `rgb(...)` string that recharts can consume in
 * `fill`/`stroke` attributes. recharts cannot read CSS variables directly.
 */
export function cssColor(name: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v ? `rgb(${v})` : '#10b981'
}

/** Compact, themed tooltip used by every recharts chart on these pages. */
export function ChartTooltip({
  active,
  payload,
  label,
  suffix = ''
}: {
  active?: boolean
  payload?: { value?: number | string; name?: string }[]
  label?: string | number
  suffix?: string
}): JSX.Element | null {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-glass">
      {label !== undefined && <p className="mb-0.5 font-medium text-fg">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-muted">
          <span className="font-semibold text-fg">{p.value}</span>
          {suffix} {p.name}
        </p>
      ))}
    </div>
  )
}

/** Map a 0..1 mastery (or score fraction) to a semantic colour family. */
export function masteryTone(value: number): {
  text: string
  bar: string
  badge: 'danger' | 'warning' | 'success'
  cssVar: string
} {
  if (value < 0.5)
    return { text: 'text-danger', bar: 'bg-danger', badge: 'danger', cssVar: '--danger' }
  if (value < 0.75)
    return { text: 'text-warning', bar: 'bg-warning', badge: 'warning', cssVar: '--warning' }
  return { text: 'text-success', bar: 'bg-success', badge: 'success', cssVar: '--success' }
}

/** Shared achievements grid, reused by Dashboard and Progress. */
export function AchievementsGrid({
  achievements
}: {
  achievements: Achievement[]
}): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {achievements.map((a) => {
        const unlocked = Boolean(a.unlockedAt)
        return (
          <Card
            key={a.id}
            className={cn(
              'relative overflow-hidden border transition-all',
              unlocked
                ? 'border-brand/30 bg-brand-soft/40'
                : 'border-border bg-surface-2/40 opacity-60'
            )}
          >
            <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
              <div
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-2xl',
                  unlocked ? 'bg-brand text-brand-fg shadow-sm shadow-brand/30' : 'bg-surface-2 text-muted'
                )}
              >
                <Icon name={unlocked ? a.icon : 'Lock'} size={22} />
              </div>
              <div>
                <p className={cn('text-sm font-semibold', unlocked ? 'text-fg' : 'text-muted')}>
                  {a.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted">{a.description}</p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
