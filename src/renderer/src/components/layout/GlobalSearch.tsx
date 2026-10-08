import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUiStore } from '@/store/useUiStore'
import { Modal, Icon, SearchInput, Badge } from '@/components/ui'
import type { SearchResult } from '@shared/types'

const KIND_ICON: Record<SearchResult['kind'], string> = {
  lesson: 'BookOpen',
  book: 'Library',
  note: 'NotebookPen',
  bookmark: 'Bookmark',
  question: 'HelpCircle',
  glossary: 'BookA'
}

export function GlobalSearch(): JSX.Element {
  const open = useUiStore((s) => s.searchOpen)
  const setOpen = useUiStore((s) => s.setSearchOpen)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])

  // Ctrl/Cmd+K toggles the palette globally.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!useUiStore.getState().searchOpen)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setOpen])

  // Debounced search.
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    const id = setTimeout(async () => {
      setResults(await window.api.search.global(q))
    }, 180)
    return () => clearTimeout(id)
  }, [query, open])

  function go(r: SearchResult): void {
    setOpen(false)
    setQuery('')
    navigate(r.route)
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)} size="lg" className="!max-w-xl">
      <div className="p-4">
        <SearchInput
          autoFocus
          placeholder="Search lessons, books, notes, questions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="mt-3 max-h-[55vh] space-y-1 overflow-y-auto">
          {results.length === 0 && query.trim() && (
            <p className="py-8 text-center text-sm text-muted">No results for “{query}”.</p>
          )}
          {results.length === 0 && !query.trim() && (
            <p className="py-8 text-center text-sm text-muted">
              Start typing to search across the whole app.
            </p>
          )}
          {results.map((r) => (
            <button
              key={`${r.kind}-${r.id}`}
              onClick={() => go(r)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2 focus-ring"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                <Icon name={KIND_ICON[r.kind]} size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.title}</p>
                {r.snippet && <p className="truncate text-xs text-muted">{r.snippet}</p>}
              </div>
              <Badge variant="outline">{r.kind}</Badge>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
