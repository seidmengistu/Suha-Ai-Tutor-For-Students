import { NavLink } from 'react-router-dom'
import { APP_NAME } from '@shared/constants'
import { Icon } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/useUiStore'
import { useSettingsStore } from '@/store/useSettingsStore'

interface NavItem {
  to: string
  label: string
  icon: string
}

const MAIN: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'LayoutDashboard' },
  { to: '/subjects', label: 'Subjects', icon: 'GraduationCap' },
  { to: '/library', label: 'Library', icon: 'Library' },
  { to: '/tutor', label: 'AI Tutor', icon: 'Sparkles' },
  { to: '/quiz', label: 'Quiz', icon: 'ListChecks' },
  { to: '/exam', label: 'Exam', icon: 'ClipboardCheck' },
  { to: '/aptitude', label: 'Aptitude', icon: 'BrainCircuit' },
  { to: '/notes', label: 'Notes', icon: 'NotebookPen' },
  { to: '/progress', label: 'Progress', icon: 'TrendingUp' }
]
const SECONDARY: NavItem[] = [
  { to: '/admin', label: 'Admin', icon: 'Settings2' },
  { to: '/settings', label: 'Settings', icon: 'Settings' },
  { to: '/about', label: 'About', icon: 'Info' }
]

function NavRow({
  item,
  collapsed,
  onNavigate
}: {
  item: NavItem
  collapsed: boolean
  onNavigate?: () => void
}): JSX.Element {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all focus-ring',
          // collapse is a desktop-only visual; the mobile drawer always shows labels
          collapsed && 'md:justify-center md:px-0',
          isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-fg'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon name={item.icon} size={18} strokeWidth={isActive ? 2.4 : 2} />
          <span className={cn(collapsed && 'md:hidden')}>{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

export function Sidebar(): JSX.Element {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const mobileOpen = useUiStore((s) => s.mobileNavOpen)
  const setMobileNav = useUiStore((s) => s.setMobileNav)
  const provider = useSettingsStore((s) => s.settings.ai.provider)
  const online = provider === 'groq'
  const close = (): void => setMobileNav(false)

  return (
    <>
      {/* Backdrop (mobile only, when the drawer is open) */}
      <div
        aria-hidden
        onClick={close}
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      />

      <aside
        className={cn(
          // Mobile: off-canvas drawer that slides in over the content.
          'fixed inset-y-0 left-0 z-50 flex w-[260px] shrink-0 flex-col border-r border-border bg-surface transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: always-visible, in-flow, collapsible.
          'md:static md:z-auto md:translate-x-0 md:bg-surface/50',
          collapsed ? 'md:w-[68px]' : 'md:w-[244px]'
        )}
      >
        <div className={cn('flex items-center gap-3 px-5 py-5', collapsed && 'md:justify-center md:px-0')}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-glow">
            <Icon name="GraduationCap" size={22} />
          </div>
          <div className={cn('leading-tight', collapsed && 'md:hidden')}>
            <p className="font-display text-[15px] font-bold">{APP_NAME}</p>
            <p className="text-[11px] text-muted">Grades 7-12 · Ethiopia</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {MAIN.map((item) => (
            <NavRow key={item.to} item={item} collapsed={collapsed} onNavigate={close} />
          ))}
          <div className="my-3 border-t border-border" />
          {SECONDARY.map((item) => (
            <NavRow key={item.to} item={item} collapsed={collapsed} onNavigate={close} />
          ))}
        </nav>

        <div className={cn('px-5 py-4 text-[11px] text-muted', collapsed && 'md:hidden')}>
          <p className="flex items-center gap-1.5">
            <Icon name={online ? 'Cloud' : 'WifiOff'} size={12} />
            {online ? 'Online AI · Groq' : 'Works fully offline'}
          </p>
        </div>
      </aside>
    </>
  )
}
