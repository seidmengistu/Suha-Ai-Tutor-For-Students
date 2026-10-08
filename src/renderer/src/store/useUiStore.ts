import { create } from 'zustand'

export type ToastType = 'info' | 'success' | 'error'
export interface Toast {
  id: number
  type: ToastType
  message: string
}

interface UiState {
  toasts: Toast[]
  searchOpen: boolean
  sidebarCollapsed: boolean
  mobileNavOpen: boolean
  addToast: (message: string, type?: ToastType) => void
  removeToast: (id: number) => void
  setSearchOpen: (open: boolean) => void
  toggleSidebar: () => void
  setMobileNav: (open: boolean) => void
}

let nextId = 1

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  searchOpen: false,
  mobileNavOpen: false,
  sidebarCollapsed:
    typeof localStorage !== 'undefined' && localStorage.getItem('sidebarCollapsed') === '1',
  setMobileNav: (open) => set({ mobileNavOpen: open }),
  addToast: (message, type = 'info') => {
    const id = nextId++
    set({ toasts: [...get().toasts, { id, type, message }] })
    setTimeout(() => get().removeToast(id), 4200)
  },
  removeToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  toggleSidebar: () =>
    set((s) => {
      const v = !s.sidebarCollapsed
      try {
        localStorage.setItem('sidebarCollapsed', v ? '1' : '0')
      } catch {
        /* ignore */
      }
      return { sidebarCollapsed: v }
    })
}))

/** Imperative toast helper for use outside React components. */
export const toast = {
  info: (m: string) => useUiStore.getState().addToast(m, 'info'),
  success: (m: string) => useUiStore.getState().addToast(m, 'success'),
  error: (m: string) => useUiStore.getState().addToast(m, 'error')
}
