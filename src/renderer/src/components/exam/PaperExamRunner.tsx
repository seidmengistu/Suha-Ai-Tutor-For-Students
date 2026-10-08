import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Badge, Button, Icon, Modal, Spinner } from '@/components/ui'
import { toast } from '@/store/useUiStore'
import { cn } from '@/lib/utils'
import type { PaperExam } from '@shared/types'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

const LETTERS = ['A', 'B', 'C', 'D']
const PASS_MARK = 50
const SECONDS_PER_Q = 75

function clock(total: number): string {
  const s = Math.max(0, Math.floor(total))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return (h ? `${h}:${m.toString().padStart(2, '0')}` : `${m}`) + `:${r.toString().padStart(2, '0')}`
}

/**
 * Take a scanned/PDF exam in "paper mode": read the original PDF and answer A-D.
 * Only the chosen letters are compared with the stored answer key, the question
 * text is never extracted.
 */
export function PaperExamRunner({ exam, onExit }: { exam: PaperExam; onExit: () => void }): JSX.Element {
  const total = exam.numQuestions || exam.answerKey.length
  const [phase, setPhase] = useState<'taking' | 'results'>('taking')
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [page, setPage] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.3)
  const [ready, setReady] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [remaining, setRemaining] = useState(total * SECONDS_PER_Q)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const taskRef = useRef<RenderTask | null>(null)
  const startedRef = useRef(Date.now())
  const finishedRef = useRef(false)

  // Load the PDF.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const bytes = await window.api.paper.data(exam.id)
        if (!bytes || cancelled) {
          if (!cancelled) toast.error('The exam PDF is missing.')
          return
        }
        const doc = await pdfjsLib.getDocument({ data: bytes.slice(0), isEvalSupported: false }).promise
        if (cancelled) {
          void doc.destroy()
          return
        }
        docRef.current = doc
        setNumPages(doc.numPages)
        setReady(true)
      } catch {
        if (!cancelled) toast.error('Could not open the exam PDF.')
      }
    })()
    return () => {
      cancelled = true
      void docRef.current?.destroy()
      docRef.current = null
    }
  }, [exam.id])

  // Render the current page.
  useEffect(() => {
    if (!ready || !docRef.current || !canvasRef.current) return
    let cancelled = false
    ;(async () => {
      try {
        const pg = await docRef.current!.getPage(page)
        if (cancelled) return
        const viewport = pg.getViewport({ scale })
        const canvas = canvasRef.current!
        const ctx = canvas.getContext('2d')!
        canvas.width = viewport.width
        canvas.height = viewport.height
        taskRef.current?.cancel()
        taskRef.current = pg.render({ canvasContext: ctx, viewport })
        await taskRef.current.promise
      } catch {
        /* render cancelled */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready, page, scale])

  const score = exam.answerKey.reduce((acc, k) => acc + (answers[k.n] === k.answer ? 1 : 0), 0)
  const answeredCount = Object.values(answers).filter(Boolean).length

  const submit = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    const durationSec = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000))
    const finalScore = exam.answerKey.reduce((acc, k) => acc + (answers[k.n] === k.answer ? 1 : 0), 0)
    void window.api.quiz
      .save({
        mode: 'mock-exam',
        gradeLevel: exam.gradeLevel,
        subjectKey: exam.subjectKey,
        chapterId: null,
        score: finalScore,
        total,
        durationSec,
        answers: []
      })
      .catch(() => undefined)
    setPhase('results')
  }, [answers, exam, total])

  // Countdown.
  useEffect(() => {
    if (phase !== 'taking') return
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
  }, [phase, submit])

  if (phase === 'results') {
    const pct = total ? Math.round((score / total) * 100) : 0
    const passed = pct >= PASS_MARK
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className={cn('rounded-2xl border border-border p-7 text-center', passed ? 'bg-success/10' : 'bg-warning/10')}>
          <div className={cn('font-display text-5xl font-bold', passed ? 'text-success' : 'text-warning')}>{pct}%</div>
          <Badge variant={passed ? 'success' : 'warning'} className="mt-2">
            <Icon name={passed ? 'CircleCheck' : 'TriangleAlert'} size={12} /> {passed ? 'Passed' : 'Below pass mark'}
          </Badge>
          <p className="mt-2 text-sm text-muted">
            {score}/{total} correct · {exam.title}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" icon="ArrowLeft" onClick={onExit}>
              Back to exams
            </Button>
          </div>
        </div>

        <h3 className="mb-2 mt-6 font-display text-lg font-semibold">Answer review</h3>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Your answer</th>
                <th className="px-3 py-2">Correct</th>
                <th className="px-3 py-2">Result</th>
              </tr>
            </thead>
            <tbody>
              {exam.answerKey.map((k) => {
                const mine = answers[k.n] || '-'
                const ok = answers[k.n] === k.answer
                return (
                  <tr key={k.n} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{k.n}</td>
                    <td className={cn('px-3 py-2', ok ? 'text-success' : 'text-danger')}>{mine}</td>
                    <td className="px-3 py-2 text-success">{k.answer}</td>
                    <td className="px-3 py-2">
                      <Icon name={ok ? 'Check' : 'X'} size={15} className={ok ? 'text-success' : 'text-danger'} />
                      {k.explanation && <span className="ml-2 text-xs text-muted">{k.explanation}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const lowTime = remaining <= 60
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-5 py-3">
        <button onClick={onExit} title="Exit" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg focus-ring">
          <Icon name="ArrowLeft" size={18} />
        </button>
        <span className="truncate font-display font-semibold">{exam.title}</span>
        <div className="flex-1" />
        <Badge variant="outline">{answeredCount}/{total} answered</Badge>
        <div className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold tabular-nums', lowTime ? 'animate-pulse bg-danger/15 text-danger' : 'bg-surface-2')}>
          <Icon name="Timer" size={16} /> {clock(remaining)}
        </div>
        <Button size="sm" icon="Flag" onClick={() => setConfirmOpen(true)}>
          Submit
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_300px]">
        {/* PDF page */}
        <div className="relative min-h-0 overflow-auto bg-surface-2/40 p-4">
          <div className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-lg border border-border bg-surface/90 p-1 backdrop-blur">
            <Button variant="ghost" size="icon" onClick={() => setScale((s) => Math.max(0.6, s - 0.15))} title="Zoom out">
              <Icon name="ZoomOut" size={16} />
            </Button>
            <span className="w-12 text-center text-xs tabular-nums text-muted">{Math.round(scale * 100)}%</span>
            <Button variant="ghost" size="icon" onClick={() => setScale((s) => Math.min(3, s + 0.15))} title="Zoom in">
              <Icon name="ZoomIn" size={16} />
            </Button>
          </div>
          {!ready ? (
            <div className="flex h-full items-center justify-center gap-2 text-muted">
              <Spinner size={22} /> Opening exam…
            </div>
          ) : (
            <div className="mx-auto w-fit">
              <canvas ref={canvasRef} className="block rounded-sm bg-white shadow-glass" />
              <div className="mt-3 flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" icon="ChevronLeft" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </Button>
                <span className="text-sm text-muted">
                  Page {page} / {numPages || '-'}
                </span>
                <Button variant="outline" size="sm" disabled={page >= numPages} onClick={() => setPage((p) => p + 1)}>
                  Next <Icon name="ChevronRight" size={15} />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Answer sheet */}
        <aside className="min-h-0 overflow-y-auto border-l border-border bg-surface p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Answer sheet</p>
          <div className="space-y-1.5">
            {exam.answerKey.map((k) => (
              <div key={k.n} className="flex items-center gap-2">
                <span className="w-7 shrink-0 text-right text-xs font-medium tabular-nums text-muted">{k.n}.</span>
                <div className="flex gap-1">
                  {LETTERS.map((L) => {
                    const picked = answers[k.n] === L
                    return (
                      <button
                        key={L}
                        onClick={() => setAnswers((a) => ({ ...a, [k.n]: picked ? '' : L }))}
                        className={cn(
                          'h-7 w-7 rounded-md border text-xs font-semibold focus-ring',
                          picked ? 'border-brand bg-brand text-brand-fg' : 'border-border text-muted hover:bg-surface-2'
                        )}
                      >
                        {L}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Submit exam?" size="sm">
        <div className="p-5">
          <p className="text-sm text-muted">
            You answered <strong className="text-fg">{answeredCount}</strong> of {total}. Submit to see your score?
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep working
            </Button>
            <Button icon="Check" onClick={submit}>
              Submit
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
