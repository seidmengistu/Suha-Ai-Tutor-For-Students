/**
 * Offline Retrieval-Augmented Generation.
 *
 * Pipeline: textbook pages (extracted by the renderer's PDF.js) -> overlapping
 * text chunks -> embeddings from the local AI server -> stored as BLOBs in
 * SQLite. At query time we embed the question and rank chunks by cosine
 * similarity, returning the top passages to ground the tutor's answer.
 */
import { getDb } from './database'
import { aiEmbed } from './ai'
import { getSettings } from './settings'
import type { GradeLevel, RagChunk, RagStatus, SubjectKey } from '@shared/types'

let busy = false
let busyMessage = ''

const CHUNK_SIZE = 900
const CHUNK_OVERLAP = 150
const EMBED_BATCH = 16

interface PageText {
  page: number
  text: string
}

/** Split a page into overlapping, sentence-aware chunks. */
function chunkPage(text: string, page: number): { page: number; index: number; content: string }[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length < 40) return []
  const chunks: { page: number; index: number; content: string }[] = []
  let start = 0
  let index = 0
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length)
    // Prefer to break on a sentence boundary near the end of the window.
    if (end < clean.length) {
      const dot = clean.lastIndexOf('. ', end)
      if (dot > start + CHUNK_SIZE * 0.5) end = dot + 1
    }
    chunks.push({ page, index: index++, content: clean.slice(start, end).trim() })
    if (end >= clean.length) break
    start = end - CHUNK_OVERLAP
  }
  return chunks
}

/* ---- embedding <-> BLOB helpers ---- */
function toBlob(vec: number[]): Buffer {
  return Buffer.from(Float32Array.from(vec).buffer)
}
function fromBlob(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
}
function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/* ------------------------------------------------------------------ */
/* Indexing                                                            */
/* ------------------------------------------------------------------ */

export async function ragIndexBook(bookId: number, pages: PageText[]): Promise<RagStatus> {
  const db = getDb()
  busy = true
  busyMessage = 'Preparing chunks…'
  try {
    const allChunks = pages.flatMap((p) => chunkPage(p.text, p.page))
    if (allChunks.length === 0) {
      db.prepare('DELETE FROM rag_chunks WHERE book_id = ?').run(bookId)
      db.prepare('UPDATE books SET indexed = 0 WHERE id = ?').run(bookId)
      return ragStatus()
    }

    // Preflight: confirm embeddings work BEFORE clearing the existing index, so a
    // missing or offline embedding model never wipes a previously good index.
    busyMessage = 'Checking embedding model…'
    await aiEmbed([allChunks[0].content.slice(0, 200)])

    // Rebuild this book's index from scratch.
    db.prepare('DELETE FROM rag_chunks WHERE book_id = ?').run(bookId)

    const insert = db.prepare(
      'INSERT INTO rag_chunks(book_id, page, chunk_index, content, embedding, dim) VALUES(?, ?, ?, ?, ?, ?)'
    )
    const insertMany = db.transaction(
      (rows: { page: number; index: number; content: string; embedding: Buffer; dim: number }[]) => {
        for (const r of rows) insert.run(bookId, r.page, r.index, r.content, r.embedding, r.dim)
      }
    )

    for (let i = 0; i < allChunks.length; i += EMBED_BATCH) {
      const batch = allChunks.slice(i, i + EMBED_BATCH)
      busyMessage = `Embedding ${Math.min(i + batch.length, allChunks.length)}/${allChunks.length}…`
      const vectors = await aiEmbed(batch.map((c) => c.content))
      insertMany(
        batch.map((c, j) => ({
          page: c.page,
          index: c.index,
          content: c.content,
          embedding: toBlob(vectors[j]),
          dim: vectors[j].length
        }))
      )
    }

    db.prepare('UPDATE books SET indexed = 1 WHERE id = ?').run(bookId)
    return ragStatus()
  } finally {
    busy = false
    busyMessage = ''
  }
}

export function clearBookIndex(bookId: number): void {
  getDb().prepare('DELETE FROM rag_chunks WHERE book_id = ?').run(bookId)
  getDb().prepare('UPDATE books SET indexed = 0 WHERE id = ?').run(bookId)
}

/* ------------------------------------------------------------------ */
/* Retrieval                                                           */
/* ------------------------------------------------------------------ */

export async function ragRetrieve(
  query: string,
  filter: { gradeLevel?: GradeLevel; subjectKey?: SubjectKey; bookId?: number; k?: number } = {}
): Promise<RagChunk[]> {
  if (!getSettings().ragEnabled) return []
  const db = getDb()
  const k = filter.k ?? 4

  // Narrow candidates by grade/subject/book before scoring.
  const conditions: string[] = ['c.embedding IS NOT NULL']
  const params: unknown[] = []
  if (filter.bookId) {
    conditions.push('c.book_id = ?')
    params.push(filter.bookId)
  } else {
    if (filter.gradeLevel) {
      conditions.push('b.grade_level = ?')
      params.push(filter.gradeLevel)
    }
    if (filter.subjectKey) {
      conditions.push('b.subject_key = ?')
      params.push(filter.subjectKey)
    }
  }

  const rows = db
    .prepare(
      `SELECT c.id, c.book_id AS bookId, c.page, c.content, c.embedding, b.title AS bookTitle
       FROM rag_chunks c JOIN books b ON b.id = c.book_id
       WHERE ${conditions.join(' AND ')}`
    )
    .all(...params) as {
    id: number
    bookId: number
    page: number
    content: string
    embedding: Buffer
    bookTitle: string
  }[]

  if (rows.length === 0) return []

  let queryVec: Float32Array
  try {
    const [vec] = await aiEmbed([query])
    queryVec = Float32Array.from(vec)
  } catch {
    return [] // embeddings unavailable (server offline) — answer without grounding
  }

  return rows
    .map((r) => ({
      id: r.id,
      bookId: r.bookId,
      bookTitle: r.bookTitle,
      page: r.page,
      content: r.content,
      score: cosine(queryVec, fromBlob(r.embedding))
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, k)
}

export function ragStatus(): RagStatus {
  const db = getDb()
  const totalBooks = (db.prepare('SELECT COUNT(*) AS n FROM books').get() as { n: number }).n
  const indexedBooks = (
    db.prepare('SELECT COUNT(*) AS n FROM books WHERE indexed = 1').get() as { n: number }
  ).n
  const totalChunks = (db.prepare('SELECT COUNT(*) AS n FROM rag_chunks').get() as { n: number }).n
  return {
    totalBooks,
    indexedBooks,
    totalChunks,
    busy,
    message: busy ? busyMessage : `${indexedBooks}/${totalBooks} books indexed · ${totalChunks} passages`
  }
}
