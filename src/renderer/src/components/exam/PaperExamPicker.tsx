import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Button, Card, Icon, Input, Label } from '@/components/ui'
import { toast } from '@/store/useUiStore'
import type { GradeLevel, PaperExam, PaperExamKeyEntry, SubjectKey } from '@shared/types'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

/** Render the first pages of a PDF to PNG data URLs (for AI vision, no OCR lib). */
async function pdfToImages(bytes: Uint8Array, maxPages = 3): Promise<string[]> {
  const doc = await pdfjsLib.getDocument({ data: bytes.slice(0), isEvalSupported: false }).promise
  const out: string[] = []
  const n = Math.min(doc.numPages, maxPages)
  for (let p = 1; p <= n; p++) {
    const page = await doc.getPage(p)
    const viewport = page.getViewport({ scale: 1.6 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    await page.render({ canvasContext: ctx, viewport }).promise
    out.push(canvas.toDataURL('image/png'))
  }
  await doc.destroy()
  return out
}

/** Parse a pasted answer key: "1. C  2) A …" or just a run of letters "C A D B". */
function parseKey(text: string): PaperExamKeyEntry[] {
  const numbered = [...text.matchAll(/(\d{1,3})\s*[).:\-]?\s*([A-Da-d])\b/g)]
  if (numbered.length >= 3) {
    const seen = new Set<number>()
    const out: PaperExamKeyEntry[] = []
    for (const m of numbered) {
      const n = Number(m[1])
      if (seen.has(n)) continue
      seen.add(n)
      out.push({ n, answer: m[2].toUpperCase() })
    }
    return out.sort((a, b) => a.n - b.n)
  }
  const letters = text.toUpperCase().match(/[A-D]/g) || []
  return letters.map((a, i) => ({ n: i + 1, answer: a }))
}

export function PaperExamPicker({
  grade,
  subjectKey,
  onPick
}: {
  grade: GradeLevel
  subjectKey: SubjectKey
  onPick: (exam: PaperExam) => void
}): JSX.Element {
  const qc = useQueryClient()
  const { data: exams } = useQuery({
    queryKey: ['paper-exams', grade, subjectKey],
    queryFn: () => window.api.paper.list(grade, subjectKey)
  })
  const [showAdd, setShowAdd] = useState(false)
  const [pdfPath, setPdfPath] = useState('')
  const [title, setTitle] = useState('')
  const [year, setYear] = useState('')
  const [keyText, setKeyText] = useState('')
  const [saving, setSaving] = useState(false)
  const [keyBusy, setKeyBusy] = useState(false)

  const parsed = parseKey(keyText)

  async function readKeyFromPdf(): Promise<void> {
    const p = await window.api.paper.pick()
    if (!p) return
    const health = await window.api.ai.health()
    if (!health.ok) {
      toast.error('AI is offline, start it in Settings (a vision-capable model is needed), or paste the key.')
      return
    }
    setKeyBusy(true)
    try {
      const bytes = await window.api.exams.readFile(p)
      if (!bytes) {
        toast.error('Could not read that PDF.')
        return
      }
      const images = await pdfToImages(bytes)
      const entries = await window.api.paper.visionKey(images)
      if (!entries.length) {
        toast.error('The AI could not read the key. Use a vision-capable model (e.g. a Groq vision model), or paste it.')
        return
      }
      setKeyText(entries.map((e) => `${e.n}. ${e.answer}`).join('  '))
      toast.success(`Read ${entries.length} answers from the sheet.`)
    } catch (e) {
      const m = String((e as Error).message || '').split(/Error:\s*/).pop()
      toast.error(
        `Could not read the key${m ? `, ${m}` : ''}. Your model must support images (a vision model), or paste the key.`
      )
    } finally {
      setKeyBusy(false)
    }
  }

  async function cleanWithAi(): Promise<void> {
    const health = await window.api.ai.health()
    if (!health.ok) {
      toast.error('AI is offline, start it in Settings, or paste the key by hand.')
      return
    }
    setKeyBusy(true)
    try {
      const entries = await window.api.paper.aiKey(keyText)
      if (!entries.length) {
        toast.error('The AI could not extract a key from that text.')
        return
      }
      setKeyText(entries.map((e) => `${e.n}. ${e.answer}`).join('  '))
      toast.success(`AI extracted ${entries.length} answers.`)
    } finally {
      setKeyBusy(false)
    }
  }

  async function pickPdf(): Promise<void> {
    const p = await window.api.paper.pick()
    if (!p) return
    setPdfPath(p)
    if (!title) setTitle((p.split(/[/\\]/).pop() || 'Exam').replace(/\.pdf$/i, ''))
  }

  async function save(): Promise<void> {
    if (!pdfPath) {
      toast.error('Choose the exam PDF first.')
      return
    }
    if (parsed.length < 1) {
      toast.error('Add the answer key (e.g. 1.C 2.A …).')
      return
    }
    setSaving(true)
    try {
      await window.api.paper.add({
        title: title.trim() || 'Exam',
        gradeLevel: grade,
        subjectKey,
        examYear: year ? Number(year) : null,
        sourcePath: pdfPath,
        answerKey: parsed
      })
      await qc.invalidateQueries({ queryKey: ['paper-exams', grade, subjectKey] })
      toast.success('Paper exam added.')
      setShowAdd(false)
      setPdfPath('')
      setTitle('')
      setYear('')
      setKeyText('')
    } catch {
      toast.error('Could not add the paper exam.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: number): Promise<void> {
    await window.api.paper.delete(id)
    void qc.invalidateQueries({ queryKey: ['paper-exams', grade, subjectKey] })
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold">Paper exams</h3>
        <Button
          variant={showAdd ? 'ghost' : 'outline'}
          size="sm"
          icon={showAdd ? 'X' : 'Plus'}
          onClick={() => setShowAdd((v) => !v)}
        >
          {showAdd ? 'Cancel' : 'Add paper exam'}
        </Button>
      </div>

      {showAdd && (
        <div className="mt-4 space-y-3 rounded-xl border border-border bg-surface-2/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" icon="FileText" onClick={pickPdf}>
              {pdfPath ? 'Change PDF' : 'Choose questions PDF'}
            </Button>
            {pdfPath && <span className="truncate text-xs text-muted">{pdfPath.split(/[/\\]/).pop()}</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Physics 2010" />
            </div>
            <div>
              <Label>Exam year (optional)</Label>
              <Input
                value={year}
                inputMode="numeric"
                placeholder="2010"
                onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
              />
            </div>
          </div>
          <div>
            <Label hint={`${parsed.length} answers detected`}>Answer key</Label>
            <div className="mb-2 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" icon="ScanText" loading={keyBusy} onClick={readKeyFromPdf}>
                Read key from answers PDF (AI)
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon="Sparkles"
                disabled={!keyText.trim() || keyBusy}
                onClick={cleanWithAi}
              >
                Clean with AI
              </Button>
            </div>
            <textarea
              value={keyText}
              onChange={(e) => setKeyText(e.target.value)}
              rows={4}
              placeholder={'Paste the key, e.g.\n1. C  2. A  3. D  4. B …\nor just: C A D B C …'}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus-ring"
            />
            <p className="mt-1 text-xs text-muted">
              Only the correct letters are stored, never the question text. Students read the questions from the
              PDF you provide.
            </p>
          </div>
          <div className="flex justify-end">
            <Button icon="Check" loading={saving} onClick={save} disabled={!pdfPath || parsed.length < 1}>
              Save paper exam
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {(exams?.length ?? 0) === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            No paper exams yet for Grade {grade}. Add one above, pick the PDF and paste its answer key.
          </p>
        ) : (
          exams!.map((ex) => (
            <div key={ex.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
              <Icon name="FileText" size={18} className="shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{ex.title}</p>
                <p className="text-xs text-muted">
                  {ex.numQuestions} questions{ex.examYear ? ` · ${ex.examYear}` : ''}
                </p>
              </div>
              <Button size="sm" icon="Play" onClick={() => onPick(ex)}>
                Take
              </Button>
              <button
                onClick={() => remove(ex.id)}
                title="Delete"
                className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-danger focus-ring"
              >
                <Icon name="Trash2" size={15} />
              </button>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
