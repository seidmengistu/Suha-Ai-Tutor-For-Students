/**
 * Static configuration shared across all layers: the Ethiopian curriculum map,
 * the fixed AI teaching structure, AI quick-action buttons, IPC channel names
 * and default application settings.
 */

import type {
  AppSettings,
  GradeLevel,
  Subject,
  SubjectKey
} from './types'

export const APP_NAME = 'Suha AI Tutor'
export const APP_TAGLINE = 'Offline AI Learning Platform for Ethiopian Students'
export const AUTHOR = 'Suha Seid'
export const CREDIT = `Done by ${AUTHOR}`

export const GRADE_LEVELS: GradeLevel[] = [7, 8, 9, 10, 11, 12]

/* ------------------------------------------------------------------ */
/* Subject catalogue                                                   */
/* ------------------------------------------------------------------ */

const SUBJECT_DEFS: Record<SubjectKey, Omit<Subject, 'hasTextbook'>> = {
  english: {
    key: 'english',
    name: 'English',
    description: 'Reading, grammar, writing and communication skills.',
    icon: 'BookOpenText',
    color: 'from-sky-500 to-blue-600'
  },
  mathematics: {
    key: 'mathematics',
    name: 'Mathematics',
    description: 'Numbers, algebra, geometry and problem solving.',
    icon: 'Sigma',
    color: 'from-violet-500 to-purple-600'
  },
  'general-science': {
    key: 'general-science',
    name: 'General Science',
    description: 'Integrated Physics, Chemistry, Biology and Earth Science.',
    icon: 'Atom',
    color: 'from-emerald-500 to-teal-600',
    strands: ['Physics', 'Chemistry', 'Biology', 'Earth Science']
  },
  physics: {
    key: 'physics',
    name: 'Physics',
    description: 'Motion, forces, energy, electricity and waves.',
    icon: 'Magnet',
    color: 'from-amber-500 to-orange-600'
  },
  chemistry: {
    key: 'chemistry',
    name: 'Chemistry',
    description: 'Matter, atoms, reactions and the periodic table.',
    icon: 'FlaskConical',
    color: 'from-rose-500 to-pink-600'
  },
  biology: {
    key: 'biology',
    name: 'Biology',
    description: 'Cells, the human body, plants and ecosystems.',
    icon: 'Leaf',
    color: 'from-green-500 to-emerald-600'
  },
  'earth-science': {
    key: 'earth-science',
    name: 'Earth Science',
    description: 'The Earth, its layers, weather and the universe.',
    icon: 'Globe2',
    color: 'from-cyan-500 to-sky-600'
  },
  aptitude: {
    key: 'aptitude',
    name: 'Aptitude',
    description: 'Logical, numerical, verbal and spatial reasoning.',
    icon: 'BrainCircuit',
    color: 'from-fuchsia-500 to-indigo-600'
  }
}

function subject(key: SubjectKey, hasTextbook = true): Subject {
  return { ...SUBJECT_DEFS[key], hasTextbook }
}

/** Subjects available for each grade, per the Ethiopian curriculum. */
export const SUBJECTS_BY_GRADE: Record<GradeLevel, Subject[]> = {
  7: [subject('english'), subject('mathematics'), subject('general-science')],
  8: [subject('english'), subject('mathematics'), subject('general-science')],
  9: [
    subject('english'),
    subject('mathematics'),
    subject('physics'),
    subject('chemistry'),
    subject('biology'),
    subject('aptitude', false)
  ],
  10: [
    subject('english'),
    subject('mathematics'),
    subject('physics'),
    subject('chemistry'),
    subject('biology'),
    subject('aptitude', false)
  ],
  11: [
    subject('english'),
    subject('mathematics'),
    subject('physics'),
    subject('chemistry'),
    subject('biology'),
    subject('aptitude', false)
  ],
  12: [
    subject('english'),
    subject('mathematics'),
    subject('physics'),
    subject('chemistry'),
    subject('biology'),
    subject('aptitude', false)
  ]
}

export function subjectsForGrade(grade: GradeLevel): Subject[] {
  return SUBJECTS_BY_GRADE[grade] ?? []
}

export function getSubject(key: SubjectKey): Subject {
  return subject(key, key !== 'aptitude')
}

export const APTITUDE_CATEGORIES = [
  'Logical Reasoning',
  'Numerical Reasoning',
  'Pattern Recognition',
  'Spatial Reasoning',
  'Verbal Reasoning',
  'Critical Thinking'
] as const

