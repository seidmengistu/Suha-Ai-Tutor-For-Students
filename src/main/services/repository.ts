/**
 * Data-access layer over SQLite. Pure functions grouped by domain (curriculum,
 * notes, bookmarks, reading, quiz, progress, search) plus the dashboard
 * aggregation and the adaptive-learning mastery tracking.
 */
import { getDb } from './database'
import { getBook } from './books'
import {
  GRADE_LEVELS,
  subjectsForGrade,
  getSubject
} from '@shared/constants'
import type {
  Achievement,
  Bookmark,
  Chapter,
  DashboardData,
  Flashcard,
  Grade,
  GradeLevel,
  Lesson,
  LessonSection,
  Note,
  NoteInput,
  ProgressEvent,
  ProgressEventType,
  Question,
  QuizAttempt,
  QuizAttemptInput,
  QuizFilter,
  ReadingProgress,
  SearchResult,
  SubjectKey,
  TopicMastery
} from '@shared/types'

/* ------------------------------------------------------------------ */
/* Mappers                                                             */
/* ------------------------------------------------------------------ */

function mapChapter(r: any): Chapter {
  return {
    id: r.id,
    subjectKey: r.subject_key,
    gradeLevel: r.grade_level,
    orderIndex: r.order_index,
    title: r.title,
    description: r.description,
    lessonCount: r.lesson_count ?? undefined
  }
}

function mapLesson(r: any): Lesson {
  return {
    id: r.id,
    chapterId: r.chapter_id,
    subjectKey: r.subject_key,
    gradeLevel: r.grade_level,
    orderIndex: r.order_index,
    title: r.title,
    summary: r.summary,
    estimatedMinutes: r.estimated_minutes,
    sections: safeJson(r.sections_json, []),
    flashcards: safeJson(r.flashcards_json, [])
  }
}

function mapQuestion(r: any): Question {
  return {
    id: r.id,
    subjectKey: r.subject_key,
    gradeLevel: r.grade_level,
    chapterId: r.chapter_id,
    lessonId: r.lesson_id,
    topic: r.topic,
    difficulty: r.difficulty,
    type: r.type,
    prompt: r.prompt,
    options: safeJson(r.options_json, []),
    answer: r.answer,
    explanation: r.explanation,
    source: r.source,
    examYear: r.exam_year ?? null
  }
}

