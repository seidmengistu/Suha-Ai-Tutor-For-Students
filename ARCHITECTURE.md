# Suha AI Tutor — Desktop (Electron)

This folder is the **desktop app** (Electron — Windows / macOS / Linux).
The **Android app** now lives in a separate sibling folder:
`../Suha Ai Tutor mobile/`.

---

## Folders

| Folder / file | What |
|---|---|
| `src/renderer/` | The React UI — every page, component, hook, store and style. |
| `src/shared/` | Shared contract: `types.ts`, `constants.ts` (curriculum constants, `DEFAULT_SETTINGS`). |
| `src/main/` | Electron main process: `services/` (DB via **better-sqlite3**, `repository`, `ai`, `rag`, `books`, `paperExams`, `seed`, `settings`), `db/schema.ts`, `ipc/` (handlers), `index.ts` (window + startup). |
| `src/preload/` | The `window.api` bridge (`index.ts`) + its **type contract** (`index.d.ts`). |
| `electron.vite.config.ts`, `electron-builder.yml` | Build + packaging config. |
| `books/`, `resources/seed/`, `paper-exams/` | Content bundled into the installer. |

## Build

- `npm run build:win` / `npm run build:mac` / `npm run build:linux` → installer in `release/`.

## Where to add a feature

| Add… | Edit… |
|---|---|
| A screen / UI / behaviour | `src/renderer/` |
| New data query or AI logic | `src/main/services/repository.ts` or `ai.ts` |
| A new `window.api` method | `src/main/ipc/` + `src/preload/` (and the type in `src/preload/index.d.ts`) |
| New seed content | `resources/seed/` |

---

## ⚠️ Note on the desktop ↔ mobile split

The desktop and Android apps were split into two independent folders on
**2026-06-29**. Each folder now has its **own copy** of the React UI
(`src/renderer`) and the shared types (`src/shared`).

➡️ **A UI/behaviour change that should appear on BOTH apps must be made in both
folders** — typically by copying the changed file from `src/renderer/...` here to
the same path in `../Suha Ai Tutor mobile/`. See that folder's `ARCHITECTURE.md`
for the mobile side.