/* ------------------------------------------------------------------ */
/* AI teaching structure (never skipped)                               */
/* ------------------------------------------------------------------ */

export const TEACHING_STRUCTURE = [
  'Simple explanation',
  'Intuition',
  'Real-life example',
  'Visualization description',
  'Important formulas',
  'Common mistakes',
  'Memory tricks',
  'Summary',
  'Practice questions',
  'Exam questions'
] as const

/** Quick-action buttons surfaced on lesson, reader and tutor pages. */
export interface AiAction {
  id: string
  label: string
  icon: string
  /** Prompt template; {{selection}} / {{topic}} are filled at call time. */
  prompt: string
  /** Hide on pages without a text selection. */
  needsSelection?: boolean
  /**
   * Refers to "this page" — only meaningful in the Reader. Hidden on the
   * standalone AI Tutor. (Actions with neither flag refer to "this topic" and
   * need either a page or an ongoing conversation to act on.)
   */
  needsPage?: boolean
}

export const AI_ACTIONS: AiAction[] = [
  {
    id: 'explain-page',
    label: 'Explain this page',
    icon: 'Sparkles',
    prompt: 'Explain the current page using the full teaching structure.',
    needsPage: true
  },
  {
    id: 'explain-selection',
    label: 'Explain highlighted text',
    icon: 'Highlighter',
    prompt: 'Explain this highlighted text clearly:\n\n"{{selection}}"',
    needsSelection: true
  },
  {
    id: 'eli10',
    label: 'Explain like I am 10',
    icon: 'Baby',
    prompt: 'Explain this topic as if I am 10 years old, using very simple words and a fun example.'
  },
  {
    id: 'simple-english',
    label: 'Explain in simple English',
    icon: 'MessageSquare',
    prompt: 'Explain this using the simplest possible English, short sentences and easy words.'
  },
  {
    id: 'another-example',
    label: 'Give another example',
    icon: 'Lightbulb',
    prompt: 'Give one more clear, real-life example of this concept for an Ethiopian student.'
  },
  {
    id: 'formula',
    label: 'Show formula',
    icon: 'FunctionSquare',
    prompt: 'List the important formulas for this topic and explain each symbol.'
  },
  {
    id: 'diagram',
    label: 'Draw diagram',
    icon: 'PenTool',
    prompt:
      'Describe a clear labelled diagram for this topic. If possible output a JSON visualization block (```viz) with kind and data.'
  },
  {
    id: 'quiz',
    label: 'Generate quiz',
    icon: 'ListChecks',
    prompt: 'Generate a 5-question multiple choice quiz on this topic with answers and explanations.'
  },
  {
    id: 'flashcards',
    label: 'Generate flashcards',
    icon: 'Layers',
    prompt: 'Generate 8 flashcards (front/back) for this topic.'
  },
  {
    id: 'exam',
    label: 'Generate exam questions',
    icon: 'GraduationCap',
    prompt: 'Generate 5 national-exam style questions on this topic with full solutions.'
  },
  {
    id: 'revision',
    label: 'Generate revision notes',
    icon: 'NotebookPen',
    prompt: 'Write concise revision notes for this topic with key points and formulas.'
  },
  {
    id: 'summarize',
    label: 'Summarize page',
    icon: 'AlignLeft',
    prompt: 'Summarize the key ideas of this page in a short bullet list.',
    needsPage: true
  },
  {
    id: 'translate',
    label: 'Translate',
    icon: 'Languages',
    prompt: 'Translate this content into Amharic, keeping technical terms in English where useful.',
    needsSelection: true
  },
  {
    id: 'read-aloud',
    label: 'Read aloud',
    icon: 'Volume2',
    prompt: 'Provide a clear, well-paced narration script of this page for reading aloud.',
    needsPage: true
  }
]

/* ------------------------------------------------------------------ */
/* Default settings                                                    */
/* ------------------------------------------------------------------ */

export const DEFAULT_AI_BASE_URLS: Record<AppSettings['ai']['provider'], string> = {
  lmstudio: 'http://localhost:1234',
  ollama: 'http://localhost:11434',
  // Groq is OpenAI-compatible; the client appends "/v1/..." to this base.
  groq: 'https://api.groq.com/openai'
}

