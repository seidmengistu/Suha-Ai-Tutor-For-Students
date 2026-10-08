/**
 * Headless smoke test for the data layer (no Electron required):
 *  1. loads better-sqlite3 (the native module)
 *  2. applies the real schema from src/main/db/schema.ts
 *  3. parses and inserts the bundled seed JSON exactly like seed.ts
 *  4. validates question answers and lesson-section types
 *
 *   node scripts/smoke-db.cjs
 */
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')

// 1) extract SCHEMA_SQL from the TS source (it's a backtick template literal)
const schemaTs = fs.readFileSync(path.join(root, 'src/main/db/schema.ts'), 'utf8')
const sql = schemaTs.slice(schemaTs.indexOf('`') + 1, schemaTs.lastIndexOf('`'))

const db = new Database(':memory:')
db.exec(sql)
console.log('✓ schema applied to in-memory database')

const SECTION_TYPES = new Set([
  'introduction', 'objectives', 'theory', 'worked-example', 'visual', 'notes',
  'common-mistakes', 'memory-tips', 'practice', 'revision', 'summary', 'glossary', 'exam-tips'
])
const DIFFICULTIES = new Set(['beginner', 'medium', 'difficult', 'exam'])

const insChapter = db.prepare(
  'INSERT INTO chapters(subject_key, grade_level, order_index, title, description) VALUES(?,?,?,?,?)'
)
const insLesson = db.prepare(
  `INSERT INTO lessons(chapter_id, subject_key, grade_level, order_index, title, summary, estimated_minutes, sections_json, flashcards_json)
   VALUES(?,?,?,?,?,?,?,?,?)`
)
const insQuestion = db.prepare(
  `INSERT INTO questions(subject_key, grade_level, chapter_id, topic, difficulty, type, prompt, options_json, answer, explanation, source)
   VALUES(?,?,?,?,?,?,?,?,?,?, 'seed')`
)

let chapters = 0, lessons = 0, questions = 0, visuals = 0
const problems = []

const seedDir = path.join(root, 'resources/seed')
for (const file of fs.readdirSync(seedDir).filter((f) => f.endsWith('.json'))) {
  const parsed = JSON.parse(fs.readFileSync(path.join(seedDir, file), 'utf8'))
  for (const subject of parsed.subjects) {
    let chOrder = 0
    for (const ch of subject.chapters ?? []) {
      const chId = Number(insChapter.run(subject.subjectKey, subject.gradeLevel, chOrder++, ch.title, ch.description ?? '').lastInsertRowid)
      chapters++
      let lsOrder = 0
      for (const ls of ch.lessons ?? []) {
        for (const s of ls.sections ?? []) {
          if (!SECTION_TYPES.has(s.type)) problems.push(`${file}: bad section type "${s.type}" in "${ls.title}"`)
          if (s.visual) visuals++
        }
        insLesson.run(chId, subject.subjectKey, subject.gradeLevel, lsOrder++, ls.title, ls.summary ?? '', ls.estimatedMinutes ?? 15, JSON.stringify(ls.sections ?? []), JSON.stringify(ls.flashcards ?? []))
        lessons++
      }
      for (const q of ch.questions ?? []) {
        if (!DIFFICULTIES.has(q.difficulty)) problems.push(`${file}: bad difficulty "${q.difficulty}"`)
        if (q.type === 'mcq') {
          const idx = Number(q.answer)
          if (!Number.isInteger(idx) || idx < 0 || idx >= (q.options?.length ?? 0))
            problems.push(`${file}: answer index ${q.answer} out of range for "${String(q.prompt).slice(0, 40)}…"`)
        }
        insQuestion.run(subject.subjectKey, subject.gradeLevel, chId, q.topic ?? ch.title, q.difficulty ?? 'beginner', q.type ?? 'mcq', q.prompt, JSON.stringify(q.options ?? []), String(q.answer), q.explanation ?? '')
        questions++
      }
    }
    // Subject-level extra questions (no chapter) — mirrors seed.ts insertSubjects.
    for (const q of subject.questions ?? []) {
      if (!DIFFICULTIES.has(q.difficulty)) problems.push(`${file}: bad difficulty "${q.difficulty}"`)
      if (q.type === 'mcq' || !q.type) {
        const idx = Number(q.answer)
        if (!Number.isInteger(idx) || idx < 0 || idx >= (q.options?.length ?? 0))
          problems.push(`${file}: answer index ${q.answer} out of range for "${String(q.prompt).slice(0, 40)}…"`)
      }
      insQuestion.run(subject.subjectKey, subject.gradeLevel, null, q.topic ?? '', q.difficulty ?? 'beginner', q.type ?? 'mcq', q.prompt, JSON.stringify(q.options ?? []), String(q.answer), q.explanation ?? '')
      questions++
    }
  }
}

// round-trip a couple of queries the app actually runs
const qCount = db.prepare('SELECT COUNT(*) n FROM questions').get().n
const byGrade = db.prepare('SELECT grade_level g, COUNT(*) n FROM chapters GROUP BY grade_level ORDER BY g').all()

console.log(`✓ inserted: ${chapters} chapters, ${lessons} lessons, ${questions} questions, ${visuals} visuals`)
console.log('✓ chapters by grade:', byGrade.map((r) => `G${r.g}:${r.n}`).join('  '))
console.log(`✓ questions table round-trip: ${qCount}`)

if (problems.length) {
  console.log(`\n✗ ${problems.length} content problem(s):`)
  problems.slice(0, 20).forEach((p) => console.log('  - ' + p))
  process.exit(1)
}
console.log('\n✓ SMOKE TEST PASSED — data layer + seed content are valid')
db.close()
