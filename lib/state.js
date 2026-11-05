/**
 * Apply-state cache and projections.
 *
 * `loadApplyState` runs `openspec instructions apply --json` once and keeps the
 * full payload in process memory. The model never receives that payload; it
 * receives the compact projection. Marking a task flips one checkbox and
 * updates the cached progress/next fields, so the apply loop costs one small
 * tool result per task instead of a full re-query.
 *
 * The cache is a derived view. A hash of every known tracking file detects
 * edits made outside the tools; when one is found the entry is discarded and
 * the CLI is asked again. The CLI remains the authority.
 *
 * @module dsh-openspec-flow/state
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { cacheKey, readCache, writeCache } from './cache.js'
import { hashText } from './hash.js'
import { errorFromStatus, runOpenSpec, withStore } from './openspec.js'
import { assertBuiltinSchema } from './schema.js'
import {
  describeTask,
  findTask,
  flipCheckbox,
  nextTask,
  numericIdOf,
  parseTaskLines,
  replaceLine,
} from './tasks.js'

/**
 * Read the fingerprint of every tracking file the payload knows about.
 * @param json - `instructions apply` payload.
 * @param tasks - normalized task list.
 * @returns a path-to-hash map; an unreadable path maps to null.
 */
function readHashes(json, tasks) {
  const paths = new Set()
  for (const task of tasks) {
    if (task.sourcePath !== '') paths.add(task.sourcePath)
  }
  const contextTasks = json.contextFiles?.tasks
  if (Array.isArray(contextTasks)) {
    for (const path of contextTasks) {
      if (typeof path === 'string' && path !== '') paths.add(path)
    }
  }
  if (Array.isArray(json.unavailableTrackingFiles)) {
    for (const item of json.unavailableTrackingFiles) {
      if (typeof item?.path === 'string' && item.path !== '') paths.add(item.path)
    }
  }
  const hashes = new Map()
  for (const path of paths) {
    try {
      hashes.set(path, hashText(readFileSync(path, 'utf8')))
    } catch {
      hashes.set(path, null)
    }
  }
  return hashes
}

/**
 * Read the fingerprint of files that select a schema.
 *
 * A cached apply entry is only valid while the change metadata and project
 * config still select the same schema. The fingerprints let `isStale` refresh
 * the entry through the gated CLI path when either file changes.
 *
 * @param changeDir - change directory.
 * @param projectRoot - planning root.
 * @returns a path-to-hash map; an absent or unreadable file maps to null.
 */
function readMetaHashes(changeDir, projectRoot) {
  const paths = []
  if (changeDir !== '') paths.push(join(changeDir, '.openspec.yaml'))
  if (projectRoot !== '') {
    paths.push(join(projectRoot, 'openspec', 'config.yaml'))
    paths.push(join(projectRoot, 'openspec', 'config.yml'))
  }
  const hashes = new Map()
  for (const path of paths) {
    try {
      hashes.set(path, hashText(readFileSync(path, 'utf8')))
    } catch {
      hashes.set(path, null)
    }
  }
  return hashes
}

/**
 * Reject payloads that cannot be projected.
 * @param json - parsed CLI payload.
 * @returns nothing.
 * @throws Error when the payload is a CLI error or is missing required fields.
 */
function assertApplyPayload(json) {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('openspec instructions apply returned a non-object payload.')
  }
  if (Array.isArray(json.status) && json.status.length > 0 && json.changeName === undefined) {
    throw errorFromStatus(json.status)
  }
  if (typeof json.changeName !== 'string' || !Array.isArray(json.tasks)) {
    throw new Error('openspec instructions apply returned an unexpected payload (missing changeName or tasks).')
  }
  if (typeof json.schemaName !== 'string') {
    throw new Error('openspec instructions apply returned no schemaName.')
  }
  if (typeof json.state !== 'string') {
    throw new Error('openspec instructions apply returned no state.')
  }
  if (json.progress === null || typeof json.progress !== 'object') {
    throw new Error('openspec instructions apply returned no progress.')
  }
}

/**
 * Run the CLI once and cache the full apply state.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param change - change name.
 * @param store - optional store id.
 * @param signal - cancellation.
 * @returns the cached entry.
 */
