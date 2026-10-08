import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { GRADE_LEVELS, getSubject, subjectsForGrade } from '@shared/constants'
import { useSettingsStore } from '@/store/useSettingsStore'
import { Page, PageHeader } from '@/components/layout/Page'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Label,
  Select,
  Slider,
  Spinner,
  Switch
} from '@/components/ui'
import { QuizRunner } from '@/components/quiz/QuizRunner'
import { shuffleQuestionOptions } from '@/lib/quiz'
import { toast } from '@/store/useUiStore'
import { cn } from '@/lib/utils'
import type {
  Difficulty,
  GradeLevel,
  Question,
  QuizFilter,
  QuizMode,
  SubjectKey,
  TopicMastery
} from '@shared/types'

/* ------------------------------------------------------------------ */
/* Option metadata                                                     */
/* ------------------------------------------------------------------ */

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'medium', label: 'Medium' },
  { value: 'difficult', label: 'Difficult' },
  { value: 'exam', label: 'Exam level' }
]

const MODES: { value: QuizMode; label: string; icon: string; desc: string }[] = [
  {
    value: 'practice',
    label: 'Practice',
    icon: 'Dumbbell',
    desc: 'Instant feedback and explanations after every question.'
  },
  {
    value: 'revision',
    label: 'Revision',
    icon: 'NotebookPen',
    desc: 'Review-focused with answers revealed as you go.'
  },
  {
    value: 'random',
    label: 'Random',
    icon: 'Shuffle',
    desc: 'A mixed set of questions, feedback at the end.'
  },
  {
    value: 'adaptive',
    label: 'Adaptive',
    icon: 'TrendingUp',
    desc: 'Targets your weakest topics based on past results.'
  },
  {
    value: 'mock-exam',
    label: 'Mock exam',
    icon: 'GraduationCap',
    desc: 'Timed, exam-style, no feedback until you finish.'
  }
]

const DEFAULT_COUNT = 10

function isSubjectKey(v: string | null, grade: GradeLevel): v is SubjectKey {
  if (!v) return false
  return subjectsForGrade(grade).some((s) => s.key === v)
}

function isDifficulty(v: string | null): v is Difficulty {
  return v === 'beginner' || v === 'medium' || v === 'difficult' || v === 'exam'
}

