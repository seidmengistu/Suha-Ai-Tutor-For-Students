import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GRADE_LEVELS, getSubject, subjectsForGrade } from '@shared/constants'
import type { Book, GradeLevel, SubjectKey } from '@shared/types'
import { useSettingsStore } from '@/store/useSettingsStore'
import { toast } from '@/store/useUiStore'
import { Page, PageHeader } from '@/components/layout/Page'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Label,
  Modal,
  ProgressBar,
  Select,
  Skeleton
} from '@/components/ui'

/** Textbook library: browse imported PDFs by grade, import new ones, open the reader. */
export default function Library(): JSX.Element {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const currentGrade = useSettingsStore((s) => s.settings.currentGrade)

  const [importOpen, setImportOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Book | null>(null)

  const booksQuery = useQuery({
    queryKey: ['books'],
    queryFn: () => window.api.books.list()
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => window.api.books.delete(id),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['books'] })
      toast.success(res.message ?? 'Textbook deleted.')
      setDeleteTarget(null)
    },
    onError: () => toast.error('Could not delete the textbook.')
  })

  const books = booksQuery.data ?? []

  // Group by grade, descending grade order is fine, keep ascending for familiarity.
  const grouped = GRADE_LEVELS.map((grade) => ({
    grade,
    books: books.filter((b) => b.gradeLevel === grade)
  })).filter((g) => g.books.length > 0)

  return (
    <Page wide>
      <PageHeader
        title="Library"
        subtitle="Your offline Ethiopian textbooks, read, annotate and index for AI."
        icon="Library"
        actions={
          <Button icon="Upload" onClick={() => setImportOpen(true)}>
            Import textbook
          </Button>
        }
      />

      {booksQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : books.length === 0 ? (
        <EmptyState
          icon="BookPlus"
          title="No textbooks yet"
          description="Import a PDF textbook to start reading and learning with the AI tutor. You can also drop PDFs straight into the app's books/grade-X/<subject> folder and they'll appear here."
          action={
            <Button icon="Upload" onClick={() => setImportOpen(true)}>
              Import a textbook
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(({ grade, books: gradeBooks }) => (
            <section key={grade}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="font-display text-lg font-semibold">Grade {grade}</h2>
                <Badge variant="outline">{gradeBooks.length}</Badge>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {gradeBooks.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    onOpen={() => navigate(`/reader/${book.id}`)}
                    onDelete={() => setDeleteTarget(book)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ImportModal
        open={importOpen}
        defaultGrade={currentGrade}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          void qc.invalidateQueries({ queryKey: ['books'] })
          setImportOpen(false)
        }}
      />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete textbook"
        size="sm"
      >
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted">
            Remove <span className="font-medium text-fg">{deleteTarget?.title}</span> from your
            library? This deletes the file, its bookmarks and AI index.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="Trash2"
              loading={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
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
/* Book card                                                           */
/* ------------------------------------------------------------------ */
function BookCard({
  book,
  onOpen,
  onDelete
}: {
  book: Book
  onOpen: () => void
  onDelete: () => void
}): JSX.Element {
  const subject = getSubject(book.subjectKey)

  const { data: reading } = useQuery({
    queryKey: ['reading', book.id],
    queryFn: () => window.api.reading.get(book.id)
  })

  const lastPage = reading?.lastPage ?? 0
  const totalPages = reading?.totalPages || book.pageCount || 0
  const pct = totalPages ? Math.round((lastPage / totalPages) * 100) : 0
  const hasProgress = lastPage > 0 && totalPages > 0

  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3 p-5 pb-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${subject.color} text-white`}
        >
          <Icon name={subject.icon} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display font-semibold leading-tight" title={book.title}>
            {book.title}
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            {subject.name} · Grade {book.gradeLevel}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5">
        <Badge variant="default">
          <Icon name="FileText" size={11} /> {book.pageCount || '?'} pages
        </Badge>
        {book.indexed === 1 ? (
          <Badge variant="success">
            <Icon name="Sparkles" size={11} /> AI-ready
          </Badge>
        ) : (
          <Badge variant="outline">
            <Icon name="CircleSlash" size={11} /> not indexed
          </Badge>
        )}
      </div>

      <div className="mt-3 px-5">
        {hasProgress ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Page {lastPage} of {totalPages}</span>
              <span>{pct}%</span>
            </div>
            <ProgressBar value={pct} />
          </div>
        ) : (
          <p className="text-xs text-muted">Not started yet</p>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2 p-5 pt-4">
        <Button className="flex-1" icon={hasProgress ? 'BookOpenCheck' : 'BookOpen'} onClick={onOpen}>
          {hasProgress ? 'Continue' : 'Open'}
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} title="Delete textbook">
          <Icon name="Trash2" size={16} />
        </Button>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Import modal                                                        */
/* ------------------------------------------------------------------ */
function ImportModal({
  open,
  defaultGrade,
  onClose,
  onImported
}: {
  open: boolean
  defaultGrade: GradeLevel
  onClose: () => void
  onImported: () => void
}): JSX.Element {
  const [grade, setGrade] = useState<GradeLevel>(defaultGrade)
  const subjects = subjectsForGrade(grade)
  const [subjectKey, setSubjectKey] = useState<SubjectKey>(subjects[0]?.key ?? 'mathematics')

  const importMutation = useMutation({
    mutationFn: () => window.api.books.import({ gradeLevel: grade, subjectKey }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.message ?? 'Textbook imported.')
        onImported()
      } else {
        toast.error(res.message ?? 'Import cancelled.')
      }
    },
    onError: () => toast.error('Could not import the textbook.')
  })

  function handleGradeChange(next: GradeLevel): void {
    setGrade(next)
    const nextSubjects = subjectsForGrade(next)
    // Keep the selected subject if it still exists for the new grade, else reset.
    if (!nextSubjects.some((s) => s.key === subjectKey)) {
      setSubjectKey(nextSubjects[0]?.key ?? 'mathematics')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Import a textbook" size="md">
      <div className="space-y-4 p-5">
        <p className="text-sm text-muted">
          Choose where this PDF belongs, then pick the file. It will be copied into your offline
          library so it works without internet.
        </p>

        <div>
          <Label>Grade</Label>
          <Select
            value={grade}
            onChange={(e) => handleGradeChange(Number(e.target.value) as GradeLevel)}
          >
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Subject</Label>
          <Select value={subjectKey} onChange={(e) => setSubjectKey(e.target.value as SubjectKey)}>
            {subjects.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            icon="Upload"
            loading={importMutation.isPending}
            onClick={() => importMutation.mutate()}
          >
            Choose PDF & import
          </Button>
        </div>
      </div>
    </Modal>
  )
}
