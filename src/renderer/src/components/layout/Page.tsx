import { cn } from '@/lib/utils'
import { Icon } from '@/components/ui'

/** Standard padded, max-width page container with a fade-in. */
export function Page({
  children,
  className,
  wide
}: {
  children: React.ReactNode
  className?: string
  wide?: boolean
}): JSX.Element {
  return (
    <div className={cn('mx-auto px-6 py-6 animate-fade-in', wide ? 'max-w-[1320px]' : 'max-w-[1180px]', className)}>
      {children}
    </div>
  )
}

/** Consistent page header with title, optional subtitle/icon and right actions. */
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  className
}: {
  title: string
  subtitle?: string
  icon?: string
  actions?: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <div className={cn('mb-6 flex items-start justify-between gap-4', className)}>
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <Icon name={icon} size={22} />
          </div>
        )}
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
