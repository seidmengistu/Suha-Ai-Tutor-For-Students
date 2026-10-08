import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Page, PageHeader } from '@/components/layout/Page'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Icon,
  Label,
  Modal,
  Select,
  Spinner,
  Tabs
} from '@/components/ui'
import { useSettingsStore } from '@/store/useSettingsStore'
import { GRADE_LEVELS, getSubject, subjectsForGrade } from '@shared/constants'
import { cn } from '@/lib/utils'
import { toast } from '@/store/useUiStore'
import type { BackupResult, Difficulty, GradeLevel, SubjectKey } from '@shared/types'

type TabId = 'library' | 'database' | 'curriculum'

const TABS = [
  { id: 'library', label: 'Library', icon: 'Library' },
  { id: 'database', label: 'Database', icon: 'Database' },
  { id: 'curriculum', label: 'Curriculum', icon: 'GraduationCap' }
]

/** Admin panel: RAG library status, database maintenance and curriculum info. */
export default function Admin(): JSX.Element {
  const [tab, setTab] = useState<TabId>('library')

  return (
    <Page>
      <PageHeader
        title="Admin Panel"
        subtitle="Manage the textbook library, database and curriculum"
        icon="ShieldCheck"
      />

      <Tabs items={TABS} value={tab} onChange={(id) => setTab(id as TabId)} className="mb-6" />

      {tab === 'library' && <LibraryTab />}
      {tab === 'database' && <DatabaseTab />}
      {tab === 'curriculum' && <CurriculumTab />}
    </Page>
  )
}

