/**
 * Local AI integration. Talks to LM Studio (OpenAI-compatible API) or Ollama,
 * entirely offline. Chat responses are streamed back to the renderer over IPC
 * events; embeddings are exposed for the RAG pipeline.
 *
 * This module never imports the RAG service, retrieved passages are passed in
 * by the IPC layer to keep the dependency graph acyclic.
 */
import { IPC, TEACHING_STRUCTURE } from '@shared/constants'
import { getSettings } from './settings'
import type {
  AiHealth,
  AiProvider,
  ChatRequest,
  ChatStreamEnd,
  ChatStreamError,
  ChatStreamStart,
  RagChunk,
  TutorContext
} from '@shared/types'

/** In-flight chat requests, so the UI can stop generation. */
const controllers = new Map<string, AbortController>()

function baseUrl(): string {
  return getSettings().ai.baseUrl.replace(/\/+$/, '')
}

/** Headers for OpenAI-compatible requests, including a Bearer key for Groq. */
function authHeaders(): Record<string, string> {
  const { apiKey } = getSettings().ai
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return headers
}

function friendlyOfflineMessage(): string {
  const { provider } = getSettings().ai
  if (provider === 'ollama') {
    return [
      'Could not reach Ollama.',
      'Start it by opening a terminal and running:  ollama serve',
      'Then pull a model, e.g.:  ollama pull qwen3:8b',
      'Confirm the server URL in Settings (default http://localhost:11434).'
    ].join(' ')
  }
  if (provider === 'groq') {
    return [
      'Could not reach Groq.',
      'Check your internet connection, and make sure your Groq API key is set in Settings → Local AI.',
      'Get a free key at https://console.groq.com/keys.'
    ].join(' ')
  }
  return [
    'Could not reach LM Studio.',
    'Open LM Studio, go to the "Local Server" tab and click "Start Server".',
    'Load a model (e.g. Qwen3 8B), then confirm the URL in Settings (default http://localhost:1234).'
  ].join(' ')
}

function isConnectionError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err).toLowerCase()
  return (
    msg.includes('fetch failed') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('econnreset') ||
    msg.includes('network') ||
    msg.includes('failed to fetch')
  )
}

/* ------------------------------------------------------------------ */
/* Models & health                                                     */
/* ------------------------------------------------------------------ */

export async function aiModels(): Promise<string[]> {
  const { provider } = getSettings().ai
  if (provider === 'ollama') {
    const res = await fetch(`${baseUrl()}/api/tags`)
    if (!res.ok) throw new Error(`Ollama responded ${res.status}`)
    const json = (await res.json()) as { models?: { name: string }[] }
    return (json.models ?? []).map((m) => m.name)
  }
  const res = await fetch(`${baseUrl()}/v1/models`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`AI server responded ${res.status}`)
  const json = (await res.json()) as { data?: { id: string }[] }
  return (json.data ?? []).map((m) => m.id)
}

export async function aiHealth(): Promise<AiHealth> {
  const { provider } = getSettings().ai
  const url = baseUrl()
  try {
    const models = await aiModels()
    return {
      ok: true,
      provider,
      baseUrl: url,
      models,
      message: models.length
        ? `Connected, ${models.length} model${models.length > 1 ? 's' : ''} available.`
        : 'Connected, but no models are loaded yet.'
    }
  } catch {
    return { ok: false, provider, baseUrl: url, models: [], message: friendlyOfflineMessage() }
  }
}

/* ------------------------------------------------------------------ */
/* Embeddings (used by RAG)                                            */
/* ------------------------------------------------------------------ */

/**
 * Multimodal completion: send a text prompt plus page images (data URLs) to a
 * vision-capable model. Uses the OpenAI image_url format for Groq/LM Studio and
 * the /api/chat `images` field for Ollama. No third-party OCR involved.
 */
export async function aiVision(prompt: string, images: string[]): Promise<string> {
  const { provider, model } = getSettings().ai
  if (provider === 'ollama') {
    const res = await fetch(`${baseUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: 'user', content: prompt, images: images.map((u) => u.replace(/^data:[^,]+,/, '')) }]
      })
    })
    if (!res.ok) {
      let body = ''
      try {
        body = await res.text()
      } catch {
        /* ignore */
      }
      throw new Error(`Vision request failed (${res.status}). ${body.slice(0, 180)}`)
    }
    const json = (await res.json()) as { message?: { content?: string } }
    return json.message?.content ?? ''
  }
  const res = await fetch(`${baseUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...images.map((url) => ({ type: 'image_url', image_url: { url } }))
          ]
        }
      ]
    })
  })
  if (!res.ok) throw new Error(`Vision request failed (${res.status})`)
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return json.choices?.[0]?.message?.content ?? ''
}

