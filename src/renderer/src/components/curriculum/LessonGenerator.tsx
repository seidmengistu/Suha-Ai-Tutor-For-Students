import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Modal, Button, Icon, Spinner, ProgressBar, Badge } from '@/components/ui'
import { toast } from '@/store/useUiStore'
import type { Book } from '@shared/types'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

type Status = 'pending' | 'running' | 'done' | 'error'
interface ChapterPlan {
  title: string
  startPage: number
  endPage: number
  status: Status
}

const MAX_CHAPTERS = 20
const MAX_PAGES_PER_CHAPTER = 18
const MAX_SOURCE_CHARS = 6000

/**
 * Reads a textbook, detects its real chapters (PDF outline → AI table-of-contents
 * → even split as a last resort), then asks the local AI to write a full lesson
 * for each chapter and saves them to the curriculum.
 */
export function LessonGenerator({
  book,
  open,
  onClose,
  onComplete
}: {
  book: Book
  open: boolean
  onClose: () => void
  onComplete: () => void
}): JSX.Element {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'running' | 'done'>('loading')
  const [load, setLoad] = useState({ done: 0, total: 0 })
  const [chapters, setChapters] = useState<ChapterPlan[]>([])
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)
  const pagesRef = useRef<string[]>([])
  const cancelRef = useRef(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    cancelRef.current = false
    setPhase('loading')
    setLoad({ done: 0, total: 0 })
    setChapters([])
    ;(async () => {
      try {
        const bytes = await window.api.books.data(book.id)
        if (!bytes) throw new Error('file missing')
        const doc = await pdfjsLib.getDocument({ data: bytes.slice(0), isEvalSupported: false }).promise
        if (cancelled) return
        docRef.current = doc
        pagesRef.current = await extractAllText(doc, (d, t) => {
          if (!cancelled) setLoad({ done: d, total: t })
        })
        if (cancelled) return
        const plan = await buildPlan(doc, book.gradeLevel, book.subjectKey, pagesRef.current)
        if (cancelled) return
        setChapters(plan)
        setPhase('ready')
      } catch {
        if (!cancelled) {
          toast.error('Could not read this textbook.')
          onClose()
        }
      }
    })()
    return () => {
      cancelled = true
      cancelRef.current = true
      void docRef.current?.destroy()
      docRef.current = null
      pagesRef.current = []
    }
  }, [open, book.id, book.gradeLevel, book.subjectKey, onClose])

  const run = useCallback(async () => {
    const health = await window.api.ai.health()
    if (!health.ok) {
      toast.error('AI server is offline, start Ollama/LM Studio first (see Settings).')
      return
    }
    cancelRef.current = false
    setPhase('running')
    let made = 0
    for (let i = 0; i < chapters.length; i++) {
      if (cancelRef.current) break
      setChapters((prev) => patch(prev, i, { status: 'running' }))
      try {
        const sourceText = extractText(pagesRef.current, chapters[i].startPage, chapters[i].endPage)
        await window.api.curriculum.generateLesson({
          gradeLevel: book.gradeLevel,
          subjectKey: book.subjectKey,
          bookTitle: book.title,
          chapterTitle: chapters[i].title,
          orderIndex: i,
          sourceText
        })
        made++
        setChapters((prev) => patch(prev, i, { status: 'done' }))
      } catch {
        setChapters((prev) => patch(prev, i, { status: 'error' }))
      }
    }
    setPhase('done')
    if (made > 0) {
      onComplete()
      toast.success(`Generated ${made} lesson${made > 1 ? 's' : ''} from ${book.title}.`)
    }
  }, [chapters, book, onComplete])

  function handleClose(): void {
    cancelRef.current = true
    onClose()
  }

  const doneCount = chapters.filter((c) => c.status === 'done').length

  return (
    <Modal open={open} onClose={handleClose} title="Generate lessons from textbook" size="lg">
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
          <Icon name="BookText" className="text-brand" size={20} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{book.title}</p>
            <p className="text-xs text-muted">Grade {book.gradeLevel} · uses your local AI model</p>
          </div>
        </div>

        {phase === 'loading' && (
          <div className="space-y-2 py-4">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner size={16} />
              Reading the textbook{load.total ? ` (page ${load.done}/${load.total})` : '…'}
            </div>
            {load.total > 0 && <ProgressBar value={load.done} max={load.total} />}
          </div>
        )}

        {phase !== 'loading' && (
          <>
            {phase === 'ready' && (
              <p className="text-sm text-muted">
                Detected <strong className="text-fg">{chapters.length}</strong> chapter
                {chapters.length > 1 ? 's' : ''}. The AI will write a full lesson for each. Review the
                list below, you can still cancel.
              </p>
            )}
            {(phase === 'running' || phase === 'done') && (
              <ProgressBar value={doneCount} max={chapters.length} />
            )}

            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {chapters.map((c, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm">
                  <StatusIcon status={c.status} />
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="shrink-0 text-xs text-muted">
                    p.{c.startPage}-{c.endPage}
                  </span>
                  {c.status === 'error' && <Badge variant="danger">failed</Badge>}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {phase === 'ready' && (
            <>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button icon="Sparkles" onClick={run} disabled={chapters.length === 0}>
                Generate {chapters.length} lessons
              </Button>
            </>
          )}
          {phase === 'running' && (
            <Button variant="outline" icon="Square" onClick={() => (cancelRef.current = true)}>
              Stop after current
            </Button>
          )}
          {phase === 'done' && <Button onClick={handleClose}>Done</Button>}
        </div>
      </div>
    </Modal>
  )
}

function StatusIcon({ status }: { status: Status }): JSX.Element {
  if (status === 'running') return <Spinner size={15} />
  if (status === 'done') return <Icon name="CheckCircle2" size={15} className="text-success" />
  if (status === 'error') return <Icon name="AlertCircle" size={15} className="text-danger" />
  return <Icon name="Circle" size={15} className="text-muted/50" />
}

function patch(list: ChapterPlan[], i: number, change: Partial<ChapterPlan>): ChapterPlan[] {
  const copy = [...list]
  copy[i] = { ...copy[i], ...change }
  return copy
}

/* ------------------------------------------------------------------ */
/* PDF + chapter-detection helpers                                     */
/* ------------------------------------------------------------------ */

async function extractAllText(
  doc: pdfjsLib.PDFDocumentProxy,
  onProgress: (done: number, total: number) => void
): Promise<string[]> {
  const out: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    out.push(
      content.items
        .map((it) => ('str' in it ? it.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    onProgress(p, doc.numPages)
  }
  return out
}

function extractText(pages: string[], start: number, end: number): string {
  let text = ''
  const last = Math.min(end, start + MAX_PAGES_PER_CHAPTER - 1, pages.length)
  for (let p = start; p <= last; p++) {
    text += (pages[p - 1] || '') + '\n'
    if (text.length >= MAX_SOURCE_CHARS) break
  }
  return text.slice(0, MAX_SOURCE_CHARS)
}

async function resolvePage(doc: pdfjsLib.PDFDocumentProxy, dest: unknown): Promise<number | null> {
  try {
    let explicit = dest
    if (typeof dest === 'string') explicit = await doc.getDestination(dest)
    if (!Array.isArray(explicit)) return null
    const idx = await doc.getPageIndex(explicit[0])
    return idx + 1
  } catch {
    return null
  }
}

function isReadable(t: string): boolean {
  if (!t) return false
  const looksLikeCode = /\.(pdf)$/i.test(t) || /_[A-Z0-9]{2,}/.test(t) || (!/\s/.test(t) && t.length > 5)
  return !looksLikeCode
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Find the first page whose text contains each chapter title, in order. */
function locateStarts(pages: string[], titles: string[]): number[] {
  const starts: number[] = []
  let from = 1
  for (const title of titles) {
    const key = normalize(title).split(' ').filter(Boolean).slice(0, 5).join(' ')
    let found = 0
    if (key) {
      for (let p = from; p <= pages.length; p++) {
        if (normalize(pages[p - 1] || '').includes(key)) {
          found = p
          break
        }
      }
    }
    if (!found) found = from
    starts.push(found)
    from = Math.max(from, found + 1)
  }
  return starts
}

async function buildPlan(
  doc: pdfjsLib.PDFDocumentProxy,
  gradeLevel: Book['gradeLevel'],
  subjectKey: Book['subjectKey'],
  pages: string[]
): Promise<ChapterPlan[]> {
  const total = doc.numPages
  let titles: string[] = []
  let starts: number[] = []

  // 1) PDF outline, but only if its titles are human-readable.
  const outline = await doc.getOutline().catch(() => null)
  if (outline?.length) {
    const items: { t: string; page: number }[] = []
    for (const it of outline) {
      const page = await resolvePage(doc, it.dest)
      if (page) items.push({ t: (it.title || '').trim(), page })
    }
    items.sort((a, b) => a.page - b.page)
    const human = items.filter((it) => isReadable(it.t))
    if (human.length >= 3) {
      titles = human.map((i) => i.t)
      starts = human.map((i) => i.page)
    }
  }

  // 2) Ask the AI to read the table of contents.
  if (titles.length < 2) {
    try {
      const toc = pages.slice(0, 16).join('\n').slice(0, 6000)
      const detected = await window.api.curriculum.detectChapters({ gradeLevel, subjectKey, tocText: toc })
      if (detected.length >= 2) {
        titles = detected.slice(0, MAX_CHAPTERS)
        starts = locateStarts(pages, titles)
      }
    } catch {
      /* fall through to even split */
    }
  }

  // 3) Even split as a last resort.
  if (titles.length < 2) {
    const parts = Math.min(MAX_CHAPTERS, Math.max(3, Math.ceil(total / 30)))
    const size = Math.ceil(total / parts)
    titles = Array.from({ length: parts }, (_, i) => `Chapter ${i + 1}`)
    starts = Array.from({ length: parts }, (_, i) => i * size + 1)
  }

  if (titles.length > MAX_CHAPTERS) {
    titles = titles.slice(0, MAX_CHAPTERS)
    starts = starts.slice(0, MAX_CHAPTERS)
  }

  return titles.map((t, i) => {
    const start = starts[i] && starts[i] > 0 ? starts[i] : Math.floor((i * total) / titles.length) + 1
    const nextStart =
      starts[i + 1] && starts[i + 1] > start
        ? starts[i + 1]
        : Math.floor(((i + 1) * total) / titles.length) + 1
    return {
      title: isReadable(t) ? t : `Chapter ${i + 1}`,
      startPage: start,
      endPage: i + 1 < titles.length ? Math.max(start, nextStart - 1) : total,
      status: 'pending' as Status
    }
  })
}
