#!/usr/bin/env node
/**
 * Pull-request gate for the requirement-description length limit.
 *
 * The bundled CLI reports an over-long ADDED description as a warning, but it
 * leaves MODIFIED descriptions alone because their text is the existing
 * requirement. This gate classifies every active change against the main-spec
 * baselines with the review classifier, so a pull request fails before an apply
 * review would be refused. It is the same rule, run earlier.
 */

import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { resolveBundledCli } from '../lib/openspec.js'
import { OFFICIAL_LENGTH_HANDLING, classifyRequirementLength } from '../lib/review/length.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Raised for a malformed command line. */
export class UsageError extends Error {}

/**
 * The command line help.
 * @returns usage text.
 */
export function usage() {
  return [
    'usage: node scripts/check-requirement-length.mjs [--change <name>] [--root <dir>]',
    '',
    'Read every active change and fail when a requirement description would',
    'exceed the archive limit after its delta merge.',
  ].join('\n')
}

/**
 * Parse the command line.
 * @param argv - arguments after the script name.
 * @returns `{ help }` or `{ change, root }`.
 */
export function parseArgs(argv) {
  const options = { change: undefined, root: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--help' || value === '-h') return { help: true }
    if (value === '--change' || value === '--root') {
      const next = argv[index + 1]
      if (next === undefined || next === '' || next.startsWith('--')) throw new UsageError(`${value} needs a value`)
      if (value === '--change') options.change = next
      else options.root = next
      index += 1
      continue
    }
    throw new UsageError(`unknown argument '${value}'`)
  }
  return options
}

/**
 * List the active change names under a project root.
 * @param root - project root.
 * @param only - optional single change name to keep.
 * @returns active change names, sorted.
 * @throws Error when the change root is missing, UsageError when the named change is not active.
 */
export function listActiveChanges(root, only) {
  const directory = join(root, 'openspec', 'changes')
  if (!existsSync(directory)) throw new Error(`the OpenSpec change root ${directory} does not exist`)
  const names = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive')
    .map((entry) => entry.name)
    .sort()
  if (only === undefined) return names
  if (!names.includes(only)) throw new UsageError(`the change '${only}' is not an active change under ${directory}`)
  return [only]
}

/**
 * Run the bundled CLI and parse one JSON projection.
 * @param cli - absolute path to `bin/openspec.js`.
 * @param root - working directory for the CLI.
 * @param args - arguments after the executable.
 * @returns parsed JSON object.
 * @throws Error when the CLI cannot run, fails, or returns no readable object.
 */
export function showJson(cli, root, args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' })
  if (result.error !== undefined) throw new Error(`cannot run the bundled OpenSpec CLI: ${result.error.message}`)
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(`openspec ${args.join(' ')} failed${detail === '' ? '' : `: ${detail}`}`)
  }
  let json
  try {
    json = JSON.parse(result.stdout)
  } catch {
    throw new Error(`openspec ${args.join(' ')} returned no JSON`)
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error(`openspec ${args.join(' ')} returned an unreadable projection`)
  }
  return json
}

/**
 * Classify one change's delta against the main-spec baselines.
 * @param cli - absolute path to `bin/openspec.js`.
 * @param root - project root.
 * @param change - change name.
 * @returns the classifier report.
 */
export function checkChange(cli, root, change) {
  const shown = showJson(cli, root, ['show', change, '--type', 'change', '--json'])
  if (!Array.isArray(shown.deltas)) throw new Error(`openspec show ${change} returned no delta list`)
  const deltas = shown.deltas
  const mainSpecs = new Map()
  for (const spec of new Set(deltas.map((delta) => (typeof delta?.spec === 'string' ? delta.spec : '')).filter((name) => name !== ''))) {
    const segments = spec.split('/')
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) continue
    const path = join(root, 'openspec', 'specs', ...segments, 'spec.md')
    if (!existsSync(path)) {
      mainSpecs.set(spec, null)
      continue
    }
    const projection = showJson(cli, root, ['show', spec, '--type', 'spec', '--json'])
    if (!Array.isArray(projection.requirements)) throw new Error(`openspec show ${spec} returned no requirements`)
    mainSpecs.set(spec, projection.requirements)
  }
  return classifyRequirementLength(deltas, mainSpecs)
}

/**
 * One blocking entry as a summary table row.
 * @param change - change name.
 * @param issue - classifier issue.
 * @returns row fields, all strings.
 */
export function entryRow(change, issue) {
  return {
    change,
    path: issue.path,
    operation: issue.operation,
    requirement: issue.requirement,
    length: String(issue.length),
    baseline: issue.baseline === undefined ? 'n/a' : String(issue.baseline),
  }
}

/**
 * Render the actionable report for the blocking entries.
 * @param rows - rendered table rows.
 * @param locations - `{ path, line }` edit locations, with `line` possibly undefined.
 * @param limit - the requirement description limit.
 * @returns Markdown block.
 */
