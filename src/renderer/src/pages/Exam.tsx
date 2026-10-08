import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { GRADE_LEVELS, getSubject, subjectsForGrade } from '@shared/constants'
import { useSettingsStore } from '@/store/useSettingsStore'
import { Page, PageHeader } from '@/components/layout/Page'
import { Badge, Button, Card, EmptyState, Icon, Label, Modal, Segmented, Select } from '@/components/ui'
import { Markdown } from '@/components/ai/Markdown'
import { MathText } from '@/components/ai/MathText'
import { PaperExamRunner } from '@/components/exam/PaperExamRunner'
import { PaperExamPicker } from '@/components/exam/PaperExamPicker'
import { shuffleQuestionOptions } from '@/lib/quiz'
import { toast } from '@/store/useUiStore'
import { cn } from '@/lib/utils'
import type {
  GradeLevel,
  PaperExam,
  Question,
  QuizAnswer,
  QuizFilter,
  SubjectKey
} from '@shared/types'

/* ------------------------------------------------------------------ */
/* Config + helpers                                                    */
/* ------------------------------------------------------------------ */

const PASS_MARK = 50
const SECONDS_PER_Q = 72 // ~1.2 min/question, like a real paper
const LENGTHS = [
  { label: 'Quick', n: 20 },
  { label: 'Standard', n: 40 },
  { label: 'Full', n: 60 }
]
const DIFF_ORDER = ['exam', 'difficult', 'medium', 'beginner']

const isChoice = (q: Question): boolean => q.type === 'mcq' || q.type === 'true-false'