function mapNote(r: any): Note {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    color: r.color,
    gradeLevel: r.grade_level,
    subjectKey: r.subject_key,
    bookId: r.book_id,
    page: r.page,
    lessonId: r.lesson_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/* ------------------------------------------------------------------ */
/* Curriculum                                                          */
/* ------------------------------------------------------------------ */

export function getGrades(): Grade[] {
  return GRADE_LEVELS.map((level) => ({
    level,
    label: `Grade ${level}`,
    subjects: subjectsForGrade(level)
  }))
}

export function getChapters(gradeLevel: GradeLevel, subjectKey: SubjectKey): Chapter[] {
  const rows = getDb()
    .prepare(
      `SELECT ch.*, (SELECT COUNT(*) FROM lessons l WHERE l.chapter_id = ch.id) AS lesson_count
       FROM chapters ch WHERE ch.grade_level = ? AND ch.subject_key = ?
       ORDER BY ch.order_index`
    )
    .all(gradeLevel, subjectKey)
  return rows.map(mapChapter)
}

export function getLessons(chapterId: number): Lesson[] {
  const rows = getDb()
    .prepare('SELECT * FROM lessons WHERE chapter_id = ? ORDER BY order_index')
    .all(chapterId)
  return rows.map(mapLesson)
}

export function getLesson(id: number): Lesson | null {
  const row = getDb().prepare('SELECT * FROM lessons WHERE id = ?').get(id)
  return row ? mapLesson(row) : null
}

/**
 * Persist an AI-generated lesson, creating its chapter if needed. Re-generating
 * a chapter with the same title replaces its previous generated lesson.
 */
export function saveGeneratedLesson(p: {
  gradeLevel: GradeLevel
  subjectKey: SubjectKey
  chapterTitle: string
  description?: string
  orderIndex: number
  summary: string
  estimatedMinutes: number
  sections: LessonSection[]
  flashcards?: Flashcard[]
}): { chapterId: number; lessonId: number } {
  const db = getDb()
  const existing = db
    .prepare('SELECT id FROM chapters WHERE grade_level = ? AND subject_key = ? AND title = ?')
    .get(p.gradeLevel, p.subjectKey, p.chapterTitle) as { id: number } | undefined

  let chapterId: number
  if (existing) {
    chapterId = existing.id
  } else {
    const maxOrder = (
      db
        .prepare('SELECT COALESCE(MAX(order_index), -1) AS m FROM chapters WHERE grade_level = ? AND subject_key = ?')
        .get(p.gradeLevel, p.subjectKey) as { m: number }
    ).m
    const info = db
      .prepare('INSERT INTO chapters(subject_key, grade_level, order_index, title, description) VALUES(?, ?, ?, ?, ?)')
      .run(p.subjectKey, p.gradeLevel, Math.max(p.orderIndex, maxOrder + 1), p.chapterTitle, p.description ?? '')
    chapterId = Number(info.lastInsertRowid)
  }

  db.prepare('DELETE FROM lessons WHERE chapter_id = ? AND title = ?').run(chapterId, p.chapterTitle)
  const info = db
    .prepare(
      `INSERT INTO lessons(chapter_id, subject_key, grade_level, order_index, title, summary, estimated_minutes, sections_json, flashcards_json)
       VALUES(?, ?, ?, 0, ?, ?, ?, ?, ?)`
    )
    .run(
      chapterId,
      p.subjectKey,
      p.gradeLevel,
      p.chapterTitle,
      p.summary,
      p.estimatedMinutes,
      JSON.stringify(p.sections),
      JSON.stringify(p.flashcards ?? [])
    )
  return { chapterId, lessonId: Number(info.lastInsertRowid) }
}

/**
 * Export the entire curriculum (chapters + lessons + question banks) as a seed
 * file, so generated content can be bundled and shipped — no AI needed by the
 * end user. The shape matches what seed.ts loads from resources/seed.
 */
export function exportCurriculum(): {
  version: number
  subjects: unknown[]
  counts: { chapters: number; lessons: number; questions: number }
} {
  const db = getDb()
  const chapters = db
    .prepare('SELECT * FROM chapters ORDER BY grade_level, subject_key, order_index')
    .all() as any[]
  const subjects = new Map<string, any>()
  let lessonCount = 0
  let questionCount = 0

  for (const ch of chapters) {
    const key = `${ch.grade_level}:${ch.subject_key}`
    let subject = subjects.get(key)
    if (!subject) {
      subject = { gradeLevel: ch.grade_level, subjectKey: ch.subject_key, chapters: [] }
      subjects.set(key, subject)
    }
    const lessons = (
      db.prepare('SELECT * FROM lessons WHERE chapter_id = ? ORDER BY order_index').all(ch.id) as any[]
    ).map((l) => ({
      title: l.title,
      summary: l.summary,
      estimatedMinutes: l.estimated_minutes,
      sections: safeJson(l.sections_json, []),
      flashcards: safeJson(l.flashcards_json, [])
    }))
    const questions = (
      db.prepare('SELECT * FROM questions WHERE chapter_id = ?').all(ch.id) as any[]
    ).map((q) => ({
      topic: q.topic,
      difficulty: q.difficulty,
      type: q.type,
      prompt: q.prompt,
      options: safeJson(q.options_json, []),
      answer: q.answer,
      explanation: q.explanation
    }))
    lessonCount += lessons.length
    questionCount += questions.length
    subject.chapters.push({ title: ch.title, description: ch.description, lessons, questions })
  }

  return {
    version: 1,
    subjects: Array.from(subjects.values()),
    counts: { chapters: chapters.length, lessons: lessonCount, questions: questionCount }
  }
}

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

export function listNotes(
  filter: { gradeLevel?: GradeLevel; subjectKey?: SubjectKey; bookId?: number } = {}
): Note[] {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.gradeLevel) {
    where.push('grade_level = ?')
    params.push(filter.gradeLevel)
  }
  if (filter.subjectKey) {
    where.push('subject_key = ?')
    params.push(filter.subjectKey)
  }
  if (filter.bookId) {
    where.push('book_id = ?')
    params.push(filter.bookId)
  }
  const rows = getDb()
    .prepare(
      `SELECT * FROM notes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC`
    )
    .all(...params)
  return rows.map(mapNote)
}

