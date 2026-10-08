import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Page, PageHeader } from '@/components/layout/Page'
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Input,
  Label,
  Modal,
  SearchInput,
  Spinner,
  Textarea
} from '@/components/ui'
import { getSubject } from '@shared/constants'
import { cn, formatRelativeTime } from '@/lib/utils'
import { toast } from '@/store/useUiStore'
import type { Note, NoteInput } from '@shared/types'

/* ------------------------------------------------------------------ */
/* Sticky-note colour palette                                          */
/* ------------------------------------------------------------------ */
type Swatch = { key: string; label: string; dot: string; card: string; ring: string }

const SWATCHES: Swatch[] = [
  {
    key: 'amber',
    label: 'Amber',
    dot: 'bg-amber-400',
    card: 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30',
    ring: 'ring-amber-400'
  },
  {
    key: 'emerald',
    label: 'Emerald',
    dot: 'bg-emerald-400',
    card: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30',
    ring: 'ring-emerald-400'
  },
  {
    key: 'sky',
    label: 'Sky',
    dot: 'bg-sky-400',
    card: 'bg-sky-50 border-sky-200 dark:bg-sky-500/10 dark:border-sky-500/30',
    ring: 'ring-sky-400'
  },
  {
    key: 'rose',
    label: 'Rose',
    dot: 'bg-rose-400',
    card: 'bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/30',
    ring: 'ring-rose-400'
  },
  {
    key: 'violet',
    label: 'Violet',
    dot: 'bg-violet-400',
    card: 'bg-violet-50 border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/30',
    ring: 'ring-violet-400'
  }
]

const DEFAULT_COLOR = SWATCHES[0].key

