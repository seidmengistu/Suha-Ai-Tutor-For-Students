/**
 * Registers every IPC handler, mapping channels (see @shared/constants) to the
 * main-process services. Streaming AI responses are pushed to the renderer via
 * webContents events; everything else is request/response over ipcMain.handle.
 */
import { app, dialog, ipcMain, shell } from 'electron'
import { randomUUID } from 'crypto'
import { execFileSync } from 'child_process'
import { readFileSync, existsSync, readdirSync, mkdtempSync, rmSync } from 'fs'
import { extname, join } from 'path'
import { tmpdir } from 'os'
import { IPC } from '@shared/constants'
import { subjectsForGrade } from '@shared/constants'
import { getSettings, saveSettings, resetSettings } from '../services/settings'
import {
  aiChat,
  aiComplete,
  aiEmbed,
  aiHealth,
  aiModels,
  aiStop,
  aiVision
} from '../services/ai'
import { ragIndexBook, ragRetrieve, ragStatus } from '../services/rag'
import {
  deleteBook,
  getBook,
  getBookData,
  importBook,
  listBooks
} from '../services/books'
import {
  addBookmark,
  createNote,
  deleteBookmark,
  deleteNote,
  getChapters,
  getDashboard,
  getGrades,
  getLesson,
  getLessons,
  getMastery,
  getReading,
  getQuestions,
  insertQuestions,
  listBookmarks,
  listNotes,
  quizHistory,
  recordEvent,
  saveQuizAttempt,
  searchGlobal,
  searchNotes,
  setReading,
  updateNote,
  checkAchievements,
  saveGeneratedLesson,
  getExamYears,
  countQuestions
} from '../services/repository'
import { backup, exportContentPack, exportDatabase, reseed, restore } from '../services/admin'
import {
  pickPaperPdf,
  addPaperExam,
  listPaperExams,
  getPaperExamData,
  deletePaperExam,
  exportPaperExams
} from '../services/paperExams'
import type {
  ChatRequest,
  Difficulty,
  GenerateLessonParams,
  GeneratedLessonResult,
  GradeLevel,
  LessonSection,
  PaperExamInput,
  Question,
  SubjectKey
} from '@shared/types'

/** Wrap a handler so thrown errors return a structured, loggable message. */
function handle<T>(channel: string, fn: (...args: any[]) => T | Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await fn(...args)
    } catch (err) {
      console.error(`[ipc] ${channel} failed:`, err)
      throw err
    }
  })
}

