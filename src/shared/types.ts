/**
 * Shared type contract for Suha AI Tutor.
 *
 * These types are the single source of truth shared across the Electron main
 * process, the preload bridge and the React renderer. Keep them dependency-free
 * (no imports) so they can be safely bundled into every layer.
 */

/* ------------------------------------------------------------------ */
/* Curriculum                                                          */
/* ------------------------------------------------------------------ */

export type GradeLevel = 7 | 8 | 9 | 10 | 11 | 12

/** Stable machine keys for subjects (used in routes, files and the DB). */
export type SubjectKey =
  | 'english'
  | 'mathematics'
  | 'general-science'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'earth-science'
  | 'aptitude'

export interface Subject {
  key: SubjectKey
  name: string
  description: string
  /** lucide-react icon name rendered in the UI. */
  icon: string
  /** Tailwind gradient token used for the subject card. */
  color: string
  /** Sub-strands shown for composite subjects such as General Science. */
  strands?: string[]
  /** Whether an official Ethiopian textbook exists (Aptitude does not). */
  hasTextbook: boolean
}

export interface Grade {
  level: GradeLevel
  label: string
  subjects: Subject[]
}

export interface Chapter {
  id: number
  subjectKey: SubjectKey
  gradeLevel: GradeLevel
  orderIndex: number
  title: string
  description: string
  lessonCount?: number
}

/** A single block inside a lesson, following the fixed teaching structure. */
export interface LessonSection {
  type:
    | 'introduction'
    | 'objectives'
    | 'theory'
    | 'worked-example'
    | 'visual'
    | 'notes'
    | 'common-mistakes'
    | 'memory-tips'
    | 'practice'
    | 'revision'
    | 'summary'
    | 'glossary'
    | 'exam-tips'
  title: string
  /** Markdown body. */
  body: string
  /** Optional visualization descriptor rendered by the viz components. */
  visual?: VisualSpec
  /** Glossary entries when type === 'glossary'. */
  glossary?: { term: string; definition: string }[]
}

export interface Lesson {
  id: number
  chapterId: number
  subjectKey: SubjectKey
  gradeLevel: GradeLevel
  orderIndex: number
  title: string
  summary: string
  estimatedMinutes: number
  sections: LessonSection[]
  flashcards?: Flashcard[]
}

export interface Flashcard {
  front: string
  back: string
}

/** Request to generate a lesson from a textbook chapter excerpt via local AI. */
export interface GenerateLessonParams {
  gradeLevel: GradeLevel
  subjectKey: SubjectKey
  bookTitle: string
  chapterTitle: string
  orderIndex: number
  sourceText: string
}

export interface GeneratedLessonResult {
  chapterId: number
  lessonId: number
  title: string
}

/* ------------------------------------------------------------------ */
/* Visualizations                                                      */
/* ------------------------------------------------------------------ */

export type VisualKind =
  | 'function-graph'
  | 'number-line'
  | 'coordinate-plane'
  | 'geometry'
  | 'bar-chart'
  | 'free-body'
  | 'motion-graph'
  | 'circuit'
  | 'atom'
  | 'molecule'
  | 'reaction'
  | 'cell'
  | 'timeline'
  | 'tree'

export interface VisualSpec {
  kind: VisualKind
  title?: string
  caption?: string
  /** Free-form data interpreted by the matching viz component. */
  data: Record<string, unknown>
}

/* ------------------------------------------------------------------ */
/* Books & Reader                                                      */
/* ------------------------------------------------------------------ */

export interface Book {
  id: number
  title: string
  gradeLevel: GradeLevel
  subjectKey: SubjectKey
  filePath: string
  pageCount: number
  importedAt: string
  /** 0 = not indexed, 1 = indexed for RAG. */
  indexed: 0 | 1
  chunkCount?: number
}

export interface ReadingProgress {
  bookId: number
  lastPage: number
  totalPages: number
  updatedAt: string
}

