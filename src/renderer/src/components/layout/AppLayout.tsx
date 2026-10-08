import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { Footer } from './Footer'
import { Toaster } from './Toaster'
import { GlobalSearch } from './GlobalSearch'

/** Root chrome: persistent sidebar + topbar, scrollable page area, footer. */
export function AppLayout(): JSX.Element {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <Footer />
      </div>
      <Toaster />
      <GlobalSearch />
    </div>
  )
}