export function registerIpc(): void {
  /* ---- app ---- */
  handle(IPC.appInfo, () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform
  }))
  handle(IPC.openExternal, (url: string) => shell.openExternal(url))

  /* ---- settings ---- */
  handle(IPC.settingsGet, () => getSettings())
  handle(IPC.settingsSet, (patch) => saveSettings(patch))
  handle(IPC.settingsReset, () => resetSettings())

  /* ---- curriculum ---- */
  handle(IPC.gradesGet, () => getGrades())
  handle(IPC.subjectsGet, (grade: GradeLevel) => subjectsForGrade(grade))
  handle(IPC.chaptersGet, (grade: GradeLevel, subject: SubjectKey) => getChapters(grade, subject))
  handle(IPC.lessonsGet, (chapterId: number) => getLessons(chapterId))
  handle(IPC.lessonGet, (id: number) => getLesson(id))
  handle(IPC.lessonGenerate, (params: GenerateLessonParams) => generateLesson(params))
  handle(
    IPC.chaptersDetect,
    (params: { gradeLevel: GradeLevel; subjectKey: SubjectKey; tocText: string }) =>
      detectChapters(params)
  )

  /* ---- books ---- */
  handle(IPC.booksList, (filter) => listBooks(filter ?? {}))
  handle(IPC.bookGet, (id: number) => getBook(id))
  handle(IPC.bookData, (id: number) => getBookData(id))
  handle(IPC.bookImport, async (req) => {
    const result = await importBook(req)
    if (result.ok) checkAchievements()
    return result
  })
  handle(IPC.bookDelete, (id: number) => {
    deleteBook(id)
    return { ok: true }
  })

  /* ---- reading & bookmarks ---- */
  handle(IPC.readingGet, (bookId: number) => getReading(bookId))
  handle(IPC.readingSet, (bookId: number, lastPage: number, totalPages: number) => {
    setReading(bookId, lastPage, totalPages)
    return { ok: true }
  })
  handle(IPC.bookmarksList, (bookId: number) => listBookmarks(bookId))
  handle(IPC.bookmarkAdd, (bookId: number, page: number, label: string) =>
    addBookmark(bookId, page, label)
  )
  handle(IPC.bookmarkDelete, (id: number) => {
    deleteBookmark(id)
    return { ok: true }
  })

  /* ---- notes ---- */
  handle(IPC.notesList, (filter) => listNotes(filter ?? {}))
  handle(IPC.noteCreate, (input) => {
    const note = createNote(input)
    checkAchievements()
    return note
  })
  handle(IPC.noteUpdate, (id: number, patch) => updateNote(id, patch))
  handle(IPC.noteDelete, (id: number) => {
    deleteNote(id)
    return { ok: true }
  })
  handle(IPC.notesSearch, (q: string) => searchNotes(q))

  /* ---- quiz ---- */
  handle(IPC.questionsGet, (filter) => getQuestions(filter ?? {}))
  handle(IPC.questionsGenerate, (params) => generateQuestions(params))
  handle(IPC.quizSave, (input) => saveQuizAttempt(input))
  handle(IPC.quizHistory, (grade?: GradeLevel) => quizHistory(grade))
  handle(IPC.examYears, (grade?: GradeLevel, subject?: SubjectKey) => getExamYears(grade, subject))
  handle(IPC.quizCount, (grade?: GradeLevel, subject?: SubjectKey) => countQuestions(grade, subject))
  handle(IPC.examPickFiles, () => pickExamFiles())
  handle(IPC.examReadFile, (path: string) => readPdfBytes(path))
  handle(IPC.examImport, (params: ImportExamParams) => importExamFromText(params))
  handle(IPC.examListFolder, () => listExamFolder())
  handle(IPC.examImportPaper, (params: ImportPaperParams) => importExamPaper(params))
  handle(IPC.paperPick, () => pickPaperPdf())
  handle(IPC.paperAdd, (input: PaperExamInput) => addPaperExam(input))
  handle(IPC.paperList, (grade?: GradeLevel, subject?: SubjectKey) => listPaperExams(grade, subject))
  handle(IPC.paperData, (id: number) => getPaperExamData(id))
  handle(IPC.paperDelete, (id: number) => {
    deletePaperExam(id)
    return { ok: true }
  })
  handle(IPC.paperOcrText, (path: string) => {
    if (!tesseractAvailable()) return { text: '', hasOcr: false }
    try {
      return { text: ocrPdfToText(path), hasOcr: true }
    } catch {
      return { text: '', hasOcr: true }
    }
  })
  handle(IPC.paperAiKey, (text: string) => aiExtractKey(text))
  handle(IPC.paperVisionKey, (images: string[]) => aiExtractKeyFromImages(images))
  handle(IPC.paperExportPack, () => {
    const r = exportPaperExams()
    return {
      ok: true,
      path: r.dir,
      message: `Exported ${r.count} paper exam${r.count === 1 ? '' : 's'} to ${r.dir}. Rebuild to ship them to all users.`
    }
  })

  /* ---- progress ---- */
  handle(IPC.dashboardGet, (grade: GradeLevel) => getDashboard(grade))
  handle(IPC.progressRecord, (e) => {
    recordEvent(e)
    return { ok: true }
  })
  handle(IPC.masteryGet, (grade: GradeLevel, subject?: SubjectKey) => getMastery(grade, subject))

  /* ---- AI ---- */
  handle(IPC.aiHealth, () => aiHealth())
  handle(IPC.aiModels, async () => {
    try {
      return await aiModels()
    } catch {
      return []
    }
  })
  handle(IPC.aiEmbed, (texts: string[]) => aiEmbed(texts))
  handle(IPC.aiChatStop, (requestId: string) => {
    aiStop(requestId)
    return { ok: true }
  })
  ipcMain.handle(IPC.aiChatStart, (event, request: ChatRequest) => {
    const requestId = randomUUID()
    const send = (channel: string, payload: unknown): void => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, payload)
    }
    // Kick off retrieval + streaming in the background; return the id immediately.
    void (async () => {
      let sources: Awaited<ReturnType<typeof ragRetrieve>> = []
      if (request.useRag) {
        try {
          sources = await ragRetrieve(lastUserText(request), {
            gradeLevel: request.context?.gradeLevel,
            subjectKey: request.context?.subjectKey,
            bookId: request.context?.bookId
          })
        } catch (err) {
          console.error('[ipc] RAG retrieval failed:', err)
        }
      }
      await aiChat({ requestId, request, sources, send })
      recordEvent({
        type: 'ai-chat',
        gradeLevel: request.context?.gradeLevel ?? null,
        subjectKey: request.context?.subjectKey ?? null,
        value: 1
      })
    })()
    return requestId
  })

  /* ---- RAG ---- */
  handle(IPC.ragStatus, () => ragStatus())
  handle(IPC.ragQuery, (query: string, filter) => ragRetrieve(query, filter ?? {}))
  handle(IPC.ragIndex, (bookId: number, pages) => ragIndexBook(bookId, pages))
  handle(IPC.ragReindexAll, () => ragStatus())

  /* ---- search ---- */
  handle(IPC.searchGlobal, (q: string) => searchGlobal(q))

  /* ---- admin ---- */
  handle(IPC.adminExport, () => exportDatabase())
  handle(IPC.adminExportContent, () => exportContentPack())
  handle(IPC.adminBackup, () => backup())
  handle(IPC.adminReseed, () => reseed())
  handle(IPC.adminRestore, async () => {
    const result = await restore()
    if (result.ok) {
      setTimeout(() => {
        app.relaunch()
        app.exit(0)
      }, 1500)
    }
    return result
  })
}