/* ------------------------------------------------------------------ */
/* Library tab                                                         */
/* ------------------------------------------------------------------ */
function LibraryTab(): JSX.Element {
  const qc = useQueryClient()

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['rag-status'],
    queryFn: () => window.api.rag.status()
  })

  const { data: books, isLoading: booksLoading } = useQuery({
    queryKey: ['books'],
    queryFn: () => window.api.books.list()
  })

  const reindexMut = useMutation({
    mutationFn: () => window.api.rag.reindexAll(),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['rag-status'] })
      qc.invalidateQueries({ queryKey: ['books'] })
      toast.success(s.message || 'Reindexing complete')
    },
    onError: () => toast.error('Reindexing failed')
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>RAG library status</CardTitle>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : status ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Stat icon="Books" label="Total books" value={status.totalBooks} />
                <Stat icon="BookCheck" label="Indexed books" value={status.indexedBooks} />
                <Stat icon="Boxes" label="Text chunks" value={status.totalChunks} />
              </div>
              {status.message && (
                <p className="mt-4 text-sm text-muted">{status.message}</p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  icon="RefreshCw"
                  loading={reindexMut.isPending || status.busy}
                  onClick={() => reindexMut.mutate()}
                >
                  Reindex all
                </Button>
                {status.busy && <Badge variant="warning">Indexing in progress…</Badge>}
              </div>
              <p className="mt-3 text-xs text-muted">
                Individual books can also be indexed from the Reader using the “Index for AI” button.
              </p>
            </>
          ) : (
            <EmptyState title="Status unavailable" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Textbooks</CardTitle>
        </CardHeader>
        <CardContent>
          {booksLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : !books || books.length === 0 ? (
            <EmptyState
              icon="BookPlus"
              title="No textbooks imported"
              description="Import Ethiopian curriculum PDFs from the Library to enable offline RAG."
            />
          ) : (
            <ul className="divide-y divide-border">
              {books.map((book) => (
                <li key={book.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                    <Icon name="BookText" size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{book.title}</p>
                    <p className="text-xs text-muted">
                      Grade {book.gradeLevel} · {getSubject(book.subjectKey).name} ·{' '}
                      {book.pageCount} pages
                    </p>
                  </div>
                  {book.indexed ? (
                    <Badge variant="success">
                      <Icon name="Check" size={11} /> Indexed
                      {book.chunkCount ? ` · ${book.chunkCount}` : ''}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not indexed</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({
  icon,
  label,
  value
}: {
  icon: string
  label: string
  value: number | string
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/50 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Icon name={icon} size={20} />
      </div>
      <div>
        <p className="font-display text-xl font-bold leading-none">{value}</p>
        <p className="mt-1 text-xs text-muted">{label}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Database tab                                                        */
/* ------------------------------------------------------------------ */
type ConfirmKind = 'restore' | 'reseed'

function DatabaseTab(): JSX.Element {
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null)

  function notify(res: BackupResult): void {
    if (res.ok) toast.success(res.message || 'Done')
    else toast.error(res.message || 'Operation failed')
  }

  const exportMut = useMutation({
    mutationFn: () => window.api.admin.export(),
    onSuccess: notify,
    onError: () => toast.error('Export failed')
  })
  const backupMut = useMutation({
    mutationFn: () => window.api.admin.backup(),
    onSuccess: notify,
    onError: () => toast.error('Backup failed')
  })
  const restoreMut = useMutation({
    mutationFn: () => window.api.admin.restore(),
    onSuccess: (res) => {
      notify(res)
      setConfirm(null)
    },
    onError: () => {
      toast.error('Restore failed')
      setConfirm(null)
    }
  })
  const reseedMut = useMutation({
    mutationFn: () => window.api.admin.reseed(),
    onSuccess: (res) => {
      notify(res)
      setConfirm(null)
    },
    onError: () => {
      toast.error('Reset failed')
      setConfirm(null)
    }
  })
  const exportContentMut = useMutation({
    mutationFn: () => window.api.admin.exportContent(),
    onSuccess: notify,
    onError: () => toast.error('Content export failed')
  })
  const paperPackMut = useMutation({
    mutationFn: () => window.api.paper.exportPack(),
    onSuccess: (res) => {
      if (res.ok) toast.success(res.message || 'Exported')
      else toast.error(res.message || 'Export failed')
    },
    onError: () => toast.error('Export failed')
  })

  return (
    <div className="space-y-6">
      <BulkGenerator />
      <Card>
        <CardHeader>
          <CardTitle>Backup &amp; restore</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ActionRow
            icon="PackageOpen"
            title="Export content pack (for distribution)"
            description="Save all generated chapters, lessons and question banks as a seed file. Drop it into resources/seed/ and rebuild so students get everything with no AI needed."
            action={
              <Button
                icon="Package"
                loading={exportContentMut.isPending}
                onClick={() => exportContentMut.mutate()}
              >
                Export pack
              </Button>
            }
          />
          <ActionRow
            icon="FileStack"
            title="Export paper-exam pack (preload for everyone)"
            description="Bundle the paper exams you added in the Exams page (PDF plus answer key) into paper-exams/ so every install ships with them. Rebuild after exporting."
            action={
              <Button
                variant="outline"
                icon="Package"
                loading={paperPackMut.isPending}
                onClick={() => paperPackMut.mutate()}
              >
                Export
              </Button>
            }
          />
          <ActionRow
            icon="FileDown"
            title="Export database"
            description="Save a copy of all your data, progress and notes to a file."
            action={
              <Button
                variant="outline"
                icon="Download"
                loading={exportMut.isPending}
                onClick={() => exportMut.mutate()}
              >
                Export
              </Button>
            }
          />
          <ActionRow
            icon="DatabaseBackup"
            title="Create backup"
            description="Make a timestamped backup of the current database."
            action={
              <Button
                variant="outline"
                icon="Save"
                loading={backupMut.isPending}
                onClick={() => backupMut.mutate()}
              >
                Backup
              </Button>
            }
          />
          <ActionRow
            icon="History"
            title="Restore from backup"
            description="Replace the current database with a saved backup. The app will restart."
            tone="warning"
            action={
              <Button variant="outline" icon="Upload" onClick={() => setConfirm('restore')}>
                Restore
              </Button>
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionRow
            icon="RotateCcw"
            title="Reset curriculum to defaults"
            description="Re-seed the built-in curriculum, subjects and starter questions. Your imported books and notes are kept."
            tone="danger"
            action={
              <Button variant="danger" icon="RotateCcw" onClick={() => setConfirm('reseed')}>
                Reset curriculum
              </Button>
            }
          />
        </CardContent>
      </Card>

      {/* Restore confirm */}
      <Modal
        open={confirm === 'restore'}
        onClose={() => setConfirm(null)}
        title="Restore from backup?"
        size="sm"
      >
        <div className="p-5">
          <p className="text-sm text-muted">
            This will replace your current database with a backup file you select and{' '}
            <span className="font-medium text-fg">restart the app</span>. Unsaved data may be lost.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon="Upload"
              loading={restoreMut.isPending}
              onClick={() => restoreMut.mutate()}
            >
              Choose backup &amp; restore
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reseed confirm */}
      <Modal
        open={confirm === 'reseed'}
        onClose={() => setConfirm(null)}
        title="Reset curriculum?"
        size="sm"
      >
        <div className="p-5">
          <p className="text-sm text-muted">
            This restores the default curriculum, subjects and seed questions. Your imported
            textbooks and personal notes are preserved.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="RotateCcw"
              loading={reseedMut.isPending}
              onClick={() => reseedMut.mutate()}
            >
              Reset to defaults
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/**
 * Bulk question generator, grows the offline bank toward a target per subject
 * using the AI (Groq or local). Each generated answer is verified before saving.
 * The work loops in the renderer so the user can watch progress and stop anytime.
 */
function BulkGenerator(): JSX.Element {
  const qc = useQueryClient()
  const currentGrade = useSettingsStore((s) => s.settings.currentGrade)
  const [grade, setGrade] = useState<GradeLevel>(currentGrade)
  const subjects = subjectsForGrade(grade).filter((s) => s.key !== 'aptitude')
  const [subjectKey, setSubjectKey] = useState<SubjectKey | 'all'>('all')
  const [target, setTarget] = useState(200)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [log, setLog] = useState<string[]>([])
  const stopRef = useRef(false)

  const { data: aiHealth } = useQuery({
    queryKey: ['ai-health'],
    queryFn: () => window.api.ai.health(),
    refetchInterval: 20000
  })
  const aiOnline = aiHealth?.ok ?? false

  async function run(): Promise<void> {
    if (!aiOnline) {
      toast.error('AI is offline, set a Groq key or start a local server in Settings.')
      return
    }
    setRunning(true)
    setLog([])
    stopRef.current = false
    const list = subjectKey === 'all' ? subjects.map((s) => s.key) : [subjectKey]
    const diffs: Difficulty[] = ['beginner', 'medium', 'difficult', 'exam']
    let added = 0
    try {
      for (const sk of list) {
        if (stopRef.current) break
        const chapters = await window.api.curriculum.chapters(grade, sk).catch(() => [])
        const topics = chapters
          .map((c) => c.title.replace(/^\s*(unit|chapter)\s*\d+\s*[:.\-]?\s*/i, '').trim())
          .filter(Boolean)
        let have = await window.api.quiz.count(grade, sk)
        const startHave = have
        let i = 0
        let stale = 0
        while (have < target && !stopRef.current && stale < 4) {
          const topic = topics.length ? topics[i % topics.length] : getSubject(sk).name
          const chapterId = chapters.length ? chapters[i % chapters.length].id : undefined
          setProgress(`${getSubject(sk).name}, ${have}/${target}`)
          const made = await window.api.quiz
            .generate({
              gradeLevel: grade,
              subjectKey: sk,
              topic,
              difficulty: diffs[i % diffs.length],
              count: 20,
              chapterId,
              save: true
            })
            .catch(() => [] as unknown[])
          const n = Array.isArray(made) ? made.length : 0
          if (n === 0) stale++
          else stale = 0
          have += n
          added += n
          i++
          qc.invalidateQueries({ queryKey: ['quiz-count', grade, sk] })
        }
        setLog((p) => [
          ...p,
          `${getSubject(sk).name}: +${have - startHave} → ${have}${have < target ? ' (stopped early, AI returned nothing)' : ''}`
        ])
      }
      toast.success(`Added ${added} question${added === 1 ? '' : 's'} to the bank.`)
    } finally {
      setRunning(false)
      setProgress('')
      qc.invalidateQueries({ queryKey: ['quiz-count'] })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk question generator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted">
          Grow the offline question bank toward a target per subject using your AI (Groq or local). Every
          answer is independently verified before it&rsquo;s saved. Keep this tab open while it runs.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Grade</Label>
            <Select
              value={grade}
              disabled={running}
              onChange={(e) => setGrade(Number(e.target.value) as GradeLevel)}
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
            <Select
              value={subjectKey}
              disabled={running}
              onChange={(e) => setSubjectKey(e.target.value as SubjectKey | 'all')}
            >
              <option value="all">All subjects</option>
              {subjects.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Target / subject</Label>
            <Select value={target} disabled={running} onChange={(e) => setTarget(Number(e.target.value))}>
              {[100, 200, 300, 500].map((n) => (
                <option key={n} value={n}>
                  {n} questions
                </option>
              ))}
            </Select>
          </div>
        </div>
        {!aiOnline && (
          <p className="flex items-center gap-1.5 text-xs text-warning">
            <Icon name="TriangleAlert" size={13} /> AI is offline, set a Groq key or start a local server in
            Settings.
          </p>
        )}
        <div className="flex items-center gap-3">
          {running ? (
            <Button variant="danger" icon="Square" onClick={() => (stopRef.current = true)}>
              Stop
            </Button>
          ) : (
            <Button icon="Sparkles" disabled={!aiOnline} onClick={run}>
              Generate
            </Button>
          )}
          {running && progress && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <Spinner size={13} /> {progress}
            </span>
          )}
        </div>
        {log.length > 0 && (
          <ul className="space-y-1 rounded-lg bg-surface-2/50 p-3 text-xs text-muted">
            {log.map((l, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <Icon name="Check" size={12} className="text-success" /> {l}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">
          Generating to 500 across all subjects makes many AI calls and can take a while, a fast Groq model is
          recommended. You can Stop anytime; questions already made are kept.
        </p>
      </CardContent>
    </Card>
  )
}

function ActionRow({
  icon,
  title,
  description,
  action,
  tone = 'default'
}: {
  icon: string
  title: string
  description: string
  action: React.ReactNode
  tone?: 'default' | 'warning' | 'danger'
}): JSX.Element {
  const toneCls =
    tone === 'danger'
      ? 'text-danger bg-danger/10'
      : tone === 'warning'
        ? 'text-warning bg-warning/10'
        : 'text-muted bg-surface-2'
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border p-4">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', toneCls)}>
        <Icon name={icon} size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Curriculum tab                                                      */
/* ------------------------------------------------------------------ */
function CurriculumTab(): JSX.Element {
  const currentGrade = useSettingsStore((s) => s.settings.currentGrade)

  const { data: grades, isLoading } = useQuery({
    queryKey: ['curriculum-grades'],
    queryFn: () => window.api.curriculum.grades()
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={26} />
      </div>
    )
  }

  if (!grades || grades.length === 0) {
    return <EmptyState icon="GraduationCap" title="No curriculum data" />
  }

  const totalSubjects = grades.reduce((sum, g) => sum + g.subjects.length, 0)
  const current = grades.find((g) => g.level === currentGrade)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Stat icon="GraduationCap" label="Grades" value={grades.length} />
        <Stat icon="LibraryBig" label="Subject offerings" value={totalSubjects} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Subjects for Grade {currentGrade}</CardTitle>
        </CardHeader>
        <CardContent>
          {!current || current.subjects.length === 0 ? (
            <EmptyState title="No subjects for this grade" />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {current.subjects.map((subject) => (
                <div
                  key={subject.key}
                  className="flex items-center gap-3 rounded-xl border border-border p-3"
                >
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white',
                      subject.color
                    )}
                  >
                    <Icon name={subject.icon} size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{subject.name}</p>
                    <p className="truncate text-xs text-muted">{subject.description}</p>
                  </div>
                  {subject.hasTextbook ? (
                    <Badge variant="outline">Textbook</Badge>
                  ) : (
                    <Badge variant="brand">Practice</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted">
            Change the active grade in Settings → Learning. This view is informational.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
