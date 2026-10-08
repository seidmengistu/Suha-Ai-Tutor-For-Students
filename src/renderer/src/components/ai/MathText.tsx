import katex from 'katex'
import 'katex/dist/katex.min.css'

/**
 * Renders a short string with inline LaTeX: `$...$` segments become KaTeX, the
 * rest stays plain text. Used for quiz/exam option labels and answer chips,
 * which can contain math like "$<$" or "$\frac{3}{8}$" but aren't full Markdown.
 */
export function MathText({ text }: { text: string }): JSX.Element {
  if (!text || !text.includes('$')) return <>{text}</>
  const parts = text.split(/(\$[^$]+\$)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p.length > 2 && p.startsWith('$') && p.endsWith('$')) {
          try {
            const html = katex.renderToString(p.slice(1, -1), {
              throwOnError: false,
              errorColor: '#dc2626'
            })
            return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
          } catch {
            return <span key={i}>{p}</span>
          }
        }
        return <span key={i}>{p}</span>
      })}
    </>
  )
}
