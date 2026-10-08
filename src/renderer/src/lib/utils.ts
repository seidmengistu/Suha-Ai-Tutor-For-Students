import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { ACCENTS } from '@shared/constants'
import type { AppSettings } from '@shared/types'

/** Conditional className helper with Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Apply theme, accent, font scale, motion and language to the document. */
export function applySettingsToDom(settings: AppSettings): void {
  const root = document.documentElement

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark)
  root.classList.toggle('dark', dark)

  const accent = ACCENTS[settings.accent] ?? ACCENTS.emerald
  root.style.setProperty('--brand', accent.brand)
  if (!dark) root.style.setProperty('--brand-soft', accent.soft)

  root.style.fontSize = `${Math.round(16 * settings.fontScale)}px`
  document.body.classList.toggle('reduce-motion', settings.reduceMotion)
  document.body.classList.toggle('font-ethiopic', settings.language === 'am')
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

export function percent(value: number, total: number): number {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(then).toLocaleDateString()
}

export function initials(text: string): string {
  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
