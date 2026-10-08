import { useEffect, useRef } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'

/**
 * Renders a transparent, selectable text layer aligned on top of the rendered
 * page canvas. We build it from `page.getTextContent()` rather than relying on
 * pdfjs' (version-volatile) `renderTextLayer` / `TextLayer` helper so selection
 * works reliably regardless of the exact pdfjs build.
 *
 * Each text item is absolutely positioned using its transform matrix, scaled by
 * the same viewport scale used to paint the canvas. The text is rendered with
 * `color: transparent` so only the highlight/selection shows through.
 */
export function PdfTextLayer({
  page,
  scale,
  width,
  height,
  onSelect
}: {
  page: PDFPageProxy
  scale: number
  width: number
  height: number
  /** Fires with the current selection string whenever it changes within the layer. */
  onSelect?: (text: string) => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const container = ref.current
    if (!container) return
    container.innerHTML = ''

    const viewport = page.getViewport({ scale })

    void page.getTextContent().then((content) => {
      if (cancelled || !ref.current) return
      const frag = document.createDocumentFragment()

      for (const item of content.items) {
        // Skip non-text items (marked content etc.).
        if (!('str' in item)) continue
        const str = item.str
        if (!str) continue

        // transform = [a, b, c, d, e, f]; e,f are the text origin in PDF space.
        const tx = item.transform as number[]
        const fontHeight = Math.hypot(tx[2], tx[3]) * scale
        if (fontHeight <= 0) continue

        // Map PDF-space origin to viewport (canvas) pixels.
        const [x, y] = viewport.convertToViewportPoint(tx[4], tx[5])

        const span = document.createElement('span')
        span.textContent = str
        span.style.position = 'absolute'
        span.style.left = `${x}px`
        // y is the text baseline in viewport space; lift by the cap height.
        span.style.top = `${y - fontHeight}px`
        span.style.fontSize = `${fontHeight}px`
        span.style.fontFamily = 'sans-serif'
        span.style.lineHeight = '1'
        span.style.whiteSpace = 'pre'
        span.style.color = 'transparent'
        span.style.transformOrigin = '0% 0%'
        // Stretch to the item's rendered width so selection boxes line up.
        if (item.width) {
          const targetWidth = item.width * scale
          span.dataset.w = String(targetWidth)
        }
        frag.appendChild(span)
      }

      ref.current.appendChild(frag)

      // Second pass: scale each span horizontally to match the measured width.
      const spans = ref.current.querySelectorAll<HTMLSpanElement>('span[data-w]')
      spans.forEach((span) => {
        const target = Number(span.dataset.w)
        const actual = span.getBoundingClientRect().width
        if (actual > 0 && target > 0) {
          span.style.transform = `scaleX(${target / actual})`
        }
      })
    })

    return () => {
      cancelled = true
    }
  }, [page, scale])

  function emitSelection(): void {
    if (!onSelect) return
    const sel = window.getSelection()
    const text = sel?.toString().trim() ?? ''
    onSelect(text)
  }

  return (
    <div
      ref={ref}
      onMouseUp={emitSelection}
      onKeyUp={emitSelection}
      className="absolute inset-0 select-text"
      style={{
        width,
        height,
        // Make the transparent glyphs selectable with a visible highlight.
        cursor: 'text'
      }}
    />
  )
}