export async function loadApplyState(ctx, settings, cwd, change, store, signal) {
  const args = withStore(['instructions', 'apply', '--change', change, '--json'], store)
  const { json } = await runOpenSpec(ctx, settings, cwd, args, signal)
  assertApplyPayload(json)
  const changeDir = typeof json.changeDir === 'string' ? json.changeDir : ''
  const rootPath = json.root !== null && typeof json.root === 'object'
    && typeof json.root.path === 'string'
    ? json.root.path
    : ''
  const projectRoot = rootPath !== '' ? rootPath : changeDir !== '' ? resolve(changeDir, '../../..') : ''
  assertBuiltinSchema(json.schemaName, projectRoot, change)
  const tasks = []
  let fallbackId = 0
  for (const task of json.tasks) {
    if (task === null || typeof task !== 'object') continue
    const description = typeof task.description === 'string' ? task.description : ''
    if (description.length === 0) continue
    fallbackId += 1
    const sourcePath = typeof task.sourcePath === 'string' ? task.sourcePath : ''
    const line = Number(task.line)
    if (sourcePath === '' || !Number.isInteger(line) || line < 1) {
      throw new Error('openspec instructions apply returned a task without a usable sourcePath and line.')
    }
    tasks.push({
      id: String(task.id ?? fallbackId),
      description,
      done: task.done === true,
      sourcePath,
      line,
      numericId: numericIdOf(description),
    })
  }
  const entry = {
    change,
    changeDir,
    projectRoot,
    schemaName: typeof json.schemaName === 'string' ? json.schemaName : '',
    payload: json,
    tasks,
    hashes: readHashes(json, tasks),
    metaHashes: readMetaHashes(changeDir, projectRoot),
    cachedAt: Date.now(),
  }
  writeCache(cacheKey(cwd, change, store), entry)
  return entry
}

/**
 * Whether a known tracking file changed since the entry was cached.
 * @param entry - cached apply state.
 * @returns true when the CLI should be asked again.
 */
export function isStale(entry) {
  for (const [path, expected] of entry.hashes) {
    let actual = null
    try {
      actual = hashText(readFileSync(path, 'utf8'))
    } catch {
      actual = null
    }
    if (actual !== expected) return true
  }
  for (const [path, expected] of entry.metaHashes ?? []) {
    let actual = null
    try {
      actual = hashText(readFileSync(path, 'utf8'))
    } catch {
      actual = null
    }
    if (actual !== expected) return true
  }
  if (typeof entry.projectRoot === 'string' && entry.projectRoot !== '') {
    try {
      assertBuiltinSchema(entry.schemaName, entry.projectRoot, entry.change)
    } catch {
      return true
    }
  }
  return false
}

/**
 * Return a fresh entry, loading it when absent or stale.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param cwd - session working directory.
 * @param change - change name.
 * @param store - optional store id.
 * @param signal - cancellation.
 * @returns the cached entry.
 */
export async function ensureEntry(ctx, settings, cwd, change, store, signal) {
  const key = cacheKey(cwd, change, store)
  const cached = readCache(key)
  if (cached !== undefined && !isStale(cached)) return cached
  return loadApplyState(ctx, settings, cwd, change, store, signal)
}

/**
 * Normalize `contextFiles` to plain arrays of paths.
 * @param value - CLI contextFiles object.
 * @returns a safe object.
 */
function normalizeContextFiles(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const result = {}
  for (const [key, paths] of Object.entries(value)) {
    if (Array.isArray(paths)) {
      result[key] = paths.filter((path) => typeof path === 'string')
    }
  }
  return result
}

/**
 * Project apply state for the model.
 * @param entry - cached apply state.
 * @returns the compact apply payload.
 */
