import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { Page } from '@/components/layout/Page'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Icon,
  ProgressBar,
  Skeleton
} from '@/components/ui'
import {
  AchievementsGrid,
  ChartTooltip,
  cssColor
} from '@/components/dashboard/shared'
import { useSettingsStore } from '@/store/useSettingsStore'
import { getSubject } from '@shared/constants'
import { cn, formatMinutes, formatRelativeTime, percent } from '@/lib/utils'
import type { ProgressEventType, TopicMastery } from '@shared/types'

/* Icon + label per activity type. */
const ACTIVITY_META: Record<ProgressEventType, { icon: string; label: string }> = {
  'lesson-completed': { icon: 'BookOpenCheck', label: 'Completed a lesson' },
  'lesson-viewed': { icon: 'BookOpen', label: 'Viewed a lesson' },
  'quiz-completed': { icon: 'ListChecks', label: 'Finished a quiz' },
  reading: { icon: 'BookOpen', label: 'Read a textbook' },
  'ai-chat': { icon: 'Sparkles', label: 'Asked the AI tutor' },
  flashcards: { icon: 'Layers', label: 'Reviewed flashcards' }
}

/* ------------------------------------------------------------------ */
/* Stat card                                                           */
/* ------------------------------------------------------------------ */
function StatCard({
  icon,
  label,
  value,
  hint,
  tone = 'brand',
  children
}: {
  icon: string
  label: string
  value: React.ReactNode
  hint?: string
  tone?: 'brand' | 'warning' | 'success' | 'info'
  children?: React.ReactNode
}): JSX.Element {
  const toneClass = {
    brand: 'bg-brand-soft text-brand',
    warning: 'bg-warning/15 text-warning',
    success: 'bg-success/15 text-success',
    info: 'bg-info/15 text-info'
  }[tone]
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-1 font-display text-2xl font-bold tracking-tight">{value}</p>
          </div>
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', toneClass)}>
            <Icon name={icon} size={20} />
          </div>
        </div>
        {hint && <p className="text-xs text-muted">{hint}</p>}
        {children}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Topic chip                                                          */
/* ------------------------------------------------------------------ */
function TopicChip({
  topic,
  tone,
  onPractice
}: {
  topic: TopicMastery
  tone: 'warning' | 'success'
  onPractice?: () => void
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full border py-1 pl-3 pr-1 text-xs',
        tone === 'warning'
          ? 'border-warning/30 bg-warning/10 text-warning'
          : 'border-success/30 bg-success/10 text-success'
      )}
    >
      <span className="font-medium">{topic.topic}</span>
      <span className="opacity-70">{Math.round(topic.mastery * 100)}%</span>
      {tone === 'warning' && onPractice && (
        <button
          onClick={onPractice}
          className="rounded-full bg-warning/20 px-2 py-0.5 font-semibold hover:bg-warning/30 focus-ring"
        >
          Practice
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Loading skeleton                                                    */
/* ------------------------------------------------------------------ */
function DashboardSkeleton(): JSX.Element {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function Dashboard(): JSX.Element {
  const navigate = useNavigate()
  const grade = useSettingsStore((s) => s.settings.currentGrade)

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', grade],
    queryFn: () => window.api.progress.dashboard(grade)
  })

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  })()

  return (
    <Page wide>
      {/* Greeting header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {greeting} <span className="align-middle">👋</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            Welcome back to your Grade {grade} study space. Let&apos;s keep the momentum going.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data?.continueReading && (
            <Button
              icon="BookOpen"
              variant="primary"
              onClick={() => navigate(`/reader/${data.continueReading!.bookId}`)}
            >
              Continue reading
            </Button>
          )}
          <Button icon="Sparkles" variant="secondary" onClick={() => navigate('/tutor')}>
            Ask AI Tutor
          </Button>
          <Button icon="ListChecks" variant="outline" onClick={() => navigate('/quiz')}>
            Take a quiz
          </Button>
        </div>
      </div>

      {isLoading || !data ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon="Flame"
              tone="warning"
              label="Study streak"
              value={`${data.studyStreakDays} ${data.studyStreakDays === 1 ? 'day' : 'days'}`}
              hint={data.studyStreakDays > 0 ? 'Keep it alive, study today!' : 'Start your streak today'}
            />
            <StatCard
              icon="Clock"
              tone="brand"
              label="Today's study time"
              value={formatMinutes(data.todayMinutes)}
              hint={`Goal: ${formatMinutes(data.dailyGoalMinutes)}`}
            >
              <ProgressBar value={data.todayMinutes} max={data.dailyGoalMinutes || 1} />
            </StatCard>
            <StatCard
              icon="GraduationCap"
              tone="info"
              label="Lessons completed"
              value={`${data.lessonsCompleted}${data.totalLessons ? ` / ${data.totalLessons}` : ''}`}
              hint={
                data.totalLessons
                  ? `${percent(data.lessonsCompleted, data.totalLessons)}% of the curriculum`
                  : 'Open a lesson to begin'
              }
            >
              {data.totalLessons > 0 && (
                <ProgressBar value={data.lessonsCompleted} max={data.totalLessons} />
              )}
            </StatCard>
            <StatCard
              icon="Target"
              tone="success"
              label="Average quiz score"
              value={data.quizzesTaken ? `${Math.round(data.averageQuizScore)}%` : '-'}
              hint={
                data.quizzesTaken
                  ? `Across ${data.quizzesTaken} ${data.quizzesTaken === 1 ? 'quiz' : 'quizzes'}`
                  : 'Take your first quiz'
              }
            />
          </div>

          {/* Continue reading + recommended lesson */}
          {(data.continueReading || data.recommendedLesson) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.continueReading && (
                <Card className="overflow-hidden">
                  <CardHeader className="flex items-center justify-between pb-3">
                    <CardTitle className="flex items-center gap-2">
                      <Icon name="BookOpen" size={18} className="text-brand" />
                      Continue Reading
                    </CardTitle>
                    <Badge variant="brand">
                      {percent(data.continueReading.lastPage, data.continueReading.totalPages)}%
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <p className="font-display text-lg font-semibold">
                      {data.continueReading.book.title}
                    </p>
                    <p className="text-sm text-muted">
                      Page {data.continueReading.lastPage} of {data.continueReading.totalPages} ·{' '}
                      {getSubject(data.continueReading.book.subjectKey).name}
                    </p>
                    <ProgressBar
                      value={data.continueReading.lastPage}
                      max={data.continueReading.totalPages || 1}
                    />
                    <Button
                      icon="Play"
                      onClick={() => navigate(`/reader/${data.continueReading!.bookId}`)}
                    >
                      Resume
                    </Button>
                  </CardContent>
                </Card>
              )}

              {data.recommendedLesson && (
                <Card className="overflow-hidden">
                  <CardHeader className="flex items-center justify-between pb-3">
                    <CardTitle className="flex items-center gap-2">
                      <Icon name="Lightbulb" size={18} className="text-brand" />
                      Recommended for you
                    </CardTitle>
                    <Badge variant="outline">
                      {getSubject(data.recommendedLesson.subjectKey).name}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <p className="font-display text-lg font-semibold">
                      {data.recommendedLesson.title}
                    </p>
                    <p className="line-clamp-2 text-sm text-muted">
                      {data.recommendedLesson.summary}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <Icon name="Clock" size={14} />
                      {formatMinutes(data.recommendedLesson.estimatedMinutes)}
                    </div>
                    <Button
                      icon="ArrowRight"
                      onClick={() => navigate(`/lesson/${data.recommendedLesson!.id}`)}
                    >
                      Start lesson
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Weekly chart + recent activity */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Icon name="BarChart3" size={18} className="text-brand" />
                  This week
                </CardTitle>
                <span className="text-xs text-muted">Minutes studied per day</span>
              </CardHeader>
              <CardContent className="pt-2">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.weeklyMinutes} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={cssColor('--border')} strokeDasharray="4 4" />
                    <XAxis
                      dataKey="day"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: cssColor('--muted') }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={36}
                      tick={{ fontSize: 12, fill: cssColor('--muted') }}
                    />
                    <Tooltip
                      cursor={{ fill: cssColor('--surface-2'), opacity: 0.5 }}
                      content={<ChartTooltip suffix=" min" />}
                    />
                    <Bar dataKey="minutes" name="studied" radius={[6, 6, 0, 0]} maxBarSize={44}>
                      {data.weeklyMinutes.map((_, i) => (
                        <Cell key={i} fill={cssColor('--brand')} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Icon name="Activity" size={18} className="text-brand" />
                  Recent activity
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                {data.recentActivity.length === 0 ? (
                  <EmptyState
                    icon="Sparkles"
                    title="No activity yet"
                    description="Open a lesson or take a quiz to see your progress here."
                  />
                ) : (
                  <ul className="space-y-3">
                    {data.recentActivity.slice(0, 7).map((e) => {
                      const meta = ACTIVITY_META[e.type] ?? {
                        icon: 'Circle',
                        label: e.type
                      }
                      return (
                        <li key={e.id} className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                            <Icon name={meta.icon} size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {meta.label}
                              {e.topic ? <span className="text-muted"> · {e.topic}</span> : null}
                            </p>
                            <p className="text-xs text-muted">{formatRelativeTime(e.createdAt)}</p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Strengths & focus areas */}
          {(data.weakTopics.length > 0 || data.strongTopics.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Icon name="TrendingDown" size={18} className="text-warning" />
                    Focus areas
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  {data.weakTopics.length === 0 ? (
                    <p className="text-sm text-muted">
                      No weak spots detected yet. Take a few quizzes to find areas to improve.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {data.weakTopics.map((t, i) => (
                        <TopicChip
                          key={`${t.topic}-${i}`}
                          topic={t}
                          tone="warning"
                          onPractice={() =>
                            navigate(`/quiz?grade=${grade}&subject=${t.subjectKey}`)
                          }
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Icon name="TrendingUp" size={18} className="text-success" />
                    Your strengths
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  {data.strongTopics.length === 0 ? (
                    <p className="text-sm text-muted">
                      Master a few topics and they&apos;ll show up here.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {data.strongTopics.map((t, i) => (
                        <TopicChip key={`${t.topic}-${i}`} topic={t} tone="success" />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Achievements */}
          {data.achievements.length > 0 && (
            <Card>
              <CardHeader className="flex items-center justify-between pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Icon name="Award" size={18} className="text-brand" />
                  Achievements
                </CardTitle>
                <Badge variant="brand">
                  {data.achievements.filter((a) => a.unlockedAt).length}/{data.achievements.length}
                </Badge>
              </CardHeader>
              <CardContent className="pt-0">
                <AchievementsGrid achievements={data.achievements} />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </Page>
  )
}
