/**
 * "Paper mode" exams: the student reads the original (user-supplied, permitted)
 * scanned PDF and answers A–D; we store only a reference to the PDF and its
 * answer key — never the question text. This keeps imperfect-OCR papers usable
 * and respects the papers' usage rights.
 */
import { app, dialog } from 'electron'
import { join, basename } from 'path'
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { getDb } from './database'
import type { GradeLevel, PaperExam, PaperExamInput, SubjectKey } from '@shared/types'

function paperDir(): string {
  const d = join(app.getPath('userData'), 'paper-exams')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function rowToPaper(r: any): PaperExam {
  return {
    id: r.id,
    title: r.title,
    gradeLevel: r.grade_level,
    subjectKey: r.subject_key,
    examYear: r.exam_year ?? null,
    filePath: r.file_path,
    numQuestions: r.num_questions,
    answerKey: safeKey(r.answer_key_json),
    createdAt: r.created_at
  }
}
function safeKey(json: string): PaperExam['answerKey'] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/** Open a file picker for the questions PDF. */
export async function pickPaperPdf(): Promise<string | null> {
  const r = await dialog.showOpenDialog({
    title: 'Select the exam (questions) PDF',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile']
  })
  return r.canceled ? null : r.filePaths[0] ?? null
}

export function addPaperExam(input: PaperExamInput): PaperExam {
  if (!existsSync(input.sourcePath)) throw new Error('PDF not found')
  const dest = join(paperDir(), `${Date.now()}-${basename(input.sourcePath)}`)
  copyFileSync(input.sourcePath, dest)
  const key = Array.isArray(input.answerKey) ? input.answerKey : []
  const info = getDb()
    .prepare(
      `INSERT INTO paper_exams(title, grade_level, subject_key, exam_year, file_path, num_questions, answer_key_json)
       VALUES(?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.title,
      input.gradeLevel,
      input.subjectKey,
      input.examYear ?? null,
      dest,
      key.length,
      JSON.stringify(key)
    )
  return getPaperExam(Number(info.lastInsertRowid))!
}

export function listPaperExams(gradeLevel?: GradeLevel, subjectKey?: SubjectKey): PaperExam[] {
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
  const rows = getDb()
    .prepare(
      `SELECT * FROM paper_exams ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY exam_year DESC, title`
    )
    .all(...params)
  return rows.map(rowToPaper)
}

export function getPaperExam(id: number): PaperExam | null {
  const r = getDb().prepare('SELECT * FROM paper_exams WHERE id = ?').get(id)
  return r ? rowToPaper(r) : null
}

export function getPaperExamData(id: number): Uint8Array | null {
  const e = getPaperExam(id)
  if (!e || !existsSync(e.filePath)) return null
  return readFileSync(e.filePath)
}

export function deletePaperExam(id: number): void {
  const e = getPaperExam(id)
  if (!e) return
  getDb().prepare('DELETE FROM paper_exams WHERE id = ?').run(id)
  if (e.filePath.startsWith(paperDir()) && existsSync(e.filePath)) {
    try {
      unlinkSync(e.filePath)
    } catch {
      /* ignore */
    }
  }
}

/** Bundled paper-exams folder (dev: ./paper-exams, prod: resources/paper-exams). */
function bundledDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'paper-exams') : join(app.getAppPath(), 'paper-exams')
}

/**
 * Register bundled paper exams (PDF + baked answer key) on first run, so every
 * install ships with them — takeable fully offline with no AI. The PDFs and keys
 * are supplied by whoever builds the app (placed in ./paper-exams).
 */
export function registerBundledPaperExams(): number {
  const dir = bundledDir()
  const manifestPath = join(dir, 'manifest.json')
  if (!existsSync(manifestPath)) return 0
  let manifest: { exams?: unknown[] }
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch {
    return 0
  }
  const entries = Array.isArray(manifest?.exams) ? manifest.exams : []
  const db = getDb()
  const find = db.prepare(
    'SELECT 1 FROM paper_exams WHERE title = ? AND grade_level = ? AND subject_key = ? AND IFNULL(exam_year, 0) = IFNULL(?, 0)'
  )
  const ins = db.prepare(
    `INSERT INTO paper_exams(title, grade_level, subject_key, exam_year, file_path, num_questions, answer_key_json)
     VALUES(?, ?, ?, ?, ?, ?, ?)`
  )
  let added = 0
  for (const raw of entries) {
    const e = raw as any
    const file = join(dir, String(e?.file || ''))
    if (!e?.file || !existsSync(file)) continue
    const grade = Number(e.gradeLevel)
    const subject = String(e.subjectKey || '')
    const year = e.examYear != null ? Number(e.examYear) : null
    const key = Array.isArray(e.answerKey) ? e.answerKey : []
    const title = String(e.title || 'Exam')
    if (!grade || !subject || find.get(title, grade, subject, year)) continue
    ins.run(title, grade, subject, year, file, key.length, JSON.stringify(key))
    added++
  }
  return added
}

/** Export all paper exams (PDF + key) into ./paper-exams as a bundlable pack. */
export function exportPaperExams(): { count: number; dir: string } {
  const dir = join(app.getAppPath(), 'paper-exams')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const out: unknown[] = []
  for (const ex of listPaperExams()) {
    if (!existsSync(ex.filePath)) continue
    const fname = `${ex.gradeLevel}-${ex.subjectKey}-${ex.examYear ?? 'na'}-${ex.id}.pdf`.replace(
      /[^a-zA-Z0-9.\-]/g,
      ''
    )
    copyFileSync(ex.filePath, join(dir, fname))
    out.push({
      file: fname,
      title: ex.title,
      gradeLevel: ex.gradeLevel,
      subjectKey: ex.subjectKey,
      examYear: ex.examYear ?? null,
      answerKey: ex.answerKey
    })
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ version: 1, exams: out }, null, 2), 'utf-8')
  return { count: out.length, dir }
}
