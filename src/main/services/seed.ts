/**
 * First-run seeding. Loads the bundled Ethiopian-curriculum JSON (chapters,
 * lessons, question banks) into SQLite and registers built-in achievements.
 * Re-running is safe: curriculum seeding only happens when the DB is empty
 * (or when explicitly forced from the Admin panel).
 */
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { getDb, isEmpty, setMeta } from './database'
import type { Flashcard, LessonSection, SubjectKey, GradeLevel, QuestionType, Difficulty } from '@shared/types'

interface SeedQuestion {
  topic: string
  difficulty: Difficulty
  type: QuestionType
  prompt: string
  options?: string[]
  answer: string
  explanation?: string
}
interface SeedLesson {
  title: string
  summary: string
  estimatedMinutes?: number
  sections: LessonSection[]
  flashcards?: Flashcard[]
}
interface SeedChapter {
  title: string
  description?: string
  lessons?: SeedLesson[]
  questions?: SeedQuestion[]
}
interface SeedSubject {
  gradeLevel: GradeLevel
  subjectKey: SubjectKey
  chapters?: SeedChapter[]
  /** Extra questions not tied to a chapter — added to the quiz/exam pool. */
  questions?: SeedQuestion[]
}
interface SeedFile {
  version?: number
  subjects: SeedSubject[]
}

const ACHIEVEMENTS: { key: string; title: string; description: string; icon: string }[] = [
  { key: 'first-lesson', title: 'First Steps', description: 'Complete your first lesson', icon: 'Footprints' },
  { key: 'ten-lessons', title: 'Dedicated Learner', description: 'Complete 10 lessons', icon: 'BookOpenCheck' },
  { key: 'first-quiz', title: 'Quiz Starter', description: 'Finish your first quiz', icon: 'ListChecks' },
  { key: 'sharp-shooter', title: 'Sharp Shooter', description: 'Score 90% or higher on a quiz', icon: 'Target' },
  { key: 'century', title: 'Century', description: 'Answer 100 quiz questions', icon: 'Hash' },
  { key: 'note-taker', title: 'Note Taker', description: 'Write your first note', icon: 'NotebookPen' },
  { key: 'librarian', title: 'Librarian', description: 'Import a textbook', icon: 'Library' },
  { key: 'streak-3', title: 'On a Roll', description: 'Study 3 days in a row', icon: 'Flame' },
  { key: 'streak-7', title: 'Unstoppable', description: 'Study 7 days in a row', icon: 'Trophy' }
]

function seedDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'seed') : join(app.getAppPath(), 'resources/seed')
}

function seedAchievements(): void {
  const stmt = getDb().prepare(
    'INSERT INTO achievements(key, title, description, icon) VALUES(?, ?, ?, ?) ON CONFLICT(key) DO NOTHING'
  )
  const tx = getDb().transaction(() => {
    for (const a of ACHIEVEMENTS) stmt.run(a.key, a.title, a.description, a.icon)
  })
  tx()
}

function loadSeedFiles(): SeedSubject[] {
  const dir = seedDir()
  if (!existsSync(dir)) return []
  const subjects: SeedSubject[] = []
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    try {
      const parsed = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as SeedFile
      if (Array.isArray(parsed.subjects)) subjects.push(...parsed.subjects)
    } catch (err) {
      console.error(`[seed] failed to parse ${file}:`, err)
    }
  }
  return subjects
}

function insertSubjects(subjects: SeedSubject[]): { chapters: number; lessons: number; questions: number } {
  const db = getDb()
  const insChapter = db.prepare(
    'INSERT INTO chapters(subject_key, grade_level, order_index, title, description) VALUES(?, ?, ?, ?, ?)'
  )
  const insLesson = db.prepare(
    `INSERT INTO lessons(chapter_id, subject_key, grade_level, order_index, title, summary, estimated_minutes, sections_json, flashcards_json)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insQuestion = db.prepare(
    `INSERT INTO questions(subject_key, grade_level, chapter_id, topic, difficulty, type, prompt, options_json, answer, explanation, source)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed')`
  )

  let chapters = 0
  let lessons = 0
  let questions = 0

  const tx = db.transaction(() => {
    for (const subject of subjects) {
      let chOrder = 0
      for (const chapter of subject.chapters ?? []) {
        const chInfo = insChapter.run(
          subject.subjectKey,
          subject.gradeLevel,
          chOrder++,
          chapter.title,
          chapter.description ?? ''
        )
        const chapterId = Number(chInfo.lastInsertRowid)
        chapters++

        let lsOrder = 0
        for (const lesson of chapter.lessons ?? []) {
          insLesson.run(
            chapterId,
            subject.subjectKey,
            subject.gradeLevel,
            lsOrder++,
            lesson.title,
            lesson.summary ?? '',
            lesson.estimatedMinutes ?? 15,
            JSON.stringify(lesson.sections ?? []),
            JSON.stringify(lesson.flashcards ?? [])
          )
          lessons++
        }

        for (const q of chapter.questions ?? []) {
          insQuestion.run(
            subject.subjectKey,
            subject.gradeLevel,
            chapterId,
            q.topic ?? chapter.title,
            q.difficulty ?? 'beginner',
            q.type ?? 'mcq',
            q.prompt,
            JSON.stringify(q.options ?? []),
            q.answer,
            q.explanation ?? ''
          )
          questions++
        }
      }

      // Subject-level extra questions (no chapter) — added to the bank pool.
      for (const q of subject.questions ?? []) {
        insQuestion.run(
          subject.subjectKey,
          subject.gradeLevel,
          null,
          q.topic ?? '',
          q.difficulty ?? 'beginner',
          q.type ?? 'mcq',
          q.prompt,
          JSON.stringify(q.options ?? []),
          q.answer,
          q.explanation ?? ''
        )
        questions++
      }
    }
  })
  tx()
  return { chapters, lessons, questions }
}

/** Seed achievements always; seed curriculum when empty or forced. */
export function seedDatabase(force = false): void {
  seedAchievements()
  if (!force && !isEmpty()) return
  if (force) {
    const db = getDb()
    db.exec('DELETE FROM questions; DELETE FROM lessons; DELETE FROM chapters;')
  }
  const subjects = loadSeedFiles()
  if (subjects.length === 0) {
    console.warn('[seed] no curriculum seed files found in', seedDir())
    return
  }
  const counts = insertSubjects(subjects)
  setMeta('seededAt', new Date().toISOString())
  console.log(
    `[seed] inserted ${counts.chapters} chapters, ${counts.lessons} lessons, ${counts.questions} questions`
  )
}