export async function aiEmbed(texts: string[]): Promise<number[][]> {
  const { provider, embeddingModel } = getSettings().ai
  if (provider === 'ollama') return ollamaEmbed(texts, embeddingModel)
  if (provider === 'groq') {
    throw new Error(
      'Groq has no embeddings API, so textbook indexing (RAG) is not available on it. Switch to LM Studio or Ollama for textbook search, the bundled lessons still work without it.'
    )
  }

  const res = await fetch(`${baseUrl()}/v1/embeddings`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ model: embeddingModel, input: texts })
  })
  if (!res.ok) throw await embedError(res, embeddingModel, 'lmstudio')
  const json = (await res.json()) as { data: { embedding: number[] }[] }
  return json.data.map((d) => d.embedding)
}

/**
 * Ollama embeddings: prefer the modern batch endpoint /api/embed, and fall back
 * to the legacy per-text /api/embeddings for older servers. A missing model
 * surfaces as a clear, actionable error via embedError().
 */
async function ollamaEmbed(texts: string[], model: string): Promise<number[][]> {
  const batch = await fetch(`${baseUrl()}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: texts })
  })
  if (batch.ok) {
    const json = (await batch.json()) as { embeddings?: number[][] }
    if (Array.isArray(json.embeddings) && json.embeddings.length === texts.length) {
      return json.embeddings
    }
  }

  // Fallback (older Ollama, or to obtain a precise model-not-found error).
  const out: number[][] = []
  for (const text of texts) {
    const res = await fetch(`${baseUrl()}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text })
    })
    if (!res.ok) throw await embedError(res, model, 'ollama')
    const json = (await res.json()) as { embedding?: number[] }
    if (!Array.isArray(json.embedding)) {
      throw new Error('The AI server returned an empty embedding.')
    }
    out.push(json.embedding)
  }
  return out
}

async function embedError(res: Response, model: string, provider: AiProvider): Promise<Error> {
  let body = ''
  try {
    body = await res.text()
  } catch {
    /* ignore */
  }
  const missing = res.status === 404 || /not found|try pulling|no such model/i.test(body)
  if (missing) {
    return provider === 'ollama'
      ? new Error(
          `Embedding model "${model}" is not installed. Open a terminal and run:  ollama pull ${model}, then try again. (You can change the embedding model in Settings.)`
        )
      : new Error(
          `Embedding model "${model}" is not loaded in LM Studio. Load an embedding model (e.g. nomic-embed-text), then set its name in Settings.`
        )
  }
  return new Error(`Embedding request failed (${res.status}). ${body.slice(0, 160)}`)
}

/* ------------------------------------------------------------------ */
/* System prompt                                                       */
/* ------------------------------------------------------------------ */

export function buildSystemPrompt(
  context: TutorContext | undefined,
  sources: RagChunk[],
  language: string
): string {
  const structure = TEACHING_STRUCTURE.map((s, i) => `${i + 1}. ${s}`).join('\n')
  const parts: string[] = [
    `You are "Suha AI Tutor", a warm, patient teacher for Ethiopian students in Grades 7 to 12, following the Ethiopian national curriculum.`,
    `Always teach using EXACTLY this structure, in order, with clear headings. Never skip a step:\n${structure}`,
    `Rules:`,
    `- Be accurate, encouraging and concise. Prefer short paragraphs and bullet points.`,
    `- Use examples relevant to Ethiopian daily life where helpful.`,
    `- For mathematics and science, show formulas clearly and define every symbol.`,
    `- When a diagram helps, output a fenced \`\`\`viz block with ONE complete, valid JSON object (no trailing commas, no comments): {"kind","title","data"}. Put concrete data in "data", never prose. Use these shapes:`,
    `  • function-graph / motion-graph: {"xLabel","yLabel","series":[{"label","points":[[x,y],...]}]}, compute ~12 real points yourself; or {"expr":"x^2","domain":[-5,5]}.`,
    `  • number-line: {"min","max","step","points":[{"value","label"}]}. geometry: {"vertices":[[x,y]],"labels":[...]}. bar-chart: {"bars":[{"label","value"}]}.`,
    `  • atom: {"symbol","protons","neutrons","shells":[2,8]}. molecule: {"atoms":[{"el","x","y"}],"bonds":[[i,j,order]]}. reaction: {"equation":"2H2 + O2 -> 2H2O"}.`,
    `  • cell: {"type":"plant|animal","parts":[{"label","x":0-1,"y":0-1}]}. free-body: {"object","forces":[{"label","angle","magnitude"}]}. circuit/timeline/tree similarly. Only emit a viz when the data is accurate.`,
    `- End with 2-3 practice questions and 1 exam-style question with brief answers.`
  ]

  if (language === 'am') {
    parts.push('- The student prefers Amharic. Reply primarily in Amharic (አማርኛ), keeping technical terms in English where clearer.')
  }

  if (context) {
    const ctx: string[] = []
    if (context.gradeLevel) ctx.push(`Grade ${context.gradeLevel}`)
    if (context.subjectKey) ctx.push(`Subject: ${context.subjectKey}`)
    if (context.chapterTitle) ctx.push(`Chapter: ${context.chapterTitle}`)
    if (context.lessonTitle) ctx.push(`Lesson: ${context.lessonTitle}`)
    if (context.page) ctx.push(`Page: ${context.page}`)
    if (ctx.length) parts.push(`Current context, ${ctx.join(', ')}.`)
    if (context.selectedText)
      parts.push(`The student highlighted this text:\n"""\n${context.selectedText}\n"""`)
  }

  if (sources.length) {
    const grounding = sources
      .map((s, i) => `[#${i + 1}] (${s.bookTitle}, p.${s.page})\n${s.content}`)
      .join('\n\n')
    parts.push(
      `Use the following textbook passages as your primary source of truth. Prefer them over your own memory and cite them inline like [#1] when you use them:\n${grounding}`
    )
  } else {
    parts.push(
      `No textbook passage was retrieved for this question. Answer from curriculum knowledge and say so briefly if precision matters.`
    )
  }

  return parts.join('\n\n')
}

