/**
 * Settings persistence. Stored as a single JSON file in the user data folder so
 * it survives database resets and is easy to back up.
 */
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { DEFAULT_SETTINGS } from '@shared/constants'
import type { AppSettings } from '@shared/types'

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

let cache: AppSettings | null = null

/** Recursively merge stored settings onto defaults so new keys always exist. */
function merge<T>(base: T, override: Partial<T> | undefined): T {
  if (!override) return base
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base }
  for (const key of Object.keys(override) as (keyof T)[]) {
    const value = override[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = merge((base as any)[key] ?? {}, value as any)
    } else if (value !== undefined) {
      out[key] = value
    }
  }
  return out
}

export function getSettings(): AppSettings {
  if (cache) return cache
  try {
    if (existsSync(settingsPath())) {
      const raw = JSON.parse(readFileSync(settingsPath(), 'utf-8'))
      cache = merge(DEFAULT_SETTINGS, raw)
    } else {
      cache = { ...DEFAULT_SETTINGS }
    }
  } catch {
    cache = { ...DEFAULT_SETTINGS }
  }
  return cache!
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = merge(getSettings(), patch)
  cache = next
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}

export function resetSettings(): AppSettings {
  cache = { ...DEFAULT_SETTINGS }
  writeFileSync(settingsPath(), JSON.stringify(cache, null, 2), 'utf-8')
  return cache
}