function lastUserText(request: ChatRequest): string {
  const lastUser = [...request.messages].reverse().find((m) => m.role === 'user')
  const selected = request.context?.selectedText
  return [selected, lastUser?.content].filter(Boolean).join('\n').slice(0, 2000)
}

/* ------------------------------------------------------------------ */
/* AI question generation                                              */
/* ------------------------------------------------------------------ */

interface GenerateParams {
  gradeLevel: GradeLevel
  subjectKey: SubjectKey
  topic: string
  difficulty: Difficulty
  count: number
  chapterId?: number
  save?: boolean
}

function normText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

async function generateQuestions(params: GenerateParams): Promise<Question[]> {
  const count = Math.min(Math.max(params.count ?? 5, 1), 20)
  const system =
    'You are a meticulous Ethiopian-curriculum exam writer. Output ONLY a JSON array, no prose. Answer-key accuracy is critical.'
  // The model gives the correct answer as TEXT (not an index) — we derive the
  // index ourselves, which removes the common index/option mismatch error.
  const user = `Write ${count} ${params.difficulty} multiple-choice questions for Grade ${params.gradeLevel} ${params.subjectKey} on "${params.topic}".
For each item output exactly:
{"prompt": string, "options": [four distinct strings], "correctAnswer": "<the exact text of the ONE correct option, copied verbatim from options>", "explanation": string, "topic": "${params.topic}"}
Strict rules:
- EXACTLY ONE option is correct; the other three must be clearly, verifiably WRONG — never alternative correct answers.
- "correctAnswer" MUST be character-for-character identical to one of the options.
- The explanation must justify that correct option and must NOT contradict it.
- Avoid ambiguous "which is equivalent / which is true" items unless only one option qualifies.
- Solve each question yourself and double-check the key before writing it.
Return strictly valid JSON.`

  const raw = await aiComplete(
    [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    0.3
  )

  const parsed = extractJsonArray(raw)
  const built: Omit<Question, 'id'>[] = []
  for (const p of parsed as any[]) {
    const options = Array.isArray(p.options) ? p.options.map((o: unknown) => String(o).trim()) : []
    const correct = String(p.correctAnswer ?? p.answer ?? '').trim()
    let idx = options.findIndex((o: string) => o === correct)
    if (idx < 0) idx = options.findIndex((o: string) => normText(o) === normText(correct))
    if (idx < 0 && /^[0-3]$/.test(correct)) idx = Number(correct)
    const prompt = String(p.prompt ?? '').trim()
    const distinct = new Set(options.map(normText)).size === options.length
    if (idx < 0 || options.length !== 4 || !distinct || !prompt) continue
    built.push({
      subjectKey: params.subjectKey,
      gradeLevel: params.gradeLevel,
      chapterId: params.chapterId ?? null,
      lessonId: null,
      topic: String(p.topic ?? params.topic),
      difficulty: params.difficulty,
      type: 'mcq',
      prompt,
      options,
      answer: String(idx),
      explanation: String(p.explanation ?? ''),
      source: 'ai'
    })
  }

  const verified = await verifyQuestions(built)

  if (params.save !== false && verified.length) insertQuestions(verified)
  // Return with synthetic ids for immediate use (negative => not persisted ref).
  return verified.map((q, i) => ({ ...q, id: -(i + 1) }))
}

/**
 * Second-pass answer-key check: an independent solve of each question. Drops
 * items the checker marks ambiguous/flawed or whose key it disagrees with. If
 * the checker output looks unreliable, the originals are kept (no over-pruning).
 */
async function verifyQuestions(items: Omit<Question, 'id'>[]): Promise<Omit<Question, 'id'>[]> {
  if (items.length === 0) return items
  const list = items
    .map(
      (q, i) =>
        `${i + 1}. ${q.prompt}\n` +
        q.options.map((o, j) => `   ${String.fromCharCode(65 + j)}. ${o}`).join('\n')
    )
    .join('\n\n')
  const user = `For each numbered question, work out the single correct option yourself. Output ONLY a JSON array: [{"n": number, "letter": "A"|"B"|"C"|"D", "single": boolean}], where "single" is false when zero or more than one option is correct (a flawed or ambiguous question).

${list}`
  let verdicts: any[]
  try {
    verdicts = extractJsonArray(
      await aiComplete(
        [
          { role: 'system', content: 'You are a strict answer-key checker. Output ONLY a JSON array.' },
          { role: 'user', content: user }
        ],
        0.1
      )
    )
  } catch {
    return items
  }
  const byN = new Map<number, { idx: number; single: boolean }>()
  for (const v of verdicts) {
    const n = Number(v?.n)
    const letter = String(v?.letter ?? '').trim().toUpperCase()
    if (n >= 1 && /^[A-D]$/.test(letter)) byN.set(n, { idx: letter.charCodeAt(0) - 65, single: v?.single !== false })
  }
  if (byN.size < Math.ceil(items.length / 2)) return items // checker unreliable → keep all
  return items.filter((q, i) => {
    const v = byN.get(i + 1)
    if (!v) return true // no verdict → keep
    if (!v.single) return false // flagged ambiguous/flawed → drop
    return v.idx === Number(q.answer) // keep only when the checker agrees with the key
  })
}

/* ------------------------------------------------------------------ */
/* Exam-paper import pipeline                                          */
/* ------------------------------------------------------------------ */

interface ImportExamParams {
  gradeLevel: GradeLevel
  subjectKey: SubjectKey
  examYear?: number | null
  source: string
  /** Plain text extracted from the exam PDF (by the renderer or OCR). */
  text: string
  /** Optional OCR text of the official answer sheet, used to set correct keys. */
  answersText?: string
}

interface ImportPaperParams {
  questionsPath: string
  answersPath?: string | null
  gradeLevel: GradeLevel
  subjectKey: SubjectKey
  examYear: number
}

async function pickExamFiles(): Promise<string[]> {
  const r = await dialog.showOpenDialog({
    title: 'Select exam paper PDF(s)',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile', 'multiSelections']
  })
  return r.canceled ? [] : r.filePaths
}

function readPdfBytes(path: string): Uint8Array | null {
  if (!path || extname(path).toLowerCase() !== '.pdf' || !existsSync(path)) return null
  try {
    return new Uint8Array(readFileSync(path))
  } catch {
    return null
  }
}

function chunkText(text: string, size: number): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out.filter((c) => c.trim().length > 60)
}

