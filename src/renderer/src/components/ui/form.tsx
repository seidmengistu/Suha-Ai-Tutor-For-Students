import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { Icon } from './primitives'

const FIELD =
  'w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-fg placeholder:text-muted/70 focus-ring transition-colors'

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(FIELD, 'h-10', className)} {...props} />
  }
)

export function SearchInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return (
    <div className={cn('relative', className)}>
      <Icon name="Search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input className={cn(FIELD, 'h-10 pl-9')} {...props} />
    </div>
  )
}

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(FIELD, 'py-2.5 min-h-[88px] resize-y', className)} {...props} />
})

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  return (
    <div className="relative">
      <select className={cn(FIELD, 'h-10 appearance-none pr-9', className)} {...props}>
        {children}
      </select>
      <Icon
        name="ChevronDown"
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  )
}

export function Label({
  className,
  children,
  hint
}: {
  className?: string
  children: React.ReactNode
  hint?: string
}): JSX.Element {
  return (
    <label className={cn('mb-1.5 flex items-center justify-between text-sm font-medium', className)}>
      <span>{children}</span>
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </label>
  )
}

export function Slider({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return (
    <input
      type="range"
      className={cn(
        'h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-brand',
        className
      )}
      {...props}
    />
  )
}

export function Switch({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 focus-ring rounded-full"
    >
      <span
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors',
          checked ? 'bg-brand' : 'bg-surface-2'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5'
          )}
        />
      </span>
      {label && <span className="text-sm">{label}</span>}
    </button>
  )
}

export interface SegmentOption<T extends string | number> {
  value: T
  label: string
  icon?: string
}
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
  size = 'md'
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (v: T) => void
  className?: string
  size?: 'sm' | 'md'
}): JSX.Element {
  return (
    <div className={cn('inline-flex rounded-xl bg-surface-2 p-1', className)}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg font-medium transition-all focus-ring',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            value === opt.value
              ? 'bg-surface text-fg shadow-soft'
              : 'text-muted hover:text-fg'
          )}
        >
          {opt.icon && <Icon name={opt.icon} size={14} />}
          {opt.label}
        </button>
      ))}
    </div>
  )
}