/* ------------------------------------------------------------------ */
/* Streaming chat                                                      */
/* ------------------------------------------------------------------ */

async function* readLines(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      yield buf.slice(0, idx)
      buf = buf.slice(idx + 1)
    }
  }
  if (buf.trim()) yield buf
}

type Sender = (channel: string, payload: unknown) => void

export function aiStop(requestId: string): void {
  controllers.get(requestId)?.abort()
  controllers.delete(requestId)
}

/**
 * Non-streaming completion, used for structured generation (quiz/flashcard
 * questions). Returns the full assistant text or throws on connection failure.
 */
export async function aiComplete(
  messages: { role: string; content: string }[],
  temperature?: number
): Promise<string> {
  const { provider, model, maxTokens, topP, temperature: defTemp } = getSettings().ai
  const temp = temperature ?? defTemp
  if (provider === 'ollama') {
    const res = await fetch(`${baseUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature: temp, num_predict: maxTokens, top_p: topP }
      })
    })
    if (!res.ok) throw new Error(`AI server responded ${res.status}`)
    const json = (await res.json()) as { message?: { content?: string } }
    return json.message?.content ?? ''
  }
  const res = await fetch(`${baseUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      temperature: temp,
      max_tokens: maxTokens,
      top_p: topP
    })
  })
  if (!res.ok) throw new Error(`AI server responded ${res.status}`)
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return json.choices?.[0]?.message?.content ?? ''
}

export async function aiChat(opts: {
  requestId: string
  request: ChatRequest
  sources: RagChunk[]
  send: Sender
}): Promise<void> {
  const { requestId, request, sources, send } = opts
  const settings = getSettings()
  const ai = settings.ai
  const controller = new AbortController()
  controllers.set(requestId, controller)

  const system = buildSystemPrompt(request.context, sources, settings.language)
  const messages = [{ role: 'system', content: system }, ...request.messages]
  const temperature = request.temperature ?? ai.temperature

  send(IPC.aiStreamStart, { requestId, sources } satisfies ChatStreamStart)

  let full = ''
  try {
    const res = await chatRequest(messages, temperature, controller.signal)
    if (!res.ok || !res.body) throw new Error(`AI server responded ${res.status}`)

    for await (const line of readLines(res.body)) {
      const delta = ai.provider === 'ollama' ? parseOllamaLine(line) : parseOpenAiLine(line)
      if (delta === null) continue
      if (delta === '__DONE__') break
      if (delta) {
        full += delta
        send(IPC.aiStreamDelta, { requestId, delta })
      }
    }
    send(IPC.aiStreamEnd, { requestId, content: full } satisfies ChatStreamEnd)
  } catch (err) {
    if (controller.signal.aborted) {
      send(IPC.aiStreamEnd, { requestId, content: full } satisfies ChatStreamEnd)
    } else {
      send(IPC.aiStreamError, {
        requestId,
        message: isConnectionError(err) ? friendlyOfflineMessage() : String((err as Error).message),
        offline: isConnectionError(err)
      } satisfies ChatStreamError)
    }
  } finally {
    controllers.delete(requestId)
  }
}

function chatRequest(
  messages: { role: string; content: string }[],
  temperature: number,
  signal: AbortSignal
): Promise<Response> {
  const { provider, model, maxTokens, topP } = getSettings().ai
  if (provider === 'ollama') {
    return fetch(`${baseUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: { temperature, num_predict: maxTokens, top_p: topP }
      })
    })
  }
  return fetch(`${baseUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: authHeaders(),
    signal,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
      top_p: topP
    })
  })
}

/** Returns delta text, '' to skip, null for non-data lines, '__DONE__' to stop. */
function parseOpenAiLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const payload = trimmed.slice(5).trim()
  if (payload === '[DONE]') return '__DONE__'
  try {
    const json = JSON.parse(payload)
    return json.choices?.[0]?.delta?.content ?? ''
  } catch {
    return null
  }
}

function parseOllamaLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const json = JSON.parse(trimmed)
    if (json.done) return json.message?.content ?? '__DONE__'
    return json.message?.content ?? ''
  } catch {
    return null
  }
}
