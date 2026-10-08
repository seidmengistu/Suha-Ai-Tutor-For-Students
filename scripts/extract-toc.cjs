// Extracts the opening pages (where the table of contents lives) of every book
// into .toc/<grade>-<subject>.txt so lesson authors have the real chapter list.
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const SUBJECTS = {
  7: ['english', 'mathematics', 'general-science'],
  8: ['english', 'mathematics', 'general-science'],
  9: ['english', 'mathematics', 'physics', 'chemistry', 'biology'],
  10: ['english', 'mathematics', 'physics', 'chemistry', 'biology'],
  11: ['english', 'mathematics', 'physics', 'chemistry', 'biology'],
  12: ['english', 'mathematics', 'physics', 'chemistry', 'biology']
}
;(async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const outDir = path.join(ROOT, '.toc')
  fs.mkdirSync(outDir, { recursive: true })
  for (const g of Object.keys(SUBJECTS)) {
    for (const s of SUBJECTS[g]) {
      const dir = path.join(ROOT, 'books', `grade-${g}`, s)
      if (!fs.existsSync(dir)) continue
      const pdf = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith('.pdf'))
      if (!pdf) continue
      try {
        const data = new Uint8Array(fs.readFileSync(path.join(dir, pdf)))
        const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
        const pages = Math.min(24, doc.numPages)
        let text = `BOOK: Grade ${g} ${s} — "${pdf}" (${doc.numPages} pages)\n\n`
        for (let p = 1; p <= pages; p++) {
          const page = await doc.getPage(p)
          const c = await page.getTextContent()
          const t = c.items.map((i) => ('str' in i ? i.str : '')).join(' ').replace(/\s+/g, ' ').trim()
          if (t) text += `--- page ${p} ---\n${t}\n\n`
        }
        fs.writeFileSync(path.join(outDir, `grade-${g}-${s}.txt`), text)
        console.log(`✓ grade-${g}-${s} (${pages} pages, ${doc.numPages} total)`)
      } catch (e) {
        console.log(`✗ grade-${g}-${s}: ${e.message}`)
      }
    }
  }
})()
