import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Page, PageHeader } from '@/components/layout/Page'
import { Badge, EmptyState, Icon, Spinner } from '@/components/ui'
import { getSubject } from '@shared/constants'
import { cn } from '@/lib/utils'
import type { SearchKind, SearchResult } from '@shared/types'

/* Display metadata for each result kind. */
const KIND_META: Record<SearchKind, { icon: string; label: string }> = {
  lesson: { icon: 'BookOpen', label: 'Lesson' },
  book: { icon: 'Book', label: 'Book' },
  note: { icon: 'StickyNote', label: 'Note' },
  bookmark: { icon: 'Bookmark', label: 'Bookmark' },
  question: { icon: 'ListChecks', label: 'Question' },
  glossary: { icon: 'BookA', label: 'Glossary' }
}

const KIND_ORDER: SearchKind[] = ['lesson', 'book', 'note', 'question', 'glossary', 'bookmark']

/** Full-page global search across lessons, books, notes and questions. */
export default function Search(): JSX.Element {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  const {
    data: results,
    isFetching
  } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => window.api.search.global(debounced),
    enabled: debounced.length > 0
  })

  // Group results by kind, preserving a sensible kind ordering.
  const groups = useMemo(() => {
    const byKind = new Map<SearchKind, SearchResult[]>()
    for (const r of results ?? []) {
      const list = byKind.get(r.kind) ?? []
      list.push(r)
      byKind.set(r.kind, list)
    }
    return KIND_ORDER.filter((k) => byKind.has(k)).map((k) => ({
      kind: k,
      items: byKind.get(k)!
    }))
  }, [results])

  const total = results?.length ?? 0

  return (
    <Page>
      <PageHeader
        title="Search"
        subtitle="Find lessons, textbooks, notes and questions across Suha"
        icon="Search"
      />

      <div className="mx-auto max-w-2xl">
        <div className="relative">
          <Icon
            name="Search"
            size={20}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search everything…"
            className="h-14 w-full rounded-2xl border border-border bg-surface pl-12 pr-12 text-base text-fg placeholder:text-muted/70 shadow-soft focus-ring"
          />
          {isFetching && (
            <Spinner size={18} className="absolute right-4 top-1/2 -translate-y-1/2" />
          )}
        </div>
        <p className="mt-2 px-1 text-xs text-muted">
          Tip: you can also press <kbd className="rounded bg-surface-2 px-1.5 py-0.5">Ctrl</kbd>{' '}
          <kbd className="rounded bg-surface-2 px-1.5 py-0.5">K</kbd> anywhere for quick search.
        </p>
      </div>

      <div className="mx-auto mt-8 max-w-2xl">
        {debounced.length === 0 ? (
          <EmptyState
            icon="Search"
            title="Start typing to search"
            description="Search across lessons, textbooks, your notes and the question bank."
          />
        ) : isFetching && total === 0 ? (
          <div className="flex justify-center py-16">
            <Spinner size={26} />
          </div>
        ) : total === 0 ? (
          <EmptyState
            icon="SearchX"
            title="No results"
            description={`Nothing matched “${debounced}”. Try a different word or check your spelling.`}
          />
        ) : (
          <div className="space-y-7">
            {groups.map((group) => (
              <section key={group.kind}>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <Icon name={KIND_META[group.kind].icon} size={15} className="text-muted" />
                  <h2 className="text-sm font-semibold text-muted">
                    {KIND_META[group.kind].label}
                  </h2>
                  <Badge variant="outline">{group.items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {group.items.map((r) => (
                    <ResultRow key={`${r.kind}-${r.id}`} result={r} onOpen={() => navigate(r.route)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Page>
  )
}

function ResultRow({
  result,
  onOpen
}: {
  result: SearchResult
  onOpen: () => void
}): JSX.Element {
  const meta = KIND_META[result.kind]
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex w-full items-start gap-3 rounded-xl border border-border bg-surface p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft focus-ring'
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
        <Icon name={meta.icon} size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{result.title}</p>
          {result.subjectKey && (
            <Badge variant="outline">{getSubject(result.subjectKey).name}</Badge>
          )}
        </div>
        {result.snippet && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">{result.snippet}</p>
        )}
      </div>
      <Icon
        name="ArrowUpRight"
        size={16}
        className="mt-1 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  )
}