export function createNote(input: NoteInput): Note {
  const info = getDb()
    .prepare(
      `INSERT INTO notes(title, body, color, grade_level, subject_key, book_id, page, lesson_id)
       VALUES(@title, @body, @color, @gradeLevel, @subjectKey, @bookId, @page, @lessonId)`
    )
    .run({
      title: input.title ?? '',
      body: input.body ?? '',
      color: input.color ?? 'amber',
      gradeLevel: input.gradeLevel ?? null,
      subjectKey: input.subjectKey ?? null,
      bookId: input.bookId ?? null,
      page: input.page ?? null,
      lessonId: input.lessonId ?? null
    })
  return mapNote(getDb().prepare('SELECT * FROM notes WHERE id = ?').get(Number(info.lastInsertRowid)))
}

export function updateNote(id: number, patch: Partial<NoteInput>): Note | null {
  const existing = getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id) as any
  if (!existing) return null
  getDb()
    .prepare(
      `UPDATE notes SET title=@title, body=@body, color=@color, updated_at=datetime('now') WHERE id=@id`
    )
    .run({
      id,
      title: patch.title ?? existing.title,
      body: patch.body ?? existing.body,
      color: patch.color ?? existing.color
    })
  return mapNote(getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id))
}

export function deleteNote(id: number): void {
  getDb().prepare('DELETE FROM notes WHERE id = ?').run(id)
}

export function searchNotes(q: string): Note[] {
  const like = `%${q}%`
  const rows = getDb()
    .prepare('SELECT * FROM notes WHERE title LIKE ? OR body LIKE ? ORDER BY updated_at DESC LIMIT 50')
    .all(like, like)
  return rows.map(mapNote)
}

/* ------------------------------------------------------------------ */
/* Bookmarks & reading                                                 */
/* ------------------------------------------------------------------ */

export function listBookmarks(bookId: number): Bookmark[] {
  const rows = getDb()
    .prepare('SELECT * FROM bookmarks WHERE book_id = ? ORDER BY page')
    .all(bookId)
  return rows.map((r: any) => ({
    id: r.id,
    bookId: r.book_id,
    page: r.page,
    label: r.label,
    createdAt: r.created_at
  }))
}

export function addBookmark(bookId: number, page: number, label: string): Bookmark {
  const info = getDb()
    .prepare('INSERT INTO bookmarks(book_id, page, label) VALUES(?, ?, ?)')
    .run(bookId, page, label)
  const r: any = getDb().prepare('SELECT * FROM bookmarks WHERE id = ?').get(Number(info.lastInsertRowid))
  return { id: r.id, bookId: r.book_id, page: r.page, label: r.label, createdAt: r.created_at }
}

export function deleteBookmark(id: number): void {
  getDb().prepare('DELETE FROM bookmarks WHERE id = ?').run(id)
}

export function getReading(bookId: number): ReadingProgress | null {
  const r: any = getDb().prepare('SELECT * FROM reading_progress WHERE book_id = ?').get(bookId)
  return r
    ? { bookId: r.book_id, lastPage: r.last_page, totalPages: r.total_pages, updatedAt: r.updated_at }
    : null
}

