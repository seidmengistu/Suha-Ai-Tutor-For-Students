/**
 * Admin/maintenance operations: export the database, create timestamped local
 * backups, and restore from a backup file.
 */
import { app, dialog } from 'electron'
import { join } from 'path'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { closeDatabase, dbPath, openDatabase } from './database'
import { seedDatabase } from './seed'
import { exportCurriculum } from './repository'
import type { BackupResult } from '@shared/types'

function backupsDir(): string {
  const dir = join(app.getPath('userData'), 'backups')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** Export the SQLite database to a user-chosen location. */
export async function exportDatabase(): Promise<BackupResult> {
  const picked = await dialog.showSaveDialog({
    title: 'Export database',
    defaultPath: `suha-tutor-${timestamp()}.db`,
    filters: [{ name: 'SQLite Database', extensions: ['db'] }]
  })
  if (picked.canceled || !picked.filePath) return { ok: false, message: 'Export cancelled.' }
  try {
    copyFileSync(dbPath(), picked.filePath)
    return { ok: true, path: picked.filePath, message: `Database exported to ${picked.filePath}` }
  } catch (e) {
    return { ok: false, message: `Export failed: ${(e as Error).message}` }
  }
}

/** Create a timestamped backup of the database and settings. */
export function backup(): BackupResult {
  try {
    const dir = join(backupsDir(), `backup-${timestamp()}`)
    mkdirSync(dir, { recursive: true })
    copyFileSync(dbPath(), join(dir, 'suha-tutor.db'))
    if (existsSync(settingsPath())) copyFileSync(settingsPath(), join(dir, 'settings.json'))
    return { ok: true, path: dir, message: `Backup created at ${dir}` }
  } catch (e) {
    return { ok: false, message: `Backup failed: ${(e as Error).message}` }
  }
}

/** Restore the database from a chosen .db file, then relaunch the app. */
export async function restore(): Promise<BackupResult> {
  const picked = await dialog.showOpenDialog({
    title: 'Restore database from backup',
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    properties: ['openFile']
  })
  if (picked.canceled || picked.filePaths.length === 0)
    return { ok: false, message: 'Restore cancelled.' }
  try {
    closeDatabase()
    copyFileSync(picked.filePaths[0], dbPath())
    openDatabase()
    return { ok: true, message: 'Database restored. The app will now restart.' }
  } catch (e) {
    openDatabase()
    return { ok: false, message: `Restore failed: ${(e as Error).message}` }
  }
}

/**
 * Export all generated chapters/lessons/questions to a seed JSON. Drop the file
 * into resources/seed/ (replacing the sample curriculum.json) and rebuild, so
 * every student gets the content with no AI required.
 */
export async function exportContentPack(): Promise<BackupResult> {
  const data = exportCurriculum()
  const defaultPath = join(app.getAppPath(), 'resources', 'seed', 'curriculum.json')
  const picked = await dialog.showSaveDialog({
    title: 'Export content pack (bundled lessons & questions)',
    defaultPath,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (picked.canceled || !picked.filePath) return { ok: false, message: 'Export cancelled.' }
  try {
    writeFileSync(
      picked.filePath,
      JSON.stringify({ version: data.version, subjects: data.subjects }, null, 2),
      'utf-8'
    )
    const { chapters, lessons, questions } = data.counts
    return {
      ok: true,
      path: picked.filePath,
      message: `Exported ${chapters} chapters, ${lessons} lessons and ${questions} questions to ${picked.filePath}. Rebuild to bundle it.`
    }
  } catch (e) {
    return { ok: false, message: `Export failed: ${(e as Error).message}` }
  }
}

export function reseed(): BackupResult {
  try {
    seedDatabase(true)
    return { ok: true, message: 'Curriculum content was reset to the bundled defaults.' }
  } catch (e) {
    return { ok: false, message: `Reseed failed: ${(e as Error).message}` }
  }
}
