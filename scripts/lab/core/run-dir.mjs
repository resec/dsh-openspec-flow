/**
 * Per-run directory and evidence lifecycle.
 *
 * A failing run always keeps its full directory. A passing run copies the
 * evidence out of the disposable home and project into `artifacts/` before
 * the default cleanup removes them, so report paths always survive.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { RUNS } from './paths.mjs'

/**
 * Create one run directory.
 * @param options - optional display name and run root.
 * @returns the run paths.
 */
export function createRun({ name = 'run', base = RUNS, now = Date.now() } = {}) {
  const id = `${new Date(now).toISOString().replace(/[:.]/g, '-')}-${process.pid}-${Math.random().toString(16).slice(2, 8)}`
  const directory = join(base, id)
  const run = {
    id,
    name,
    dir: directory,
    home: join(directory, 'home'),
    agentsHome: join(directory, 'agents-home'),
    project: join(directory, 'project'),
    artifacts: join(directory, 'artifacts'),
    createdAt: new Date(now).toISOString(),
  }
  for (const path of [run.home, run.agentsHome, run.project, run.artifacts]) {
    mkdirSync(path, { recursive: true })
  }
  return run
}

/**
 * Write one JSON file.
 * @param path - destination.
 * @param value - JSON value.
 * @returns nothing.
 */
export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * Copy session logs and card files into the kept artifacts.
 * @param run - run paths.
 * @returns the copied paths.
 */
export function copyEvidence(run) {
  const copied = []
  const sessions = join(run.home, 'sessions')
  if (existsSync(sessions)) {
    const target = join(run.artifacts, 'sessions')
    cpSync(sessions, target, { recursive: true })
    copied.push(target)
  }
  const reviewRoot = join(run.project, 'openspec', '.review')
  if (existsSync(reviewRoot)) {
    const target = join(run.artifacts, 'cards')
    mkdirSync(target, { recursive: true })
    for (const entry of readdirSync(reviewRoot)) {
      const cards = join(reviewRoot, entry, 'cards')
      if (!existsSync(cards)) continue
      for (const file of readdirSync(cards)) {
        const name = `${entry.replaceAll('#', '_')}-${basename(file)}`
        cpSync(join(cards, file), join(target, name))
      }
    }
    copied.push(target)
  }
  return copied
}

/**
 * Finish one run: copy evidence, write the report and apply cleanup options.
 * @param run - run paths.
 * @param options - passed verdict, report, keep and cleanup flags.
 * @returns `{ runDir, kept, copied }`.
 */
export function finalizeRun(run, { passed, report, keep = false, cleanup = false }) {
  const copied = passed ? copyEvidence(run) : []
  writeJson(join(run.artifacts, 'report.json'), {
    ...report,
    runDir: run.dir,
    artifacts: run.artifacts,
    createdAt: run.createdAt,
    copiedEvidence: copied,
  })
  if (!passed) return { runDir: run.dir, kept: true, copied }
  if (cleanup) {
    rmSync(run.dir, { recursive: true, force: true })
    return { runDir: null, kept: false, copied }
  }
  if (!keep) {
    for (const path of [run.home, run.agentsHome, run.project]) {
      rmSync(path, { recursive: true, force: true })
    }
  }
  return { runDir: run.dir, kept: true, copied }
}