export function setReading(bookId: number, lastPage: number, totalPages: number): void {
  getDb()
    .prepare(
      `INSERT INTO reading_progress(book_id, last_page, total_pages, updated_at)
       VALUES(?, ?, ?, datetime('now'))
       ON CONFLICT(book_id) DO UPDATE SET last_page=excluded.last_page,
         total_pages=excluded.total_pages, updated_at=datetime('now')`
    )
    .run(bookId, lastPage, totalPages)
  if (totalPages > 0) {
    getDb().prepare('UPDATE books SET page_count = ? WHERE id = ?').run(totalPages, bookId)
  }
}

/* ------------------------------------------------------------------ */
/* Questions & quizzes                                                 */
/* ------------------------------------------------------------------ */

export function getQuestions(filter: QuizFilter): Question[] {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.gradeLevel) {
    where.push('grade_level = ?')
    params.push(filter.gradeLevel)
  }
  if (filter.subjectKey) {
    where.push('subject_key = ?')
    params.push(filter.subjectKey)
  }
  if (filter.chapterId) {
    where.push('chapter_id = ?')
    params.push(filter.chapterId)
  }
  if (filter.difficulty) {
    where.push('difficulty = ?')
    params.push(filter.difficulty)
  }
  if (filter.topic) {
    where.push('topic = ?')
    params.push(filter.topic)
  }
  if (filter.examYear) {
    where.push('exam_year = ?')
    params.push(filter.examYear)
  }
  if (filter.excludeIds && filter.excludeIds.length) {
    where.push(`id NOT IN (${filter.excludeIds.map(() => '?').join(',')})`)
    params.push(...filter.excludeIds)
  }
  const limit = Math.min(filter.limit ?? 20, 200)
  const rows = getDb()
    .prepare(
      `SELECT * FROM questions ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY RANDOM() LIMIT ?`
    )
    .all(...params, limit)
  return rows.map(mapQuestion)
}

export function insertQuestions(questions: Omit<Question, 'id'>[]): number {
  const stmt = getDb().prepare(
    `INSERT INTO questions(subject_key, grade_level, chapter_id, lesson_id, topic, difficulty, type, prompt, options_json, answer, explanation, source, exam_year)
     VALUES(@subjectKey, @gradeLevel, @chapterId, @lessonId, @topic, @difficulty, @type, @prompt, @options, @answer, @explanation, @source, @examYear)`
  )
  const many = getDb().transaction((items: Omit<Question, 'id'>[]) => {
    for (const q of items) {
      stmt.run({
        subjectKey: q.subjectKey,
        gradeLevel: q.gradeLevel,
        chapterId: q.chapterId ?? null,
        lessonId: q.lessonId ?? null,
        topic: q.topic ?? '',
        difficulty: q.difficulty,
        type: q.type,
        prompt: q.prompt,
        options: JSON.stringify(q.options ?? []),
        answer: q.answer,
        explanation: q.explanation ?? '',
        source: q.source ?? 'ai',
        examYear: q.examYear ?? null
      })
    }
  })
  many(questions)
  return questions.length
}

