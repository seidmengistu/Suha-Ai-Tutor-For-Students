/**
 * Preload bridge. Exposes a single, typed `window.api` object to the renderer
 * via contextBridge. All privileged work happens in the main process; the
 * renderer only ever sees these safe wrappers.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/constants'
import type {
  AppSettings,
  ChatRequest,
  ChatStreamDelta,
  ChatStreamEnd,
  ChatStreamError,
  ChatStreamStart,
  GenerateLessonParams,
  GradeLevel,
  ImportBookRequest,
  NoteInput,
  PaperExamInput,
  QuizAttemptInput,
  QuizFilter,
  SubjectKey
} from '@shared/types'

const invoke = ipcRenderer.invoke.bind(ipcRenderer)

/** Subscribe to a main->renderer event and return an unsubscribe function. */
function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  app: {
    info: () => invoke(IPC.appInfo) as Promise<{ name: string; version: string; platform: string }>,
    openExternal: (url: string) => invoke(IPC.openExternal, url)
  },
  settings: {
    get: () => invoke(IPC.settingsGet) as Promise<AppSettings>,
    set: (patch: Partial<AppSettings>) => invoke(IPC.settingsSet, patch) as Promise<AppSettings>,
    reset: () => invoke(IPC.settingsReset) as Promise<AppSettings>
  },
  curriculum: {
    grades: () => invoke(IPC.gradesGet),
    subjects: (grade: GradeLevel) => invoke(IPC.subjectsGet, grade),
    chapters: (grade: GradeLevel, subject: SubjectKey) => invoke(IPC.chaptersGet, grade, subject),
    lessons: (chapterId: number) => invoke(IPC.lessonsGet, chapterId),
    lesson: (id: number) => invoke(IPC.lessonGet, id),
    generateLesson: (params: GenerateLessonParams) => invoke(IPC.lessonGenerate, params),
    detectChapters: (params: { gradeLevel: GradeLevel; subjectKey: SubjectKey; tocText: string }) =>
      invoke(IPC.chaptersDetect, params)
  },
  books: {
    list: (filter?: { gradeLevel?: GradeLevel; subjectKey?: SubjectKey }) =>
      invoke(IPC.booksList, filter),
    get: (id: number) => invoke(IPC.bookGet, id),
    data: (id: number) => invoke(IPC.bookData, id) as Promise<Uint8Array | null>,
    import: (req: ImportBookRequest) => invoke(IPC.bookImport, req),
    delete: (id: number) => invoke(IPC.bookDelete, id)
  },
  reading: {
    get: (bookId: number) => invoke(IPC.readingGet, bookId),
    set: (bookId: number, lastPage: number, totalPages: number) =>
      invoke(IPC.readingSet, bookId, lastPage, totalPages)
  },
  bookmarks: {
    list: (bookId: number) => invoke(IPC.bookmarksList, bookId),
    add: (bookId: number, page: number, label: string) =>
      invoke(IPC.bookmarkAdd, bookId, page, label),
    delete: (id: number) => invoke(IPC.bookmarkDelete, id)
  },
  notes: {
    list: (filter?: { gradeLevel?: GradeLevel; subjectKey?: SubjectKey; bookId?: number }) =>
      invoke(IPC.notesList, filter),
    create: (input: NoteInput) => invoke(IPC.noteCreate, input),
    update: (id: number, patch: Partial<NoteInput>) => invoke(IPC.noteUpdate, id, patch),
    delete: (id: number) => invoke(IPC.noteDelete, id),
    search: (q: string) => invoke(IPC.notesSearch, q)
  },
  quiz: {
    questions: (filter: QuizFilter) => invoke(IPC.questionsGet, filter),
    generate: (params: {
      gradeLevel: GradeLevel
      subjectKey: SubjectKey
      topic: string
      difficulty: string
      count: number
      chapterId?: number
      save?: boolean
    }) => invoke(IPC.questionsGenerate, params),
    save: (input: QuizAttemptInput) => invoke(IPC.quizSave, input),
    history: (grade?: GradeLevel) => invoke(IPC.quizHistory, grade),
    examYears: (grade?: GradeLevel, subject?: SubjectKey) => invoke(IPC.examYears, grade, subject),
    count: (grade?: GradeLevel, subject?: SubjectKey) => invoke(IPC.quizCount, grade, subject)
  },
  progress: {
    dashboard: (grade: GradeLevel) => invoke(IPC.dashboardGet, grade),
    record: (e: {
      type: string
      gradeLevel?: GradeLevel | null
      subjectKey?: SubjectKey | null
      lessonId?: number | null
      topic?: string | null
      value?: number
    }) => invoke(IPC.progressRecord, e),
    mastery: (grade: GradeLevel, subject?: SubjectKey) => invoke(IPC.masteryGet, grade, subject)
  },
  ai: {
    health: () => invoke(IPC.aiHealth),
    models: () => invoke(IPC.aiModels) as Promise<string[]>,
    embed: (texts: string[]) => invoke(IPC.aiEmbed, texts) as Promise<number[][]>,
    chat: (request: ChatRequest) => invoke(IPC.aiChatStart, request) as Promise<string>,
    stop: (requestId: string) => invoke(IPC.aiChatStop, requestId),
    onStart: (cb: (p: ChatStreamStart) => void) => on(IPC.aiStreamStart, cb),
    onDelta: (cb: (p: ChatStreamDelta) => void) => on(IPC.aiStreamDelta, cb),
    onEnd: (cb: (p: ChatStreamEnd) => void) => on(IPC.aiStreamEnd, cb),
    onError: (cb: (p: ChatStreamError) => void) => on(IPC.aiStreamError, cb)
  },
  rag: {
    status: () => invoke(IPC.ragStatus),
    query: (text: string, filter?: object) => invoke(IPC.ragQuery, text, filter),
    index: (bookId: number, pages: { page: number; text: string }[]) =>
      invoke(IPC.ragIndex, bookId, pages),
    reindexAll: () => invoke(IPC.ragReindexAll)
  },
  search: {
    global: (q: string) => invoke(IPC.searchGlobal, q)
  },
  admin: {
    export: () => invoke(IPC.adminExport),
    exportContent: () => invoke(IPC.adminExportContent),
    backup: () => invoke(IPC.adminBackup),
    restore: () => invoke(IPC.adminRestore),
    reseed: () => invoke(IPC.adminReseed)
  },
  exams: {
    pickFiles: () => invoke(IPC.examPickFiles),
    readFile: (path: string) => invoke(IPC.examReadFile, path),
    import: (params: {
      gradeLevel: GradeLevel
      subjectKey: SubjectKey
      examYear?: number | null
      source: string
      text: string
    }) => invoke(IPC.examImport, params),
    listFolder: () => invoke(IPC.examListFolder),
    importPaper: (params: {
      questionsPath: string
      answersPath?: string | null
      gradeLevel: GradeLevel
      subjectKey: SubjectKey
      examYear: number
    }) => invoke(IPC.examImportPaper, params)
  },
  paper: {
    pick: () => invoke(IPC.paperPick),
    add: (input: PaperExamInput) => invoke(IPC.paperAdd, input),
    list: (grade?: GradeLevel, subject?: SubjectKey) => invoke(IPC.paperList, grade, subject),
    data: (id: number) => invoke(IPC.paperData, id),
    delete: (id: number) => invoke(IPC.paperDelete, id),
    ocrText: (path: string) => invoke(IPC.paperOcrText, path),
    aiKey: (text: string) => invoke(IPC.paperAiKey, text),
    visionKey: (images: string[]) => invoke(IPC.paperVisionKey, images),
    exportPack: () => invoke(IPC.paperExportPack)
  }
}

export type SuhaApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore fallback when context isolation is disabled
  window.api = api
}
