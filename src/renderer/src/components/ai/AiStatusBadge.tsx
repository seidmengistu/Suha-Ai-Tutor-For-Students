import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

/** Live indicator of the local AI server status; click to open Settings. */
export function AiStatusBadge(): JSX.Element {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['ai-health'],
    queryFn: () => window.api.ai.health(),
    refetchInterval: 20000
  })
  const ok = data?.ok

  return (
    <button
      onClick={() => navigate('/settings')}
      title={data?.message ?? 'Checking AI server…'}
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-2 focus-ring"
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          isLoading ? 'bg-muted animate-pulse-soft' : ok ? 'bg-success' : 'bg-danger'
        )}
      />
      {isLoading ? 'AI…' : ok ? 'AI online' : 'AI offline'}
    </button>
  )
}
