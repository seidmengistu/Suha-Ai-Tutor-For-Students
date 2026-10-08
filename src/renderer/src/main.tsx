import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { queryClient } from './lib/queryClient'
import { useSettingsStore } from './store/useSettingsStore'
import './index.css'

function mount(): void {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
    </React.StrictMode>
  )
}

// The Electron preload has already injected `window.api`. Load persisted
// settings before the first paint, then mount.
async function bootstrap(): Promise<void> {
  await useSettingsStore
    .getState()
    .load()
    .catch(() => undefined)
  mount()
}

void bootstrap()
