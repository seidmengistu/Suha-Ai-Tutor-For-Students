/**
 * Textbook library: register starter PDFs, import user PDFs, serve raw bytes to
 * the PDF.js reader, and manage deletion. Imported files are copied into the
 * user data folder so the library is self-contained.
 */
import { app, dialog } from 'electron'
import { join, basename, extname } from 'path'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync
} from 'fs'
import { getDb } from './database'
import { clearBookIndex } from './rag'
import { getSubject, subjectsForGrade } from '@shared/constants'
import { GRADE_LEVELS } from '@shared/constants'
import type {
  Book,
  GradeLevel,
  ImportBookRequest,
  ImportBookResult,
  SubjectKey
} from '@shared/types'

function booksDir(): string {
  const dir = join(app.getPath('userData'), 'books')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Folder holding bundled starter books (dev: ./books, prod: resources/books). */
function starterBooksDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'books') : join(app.getAppPath(), 'books')
}

function rowToBook(r: any): Book {
  return {
    id: r.id,
    title: r.title,
    gradeLevel: r.grade_level,
    subjectKey: r.subject_key,
    filePath: r.file_path,
    pageCount: r.page_count,
    importedAt: r.imported_at,
    indexed: r.indexed,
    chunkCount: r.chunk_count ?? undefined
  }
}

export function listBooks(filter: { gradeLevel?: GradeLevel; subjectKey?: SubjectKey } = {}): Book[] {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.gradeLevel) {
    where.push('b.grade_level = ?')
    params.push(filter.gradeLevel)
  }
  if (filter.subjectKey) {
    where.push('b.subject_key = ?')
    params.push(filter.subjectKey)
  }
  const rows = getDb()
    .prepare(
      `SELECT b.*, (SELECT COUNT(*) FROM rag_chunks c WHERE c.book_id = b.id) AS chunk_count
       FROM books b ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY b.grade_level, b.subject_key, b.title`
    )
    .all(...params)
  return rows.map(rowToBook)
}

export function getBook(id: number): Book | null {
  const row = getDb().prepare('SELECT * FROM books WHERE id = ?').get(id)
  return row ? rowToBook(row) : null
}

/** Raw PDF bytes for the reader. Returns null if the file is missing. */
export function getBookData(id: number): Uint8Array | null {
  const book = getBook(id)
  if (!book || !existsSync(book.filePath)) return null
  return readFileSync(book.filePath)
}

function insertBook(
  title: string,
  grade: GradeLevel,
  subject: SubjectKey,
  filePath: string
): Book {
  const info = getDb()
    .prepare(
      'INSERT INTO books(title, grade_level, subject_key, file_path) VALUES(?, ?, ?, ?)'
    )
    .run(title, grade, subject, filePath)
  return getBook(Number(info.lastInsertRowid))!
}

/** Open a file picker and import the chosen PDF into the library. */
export async function importBook(req: ImportBookRequest): Promise<ImportBookResult> {
  const picked = await dialog.showOpenDialog({
    title: 'Import textbook PDF',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile']
  })
  if (picked.canceled || picked.filePaths.length === 0) {
    return { ok: false, message: 'Import cancelled.' }
  }
  const src = picked.filePaths[0]
  const subjectName = getSubject(req.subjectKey).name
  const title = req.title?.trim() || basename(src, extname(src))
  const destDir = join(booksDir(), `grade-${req.gradeLevel}`, req.subjectKey)
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
  const dest = join(destDir, `${Date.now()}-${basename(src)}`)
  try {
    copyFileSync(src, dest)
  } catch (e) {
    return { ok: false, message: `Could not copy file: ${(e as Error).message}` }
  }
  const book = insertBook(title, req.gradeLevel, req.subjectKey, dest)
  return {
    ok: true,
    book,
    message: `Imported "${title}" for Grade ${req.gradeLevel} ${subjectName}.`
  }
}

export function deleteBook(id: number): void {
  const book = getBook(id)
  if (!book) return
  clearBookIndex(id)
  getDb().prepare('DELETE FROM books WHERE id = ?').run(id)
  // Only remove files we manage (inside the user data folder).
  if (book.filePath.startsWith(booksDir()) && existsSync(book.filePath)) {
    try {
      unlinkSync(book.filePath)
    } catch {
      /* ignore */
    }
  }
}

/** Update page count (called by the reader once a PDF is opened). */
export function setBookPageCount(id: number, pages: number): void {
  getDb().prepare('UPDATE books SET page_count = ? WHERE id = ?').run(pages, id)
}

/**
 * Remove book rows whose underlying PDF no longer exists, e.g. a bundled book
 * was renamed or replaced on disk. This clears stale duplicates from the library
 * (the un-openable copy) and their orphaned RAG index.
 */
export function pruneMissingBooks(): number {
  const rows = getDb().prepare('SELECT id, file_path FROM books').all() as {
    id: number
    file_path: string
  }[]
  let removed = 0
  for (const r of rows) {
    if (!existsSync(r.file_path)) {
      deleteBook(r.id)
      removed++
    }
  }
  return removed
}

/**
 * Register any bundled starter PDFs that are not yet in the library. Expects the
 * layout books/grade-N/<subject>/<file>.pdf. Missing folders are ignored, so the
 * app works fine even when shipped without textbooks (licensing-dependent).
 */
export function registerStarterBooks(): number {
  // Drop rows for books whose file was removed/renamed, so they don't linger as
  // un-openable duplicates next to the replacement.
  pruneMissingBooks()
  const root = starterBooksDir()
  if (!existsSync(root)) return 0
  let added = 0
  for (const grade of GRADE_LEVELS) {
    const subjects = subjectsForGrade(grade)
    for (const subject of subjects) {
      const dir = join(root, `grade-${grade}`, subject.key)
      if (!existsSync(dir)) continue
      for (const file of readdirSync(dir)) {
        if (extname(file).toLowerCase() !== '.pdf') continue
        const filePath = join(dir, file)
        if (!statSync(filePath).isFile()) continue
        const exists = getDb()
          .prepare('SELECT 1 FROM books WHERE file_path = ?')
          .get(filePath)
        if (exists) continue
        const title = `${subject.name}, Grade ${grade}`
        insertBook(title, grade, subject.key, filePath)
        added++
      }
    }
  }
  return added
}