/** Count questions in the bank for a grade/subject (optionally a year). */
export function countQuestions(gradeLevel?: GradeLevel, subjectKey?: SubjectKey, examYear?: number): number {
  const where: string[] = []
  const params: unknown[] = []
  if (gradeLevel) {
    where.push('grade_level = ?')
    params.push(gradeLevel)
  }
  if (subjectKey) {
    where.push('subject_key = ?')
    params.push(subjectKey)
  }
  if (examYear) {
    where.push('exam_year = ?')
    params.push(examYear)
  }
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM questions ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`)
    .get(...params) as { n: number }
  return row.n
}

/** Distinct exam years available for a grade/subject (imported papers). */
export function getExamYears(gradeLevel?: GradeLevel, subjectKey?: SubjectKey): number[] {
  const where = ['exam_year IS NOT NULL']
  const params: unknown[] = []
  if (gradeLevel) {
    where.push('grade_level = ?')
    params.push(gradeLevel)
  }
  if (subjectKey) {
    where.push('subject_key = ?')
    params.push(subjectKey)
  }
  const rows = getDb()
    .prepare(`SELECT DISTINCT exam_year AS y FROM questions WHERE ${where.join(' AND ')} ORDER BY y DESC`)
    .all(...params) as { y: number }[]
  return rows.map((r) => r.y)
}

export function saveQuizAttempt(input: QuizAttemptInput): QuizAttempt {
  const info = getDb()
    .prepare(
      `INSERT INTO quiz_attempts(mode, grade_level, subject_key, chapter_id, score, total, duration_sec, answers_json)
       VALUES(@mode, @gradeLevel, @subjectKey, @chapterId, @score, @total, @durationSec, @answers)`
    )
    .run({
      mode: input.mode,
      gradeLevel: input.gradeLevel,
      subjectKey: input.subjectKey,
      chapterId: input.chapterId ?? null,
      score: input.score,
      total: input.total,
      durationSec: input.durationSec,
      answers: JSON.stringify(input.answers ?? [])
    })

  // Update mastery per answered topic for adaptive learning.
  updateMasteryFromAnswers(input)

  recordEvent({
    type: 'quiz-completed',
    gradeLevel: input.gradeLevel,
    subjectKey: input.subjectKey,
    value: input.total > 0 ? Math.round((input.score / input.total) * 100) : 0
  })

  const r: any = getDb()
    .prepare('SELECT * FROM quiz_attempts WHERE id = ?')
    .get(Number(info.lastInsertRowid))
  return {
    id: r.id,
    mode: r.mode,
    gradeLevel: r.grade_level,
    subjectKey: r.subject_key,
    chapterId: r.chapter_id,
    score: r.score,
    total: r.total,
    durationSec: r.duration_sec,
    answers: safeJson(r.answers_json, []),
    createdAt: r.created_at
  }
}

function updateMasteryFromAnswers(input: QuizAttemptInput): void {
  const db = getDb()
  const getTopic = db.prepare('SELECT topic FROM questions WHERE id = ?')
  const upsert = db.prepare(
    `INSERT INTO topic_mastery(subject_key, grade_level, topic, attempts, correct, mastery, last_seen)
     VALUES(@subjectKey, @gradeLevel, @topic, 1, @correct, @mastery, datetime('now'))
     ON CONFLICT(subject_key, grade_level, topic) DO UPDATE SET
       attempts = attempts + 1,
       correct = correct + @correct,
       mastery = (mastery * 0.6) + (@correct * 0.4),
       last_seen = datetime('now')`
  )
  const tx = db.transaction(() => {
    for (const a of input.answers ?? []) {
      const row = getTopic.get(a.questionId) as { topic: string } | undefined
      const topic = row?.topic?.trim()
      if (!topic) continue
      upsert.run({
        subjectKey: input.subjectKey,
        gradeLevel: input.gradeLevel,
        topic,
        correct: a.correct ? 1 : 0,
        mastery: a.correct ? 1 : 0
      })
    }
  })
  tx()
  checkAchievements()
}

export function quizHistory(gradeLevel?: GradeLevel, limit = 20): QuizAttempt[] {
  const rows = gradeLevel
    ? getDb()
        .prepare('SELECT * FROM quiz_attempts WHERE grade_level = ? ORDER BY created_at DESC LIMIT ?')
        .all(gradeLevel, limit)
    : getDb().prepare('SELECT * FROM quiz_attempts ORDER BY created_at DESC LIMIT ?').all(limit)
  return rows.map((r: any) => ({
    id: r.id,
    mode: r.mode,
    gradeLevel: r.grade_level,
    subjectKey: r.subject_key,
    chapterId: r.chapter_id,
    score: r.score,
    total: r.total,
    durationSec: r.duration_sec,
    answers: safeJson(r.answers_json, []),
    createdAt: r.created_at
  }))
}

/* ------------------------------------------------------------------ */
/* Progress, mastery & achievements                                    */
/* ------------------------------------------------------------------ */

export function recordEvent(e: {
  type: ProgressEventType
  gradeLevel?: GradeLevel | null
  subjectKey?: SubjectKey | null
  lessonId?: number | null
  topic?: string | null
  value?: number
}): void {
  getDb()
    .prepare(
      `INSERT INTO progress_events(type, grade_level, subject_key, lesson_id, topic, value)
       VALUES(?, ?, ?, ?, ?, ?)`
    )
    .run(
      e.type,
      e.gradeLevel ?? null,
      e.subjectKey ?? null,
      e.lessonId ?? null,
      e.topic ?? null,
      e.value ?? 0
    )
  checkAchievements()
}

export function getMastery(gradeLevel: GradeLevel, subjectKey?: SubjectKey): TopicMastery[] {
  const rows = subjectKey
    ? getDb()
        .prepare(
          'SELECT * FROM topic_mastery WHERE grade_level = ? AND subject_key = ? ORDER BY mastery ASC'
        )
        .all(gradeLevel, subjectKey)
    : getDb()
        .prepare('SELECT * FROM topic_mastery WHERE grade_level = ? ORDER BY mastery ASC')
        .all(gradeLevel)
  return rows.map((r: any) => ({
    subjectKey: r.subject_key,
    gradeLevel: r.grade_level,
    topic: r.topic,
    attempts: r.attempts,
    correct: r.correct,
    mastery: r.mastery,
    lastSeen: r.last_seen
  }))
}

function minutesBetween(types: ProgressEventType[], sinceSql: string): number {
  const placeholders = types.map(() => '?').join(',')
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(value),0) AS m FROM progress_events
       WHERE type IN (${placeholders}) AND created_at >= ${sinceSql}`
    )
    .get(...types) as { m: number }
  return Math.round(row.m)
}

