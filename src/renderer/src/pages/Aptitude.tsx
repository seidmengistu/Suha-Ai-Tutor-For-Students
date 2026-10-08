import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { APTITUDE_CATEGORIES } from '@shared/constants'
import { useSettingsStore } from '@/store/useSettingsStore'
import { Page, PageHeader } from '@/components/layout/Page'
import { Badge, Button, Icon, Label, Modal, Select } from '@/components/ui'
import { QuizRunner } from '@/components/quiz/QuizRunner'
import { toast } from '@/store/useUiStore'
import { cn } from '@/lib/utils'
import type { Difficulty, Question } from '@shared/types'

type AptitudeCategory = (typeof APTITUDE_CATEGORIES)[number]

/* ------------------------------------------------------------------ */
/* Category presentation                                               */
/* ------------------------------------------------------------------ */

const CATEGORY_META: Record<AptitudeCategory, { icon: string; color: string; desc: string }> = {
  'Logical Reasoning': {
    icon: 'BrainCircuit',
    color: 'from-fuchsia-500 to-purple-600',
    desc: 'Deduce conclusions from statements, syllogisms and logical rules.'
  },
  'Numerical Reasoning': {
    icon: 'Calculator',
    color: 'from-sky-500 to-blue-600',
    desc: 'Solve number series, ratios, percentages and quantitative puzzles.'
  },
  'Pattern Recognition': {
    icon: 'Shapes',
    color: 'from-amber-500 to-orange-600',
    desc: 'Spot the rule behind sequences of numbers, letters and figures.'
  },
  'Spatial Reasoning': {
    icon: 'Box',
    color: 'from-emerald-500 to-teal-600',
    desc: 'Visualise shapes, rotations, folding and 3-D relationships.'
  },
  'Verbal Reasoning': {
    icon: 'MessageSquareText',
    color: 'from-rose-500 to-pink-600',
    desc: 'Analogies, vocabulary and reasoning with words and meaning.'
  },
  'Critical Thinking': {
    icon: 'Lightbulb',
    color: 'from-cyan-500 to-indigo-600',
    desc: 'Evaluate arguments, assumptions and evidence to reason clearly.'
  }
}

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'medium', label: 'Medium' },
  { value: 'difficult', label: 'Difficult' },
  { value: 'exam', label: 'Exam level' }
]

const COUNT = 10

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Aptitude(): JSX.Element {
  const navigate = useNavigate()
  const grade = useSettingsStore((s) => s.settings.currentGrade)

  const [selected, setSelected] = useState<AptitudeCategory | null>(null)
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [questions, setQuestions] = useState<Question[] | null>(null)

  /* ---- load questions for a category ------------------------------ */
  const load = useMutation({
    mutationFn: async (category: AptitudeCategory): Promise<Question[]> => {
      // Prefer seeded questions for this category when present.
      try {
        const seeded = await window.api.quiz.questions({
          gradeLevel: grade,
          subjectKey: 'aptitude',
          topic: category,
          difficulty,
          limit: COUNT
        })
        if (seeded.length > 0) return seeded
      } catch {
        // Ignore and fall through to AI generation.
      }

      // Otherwise generate with the local AI.
      return window.api.quiz.generate({
        gradeLevel: grade,
        subjectKey: 'aptitude',
        topic: category,
        difficulty,
        count: COUNT
      })
    },
    onSuccess: (data) => {
      if (data.length === 0) {
        toast.error(
          'No questions available. The local AI server may be offline, start it, or try "Learn this skill" with the tutor.'
        )
        return
      }
      setQuestions(data)
      setSelected(null)
    },
    onError: () => {
      toast.error('Could not generate aptitude questions. Is your local AI server running?')
    }
  })

  const backToCategories = (): void => {
    setQuestions(null)
    setSelected(null)
    load.reset()
  }

  /* ================================================================ */
  /* Active practice                                                   */
  /* ================================================================ */
  if (questions && questions.length > 0) {
    return (
      <Page>
        <PageHeader
          title="Aptitude"
          subtitle={`${questions[0]?.topic ?? 'Practice'} · Grade ${grade}`}
          icon="BrainCircuit"
          actions={
            <Button variant="outline" icon="LayoutGrid" onClick={backToCategories}>
              All skills
            </Button>
          }
        />
        <QuizRunner
          questions={questions}
          mode="practice"
          gradeLevel={grade}
          subjectKey="aptitude"
          onExit={backToCategories}
        />
      </Page>
    )
  }

  /* ================================================================ */
  /* Category grid                                                     */
  /* ================================================================ */
  return (
    <Page>
      <PageHeader
        title="Aptitude"
        subtitle="Sharpen your reasoning, AI-generated, no textbook required"
        icon="BrainCircuit"
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {APTITUDE_CATEGORIES.map((category, i) => {
          const meta = CATEGORY_META[category]
          return (
            <motion.button
              key={category}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => setSelected(category)}
              className="group card overflow-hidden p-0 text-left transition-all hover:-translate-y-0.5 hover:shadow-glass focus-ring"
            >
              <div
                className={cn(
                  'relative flex h-24 items-center justify-between overflow-hidden bg-gradient-to-br p-5 text-white',
                  meta.color
                )}
              >
                <Icon name={meta.icon} size={36} className="opacity-90" />
                <Badge variant="brand" className="bg-white/20 text-white">
                  <Icon name="Sparkles" size={11} /> AI
                </Badge>
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold">{category}</h3>
                  <Icon
                    name="ArrowUpRight"
                    size={18}
                    className="text-muted opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </div>
                <p className="mt-1 text-sm text-muted">{meta.desc}</p>
              </div>
            </motion.button>
          )
        })}
      </div>

      {/* Category action modal */}
      <Modal
        open={selected !== null}
        onClose={() => (load.isPending ? undefined : setSelected(null))}
        title={selected ?? undefined}
        size="md"
      >
        {selected && (
          <div className="p-5">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white',
                  CATEGORY_META[selected].color
                )}
              >
                <Icon name={CATEGORY_META[selected].icon} size={22} />
              </div>
              <p className="text-sm text-muted">{CATEGORY_META[selected].desc}</p>
            </div>

            <div className="mt-5">
              <Label hint="Used for AI generation">Difficulty</Label>
              <Select
                value={difficulty}
                disabled={load.isPending}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <Button
                className="flex-1"
                size="lg"
                icon="Play"
                loading={load.isPending}
                onClick={() => load.mutate(selected)}
              >
                {load.isPending ? 'Preparing…' : 'Practice'}
              </Button>
              <Button
                className="flex-1"
                size="lg"
                variant="outline"
                icon="GraduationCap"
                disabled={load.isPending}
                onClick={() => navigate('/tutor')}
              >
                Learn this skill
              </Button>
            </div>

            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <Icon name="Info" size={12} />
              Practice uses seeded questions if available, otherwise generates {COUNT} with your local
              AI.
            </p>
          </div>
        )}
      </Modal>
    </Page>
  )
}
