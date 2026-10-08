import { APP_NAME, CREDIT } from '@shared/constants'

/** Global footer. The author credit appears on every main page as required. */
export function Footer(): JSX.Element {
  return (
    <footer className="flex shrink-0 items-center justify-between border-t border-border bg-surface/60 px-6 py-2.5 text-xs text-muted">
      <span>
        {APP_NAME} · Offline AI Learning Platform for Ethiopian Students
      </span>
      <span className="font-medium text-fg/70">{CREDIT}</span>
    </footer>
  )
}
