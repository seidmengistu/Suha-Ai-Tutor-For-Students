import { create } from 'zustand'
import { DEFAULT_SETTINGS } from '@shared/constants'
import type { AppSettings, GradeLevel } from '@shared/types'
import { applySettingsToDom } from '@/lib/utils'

interface SettingsState {
  settings: AppSettings
  loaded: boolean
  /** Load persisted settings from the main process and apply them. */
  load: () => Promise<void>
  /** Merge a patch, apply to the DOM and persist. */
  update: (patch: Partial<AppSettings>) => Promise<void>
  setGrade: (grade: GradeLevel) => Promise<void>
  reset: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const settings = await window.api.settings.get()
    applySettingsToDom(settings)
    set({ settings, loaded: true })
  },
  update: async (patch) => {
    // Optimistic apply for instant feedback, then persist.
    const optimistic = mergeSettings(get().settings, patch)
    applySettingsToDom(optimistic)
    set({ settings: optimistic })
    const saved = await window.api.settings.set(patch)
    applySettingsToDom(saved)
    set({ settings: saved })
  },
  setGrade: async (grade) => {
    await get().update({ currentGrade: grade })
  },
  reset: async () => {
    const settings = await window.api.settings.reset()
    applySettingsToDom(settings)
    set({ settings })
  }
}))

function mergeSettings(base: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return {
    ...base,
    ...patch,
    ai: { ...base.ai, ...(patch.ai ?? {}) }
  }
}

/** Convenience selector hook for the active grade. */
export const useCurrentGrade = (): GradeLevel =>
  useSettingsStore((s) => s.settings.currentGrade)