/**
 * Turn the extracted text of a (permitted) exam paper into structured,
 * metadata-tagged MCQs in the bank. The paper's own answer key is trusted; we
 * keep only complete, well-formed items (four distinct options, a resolvable key).
 */
async function importExamFromText(p: ImportExamParams): Promise<{ imported: number }> {
  const chunks = chunkText(p.text, 6000)
  let imported = 0
  for (const chunk of chunks) {
    const system =
      'You convert exam-paper text into clean structured multiple-choice questions. Output ONLY a JSON array.'
    const user = `Extract every complete multiple-choice question from this Grade ${p.gradeLevel} ${p.subjectKey} exam text.
For each output: {"prompt": string, "options": [four strings], "correctAnswer": "<exact text of the correct option>", "explanation": string, "topic": string}
Rules:
- Include ONLY complete MCQs that have four options; skip reading passages, instructions, and partial/non-MCQ items.
- Exactly one option is correct. Use the OFFICIAL ANSWER KEY below (when provided) to set the correct option; otherwise solve it.
- "correctAnswer" must be character-for-character one of the options.
- Return [] if there is no usable MCQ.
Return strictly valid JSON.
${p.answersText ? `\nOFFICIAL ANSWER KEY (map question numbers to option letters; OCR text may be noisy):\n"""\n${p.answersText.slice(0, 4000)}\n"""\n` : ''}
EXAM TEXT:
"""
${chunk}
"""`
    let parsed: any[]
    try {
      parsed = extractJsonArray(
        await aiComplete([{ role: 'system', content: system }, { role: 'user', content: user }], 0.2)
      )
    } catch {
      continue
    }
    const built: Omit<Question, 'id'>[] = []
    for (const q of parsed) {
      const options = Array.isArray(q.options) ? q.options.map((o: unknown) => String(o).trim()) : []
      const correct = String(q.correctAnswer ?? q.answer ?? '').trim()
      let idx = options.findIndex((o: string) => o === correct)
      if (idx < 0) idx = options.findIndex((o: string) => normText(o) === normText(correct))
      if (idx < 0 && /^[0-3]$/.test(correct)) idx = Number(correct)
      const prompt = String(q.prompt ?? '').trim()
      const distinct = new Set(options.map(normText)).size === options.length
      if (idx < 0 || options.length !== 4 || !distinct || !prompt) continue
      built.push({
        subjectKey: p.subjectKey,
        gradeLevel: p.gradeLevel,
        chapterId: null,
        lessonId: null,
        topic: String(q.topic ?? '').trim(),
        difficulty: 'exam',
        type: 'mcq',
        prompt,
        options,
        answer: String(idx),
        explanation: String(q.explanation ?? ''),
        source: p.source || 'exam',
        examYear: p.examYear ?? null
      })
    }
    if (built.length) imported += insertQuestions(built)
  }
  return { imported }
}