export function projectApply(entry) {
  const next = nextTask(entry.tasks)
  const payload = entry.payload
  return {
    change: payload.changeName,
    schema: payload.schemaName,
    state: payload.state,
    progress: payload.progress,
    taskCount: entry.tasks.length,
    ...(next !== null ? { next: describeTask(next) } : {}),
    contextFiles: normalizeContextFiles(payload.contextFiles),
    ...(typeof payload.instruction === 'string' && payload.instruction !== ''
      ? { instruction: payload.instruction }
      : {}),
    ...(Array.isArray(payload.missingArtifacts) && payload.missingArtifacts.length > 0
      ? { missingArtifacts: payload.missingArtifacts.map(String) }
      : {}),
    ...(Array.isArray(payload.warnings) && payload.warnings.length > 0
      ? { warnings: payload.warnings.map(String) }
      : {}),
  }
}

/**
 * Find the task's line in a freshly read tracking file.
 *
 * Line is preferred because it is what the previous tool returned; description
 * and numeric id are fallbacks for a file whose lines moved. `#N` addresses are
 * per-file in `parseTaskLines`, while the CLI's `id` is global across files, so
 * a raw `#N` search is the last resort.
 *
 * @param fileTasks - parsed tasks from the target file.
 * @param target - cached task.
 * @param taskId - caller's id.
 * @param hintLine - caller's line hint, if any.
 * @returns the matching task, or null.
 */
function findInFile(fileTasks, target, taskId, hintLine) {
  const described = fileTasks.filter((task) => task.description.length > 0)
  const line = hintLine ?? target.line
  const atLine = described.find((task) => task.line === line)
  if (atLine !== undefined && atLine.description === target.description) return atLine
  if (target.numericId !== null) {
    const byNumeric = described.find((task) => task.numericId === target.numericId)
    if (byNumeric !== undefined) return byNumeric
  }
  const byDescription = described.find((task) => task.description === target.description)
  if (byDescription !== undefined) return byDescription
  return findTask(described, taskId, {})
}

/**
 * Flip exactly one task checkbox and update the cached state.
 * @param entry - cached apply state, mutated in place.
 * @param taskId - numeric id or `#N`.
 * @param hint - optional sourcePath and line from the previous tool result.
 * @returns `{ found, status?, task? }`.
 */
export function markDone(entry, taskId, hint = {}) {
  const target = findTask(entry.tasks, taskId, hint)
  if (target === null) return { found: false }
  let content
  try {
    content = readFileSync(target.sourcePath, 'utf8')
  } catch {
    return { found: false, stale: true }
  }
  const fileTasks = parseTaskLines(content).map((task) => ({
    ...task,
    sourcePath: target.sourcePath,
  }))
  const inFile = findInFile(fileTasks, target, taskId, hint.line)
  if (inFile === null) return { found: false, stale: true }
  if (inFile.done) {
    target.done = true
    target.line = inFile.line
    target.description = inFile.description
    target.numericId = inFile.numericId
    return { found: true, status: 'already-done', task: target }
  }
  const lines = content.split('\n')
  const current = lines[inFile.line - 1]
  const flipped = flipCheckbox(current)
  if (flipped === current) {
    return { found: true, status: 'already-done', task: target }
  }
  const nextContent = replaceLine(content, inFile.line, flipped)
  writeFileSync(inFile.sourcePath, nextContent, 'utf8')
  target.done = true
  target.line = inFile.line
  target.description = inFile.description
  target.numericId = inFile.numericId
  const progress = entry.payload.progress
  if (typeof progress.complete === 'number') progress.complete += 1
  if (typeof progress.remaining === 'number') {
    progress.remaining = Math.max(0, progress.remaining - 1)
  }
  entry.payload.state = progress.remaining === 0 ? 'all_done' : 'ready'
  entry.hashes.set(inFile.sourcePath, hashText(nextContent))
  return { found: true, status: 'flipped', task: target }
}

/**
 * Project the result of a mark call.
 * @param entry - cached apply state after the call.
 * @param result - return value of `markDone`.
 * @param taskId - caller's task id.
 * @returns the compact mark payload.
 */
export function projectMark(entry, result, taskId) {
  const next = nextTask(entry.tasks)
  return {
    change: entry.payload.changeName,
    taskId,
    status: result.status,
    state: entry.payload.state,
    progress: entry.payload.progress,
    ...(next !== null ? { next: describeTask(next) } : {}),
  }
}

