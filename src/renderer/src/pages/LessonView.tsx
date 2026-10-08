import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Page } from '@/components/layout/Page'
import { AiPanel } from '@/components/ai/AiPanel'
import { Markdown } from '@/components/ai/Markdown'
import { VizRenderer } from '@/components/viz/VizRenderer'
import { Badge, Button, Card, EmptyState, Icon, Skeleton } from '@/components/ui'
import { getSubject } from '@shared/constants'
import { toast } from '@/store/useUiStore'
import { cn } from '@/lib/utils'
import type { Flashcard, LessonSection } from '@shared/types'

/* Visual treatment per section type: icon + accent colour token. */
const SECTION_META: Record<
  LessonSection['type'],
  { icon: string; accent: string }
> = {
  introduction: { icon: 'Flag', accent: 'text-info' },
  objectives: { icon: 'Target', accent: 'text-brand' },
  theory: { icon: 'BookOpen', accent: 'text-info' },
  'worked-example': { icon: 'PencilRuler', accent: 'text-brand' },
  visual: { icon: 'Image', accent: 'text-fuchsia-500' },
  notes: { icon: 'StickyNote', accent: 'text-warning' },
  'common-mistakes': { icon: 'TriangleAlert', accent: 'text-danger' },
  'memory-tips': { icon: 'Lightbulb', accent: 'text-warning' },
  practice: { icon: 'Dumbbell', accent: 'text-brand' },
  revision: { icon: 'RefreshCw', accent: 'text-info' },
  summary: { icon: 'ListChecks', accent: 'text-success' },
  glossary: { icon: 'BookA', accent: 'text-info' },
  'exam-tips': { icon: 'GraduationCap', accent: 'text-success' }
}

