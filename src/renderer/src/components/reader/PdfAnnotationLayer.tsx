import { useEffect, useRef } from 'react'

export type AnnotTool = 'pen' | 'highlight' | 'eraser' | null

interface Stroke {
  tool: 'pen' | 'highlight'
  color: string
  size: number
  points: [number, number][] // normalised 0..1 so they scale with zoom
}

const key = (bookId: number, page: number): string => `suha-annot:${bookId}:${page}`

function load(bookId: number, page: number): Stroke[] {
  try {
    const raw = localStorage.getItem(key(bookId, page))
    return raw ? (JSON.parse(raw) as Stroke[]) : []
  } catch {
    return []
  }
}
function persist(bookId: number, page: number, strokes: Stroke[]): void {
  try {
    if (strokes.length) localStorage.setItem(key(bookId, page), JSON.stringify(strokes))
    else localStorage.removeItem(key(bookId, page))
  } catch {
    /* ignore quota */
  }
}

/** Has the user drawn anything on this page? (for the toolbar's clear button) */
export function hasAnnotations(bookId: number, page: number): boolean {
  return load(bookId, page).length > 0
}

/**
 * A transparent canvas over the PDF page for freehand pen / highlighter notes.
 * Strokes are stored normalised in localStorage per book+page, so they persist
 * and scale with zoom. When `tool` is null the layer ignores pointers, so text
 * selection and scrolling keep working.
 */
export function PdfAnnotationLayer({
  bookId,
  page,
  width,
  height,
  tool,
  color,
  clearSignal
}: {
  bookId: number
  page: number
  width: number
  height: number
  tool: AnnotTool
  color: string
  clearSignal: number
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef<Stroke | null>(null)

  function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke): void {
    if (!s.points.length) return
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.size
    ctx.globalAlpha = s.tool === 'highlight' ? 0.32 : 1
    ctx.beginPath()
    s.points.forEach(([nx, ny], i) => {
      const x = nx * width
      const y = ny * height
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    if (s.points.length === 1) ctx.lineTo(s.points[0][0] * width + 0.1, s.points[0][1] * height + 0.1)
    ctx.stroke()
    ctx.restore()
  }

  function redraw(): void {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    for (const s of strokesRef.current) drawStroke(ctx, s)
    if (drawingRef.current) drawStroke(ctx, drawingRef.current)
  }

  // Load + redraw when the page or its size changes.
  useEffect(() => {
    strokesRef.current = load(bookId, page)
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, page, width, height])

  // Clear the current page when the parent bumps clearSignal.
  useEffect(() => {
    if (clearSignal > 0) {
      strokesRef.current = []
      persist(bookId, page, [])
      redraw()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSignal])

  function pos(e: React.PointerEvent): [number, number] {
    const r = canvasRef.current!.getBoundingClientRect()
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]
  }
  function eraseAt(p: [number, number]): void {
    const before = strokesRef.current.length
    strokesRef.current = strokesRef.current.filter(
      (s) => !s.points.some(([nx, ny]) => Math.hypot((nx - p[0]) * width, (ny - p[1]) * height) < 16)
    )
    if (strokesRef.current.length !== before) {
      persist(bookId, page, strokesRef.current)
      redraw()
    }
  }

  function onDown(e: React.PointerEvent): void {
    if (!tool) return
    e.preventDefault()
    canvasRef.current?.setPointerCapture?.(e.pointerId)
    const p = pos(e)
    if (tool === 'eraser') {
      eraseAt(p)
      return
    }
    drawingRef.current = { tool, color, size: tool === 'highlight' ? 16 : 2.5, points: [p] }
    redraw()
  }
  function onMove(e: React.PointerEvent): void {
    if (!tool) return
    const p = pos(e)
    if (tool === 'eraser') {
      if (e.buttons || e.pressure > 0) eraseAt(p)
      return
    }
    if (!drawingRef.current) return
    drawingRef.current.points.push(p)
    redraw()
  }
  function onUp(): void {
    if (drawingRef.current) {
      strokesRef.current.push(drawingRef.current)
      drawingRef.current = null
      persist(bookId, page, strokesRef.current)
      redraw()
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={Math.max(1, Math.round(width))}
      height={Math.max(1, Math.round(height))}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className="absolute inset-0"
      style={{
        width,
        height,
        touchAction: tool ? 'none' : 'auto',
        pointerEvents: tool ? 'auto' : 'none',
        cursor: tool ? 'crosshair' : 'default'
      }}
    />
  )
}
