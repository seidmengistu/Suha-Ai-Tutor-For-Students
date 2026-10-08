# Suha AI Tutor — Developer Guide

Architecture, conventions and extension points for maintaining the app.

---

## Stack & tooling

- **Electron** (main + preload + renderer) bundled with **electron-vite**.
- **React 18 + TypeScript** renderer, **Tailwind CSS** design system.
- **Zustand** (settings + UI state), **React Query** (async/data), **React Router**
  (HashRouter).
- **better-sqlite3** for local storage; **PDF.js** for the reader; **Recharts** for
  charts; **Framer Motion** for animation.
- **electron-builder** for installers.

```bash
npm install            # deps + native rebuild for Electron (postinstall)
npm run dev            # dev with HMR
npm run typecheck      # tsc for node (main/preload) + web (renderer)
npm run build          # electron-vite production bundle → out/
npm run build:win      # icon + bundle + Windows NSIS installer → release/
node scripts/smoke-db.cjs            # headless DB+seed validation (run via Electron, see below)
```

> `better-sqlite3` is compiled for **Electron's** ABI. To run a Node script that loads
> it (e.g. the smoke test), use Electron's runtime:
> `ELECTRON_RUN_AS_NODE=1 npx electron scripts/smoke-db.cjs`.

---

## Process model

```
┌─────────────── main (Node) ───────────────┐         ┌──── renderer (React) ────┐
│ index.ts: lifecycle, BrowserWindow         │         │ pages/ components/ store/ │
│ services/                                  │  IPC    │ window.api.* (typed)      │
│  database  settings  ai  rag  books        │◄──────► │ React Query + Zustand     │
│  repository  seed  admin                   │ invoke  │ AiPanel streams via events│
│ ipc/index.ts  ── ipcMain.handle(channel) ──┼─events─►│ ai.onDelta/onEnd/...      │
└────────────────────────────────────────────┘         └───────────────────────────┘
                         ▲ preload/index.ts (contextBridge) exposes window.api
```

**The contract** lives in `src/shared/` (`types.ts`, `constants.ts`) and is imported by
all three layers. IPC channel names are centralized in `constants.ts` (`IPC`). The
preload exposes a typed `window.api`; its shape is declared in
`src/preload/index.d.ts`.

### Adding an IPC endpoint

1. Add a channel to `IPC` in `src/shared/constants.ts`.
2. Implement the logic in a `src/main/services/*` module.
3. Register it in `src/main/ipc/index.ts` (`handle(IPC.x, fn)`).
4. Add a wrapper in `src/preload/index.ts` and its type in `src/preload/index.d.ts`.
5. Call `window.api.x(...)` from the renderer (wrap with React Query).

---

## Data layer (SQLite)

- Connection/lifecycle: `services/database.ts`. Schema: `db/schema.ts` (idempotent —
  acts as a migration on every start).
- Domain queries: `services/repository.ts` (curriculum, notes, bookmarks, reading,
  quiz, progress, dashboard, search, mastery, achievements).
- Stored in the OS user-data dir (`app.getPath('userData')/data/suha-tutor.db`),
  WAL mode. Settings are a separate JSON file (`settings.ts`).

### Seeding

`services/seed.ts` loads every `*.json` in `resources/seed/` (shape documented at the
top of the file), inserts chapters/lessons/questions when the DB is empty, and always
ensures the achievement rows exist. The Admin "Reset curriculum" re-seeds.

To extend the curriculum, edit/add files in `resources/seed/` following the
`SeedFile` shape. `node scripts/smoke-db.cjs` (via Electron) validates new content.

---

## Local AI

`services/ai.ts` abstracts **Ollama** (`/api/chat`, `/api/embeddings`, `/api/tags`)
and **LM Studio** (OpenAI-compatible `/v1/...`). Chat is **streamed** from the main
process to the renderer over IPC events (`ai:stream:*`); the renderer subscribes via
`window.api.ai.onDelta/onEnd/onError` (see `hooks/useAiChat.ts`).

The **system prompt** (`buildSystemPrompt`) encodes the fixed 10-step teaching
structure, Ethiopian context, Amharic support, the ` ```viz ` diagram protocol, and
injected RAG passages.

### RAG

`services/rag.ts`: page text (extracted by the renderer's PDF.js in `Reader.tsx`) →
overlapping chunks → embeddings (local) → BLOBs in `rag_chunks`. Retrieval embeds the
query and ranks by cosine similarity, returning the top passages, which the IPC layer
passes to `aiChat` as grounding. To avoid a dependency cycle, `ai.ts` never imports
`rag.ts`; the IPC handler orchestrates retrieval → chat.

---

## Renderer

- **Design tokens:** `index.css` defines CSS variables for light/dark + accent; Tailwind
  maps them to semantic classes (`bg-surface`, `text-muted`, `text-brand`, …). Theme,
  accent, font scale, motion and language are applied via `applySettingsToDom`.
- **UI kit:** `components/ui/` (`primitives`, `form`, `overlay`) — Button, Card, Badge,
  Input, Select, Slider, Switch, Segmented, Modal, Tabs, Icon (any lucide name),
  Spinner, Skeleton, EmptyState, ProgressBar.
- **Layout:** `components/layout/` (AppLayout, Sidebar, Topbar, Footer, Toaster,
  GlobalSearch, Page/PageHeader).
- **AI:** `components/ai/` (AiPanel, AiActionBar, Markdown with ` ```viz ` rendering,
  AiStatusBadge). **Visualizations:** `components/viz/VizRenderer.tsx` (SVG dispatcher).
- **Routing:** `App.tsx` (HashRouter — required for `file://` in production).
- **State:** `store/useSettingsStore.ts`, `store/useUiStore.ts` (`toast`).

### Adding a visualization kind

Add the kind to `VisualKind` in `types.ts`, implement a renderer in
`VizRenderer.tsx`, and add a `case` to its dispatcher. The AI can emit it via a
` ```viz {"kind": "...", "data": {...}} ``` ` block; lessons can include it as
`section.visual`.

### Adding a page

Create `src/renderer/src/pages/X.tsx` (`export default`), add a `<Route>` in
`App.tsx`, and a sidebar entry in `Sidebar.tsx` if needed.

---

## Packaging

`electron-builder.yml` defines the NSIS Windows installer (also DMG/AppImage).
Platform icons are auto-derived from `build/icon.png` (regenerate with
`node scripts/generate-icon.cjs`). `extraResources` bundles `resources/seed` and
`books/`; native modules and `resources/**` are `asarUnpack`-ed. Build each platform's
installer on that platform (or CI) for best results.

---

## Conventions

- All renderer data access goes through `window.api` (never touch the DB from the
  renderer). Wrap reads in React Query; invalidate on mutation.
- Keep `src/shared` dependency-free; it is the cross-layer contract.
- Prefer the semantic Tailwind tokens over hard-coded colors so theming works.
- Errors in IPC handlers are logged and re-thrown; surface user-facing failures with
  `toast`.
