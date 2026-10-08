import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMutation } from '@tanstack/react-query'
import { Badge, Button, Card, Icon, Input, ProgressBar } from '@/components/ui'
import { Markdown } from '@/components/ai/Markdown'
import { MathText } from '@/components/ai/MathText'
import { cn } from '@/lib/utils'
import { toast } from '@/store/useUiStore'
import type {
  GradeLevel,
  Question,
  QuizAnswer,
  QuizMode,
  SubjectKey
} from '@shared/types'

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Modes that reveal the answer + explanation right after each question. */
const FEEDBACK_MODES: ReadonlyArray<QuizMode> = ['practice', 'revision']
/** Modes that run against the clock. */
const TIMED_MODES: ReadonlyArray<QuizMode> = ['mock-exam']
/** Seconds allowed per question in a mock exam. */
const SECONDS_PER_QUESTION = 60

function isChoiceQuestion(q: Question): boolean {
  return q.type === 'mcq' || q.type === 'true-false'
}

/** Resolve the canonical correct answer string for display/comparison. */
function correctAnswerText(q: Question): string {
  if (isChoiceQuestion(q)) {
    const idx = Number(q.answer)
    return q.options[idx] ?? q.answer
  }
  return q.answer
}

/** Grade a single response against a question. */
function isResponseCorrect(q: Question, given: string): boolean {
  if (given === '' || given == null) return false
  if (isChoiceQuestion(q)) {
    // For choices `given` is the selected option index as a string.
    return String(given) === String(Number(q.answer))
  }
  return given.trim().toLowerCase() === q.answer.trim().toLowerCase()
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function scoreMessage(pct: number): { title: string; emoji: string; tone: string } {
  if (pct >= 90) return { title: 'Outstanding! You have mastered this.', emoji: '🏆', tone: 'text-success' }
  if (pct >= 75) return { title: 'Great work, you really know this.', emoji: '🎉', tone: 'text-success' }
  if (pct >= 50) return { title: 'Good effort! A little more practice and you will ace it.', emoji: '💪', tone: 'text-brand' }
  if (pct >= 30) return { title: 'Keep going, every attempt makes you stronger.', emoji: '🌱', tone: 'text-warning' }
  return { title: 'Don’t give up. Review the explanations and try again!', emoji: '📚', tone: 'text-warning' }
}

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

export interface QuizRunnerProps {
  questions: Question[]
  mode: QuizMode
  gradeLevel: GradeLevel
  subjectKey: SubjectKey
  chapterId?: number
  /** Return to the setup / category screen. */
  onExit: () => void
}

type Phase = 'running' | 'results'

/**
 * Self-contained quiz player reused by both the Quiz and Aptitude pages.
 * Presents one question at a time, tracks per-question answers and time,
 * persists the attempt on finish and renders a review screen.
 */
export function QuizRunner({
  questions,
  mode,
  gradeLevel,
  subjectKey,
  chapterId,
  onExit
}: QuizRunnerProps): JSX.Element {
  const total = questions.length
  const immediateFeedback = FEEDBACK_MODES.includes(mode)
  const timed = TIMED_MODES.includes(mode)

  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('running')
  const [answers, setAnswers] = useState<QuizAnswer[]>([])
  /** Current selection: option-index-as-string for choices, raw text otherwise. */
  const [selected, setSelected] = useState<string>('')
  /** Whether the current question has been checked (feedback modes only). */
  const [revealed, setRevealed] = useState(false)

  // Timers --------------------------------------------------------------
  const startedAtRef = useRef<number>(Date.now())
  const questionStartRef = useRef<number>(Date.now())
  const totalSeconds = timed ? total * SECONDS_PER_QUESTION : 0
  const [remaining, setRemaining] = useState<number>(totalSeconds)

  const current = questions[index]

  /* ---- finishing -------------------------------------------------- */
  const saveMutation = useMutation({
    mutationFn: (finalAnswers: QuizAnswer[]) => {
      const score = finalAnswers.filter((a) => a.correct).length
      const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
      return window.api.quiz.save({
        mode,
        gradeLevel,
        subjectKey,
        chapterId: chapterId ?? null,
        score,
        total,
        durationSec,
        answers: finalAnswers
      })
    },
    onError: () => toast.error('Could not save your attempt, but here are your results.')
  })

  const finish = useCallback(
    (finalAnswers: QuizAnswer[]) => {
      setPhase('results')
      saveMutation.mutate(finalAnswers)
    },
    [saveMutation]
  )

  /* ---- countdown for timed modes ---------------------------------- */
  useEffect(() => {
    if (!timed || phase !== 'running') return
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(id)
          // Auto-submit whatever has been answered so far.
          setAnswers((prev) => {
            finish(prev)
            return prev
          })
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [timed, phase, finish])

  /* ---- per-question setup ----------------------------------------- */
  useEffect(() => {
    questionStartRef.current = Date.now()
    setSelected('')
    setRevealed(false)
  }, [index])

  /* ---- record + advance ------------------------------------------- */
  const commitAnswer = useCallback((): QuizAnswer[] => {
    const q = questions[index]
    const timeSpentSec = Math.max(0, Math.round((Date.now() - questionStartRef.current) / 1000))
    const answer: QuizAnswer = {
      questionId: q.id,
      given: selected,
      correct: isResponseCorrect(q, selected),
      timeSpentSec
    }
    const next = [...answers, answer]
    setAnswers(next)
    return next
  }, [answers, index, questions, selected])

  const goNext = useCallback(() => {
    const next = commitAnswer()
    if (index + 1 >= total) {
      finish(next)
    } else {
      setIndex((i) => i + 1)
    }
  }, [commitAnswer, finish, index, total])

  /** Feedback modes: first click checks, then "Next" advances. */
  const handlePrimary = useCallback(() => {
    if (immediateFeedback && !revealed) {
      // Lock in & reveal but stay on the question.
      setRevealed(true)
      return
    }
    goNext()
  }, [goNext, immediateFeedback, revealed])

  /* ---- keyboard: number keys select options ----------------------- */
  useEffect(() => {
    if (phase !== 'running' || !current || !isChoiceQuestion(current)) return
    const onKey = (e: KeyboardEvent): void => {
      if (revealed) return
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1 && n <= current.options.length) {
        setSelected(String(n - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, current, revealed])

  if (total === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted">No questions to run.</p>
        <Button className="mt-4" variant="outline" onClick={onExit}>
          Back
        </Button>
      </Card>
    )
  }

  /* ================================================================ */
  /* Results screen                                                    */
  /* ================================================================ */
  if (phase === 'results') {
    return (
      <ResultsScreen
        questions={questions}
        answers={answers}
        durationSec={Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))}
        saving={saveMutation.isPending}
        onRetry={onExit}
        onBack={onExit}
      />
    )
  }

  /* ================================================================ */
  /* Running screen                                                    */
  /* ================================================================ */
  const choiceSelected = selected !== ''
  const canSubmit = choiceSelected
  const primaryLabel = immediateFeedback && !revealed ? 'Check answer' : index + 1 >= total ? 'Finish' : 'Next'

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {/* Header: progress + timer + exit */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
            <span className="font-medium">
              Question {index + 1} of {total}
            </span>
            <span className="capitalize">{mode.replace('-', ' ')}</span>
          </div>
          <ProgressBar value={index + (revealed ? 1 : 0)} max={total} />
        </div>
        {timed && (
          <Badge variant={remaining <= 15 ? 'danger' : 'info'} className="tabular-nums">
            <Icon name="Timer" size={12} /> {formatClock(remaining)}
          </Badge>
        )}
        <Button size="sm" variant="ghost" icon="X" onClick={onExit}>
          Exit
        </Button>
      </div>

      {/* Question card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
        >
          <Card className="p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="brand" className="capitalize">
                {current.difficulty}
              </Badge>
              {current.topic && <Badge variant="outline">{current.topic}</Badge>}
            </div>

            <div className="prose-suha mb-5 text-lg font-medium">
              <Markdown content={current.prompt} />
            </div>

            {/* Answer area */}
            {isChoiceQuestion(current) ? (
              <div className="grid gap-2.5">
                {current.options.map((opt, i) => {
                  const value = String(i)
                  const isPicked = selected === value
                  const isCorrect = String(i) === String(Number(current.answer))
                  const showState = immediateFeedback && revealed
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={revealed}
                      onClick={() => setSelected(value)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all focus-ring',
                        'disabled:cursor-default',
                        !showState && isPicked && 'border-brand bg-brand-soft text-brand',
                        !showState && !isPicked && 'border-border hover:border-brand/50 hover:bg-surface-2',
                        showState && isCorrect && 'border-success bg-success/10 text-success',
                        showState && isPicked && !isCorrect && 'border-danger bg-danger/10 text-danger',
                        showState && !isCorrect && !isPicked && 'border-border opacity-70'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
                          isPicked || (showState && isCorrect)
                            ? 'bg-current/15'
                            : 'bg-surface-2 text-muted'
                        )}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="flex-1">
                        <MathText text={opt} />
                      </span>
                      {showState && isCorrect && <Icon name="Check" size={16} />}
                      {showState && isPicked && !isCorrect && <Icon name="X" size={16} />}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div>
                <Input
                  autoFocus
                  value={selected}
                  disabled={revealed}
                  inputMode={current.type === 'numeric' ? 'decimal' : 'text'}
                  placeholder={current.type === 'numeric' ? 'Enter a number…' : 'Type your answer…'}
                  onChange={(e) => setSelected(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canSubmit) handlePrimary()
                  }}
                />
              </div>
            )}

            {/* Inline feedback (feedback modes) */}
            <AnimatePresence>
              {immediateFeedback && revealed && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-5 overflow-hidden"
                >
                  <FeedbackBlock question={current} given={selected} />
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {isChoiceQuestion(current)
            ? 'Tip: press 1-4 to choose'
            : current.type === 'numeric'
              ? 'Numeric answer'
              : 'Short answer'}
        </p>
        <Button
          size="lg"
          onClick={handlePrimary}
          disabled={!canSubmit}
          icon={primaryLabel === 'Finish' ? 'Flag' : primaryLabel === 'Next' ? 'ArrowRight' : 'Check'}
        >
          {primaryLabel}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Inline feedback block                                               */
/* ------------------------------------------------------------------ */

function FeedbackBlock({ question, given }: { question: Question; given: string }): JSX.Element {
  const correct = isResponseCorrect(question, given)
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        correct ? 'border-success/40 bg-success/5' : 'border-danger/40 bg-danger/5'
      )}
    >
      <div className={cn('flex items-center gap-2 font-semibold', correct ? 'text-success' : 'text-danger')}>
        <Icon name={correct ? 'CircleCheck' : 'CircleX'} size={18} />
        {correct ? 'Correct!' : 'Not quite'}
      </div>
      {!correct && (
        <p className="mt-2 text-sm">
          <span className="text-muted">Correct answer: </span>
          <span className="font-medium text-fg">{correctAnswerText(question)}</span>
        </p>
      )}
      {question.explanation && (
        <div className="mt-3 border-t border-border/60 pt-3 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Explanation</p>
          <Markdown content={question.explanation} />
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Results screen                                                      */
/* ------------------------------------------------------------------ */

function ResultsScreen({
  questions,
  answers,
  durationSec,
  saving,
  onRetry,
  onBack
}: {
  questions: Question[]
  answers: QuizAnswer[]
  durationSec: number
  saving: boolean
  onRetry: () => void
  onBack: () => void
}): JSX.Element {
  const total = questions.length
  const score = answers.filter((a) => a.correct).length
  const pct = total ? Math.round((score / total) * 100) : 0
  const msg = scoreMessage(pct)

  const answerByQ = useMemo(() => {
    const map = new Map<number, QuizAnswer>()
    for (const a of answers) map.set(a.questionId, a)
    return map
  }, [answers])

  const mins = Math.floor(durationSec / 60)
  const secs = durationSec % 60

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex max-w-2xl flex-col gap-5"
    >
      {/* Score hero */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col items-center gap-3 bg-gradient-to-br from-brand/15 to-brand-soft/40 p-8 text-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', delay: 0.1, bounce: 0.5 }}
            className="text-5xl"
          >
            {msg.emoji}
          </motion.div>
          <div className={cn('font-display text-5xl font-bold', msg.tone)}>{pct}%</div>
          <p className="font-medium">{msg.title}</p>
          <div className="mt-1 flex items-center gap-4 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              <Icon name="CircleCheck" size={15} className="text-success" /> {score}/{total} correct
            </span>
            <span className="inline-flex items-center gap-1">
              <Icon name="Clock" size={15} /> {mins > 0 ? `${mins}m ` : ''}
              {secs}s
            </span>
            {saving && (
              <span className="inline-flex items-center gap-1">
                <Icon name="Loader2" size={14} className="animate-spin" /> Saving…
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 p-5">
          <Button className="flex-1" icon="RotateCcw" onClick={onRetry}>
            Retry
          </Button>
          <Button className="flex-1" variant="outline" icon="ArrowLeft" onClick={onBack}>
            Back
          </Button>
        </div>
      </Card>

      {/* Per-question review */}
      <div>
        <h3 className="mb-3 font-display text-lg font-semibold">Review</h3>
        <div className="flex flex-col gap-3">
          {questions.map((q, i) => {
            const a = answerByQ.get(q.id)
            const correct = a?.correct ?? false
            const given = a?.given ?? ''
            const givenText = isChoiceQuestion(q)
              ? given !== ''
                ? (q.options[Number(given)] ?? given)
                : '-'
              : given || '-'
            return (
              <Card key={q.id} className="p-5">
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      correct ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="prose-suha font-medium">
                      <Markdown content={q.prompt} />
                    </div>

                    <div className="mt-3 grid gap-1.5 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="w-28 shrink-0 text-muted">Your answer</span>
                        <span className={cn('font-medium', correct ? 'text-success' : 'text-danger')}>
                          <MathText text={givenText} /> {correct ? '✓' : '✗'}
                        </span>
                      </div>
                      {!correct && (
                        <div className="flex items-start gap-2">
                          <span className="w-28 shrink-0 text-muted">Correct answer</span>
                          <span className="font-medium text-success">
                            <MathText text={correctAnswerText(q)} />
                          </span>
                        </div>
                      )}
                    </div>

                    {q.explanation && (
                      <details className="mt-3 rounded-lg bg-surface-2/60 p-3 text-sm">
                        <summary className="cursor-pointer select-none font-medium text-brand">
                          Explanation
                        </summary>
                        <div className="mt-2">
                          <Markdown content={q.explanation} />
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

export default QuizRunner
