import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask
} from 'pdfjs-dist'
import type { Bookmark, GradeLevel, SubjectKey } from '@shared/types'
import { toast } from '@/store/useUiStore'
import { AiPanel } from '@/components/ai/AiPanel'
import { TOC_OVERRIDES } from '@/lib/tocOverrides'
import { PdfTextLayer } from '@/components/reader/PdfTextLayer'
import { SelectionToolbar } from '@/components/reader/SelectionToolbar'
import { PdfAnnotationLayer, type AnnotTool } from '@/components/reader/PdfAnnotationLayer'
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Input,
  ProgressBar,
  SearchInput,
  Spinner,
  Tabs,
  Textarea
} from '@/components/ui'
import { clamp, cn } from '@/lib/utils'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

interface OutlineEntry {
  title: string
  page: number | null
  depth: number
}

type SidePanel = 'contents' | 'bookmarks' | 'notes'

/** Premium, app-like PDF reader with side panel, text selection and the AI tutor. */
export default function Reader(): JSX.Element {
  const { bookId: bookIdParam } = useParams<{ bookId: string }>()
  const bookId = Number(bookIdParam)
  const navigate = useNavigate()
  const qc = useQueryClient()

  /* ---- data ---- */
  const bookQuery = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => window.api.books.get(bookId),
    enabled: Number.isFinite(bookId)
  })
  const book = bookQuery.data

  /* ---- pdf lifecycle ---- */
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')

  const [page, setPage] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [fitWidth, setFitWidth] = useState(true)
  const [readerDark, setReaderDark] = useState(false)

  const [currentPageProxy, setCurrentPageProxy] = useState<PDFPageProxy | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const pageInputRef = useRef('')
  const pageWrapRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef(scale)
  const pinchRef = useRef<{ startDist: number; startScale: number; active: boolean; target: number }>(
    { startDist: 0, startScale: 1, active: false, target: 1 }
  )
  const annotToolRef = useRef<AnnotTool>(null)
  const turnPageRef = useRef<(dir: number) => void>(() => undefined)

  /* ---- side panel ---- */
  const [sidePanel, setSidePanel] = useState<SidePanel>('contents')
  const [sideOpen, setSideOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  // Full toolbar on desktop / tablet-landscape; compact bar on phones and tablet
  // portrait (more room for the book page).
  const [toolbarOpen, setToolbarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  )
  const [aiWidth, setAiWidth] = useState(() => {
    const v = Number(localStorage.getItem('readerAiWidth'))
    return v >= 300 && v <= 760 ? v : 380
  })
  const [outline, setOutline] = useState<OutlineEntry[]>([])
  const [tocLoading, setTocLoading] = useState(false)

  /* ---- annotations (pen / highlighter) ---- */
  const [annotTool, setAnnotTool] = useState<AnnotTool>(null)
  const [annotColor, setAnnotColor] = useState('#ef4444')
  const [annotClear, setAnnotClear] = useState(0)

  /* ---- selection ---- */
  const [selection, setSelection] = useState('')
  const [pageText, setPageText] = useState('')
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null)

  /* ---- search ---- */
  const [searchTerm, setSearchTerm] = useState('')
  const [searchHits, setSearchHits] = useState<number[]>([])
  const [searching, setSearching] = useState(false)

  /* ---- indexing ---- */
  const [indexing, setIndexing] = useState(false)
  const [indexProgress, setIndexProgress] = useState(0)

  /* ---------------------------------------------------------------- */
  /* Load the PDF                                                       */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (!Number.isFinite(bookId)) return
    let cancelled = false
    setLoadState('loading')

    void (async () => {
      try {
        const bytes = await window.api.books.data(bookId)
        if (cancelled) return
        if (!bytes) {
          setLoadState('missing')
          return
        }
        const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise
        if (cancelled) {
          void pdf.destroy()
          return
        }
        pdfRef.current = pdf
        setNumPages(pdf.numPages)

        // Build the table of contents: prefer the PDF outline when its titles are
        // human-readable, otherwise derive one by scanning for unit/chapter headings.
        void (async () => {
          // 0) Hand-verified contents for the few books with scanned-image TOC pages.
          try {
            const meta = await window.api.books.get(bookId)
            const override = meta ? TOC_OVERRIDES[`${meta.gradeLevel}-${meta.subjectKey}`] : null
            if (override && override.length) {
              if (!cancelled) setOutline(override.map((o) => ({ title: o.title, page: o.page, depth: 0 })))
              return
            }
          } catch {
            /* ignore */
          }
          try {
            const raw = await pdf.getOutline()
            const entries = raw
              ? (await flattenOutline(pdf, raw, 0)).filter((e) => e.title && e.title.trim())
              : []
            const readable = entries.filter((e) => isReadableTitle(e.title)).length
            if (entries.length >= 2 && readable >= entries.length * 0.5) {
              if (!cancelled) setOutline(entries)
              return
            }
          } catch {
            /* fall through to heading scan */
          }
          if (cancelled) return
          setTocLoading(true)
          // 1) Parse the book's own table-of-contents page (most accurate).
          let derived = await deriveToc(pdf, () => cancelled)
          // 2) If that fails (e.g. image-based TOC), locate the authored unit
          //    titles inside the book body.
          if (derived.length < 2 && !cancelled) {
            try {
              const meta = await window.api.books.get(bookId)
              if (meta) {
                const chapters = await window.api.curriculum.chapters(meta.gradeLevel, meta.subjectKey)
                const titles = chapters.map((c) => c.title)
                if (titles.length >= 2) {
                  const located = await locateSeedChapters(pdf, titles, () => cancelled)
                  if (located.length >= 2) derived = located
                }
              }
            } catch {
              /* ignore */
            }
          }
          // 3) Last resort: scan body pages for unit headings.
          if (derived.length < 2 && !cancelled) derived = await buildHeadingToc(pdf, () => cancelled)
          if (!cancelled) {
            setOutline(derived)
            setTocLoading(false)
          }
        })()

        // Jump to last-read page.
        let start = 1
        try {
          const reading = await window.api.reading.get(bookId)
          if (reading?.lastPage) start = clamp(reading.lastPage, 1, pdf.numPages)
        } catch {
          /* ignore */
        }
        if (!cancelled) {
          setPage(start)
          setLoadState('ready')
        }
      } catch (err) {
        if (!cancelled) {
          setLoadState('error')
          toast.error('Could not open this PDF.')
          // eslint-disable-next-line no-console
          console.error(err)
        }
      }
    })()

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      void pdfRef.current?.destroy()
      pdfRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  /* ---------------------------------------------------------------- */
  /* Resolve the effective scale (fit-width recomputes on resize)      */
  /* ---------------------------------------------------------------- */
  const computeFitScale = useCallback(async (): Promise<number | null> => {
    const pdf = pdfRef.current
    const area = scrollAreaRef.current
    if (!pdf || !area) return null
    const p = await pdf.getPage(page)
    const base = p.getViewport({ scale: 1 })
    const available = area.clientWidth - 48 // padding allowance
    if (available <= 0) return null
    return clamp(available / base.width, 0.4, 3)
  }, [page])

  // Recompute fit-width scale when toggled, on page change, or window resize.
  useEffect(() => {
    if (!fitWidth || loadState !== 'ready') return
    let cancelled = false
    const apply = async (): Promise<void> => {
      const s = await computeFitScale()
      if (!cancelled && s) setScale(s)
    }
    void apply()
    const onResize = (): void => void apply()
    window.addEventListener('resize', onResize)
    return () => {
      cancelled = true
      window.removeEventListener('resize', onResize)
    }
  }, [fitWidth, loadState, computeFitScale])

  /* ---------------------------------------------------------------- */
  /* Render the current page                                            */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (loadState !== 'ready' || !pdfRef.current) return
    let cancelled = false

    void (async () => {
      const pdf = pdfRef.current
      const canvas = canvasRef.current
      if (!pdf || !canvas) return

      try {
        const p = await pdf.getPage(page)
        if (cancelled) return
        const viewport = p.getViewport({ scale })
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        // Cancel any in-flight render before starting a new one.
        renderTaskRef.current?.cancel()
        const task = p.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
        })
        renderTaskRef.current = task
        await task.promise
        if (cancelled) return

        setCanvasSize({ width: Math.floor(viewport.width), height: Math.floor(viewport.height) })
        setCurrentPageProxy(p)

        // Extract page text for "Explain this page" grounding.
        try {
          const content = await p.getTextContent()
          if (!cancelled) {
            const text = content.items
              .map((it) => ('str' in it ? it.str : ''))
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim()
            setPageText(text)
          }
        } catch {
          /* optional */
        }
      } catch (err) {
        // RenderingCancelledException is expected when navigating quickly.
        if (!cancelled && (err as { name?: string })?.name !== 'RenderingCancelledException') {
          // eslint-disable-next-line no-console
          console.error(err)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [page, scale, loadState])

  /* ---------------------------------------------------------------- */
  /* Persist reading progress (debounced) + periodic reading time      */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (loadState !== 'ready' || !numPages) return
    const t = setTimeout(() => {
      void window.api.reading.set(bookId, page, numPages)
      void qc.invalidateQueries({ queryKey: ['reading', bookId] })
    }, 800)
    return () => clearTimeout(t)
  }, [page, numPages, loadState, bookId, qc])

  useEffect(() => {
    if (loadState !== 'ready' || !book) return
    const interval = setInterval(() => {
      void window.api.progress.record({
        type: 'reading',
        gradeLevel: book.gradeLevel,
        subjectKey: book.subjectKey,
        value: 0.5
      })
    }, 30000)
    return () => clearInterval(interval)
  }, [loadState, book])

  /* ---------------------------------------------------------------- */
  /* Selection handling                                                */
  /* ---------------------------------------------------------------- */
  const handleSelect = useCallback((text: string) => {
    setSelection(text)
    if (!text) {
      setToolbarPos(null)
      return
    }
    const sel = window.getSelection()
    const area = scrollAreaRef.current
    if (sel && sel.rangeCount > 0 && area) {
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      const areaRect = area.getBoundingClientRect()
      setToolbarPos({
        x: rect.left - areaRect.left + area.scrollLeft + rect.width / 2,
        y: rect.top - areaRect.top + area.scrollTop - 44
      })
    }
  }, [])

  const copySelection = useCallback(() => {
    if (!selection) return
    void navigator.clipboard.writeText(selection)
    toast.success('Copied to clipboard.')
    setToolbarPos(null)
  }, [selection])

  /* ---------------------------------------------------------------- */
  /* Navigation helpers                                                */
  /* ---------------------------------------------------------------- */
  const goToPage = useCallback(
    (target: number) => {
      const next = clamp(target, 1, numPages || 1)
      setPage(next)
      setToolbarPos(null)
      setSelection('')
      scrollAreaRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [numPages]
  )

  const zoom = useCallback((delta: number) => {
    setFitWidth(false)
    setScale((s) => clamp(Number((s + delta).toFixed(2)), 0.4, 3))
  }, [])

  // Keep the current scale readable from the once-bound pinch listener.
  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  // Mirror annotation mode + current page for the once-bound swipe listener.
  useEffect(() => {
    annotToolRef.current = annotTool
  }, [annotTool])
  useEffect(() => {
    turnPageRef.current = (dir: number) => goToPage(page + dir)
  }, [page, goToPage])

  // Pinch-to-zoom on the page (touch). Native non-passive listeners let us
  // preventDefault so the page doesn't scroll mid-pinch; a live CSS transform
  // gives smooth feedback, committed to a crisp re-render on release.
  useEffect(() => {
    const el = scrollAreaRef.current
    if (!el) return
    const dist = (t: TouchList): number =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    let sx = 0
    let sy = 0
    let lx = 0
    let ly = 0
    let single = false
    const onStart = (e: TouchEvent): void => {
      if (e.touches.length === 2) {
        single = false
        pinchRef.current = {
          startDist: dist(e.touches) || 1,
          startScale: scaleRef.current,
          active: true,
          target: scaleRef.current
        }
      } else if (e.touches.length === 1) {
        single = true
        sx = lx = e.touches[0].clientX
        sy = ly = e.touches[0].clientY
      }
    }
    const onMove = (e: TouchEvent): void => {
      const p = pinchRef.current
      if (p.active && e.touches.length === 2) {
        e.preventDefault()
        p.target = clamp(p.startScale * (dist(e.touches) / p.startDist), 0.4, 3)
        const w = pageWrapRef.current
        if (w) {
          w.style.transformOrigin = 'top center'
          w.style.transform = `scale(${(p.target / p.startScale).toFixed(3)})`
        }
        return
      }
      if (single && e.touches.length === 1) {
        lx = e.touches[0].clientX
        ly = e.touches[0].clientY
      }
    }
    const onEnd = (): void => {
      const p = pinchRef.current
      if (p.active) {
        p.active = false
        if (pageWrapRef.current) pageWrapRef.current.style.transform = ''
        setFitWidth(false)
        setScale(Number(p.target.toFixed(2)))
        return
      }
      if (single) {
        single = false
        const dx = lx - sx
        const dy = ly - sy
        // Horizontal flick turns the page — but not while annotating, and not
        // when the page is zoomed wider than the viewport (then it should pan).
        const noHorizontalOverflow = el.scrollWidth - el.clientWidth < 4
        if (
          !annotToolRef.current &&
          noHorizontalOverflow &&
          Math.abs(dx) > 60 &&
          Math.abs(dx) > Math.abs(dy) * 1.5
        ) {
          turnPageRef.current(dx < 0 ? 1 : -1)
        }
      }
    }
    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /* Search across pages                                               */
  /* ---------------------------------------------------------------- */
  const runSearch = useCallback(async () => {
    const pdf = pdfRef.current
    const term = searchTerm.trim().toLowerCase()
    if (!pdf || term.length < 2) {
      setSearchHits([])
      return
    }
    setSearching(true)
    setSearchHits([])
    try {
      const hits: number[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const p = await pdf.getPage(i)
        const content = await p.getTextContent()
        const text = content.items
          .map((it) => ('str' in it ? it.str : ''))
          .join(' ')
          .toLowerCase()
        if (text.includes(term)) hits.push(i)
      }
      setSearchHits(hits)
      if (hits.length === 0) toast.info('No matches found.')
    } catch {
      toast.error('Search failed.')
    } finally {
      setSearching(false)
    }
  }, [searchTerm])

  /* ---------------------------------------------------------------- */
  /* Index for AI (RAG), extract all pages then send                  */
  /* ---------------------------------------------------------------- */
  const indexForAi = useCallback(async () => {
    const pdf = pdfRef.current
    if (!pdf) return
    setIndexing(true)
    setIndexProgress(0)
    try {
      const pages: { page: number; text: string }[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const p = await pdf.getPage(i)
        const content = await p.getTextContent()
        const text = content.items
          .map((it) => ('str' in it ? it.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (text) pages.push({ page: i, text })
        setIndexProgress(Math.round((i / pdf.numPages) * 100))
      }
      const status = await window.api.rag.index(bookId, pages)
      toast.success(status.message ?? 'Indexed for AI.')
      void qc.invalidateQueries({ queryKey: ['book', bookId] })
      void qc.invalidateQueries({ queryKey: ['books'] })
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      // Electron prefixes IPC errors; show the meaningful tail to the user.
      const msg = raw.split(/Error:\s*/).pop() || raw
      toast.error(`Indexing failed, ${msg}`)
      // eslint-disable-next-line no-console
      console.error(err)
    } finally {
      setIndexing(false)
    }
  }, [bookId, qc])

  /* ---------------------------------------------------------------- */
  /* Keyboard shortcuts                                                */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (loadState !== 'ready') return
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') goToPage(page + 1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goToPage(page - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loadState, page, goToPage])

  const aiContext = useMemo(
    () => ({
      gradeLevel: book?.gradeLevel,
      subjectKey: book?.subjectKey,
      bookId,
      page,
      selectedText: selection || pageText.slice(0, 4000) || undefined
    }),
    [book, bookId, page, selection, pageText]
  )

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */
  if (!Number.isFinite(bookId)) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState icon="FileQuestion" title="Invalid book" description="No textbook id provided." />
      </div>
    )
  }

  // Drag the AI panel's left edge to resize it; width is clamped and persisted.
  function startAiResize(): void {
    const onMove = (ev: MouseEvent): void => {
      setAiWidth(Math.min(760, Math.max(300, window.innerWidth - ev.clientX)))
    }
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setAiWidth((w) => {
        localStorage.setItem('readerAiWidth', String(w))
        return w
      })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Toolbar (collapsible) */}
      {toolbarOpen ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <Button variant="ghost" size="sm" icon="ArrowLeft" onClick={() => navigate('/library')}>
          Library
        </Button>
        <button
          onClick={() => setSideOpen((v) => !v)}
          className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg focus-ring"
          title="Toggle side panel"
        >
          <Icon name="PanelLeft" size={18} />
        </button>

        <div className="mx-1 hidden min-w-0 sm:block">
          <p className="truncate text-sm font-medium" title={book?.title}>
            {book?.title ?? 'Loading…'}
          </p>
        </div>

        <div className="flex-1" />

        {/* Page controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            title="Previous page"
          >
            <Icon name="ChevronLeft" size={18} />
          </Button>
          <div className="flex items-center gap-1 text-sm">
            <Input
              key={page}
              defaultValue={page}
              onChange={(e) => (pageInputRef.current = e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const n = Number(pageInputRef.current || (e.target as HTMLInputElement).value)
                  if (Number.isFinite(n)) goToPage(n)
                }
              }}
              onBlur={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n) && n !== page) goToPage(n)
              }}
              className="h-8 w-14 px-2 text-center"
              inputMode="numeric"
            />
            <span className="text-muted">/ {numPages || '–'}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goToPage(page + 1)}
            disabled={page >= numPages}
            title="Next page"
          >
            <Icon name="ChevronRight" size={18} />
          </Button>
        </div>

        <span className="mx-1 hidden h-5 w-px bg-border md:block" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => zoom(-0.15)} title="Zoom out">
            <Icon name="ZoomOut" size={18} />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-muted">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="ghost" size="icon" onClick={() => zoom(0.15)} title="Zoom in">
            <Icon name="ZoomIn" size={18} />
          </Button>
          <Button
            variant={fitWidth ? 'subtle' : 'ghost'}
            size="sm"
            icon="MoveHorizontal"
            onClick={() => setFitWidth(true)}
            title="Fit width"
          >
            Fit
          </Button>
        </div>

        <span className="mx-1 hidden h-5 w-px bg-border md:block" />

        <Button
          variant={readerDark ? 'subtle' : 'ghost'}
          size="icon"
          onClick={() => setReaderDark((v) => !v)}
          title="Reading dark mode"
        >
          <Icon name={readerDark ? 'Sun' : 'Moon'} size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            void addBookmark(bookId, page, qc)
          }}
          title="Bookmark this page"
        >
          <Icon name="Bookmark" size={18} />
        </Button>
        <Button
          variant={annotTool ? 'subtle' : 'ghost'}
          size="icon"
          onClick={() => setAnnotTool((t) => (t ? null : 'pen'))}
          title="Annotate (pen / highlighter)"
        >
          <Icon name="Highlighter" size={18} />
        </Button>

        {book?.indexed === 1 ? (
          <Badge variant="success">
            <Icon name="Sparkles" size={11} /> AI-ready
          </Badge>
        ) : (
          <Button
            variant="outline"
            size="sm"
            icon="DatabaseZap"
            loading={indexing}
            onClick={indexForAi}
            title="Extract & index all pages for grounded AI answers"
          >
            {indexing ? `Indexing ${indexProgress}%` : 'Index for AI'}
          </Button>
        )}

        <span className="mx-1 hidden h-5 w-px bg-border md:block" />
        <Button
          variant={aiOpen ? 'subtle' : 'ghost'}
          size="sm"
          icon="Sparkles"
          onClick={() => setAiOpen((v) => !v)}
          title={aiOpen ? 'Hide AI helper' : 'Show AI helper'}
        >
          AI
        </Button>
        <button
          onClick={() => setToolbarOpen(false)}
          className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg focus-ring"
          title="Hide toolbar"
        >
          <Icon name="ChevronUp" size={18} />
        </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1 border-b border-border bg-surface px-2 py-1.5">
          <button
            onClick={() => setToolbarOpen(true)}
            className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg focus-ring"
            title="Show toolbar"
          >
            <Icon name="ChevronDown" size={18} />
          </button>
          <Button variant="ghost" size="icon" onClick={() => goToPage(page - 1)} disabled={page <= 1} title="Previous page">
            <Icon name="ChevronLeft" size={18} />
          </Button>
          <span className="text-sm tabular-nums text-muted">
            {page} / {numPages || '–'}
          </span>
          <Button variant="ghost" size="icon" onClick={() => goToPage(page + 1)} disabled={page >= numPages} title="Next page">
            <Icon name="ChevronRight" size={18} />
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" onClick={() => zoom(-0.15)} title="Zoom out">
            <Icon name="ZoomOut" size={16} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => zoom(0.15)} title="Zoom in">
            <Icon name="ZoomIn" size={16} />
          </Button>
          <Button
            variant={annotTool ? 'subtle' : 'ghost'}
            size="icon"
            onClick={() => setAnnotTool((t) => (t ? null : 'pen'))}
            title="Annotate (pen / highlighter)"
          >
            <Icon name="Highlighter" size={16} />
          </Button>
          <Button variant={aiOpen ? 'subtle' : 'ghost'} size="sm" icon="Sparkles" onClick={() => setAiOpen((v) => !v)} title="AI helper">
            AI
          </Button>
        </div>
      )}

      {indexing && <ProgressBar value={indexProgress} className="h-1 rounded-none" />}

      {/* Body: side panel | canvas | AI */}
      <div className="flex min-h-0 flex-1">
        {/* Side panel */}
        {sideOpen && (
          <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface max-lg:!w-full">
            <Tabs
              className="px-2"
              value={sidePanel}
              onChange={(id) => setSidePanel(id as SidePanel)}
              items={[
                { id: 'contents', label: 'Contents', icon: 'List' },
                { id: 'bookmarks', label: 'Marks', icon: 'Bookmark' },
                { id: 'notes', label: 'Notes', icon: 'StickyNote' }
              ]}
            />
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {sidePanel === 'contents' && (
                <ContentsPanel
                  outline={outline}
                  loading={tocLoading}
                  currentPage={page}
                  onJump={goToPage}
                />
              )}
              {sidePanel === 'bookmarks' && (
                <BookmarksPanel bookId={bookId} currentPage={page} onJump={goToPage} />
              )}
              {sidePanel === 'notes' && book && (
                <NotesPanel
                  bookId={bookId}
                  page={page}
                  gradeLevel={book.gradeLevel}
                  subjectKey={book.subjectKey}
                  selection={selection}
                />
              )}
            </div>

            {/* Search lives at the bottom of the panel */}
            <div className="shrink-0 space-y-2 border-t border-border p-3">
              <SearchInput
                placeholder="Search in book…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runSearch()
                }}
              />
              {searching ? (
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Spinner size={14} /> Searching…
                </div>
              ) : searchHits.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {searchHits.map((h) => (
                    <button
                      key={h}
                      onClick={() => goToPage(h)}
                      className="rounded-md bg-surface-2 px-2 py-0.5 text-xs hover:bg-brand-soft hover:text-brand"
                    >
                      p.{h}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </aside>
        )}

        {/* Canvas area */}
        <div
          ref={scrollAreaRef}
          className="relative min-w-0 flex-1 overflow-auto bg-surface-2/40 p-6"
        >
          {loadState === 'loading' && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
              <Spinner size={28} />
              <p className="text-sm">Opening textbook…</p>
            </div>
          )}

          {loadState === 'missing' && (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                icon="FileX"
                title="File not found"
                description="The PDF for this textbook is missing from disk. Re-import it from the Library."
                action={
                  <Link to="/library">
                    <Button icon="Library">Back to Library</Button>
                  </Link>
                }
              />
            </div>
          )}

          {loadState === 'error' && (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                icon="TriangleAlert"
                title="Could not open this PDF"
                description="The file may be corrupted or unsupported."
              />
            </div>
          )}

          {loadState === 'ready' && (
            <div className="mx-auto w-fit">
              <div
                ref={pageWrapRef}
                className="relative shadow-glass transition-[filter] duration-300"
                style={{
                  width: canvasSize.width || undefined,
                  filter: readerDark ? 'invert(1) hue-rotate(180deg)' : undefined
                }}
              >
                <canvas ref={canvasRef} className="block rounded-sm bg-white" />
                {currentPageProxy && canvasSize.width > 0 && (
                  <PdfTextLayer
                    page={currentPageProxy}
                    scale={scale}
                    width={canvasSize.width}
                    height={canvasSize.height}
                    onSelect={handleSelect}
                  />
                )}
                {canvasSize.width > 0 && (
                  <PdfAnnotationLayer
                    bookId={bookId}
                    page={page}
                    width={canvasSize.width}
                    height={canvasSize.height}
                    tool={annotTool}
                    color={annotColor}
                    clearSignal={annotClear}
                  />
                )}
              </div>
            </div>
          )}

          {/* Floating selection toolbar */}
          {toolbarPos && selection && (
            <SelectionToolbar
              x={toolbarPos.x}
              y={toolbarPos.y}
              onCopy={copySelection}
              onAskAi={() => {
                setToolbarPos(null)
                toast.info('Selection sent to AI, use a quick action or ask away.')
              }}
            />
          )}
        </div>

        {/* AI panel */}
        {aiOpen && (
          <aside
            className="relative flex shrink-0 border-l border-border bg-bg max-lg:!w-full"
            style={{ width: aiWidth }}
          >
            {/* Resize handle */}
            <div
              onMouseDown={(e) => {
                e.preventDefault()
                startAiResize()
              }}
              onDoubleClick={() => {
                setAiWidth(380)
                localStorage.setItem('readerAiWidth', '380')
              }}
              title="Drag to resize · double-click to reset"
              className="group absolute left-0 top-0 z-10 flex h-full w-2.5 -translate-x-1/2 cursor-col-resize items-center justify-center"
            >
              <div className="h-10 w-1 rounded-full bg-border transition-colors group-hover:bg-brand" />
            </div>
            <div className="min-w-0 flex-1 p-3">
              <AiPanel
                context={aiContext}
                useRag={book?.indexed === 1}
                selection={selection || undefined}
                title="Reader AI"
              />
            </div>
          </aside>
        )}
      </div>

      {/* Floating annotation toolbar */}
      {annotTool && (
        <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface/95 p-1.5 shadow-glass backdrop-blur">
          {(
            [
              { t: 'pen', icon: 'Pen', label: 'Pen' },
              { t: 'highlight', icon: 'Highlighter', label: 'Highlighter' },
              { t: 'eraser', icon: 'Eraser', label: 'Eraser' }
            ] as const
          ).map((o) => (
            <button
              key={o.t}
              onClick={() => setAnnotTool(o.t)}
              title={o.label}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl focus-ring',
                annotTool === o.t ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-fg'
              )}
            >
              <Icon name={o.icon} size={17} />
            </button>
          ))}
          <span className="mx-0.5 h-6 w-px bg-border" />
          {['#ef4444', '#fde047', '#22c55e', '#3b82f6', '#111827'].map((c) => (
            <button
              key={c}
              onClick={() => setAnnotColor(c)}
              title="Colour"
              className={cn(
                'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
                annotColor === c ? 'border-fg' : 'border-transparent'
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          <span className="mx-0.5 h-6 w-px bg-border" />
          <button
            onClick={() => setAnnotClear((n) => n + 1)}
            title="Clear this page"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-danger focus-ring"
          >
            <Icon name="Trash2" size={17} />
          </button>
          <button
            onClick={() => setAnnotTool(null)}
            title="Done"
            className="flex h-9 items-center gap-1 rounded-xl bg-brand px-3 text-sm font-medium text-brand-fg focus-ring"
          >
            <Icon name="Check" size={15} /> Done
          </button>
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/* Side panels                                                         */
/* ================================================================== */

function ContentsPanel({
  outline,
  loading,
  currentPage,
  onJump
}: {
  outline: OutlineEntry[]
  loading?: boolean
  currentPage: number
  onJump: (page: number) => void
}): JSX.Element {
  if (outline.length === 0) {
    return (
      <div className="px-1 py-6 text-center text-xs text-muted">
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner size={14} /> Building contents…
          </span>
        ) : (
          'This textbook has no table of contents.'
        )}
      </div>
    )
  }
  return (
    <ul className="space-y-0.5">
      {outline.map((entry, i) => {
        const active = entry.page === currentPage
        return (
          <li key={i}>
            <button
              disabled={entry.page == null}
              onClick={() => entry.page != null && onJump(entry.page)}
              style={{ paddingLeft: 8 + entry.depth * 12 }}
              className={
                'flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-xs transition-colors ' +
                (entry.page == null
                  ? 'cursor-default text-muted/70'
                  : active
                    ? 'bg-brand-soft font-medium text-brand'
                    : 'text-fg/80 hover:bg-surface-2')
              }
            >
              <span className="line-clamp-2 flex-1">{entry.title}</span>
              {entry.page != null && <span className="shrink-0 text-[10px] text-muted">{entry.page}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function BookmarksPanel({
  bookId,
  currentPage,
  onJump
}: {
  bookId: number
  currentPage: number
  onJump: (page: number) => void
}): JSX.Element {
  const qc = useQueryClient()
  const { data: bookmarks = [], isLoading } = useQuery({
    queryKey: ['bookmarks', bookId],
    queryFn: () => window.api.bookmarks.list(bookId)
  })

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="subtle"
        icon="Plus"
        className="w-full"
        onClick={() => void addBookmark(bookId, currentPage, qc)}
      >
        Bookmark page {currentPage}
      </Button>

      {isLoading ? (
        <p className="py-4 text-center text-xs text-muted">Loading…</p>
      ) : bookmarks.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted">No bookmarks yet.</p>
      ) : (
        <ul className="space-y-1">
          {bookmarks.map((bm: Bookmark) => (
            <li
              key={bm.id}
              className="group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-surface-2"
            >
              <button
                onClick={() => onJump(bm.page)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <Icon name="Bookmark" size={13} className="shrink-0 text-brand" />
                <span className="truncate text-xs">{bm.label || `Page ${bm.page}`}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted">p.{bm.page}</span>
              </button>
              <button
                onClick={async () => {
                  await window.api.bookmarks.delete(bm.id)
                  void qc.invalidateQueries({ queryKey: ['bookmarks', bookId] })
                }}
                className="shrink-0 rounded p-1 text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                title="Remove bookmark"
              >
                <Icon name="X" size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NotesPanel({
  bookId,
  page,
  gradeLevel,
  subjectKey,
  selection
}: {
  bookId: number
  page: number
  gradeLevel: GradeLevel
  subjectKey: SubjectKey
  selection: string
}): JSX.Element {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  // Prefill body from the current selection when present.
  useEffect(() => {
    if (selection) setBody((b) => (b ? b : selection))
  }, [selection])

  const { data: notes = [] } = useQuery({
    queryKey: ['notes', 'book', bookId],
    queryFn: () => window.api.notes.list({ bookId })
  })

  async function save(): Promise<void> {
    if (!title.trim() && !body.trim()) {
      toast.error('Write a note first.')
      return
    }
    setSaving(true)
    try {
      await window.api.notes.create({
        title: title.trim() || `Note · page ${page}`,
        body: body.trim(),
        bookId,
        page,
        gradeLevel,
        subjectKey
      })
      toast.success('Note saved.')
      setTitle('')
      setBody('')
      void qc.invalidateQueries({ queryKey: ['notes', 'book', bookId] })
    } catch {
      toast.error('Could not save the note.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-xl border border-border p-2.5">
        <p className="text-[11px] font-medium text-muted">New note · page {page}</p>
        <Input
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-8 text-xs"
        />
        <Textarea
          placeholder="Write your note…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-[70px] text-xs"
        />
        <Button size="sm" icon="Save" className="w-full" loading={saving} onClick={() => void save()}>
          Save note
        </Button>
      </div>

      {notes.length > 0 && (
        <ul className="space-y-1.5">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-surface-2 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium">{n.title}</p>
                {n.page != null && <span className="shrink-0 text-[10px] text-muted">p.{n.page}</span>}
              </div>
              {n.body && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{n.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ================================================================== */
/* Helpers                                                             */
/* ================================================================== */

async function addBookmark(
  bookId: number,
  page: number,
  qc: ReturnType<typeof useQueryClient>
): Promise<void> {
  try {
    await window.api.bookmarks.add(bookId, page, `Page ${page}`)
    toast.success(`Bookmarked page ${page}.`)
    void qc.invalidateQueries({ queryKey: ['bookmarks', bookId] })
  } catch {
    toast.error('Could not add bookmark.')
  }
}

/**
 * Flatten a pdf.js outline tree into a list with resolved page numbers.
 * Destinations may be named or explicit; we resolve to a 1-based page index
 * where possible, otherwise leave the page null (title-only entry).
 */
async function flattenOutline(
  pdf: PDFDocumentProxy,
  items: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>,
  depth: number
): Promise<OutlineEntry[]> {
  const out: OutlineEntry[] = []
  for (const item of items ?? []) {
    let pageNum: number | null = null
    try {
      const dest =
        typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest
      if (Array.isArray(dest) && dest[0]) {
        const idx = await pdf.getPageIndex(dest[0] as Parameters<PDFDocumentProxy['getPageIndex']>[0])
        pageNum = idx + 1
      }
    } catch {
      /* unresolved destination, keep title only */
    }
    out.push({ title: item.title, page: pageNum, depth })
    if (item.items && item.items.length > 0) {
      const children = await flattenOutline(pdf, item.items, depth + 1)
      out.push(...children)
    }
  }
  return out
}

const CODE_TITLE = /\.(pdf)$/i
/** True when an outline title reads like a human chapter name (not a file code). */
function isReadableTitle(t: string): boolean {
  if (!t) return false
  const code = CODE_TITLE.test(t) || /_[A-Z0-9]{2,}/.test(t) || (!/\s/.test(t) && t.length > 6)
  return !code
}

function titleCaseWords(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

async function pageTextOf(pdf: PDFDocumentProxy, p: number): Promise<string> {
  try {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    return content.items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  } catch {
    return ''
  }
}

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
}
const wordToNum = (w: string): number | null =>
  /^\d+$/.test(w) ? Number(w) : NUM_WORDS[w.toLowerCase()] ?? null
const UNIT_WORD = '\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve'

/** Pull the title + start page out of one unit's slice of a contents page. */
function parseTocUnit(block: string): { title: string; page: number | null } | null {
  let cleaned = block.replace(/\.{2,}/g, ' ').replace(/\s+/g, ' ').trim()
  // Some books repeat the unit number ("Unit 1 1 Title"); drop the leading repeat.
  cleaned = cleaned.replace(/^\d{1,3}\s+(?=[A-Za-z])/, '')
  const m = cleaned.match(/(\d+\s*\.\s*\d+)|(\d{1,3})(?!\s*\.\s*\d)/)
  if (!m) return null
  const title = cleaned.slice(0, m.index).replace(/[:\-–.\s]+$/, '').trim()
  let page: number | null
  if (m[2]) page = Number(m[2])
  else {
    const pm = cleaned.replace(/\d+\s*\.\s*\d+/g, ' ').match(/\b(\d{1,3})\b/)
    page = pm ? Number(pm[1]) : null
  }
  return { title, page }
}

function parseTocUnits(toc: string): { num: number; kind: string; title: string; page: number }[] {
  const re = new RegExp(`\\b(unit|chapter)\\s+(${UNIT_WORD})\\b\\s*[:.\\-–]?\\s*`, 'gi')
  const heads: { num: number; kind: string; contentStart: number; start: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(toc))) {
    const n = wordToNum(m[2])
    if (n) heads.push({ num: n, kind: m[1], contentStart: re.lastIndex, start: m.index })
  }
  const out: { num: number; kind: string; title: string; page: number }[] = []
  for (let i = 0; i < heads.length; i++) {
    const end = i + 1 < heads.length ? heads[i + 1].start : toc.length
    const parsed = parseTocUnit(toc.slice(heads[i].contentStart, end))
    if (parsed && parsed.title && parsed.title.length >= 2 && parsed.page) {
      out.push({ num: heads[i].num, kind: heads[i].kind, title: parsed.title, page: parsed.page })
    }
  }
  const seen = new Set<number>()
  const deduped: typeof out = []
  for (const e of out) {
    if (seen.has(e.num) || e.num > 20) continue
    seen.add(e.num)
    deduped.push(e)
  }
  return deduped.sort((a, b) => a.num - b.num)
}

/**
 * Find the gap between the book's printed page numbers and the PDF page index by
 * looking for the running-header/footer number that increments by one per page.
 */
async function detectPageOffset(
  pdf: PDFDocumentProxy,
  from: number,
  isCancelled: () => boolean
): Promise<number | null> {
  const total = pdf.numPages
  const start = Math.max(2, Math.min(from, total - 2))
  const end = Math.min(total, start + 30)
  const pageInts = new Map<number, Set<number>>()
  for (let p = start; p <= end; p++) {
    if (isCancelled()) return null
    const t = await pageTextOf(pdf, p)
    const zone = t.slice(0, 90) + ' ' + t.slice(-45)
    pageInts.set(p, new Set((zone.match(/\b\d{1,3}\b/g) || []).map(Number)))
  }
  let bestOffset: number | null = null
  let bestCount = 0
  for (let o = 1; o <= 20; o++) {
    let c = 0
    for (const [p, set] of pageInts) if (set.has(p - o)) c++
    if (c > bestCount) {
      bestCount = c
      bestOffset = o
    }
  }
  return bestCount >= 6 ? bestOffset : null
}

/**
 * Parse the textbook's own table-of-contents page into clickable entries. Maps
 * printed page numbers to PDF pages via embedded page labels, or a detected
 * offset. This is the primary, most accurate source of contents.
 */
async function deriveToc(pdf: PDFDocumentProxy, isCancelled: () => boolean): Promise<OutlineEntry[]> {
  const total = pdf.numPages
  const scanN = Math.min(20, total)
  const texts: string[] = []
  for (let p = 1; p <= scanN; p++) {
    if (isCancelled()) return []
    texts.push(await pageTextOf(pdf, p))
  }
  const unitRe = new RegExp(`\\b(unit|chapter)\\s+(${UNIT_WORD})\\b`, 'gi')
  const tocIdx: number[] = []
  for (let i = 0; i < texts.length; i++) {
    const u = (texts[i].match(unitRe) || []).length
    const nums = (texts[i].match(/\b\d{1,3}\b/g) || []).length
    if ((u >= 2 && nums >= 5) || (/contents/i.test(texts[i].slice(0, 80)) && u >= 1)) tocIdx.push(i)
  }
  if (!tocIdx.length) return []
  const entries = parseTocUnits(tocIdx.map((i) => texts[i]).join(' \n '))
  if (entries.length < 2) return []

  const labels = await pdf.getPageLabels().catch(() => null)
  const hasNumericLabels = labels != null && labels.some((l) => /^\d+$/.test(l))
  let map: (printed: number) => number
  if (hasNumericLabels) {
    map = (printed) => {
      const i = (labels as string[]).indexOf(String(printed))
      return i >= 0 ? i + 1 : Math.max(1, Math.min(total, printed))
    }
  } else {
    const offset = await detectPageOffset(pdf, tocIdx[tocIdx.length - 1] + 2, isCancelled)
    map = (printed) => (offset != null ? Math.max(1, Math.min(total, printed + offset)) : printed)
  }

  return entries.map((e) => ({
    title: `${e.kind[0].toUpperCase()}${e.kind.slice(1).toLowerCase()} ${e.num}: ${titleCaseWords(e.title)}`,
    page: map(e.page),
    depth: 0
  }))
}

const CH_STOP = new Set([
  'the','and','of','to','in','on','for','with','a','an','further','introduction','unit','chapter',
  'grade','mathematics','physics','chemistry','biology','english','general','science','student',
  'textbook','more','its','their','our','from','some','elements'
])
function chapterKeywords(title: string): string[] {
  const t = title.replace(/^\s*(unit|chapter)\s*\d+\s*[:.\-]?\s*/i, '')
  return [...new Set(t.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !CH_STOP.has(w)))]
}

/**
 * Locate authored curriculum unit titles inside the book body. Used for books
 * whose contents page is a scanned image but whose body text is real. Walks the
 * titles in order, finding the first page after the previous unit whose heading
 * area contains the title's keywords.
 */
async function locateSeedChapters(
  pdf: PDFDocumentProxy,
  titles: string[],
  isCancelled: () => boolean
): Promise<OutlineEntry[]> {
  const out: OutlineEntry[] = []
  let from = 1
  for (const title of titles) {
    const kws = chapterKeywords(title)
    if (!kws.length) continue
    const need = Math.max(1, Math.ceil(kws.length / 2))
    let foundPage = 0
    for (let p = from; p <= pdf.numPages; p++) {
      if (isCancelled()) return []
      const head = (await pageTextOf(pdf, p)).slice(0, 150).toLowerCase().replace(/[^a-z0-9]+/g, ' ')
      const present = kws.filter((w) => head.includes(w))
      const distinctive = present.some((w) => w.length >= 6) || kws.every((w) => w.length < 6)
      if (present.length >= need && distinctive) {
        foundPage = p
        break
      }
    }
    if (foundPage) {
      out.push({ title, page: foundPage, depth: 0 })
      from = foundPage + 1
    }
  }
  return out.length >= 2 ? out : []
}

/**
 * Fallback for books without a parseable contents page: scan body pages for
 * "Unit N" / "Chapter N" headings, one entry per unit at its start page.
 */
async function buildHeadingToc(
  pdf: PDFDocumentProxy,
  isCancelled: () => boolean
): Promise<OutlineEntry[]> {
  const found = new Map<string, OutlineEntry>()
  const max = Math.min(pdf.numPages, 600)
  for (let p = 1; p <= max; p++) {
    if (isCancelled()) return []
    const text = await pageTextOf(pdf, p)
    if (!text) continue
    const lead = text.slice(0, 500)
    const mentions = lead.match(/\b(unit|chapter)\s+\d{1,2}\b/gi) || []
    if (mentions.length >= 2) continue
    const m = text
      .slice(0, 180)
      .match(/\b(unit|chapter)\s+(\d{1,2})\b[\s:.–-]*([A-Za-z][A-Za-z0-9 ,'&()/-]{2,60})?/i)
    if (!m) continue
    const key = `${m[1].toLowerCase()} ${m[2]}`
    if (found.has(key)) continue
    const kind = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()
    const tail = (m[3] || '').trim().replace(/\s+\d+$/, '')
    found.set(key, {
      title: tail ? `${kind} ${m[2]}: ${titleCaseWords(tail)}` : `${kind} ${m[2]}`,
      page: p,
      depth: 0
    })
  }
  return Array.from(found.values()).sort((a, b) => (a.page ?? 0) - (b.page ?? 0))
}