const TIME_TYPES: ProgressEventType[] = ['reading', 'lesson-viewed', 'lesson-completed', 'flashcards', 'ai-chat']

function computeStreak(): number {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT date(created_at, 'localtime') AS d FROM progress_events ORDER BY d DESC LIMIT 400`
    )
    .all() as { d: string }[]
  if (rows.length === 0) return 0
  const days = new Set(rows.map((r) => r.d))
  let streak = 0
  const cursor = new Date()
  // Allow the streak to count from today or yesterday (grace for not studying yet today).
  const todayStr = cursor.toISOString().slice(0, 10)
  if (!days.has(todayStr)) cursor.setDate(cursor.getDate() - 1)
  for (;;) {
    const key = cursor.toISOString().slice(0, 10)
    if (days.has(key)) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

export function getDashboard(gradeLevel: GradeLevel): DashboardData {
  const db = getDb()

  const todayMinutes =
    minutesBetween(TIME_TYPES, "date('now','localtime')") +
    Math.round(
      ((db
        .prepare(
          `SELECT COALESCE(SUM(duration_sec),0) AS s FROM quiz_attempts WHERE date(created_at,'localtime') = date('now','localtime')`
        )
        .get() as { s: number }).s) / 60
    )

  // Weekly minutes (Mon..Sun style, last 7 days oldest-first).
  const weeklyMinutes: { day: string; minutes: number }[] = []
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(value),0) AS m FROM progress_events
         WHERE type IN ('reading','lesson-viewed','lesson-completed','flashcards','ai-chat')
           AND date(created_at,'localtime') = ?`
      )
      .get(key) as { m: number }
    weeklyMinutes.push({ day: labels[d.getDay()], minutes: Math.round(row.m) })
  }

  const totalLessons = (
    db.prepare('SELECT COUNT(*) AS n FROM lessons WHERE grade_level = ?').get(gradeLevel) as {
      n: number
    }
  ).n
  const lessonsCompleted = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT lesson_id) AS n FROM progress_events
         WHERE type='lesson-completed' AND grade_level = ? AND lesson_id IS NOT NULL`
      )
      .get(gradeLevel) as { n: number }
  ).n

  const quizAgg = db
    .prepare(
      `SELECT COUNT(*) AS c, COALESCE(AVG(CASE WHEN total>0 THEN score*100.0/total END),0) AS avg
       FROM quiz_attempts WHERE grade_level = ?`
    )
    .get(gradeLevel) as { c: number; avg: number }

  // Continue reading: most recent reading progress overall.
  const reading = db
    .prepare('SELECT * FROM reading_progress ORDER BY updated_at DESC LIMIT 1')
    .get() as any
  let continueReading: DashboardData['continueReading'] = null
  if (reading) {
    const book = getBook(reading.book_id)
    if (book)
      continueReading = {
        bookId: reading.book_id,
        lastPage: reading.last_page,
        totalPages: reading.total_pages,
        updatedAt: reading.updated_at,
        book
      }
  }

  const recentActivity = (
    db.prepare('SELECT * FROM progress_events ORDER BY created_at DESC LIMIT 8').all() as any[]
  ).map((r) => ({
    id: r.id,
    type: r.type,
    gradeLevel: r.grade_level,
    subjectKey: r.subject_key,
    lessonId: r.lesson_id,
    topic: r.topic,
    value: r.value,
    createdAt: r.created_at
  })) as ProgressEvent[]

  const mastery = getMastery(gradeLevel)
  const weakTopics = mastery.filter((m) => m.attempts >= 1 && m.mastery < 0.6).slice(0, 5)
  const strongTopics = [...mastery]
    .filter((m) => m.mastery >= 0.75)
    .sort((a, b) => b.mastery - a.mastery)
    .slice(0, 5)

  return {
    gradeLevel,
    studyStreakDays: computeStreak(),
    todayMinutes,
    dailyGoalMinutes: 30,
    weeklyMinutes,
    lessonsCompleted,
    totalLessons,
    averageQuizScore: Math.round(quizAgg.avg),
    quizzesTaken: quizAgg.c,
    continueReading,
    recentActivity,
    weakTopics,
    strongTopics,
    recommendedLesson: recommendLesson(gradeLevel, weakTopics),
    achievements: listAchievements()
  }
}

function recommendLesson(gradeLevel: GradeLevel, weak: TopicMastery[]): Lesson | null {
  const db = getDb()
  // Prefer a lesson in the weakest topic's subject that has not been completed.
  for (const w of weak) {
    const row = db
      .prepare(
        `SELECT l.* FROM lessons l
         WHERE l.grade_level = ? AND l.subject_key = ?
           AND l.id NOT IN (SELECT lesson_id FROM progress_events WHERE type='lesson-completed' AND lesson_id IS NOT NULL)
         ORDER BY l.order_index LIMIT 1`
      )
      .get(gradeLevel, w.subjectKey) as any
    if (row) return mapLesson(row)
  }
  // Otherwise the first not-yet-completed lesson for the grade.
  const row = db
    .prepare(
      `SELECT l.* FROM lessons l
       WHERE l.grade_level = ?
         AND l.id NOT IN (SELECT lesson_id FROM progress_events WHERE type='lesson-completed' AND lesson_id IS NOT NULL)
       ORDER BY l.subject_key, l.order_index LIMIT 1`
    )
    .get(gradeLevel) as any
  return row ? mapLesson(row) : null
}

/* ---- achievements ---- */

export function listAchievements(): Achievement[] {
  return (getDb().prepare('SELECT * FROM achievements ORDER BY id').all() as any[]).map((r) => ({
    id: r.id,
    key: r.key,
    title: r.title,
    description: r.description,
    icon: r.icon,
    unlockedAt: r.unlocked_at
  }))
}

/** Evaluate achievement criteria and unlock any newly-earned ones. */
export function checkAchievements(): void {
  const db = getDb()
  const count = (sql: string): number => (db.prepare(sql).get() as { n: number }).n
  const stats = {
    lessons: count(
      "SELECT COUNT(DISTINCT lesson_id) AS n FROM progress_events WHERE type='lesson-completed' AND lesson_id IS NOT NULL"
    ),
    quizzes: count('SELECT COUNT(*) AS n FROM quiz_attempts'),
    notes: count('SELECT COUNT(*) AS n FROM notes'),
    books: count('SELECT COUNT(*) AS n FROM books'),
    answered: count("SELECT COALESCE(SUM(total),0) AS n FROM quiz_attempts"),
    streak: computeStreak(),
    bestQuiz: count(
      'SELECT COALESCE(MAX(CASE WHEN total>0 THEN ROUND(score*100.0/total) END),0) AS n FROM quiz_attempts'
    )
  }
  const unlocked: Record<string, boolean> = {
    'first-lesson': stats.lessons >= 1,
    'ten-lessons': stats.lessons >= 10,
    'first-quiz': stats.quizzes >= 1,
    'sharp-shooter': stats.bestQuiz >= 90,
    'century': stats.answered >= 100,
    'note-taker': stats.notes >= 1,
    'librarian': stats.books >= 1,
    'streak-3': stats.streak >= 3,
    'streak-7': stats.streak >= 7
  }
  const stmt = db.prepare(
    "UPDATE achievements SET unlocked_at = datetime('now') WHERE key = ? AND unlocked_at IS NULL"
  )
  for (const [key, ok] of Object.entries(unlocked)) if (ok) stmt.run(key)
}

/* ------------------------------------------------------------------ */
/* Global search                                                       */
/* ------------------------------------------------------------------ */

export function searchGlobal(q: string): SearchResult[] {
  if (!q.trim()) return []
  const db = getDb()
  const like = `%${q}%`
  const results: SearchResult[] = []

  for (const r of db
    .prepare(
      'SELECT id, title, summary, grade_level, subject_key FROM lessons WHERE title LIKE ? OR summary LIKE ? LIMIT 12'
    )
    .all(like, like) as any[]) {
    results.push({
      kind: 'lesson',
      id: String(r.id),
      title: r.title,
      snippet: r.summary,
      route: `/lesson/${r.id}`,
      gradeLevel: r.grade_level,
      subjectKey: r.subject_key
    })
  }

  for (const r of db
    .prepare('SELECT id, title, grade_level, subject_key FROM books WHERE title LIKE ? LIMIT 8')
    .all(like) as any[]) {
    results.push({
      kind: 'book',
      id: String(r.id),
      title: r.title,
      snippet: `Grade ${r.grade_level} • ${getSubject(r.subject_key).name}`,
      route: `/reader/${r.id}`,
      gradeLevel: r.grade_level,
      subjectKey: r.subject_key
    })
  }

  for (const r of db
    .prepare('SELECT id, title, body FROM notes WHERE title LIKE ? OR body LIKE ? LIMIT 8')
    .all(like, like) as any[]) {
    results.push({
      kind: 'note',
      id: String(r.id),
      title: r.title || 'Untitled note',
      snippet: r.body.slice(0, 120),
      route: '/notes'
    })
  }

  for (const r of db
    .prepare('SELECT id, prompt, topic, grade_level, subject_key FROM questions WHERE prompt LIKE ? LIMIT 8')
    .all(like) as any[]) {
    results.push({
      kind: 'question',
      id: String(r.id),
      title: r.prompt.slice(0, 80),
      snippet: `${r.topic} • Grade ${r.grade_level}`,
      route: `/quiz?subject=${r.subject_key}&grade=${r.grade_level}`,
      gradeLevel: r.grade_level,
      subjectKey: r.subject_key
    })
  }

  return results
}
