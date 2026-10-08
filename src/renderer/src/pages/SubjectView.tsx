import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getSubject } from '@shared/constants'
import { Page, PageHeader } from '@/components/layout/Page'
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Icon,
  Skeleton,
  Tabs
} from '@/components/ui'
import { toast } from '@/store/useUiStore'
import { cn } from '@/lib/utils'
import type { Chapter, Difficulty, GradeLevel, QuizMode, SubjectKey } from '@shared/types'

type TabId = 'lessons' | 'books' | 'practice'

const TABS = [
  { id: 'lessons', label: 'Lessons', icon: 'GraduationCap' },
  { id: 'books', label: 'Books', icon: 'BookText' },
  { id: 'practice', label: 'Practice', icon: 'ListChecks' }
]

/** A single subject hub: lessons, textbooks and practice for one grade. */
export default function SubjectView(): JSX.Element {
  const params = useParams()
  const navigate = useNavigate()
  const grade = Number(params.grade) as GradeLevel
  const subjectKey = params.subjectKey as SubjectKey
  const subject = getSubject(subjectKey)
  const [tab, setTab] = useState<TabId>('lessons')

  return (
    <Page>
      <PageHeader
        title={subject.name}
        subtitle={`Grade ${grade} · ${subject.description}`}
        icon={subject.icon}
        actions={
          <Button variant="outline" icon="ArrowLeft" onClick={() => navigate('/subjects')}>
            Subjects
          </Button>
        }
      />

      <Tabs
        items={TABS}
        value={tab}
        onChange={(id) => setTab(id as TabId)}
        className="mb-5"
      />

      {tab === 'lessons' && <LessonsTab grade={grade} subjectKey={subjectKey} />}
      {tab === 'books' && <BooksTab grade={grade} subjectKey={subjectKey} />}
      {tab === 'practice' && (
        <PracticeTab grade={grade} subjectKey={subjectKey} subjectName={subject.name} />
      )}
    </Page>
  )
}