function isCorrect(q: Question, given: string): boolean {
  if (given === '' || given == null) return false
  if (isChoice(q)) return String(given) === String(Number(q.answer))
  return given.trim().toLowerCase() === q.answer.trim().toLowerCase()
}
function correctText(q: Question): string {
  if (isChoice(q)) return q.options[Number(q.answer)] ?? q.answer
  return q.answer
}
function clock(total: number): string {
  const s = Math.max(0, Math.floor(total))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return (h ? `${h}:${m.toString().padStart(2, '0')}` : `${m}`) + `:${r.toString().padStart(2, '0')}`
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
/** Build an exam paper: prefer exam/difficult questions, then fill, then shuffle. */
function composePaper(pool: Question[], n: number): Question[] {
  const byDiff = DIFF_ORDER.flatMap((d) => shuffle(pool.filter((q) => q.difficulty === d)))
  const rest = shuffle(pool.filter((q) => !DIFF_ORDER.includes(q.difficulty)))
  return shuffle([...byDiff, ...rest].slice(0, n))
}

/* ================================================================== */
/* Page                                                                */
/* ================================================================== */

type Phase = 'setup' | 'running' | 'results' | 'paper'

export default function Exam(): JSX.Element {
  const currentGrade = useSettingsStore((s) => s.settings.currentGrade)
  const [grade, setGrade] = useState<GradeLevel>(currentGrade)
  const subjects = subjectsForGrade(grade).filter((s) => s.key !== 'aptitude')
  const [subjectKey, setSubjectKey] = useState<SubjectKey>(subjects[0]?.key ?? 'mathematics')
  const [lengthN, setLengthN] = useState(40)
  const [source, setSource] = useState<'seeded' | 'ai' | 'paper'>('seeded')
  const [examYear, setExamYear] = useState<number | 'all'>('all')
  const [genMsg, setGenMsg] = useState('')

  const [phase, setPhase] = useState<Phase>('setup')
  const [selectedPaper, setSelectedPaper] = useState<PaperExam | null>(null)
  const [paper, setPaper] = useState<Question[]>([])
  const [result, setResult] = useState<{ answers: QuizAnswer[]; durationSec: number } | null>(null)

  // Keep subject valid when grade changes.
  useEffect(() => {
    if (!subjects.some((s) => s.key === subjectKey)) setSubjectKey(subjects[0]?.key ?? 'mathematics')
  }, [grade]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = useMutation({
    mutationFn: async (): Promise<Question[]> => {
      if (source === 'seeded') {
        const base: QuizFilter = { gradeLevel: grade, subjectKey, limit: 250 }
        if (examYear !== 'all') base.examYear = examYear
        // Avoid repeating questions seen in the last few attempts (when the pool allows).
        const history = await window.api.quiz.history(grade).catch(() => [])
        const recent = new Set<number>()
        for (const a of history.slice(0, 3)) for (const ans of a.answers) recent.add(ans.questionId)
        let pool = await window.api.quiz.questions({ ...base, excludeIds: [...recent] })
        if (pool.length < lengthN) pool = await window.api.quiz.questions(base)
        return composePaper(pool, lengthN)
      }
      // AI-generated: a fresh paper each sitting (questions are also saved to the
      // bank, so the offline pool grows over time). Generated in batches.
      const health = await window.api.ai.health()
      if (!health.ok) throw new Error('AI_OFFLINE')
      const chapters = await window.api.curriculum.chapters(grade, subjectKey).catch(() => [])
      const topics = chapters
        .map((c) => c.title.replace(/^\s*(unit|chapter)\s*\d+\s*[:.\-]?\s*/i, '').trim())
        .filter(Boolean)
      const collected: Question[] = []
      const batch = 12
      const maxCalls = Math.ceil(lengthN / batch) + 2
      for (let i = 0; i < maxCalls && collected.length < lengthN; i++) {
        const topic = topics.length ? topics[i % topics.length] : getSubject(subjectKey).name
        setGenMsg(`Writing exam questions… ${Math.min(collected.length, lengthN)}/${lengthN}`)
        const qs = await window.api.quiz.generate({
          gradeLevel: grade,
          subjectKey,
          topic,
          difficulty: 'exam',
          count: batch
        })
        if (qs.length === 0 && i > 0) break
        collected.push(...qs)
      }
      if (collected.length < 4) throw new Error('AI_EMPTY')
      // Re-id so keys are unique across batches.
      return shuffle(collected).slice(0, lengthN).map((q, i) => ({ ...q, id: -(i + 1) }))
    },
    onSuccess: (p) => {
      setGenMsg('')
      if (p.length === 0) {
        toast.error('No questions available for this subject yet.')
        return
      }
      setPaper(p.map(shuffleQuestionOptions))
      setResult(null)
      setPhase('running')
    },
    onError: (e) => {
      setGenMsg('')
      const m = (e as Error).message
      if (m === 'AI_OFFLINE') toast.error('AI server is offline, start it in Settings, or use the Seeded bank.')
      else if (m === 'AI_EMPTY') toast.error('The AI returned no usable questions. Try again or use the Seeded bank.')
      else toast.error('Could not start the exam. Please try again.')
    }
  })

  if (phase === 'paper' && selectedPaper) {
    return (
      <PaperExamRunner
        exam={selectedPaper}
        onExit={() => {
          setSelectedPaper(null)
          setPhase('setup')
        }}
      />
    )
  }

  if (phase === 'running') {
    return (
      <ExamRunner
        paper={paper}
        gradeLevel={grade}
        subjectKey={subjectKey}
        durationSec={paper.length * SECONDS_PER_Q}
        onFinish={(answers, durationSec) => {
          setResult({ answers, durationSec })
          setPhase('results')
        }}
        onExit={() => setPhase('setup')}
      />
    )
  }

  if (phase === 'results' && result) {
    return (
      <ExamResults
        paper={paper}
        answers={result.answers}
        durationSec={result.durationSec}
        gradeLevel={grade}
        subjectKey={subjectKey}
        onRetake={() => start.mutate()}
        onBack={() => setPhase('setup')}
      />
    )
  }

  return (
    <ExamSetup
      grade={grade}
      setGrade={setGrade}
      subjects={subjects}
      subjectKey={subjectKey}
      setSubjectKey={setSubjectKey}
      lengthN={lengthN}
      setLengthN={setLengthN}
      source={source}
      setSource={setSource}
      examYear={examYear}
      setExamYear={setExamYear}
      genMsg={genMsg}
      starting={start.isPending}
      onStart={() => start.mutate()}
      onPickPaper={(p) => {
        setSelectedPaper(p)
        setPhase('paper')
      }}
    />
  )
}

/* ================================================================== */
/* Setup                                                               */
/* ================================================================== */

function ExamSetup({
  grade,
  setGrade,
  subjects,
  subjectKey,
  setSubjectKey,
  lengthN,
  setLengthN,
  source,
  setSource,
  examYear,
  setExamYear,
  genMsg,
  starting,
  onStart,
  onPickPaper
}: {
  grade: GradeLevel
  setGrade: (g: GradeLevel) => void
  subjects: { key: SubjectKey; name: string }[]
  subjectKey: SubjectKey
  setSubjectKey: (s: SubjectKey) => void
  lengthN: number
  setLengthN: (n: number) => void
  source: 'seeded' | 'ai' | 'paper'
  setSource: (s: 'seeded' | 'ai' | 'paper') => void
  examYear: number | 'all'
  setExamYear: (y: number | 'all') => void
  genMsg: string
  starting: boolean
  onStart: () => void
  onPickPaper: (exam: PaperExam) => void
}): JSX.Element {
  const { data: history } = useQuery({
    queryKey: ['quiz-history', grade],
    queryFn: () => window.api.quiz.history(grade)
  })
  const { data: aiHealth } = useQuery({
    queryKey: ['ai-health'],
    queryFn: () => window.api.ai.health(),
    refetchInterval: 20000
  })
  const aiOnline = aiHealth?.ok ?? false
  const { data: years } = useQuery({
    queryKey: ['exam-years', grade, subjectKey],
    queryFn: () => window.api.quiz.examYears(grade, subjectKey)
  })
  const { data: bankCount } = useQuery({
    queryKey: ['quiz-count', grade, subjectKey],
    queryFn: () => window.api.quiz.count(grade, subjectKey)
  })

  const trend = useMemo(() => {
    const mocks = (history ?? [])
      .filter((a) => a.mode === 'mock-exam' && a.subjectKey === subjectKey && a.total > 0)
      .slice(0, 8)
      .reverse()
    return mocks.map((a, i) => ({
      name: `#${i + 1}`,
      score: Math.round((a.score / a.total) * 100)
    }))
  }, [history, subjectKey])

  const best = trend.length ? Math.max(...trend.map((t) => t.score)) : null
  const minutes = Math.round((lengthN * SECONDS_PER_Q) / 60)

  return (
    <Page>
      <PageHeader
        title="National Exam"
        subtitle="Timed, exam-style practice for the Ethiopian national exams"
        icon="ClipboardCheck"
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label>Grade</Label>
              <Select value={grade} onChange={(e) => setGrade(Number(e.target.value) as GradeLevel)}>
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
          </div>

          {source !== 'paper' && (
          <div className="mt-6">
            <Label>Paper length</Label>
            <div className="grid grid-cols-3 gap-2.5">
              {LENGTHS.map((l) => {
                const active = lengthN === l.n
                return (
                  <button
                    key={l.n}
                    type="button"
                    onClick={() => setLengthN(l.n)}
                    className={cn(
                      'rounded-xl border p-3.5 text-center transition-all focus-ring',
                      active ? 'border-brand bg-brand-soft/60' : 'border-border hover:border-brand/50 hover:bg-surface-2'
                    )}
                  >
                    <p className={cn('font-display font-semibold', active && 'text-brand')}>{l.label}</p>
                    <p className="text-xs text-muted">{l.n} questions</p>
                  </button>
                )
              })}
            </div>
          </div>
          )}

          <div className="mt-6">
            <Label>Question source</Label>
            <Segmented<'seeded' | 'ai' | 'paper'>
              value={source}
              onChange={setSource}
              options={[
                { value: 'seeded', label: 'Seeded', icon: 'Database' },
                { value: 'ai', label: 'AI', icon: 'Sparkles' },
                { value: 'paper', label: 'Paper (PDF)', icon: 'FileText' }
              ]}
            />
            <p className="mt-1.5 text-xs text-muted">
              {source === 'paper'
                ? 'Take a scanned exam PDF as-is, read the page and tap A-D. Best when OCR cannot read the paper.'
                : source === 'ai'
                  ? aiOnline
                    ? 'Fresh questions written by your AI each time, and saved to your bank for offline use later.'
                    : 'AI is offline, start it in Settings, or switch to the Seeded bank.'
                  : 'Instant and fully offline, a randomised paper from the question bank.'}
            </p>
          </div>

          {source === 'seeded' && (years?.length ?? 0) > 0 && (
            <div className="mt-6">
              <Label>Exam year</Label>
              <Select
                value={examYear}
                onChange={(e) => setExamYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              >
                <option value="all">All years</option>
                {years!.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-xs text-muted">Imported past-paper questions are tagged by year.</p>
            </div>
          )}

          {source !== 'paper' && (
            <div className="mt-6 rounded-xl border border-border bg-surface-2/40 p-4 text-sm text-muted">
              <p className="flex items-center gap-2">
                <Icon name="Info" size={15} className="text-brand" />
                Real exam rules: a <strong className="text-fg">{clock(lengthN * SECONDS_PER_Q)}</strong> countdown,
                one attempt, no AI help. You can flag questions and revisit them before submitting.
              </p>
            </div>
          )}

          {source === 'paper' && (
            <div className="mt-6">
              <PaperExamPicker grade={grade} subjectKey={subjectKey} onPick={onPickPaper} />
            </div>
          )}
        </Card>

        {source !== 'paper' && (
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <h3 className="font-display font-semibold">Exam summary</h3>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Row icon="GraduationCap" label="Grade" value={`Grade ${grade}`} />
              <Row icon="LibraryBig" label="Subject" value={getSubject(subjectKey).name} />
              <Row icon="ListChecks" label="Questions" value={String(lengthN)} />
              <Row icon="Timer" label="Time limit" value={`${minutes} min`} />
              <Row icon="Flag" label="Pass mark" value={`${PASS_MARK}%`} />
              <Row
                icon={source === 'ai' ? 'Sparkles' : 'Database'}
                label="Source"
                value={source === 'ai' ? 'AI generated' : 'Seeded bank'}
              />
              {source === 'seeded' && bankCount != null && (
                <Row icon="Database" label="In your bank" value={`${bankCount.toLocaleString()} questions`} />
              )}
            </div>
            <Button className="mt-5 w-full" size="lg" icon="Play" loading={starting} onClick={onStart}>
              {starting ? (source === 'ai' ? 'Generating…' : 'Preparing paper…') : 'Start exam'}
            </Button>
            {starting && source === 'ai' && genMsg && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <Icon name="Sparkles" size={12} /> {genMsg}
              </p>
            )}
            {!starting && source === 'ai' && (
              <p className="mt-2 text-xs text-muted">
                AI papers take a little longer to write, especially Full length.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold">Readiness</h3>
              {best != null && (
                <Badge variant={best >= PASS_MARK ? 'success' : 'warning'}>Best {best}%</Badge>
              )}
            </div>
            {trend.length >= 2 ? (
              <div className="mt-3 h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 5, right: 6, bottom: 0, left: -18 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted" />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(v: number) => [`${v}%`, 'Score']}
                    />
                    <Line type="monotone" dataKey="score" strokeWidth={2.5} className="stroke-brand" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted">
                Take a few mock exams in {getSubject(subjectKey).name} and your score trend will appear here.
              </p>
            )}
          </Card>
        </div>
        )}
      </div>
    </Page>
  )
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2 text-muted">
        <Icon name={icon} size={14} /> {label}
      </span>
      <Badge variant="outline">{value}</Badge>
    </div>
  )
}

/* ================================================================== */
/* Runner                                                              */
/* ================================================================== */

function ExamRunner({
  paper,
  gradeLevel,
  subjectKey,
  durationSec,
  onFinish,
  onExit
}: {
  paper: Question[]
  gradeLevel: GradeLevel
  subjectKey: SubjectKey
  durationSec: number
  onFinish: (answers: QuizAnswer[], durationSec: number) => void
  onExit: () => void
}): JSX.Element {
  const qc = useQueryClient()
  const total = paper.length
  const [index, setIndex] = useState(0)
  const [selections, setSelections] = useState<Record<number, string>>({})
  const selectionsRef = useRef(selections)
  useEffect(() => {
    selectionsRef.current = selections
  }, [selections])
  const [flags, setFlags] = useState<Set<number>>(new Set())
  const [remaining, setRemaining] = useState(durationSec)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const startedRef = useRef(Date.now())
  const finishedRef = useRef(false)

  const current = paper[index]
  const answeredCount = Object.values(selections).filter((v) => v !== '').length

  const submit = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    const durationUsed = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000))
    const picks = selectionsRef.current
    const answers: QuizAnswer[] = paper.map((q) => {
      const given = picks[q.id] ?? ''
      return { questionId: q.id, given, correct: isCorrect(q, given), timeSpentSec: 0 }
    })
    const score = answers.filter((a) => a.correct).length
    window.api.quiz
      .save({ mode: 'mock-exam', gradeLevel, subjectKey, chapterId: null, score, total, durationSec: durationUsed, answers })
      .then(() => qc.invalidateQueries({ queryKey: ['quiz-history'] }))
      .catch(() => toast.error('Could not save your attempt, but your results are ready.'))
    onFinish(answers, durationUsed)
  }, [paper, gradeLevel, subjectKey, total, onFinish, qc])

  // Countdown → auto-submit at 0.
  useEffect(() => {
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(id)
          submit()
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [submit])

  // Keyboard: 1-9 select, arrows navigate, F flag.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!current) return
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(total - 1, i + 1))
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      else if (e.key.toLowerCase() === 'f') toggleFlag(current.id)
      else if (isChoice(current)) {
        const n = Number(e.key)
        if (Number.isInteger(n) && n >= 1 && n <= current.options.length) {
          setSelections((s) => ({ ...s, [current.id]: String(n - 1) }))
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, total])

  function toggleFlag(id: number): void {
    setFlags((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!current) return <Page><EmptyState icon="FileX" title="Empty paper" description="No questions to show." /></Page>

  const lowTime = remaining <= 60
  const midTime = remaining <= 300

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Exam top bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-surface px-5 py-3">
        <button
          onClick={onExit}
          title="Exit exam"
          className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg focus-ring"
        >
          <Icon name="ArrowLeft" size={18} />
        </button>
        <div className="flex items-center gap-2 font-display font-semibold">
          <Icon name="ClipboardCheck" size={18} className="text-brand" />
          {getSubject(subjectKey).name} · Grade {gradeLevel}
        </div>
        <div className="flex-1" />
        <Badge variant="outline">
          {answeredCount}/{total} answered
        </Badge>
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold tabular-nums',
            lowTime ? 'animate-pulse bg-danger/15 text-danger' : midTime ? 'bg-warning/15 text-warning' : 'bg-surface-2 text-fg'
          )}
        >
          <Icon name="Timer" size={16} /> {clock(remaining)}
        </div>
        <Button size="sm" icon="Flag" onClick={() => setConfirmOpen(true)}>
          Submit
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[1fr_220px]">
        {/* Question */}
        <div className="min-h-0 overflow-y-auto p-6">
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-muted">
                Question {index + 1} of {total}
              </span>
              <button
                onClick={() => toggleFlag(current.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium focus-ring',
                  flags.has(current.id)
                    ? 'border-warning bg-warning/10 text-warning'
                    : 'border-border text-muted hover:bg-surface-2'
                )}
              >
                <Icon name="Flag" size={12} /> {flags.has(current.id) ? 'Flagged' : 'Flag for review'}
              </button>
            </div>

            <Card className="p-6">
              {current.topic && <Badge variant="outline" className="mb-3">{current.topic}</Badge>}
              <div className="prose-suha mb-5 text-lg font-medium">
                <Markdown content={current.prompt} />
              </div>

              {isChoice(current) ? (
                <div className="grid gap-2.5">
                  {current.options.map((opt, i) => {
                    const picked = selections[current.id] === String(i)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelections((s) => ({ ...s, [current.id]: String(i) }))}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all focus-ring',
                          picked ? 'border-brand bg-brand-soft text-brand' : 'border-border hover:border-brand/50 hover:bg-surface-2'
                        )}
                      >
                        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold', picked ? 'bg-current/15' : 'bg-surface-2 text-muted')}>
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span className="flex-1">
                          <MathText text={opt} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <input
                  value={selections[current.id] ?? ''}
                  inputMode={current.type === 'numeric' ? 'decimal' : 'text'}
                  placeholder={current.type === 'numeric' ? 'Enter a number…' : 'Type your answer…'}
                  onChange={(e) => setSelections((s) => ({ ...s, [current.id]: e.target.value }))}
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm focus-ring"
                />
              )}
            </Card>

            <div className="mt-4 flex items-center justify-between">
              <Button variant="outline" icon="ArrowLeft" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
                Previous
              </Button>
              {index + 1 < total ? (
                <Button icon="ArrowRight" onClick={() => setIndex((i) => i + 1)}>
                  Next
                </Button>
              ) : (
                <Button icon="Flag" onClick={() => setConfirmOpen(true)}>
                  Review &amp; submit
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Question palette */}
        <aside className="hidden border-l border-border bg-surface p-4 lg:block">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Questions</p>
          <div className="grid grid-cols-5 gap-1.5">
            {paper.map((q, i) => {
              const answered = (selections[q.id] ?? '') !== ''
              const flagged = flags.has(q.id)
              return (
                <button
                  key={q.id}
                  onClick={() => setIndex(i)}
                  className={cn(
                    'relative h-9 rounded-lg border text-xs font-semibold focus-ring',
                    i === index
                      ? 'border-brand ring-2 ring-brand'
                      : answered
                        ? 'border-transparent bg-brand text-brand-fg'
                        : 'border-border text-muted hover:bg-surface-2'
                  )}
                >
                  {i + 1}
                  {flagged && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-warning" />}
                </button>
              )
            })}
          </div>
          <div className="mt-4 space-y-1.5 text-xs text-muted">
            <Legend className="bg-brand" label="Answered" />
            <Legend className="border border-border bg-transparent" label="Not answered" />
            <Legend className="bg-warning" label="Flagged" />
          </div>
        </aside>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Submit exam?" size="sm">
        <div className="p-5">
          <p className="text-sm text-muted">
            You answered <strong className="text-fg">{answeredCount}</strong> of {total} questions
            {flags.size > 0 && <> · {flags.size} flagged</>}. You can't change answers after submitting.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep working
            </Button>
            <Button icon="Check" onClick={submit}>
              Submit now
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Legend({ className, label }: { className: string; label: string }): JSX.Element {
  return (
    <p className="flex items-center gap-2">
      <span className={cn('inline-block h-3 w-3 rounded', className)} /> {label}
    </p>
  )
}

/* ================================================================== */
/* Results                                                             */
/* ================================================================== */

function ExamResults({
  paper,
  answers,
  durationSec,
  subjectKey,
  gradeLevel,
  onRetake,
  onBack
}: {
  paper: Question[]
  answers: QuizAnswer[]
  durationSec: number
  subjectKey: SubjectKey
  gradeLevel: GradeLevel
  onRetake: () => void
  onBack: () => void
}): JSX.Element {
  const total = paper.length
  const score = answers.filter((a) => a.correct).length
  const pct = total ? Math.round((score / total) * 100) : 0
  const passed = pct >= PASS_MARK
  const byQ = useMemo(() => new Map(answers.map((a) => [a.questionId, a])), [answers])

  // Per-topic diagnostic.
  const topics = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>()
    for (const q of paper) {
      const t = q.topic || getSubject(subjectKey).name
      const e = map.get(t) ?? { correct: 0, total: 0 }
      e.total++
      if (byQ.get(q.id)?.correct) e.correct++
      map.set(t, e)
    }
    return [...map.entries()]
      .map(([topic, v]) => ({ topic, ...v, pct: Math.round((v.correct / v.total) * 100) }))
      .sort((a, b) => a.pct - b.pct)
  }, [paper, byQ, subjectKey])

  const mins = Math.floor(durationSec / 60)

  return (
    <Page>
      <PageHeader title="Exam results" subtitle={`${getSubject(subjectKey).name} · Grade ${gradeLevel}`} icon="ClipboardCheck" />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <Card className="overflow-hidden p-0">
            <div className={cn('flex flex-col items-center gap-2 p-7 text-center', passed ? 'bg-success/10' : 'bg-warning/10')}>
              <div className={cn('font-display text-5xl font-bold', passed ? 'text-success' : 'text-warning')}>{pct}%</div>
              <Badge variant={passed ? 'success' : 'warning'}>
                <Icon name={passed ? 'CircleCheck' : 'TriangleAlert'} size={12} /> {passed ? 'Passed' : 'Below pass mark'}
              </Badge>
              <div className="mt-1 flex items-center gap-4 text-sm text-muted">
                <span className="inline-flex items-center gap-1">
                  <Icon name="CircleCheck" size={14} className="text-success" /> {score}/{total}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Icon name="Clock" size={14} /> {mins} min
                </span>
              </div>
            </div>
            <div className="flex gap-2 p-4">
              <Button className="flex-1" icon="RotateCcw" onClick={onRetake}>
                Retake
              </Button>
              <Button className="flex-1" variant="outline" icon="ArrowLeft" onClick={onBack}>
                Exams
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-display font-semibold">By topic</h3>
            <div className="space-y-3">
              {topics.map((t) => (
                <div key={t.topic}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="truncate pr-2">{t.topic}</span>
                    <span className={cn('shrink-0 font-semibold', t.pct >= PASS_MARK ? 'text-success' : 'text-danger')}>
                      {t.correct}/{t.total}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={cn('h-full rounded-full', t.pct >= PASS_MARK ? 'bg-success' : 'bg-danger')}
                      style={{ width: `${t.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {topics.some((t) => t.pct < PASS_MARK) && (
              <p className="mt-3 text-xs text-muted">
                Focus your revision on the red topics, they're your biggest score opportunity.
              </p>
            )}
          </Card>
        </div>

        {/* Review */}
        <div>
          <h3 className="mb-3 font-display text-lg font-semibold">Review &amp; solutions</h3>
          <div className="flex flex-col gap-3">
            {paper.map((q, i) => {
              const a = byQ.get(q.id)
              const correct = a?.correct ?? false
              const given = a?.given ?? ''
              const givenText = isChoice(q) ? (given !== '' ? (q.options[Number(given)] ?? given) : '-') : given || '-'
              return (
                <Card key={q.id} className="p-5">
                  <div className="flex items-start gap-3">
                    <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold', correct ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>
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
                              <MathText text={correctText(q)} />
                            </span>
                          </div>
                        )}
                      </div>
                      {q.explanation && (
                        <details className="mt-3 rounded-lg bg-surface-2/60 p-3 text-sm">
                          <summary className="cursor-pointer select-none font-medium text-brand">Explanation</summary>
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
      </div>
    </Page>
  )
}
