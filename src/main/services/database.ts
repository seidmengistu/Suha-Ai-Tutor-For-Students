/**
 * Database connection + lifecycle. Opens a single better-sqlite3 instance in the
 * user's data directory, applies the schema and triggers first-run seeding.
 */
import { app } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { SCHEMA_SQL } from '../db/schema'

let db: Database.Database | null = null

/** Absolute path to the user data folder, created if missing. */
export function userDataDir(): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function dbPath(): string {
  return join(userDataDir(), 'suha-tutor.db')
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database accessed before initialization')
  return db
}

/** Open the database and apply the schema. Safe to call once at startup. */
export function openDatabase(): Database.Database {
  if (db) return db
  db = new Database(dbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)
  migrate(db)
  return db
}

/** Lightweight, idempotent column migrations for existing databases. */
function migrate(d: Database.Database): void {
  const cols = d.prepare('PRAGMA table_info(questions)').all() as { name: string }[]
  if (!cols.some((c) => c.name === 'exam_year')) {
    d.exec('ALTER TABLE questions ADD COLUMN exam_year INTEGER')
  }
}

export function closeDatabase(): void {
  db?.close()
  db = null
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setMeta(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO app_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, value)
}

export function isEmpty(): boolean {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM chapters').get() as { n: number }
  return row.n === 0
}
