import { forwardRef } from 'react'
import * as Lucide from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Icon, render any lucide-react icon by name                         */
/* ------------------------------------------------------------------ */
export interface IconProps {
  name: string
  className?: string
  size?: number
  strokeWidth?: number
}
export function Icon({ name, className, size = 18, strokeWidth = 2 }: IconProps): JSX.Element {
  const Cmp = (Lucide as unknown as Record<string, Lucide.LucideIcon>)[name] ?? Lucide.Circle
  return <Cmp className={className} size={size} strokeWidth={strokeWidth} aria-hidden />
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'subtle'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: string
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-brand-fg hover:brightness-110 shadow-sm shadow-brand/30 active:scale-[.98]',
  secondary: 'bg-surface-2 text-fg hover:bg-surface-2/70 active:scale-[.98]',
  ghost: 'text-fg/80 hover:bg-surface-2 hover:text-fg',
  outline: 'border border-border bg-transparent hover:bg-surface-2 text-fg',
  danger: 'bg-danger text-white hover:brightness-110 active:scale-[.98]',
  subtle: 'bg-brand-soft text-brand hover:brightness-105'
}
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
  icon: 'h-10 w-10 rounded-xl'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, icon, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all focus-ring disabled:opacity-50 disabled:pointer-events-none select-none',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <Lucide.Loader2 className="animate-spin" size={size === 'sm' ? 14 : 16} />
      ) : (
        icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />
      )}
      {children}
    </button>
  )
})

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */
type BadgeVariant = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'outline'
const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  default: 'bg-surface-2 text-fg/80',
  brand: 'bg-brand-soft text-brand',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
  outline: 'border border-border text-muted'
}
export function Badge({
  variant = 'default',
  className,
  children
}: {
  variant?: BadgeVariant
  className?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        BADGE_VARIANTS[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Spinner / Skeleton                                                  */
/* ------------------------------------------------------------------ */
export function Spinner({ className, size = 20 }: { className?: string; size?: number }): JSX.Element {
  return <Lucide.Loader2 className={cn('animate-spin text-brand', className)} size={size} />
}

export function Skeleton({ className }: { className?: string }): JSX.Element {
  return <div className={cn('shimmer rounded-lg bg-surface-2', className)} />
}

/* ------------------------------------------------------------------ */
/* ProgressBar                                                         */
/* ------------------------------------------------------------------ */
export function ProgressBar({
  value,
  max = 100,
  className,
  barClassName
}: {
  value: number
  max?: number
  className?: string
  barClassName?: string
}): JSX.Element {
  const pct = Math.min(100, Math.max(0, (value / (max || 1)) * 100))
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}>
      <div
        className={cn('h-full rounded-full bg-brand transition-all duration-500', barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */
export function Card({
  className,
  children,
  hover,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }): JSX.Element {
  return (
    <div
      className={cn(
        'card',
        hover && 'transition-all hover:shadow-glass hover:-translate-y-0.5 cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }): JSX.Element {
  return <div className={cn('p-5 pb-0', className)}>{children}</div>
}
export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }): JSX.Element {
  return <h3 className={cn('font-display text-base font-semibold', className)}>{children}</h3>
}
export function CardDescription({ className, children }: { className?: string; children: React.ReactNode }): JSX.Element {
  return <p className={cn('text-sm text-muted', className)}>{children}</p>
}
export function CardContent({ className, children }: { className?: string; children: React.ReactNode }): JSX.Element {
  return <div className={cn('p-5', className)}>{children}</div>
}

/* ------------------------------------------------------------------ */
/* EmptyState                                                          */
/* ------------------------------------------------------------------ */
export function EmptyState({
  icon = 'Inbox',
  title,
  description,
  action
}: {
  icon?: string
  title: string
  description?: string
  action?: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted">
        <Icon name={icon} size={26} />
      </div>
      <div>
        <p className="font-display font-semibold">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}