/**
 * Project `openspec status --json`.
 * @param json - parsed status payload.
 * @returns the compact status payload.
 */
export function projectStatus(json) {
  if (typeof json.changeName !== 'string' || typeof json.schemaName !== 'string') {
    throw new Error('openspec status returned an unexpected payload.')
  }
  const planningHome = typeof json.planningHome?.root === 'string' ? json.planningHome.root : undefined
  const artifacts = Array.isArray(json.artifacts)
    ? json.artifacts.map((artifact) => ({
      id: String(artifact.id),
      status: String(artifact.status),
      requires: Array.isArray(artifact.requires) ? artifact.requires.map(String) : [],
    }))
    : []
  const actionContext = json.actionContext !== null && typeof json.actionContext === 'object'
    ? {
      ...(typeof json.actionContext.mode === 'string' ? { mode: json.actionContext.mode } : {}),
      ...(typeof json.actionContext.sourceOfTruth === 'string'
        ? { sourceOfTruth: json.actionContext.sourceOfTruth }
        : {}),
      ...(Array.isArray(json.actionContext.allowedEditRoots)
        ? { allowedEditRoots: json.actionContext.allowedEditRoots.map(String) }
        : {}),
      ...(typeof json.actionContext.requiresAffectedAreaSelection === 'boolean'
        ? { requiresAffectedAreaSelection: json.actionContext.requiresAffectedAreaSelection }
        : {}),
      ...(Array.isArray(json.actionContext.constraints)
        ? { constraints: json.actionContext.constraints.map(String) }
        : {}),
    }
    : undefined
  return {
    change: json.changeName,
    schema: json.schemaName,
    changeRoot: typeof json.changeRoot === 'string' ? json.changeRoot : '',
    ...(planningHome !== undefined ? { planningHome } : {}),
    isPlanningComplete: json.isPlanningComplete === true,
    isComplete: json.isComplete === true,
    applyRequires: Array.isArray(json.applyRequires) ? json.applyRequires.map(String) : [],
    artifacts,
    ...(Array.isArray(json.nextSteps) ? { nextSteps: json.nextSteps.map(String) } : {}),
    ...(actionContext !== undefined && Object.keys(actionContext).length > 0 ? { actionContext } : {}),
    ...(json.root !== null && typeof json.root === 'object'
      ? { root: { path: String(json.root.path), source: String(json.root.source) } }
      : {}),
  }
}

/**
 * Project `openspec list --json`.
 * @param json - parsed list payload.
 * @returns the compact list payload.
 */
export function projectList(json) {
  const changes = Array.isArray(json.changes) ? json.changes : []
  const setup = json.root !== null && json.root !== undefined
  const issue = !setup && Array.isArray(json.status)
    ? json.status.map((item) => item.message).filter((message) => typeof message === 'string').join(' ')
    : ''
  return {
    setup,
    ...(setup
      ? { root: { path: String(json.root.path), source: String(json.root.source) } }
      : {}),
    changes: changes.map((change) => ({
      name: String(change.name),
      completedTasks: Number(change.completedTasks) || 0,
      totalTasks: Number(change.totalTasks) || 0,
      status: String(change.status),
    })),
    ...(issue !== '' ? { issue } : {}),
  }
}

/**
 * Project `openspec validate <change> --json`.
 * @param json - parsed validate payload.
 * @param change - requested change name.
 * @returns the compact validation payload.
 */
export function projectValidate(json, change) {
  const items = Array.isArray(json.items) ? json.items : []
  const item = items.find((candidate) => candidate.id === change) ?? items[0]
  if (item === undefined) {
    throw new Error(`openspec validate did not return an item for '${change}'.`)
  }
  return {
    change: String(item.id ?? change),
    valid: item.valid === true,
    issues: (Array.isArray(item.issues) ? item.issues : []).map((issue) => ({
      level: String(issue.level ?? ''),
      path: String(issue.path ?? ''),
      message: String(issue.message ?? ''),
    })),
    ...(json.root !== null && typeof json.root === 'object'
      ? { root: { path: String(json.root.path), source: String(json.root.source) } }
      : {}),
  }
}