/** Read a single lesson with its structured sections, flashcards and AI tutor. */
export default function LessonView(): JSX.Element {
  const params = useParams()
  const id = Number(params.id)
  const [selection, setSelection] = useState('')
  const [completed, setCompleted] = useState(false)
  const viewRecorded = useRef(false)

  const { data: lesson, isLoading } = useQuery({
    queryKey: ['lesson', id],
    queryFn: () => window.api.curriculum.lesson(id),
    enabled: Number.isFinite(id)
  })

  // Record a "viewed" progress event once per lesson load.
  useEffect(() => {
    if (!lesson || viewRecorded.current) return
    viewRecorded.current = true
    void window.api.progress.record({
      type: 'lesson-viewed',
      gradeLevel: lesson.gradeLevel,
      subjectKey: lesson.subjectKey,
      lessonId: lesson.id,
      value: 2
    })
  }, [lesson])

  const complete = useMutation({
    mutationFn: () =>
      window.api.progress.record({
        type: 'lesson-completed',
        gradeLevel: lesson!.gradeLevel,
        subjectKey: lesson!.subjectKey,
        lessonId: id,
        value: lesson!.estimatedMinutes
      }),
    onSuccess: () => {
      setCompleted(true)
      toast.success('Lesson marked as complete. Great work!')
    },
    onError: () => toast.error('Could not save your progress.')
  })

  function captureSelection(): void {
    const text = window.getSelection()?.toString() ?? ''
    if (text.trim()) setSelection(text.trim())
  }

  if (isLoading) return <LessonSkeleton />

  if (!lesson) {
    return (
      <Page>
        <EmptyState
          icon="FileQuestion"
          title="Lesson not found"
          description="This lesson may have been removed or is not available offline."
          action={
            <Link
              to="/subjects"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-brand-fg transition-all hover:brightness-110 focus-ring"
            >
              <Icon name="ArrowLeft" size={16} /> Back to subjects
            </Link>
          }
        />
      </Page>
    )
  }

  const subject = getSubject(lesson.subjectKey)

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-6 animate-fade-in">
      {/* header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            to={`/subject/${lesson.gradeLevel}/${lesson.subjectKey}`}
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg focus-ring"
          >
            <Icon name="ArrowLeft" size={15} /> {subject.name}
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-tight">{lesson.title}</h1>
          {lesson.summary && <p className="mt-1 max-w-2xl text-sm text-muted">{lesson.summary}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="brand">Grade {lesson.gradeLevel}</Badge>
            <Badge variant="default">
              <Icon name="Clock" size={11} /> {lesson.estimatedMinutes} min
            </Badge>
          </div>
        </div>
        <Button
          icon={completed ? 'CheckCircle2' : 'Check'}
          variant={completed ? 'secondary' : 'primary'}
          disabled={completed}
          loading={complete.isPending}
          onClick={() => complete.mutate()}
        >
          {completed ? 'Completed' : 'Mark as complete'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* LEFT, lesson content (selectable) */}
        <div onMouseUp={captureSelection} className="min-w-0 space-y-5">
          {lesson.sections.map((section, i) => (
            <SectionBlock key={i} section={section} />
          ))}

          {lesson.flashcards && lesson.flashcards.length > 0 && (
            <Flashcards cards={lesson.flashcards} />
          )}

          {/* AI lesson suggestion */}
          <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                <Icon name="Sparkles" size={20} />
              </div>
              <div>
                <p className="font-display font-semibold">Want a deeper walkthrough?</p>
                <p className="text-sm text-muted">
                  Ask the AI tutor on the right to teach “{lesson.title}” step by step.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT, sticky AI panel */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="h-[calc(100vh-8rem)]">
            <AiPanel
              context={{
                gradeLevel: lesson.gradeLevel,
                subjectKey: lesson.subjectKey,
                lessonTitle: lesson.title
              }}
              useRag={true}
              topic={lesson.title}
              selection={selection}
              title="AI Lesson Tutor"
              suggestions={[
                `Teach “${lesson.title}” step by step`,
                'Give me a worked example',
                'Quiz me on this lesson'
              ]}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Section block                                                       */
/* ------------------------------------------------------------------ */
function SectionBlock({ section }: { section: LessonSection }): JSX.Element {
  const meta = SECTION_META[section.type] ?? { icon: 'FileText', accent: 'text-brand' }
  const checklist = section.type === 'objectives' ? parseChecklist(section.body) : null

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon name={meta.icon} size={18} className={meta.accent} />
        <h2 className="font-display text-lg font-semibold">{section.title}</h2>
      </div>

      {checklist ? (
        <ul className="space-y-2">
          {checklist.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <Icon name="CheckCircle2" size={16} className="mt-0.5 shrink-0 text-success" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        section.body && <Markdown content={section.body} />
      )}

      {section.visual && <VizRenderer spec={section.visual} />}

      {section.glossary && section.glossary.length > 0 && (
        <dl className="mt-3 space-y-3">
          {section.glossary.map((entry, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface-2/40 p-3">
              <dt className="font-display text-sm font-semibold text-brand">{entry.term}</dt>
              <dd className="mt-0.5 text-sm text-muted">{entry.definition}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  )
}

/** Split a markdown body into checklist items (list lines or paragraph lines). */
function parseChecklist(body: string): string[] {
  return body
    .split('\n')
    .map((line) => line.replace(/^\s*([-*+]|\d+[.)])\s+/, '').trim())
    .filter((line) => line.length > 0)
}

/* ------------------------------------------------------------------ */
/* Flashcards (flip viewer)                                            */
/* ------------------------------------------------------------------ */
function Flashcards({ cards }: { cards: Flashcard[] }): JSX.Element {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const card = cards[index]

  const go = (delta: number): void => {
    setFlipped(false)
    setIndex((i) => (i + delta + cards.length) % cards.length)
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="Layers" size={18} className="text-brand" />
          <h2 className="font-display text-lg font-semibold">Flashcards</h2>
        </div>
        <Badge variant="outline">
          {index + 1} / {cards.length}
        </Badge>
      </div>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className={cn(
          'flex min-h-[160px] w-full flex-col items-center justify-center gap-2 rounded-2xl border p-6 text-center transition-colors focus-ring',
          flipped
            ? 'border-brand/40 bg-brand-soft'
            : 'border-border bg-surface-2/40 hover:border-brand/30'
        )}
        aria-label="Flip card"
      >
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          {flipped ? 'Answer' : 'Question'}
        </span>
        <span className="text-base font-medium">{flipped ? card.back : card.front}</span>
        <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted">
          <Icon name="RotateCw" size={12} /> Tap to flip
        </span>
      </button>

      <div className="mt-3 flex items-center justify-between">
        <Button variant="outline" size="sm" icon="ChevronLeft" onClick={() => go(-1)}>
          Prev
        </Button>
        <Button variant="outline" size="sm" onClick={() => go(1)}>
          Next <Icon name="ChevronRight" size={14} />
        </Button>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Loading skeleton                                                    */
/* ------------------------------------------------------------------ */
function LessonSkeleton(): JSX.Element {
  return (
    <div className="mx-auto max-w-[1320px] px-6 py-6">
      <Skeleton className="mb-2 h-4 w-28" />
      <Skeleton className="mb-2 h-8 w-2/3" />
      <Skeleton className="mb-6 h-4 w-1/2" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
        <Skeleton className="hidden h-[calc(100vh-8rem)] w-full lg:block" />
      </div>
    </div>
  )
}