/* ---- OCR + folder batch (for scanned exam papers) ---- */

/** Map a filename subject token to an app subject, or null if unsupported. */
function mapExamSubject(raw: string): SubjectKey | null {
  const s = raw.toLowerCase()
  if (s.startsWith('math')) return 'mathematics'
  if (['english', 'physics', 'chemistry', 'biology'].includes(s)) return s as SubjectKey
  return null // e.g. civics — not a subject this app teaches
}

function tesseractAvailable(): boolean {
  try {
    execFileSync('tesseract', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** OCR a scanned PDF to text via poppler (pdftoppm) + tesseract. */
function ocrPdfToText(path: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'suha-ocr-'))
  try {
    execFileSync('pdftoppm', ['-png', '-r', '200', path, join(dir, 'page')], { stdio: 'ignore' })
    const pages = readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.png'))
      .sort((a, b) => (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0))
    let text = ''
    for (const png of pages) {
      try {
        text += execFileSync('tesseract', [join(dir, png), 'stdout'], {
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024
        })
      } catch {
        /* skip unreadable page */
      }
      text += '\n'
    }
    return text
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

/** Let the user pick a folder of exam papers; pair questions with answer keys. */
async function listExamFolder(): Promise<{
  dir: string
  hasOcr: boolean
  items: { questionsPath: string; answersPath: string | null; subjectKey: SubjectKey; examYear: number; name: string }[]
}> {
  const r = await dialog.showOpenDialog({
    title: 'Select the exam-papers folder',
    properties: ['openDirectory']
  })
  if (r.canceled || !r.filePaths[0]) return { dir: '', hasOcr: tesseractAvailable(), items: [] }
  const dir = r.filePaths[0]
  const items: {
    questionsPath: string
    answersPath: string | null
    subjectKey: SubjectKey
    examYear: number
    name: string
  }[] = []
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) {
        walk(p)
        continue
      }
      const m = e.name.match(/^([a-zA-Z]+)[-_](\d{4})[-_]questions\.pdf$/)
      if (!m) continue
      const subj = mapExamSubject(m[1])
      if (!subj) continue
      const ans = p.replace(/-questions\.pdf$/i, '-answers.pdf')
      items.push({
        questionsPath: p,
        answersPath: existsSync(ans) ? ans : null,
        subjectKey: subj,
        examYear: Number(m[2]),
        name: e.name
      })
    }
  }
  try {
    walk(dir)
  } catch {
    /* ignore */
  }
  items.sort((a, b) => a.name.localeCompare(b.name))
  return { dir, hasOcr: tesseractAvailable(), items }
}

