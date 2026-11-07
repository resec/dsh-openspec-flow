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
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
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
export async function loadApplyState(ctx, settings, cwd, change, store, signal, run = runOpenSpec) {
  const args = withStore(['instructions', 'apply', '--change', change, '--json'], store)
  const { json } = await run(ctx, settings, cwd, args, signal)
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
 * Render a path relative to the resolved project root.
 *
 * Paths under the root become POSIX relative paths, with `.` for the root
 * itself. Paths outside the root and non-absolute values are returned
 * unchanged, so a registered store or an already-relative path is not
 * rewritten.
 *
 * @param root - absolute project root, or an empty string.
 * @param value - candidate path.
 * @returns the projected path.
 */
export function projectPath(root, value) {
  if (typeof root !== 'string' || root === '') return value
  if (typeof value !== 'string' || value === '' || !isAbsolute(value)) return value
  const rel = relative(root, value)
  if (rel === '') return '.'
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) return value
  return rel.split(sep).join('/')
}

/**
 * Project `openspec new change --json`.
 * @param json - parsed CLI payload.
 * @param root - absolute project root used as the path base, or an empty string.
 * @param name - requested change name.
 * @returns the change projection.
 */
export function projectNewChange(json, root, name) {
  const change = json.change ?? {}
  return {
    change: {
      id: String(change.id ?? name),
      path: projectPath(root, typeof change.path === 'string' ? change.path : ''),
      metadataPath: projectPath(root, typeof change.metadataPath === 'string' ? change.metadataPath : ''),
      schema: String(change.schema ?? ''),
    },
    ...(json.root !== null && typeof json.root === 'object'
      ? { root: { path: String(json.root.path), source: String(json.root.source) } }
      : {}),
  }
}

/**
 * Project `openspec archive --json`.
 * @param json - parsed CLI payload.
 * @param change - archived change name.
 * @param root - absolute project root used as the path base, or an empty string.
 * @param rootSource - root source reported by the list call.
 * @returns the archive projection.
 */
export function projectArchive(json, change, root, rootSource) {
  const archive = json.archive ?? {}
  return {
    change,
    valid: true,
    archived: true,
    archivedAs: String(archive.archivedAs ?? ''),
    path: projectPath(root, typeof archive.path === 'string' ? archive.path : ''),
    specsUpdated: archive.specsUpdated === true,
    ...(archive.totals !== null && typeof archive.totals === 'object'
      ? { totals: archive.totals }
      : {}),
    ...(Array.isArray(archive.warnings)
      ? { warnings: archive.warnings.map(String) }
      : {}),
    ...(typeof root === 'string' && root !== ''
      ? { root: { path: root, source: rootSource } }
      : {}),
  }
}

/**
 * Read the CLI's root source, when the payload carries one.
 * @param payload - CLI apply payload.
 * @returns the source, or an empty string.
 */
function rootSource(payload) {
  const source = payload?.root?.source
  return typeof source === 'string' ? source : ''
}

/**
 * Project one task with its source path relative to the root.
 * @param task - task with an absolute sourcePath.
 * @param root - absolute project root.
 * @returns the model-facing next task.
 */