/** Sensible default chat model per provider (used when switching providers). */
export const DEFAULT_AI_MODELS: Record<AppSettings['ai']['provider'], string> = {
  lmstudio: 'qwen3:8b',
  ollama: 'qwen3:8b',
  groq: 'llama-3.3-70b-versatile'
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  accent: 'emerald',
  fontScale: 1,
  language: 'en',
  reduceMotion: false,
  currentGrade: 9,
  dailyGoalMinutes: 30,
  ragEnabled: true,
  ai: {
    provider: 'ollama',
    baseUrl: DEFAULT_AI_BASE_URLS.ollama,
    apiKey: '',
    model: 'qwen3:8b',
    embeddingModel: 'nomic-embed-text',
    temperature: 0.4,
    maxTokens: 1536,
    topP: 0.9
  }
}

export const ACCENTS: Record<string, { brand: string; soft: string }> = {
  emerald: { brand: '16 185 129', soft: '209 250 229' },
  blue: { brand: '59 130 246', soft: '219 234 254' },
  violet: { brand: '139 92 246', soft: '237 233 254' },
  amber: { brand: '245 158 11', soft: '254 243 199' },
  rose: { brand: '244 63 94', soft: '255 228 230' }
}

/* ------------------------------------------------------------------ */
/* IPC channels                                                        */
/* ------------------------------------------------------------------ */

export const IPC = {
  // app
  appInfo: 'app:info',
  openExternal: 'app:open-external',
  // settings
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsReset: 'settings:reset',
  // curriculum
  gradesGet: 'curriculum:grades',
  subjectsGet: 'curriculum:subjects',
  chaptersGet: 'curriculum:chapters',
  lessonsGet: 'curriculum:lessons',
  lessonGet: 'curriculum:lesson',
  lessonGenerate: 'curriculum:generate-lesson',
  chaptersDetect: 'curriculum:detect-chapters',
  // books
  booksList: 'books:list',
  bookGet: 'books:get',
  bookData: 'books:data',
  bookImport: 'books:import',
  bookDelete: 'books:delete',
  // reading
  readingGet: 'reading:get',
  readingSet: 'reading:set',
  // bookmarks
  bookmarksList: 'bookmarks:list',
  bookmarkAdd: 'bookmarks:add',
  bookmarkDelete: 'bookmarks:delete',
  // notes
  notesList: 'notes:list',
  noteCreate: 'notes:create',
  noteUpdate: 'notes:update',
  noteDelete: 'notes:delete',
  notesSearch: 'notes:search',
  // questions / quiz
  questionsGet: 'quiz:questions',
  questionsGenerate: 'quiz:generate',
  quizSave: 'quiz:save',
  quizHistory: 'quiz:history',
  // progress
  dashboardGet: 'progress:dashboard',
  progressRecord: 'progress:record',
  masteryGet: 'progress:mastery',
  // ai (request/response)
  aiHealth: 'ai:health',
  aiModels: 'ai:models',
  aiChatStart: 'ai:chat:start',
  aiChatStop: 'ai:chat:stop',
  aiEmbed: 'ai:embed',
  // ai (main -> renderer stream events)
  aiStreamStart: 'ai:stream:start',
  aiStreamDelta: 'ai:stream:delta',
  aiStreamEnd: 'ai:stream:end',
  aiStreamError: 'ai:stream:error',
  // rag
  ragStatus: 'rag:status',
  ragQuery: 'rag:query',
  ragIndex: 'rag:index',
  ragReindexAll: 'rag:reindex-all',
  // search
  searchGlobal: 'search:global',
  // admin
  adminExport: 'admin:export',
  adminExportContent: 'admin:export-content',
  adminBackup: 'admin:backup',
  adminRestore: 'admin:restore',
  adminReseed: 'admin:reseed',

  // exam paper import
  examPickFiles: 'exam:pick-files',
  examReadFile: 'exam:read-file',
  examImport: 'exam:import',
  examListFolder: 'exam:list-folder',
  examImportPaper: 'exam:import-paper',
  examYears: 'quiz:exam-years',
  quizCount: 'quiz:count',

  // paper-mode exams (scanned PDFs)
  paperPick: 'paper:pick',
  paperAdd: 'paper:add',
  paperList: 'paper:list',
  paperData: 'paper:data',
  paperDelete: 'paper:delete',
  paperOcrText: 'paper:ocr-text',
  paperAiKey: 'paper:ai-key',
  paperVisionKey: 'paper:vision-key',
  paperExportPack: 'paper:export-pack'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
