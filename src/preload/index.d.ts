/**
 * Ambient declaration of the `window.api` surface exposed by the preload bridge.
 * Hand-authored (rather than `typeof api`) so the renderer gets precise return
 * types for every call.
 */
import type {
  ActionResult,
  AiHealth,
  AppSettings,
  BackupResult,
  Book,
  Bookmark,
  Chapter,
  ChatRequest,
  ChatStreamDelta,
  ChatStreamEnd,
  ChatStreamError,
  ChatStreamStart,
  DashboardData,
  Difficulty,
  GenerateLessonParams,
  GeneratedLessonResult,
  Grade,
  GradeLevel,
  ImportBookRequest,
  ImportBookResult,
  Lesson,
  Note,
  NoteInput,
  PaperExam,
  PaperExamInput,
  ProgressEventType,
  Question,
  QuizAttempt,
  QuizAttemptInput,
  QuizFilter,
  ReadingProgress,
  RagChunk,
  RagStatus,
  SearchResult,
  Subject,
  SubjectKey,
  TopicMastery
} from '@shared/types'

export interface SuhaApi {
  app: {
    info(): Promise<{ name: string; version: string; platform: string }>
    openExternal(url: string): Promise<void>
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
    reset(): Promise<AppSettings>
  }
  curriculum: {
    grades(): Promise<Grade[]>
    subjects(grade: GradeLevel): Promise<Subject[]>
    chapters(grade: GradeLevel, subject: SubjectKey): Promise<Chapter[]>
    lessons(chapterId: number): Promise<Lesson[]>
    lesson(id: number): Promise<Lesson | null>
    generateLesson(params: GenerateLessonParams): Promise<GeneratedLessonResult>
    detectChapters(params: {
      gradeLevel: GradeLevel
      subjectKey: SubjectKey
      tocText: string
    }): Promise<string[]>
  }
  books: {
    list(filter?: { gradeLevel?: GradeLevel; subjectKey?: SubjectKey }): Promise<Book[]>
    get(id: number): Promise<Book | null>
    data(id: number): Promise<Uint8Array | null>
    import(req: ImportBookRequest): Promise<ImportBookResult>
    delete(id: number): Promise<ActionResult>
  }
  reading: {
    get(bookId: number): Promise<ReadingProgress | null>
    set(bookId: number, lastPage: number, totalPages: number): Promise<ActionResult>
  }
  bookmarks: {
    list(bookId: number): Promise<Bookmark[]>
    add(bookId: number, page: number, label: string): Promise<Bookmark>
    delete(id: number): Promise<ActionResult>
  }
  notes: {
    list(filter?: {
      gradeLevel?: GradeLevel
      subjectKey?: SubjectKey
      bookId?: number
    }): Promise<Note[]>
    create(input: NoteInput): Promise<Note>
    update(id: number, patch: Partial<NoteInput>): Promise<Note | null>
    delete(id: number): Promise<ActionResult>
    search(q: string): Promise<Note[]>
  }
  quiz: {
    questions(filter: QuizFilter): Promise<Question[]>
    generate(params: {
      gradeLevel: GradeLevel
      subjectKey: SubjectKey
      topic: string
      difficulty: Difficulty
      count: number
      chapterId?: number
      save?: boolean
    }): Promise<Question[]>
    save(input: QuizAttemptInput): Promise<QuizAttempt>
    history(grade?: GradeLevel): Promise<QuizAttempt[]>
    examYears(grade?: GradeLevel, subject?: SubjectKey): Promise<number[]>
    count(grade?: GradeLevel, subject?: SubjectKey): Promise<number>
  }
  progress: {
    dashboard(grade: GradeLevel): Promise<DashboardData>
    record(e: {
      type: ProgressEventType
      gradeLevel?: GradeLevel | null
      subjectKey?: SubjectKey | null
      lessonId?: number | null
      topic?: string | null
      value?: number
    }): Promise<ActionResult>
    mastery(grade: GradeLevel, subject?: SubjectKey): Promise<TopicMastery[]>
  }
  ai: {
    health(): Promise<AiHealth>
    models(): Promise<string[]>
    embed(texts: string[]): Promise<number[][]>
    chat(request: ChatRequest): Promise<string>
    stop(requestId: string): Promise<ActionResult>
    onStart(cb: (p: ChatStreamStart) => void): () => void
    onDelta(cb: (p: ChatStreamDelta) => void): () => void
    onEnd(cb: (p: ChatStreamEnd) => void): () => void
    onError(cb: (p: ChatStreamError) => void): () => void
  }
  rag: {
    status(): Promise<RagStatus>
    query(
      text: string,
      filter?: { gradeLevel?: GradeLevel; subjectKey?: SubjectKey; bookId?: number; k?: number }
    ): Promise<RagChunk[]>
    index(bookId: number, pages: { page: number; text: string }[]): Promise<RagStatus>
    reindexAll(): Promise<RagStatus>
  }
  search: {
    global(q: string): Promise<SearchResult[]>
  }
  admin: {
    export(): Promise<BackupResult>
    exportContent(): Promise<BackupResult>
    backup(): Promise<BackupResult>
    restore(): Promise<BackupResult>
    reseed(): Promise<BackupResult>
  }
  exams: {
    pickFiles(): Promise<string[]>
    readFile(path: string): Promise<Uint8Array | null>
    import(params: {
      gradeLevel: GradeLevel
      subjectKey: SubjectKey
      examYear?: number | null
      source: string
      text: string
    }): Promise<{ imported: number }>
    listFolder(): Promise<{
      dir: string
      hasOcr: boolean
      items: {
        questionsPath: string
        answersPath: string | null
        subjectKey: SubjectKey
        examYear: number
        name: string
      }[]
    }>
    importPaper(params: {
      questionsPath: string
      answersPath?: string | null
      gradeLevel: GradeLevel
      subjectKey: SubjectKey
      examYear: number
    }): Promise<{ imported: number }>
  }
  paper: {
    pick(): Promise<string | null>
    add(input: PaperExamInput): Promise<PaperExam>
    list(grade?: GradeLevel, subject?: SubjectKey): Promise<PaperExam[]>
    data(id: number): Promise<Uint8Array | null>
    delete(id: number): Promise<ActionResult>
    ocrText(path: string): Promise<{ text: string; hasOcr: boolean }>
    aiKey(text: string): Promise<{ n: number; answer: string }[]>
    visionKey(images: string[]): Promise<{ n: number; answer: string }[]>
    exportPack(): Promise<ActionResult>
  }
}

declare global {
  interface Window {
    api: SuhaApi
  }
}

export {}