function projectNext(task, root) {
  const described = describeTask(task)
  return { ...described, sourcePath: projectPath(root, described.sourcePath) }
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
 * Normalize and project `contextFiles` to root-relative paths.
 * @param value - CLI contextFiles object.
 * @param root - absolute project root.
 * @returns artifact id to projected paths.
 */
function projectContextFiles(value, root) {
  const normalized = normalizeContextFiles(value)
  const result = {}
  for (const [key, paths] of Object.entries(normalized)) {
    result[key] = paths.map((path) => projectPath(root, path))
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
  const root = typeof entry.projectRoot === 'string' ? entry.projectRoot : ''
  return {
    change: payload.changeName,
    schema: payload.schemaName,
    state: payload.state,
    progress: payload.progress,
    taskCount: entry.tasks.length,
    ...(next !== null ? { next: projectNext(next, root) } : {}),
    contextFiles: projectContextFiles(payload.contextFiles, root),
    ...(root !== '' ? { root: { path: root, source: rootSource(payload) } } : {}),
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
  const root = typeof entry.projectRoot === 'string' ? entry.projectRoot : ''
  return {
    change: entry.payload.changeName,
    taskId,
    status: result.status,
    state: entry.payload.state,
    progress: entry.payload.progress,
    ...(next !== null ? { next: projectNext(next, root) } : {}),
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
  const root = typeof json.root?.path === 'string' ? json.root.path : ''
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
        ? { allowedEditRoots: json.actionContext.allowedEditRoots.map((path) => projectPath(root, String(path))) }
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
    changeRoot: projectPath(root, typeof json.changeRoot === 'string' ? json.changeRoot : ''),
    ...(planningHome !== undefined ? { planningHome: projectPath(root, planningHome) } : {}),
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
 * Project `openspec list --specs --json`.
 * @param json - parsed list payload.
 * @returns the compact spec list payload.
 */
export function projectSpecList(json) {
  const specs = Array.isArray(json.specs) ? json.specs : []
  const setup = json.root !== null && json.root !== undefined
  const issue = !setup && Array.isArray(json.status)
    ? json.status.map((item) => item.message).filter((message) => typeof message === 'string').join(' ')
    : ''
  return {
    setup,
    ...(setup
      ? { root: { path: String(json.root.path), source: String(json.root.source) } }
      : {}),
    specs: specs.map((spec) => ({
      id: String(spec.id),
      requirementCount: Number(spec.requirementCount) || 0,
    })),
    ...(issue !== '' ? { issue } : {}),
  }
}

/**
 * Project `openspec context --json`.
 * @param json - parsed context payload.
 * @returns the compact context payload.
 */
export function projectContext(json) {
  const root = json.root !== null && typeof json.root === 'object'
    ? { path: String(json.root.path), source: String(json.root.source) }
    : undefined
  return {
    setup: root !== undefined,
    ...(root !== undefined ? { root } : {}),
    members: Array.isArray(json.members) ? json.members : [],
    status: (Array.isArray(json.status) ? json.status : [])
      .map((item) => String(item?.message ?? item))
      .filter((message) => message !== ''),
  }
}

/**
 * Project `openspec schemas --json`.
 * @param json - parsed schemas payload.
 * @returns the compact schemas payload.
 */
export function projectSchemas(json) {
  const list = Array.isArray(json) ? json : []
  return {
    schemas: list.map((schema) => ({
      name: String(schema.name ?? ''),
      description: String(schema.description ?? ''),
      artifacts: Array.isArray(schema.artifacts) ? schema.artifacts.map(String) : [],
      source: String(schema.source ?? ''),
    })),
  }
}

/**
 * Project `openspec store list --json`.
 * @param json - parsed store list payload.
 * @returns the compact store list payload.
 */
export function projectStoreList(json) {
  const stores = Array.isArray(json.stores) ? json.stores : []
  return {
    stores: stores.map((store) => ({
      id: String(store.id ?? ''),
      root: String(store.root ?? ''),
      ...(typeof store.metadata_path === 'string' ? { metadataPath: store.metadata_path } : {}),
    })),
    status: (Array.isArray(json.status) ? json.status : [])
      .map((item) => String(item?.message ?? item))
      .filter((message) => message !== ''),
  }
}

/**
 * Project `openspec show <name> --json`.
 * @param json - parsed show payload.
 * @returns the compact show payload.
 */
export function projectShow(json) {
  const kind = Array.isArray(json.deltas) ? 'change' : 'spec'
  const base = {
    kind,
    name: String(json.id ?? ''),
    title: String(json.title ?? ''),
  }
  const root = json.root !== null && typeof json.root === 'object'
    ? { path: String(json.root.path), source: String(json.root.source) }
    : undefined
  if (kind === 'change') {
    return {
      ...base,
      deltaCount: Number(json.deltaCount) || 0,
      deltas: (Array.isArray(json.deltas) ? json.deltas : []).map((delta) => ({
        spec: String(delta.spec ?? ''),
        operation: String(delta.operation ?? ''),
        requirements: (Array.isArray(delta.requirements) ? delta.requirements : [])
          .map(projectRequirement),
      })),
      ...(root !== undefined ? { root } : {}),
    }
  }
  return {
    ...base,
    overview: String(json.overview ?? ''),
    requirementCount: Number(json.requirementCount) || 0,
    requirements: (Array.isArray(json.requirements) ? json.requirements : [])
      .map(projectRequirement),
    ...(root !== undefined ? { root } : {}),
  }
}

/**
 * Project one requirement with its scenarios.
 * @param requirement - CLI requirement.
 * @returns the compact requirement.
 */
function projectRequirement(requirement) {
  return {
    name: String(requirement.name ?? ''),
    text: String(requirement.text ?? ''),
    scenarios: (Array.isArray(requirement.scenarios) ? requirement.scenarios : []).map((scenario) => ({
      name: String(scenario.name ?? ''),
      ...(typeof scenario.rawText === 'string' ? { rawText: scenario.rawText } : {}),
    })),
  }
}

/**
 * CLI fragments embedded in the built-in schema instruction, longest first.
 * Only backticked commands are replaced; `openspec/specs/...` paths stay.
 */
const INSTRUCTION_COMMAND_MAP = [
  [/`openspec list --specs`/gu, '`openspec_list` with `specs: true`'],
  [
    /`openspec show "<spec-id>" --type spec --json --no-scenarios`/gu,
    '`openspec_show` with `type: "spec"` and `noScenarios: true`',
  ],
  [/`openspec show "<spec-id>" --type spec`/gu, '`openspec_show` with `type: "spec"`'],
  [/`openspec validate --strict`/gu, '`openspec_validate` with `strict: true`'],
  [/`openspec validate`/gu, '`openspec_validate`'],
  [/`openspec list`/gu, '`openspec_list`'],
  [/`openspec instructions[^`]*`/gu, '`openspec_instructions`'],
]

/**
 * Replace CLI command fragments in a schema instruction with tool names.
 * @param text - instruction text.
 * @returns the mapped text.
 */
export function mapInstructionCommands(text) {
  let result = text
  for (const [pattern, replacement] of INSTRUCTION_COMMAND_MAP) {
    result = result.replace(pattern, replacement)
  }
  return result
}

/**
 * Project `openspec instructions <artifact> --json`.
 * @param json - parsed instructions payload.
 * @param artifact - requested artifact id.
 * @returns the compact instruction payload.
 */
export function projectInstructions(json, artifact) {
  const existing = Array.isArray(json.existingOutputPaths)
    ? json.existingOutputPaths.filter((path) => typeof path === 'string')
    : []
  const root = typeof json.root?.path === 'string' ? json.root.path : ''
  return {
    change: String(json.changeName ?? ''),
    artifact: String(json.artifactId ?? artifact),
    schema: String(json.schemaName ?? ''),
    outputPath: String(json.outputPath ?? ''),
    ...(typeof json.resolvedOutputPath === 'string'
      ? { resolvedOutputPath: projectPath(root, json.resolvedOutputPath) }
      : {}),
    existingOutputPaths: existing.map((path) => projectPath(root, path)),
    description: String(json.description ?? ''),
    instruction: mapInstructionCommands(String(json.instruction ?? '')),
    dependencies: Array.isArray(json.dependencies)
      ? json.dependencies.map(String)
      : [],
    unlocks: Array.isArray(json.unlocks) ? json.unlocks.map(String) : [],
    ...(json.root !== null && typeof json.root === 'object'
      ? { root: { path: String(json.root.path), source: String(json.root.source) } }
      : {}),
  }
}

/**
 * Project one validation issue.
 * @param issue - CLI issue.
 * @returns the compact issue.
 */
function projectIssue(issue) {
  return {
    level: String(issue.level ?? ''),
    path: String(issue.path ?? ''),
    message: String(issue.message ?? ''),
  }
}

/**
 * Project a multi-item `openspec validate --json` payload.
 * @param json - parsed validate payload.
 * @param scope - requested validation scope.
 * @returns the compact report.
 */
export function projectValidationReport(json, scope) {
  const items = Array.isArray(json.items) ? json.items : []
  return {
    scope,
    valid: items.every((item) => item.valid === true),
    items: items.map((item) => ({
      id: String(item.id ?? ''),
      type: String(item.type ?? ''),
      valid: item.valid === true,
      issues: (Array.isArray(item.issues) ? item.issues : []).map(projectIssue),
    })),
    ...(json.root !== null && typeof json.root === 'object'
      ? { root: { path: String(json.root.path), source: String(json.root.source) } }
      : {}),
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