/** OCR a paper (and its answer key), then structure + insert. */
async function importExamPaper(p: ImportPaperParams): Promise<{ imported: number }> {
  if (!tesseractAvailable()) throw new Error('TESSERACT_MISSING')
  const text = ocrPdfToText(p.questionsPath)
  if (text.trim().length < 80) return { imported: 0 }
  const answersText = p.answersPath ? ocrPdfToText(p.answersPath) : ''
  return importExamFromText({
    gradeLevel: p.gradeLevel,
    subjectKey: p.subjectKey,
    examYear: p.examYear,
    source: `National Exam ${p.examYear}`,
    text,
    answersText
  })
}

/** Extract a paper exam's answer key (letters only) from raw/OCR text via AI. */
async function aiExtractKey(text: string): Promise<{ n: number; answer: string }[]> {
  if (!text || text.trim().length < 2) return []
  const raw = await aiComplete(
    [
      { role: 'system', content: 'You extract exam answer keys. Output ONLY a JSON array.' },
      {
        role: 'user',
        content: `From the text below (possibly noisy OCR of an answer sheet), extract the answer key as [{"n": number, "answer": "A"|"B"|"C"|"D"}]. Include every question number you can identify, in order. Return strictly valid JSON.

TEXT:
"""
${text.slice(0, 6000)}
"""`
      }
    ],
    0.1
  )
  return extractJsonArray(raw)
    .map((v: any) => ({ n: Number(v?.n), answer: String(v?.answer ?? '').trim().toUpperCase() }))
    .filter((v) => v.n >= 1 && /^[A-D]$/.test(v.answer))
    .sort((a, b) => a.n - b.n)
}

/** Read an answer key directly from answer-sheet page images via a vision model. */
async function aiExtractKeyFromImages(images: string[]): Promise<{ n: number; answer: string }[]> {
  if (!images.length) return []
  const prompt =
    'This image is the answer sheet of a multiple-choice exam. Output ONLY a JSON array [{"n": number, "answer": "A"|"B"|"C"|"D"}] giving the correct option for each question number you can read. Include every question, in order.'
  const raw = await aiVision(prompt, images)
  return extractJsonArray(raw)
    .map((v: any) => ({ n: Number(v?.n), answer: String(v?.answer ?? '').trim().toUpperCase() }))
    .filter((v) => v.n >= 1 && /^[A-D]$/.test(v.answer))
    .sort((a, b) => a.n - b.n)
}

