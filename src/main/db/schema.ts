/**
 * SQLite schema for Suha AI Tutor. Everything is stored locally in the user's
 * data directory. The schema is idempotent (CREATE TABLE IF NOT EXISTS) so it
 * doubles as a lightweight migration on every startup.
 */
export const SCHEMA_SQL = /* sql */ `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS chapters (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_key  TEXT NOT NULL,
  grade_level  INTEGER NOT NULL,
  order_index  INTEGER NOT NULL DEFAULT 0,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_chapters_subject ON chapters(grade_level, subject_key);

CREATE TABLE IF NOT EXISTS lessons (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id        INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  subject_key       TEXT NOT NULL,
  grade_level       INTEGER NOT NULL,
  order_index       INTEGER NOT NULL DEFAULT 0,
  title             TEXT NOT NULL,
  summary           TEXT NOT NULL DEFAULT '',
  estimated_minutes INTEGER NOT NULL DEFAULT 15,
  sections_json     TEXT NOT NULL DEFAULT '[]',
  flashcards_json   TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_lessons_chapter ON lessons(chapter_id);

CREATE TABLE IF NOT EXISTS questions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_key  TEXT NOT NULL,
  grade_level  INTEGER NOT NULL,
  chapter_id   INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
  lesson_id    INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
  topic        TEXT NOT NULL DEFAULT '',
  difficulty   TEXT NOT NULL DEFAULT 'beginner',
  type         TEXT NOT NULL DEFAULT 'mcq',
  prompt       TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  answer       TEXT NOT NULL,
  explanation  TEXT NOT NULL DEFAULT '',
  source       TEXT NOT NULL DEFAULT 'seed',
  exam_year    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_questions_filter
  ON questions(grade_level, subject_key, difficulty);

-- Scanned/PDF exam papers taken in "paper mode": we store only a reference to the
-- (user-supplied, permitted) PDF and its answer key — never the question text.
CREATE TABLE IF NOT EXISTS paper_exams (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  grade_level     INTEGER NOT NULL,
  subject_key     TEXT NOT NULL,
  exam_year       INTEGER,
  file_path       TEXT NOT NULL,
  num_questions   INTEGER NOT NULL DEFAULT 0,
  answer_key_json TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  grade_level INTEGER NOT NULL,
  subject_key TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  page_count  INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  indexed     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rag_chunks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page        INTEGER NOT NULL DEFAULT 0,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content     TEXT NOT NULL,
  embedding   BLOB,
  dim         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chunks_book ON rag_chunks(book_id);

CREATE TABLE IF NOT EXISTS notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT 'amber',
  grade_level INTEGER,
  subject_key TEXT,
  book_id     INTEGER REFERENCES books(id) ON DELETE SET NULL,
  page        INTEGER,
  lesson_id   INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page       INTEGER NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reading_progress (
  book_id     INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  last_page   INTEGER NOT NULL DEFAULT 1,
  total_pages INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  mode         TEXT NOT NULL,
  grade_level  INTEGER NOT NULL,
  subject_key  TEXT NOT NULL,
  chapter_id   INTEGER,
  score        INTEGER NOT NULL DEFAULT 0,
  total        INTEGER NOT NULL DEFAULT 0,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  answers_json TEXT NOT NULL DEFAULT '[]',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS progress_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,
  grade_level INTEGER,
  subject_key TEXT,
  lesson_id   INTEGER,
  topic       TEXT,
  value       REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_created ON progress_events(created_at);

CREATE TABLE IF NOT EXISTS topic_mastery (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_key TEXT NOT NULL,
  grade_level INTEGER NOT NULL,
  topic       TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  correct     INTEGER NOT NULL DEFAULT 0,
  mastery     REAL NOT NULL DEFAULT 0,
  last_seen   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(subject_key, grade_level, topic)
);

CREATE TABLE IF NOT EXISTS achievements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT 'Award',
  unlocked_at TEXT
);
`