function swatchFor(color: string): Swatch {
  return SWATCHES.find((s) => s.key === color) ?? SWATCHES[0]
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function Notes(): JSX.Element {
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [editing, setEditing] = useState<Note | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Note | null>(null)

  // Debounce the search box (used for the server-side search query).
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  const { data: allNotes, isLoading } = useQuery({
    queryKey: ['notes'],
    queryFn: () => window.api.notes.list()
  })

  const { data: searched } = useQuery({
    queryKey: ['notes', 'search', debounced],
    queryFn: () => window.api.notes.search(debounced),
    enabled: debounced.length > 0
  })

  const notes = debounced.length > 0 ? searched : allNotes

  const createMut = useMutation({
    mutationFn: (input: NoteInput) => window.api.notes.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] })
      toast.success('Note created')
      setCreating(false)
    },
    onError: () => toast.error('Could not create note')
  })

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<NoteInput> }) =>
      window.api.notes.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] })
      toast.success('Note saved')
      setEditing(null)
    },
    onError: () => toast.error('Could not save note')
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => window.api.notes.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] })
      toast.success('Note deleted')
      setConfirmDelete(null)
    },
    onError: () => toast.error('Could not delete note')
  })

  function exportNotes(): void {
    const items = allNotes ?? []
    if (items.length === 0) {
      toast.info('No notes to export')
      return
    }
    const md = buildMarkdown(items)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'suha-notes.md'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${items.length} note${items.length === 1 ? '' : 's'}`)
  }

  return (
    <Page>
      <PageHeader
        title="Notes"
        subtitle="Capture ideas, summaries and reminders as you study"
        icon="StickyNote"
        actions={
          <>
            <Button variant="outline" icon="Download" onClick={exportNotes}>
              Export notes
            </Button>
            <Button icon="Plus" onClick={() => setCreating(true)}>
              New note
            </Button>
          </>
        }
      />

      <div className="mb-6 max-w-md">
        <SearchInput
          placeholder="Search notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner size={28} />
        </div>
      ) : !notes || notes.length === 0 ? (
        <EmptyState
          icon={debounced ? 'SearchX' : 'StickyNote'}
          title={debounced ? 'No matching notes' : 'No notes yet'}
          description={
            debounced
              ? 'Try a different search term.'
              : 'Create your first note to keep track of key ideas while you learn.'
          }
          action={
            !debounced && (
              <Button icon="Plus" onClick={() => setCreating(true)}>
                New note
              </Button>
            )
          }
        />
      ) : (
        <div className="[column-fill:_balance] gap-5 sm:columns-2 lg:columns-3 xl:columns-4">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onEdit={() => setEditing(note)}
              onDelete={() => setConfirmDelete(note)}
            />
          ))}
        </div>
      )}

      {/* Create */}
      <NoteEditor
        open={creating}
        title="New note"
        onClose={() => setCreating(false)}
        saving={createMut.isPending}
        onSave={(input) => createMut.mutate(input)}
      />

      {/* Edit */}
      <NoteEditor
        open={!!editing}
        title="Edit note"
        note={editing ?? undefined}
        onClose={() => setEditing(null)}
        saving={updateMut.isPending}
        onSave={(input) => {
          if (editing) updateMut.mutate({ id: editing.id, patch: input })
        }}
      />

      {/* Delete confirm */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete note"
        size="sm"
      >
        <div className="p-5">
          <p className="text-sm text-muted">
            Delete <span className="font-medium text-fg">{confirmDelete?.title || 'this note'}</span>?
            This cannot be undone.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="Trash2"
              loading={deleteMut.isPending}
              onClick={() => confirmDelete && deleteMut.mutate(confirmDelete.id)}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </Page>
  )
}

/* ------------------------------------------------------------------ */
/* Note card                                                           */
/* ------------------------------------------------------------------ */
function NoteCard({
  note,
  onEdit,
  onDelete
}: {
  note: Note
  onEdit: () => void
  onDelete: () => void
}): JSX.Element {
  const sw = swatchFor(note.color)
  const context = note.subjectKey
    ? getSubject(note.subjectKey).name
    : note.bookId
      ? `Book #${note.bookId}`
      : null

  return (
    <div
      className={cn(
        'group mb-5 inline-block w-full break-inside-avoid rounded-2xl border p-4 shadow-soft transition-shadow hover:shadow-glass',
        sw.card
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display font-semibold leading-snug">{note.title || 'Untitled'}</h3>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onEdit}
            className="rounded-lg p-1.5 text-fg/60 hover:bg-black/5 hover:text-fg focus-ring dark:hover:bg-white/10"
            aria-label="Edit note"
          >
            <Icon name="Pencil" size={15} />
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg p-1.5 text-fg/60 hover:bg-black/5 hover:text-danger focus-ring dark:hover:bg-white/10"
            aria-label="Delete note"
          >
            <Icon name="Trash2" size={15} />
          </button>
        </div>
      </div>

      {note.body && (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-fg/80 line-clamp-[12]">
          {note.body}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-fg/50">{formatRelativeTime(note.updatedAt)}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {note.gradeLevel != null && <Badge variant="outline">Grade {note.gradeLevel}</Badge>}
          {context && (
            <Badge variant="outline">
              <Icon name="Bookmark" size={11} /> {context}
              {note.page != null ? ` · p.${note.page}` : ''}
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Editor modal (create + edit share this)                            */
/* ------------------------------------------------------------------ */
function NoteEditor({
  open,
  title,
  note,
  onClose,
  onSave,
  saving
}: {
  open: boolean
  title: string
  note?: Note
  onClose: () => void
  onSave: (input: NoteInput) => void
  saving: boolean
}): JSX.Element {
  const [form, setForm] = useState<{ title: string; body: string; color: string }>({
    title: '',
    body: '',
    color: DEFAULT_COLOR
  })

  // Re-seed the form whenever the modal opens (prefill when editing).
  useEffect(() => {
    if (open) {
      setForm({
        title: note?.title ?? '',
        body: note?.body ?? '',
        color: note?.color ?? DEFAULT_COLOR
      })
    }
  }, [open, note])

  const canSave = form.title.trim().length > 0 || form.body.trim().length > 0

  function submit(): void {
    if (!canSave) return
    // Preserve context fields when editing an existing note.
    onSave({
      title: form.title.trim() || 'Untitled',
      body: form.body,
      color: form.color,
      gradeLevel: note?.gradeLevel ?? null,
      subjectKey: note?.subjectKey ?? null,
      bookId: note?.bookId ?? null,
      page: note?.page ?? null,
      lessonId: note?.lessonId ?? null
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4 p-5">
        <div>
          <Label>Title</Label>
          <Input
            autoFocus
            placeholder="Note title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </div>
        <div>
          <Label>Note</Label>
          <Textarea
            placeholder="Write your note…"
            className="min-h-[160px]"
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          />
        </div>
        <div>
          <Label>Colour</Label>
          <div className="flex items-center gap-2.5">
            {SWATCHES.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-label={s.label}
                onClick={() => setForm((f) => ({ ...f, color: s.key }))}
                className={cn(
                  'h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-surface transition-transform hover:scale-110 focus-ring',
                  s.dot,
                  form.color === s.key ? s.ring : 'ring-transparent'
                )}
              >
                {form.color === s.key && (
                  <Icon name="Check" size={16} className="mx-auto text-black/70" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button icon="Save" disabled={!canSave} loading={saving} onClick={submit}>
          Save note
        </Button>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Markdown export                                                     */
/* ------------------------------------------------------------------ */
function buildMarkdown(notes: Note[]): string {
  const lines: string[] = ['# Suha AI Tutor, Notes', '']
  for (const n of notes) {
    lines.push(`## ${n.title || 'Untitled'}`)
    const meta: string[] = []
    if (n.gradeLevel != null) meta.push(`Grade ${n.gradeLevel}`)
    if (n.subjectKey) meta.push(getSubject(n.subjectKey).name)
    if (n.page != null) meta.push(`Page ${n.page}`)
    meta.push(`Updated ${new Date(n.updatedAt.replace(' ', 'T')).toLocaleString()}`)
    lines.push(`*${meta.join(' · ')}*`, '')
    if (n.body) lines.push(n.body, '')
    lines.push('---', '')
  }
  return lines.join('\n')
}