function isMode(v: string | null): v is QuizMode {
  return (
    v === 'practice' ||
    v === 'random' ||
    v === 'adaptive' ||
    v === 'revision' ||
    v === 'mock-exam'
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Quiz(): JSX.Element {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const currentGrade = useSettingsStore((s) => s.settings.currentGrade)

  // Initial filters from the URL (e.g. deep-linked from a lesson).
  const initialGrade = useMemo<GradeLevel>(() => {
    const g = Number(params.get('grade')) as GradeLevel
    return GRADE_LEVELS.includes(g) ? g : currentGrade
  }, [params, currentGrade])

  const subjectsAvailable = subjectsForGrade(initialGrade).filter((s) => s.key !== 'aptitude')

  const [grade, setGrade] = useState<GradeLevel>(initialGrade)
  const [subjectKey, setSubjectKey] = useState<SubjectKey>(() => {
    const fromUrl = params.get('subject')
    if (isSubjectKey(fromUrl, initialGrade) && fromUrl !== 'aptitude') return fromUrl
    return subjectsAvailable[0]?.key ?? 'mathematics'
  })
  const [difficulty, setDifficulty] = useState<Difficulty>(() =>
    isDifficulty(params.get('difficulty')) ? (params.get('difficulty') as Difficulty) : 'medium'
  )
  const [mode, setMode] = useState<QuizMode>(() =>
    isMode(params.get('mode')) ? (params.get('mode') as QuizMode) : 'practice'
  )
  const [count, setCount] = useState<number>(DEFAULT_COUNT)
  const [useAi, setUseAi] = useState(false)
  const chapterId = useMemo(() => {
    const c = Number(params.get('chapter'))
    return Number.isFinite(c) && c > 0 ? c : undefined
  }, [params])

  // Loaded question set + a flag so we can show a tailored empty state.
  const [questions, setQuestions] = useState<Question[] | null>(null)

  const subjects = subjectsForGrade(grade).filter((s) => s.key !== 'aptitude')

  const { data: bankCount } = useQuery({
    queryKey: ['quiz-count', grade, subjectKey],
    queryFn: () => window.api.quiz.count(grade, subjectKey)
  })

  /* ---- start: build the question set ------------------------------ */
  const start = useMutation({
    mutationFn: async (): Promise<Question[]> => {
      const subjectName = getSubject(subjectKey).name

      // Fresh AI questions take priority when toggled on.
      if (useAi) {
        const generated = await window.api.quiz.generate({
          gradeLevel: grade,
          subjectKey,
          topic: subjectName,
          difficulty,
          count,
          chapterId
        })
        return generated
      }

      // Adaptive: bias toward the weakest topic when we have mastery data.
      if (mode === 'adaptive') {
        let weakestTopic: string | undefined
        try {
          const mastery = await window.api.progress.mastery(grade, subjectKey)
          weakestTopic = pickWeakestTopic(mastery)
        } catch {
          weakestTopic = undefined
        }
        const filter: QuizFilter = {
          gradeLevel: grade,
          subjectKey,
          chapterId,
          difficulty,
          limit: count,
          ...(weakestTopic ? { topic: weakestTopic } : {})
        }
        const focused = await window.api.quiz.questions(filter)
        // Fall back to the full pool if the weak-topic filter is too narrow.
        if (focused.length > 0) return focused
        return window.api.quiz.questions({
          gradeLevel: grade,
          subjectKey,
          chapterId,
          difficulty,
          limit: count
        })
      }

      // Default path.
      return window.api.quiz.questions({
        gradeLevel: grade,
        subjectKey,
        chapterId,
        difficulty,
        limit: count
      })
    },
    onSuccess: (data) => {
      if (data.length === 0 && useAi) {
        toast.error('The AI server returned no questions. Is it running? Try seeded questions instead.')
      }
      setQuestions(data.map(shuffleQuestionOptions))
    },
    onError: () => {
      if (useAi) {
        toast.error('AI generation failed, the local AI server may be offline.')
      } else {
        toast.error('Could not load questions. Please try again.')
      }
      setQuestions([])
    }
  })

  const resetToSetup = (): void => {
    setQuestions(null)
    start.reset()
  }

  /* ================================================================ */
  /* Active quiz                                                       */
  /* ================================================================ */
  if (questions && questions.length > 0) {
    return (
      <Page>
        <PageHeader
          title="Quiz"
          subtitle={`${getSubject(subjectKey).name} · Grade ${grade}`}
          icon="ListChecks"
          actions={
            <Button variant="outline" icon="Plus" onClick={resetToSetup}>
              New quiz
            </Button>
          }
        />
        <QuizRunner
          questions={questions}
          mode={mode}
          gradeLevel={grade}
          subjectKey={subjectKey}
          chapterId={chapterId}
          onExit={resetToSetup}
        />
      </Page>
    )
  }

  /* ================================================================ */
  /* Empty state (loaded but nothing came back)                       */
  /* ================================================================ */
  if (questions && questions.length === 0) {
    return (
      <Page>
        <PageHeader title="Quiz" subtitle="Test your knowledge" icon="ListChecks" />
        <EmptyState
          icon="SearchX"
          title="No questions found"
          description={
            useAi
              ? 'The AI server could not generate questions. Make sure your local AI server is running, then try again, or turn off AI generation to use seeded questions.'
              : 'There are no seeded questions for this selection yet. Try a different subject or difficulty, import textbook content, or enable the AI server to generate fresh questions.'
          }
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" icon="ArrowLeft" onClick={resetToSetup}>
                Change options
              </Button>
              <Button variant="ghost" icon="Settings" onClick={() => navigate('/settings')}>
                Open settings
              </Button>
            </div>
          }
        />
      </Page>
    )
  }

  /* ================================================================ */
  /* Setup screen                                                      */
  /* ================================================================ */
  const activeMode = MODES.find((m) => m.value === mode)

  return (
    <Page>
      <PageHeader
        title="Quiz"
        subtitle="Choose your subject and mode, then test your knowledge"
        icon="ListChecks"
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Main configuration */}
        <Card className="p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label>Grade</Label>
              <Select
                value={grade}
                onChange={(e) => {
                  const g = Number(e.target.value) as GradeLevel
                  setGrade(g)
                  const next = subjectsForGrade(g).filter((s) => s.key !== 'aptitude')
                  if (!next.some((s) => s.key === subjectKey)) {
                    setSubjectKey(next[0]?.key ?? 'mathematics')
                  }
                }}
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
              {bankCount != null && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                  <Icon name="Database" size={11} /> {bankCount.toLocaleString()} questions in the bank
                </p>
              )}
            </div>

            <div>
              <Label>Difficulty</Label>
              <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                {DIFFICULTIES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label hint={`${count} questions`}>Number of questions</Label>
              <div className="flex h-10 items-center gap-3">
                <Slider
                  min={5}
                  max={30}
                  step={1}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
                <span className="w-8 text-right text-sm font-semibold tabular-nums">{count}</span>
              </div>
            </div>
          </div>

          {/* Mode picker */}
          <div className="mt-6">
            <Label>Mode</Label>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {MODES.map((m) => {
                const active = mode === m.value
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMode(m.value)}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all focus-ring',
                      active
                        ? 'border-brand bg-brand-soft/60'
                        : 'border-border hover:border-brand/50 hover:bg-surface-2'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        active ? 'bg-brand text-brand-fg' : 'bg-surface-2 text-muted'
                      )}
                    >
                      <Icon name={m.icon} size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className={cn('text-sm font-semibold', active && 'text-brand')}>{m.label}</p>
                      <p className="mt-0.5 text-xs text-muted">{m.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* AI generation toggle */}
          <div className="mt-6 flex items-start justify-between gap-4 rounded-xl border border-border bg-surface-2/40 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <Icon name="Sparkles" size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold">Generate fresh AI questions</p>
                <p className="mt-0.5 text-xs text-muted">
                  Create brand-new questions with your local AI instead of the seeded bank. Requires the
                  AI server to be running.
                </p>
              </div>
            </div>
            <Switch checked={useAi} onChange={setUseAi} />
          </div>
        </Card>

        {/* Summary / start panel */}
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <h3 className="font-display font-semibold">Ready to start?</h3>
            <p className="mt-1 text-sm text-muted">{activeMode?.desc}</p>

            <div className="mt-4 flex flex-col gap-2 text-sm">
              <SummaryRow icon="GraduationCap" label="Grade" value={`Grade ${grade}`} />
              <SummaryRow icon="LibraryBig" label="Subject" value={getSubject(subjectKey).name} />
              <SummaryRow icon="Gauge" label="Difficulty" value={difficulty} />
              <SummaryRow icon="ListChecks" label="Questions" value={String(count)} />
              <SummaryRow
                icon={useAi ? 'Sparkles' : 'Database'}
                label="Source"
                value={useAi ? 'AI generated' : 'Seeded bank'}
              />
            </div>

            <Button
              className="mt-5 w-full"
              size="lg"
              icon="Play"
              loading={start.isPending}
              onClick={() => start.mutate()}
            >
              {start.isPending ? 'Preparing…' : 'Start quiz'}
            </Button>
            {useAi && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <Icon name="Info" size={12} /> AI generation can take a moment.
              </p>
            )}
          </Card>

          {mode === 'adaptive' && (
            <Card className="flex items-start gap-3 border-brand/30 bg-brand-soft/30 p-4">
              <Icon name="TrendingUp" size={18} className="mt-0.5 shrink-0 text-brand" />
              <p className="text-xs text-muted">
                Adaptive mode looks at your past results and focuses on the topic you find hardest. If
                you have no history yet, it falls back to a normal mix.
              </p>
            </Card>
          )}
        </div>
      </div>

      {start.isPending && (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted">
          <Spinner size={16} /> {useAi ? 'Generating questions with AI…' : 'Loading questions…'}
        </div>
      )}
    </Page>
  )
}

/* ------------------------------------------------------------------ */
/* Bits                                                                */
/* ------------------------------------------------------------------ */

function SummaryRow({
  icon,
  label,
  value
}: {
  icon: string
  label: string
  value: string
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2 text-muted">
        <Icon name={icon} size={14} />
        {label}
      </span>
      <Badge variant="outline" className="capitalize">
        {value}
      </Badge>
    </div>
  )
}

/** Lowest-mastery topic with at least one attempt, if any. */
function pickWeakestTopic(mastery: TopicMastery[]): string | undefined {
  const seen = mastery.filter((m) => m.attempts > 0 && m.topic)
  if (seen.length === 0) return undefined
  return seen.reduce((min, m) => (m.mastery < min.mastery ? m : min)).topic
}