/* ------------------------------------------------------------------ */
/* AI lesson generation (from textbook excerpts)                       */
/* ------------------------------------------------------------------ */

const ALLOWED_SECTION_TYPES = new Set([
  'introduction', 'objectives', 'theory', 'worked-example', 'visual', 'notes',
  'common-mistakes', 'memory-tips', 'practice', 'revision', 'summary', 'glossary', 'exam-tips'
])

async function generateLesson(p: GenerateLessonParams): Promise<GeneratedLessonResult> {
  const system =
    'You are an expert Ethiopian-curriculum teacher and textbook author. Output ONLY one JSON object, no markdown fences or commentary.'
  const user = `You are writing one lesson for Grade ${p.gradeLevel} ${p.subjectKey}, based strictly on the textbook excerpt below (rough section hint: "${p.chapterTitle}").

Return JSON exactly:
{"title": string, "summary": string, "estimatedMinutes": number, "sections": [{"type": string, "title": string, "body": string}], "flashcards": [{"front": string, "back": string}]}

"title" must be a short, clear, human-readable chapter title derived from the content (e.g. "Unit 3: Forces and Motion") — never a file code. Use these section types in this order: introduction, objectives, theory, worked-example, common-mistakes, memory-tips, practice, summary. "body" is Markdown. Keep bodies concise and clear for students. Do not invent facts beyond the excerpt. Provide 5 flashcards.

TEXTBOOK EXCERPT:
"""
${p.sourceText.slice(0, 6000)}
"""`

  const raw = await aiComplete(
    [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    0.5
  )
  const obj = extractJsonObject(raw)
  if (!obj || !Array.isArray(obj.sections)) throw new Error('The AI did not return a valid lesson.')

  const sections = (obj.sections as any[])
    .filter((s) => s && ALLOWED_SECTION_TYPES.has(s.type) && s.body)
    .map((s) => ({
      type: s.type as LessonSection['type'],
      title: String(s.title || s.type),
      body: String(s.body)
    }))
  if (!sections.length) throw new Error('No usable lesson sections were generated.')

  const flashcards = Array.isArray(obj.flashcards)
    ? (obj.flashcards as any[])
        .filter((f) => f && f.front && f.back)
        .map((f) => ({ front: String(f.front), back: String(f.back) }))
    : []

  // Prefer the AI's content-derived title over the (often code-like) PDF hint.
  const title = String(obj.title ?? '').trim() || p.chapterTitle
  const res = saveGeneratedLesson({
    gradeLevel: p.gradeLevel,
    subjectKey: p.subjectKey,
    chapterTitle: title,
    description: `Generated from ${p.bookTitle}`,
    orderIndex: p.orderIndex,
    summary: String(obj.summary ?? ''),
    estimatedMinutes: Number(obj.estimatedMinutes) || 15,
    sections,
    flashcards
  })
  return { ...res, title }
}

/** Ask the AI to extract the real chapter/unit titles from the table of contents. */
async function detectChapters(p: {
  gradeLevel: GradeLevel
  subjectKey: SubjectKey
  tocText: string
}): Promise<string[]> {
  const raw = await aiComplete(
    [
      { role: 'system', content: 'Output ONLY a JSON array of strings.' },
      {
        role: 'user',
        content: `Below is the table of contents / opening pages of a Grade ${p.gradeLevel} ${p.subjectKey} textbook. List the main chapter or unit titles in order as a JSON array of strings (for example ["Unit 1: Integers", "Unit 2: Fractions"]). Use the real titles from the book. Exclude the preface, acknowledgements, the "Contents" heading itself, the index, and answer keys.

TEXT:
"""
${p.tocText.slice(0, 5000)}
"""`
      }
    ],
    0.2
  )
  return extractJsonArray(raw)
    .filter((t: unknown) => typeof t === 'string' && (t as string).trim().length > 1)
    .map((t: string) => t.trim())
    .slice(0, 40)
}

function extractJsonObject(raw: string): any {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

/** Tolerantly pull a JSON array out of a model response. */
function extractJsonArray(raw: string): any[] {
  let text = raw.trim()
  // Strip ```json fences if present.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
}
