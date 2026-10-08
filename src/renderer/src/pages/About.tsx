import { useQuery } from '@tanstack/react-query'
import { Page } from '@/components/layout/Page'
import { Badge, Card, CardContent, Icon } from '@/components/ui'
import { APP_NAME, APP_TAGLINE, CREDIT } from '@shared/constants'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Static content                                                      */
/* ------------------------------------------------------------------ */
const FEATURES: { icon: string; title: string; description: string }[] = [
  {
    icon: 'BookOpenText',
    title: 'PDF textbook reader',
    description: 'Read Ethiopian curriculum textbooks with bookmarks and progress tracking.'
  },
  {
    icon: 'Sparkles',
    title: 'AI Tutor',
    description: 'A patient tutor that always follows a fixed, complete teaching structure.'
  },
  {
    icon: 'Database',
    title: 'Offline RAG',
    description: 'Answers are grounded in your indexed textbooks, no internet required.'
  },
  {
    icon: 'ListChecks',
    title: 'Quizzes & question banks',
    description: 'Practice, revision and mock exams across every subject and difficulty.'
  },
  {
    icon: 'LineChart',
    title: 'Progress tracking',
    description: 'Streaks, mastery, weak topics and daily goals on a personal dashboard.'
  },
  {
    icon: 'Shapes',
    title: 'Visualizations',
    description: 'Graphs, diagrams, atoms, circuits and more rendered right in lessons.'
  },
  {
    icon: 'StickyNote',
    title: 'Notes',
    description: 'Capture colour-coded notes and export them to Markdown anytime.'
  },
  {
    icon: 'BrainCircuit',
    title: 'Aptitude training',
    description: 'Logical, numerical, verbal and spatial reasoning practice.'
  }
]

const STEPS: { icon: string; title: string; description: string }[] = [
  {
    icon: 'Server',
    title: '1 · Run a local model',
    description: 'Start LM Studio or Ollama on your computer, everything stays on-device.'
  },
  {
    icon: 'BookCheck',
    title: '2 · Index your textbooks',
    description: 'Suha splits each PDF into passages and builds a private search index.'
  },
  {
    icon: 'MessagesSquare',
    title: '3 · Ask anything',
    description: 'The tutor retrieves the right passages and explains, fully offline.'
  }
]

/** Branded about page with features, tech and credit. */
export default function About(): JSX.Element {
  const { data: info } = useQuery({
    queryKey: ['app-info'],
    queryFn: () => window.api.app.info()
  })

  const openExternal = (url: string): void => {
    void window.api.app.openExternal(url)
  }

  return (
    <Page>
      {/* Hero */}
      <div className="flex flex-col items-center gap-5 py-8 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-glass">
          <Icon name="GraduationCap" size={52} />
        </div>
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">{APP_NAME}</h1>
          <p className="mt-2 text-lg text-muted">{APP_TAGLINE}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="brand">
            <Icon name="Tag" size={11} /> v{info?.version ?? '…'}
          </Badge>
          {info?.platform && <Badge variant="outline">{info.platform}</Badge>}
          <Badge variant="success">
            <Icon name="WifiOff" size={11} /> Works offline
          </Badge>
        </div>
        <p className="max-w-2xl text-balance text-sm leading-relaxed text-muted">
          Designed for Grades 7-12. Supports offline learning using local AI models (LM Studio /
          Ollama) and Ethiopian curriculum textbooks with Retrieval-Augmented Generation.
        </p>
      </div>

      {/* Features */}
      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg font-semibold">Everything in Suha</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <CardContent>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <Icon name={f.icon} size={20} />
                </div>
                <h3 className="font-display font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted">{f.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How offline AI works */}
      <section className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold">How offline AI works</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <Card key={s.title}>
              <CardContent>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-fg/70">
                  <Icon name={s.icon} size={20} />
                </div>
                <h3 className="font-display font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Credit */}
      <section className="mt-10">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-8 text-center text-white">
            <Icon name="Heart" size={26} className="mx-auto mb-3 opacity-90" />
            <p className="text-sm uppercase tracking-widest text-white/80">Made with care</p>
            <p className="mt-1 font-display text-2xl font-bold">{CREDIT}</p>
            <p className="mt-2 text-sm text-white/85">
              Built to help Ethiopian students learn, anywhere, online or off.
            </p>
            <button
              type="button"
              onClick={() => openExternal('https://ollama.com')}
              className={cn(
                'mt-5 inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur transition-colors hover:bg-white/25 focus-ring'
              )}
            >
              <Icon name="ExternalLink" size={15} /> Learn about local AI
            </button>
          </div>
        </Card>
      </section>
    </Page>
  )
}