export interface Bookmark {
  id: number
  bookId: number
  page: number
  label: string
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

export interface Note {
  id: number
  title: string
  body: string
  color: string
  gradeLevel: GradeLevel | null
  subjectKey: SubjectKey | null
  bookId: number | null
  page: number | null
  lessonId: number | null
  createdAt: string
  updatedAt: string
}

export interface NoteInput {
  title: string
  body: string
  color?: string
  gradeLevel?: GradeLevel | null
  subjectKey?: SubjectKey | null
  bookId?: number | null
  page?: number | null
  lessonId?: number | null
}

/* ------------------------------------------------------------------ */
/* Questions & Quizzes                                                 */
/* ------------------------------------------------------------------ */

export type Difficulty = 'beginner' | 'medium' | 'difficult' | 'exam'
export type QuestionType = 'mcq' | 'true-false' | 'short' | 'numeric'

export interface Question {
  id: number
  subjectKey: SubjectKey
  gradeLevel: GradeLevel
  chapterId: number | null
  lessonId: number | null
  topic: string
  difficulty: Difficulty
  type: QuestionType
  prompt: string
  /** Choice strings for mcq / true-false. */
  options: string[]
  /** Index into options for mcq/true-false, or the literal answer otherwise. */
  answer: string
  explanation: string
  /** Provenance: 'seed' | 'ai' | imported exam source label. */
  source: string
  /** National-exam year (e.g. 2015) for imported exam questions. */
  examYear?: number | null
}

export type QuizMode = 'practice' | 'random' | 'adaptive' | 'revision' | 'mock-exam'

/** One entry in a scanned-paper answer key: question number → correct letter. */
export interface PaperExamKeyEntry {
  n: number
  answer: string // 'A' | 'B' | 'C' | 'D'
  explanation?: string
}

/** A scanned/PDF exam taken in "paper mode" (read the PDF, answer A–D). */
export interface PaperExam {
  id: number
  title: string
  gradeLevel: GradeLevel
  subjectKey: SubjectKey
  examYear?: number | null
  filePath: string
  numQuestions: number
  answerKey: PaperExamKeyEntry[]
  createdAt: string
}

export interface PaperExamInput {
  title: string
  gradeLevel: GradeLevel
  subjectKey: SubjectKey
  examYear?: number | null
  /** Path to the questions PDF to copy into the library. */
  sourcePath: string
  answerKey: PaperExamKeyEntry[]
}

export interface QuizFilter {
  gradeLevel?: GradeLevel
  subjectKey?: SubjectKey
  chapterId?: number
  difficulty?: Difficulty
  topic?: string
  examYear?: number
  /** Question ids to exclude (e.g. recently answered). */
  excludeIds?: number[]
  limit?: number
}

export interface QuizAnswer {
  questionId: number
  given: string
  correct: boolean
  timeSpentSec: number
}

export interface QuizAttemptInput {
  mode: QuizMode
  gradeLevel: GradeLevel
  subjectKey: SubjectKey
  chapterId?: number | null
  score: number
  total: number
  durationSec: number
  answers: QuizAnswer[]
}

export interface QuizAttempt extends QuizAttemptInput {
  id: number
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* Progress & Dashboard                                                */
/* ------------------------------------------------------------------ */

export type ProgressEventType =
  | 'lesson-completed'
  | 'lesson-viewed'
  | 'quiz-completed'
  | 'reading'
  | 'ai-chat'
  | 'flashcards'

export interface ProgressEvent {
  id: number
  type: ProgressEventType
  gradeLevel: GradeLevel | null
  subjectKey: SubjectKey | null
  lessonId: number | null
  topic: string | null
  /** Minutes for reading, score% for quiz, etc. */
  value: number
  createdAt: string
}

export interface TopicMastery {
  subjectKey: SubjectKey
  gradeLevel: GradeLevel
  topic: string
  attempts: number
  correct: number
  /** 0..1 rolling mastery estimate. */
  mastery: number
  lastSeen: string
}

export interface Achievement {
  id: number
  key: string
  title: string
  description: string
  icon: string
  unlockedAt: string | null
}

export interface DashboardData {
  gradeLevel: GradeLevel
  studyStreakDays: number
  todayMinutes: number
  dailyGoalMinutes: number
  weeklyMinutes: { day: string; minutes: number }[]
  lessonsCompleted: number
  totalLessons: number
  averageQuizScore: number
  quizzesTaken: number
  continueReading: (ReadingProgress & { book: Book }) | null
  recentActivity: ProgressEvent[]
  weakTopics: TopicMastery[]
  strongTopics: TopicMastery[]
  recommendedLesson: Lesson | null
  achievements: Achievement[]
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export type AiProvider = 'lmstudio' | 'ollama' | 'groq'
export type ThemeMode = 'light' | 'dark' | 'system'
export type Language = 'en' | 'am'

export interface AiSettings {
  provider: AiProvider
  baseUrl: string
  /** Bearer token for online providers (e.g. Groq). Empty for local servers. */
  apiKey: string
  model: string
  embeddingModel: string
  temperature: number
  maxTokens: number
  topP: number
}

export interface AppSettings {
  theme: ThemeMode
  accent: string
  fontScale: number
  language: Language
  reduceMotion: boolean
  currentGrade: GradeLevel
  dailyGoalMinutes: number
  ragEnabled: boolean
  ai: AiSettings
}

/* ------------------------------------------------------------------ */
/* AI & RAG                                                            */
/* ------------------------------------------------------------------ */

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

/** Context the tutor uses to ground its answer (drives RAG retrieval). */
export interface TutorContext {
  gradeLevel?: GradeLevel
  subjectKey?: SubjectKey
  chapterTitle?: string
  lessonTitle?: string
  bookId?: number
  page?: number
  selectedText?: string
}

export interface ChatRequest {
  /** Conversation so far (excluding the system prompt, which is built server-side). */
  messages: ChatMessage[]
  context?: TutorContext
  /** When true, retrieve textbook passages and prepend them as grounding. */
  useRag?: boolean
  /** Override the default temperature for this request. */
  temperature?: number
}

export interface ChatStreamStart {
  requestId: string
  /** RAG passages used to ground this answer, surfaced as citations. */
  sources: RagChunk[]
}

export interface ChatStreamDelta {
  requestId: string
  delta: string
}

export interface ChatStreamEnd {
  requestId: string
  /** Full assembled text (convenience for persistence). */
  content: string
}

export interface ChatStreamError {
  requestId: string
  message: string
  /** True when the local AI server appears to be offline. */
  offline: boolean
}

export interface AiHealth {
  ok: boolean
  provider: AiProvider
  baseUrl: string
  /** Models reported by the running server (empty when offline). */
  models: string[]
  message: string
}

export interface RagChunk {
  id: number
  bookId: number
  bookTitle: string
  page: number
  content: string
  /** Cosine similarity to the query (0..1), present on retrieval results. */
  score?: number
}

export interface RagStatus {
  totalBooks: number
  indexedBooks: number
  totalChunks: number
  busy: boolean
  message: string
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export type SearchKind =
  | 'lesson'
  | 'book'
  | 'note'
  | 'bookmark'
  | 'question'
  | 'glossary'

export interface SearchResult {
  kind: SearchKind
  id: string
  title: string
  snippet: string
  /** Route to navigate to when the result is opened. */
  route: string
  gradeLevel?: GradeLevel
  subjectKey?: SubjectKey
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export interface ImportBookRequest {
  gradeLevel: GradeLevel
  subjectKey: SubjectKey
  title?: string
}

export interface ImportBookResult {
  ok: boolean
  book?: Book
  message: string
}

export interface BackupResult {
  ok: boolean
  path?: string
  message: string
}

/** Generic envelope returned by mutating IPC calls. */
export interface ActionResult<T = unknown> {
  ok: boolean
  data?: T
  message?: string
}