export function renderReport(rows, locations, limit) {
  return [
    '## Requirement length gate',
    '',
    `An archive merge would exceed the ${String(limit)}-character requirement description limit. This check applies the same rule as the apply review, before any review starts.`,
    '',
    '| change | path | operation | requirement | length | baseline |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.change} | ${row.path} | ${row.operation} | ${row.requirement} | ${row.length} | ${row.baseline} |`),
    '',
    'Official handling:',
    '',
    ...OFFICIAL_LENGTH_HANDLING.map((line) => `- ${line}`),
    '',
    'Edit:',
    '',
    ...locations.map((location) => `- ${location.path}${location.line === undefined ? '' : `:${String(location.line)}`}`),
    '',
    'Verify:',
    '',
    '`npm run check:requirement-length`; pushing the fix reruns CI.',
    '',
  ].join('\n')
}

/** Escape one workflow-command value. */
function escapeCommandValue(text) {
  return String(text).replace(/%/gu, '%25').replace(/\r/gu, '%0D').replace(/\n/gu, '%0A')
}

/**
 * Escape one workflow-command property value.
 * @param text - property text.
 * @returns text safe for a `key=value` annotation property.
 */
export function escapeCommandProperty(text) {
  return escapeCommandValue(text).replace(/:/gu, '%3A').replace(/,/gu, '%2C')
}

/**
 * Locate the delta file and requirement heading for one issue.
 * @param root - project root.
 * @param change - change name.
 * @param issue - classifier issue.
 * @returns `{ file, line }`, with `line` undefined when the heading is absent.
 */
export function requirementLocation(root, change, issue) {
  const file = join(root, 'openspec', 'changes', change, ...issue.path.split('/'))
  if (!existsSync(file)) return { file, line: undefined }
  let lines
  try {
    lines = readFileSync(file, 'utf8').split('\n')
  } catch {
    return { file, line: undefined }
  }
  const heading = `### Requirement: ${issue.requirement}`
  const index = lines.findIndex((line) => line.trim() === heading)
  return { file, line: index === -1 ? undefined : index + 1 }
}

/**
 * Report blocking entries as annotations and one actionable report.
 * @param root - project root.
 * @param blockers - `{ change, issues }` entries.
 * @param limit - the classifier's requirement description limit.
 * @param env - environment, for `GITHUB_STEP_SUMMARY`.
 * @param write - stdout sink.
 * @param error - stderr sink.
 * @returns 0 when there is nothing to report, otherwise 1.
 */
export function reportBlockers(root, blockers, limit, env = process.env, write = (text) => process.stdout.write(text), error = (text) => process.stderr.write(text)) {
  const rows = []
  const locations = []
  for (const blocker of Array.isArray(blockers) ? blockers : []) {
    for (const issue of Array.isArray(blocker?.issues) ? blocker.issues : []) {
      rows.push(entryRow(blocker.change, issue))
      const { file, line } = requirementLocation(root, blocker.change, issue)
      locations.push({ path: relative(root, file), line })
      const baseline = issue.baseline === undefined ? 'n/a' : String(issue.baseline)
      const message = `${issue.path}: ${issue.operation} "${issue.requirement}" is ${String(issue.length)} characters (baseline ${baseline})`
      const location = line === undefined ? `file=${escapeCommandProperty(file)}` : `file=${escapeCommandProperty(file)},line=${String(line)}`
      write(`::error ${location},title=Requirement length::${escapeCommandValue(message)}\n`)
    }
  }
  if (rows.length === 0) return 0
  const report = renderReport(rows, locations, limit)
  write(`${report}\n`)
  const summaryPath = env.GITHUB_STEP_SUMMARY
  if (typeof summaryPath === 'string' && summaryPath !== '') appendFileSync(summaryPath, `${report}\n`)
  write('requirement length gate: failed\n')
  return 1
}

/**
 * Run the gate.
 * @param argv - arguments after the script name.
 * @param env - environment, for `GITHUB_STEP_SUMMARY`.
 * @param write - stdout sink.
 * @param error - stderr sink.
 * @param deps - optional `{ cli }` override for tests.
 * @returns exit code: 0 pass, 1 blocking entry, 2 usage or CLI failure.
 */
export function main(argv = process.argv.slice(2), env = process.env, write = (text) => process.stdout.write(text), error = (text) => process.stderr.write(text), deps = {}) {
  let options
  try {
    options = parseArgs(argv)
  } catch (cause) {
    error(`${cause instanceof Error ? cause.message : String(cause)}\n${usage()}\n`)
    return 2
  }
  if (options.help === true) {
    write(`${usage()}\n`)
    return 0
  }
  try {
    const root = options.root === undefined ? ROOT : resolve(options.root)
    const names = listActiveChanges(root, options.change)
    const cli = typeof deps.cli === 'string' && deps.cli !== '' ? deps.cli : resolveBundledCli()
    const blockers = []
    let limit = 0
    for (const name of names) {
      const report = checkChange(cli, root, name)
      if (!report.blocking) continue
      blockers.push({ change: name, issues: report.issues })
      limit = report.limit
    }
    if (blockers.length === 0) {
      write('requirement length gate: ok\n')
      return 0
    }
    return reportBlockers(root, blockers, limit, env, write, error)
  } catch (cause) {
    error(`requirement length gate: ${cause instanceof Error ? cause.message : String(cause)}\n`)
    return 2
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main()
}
