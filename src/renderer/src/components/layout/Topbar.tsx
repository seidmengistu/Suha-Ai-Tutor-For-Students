import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GRADE_LEVELS } from '@shared/constants'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUiStore } from '@/store/useUiStore'
import { Icon, Select } from '@/components/ui'
import { AiStatusBadge } from '@/components/ai/AiStatusBadge'
import type { GradeLevel } from '@shared/types'

/** Toggles native full-screen via the browser Fullscreen API (works in Electron). */
function FullscreenButton(): JSX.Element {
  const [fs, setFs] = useState(typeof document !== 'undefined' && !!document.fullscreenElement)
  useEffect(() => {
    const handler = (): void => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])
  const toggle = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()
  }
  return (
    <button
      onClick={toggle}
      title={fs ? 'Exit full screen' : 'Full screen'}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface hover:bg-surface-2 focus-ring"
    >
      <Icon name={fs ? 'Minimize' : 'Maximize'} size={17} />
    </button>
  )
}

export function Topbar(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const setGrade = useSettingsStore((s) => s.setGrade)
  const update = useSettingsStore((s) => s.update)
  const setMobileNav = useUiStore((s) => s.setMobileNav)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const navigate = useNavigate()

  const isDark = document.documentElement.classList.contains('dark')

  // Changing grade jumps to that grade's Subjects page (useful from the Reader, lessons, etc.).
  const onGradeChange = (g: GradeLevel): void => {
    setGrade(g)
    navigate('/subjects')
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/60 px-4 backdrop-blur-xl sm:px-5">
      {/* Mobile: open the navigation drawer */}
      <button
        onClick={() => setMobileNav(true)}
        title="Menu"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface hover:bg-surface-2 focus-ring md:hidden"
      >
        <Icon name="Menu" size={18} />
      </button>
      {/* Desktop: collapse / expand the sidebar */}
      <button
        onClick={toggleSidebar}
        title="Toggle sidebar"
        className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface hover:bg-surface-2 focus-ring md:flex"
      >
        <Icon name="PanelLeft" size={17} />
      </button>

      <div className="ml-auto flex items-center gap-2 sm:gap-2.5">
        <div className="flex items-center gap-2">
          <Icon name="GraduationCap" size={16} className="text-muted" />
          <Select
            value={settings.currentGrade}
            onChange={(e) => onGradeChange(Number(e.target.value) as GradeLevel)}
            className="h-9 w-[110px]"
          >
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </Select>
        </div>

        <AiStatusBadge />

        <span className="hidden sm:block">
          <FullscreenButton />
        </span>

        <button
          onClick={() => update({ theme: isDark ? 'light' : 'dark' })}
          title="Toggle theme"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface hover:bg-surface-2 focus-ring"
        >
          <Icon name={isDark ? 'Sun' : 'Moon'} size={17} />
        </button>
      </div>
    </header>
  )
}
