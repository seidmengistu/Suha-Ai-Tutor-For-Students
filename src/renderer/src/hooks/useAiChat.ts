import { useCallback, useEffect, useRef, useState } from 'react'
import { useUiStore } from '@/store/useUiStore'
import type { ChatMessage, RagChunk, TutorContext } from '@shared/types'

export interface UseAiChat {
  messages: ChatMessage[]
  sources: RagChunk[]
  streaming: boolean
  offline: boolean
  send: (text: string, contextOverride?: TutorContext) => Promise<void>
  stop: () => void
  clear: () => void
}

/**
 * Manages a streaming tutor conversation. Subscribes once to the preload stream
 * events and routes deltas to the active request id.
 */
export function useAiChat(opts?: { context?: TutorContext; useRag?: boolean }): UseAiChat {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sources, setSources] = useState<RagChunk[]>([])
  const [streaming, setStreaming] = useState(false)
  const [offline, setOffline] = useState(false)
  const activeId = useRef<string | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const addToast = useUiStore((s) => s.addToast)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const appendDelta = useCallback((delta: string) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev
      const copy = [...prev]
      const last = copy[copy.length - 1]
      copy[copy.length - 1] = { ...last, content: last.content + delta }
      return copy
    })
  }, [])

  useEffect(() => {
    const offStart = window.api.ai.onStart((p) => {
      if (p.requestId === activeId.current) setSources(p.sources ?? [])
    })
    const offDelta = window.api.ai.onDelta((p) => {
      if (p.requestId === activeId.current) appendDelta(p.delta)
    })
    const offEnd = window.api.ai.onEnd((p) => {
      if (p.requestId === activeId.current) {
        setStreaming(false)
        activeId.current = null
      }
    })
    const offError = window.api.ai.onError((p) => {
      if (p.requestId !== activeId.current) return
      setStreaming(false)
      activeId.current = null
      setOffline(p.offline)
      setMessages((prev) => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last && last.role === 'assistant' && !last.content) {
          copy[copy.length - 1] = { ...last, content: `⚠️ ${p.message}` }
        }
        return copy
      })
      addToast(p.offline ? 'AI server is offline.' : 'AI request failed.', 'error')
    })
    return () => {
      offStart()
      offDelta()
      offEnd()
      offError()
    }
  }, [appendDelta, addToast])

  const send = useCallback(
    async (text: string, contextOverride?: TutorContext) => {
      const trimmed = text.trim()
      if (!trimmed || activeId.current) return
      const history: ChatMessage[] = [...messagesRef.current, { role: 'user', content: trimmed }]
      setMessages([...history, { role: 'assistant', content: '' }])
      setStreaming(true)
      setSources([])
      setOffline(false)
      try {
        const id = await window.api.ai.chat({
          messages: history,
          context: contextOverride ?? opts?.context,
          useRag: opts?.useRag ?? true
        })
        activeId.current = id
      } catch {
        setStreaming(false)
        addToast('Could not reach the AI service.', 'error')
      }
    },
    [opts?.context, opts?.useRag, addToast]
  )

  const stop = useCallback(() => {
    if (activeId.current) {
      void window.api.ai.stop(activeId.current)
      activeId.current = null
      setStreaming(false)
    }
  }, [])

  const clear = useCallback(() => {
    stop()
    setMessages([])
    setSources([])
  }, [stop])

  return { messages, sources, streaming, offline, send, stop, clear }
}
