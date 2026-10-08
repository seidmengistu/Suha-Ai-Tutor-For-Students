import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { VizRenderer } from '@/components/viz/VizRenderer'
import type { VisualSpec } from '@shared/types'
import { cn } from '@/lib/utils'

type Segment = { type: 'md'; text: string } | { type: 'viz'; spec: VisualSpec }

/**
 * Split markdown into ordinary segments and ```viz fenced blocks so the latter
 * can be rendered as live SVG diagrams instead of code.
 */
/** Tolerantly parse a viz block: accepts trailing commas and requires a kind. */
function parseVizJson(text: string): VisualSpec | null {
  for (const candidate of [text, text.replace(/,\s*([}\]])/g, '$1')]) {
    try {
      const obj = JSON.parse(candidate)
      if (obj && typeof obj.kind === 'string') return obj as VisualSpec
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

function parse(content: string): Segment[] {
  const segments: Segment[] = []
  const re = /```viz\s*([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    if (m.index > last) segments.push({ type: 'md', text: content.slice(last, m.index) })
    const spec = parseVizJson(m[1].trim())
    if (spec) segments.push({ type: 'viz', spec })
    else segments.push({ type: 'md', text: '```\n' + m[1].trim() + '\n```' })
    last = re.lastIndex
  }
  if (last < content.length) segments.push({ type: 'md', text: content.slice(last) })
  return segments
}

export function Markdown({ content, className }: { content: string; className?: string }): JSX.Element {
  const segments = useMemo(() => parse(content), [content])
  return (
    <div className={cn('prose-suha', className)}>
      {segments.map((seg, i) =>
        seg.type === 'viz' ? (
          <VizRenderer key={i} spec={seg.spec} />
        ) : (
          <ReactMarkdown
            key={i}
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#dc2626' }]]}
          >
            {seg.text}
          </ReactMarkdown>
        )
      )}
    </div>
  )
}
