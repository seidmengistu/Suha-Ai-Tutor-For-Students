import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GRADE_LEVELS } from '@shared/constants'
import { subjectsForGrade } from '@shared/constants'
import { useSettingsStore } from '@/store/useSettingsStore'
import { AiPanel } from '@/components/ai/AiPanel'
import { Icon, Segmented, Select } from '@/components/ui'
import type { GradeLevel, SubjectKey } from '@shared/types'

/** Full-screen AI tutor with grade/subject grounding and RAG toggle. */
export default function Tutor(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const [grade, setGrade] = useState<GradeLevel>(settings.currentGrade)
  const [subject, setSubject] = useState<SubjectKey | ''>('')
  const [useRag, setUseRag] = useState(true)

  const subjects = subjectsForGrade(grade)

  // Grade/subject-aware starter prompts, drawn from the real curriculum so they
  // always match the selected grade (e.g. no "Newton's law" for Grade 7).
  const { data: chapters } = useQuery({
    queryKey: ['chapters', grade, subject || 'mathematics'],
    queryFn: () =>
      window.api.curriculum.chapters(grade, (subject || 'mathematics') as SubjectKey)
  })
  const suggestions = useMemo(() => {
    const titles = (chapters ?? [])
      .map((c) => c.title.replace(/^\s*(unit|chapter)\s*\d+\s*[:.\-]?\s*/i, '').trim())
      .filter(Boolean)
    if (titles.length === 0) {
      return [
        'Explain a topic with an example',
        'Quiz me on a topic',
        'Give me revision notes',
        'Help me with my homework'
      ]
    }
    const make = [
      (t: string) => `Explain ${t} with an example`,
      (t: string) => `Quiz me on ${t}`,
      (t: string) => `Revision notes for ${t}`,
      (t: string) => `Draw a diagram for ${t}`
    ]
    return titles.slice(0, 4).map((t, i) => make[i % make.length](t))
  }, [chapters])

  return (
    <div className="flex h-full flex-col px-6 py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
            <Icon name="Sparkles" size={22} />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold">AI Tutor</h1>
            <p className="text-sm text-muted">Grounded in the Ethiopian curriculum · works offline</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={grade} onChange={(e) => setGrade(Number(e.target.value) as GradeLevel)} className="w-[110px]">
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </Select>
          <Select value={subject} onChange={(e) => setSubject(e.target.value as SubjectKey)} className="w-[170px]">
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </Select>
          <Segmented
            size="sm"
            value={useRag ? 'rag' : 'norag'}
            onChange={(v) => setUseRag(v === 'rag')}
            options={[
              { value: 'rag', label: 'Textbook', icon: 'BookText' },
              { value: 'norag', label: 'General', icon: 'Brain' }
            ]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <AiPanel
          key={`${grade}-${subject}-${useRag}`}
          context={{ gradeLevel: grade, subjectKey: subject || undefined }}
          useRag={useRag}
          title="Suha AI Tutor"
          suggestions={suggestions}
        />
      </div>
    </div>
  )
}
