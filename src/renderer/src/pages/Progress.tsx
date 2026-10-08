import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { Page, PageHeader } from '@/components/layout/Page'
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
  cssColor,
  masteryTone
} from '@/components/dashboard/shared'
import { useSettingsStore } from '@/store/useSettingsStore'
import { getSubject } from '@shared/constants'
import { formatMinutes } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Summary stat                                                        */
/* ------------------------------------------------------------------ */
function SummaryStat({
  icon,
  label,
  value
}: {
  icon: string
  label: string
  value: React.ReactNode
}): JSX.Element {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Icon name={icon} size={20} />
        </div>
        <div>
          <p className="text-xs text-muted">{label}</p>
          <p className="font-display text-xl font-bold tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Loading skeleton                                                    */
/* ------------------------------------------------------------------ */
function ProgressSkeleton(): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function Progress(): JSX.Element {
  const navigate = useNavigate()
  const grade = useSettingsStore((s) => s.settings.currentGrade)

  const dashboardQ = useQuery({
    queryKey: ['dashboard', grade],
    queryFn: () => window.api.progress.dashboard(grade)
  })
  const masteryQ = useQuery({
    queryKey: ['mastery', grade],
    queryFn: () => window.api.progress.mastery(grade)
  })
  const historyQ = useQuery({
    queryKey: ['quiz-history', grade],
    queryFn: () => window.api.quiz.history(grade)
  })

  const dashboard = dashboardQ.data
  const mastery = masteryQ.data ?? []
  const history = historyQ.data ?? []

  const weekTotal = useMemo(
    () => (dashboard?.weeklyMinutes ?? []).reduce((sum, d) => sum + d.minutes, 0),
    [dashboard]
  )

  // Quiz scores over time (oldest -> newest) as a percentage.
  const scoreSeries = useMemo(
    () =>
      [...history]
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map((a, i) => ({
          index: i + 1,
          score: a.total ? Math.round((a.score / a.total) * 100) : 0,
          label: new Date(
            a.createdAt.includes('T') ? a.createdAt : a.createdAt.replace(' ', 'T') + 'Z'
          ).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        })),
    [history]
  )

  const sortedMastery = useMemo(
    () => [...mastery].sort((a, b) => a.mastery - b.mastery),
    [mastery]
  )

  const isLoading = dashboardQ.isLoading || masteryQ.isLoading || historyQ.isLoading

  return (
    <Page wide>
      <PageHeader
        title="Progress & Insights"
        subtitle={`A deeper look at how your Grade ${grade} learning is going`}
        icon="LineChart"
        actions={
          <Button icon="ListChecks" variant="outline" onClick={() => navigate('/quiz')}>
            Take a quiz
          </Button>
        }
      />

      {isLoading || !dashboard ? (
        <ProgressSkeleton />
      ) : (
        <div className="space-y-6">
          {/* Summary stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryStat icon="Clock" label="Studied this week" value={formatMinutes(weekTotal)} />
            <SummaryStat
              icon="GraduationCap"
              label="Lessons completed"
              value={dashboard.lessonsCompleted}
            />
            <SummaryStat icon="ClipboardList" label="Quizzes taken" value={dashboard.quizzesTaken} />
            <SummaryStat
              icon="Target"
              label="Average score"
              value={dashboard.quizzesTaken ? `${Math.round(dashboard.averageQuizScore)}%` : '-'}
            />
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Weekly study area chart */}
            <Card>
              <CardHeader className="flex items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Icon name="CalendarDays" size={18} className="text-brand" />
                  Weekly study time
                </CardTitle>
                <span className="text-xs text-muted">Minutes per day</span>
              </CardHeader>
              <CardContent className="pt-2">
                {weekTotal === 0 ? (
                  <EmptyState
                    icon="Clock"
                    title="No study time logged"
                    description="Read a textbook or open a lesson to start tracking your time."
                  />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart
                      data={dashboard.weeklyMinutes}
                      margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="studyFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={cssColor('--brand')} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={cssColor('--brand')} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
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
                      <Tooltip content={<ChartTooltip suffix=" min" />} />
                      <Area
                        type="monotone"
                        dataKey="minutes"
                        name="studied"
                        stroke={cssColor('--brand')}
                        strokeWidth={2.5}
                        fill="url(#studyFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Quiz scores line chart */}
            <Card>
              <CardHeader className="flex items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Icon name="TrendingUp" size={18} className="text-brand" />
                  Quiz scores over time
                </CardTitle>
                <span className="text-xs text-muted">% correct</span>
              </CardHeader>
              <CardContent className="pt-2">
                {scoreSeries.length === 0 ? (
                  <EmptyState
                    icon="ListChecks"
                    title="No quizzes yet"
                    description="Take your first quiz to start charting your scores."
                    action={
                      <Button size="sm" icon="Play" onClick={() => navigate('/quiz')}>
                        Start a quiz
                      </Button>
                    }
                  />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart
                      data={scoreSeries}
                      margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} stroke={cssColor('--border')} strokeDasharray="4 4" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 12, fill: cssColor('--muted') }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                        tick={{ fontSize: 12, fill: cssColor('--muted') }}
                      />
                      <Tooltip content={<ChartTooltip suffix="%" />} />
                      <Line
                        type="monotone"
                        dataKey="score"
                        name="score"
                        stroke={cssColor('--brand')}
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: cssColor('--brand'), strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Topic mastery */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Icon name="BarChartHorizontal" size={18} className="text-brand" />
                Topic mastery
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {sortedMastery.length === 0 ? (
                <EmptyState
                  icon="Brain"
                  title="No mastery data yet"
                  description="Answer quiz questions to build a picture of your strengths and gaps across topics."
                  action={
                    <Button size="sm" icon="Play" onClick={() => navigate('/quiz')}>
                      Practice now
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y divide-border">
                  {sortedMastery.map((t, i) => {
                    const tone = masteryTone(t.mastery)
                    const pct = Math.round(t.mastery * 100)
                    return (
                      <li
                        key={`${t.subjectKey}-${t.topic}-${i}`}
                        className="flex items-center gap-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">{t.topic}</p>
                            <Badge variant="outline">{getSubject(t.subjectKey).name}</Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-muted">
                            {t.correct}/{t.attempts} correct ·{' '}
                            {t.attempts} {t.attempts === 1 ? 'attempt' : 'attempts'}
                          </p>
                        </div>
                        <div className="w-32 shrink-0 sm:w-44">
                          <ProgressBar value={pct} barClassName={tone.bar} />
                        </div>
                        <span className={`w-10 shrink-0 text-right text-sm font-semibold ${tone.text}`}>
                          {pct}%
                        </span>
                        {t.mastery < 0.5 ? (
                          <Button
                            size="sm"
                            variant="subtle"
                            icon="Dumbbell"
                            onClick={() =>
                              navigate(`/quiz?subject=${t.subjectKey}&grade=${grade}`)
                            }
                          >
                            Practice
                          </Button>
                        ) : (
                          <span className="w-[92px] shrink-0" />
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Achievements */}
          {dashboard.achievements.length > 0 && (
            <Card>
              <CardHeader className="flex items-center justify-between pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Icon name="Award" size={18} className="text-brand" />
                  Achievements
                </CardTitle>
                <Badge variant="brand">
                  {dashboard.achievements.filter((a) => a.unlockedAt).length}/
                  {dashboard.achievements.length}
                </Badge>
              </CardHeader>
              <CardContent className="pt-0">
                <AchievementsGrid achievements={dashboard.achievements} />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </Page>
  )
}
