import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AI_ACTIONS, type AiAction } from '@shared/constants'
import type { TutorContext } from '@shared/types'
import { useAiChat } from '@/hooks/useAiChat'
import { Markdown } from './Markdown'
import { AiActionBar } from './AiActionBar'
import { Button, Icon, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

export function AiPanel({
  context,
  useRag = true,
  actions = AI_ACTIONS,
  selection,
  topic,
  title = 'AI Tutor',
  className,
  suggestions
}: {
  context?: TutorContext
  useRag?: boolean
  actions?: AiAction[]
  selection?: string
  topic?: string
  title?: string
  className?: string
  suggestions?: string[]
}): JSX.Element {
  const chat = useAiChat({ context, useRag })
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [showActions, setShowActions] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: health } = useQuery({
    queryKey: ['ai-health'],
    queryFn: () => window.api.ai.health(),
    refetchInterval: 20000
  })

  const effectiveContext = useMemo<TutorContext>(
    () => ({ ...context, selectedText: selection || context?.selectedText }),
    [context, selection]
  )

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat.messages])

  function handleSend(): void {
    if (!input.trim()) return
    void chat.send(input, effectiveContext)
    setInput('')
    setShowActions(false) // give the answer room to breathe
  }

  function runAction(prompt: string, _action: AiAction): void {
    void chat.send(prompt, effectiveContext)
    setShowActions(false) // collapse quick actions so the explanation has space
  }

  const empty = chat.messages.length === 0

  // Page actions need a current textbook page (Reader only). Topic actions need
  // something to act on, a page, or an ongoing conversation to refer to.
  const hasPage = context?.bookId != null || context?.page != null
  const hasSelection = !!(selection && selection.trim())
  const hasTopic = hasPage || chat.messages.length > 0
  const visibleActions = actions.filter((a) =>
    a.needsSelection ? hasSelection : a.needsPage ? hasPage : hasTopic
  )

  return (
    <div className={cn('flex h-full min-h-0 flex-col rounded-2xl border border-border bg-surface', className)}>
      {/* header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Icon name="Sparkles" size={16} />
          </div>
          <span className="font-display text-sm font-semibold">{title}</span>
          {useRag && (
            <Badge variant="outline" >
              <Icon name="BookText" size={11} /> RAG
            </Badge>
          )}
        </div>
        {chat.messages.length > 0 && (
          <button onClick={chat.clear} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg focus-ring" title="Clear conversation">
            <Icon name="Trash2" size={15} />
          </button>
        )}
      </div>

      {/* offline banner */}
      {health && !health.ok && (
        <div className="m-3 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs">
          <Icon name="PlugZap" size={16} className="mt-0.5 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-warning">AI server is offline</p>
            <p className="mt-0.5 text-muted">{health.message}</p>
            <button onClick={() => navigate('/settings')} className="mt-1 font-medium text-brand hover:underline">
              Open Settings →
            </button>
          </div>
        </div>
      )}

      {/* messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <Icon name="Sparkles" size={28} />
            </div>
            <div>
              <p className="font-display font-semibold">Ask me anything</p>
              <p className="mt-1 max-w-xs text-sm text-muted">
                I explain step by step, draw diagrams, and create quizzes, grounded in your textbook.
              </p>
            </div>
            {suggestions && (
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => chat.send(s, effectiveContext)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs hover:border-brand/40 hover:bg-brand-soft hover:text-brand"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          chat.messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              {m.role === 'user' ? (
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-3.5 py-2 text-sm text-brand-fg">
                  {m.content}
                </div>
              ) : (
                <div className="max-w-[92%]">
                  {m.content ? (
                    <Markdown content={m.content} />
                  ) : (
                    <div className="flex items-center gap-1 py-2 text-muted">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted" />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* sources */}
        {chat.sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
            <span className="text-xs text-muted">Sources:</span>
            {chat.sources.map((s, i) => (
              <Badge key={s.id} variant="brand">
                #{i + 1} {s.bookTitle} · p.{s.page}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* actions — collapsible so explanations get the full height */}
      {visibleActions.length > 0 && (
        <div className="shrink-0 border-t border-border">
          <button
            onClick={() => setShowActions((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted hover:bg-surface-2 focus-ring"
            title={showActions ? 'Hide quick actions' : 'Show quick actions'}
          >
            <span className="flex items-center gap-1.5">
              <Icon name="Sparkles" size={13} /> Quick actions
              <Badge variant="outline">{visibleActions.length}</Badge>
            </span>
            <Icon name={showActions ? 'ChevronDown' : 'ChevronRight'} size={15} />
          </button>
          {showActions && (
            <div className="px-3 pb-2.5">
              <AiActionBar actions={visibleActions} selection={selection} topic={topic} onRun={runAction} disabled={chat.streaming} />
            </div>
          )}
        </div>
      )}

      {/* input */}
      <div className="flex shrink-0 items-end gap-2 border-t border-border p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          rows={1}
          placeholder="Ask a question…"
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus-ring"
        />
        {chat.streaming ? (
          <Button variant="outline" size="icon" onClick={chat.stop} title="Stop">
            <Icon name="Square" size={16} />
          </Button>
        ) : (
          <Button size="icon" onClick={handleSend} disabled={!input.trim()} title="Send">
            <Icon name="Send" size={16} />
          </Button>
        )}
      </div>
    </div>
  )
}
