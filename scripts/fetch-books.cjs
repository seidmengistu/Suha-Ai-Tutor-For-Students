/**
 * Downloads official Ethiopian MoE textbooks listed in books.manifest.json into
 * books/grade-<N>/<subject>/ (where the app auto-registers them on next launch).
 *
 * The MoE e-learning server uses inconsistent path casing (e.g. "text book" vs
 * "Text Book"), so for each book we probe several URL variants and keep the first
 * that returns a real PDF. Books with an explicit "url" skip probing.
 *
 *   node scripts/fetch-books.cjs            # download everything missing
 *   node scripts/fetch-books.cjs --grade 9  # only grade 9
 *   node scripts/fetch-books.cjs --dry      # probe only, don't save
 *   node scripts/fetch-books.cjs --force    # re-download even if present
 *   node scripts/fetch-books.cjs --selftest # verify the downloader against a reachable PDF
 *
 * Note: requires network access to the MoE server (reachable from Ethiopia).
 */
const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const BOOKS_DIR = path.join(ROOT, 'books')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SuhaAITutor/1.0'

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const gradeFilter = args.includes('--grade') ? Number(args[args.indexOf('--grade') + 1]) : null

/** Encode spaces (and keep other chars) in a hand-written URL. */
function encodeSpaces(u) {
  return u.replace(/ /g, '%20')
}

/** Build a server URL from path segments, encoding each segment. */
function buildUrl(base, ...segments) {
  return base.replace(/\/+$/, '') + '/' + segments.map((s) => encodeURIComponent(s)).join('/')
}

/** Follow redirects and resolve with the final response stream. */
function request(u, redirects = 0) {
  return new Promise((resolve, reject) => {
    let parsed
    try {
      parsed = new URL(u)
    } catch {
      return reject(new Error('invalid url'))
    }
    const lib = parsed.protocol === 'https:' ? https : http
    const req = lib.get(
      parsed,
      { headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*' } },
      (res) => {
        const code = res.statusCode || 0
        if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
          res.resume()
          if (redirects >= 6) return reject(new Error('too many redirects'))
          return resolve(request(new URL(res.headers.location, parsed).toString(), redirects + 1))
        }
        resolve(res)
      }
    )
    req.on('error', reject)
    req.setTimeout(45000, () => req.destroy(new Error('timeout')))
  })
}

/** Download a URL to dest, but only if it is a real PDF. */
async function fetchToFile(u, dest) {
  let res
  try {
    res = await request(u)
  } catch (e) {
    return { ok: false, reason: e.message }
  }
  if ((res.statusCode || 0) !== 200) {
    res.resume()
    return { ok: false, reason: `HTTP ${res.statusCode}` }
  }
  return new Promise((resolve) => {
    const tmp = dest + '.part'
    const ws = fs.createWriteStream(tmp)
    let checked = false
    let valid = false
    res.on('data', (chunk) => {
      if (!checked) {
        checked = true
        valid = chunk.slice(0, 5).toString('latin1').startsWith('%PDF')
        if (!valid) {
          res.destroy()
          ws.destroy()
          try { fs.unlinkSync(tmp) } catch { /* noop */ }
          return resolve({ ok: false, reason: 'not a PDF (got HTML?)' })
        }
      }
      if (valid) ws.write(chunk)
    })
    res.on('end', () => {
      if (!valid) return
      ws.end(() => {
        try {
          fs.renameSync(tmp, dest)
          resolve({ ok: true, bytes: fs.statSync(dest).size })
        } catch (e) {
          resolve({ ok: false, reason: e.message })
        }
      })
    })
    res.on('error', (e) => {
      ws.destroy()
      try { fs.unlinkSync(tmp) } catch { /* noop */ }
      resolve({ ok: false, reason: e.message })
    })
  })
}

/** Candidate URLs for a book, covering the MoE server's casing inconsistencies. */
function candidates(book, baseUrl) {
  if (book.url) return [encodeSpaces(book.url)]
  const folder = book.remoteFolder || book.subject
  const subdirs = ['text book', 'Text Book', 'TextBook', 'Text book']
  const names = [
    `${book.name} Student G${book.grade}.pdf`,
    `${book.name} Students G${book.grade}.pdf`,
    `${book.name} Student Grade ${book.grade}.pdf`,
    `${book.name} G${book.grade}.pdf`
  ]
  const out = []
  for (const sd of subdirs) for (const n of names) out.push(buildUrl(baseUrl, folder, sd, n))
  return out
}

function destFor(book) {
  const dir = path.join(BOOKS_DIR, `grade-${book.grade}`, book.subject)
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `${book.name} Student G${book.grade}.pdf`)
}

async function selftest() {
  // A known-good, reachable MoE PDF (the national curriculum framework).
  const url =
    'https://moe.gov.et/storage/Books/Curriculum%20Framework%20for%20Ethiopian%20Education%20(KG%20%E2%80%93%20Grade%2012).pdf'
  const tmp = path.join(require('os').tmpdir(), 'suha-selftest.pdf')
  console.log('Self-test: downloading a known MoE PDF to verify the downloader…')
  const r = await fetchToFile(url, tmp)
  if (r.ok) {
    console.log(`✓ downloader works — fetched ${(r.bytes / 1024).toFixed(0)} KB and validated the PDF header`)
    try { fs.unlinkSync(tmp) } catch { /* noop */ }
    process.exit(0)
  } else {
    console.log(`✗ self-test failed: ${r.reason}`)
    process.exit(1)
  }
}

async function main() {
  if (has('--selftest')) return selftest()

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'books.manifest.json'), 'utf8'))
  const baseUrl = manifest.baseUrl
  let books = manifest.books
  if (gradeFilter) books = books.filter((b) => b.grade === gradeFilter)

  console.log(`Fetching ${books.length} textbook(s) from ${baseUrl} …\n`)
  let ok = 0
  let skipped = 0
  const failed = []

  for (const book of books) {
    const label = `Grade ${book.grade} ${book.name}`
    if (book.skip) {
      console.log(`• ${label}: skipped (${book.note || 'provide manually'})`)
      skipped++
      continue
    }
    const dest = destFor(book)
    if (fs.existsSync(dest) && !has('--force')) {
      console.log(`• ${label}: already present, skipping`)
      skipped++
      continue
    }

    let done = false
    for (const url of candidates(book, baseUrl)) {
      if (has('--dry')) {
        console.log(`  would try: ${url}`)
        continue
      }
      const r = await fetchToFile(url, dest)
      if (r.ok) {
        console.log(`✓ ${label}: ${(r.bytes / 1024 / 1024).toFixed(1)} MB`)
        ok++
        done = true
        break
      }
    }
    if (!done && !has('--dry')) {
      console.log(`✗ ${label}: not found (add an exact "url" in books.manifest.json)`)
      failed.push(label)
    }
  }

  console.log(`\nDone. Downloaded ${ok}, skipped ${skipped}, failed ${failed.length}.`)
  if (failed.length) {
    console.log('Could not find:', failed.join(', '))
    console.log('Tip: open each book on neaea.com / fetena.net, copy its PDF link into books.manifest.json, then re-run.')
  }
}

main().catch((e) => {
  console.error('fetch-books failed:', e)
  process.exit(1)
})
