import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Page, PageHeader } from '@/components/layout/Page'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Icon,
  Input,
  Label,
  Modal,
  Segmented,
  Select,
  Slider,
  Switch
} from '@/components/ui'
import { useSettingsStore } from '@/store/useSettingsStore'
import {
  ACCENTS,
  DEFAULT_AI_BASE_URLS,
  DEFAULT_AI_MODELS,
  GRADE_LEVELS
} from '@shared/constants'
import { cn } from '@/lib/utils'
import { toast } from '@/store/useUiStore'
import type { AiProvider, AiSettings, GradeLevel, Language, ThemeMode } from '@shared/types'

/** Application settings: Local AI, Appearance and Learning. */
export default function Settings(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const reset = useSettingsStore((s) => s.reset)
  const [confirmReset, setConfirmReset] = useState(false)

  const setAi = (patch: Partial<AiSettings>): void => {
    void update({ ai: { ...settings.ai, ...patch } })
  }

  return (
    <Page>
      <PageHeader
        title="Settings"
        subtitle="Tune the AI, appearance and learning experience"
        icon="Settings"
        actions={
          <Button variant="outline" icon="RotateCcw" onClick={() => setConfirmReset(true)}>
            Reset to defaults
          </Button>
        }
      />

      <div className="space-y-6">
        <LocalAiSection ai={settings.ai} setAi={setAi} />
        <AppearanceSection settings={settings} update={update} />
        <LearningSection settings={settings} update={update} />
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset all settings?"
        size="sm"
      >
        <div className="p-5">
          <p className="text-sm text-muted">
            This restores every setting, AI, appearance and learning, to its default value.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="RotateCcw"
              onClick={async () => {
                await reset()
                setConfirmReset(false)
                toast.success('Settings reset to defaults')
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </Modal>
    </Page>
  )
}

/* ------------------------------------------------------------------ */
/* Shared field row                                                    */
/* ------------------------------------------------------------------ */
function Field({
  label,
  hint,
  description,
  children
}: {
  label: string
  hint?: string
  description?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      {children}
      {description && <p className="mt-1.5 text-xs text-muted">{description}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Local AI                                                            */
/* ------------------------------------------------------------------ */
function LocalAiSection({
  ai,
  setAi
}: {
  ai: AiSettings
  setAi: (patch: Partial<AiSettings>) => void
}): JSX.Element {
  const [customModel, setCustomModel] = useState('')
  const [health, setHealth] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const { data: models, refetch, isFetching } = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => window.api.ai.models(),
    staleTime: 1000 * 30
  })

  const modelOptions = Array.from(new Set([...(models ?? []), ai.model].filter(Boolean)))

  async function testConnection(): Promise<void> {
    setTesting(true)
    setHealth(null)
    try {
      const h = await window.api.ai.health()
      setHealth({ ok: h.ok, message: h.message })
      if (h.ok) toast.success('Connected to local AI')
      else toast.error('Local AI is offline')
      void refetch()
    } catch {
      setHealth({ ok: false, message: 'Could not reach the local AI server.' })
      toast.error('Connection test failed')
    } finally {
      setTesting(false)
    }
  }

  function switchProvider(provider: AiProvider): void {
    // Also reset the base URL and a sensible default model for that provider.
    setAi({ provider, baseUrl: DEFAULT_AI_BASE_URLS[provider], model: DEFAULT_AI_MODELS[provider] })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Icon name="Cpu" size={18} className="text-brand" /> Local AI
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Field
          label="Provider"
          description="Run AI on this computer with LM Studio or Ollama (fully offline), or use Groq online, great for a low-end PC (needs internet + a free API key)."
        >
          <Segmented<AiProvider>
            value={ai.provider}
            onChange={switchProvider}
            options={[
              { value: 'lmstudio', label: 'LM Studio', icon: 'MonitorSmartphone' },
              { value: 'ollama', label: 'Ollama', icon: 'Container' },
              { value: 'groq', label: 'Groq · online', icon: 'Cloud' }
            ]}
          />
        </Field>

        {ai.provider === 'groq' && (
          <Field
            label="Groq API key"
            description="Get one free at console.groq.com/keys. Stored only on this device."
          >
            <Input
              type="password"
              value={ai.apiKey}
              placeholder="gsk_…"
              onChange={(e) => setAi({ apiKey: e.target.value })}
            />
          </Field>
        )}

        <Field
          label="Base URL"
          description="The address of your local AI server."
        >
          <div className="flex gap-2">
            <Input
              value={ai.baseUrl}
              placeholder={DEFAULT_AI_BASE_URLS[ai.provider]}
              onChange={(e) => setAi({ baseUrl: e.target.value })}
            />
            <Button
              variant="outline"
              onClick={() => setAi({ baseUrl: DEFAULT_AI_BASE_URLS[ai.provider] })}
            >
              Use default
            </Button>
          </div>
        </Field>

        <Field
          label="Chat model"
          hint={`Recommended: ${ai.provider === 'groq' ? 'llama-3.3-70b-versatile' : 'qwen3:8b'}`}
          description="Pick a model your server has loaded, or type a custom name below."
        >
          <div className="flex gap-2">
            <Select
              value={modelOptions.includes(ai.model) ? ai.model : ''}
              onChange={(e) => e.target.value && setAi({ model: e.target.value })}
            >
              {modelOptions.length === 0 && <option value="">No models detected</option>}
              {!modelOptions.includes(ai.model) && ai.model && (
                <option value="">Custom: {ai.model}</option>
              )}
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              icon="RefreshCw"
              loading={isFetching}
              onClick={() => refetch()}
            >
              Refresh
            </Button>
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              placeholder="Or type a custom model (e.g. qwen3:8b)"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customModel.trim()) {
                  setAi({ model: customModel.trim() })
                  setCustomModel('')
                }
              }}
            />
            <Button
              variant="secondary"
              disabled={!customModel.trim()}
              onClick={() => {
                setAi({ model: customModel.trim() })
                setCustomModel('')
              }}
            >
              Set
            </Button>
          </div>
        </Field>

        <Field
          label="Embedding model"
          hint="Recommended: nomic-embed-text"
          description={
            ai.provider === 'groq'
              ? 'Groq has no embeddings API, so textbook search (RAG) is unavailable on Groq, the bundled lessons still work.'
              : 'Used for textbook search (RAG). Ollama: nomic-embed-text.'
          }
        >
          <Input
            value={ai.embeddingModel}
            placeholder="nomic-embed-text"
            disabled={ai.provider === 'groq'}
            onChange={(e) => setAi({ embeddingModel: e.target.value })}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Temperature" hint={ai.temperature.toFixed(2)}>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={ai.temperature}
              onChange={(e) => setAi({ temperature: Number(e.target.value) })}
            />
            <p className="mt-1.5 text-xs text-muted">Lower = focused, higher = creative.</p>
          </Field>
          <Field label="Max tokens" hint={String(ai.maxTokens)}>
            <Slider
              min={256}
              max={8192}
              step={128}
              value={ai.maxTokens}
              onChange={(e) => setAi({ maxTokens: Number(e.target.value) })}
            />
            <p className="mt-1.5 text-xs text-muted">Longest answer the model may produce.</p>
          </Field>
          <Field label="Top P" hint={ai.topP.toFixed(2)}>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={ai.topP}
              onChange={(e) => setAi({ topP: Number(e.target.value) })}
            />
            <p className="mt-1.5 text-xs text-muted">Nucleus sampling cutoff.</p>
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <Button icon="Plug" loading={testing} onClick={testConnection}>
            Test connection
          </Button>
          {health && (
            <Badge variant={health.ok ? 'success' : 'danger'}>
              <Icon name={health.ok ? 'CheckCircle2' : 'AlertCircle'} size={12} />
              {health.ok ? 'Online' : 'Offline'}
            </Badge>
          )}
        </div>

        {health && !health.ok && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-4">
            <div className="flex items-start gap-3">
              <Icon name="Info" size={18} className="mt-0.5 shrink-0 text-warning" />
              <div className="text-sm">
                <p className="font-medium text-fg">AI server is not reachable</p>
                <p className="mt-1 text-muted">{health.message}</p>
                <p className="mt-2 text-muted">
                  {ai.provider === 'groq'
                    ? 'Make sure you have internet access and a valid Groq API key above.'
                    : `Make sure ${ai.provider === 'ollama' ? 'Ollama' : 'LM Studio'} is running and the base URL above matches its server address.`}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Appearance                                                          */
/* ------------------------------------------------------------------ */
const ACCENT_SWATCH: Record<string, string> = {
  emerald: 'bg-emerald-500',
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500'
}

function AppearanceSection({
  settings,
  update
}: {
  settings: ReturnType<typeof useSettingsStore.getState>['settings']
  update: ReturnType<typeof useSettingsStore.getState>['update']
}): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Icon name="Palette" size={18} className="text-brand" /> Appearance
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Field label="Theme">
          <Segmented<ThemeMode>
            value={settings.theme}
            onChange={(v) => void update({ theme: v })}
            options={[
              { value: 'light', label: 'Light', icon: 'Sun' },
              { value: 'dark', label: 'Dark', icon: 'Moon' },
              { value: 'system', label: 'System', icon: 'Monitor' }
            ]}
          />
        </Field>

        <Field label="Accent colour">
          <div className="flex items-center gap-2.5">
            {Object.keys(ACCENTS).map((key) => (
              <button
                key={key}
                type="button"
                aria-label={key}
                onClick={() => void update({ accent: key })}
                className={cn(
                  'h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-surface transition-transform hover:scale-110 focus-ring',
                  ACCENT_SWATCH[key] ?? 'bg-brand',
                  settings.accent === key ? 'ring-fg/40' : 'ring-transparent'
                )}
              >
                {settings.accent === key && (
                  <Icon name="Check" size={16} className="mx-auto text-white" />
                )}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Font size" hint={`${Math.round(settings.fontScale * 100)}%`}>
          <Slider
            min={0.85}
            max={1.3}
            step={0.05}
            value={settings.fontScale}
            onChange={(e) => void update({ fontScale: Number(e.target.value) })}
          />
        </Field>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Reduce motion</p>
            <p className="text-xs text-muted">Minimise animations and transitions.</p>
          </div>
          <Switch
            checked={settings.reduceMotion}
            onChange={(v) => void update({ reduceMotion: v })}
          />
        </div>

        <Field label="Language" description="Some content and the UI adapt to your language.">
          <Segmented<Language>
            value={settings.language}
            onChange={(v) => void update({ language: v })}
            options={[
              { value: 'en', label: 'English' },
              { value: 'am', label: 'አማርኛ' }
            ]}
          />
        </Field>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Learning                                                            */
/* ------------------------------------------------------------------ */
function LearningSection({
  settings,
  update
}: {
  settings: ReturnType<typeof useSettingsStore.getState>['settings']
  update: ReturnType<typeof useSettingsStore.getState>['update']
}): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Icon name="GraduationCap" size={18} className="text-brand" /> Learning
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Field label="Current grade" description="Sets the curriculum, subjects and books you see.">
          <Select
            value={settings.currentGrade}
            onChange={(e) => void update({ currentGrade: Number(e.target.value) as GradeLevel })}
            className="max-w-[180px]"
          >
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Daily study goal" hint={`${settings.dailyGoalMinutes} min`}>
          <Slider
            min={10}
            max={120}
            step={5}
            value={settings.dailyGoalMinutes}
            onChange={(e) => void update({ dailyGoalMinutes: Number(e.target.value) })}
          />
          <p className="mt-1.5 text-xs text-muted">
            Used for your study streak and dashboard goals.
          </p>
        </Field>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Textbook grounding (RAG)</p>
            <p className="text-xs text-muted">
              Let the AI tutor cite indexed Ethiopian textbooks when answering.
            </p>
          </div>
          <Switch
            checked={settings.ragEnabled}
            onChange={(v) => void update({ ragEnabled: v })}
          />
        </div>
      </CardContent>
    </Card>
  )
}
