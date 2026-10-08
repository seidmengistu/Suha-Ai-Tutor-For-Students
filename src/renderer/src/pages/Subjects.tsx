import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { subjectsForGrade } from '@shared/constants'
import { useSettingsStore } from '@/store/useSettingsStore'
import { Page, PageHeader } from '@/components/layout/Page'
import { Badge, Icon } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { GradeLevel, Subject } from '@shared/types'

/** Browse the subjects available for the current grade. */
export default function Subjects(): JSX.Element {
  const grade = useSettingsStore((s) => s.settings.currentGrade)
  const navigate = useNavigate()
  const subjects = subjectsForGrade(grade)

  return (
    <Page>
      <PageHeader
        title="Subjects"
        subtitle={`Grade ${grade} · Ethiopian curriculum`}
        icon="LibraryBig"
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {subjects.map((subject) => (
          <SubjectCard
            key={subject.key}
            subject={subject}
            grade={grade}
            onOpen={() =>
              subject.key === 'aptitude'
                ? navigate('/aptitude')
                : navigate(`/subject/${grade}/${subject.key}`)
            }
          />
        ))}
      </div>
    </Page>
  )
}

function SubjectCard({
  subject,
  grade,
  onOpen
}: {
  subject: Subject
  grade: GradeLevel
  onOpen: () => void
}): JSX.Element {
  // Lightweight chapter count (skipped for subjects without a textbook, e.g. Aptitude).
  const { data: chapters } = useQuery({
    queryKey: ['chapters', grade, subject.key],
    queryFn: () => window.api.curriculum.chapters(grade, subject.key),
    enabled: subject.hasTextbook,
    staleTime: 1000 * 60 * 5
  })
  const { data: qCount } = useQuery({
    queryKey: ['quiz-count', grade, subject.key],
    queryFn: () => window.api.quiz.count(grade, subject.key),
    staleTime: 1000 * 60
  })

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group card overflow-hidden p-0 text-left transition-all hover:-translate-y-0.5 hover:shadow-glass focus-ring"
    >
      <div
        className={cn(
          'relative flex h-28 items-center justify-between overflow-hidden bg-gradient-to-br p-5 text-white',
          subject.color
        )}
      >
        <Icon name={subject.icon} size={40} className="opacity-90" />
        <Icon
          name="ArrowUpRight"
          size={20}
          className="opacity-0 transition-opacity group-hover:opacity-90"
        />
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold">{subject.name}</h3>
          {subject.hasTextbook ? (
            <Badge variant="outline">
              {chapters ? `${chapters.length} chapters` : '…'}
            </Badge>
          ) : (
            <Badge variant="brand">
              <Icon name="Sparkles" size={11} /> Practice
            </Badge>
          )}
        </div>

        <p className="mt-1 text-sm text-muted">{subject.description}</p>

        {qCount != null && qCount > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <Icon name="Database" size={11} /> {qCount.toLocaleString()} questions in the bank
          </p>
        )}

        {subject.strands && subject.strands.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {subject.strands.map((strand) => (
              <Badge key={strand}>{strand}</Badge>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}