/* ------------------------------------------------------------------ */
/* Lessons tab                                                         */
/* ------------------------------------------------------------------ */
function LessonsTab({
  grade,
  subjectKey
}: {
  grade: GradeLevel
  subjectKey: SubjectKey
}): JSX.Element {
  const { data: chapters, isLoading } = useQuery({
    queryKey: ['chapters', grade, subjectKey],
    queryFn: () => window.api.curriculum.chapters(grade, subjectKey)
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (!chapters || chapters.length === 0) {
    return (
      <EmptyState
        icon="BookX"
        title="No lessons yet"
        description="Lessons for this subject haven’t been added yet."
      />
    )
  }

  return (
    <div className="space-y-3">
      {chapters.map((chapter) => (
        <ChapterRow key={chapter.id} chapter={chapter} />
      ))}
    </div>
  )
}

function ChapterRow({ chapter }: { chapter: Chapter }): JSX.Element {
  const [open, setOpen] = useState(false)

  const { data: lessons, isLoading } = useQuery({
    queryKey: ['lessons', chapter.id],
    queryFn: () => window.api.curriculum.lessons(chapter.id),
    enabled: open
  })

  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left focus-ring"
        aria-expanded={open}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-sm font-semibold text-brand">
          {chapter.orderIndex}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-semibold">{chapter.title}</p>
          {chapter.description && (
            <p className="truncate text-sm text-muted">{chapter.description}</p>
          )}
        </div>
        {typeof chapter.lessonCount === 'number' && (
          <Badge variant="outline">{chapter.lessonCount} lessons</Badge>
        )}
        <Icon
          name="ChevronDown"
          size={18}
          className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="border-t border-border">
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !lessons || lessons.length === 0 ? (
            <p className="p-4 text-sm text-muted">No lessons in this chapter yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {lessons.map((lesson) => (
                <li key={lesson.id}>
                  <Link
                    to={`/lesson/${lesson.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 focus-ring"
                  >
                    <Icon name="FileText" size={16} className="shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{lesson.title}</p>
                      {lesson.summary && (
                        <p className="truncate text-xs text-muted">{lesson.summary}</p>
                      )}
                    </div>
                    <Badge variant="default">
                      <Icon name="Clock" size={11} /> {lesson.estimatedMinutes} min
                    </Badge>
                    <Icon name="ChevronRight" size={16} className="shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Books tab                                                           */
/* ------------------------------------------------------------------ */
function BooksTab({
  grade,
  subjectKey
}: {
  grade: GradeLevel
  subjectKey: SubjectKey
}): JSX.Element {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [importing, setImporting] = useState(false)

  const queryKey = ['books', { gradeLevel: grade, subjectKey }]
  const { data: books, isLoading } = useQuery({
    queryKey,
    queryFn: () => window.api.books.list({ gradeLevel: grade, subjectKey })
  })

  async function handleImport(): Promise<void> {
    setImporting(true)
    try {
      const result = await window.api.books.import({ gradeLevel: grade, subjectKey })
      await qc.invalidateQueries({ queryKey })
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
    } catch {
      toast.error('Could not import the textbook.')
    } finally {
      setImporting(false)
    }
  }

  const importButton = (
    <Button icon="Upload" loading={importing} onClick={handleImport}>
      Import textbook
    </Button>
  )

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (!books || books.length === 0) {
    return (
      <EmptyState
        icon="BookPlus"
        title="No textbooks yet"
        description="Import a PDF textbook for this subject to read it and ground the AI tutor in it."
        action={importButton}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{importButton}</div>
      <div className="space-y-3">
        {books.map((book) => (
          <Card key={book.id} className="flex items-center gap-4 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <Icon name="BookText" size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display font-semibold">{book.title}</p>
              <p className="text-sm text-muted">
                {book.pageCount} pages
                {book.indexed ? ' · indexed for AI' : ''}
              </p>
            </div>
            <Button
              variant="outline"
              icon="BookOpen"
              onClick={() => navigate(`/reader/${book.id}`)}
            >
              Open
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Practice tab                                                        */
/* ------------------------------------------------------------------ */
const DIFFICULTIES: { value: Difficulty; label: string; icon: string; hint: string }[] = [
  { value: 'beginner', label: 'Beginner', icon: 'Sprout', hint: 'Warm-up basics' },
  { value: 'medium', label: 'Medium', icon: 'Gauge', hint: 'Build fluency' },
  { value: 'difficult', label: 'Difficult', icon: 'Flame', hint: 'Stretch yourself' },
  { value: 'exam', label: 'Exam', icon: 'GraduationCap', hint: 'National-exam level' }
]

function PracticeTab({
  grade,
  subjectKey,
  subjectName
}: {
  grade: GradeLevel
  subjectKey: SubjectKey
  subjectName: string
}): JSX.Element {
  const navigate = useNavigate()

  const startQuiz = (difficulty: Difficulty, mode: QuizMode): void => {
    navigate(
      `/quiz?grade=${grade}&subject=${subjectKey}&difficulty=${difficulty}&mode=${mode}`
    )
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted">
          Practice by difficulty
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DIFFICULTIES.map((d) => (
            <Card key={d.value} hover onClick={() => startQuiz(d.value, 'practice')}>
              <CardContent className="space-y-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <Icon name={d.icon} size={20} />
                </div>
                <div>
                  <p className="font-display font-semibold">{d.label}</p>
                  <p className="text-sm text-muted">{d.hint}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted">
          Exam modes
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            icon="Pencil"
            onClick={() => startQuiz('medium', 'practice')}
          >
            Practice quiz
          </Button>
          <Button
            variant="secondary"
            icon="Timer"
            onClick={() => startQuiz('exam', 'mock-exam')}
          >
            Mock exam
          </Button>
        </div>
      </section>

      <Card className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
            <Icon name="Sparkles" size={22} />
          </div>
          <div>
            <p className="font-display font-semibold">Need help first?</p>
            <p className="text-sm text-muted">
              Ask the AI Tutor to explain a topic before you practice.
            </p>
          </div>
        </div>
        <Button icon="MessageSquare" onClick={() => navigate('/tutor')}>
          Ask the AI Tutor about {subjectName}
        </Button>
      </Card>
    </div>
  )
}
