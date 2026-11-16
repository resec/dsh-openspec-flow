#!/usr/bin/env node
/**
 * Coverage gate for the plugin scope.
 *
 * The gate never runs tests. It reads the lcov files produced by the
 * instrumented test run, validates the recorded Node version, and applies the
 * absolute, delta, and new-code thresholds.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { assertCurrentNode, parseVersion, readNodeRequirements, satisfies } from './node-version.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const METRICS = ['line', 'branch', 'function']
const SCOPES = {
  plugin: {
    lcov: '.coverage/plugin.info',
    isSource: (file) => file === 'index.js' || (file.startsWith('lib/') && file.endsWith('.js')),
  },
}

export class GateError extends Error {
  constructor(message, exitCode = 2) {
    super(message)
    this.name = 'GateError'
    this.exitCode = exitCode
  }
}

function normalizePath(file) {
  return file.replace(/^\.\//, '')
}

function runGit(root, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0 && !allowFailure) {
    throw new GateError(`git ${args.join(' ')} failed: ${(result.stderr ?? '').trim()}`)
  }
  return result
}

/**
 * Parse lcov into per-file line, branch, and function records.
 * @param text - lcov contents.
 * @returns map keyed by source path.
 */
export function parseLcov(text) {
  const files = new Map()
  let current = null
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith('SF:')) {
      current = {
        file: normalizePath(raw.slice(3)),
        lines: new Map(),
        branches: [],
        functions: [],
        functionHits: [],
      }
      files.set(current.file, current)
      continue
    }
    if (current === null) continue
    if (raw.startsWith('DA:')) {
      const [line, count] = raw.slice(3).split(',')
      current.lines.set(Number(line), Number(count))
    } else if (raw.startsWith('BRDA:')) {
      const [line, block, branch, taken] = raw.slice(5).split(',')
      current.branches.push({
        line: Number(line),
        block: Number(block),
        branch: Number(branch),
        taken: taken === '-' ? -1 : Number(taken),
      })
    } else if (raw.startsWith('FN:')) {
      const comma = raw.indexOf(',', 3)
      const line = Number(raw.slice(3, comma))
      const name = raw.slice(comma + 1)
      current.functions.push({ line, name, hit: 0 })
    } else if (raw.startsWith('FNDA:')) {
      const comma = raw.indexOf(',', 5)
      const hit = Number(raw.slice(5, comma))
      const name = raw.slice(comma + 1)
      current.functionHits.push({ name, hit })
    } else if (raw === 'end_of_record') {
      const remaining = [...current.functionHits]
      for (const entry of current.functions) {
        const index = remaining.findIndex((candidate) => candidate.name === entry.name)
        if (index !== -1) {
          entry.hit = remaining[index].hit
          remaining.splice(index, 1)
        }
      }
      current = null
    }
  }
  return files
}

/**
 * Parse added line numbers from a unified=0 diff.
 * @param text - git diff output.
 * @returns map path -> Set of added line numbers.
 */
export function parseUnifiedDiff(text) {
  const files = new Map()
  let current = null
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith('+++ ')) {
      const value = raw.slice(4).trim()
      if (value === '/dev/null') {
        current = null
        continue
      }
      let file = value
      if (file.startsWith('b/')) file = file.slice(2)
      current = new Set()
      files.set(normalizePath(file), current)
      continue
    }
    if (current === null || !raw.startsWith('@@')) continue
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(raw)
    if (match === null) continue
    const start = Number(match[1])
    const count = match[2] === undefined ? 1 : Number(match[2])
    for (let line = start; line < start + count; line += 1) current.add(line)
  }
  return files
}

function metricTotals(records) {
  const totals = {
    line: { hits: 0, total: 0 },
    branch: { hits: 0, total: 0 },
    function: { hits: 0, total: 0 },
  }
  for (const record of records) {
    for (const count of record.lines.values()) {
      totals.line.total += 1
      if (count > 0) totals.line.hits += 1
    }
    for (const branch of record.branches) {
      totals.branch.total += 1
      if (branch.taken > 0) totals.branch.hits += 1
    }
    for (const entry of record.functions) {
      totals.function.total += 1
      if (entry.hit > 0) totals.function.hits += 1
    }
  }
  return totals
}

/**
 * Aggregate one scope from a parsed lcov map.
 * @param files - parsed lcov map.
 * @param isSource - scope source predicate.
 * @returns line, branch, and function totals.
 */
export function aggregateScope(files, isSource) {
  const records = []
  for (const [file, record] of files) {
    if (isSource(file)) records.push(record)
  }
  return metricTotals(records)
}

/**
 * Compute coverage for code added relative to a base revision.
 * @param files - parsed lcov map.
 * @param added - map path -> Set of added lines, or null for a fully new file.
 * @param isSource - scope source predicate.
 * @returns new-code totals.
 */
export function newCodeTotals(files, added, isSource) {
  const totals = {
    line: { hits: 0, total: 0 },
    branch: { hits: 0, total: 0 },
    function: { hits: 0, total: 0 },
  }
  for (const [file, record] of files) {
    if (!isSource(file) || !added.has(file)) continue
    const lines = added.get(file)
    const all = lines === null
    for (const [line, count] of record.lines) {
      if (all || lines.has(line)) {
        totals.line.total += 1
        if (count > 0) totals.line.hits += 1
      }
    }
    for (const branch of record.branches) {
      if (all || lines.has(branch.line)) {
        totals.branch.total += 1
        if (branch.taken > 0) totals.branch.hits += 1
      }
    }
    for (const entry of record.functions) {
      if (entry.line !== null && (all || lines.has(entry.line))) {
        totals.function.total += 1
        if (entry.hit > 0) totals.function.hits += 1
      }
    }
  }
  return totals
}

/**
 * List uncovered new-code lines, branches, and functions with their locations.
 * @param files - parsed lcov map.
 * @param added - map path -> Set of added lines, or null for a fully new file.
 * @param isSource - scope source predicate.
 * @returns diagnostic strings.
 */
export function newCodeMisses(files, added, isSource) {
  const misses = []
  for (const [file, record] of files) {
    if (!isSource(file) || !added.has(file)) continue
    const lines = added.get(file)
    const all = lines === null
    for (const [line, count] of record.lines) {
      if ((all || lines.has(line)) && count === 0) misses.push(`${file}:${line} line`)
    }
    for (const branch of record.branches) {
      if ((all || lines.has(branch.line)) && branch.taken <= 0) misses.push(`${file}:${branch.line} branch`)
    }
    for (const entry of record.functions) {
      if (entry.line !== null && (all || lines.has(entry.line)) && entry.hit === 0) {
        misses.push(`${file}:${entry.line} function ${entry.name}`)
      }
    }
  }
  return misses
}

/**
 * Format a metric as a percentage, or null when it has no denominator.
 * @param metric - hits and total.
 * @returns percentage or null.
 */
export function percentage(metric) {
  return metric.total === 0 ? null : (metric.hits / metric.total) * 100
}

function pctText(metric) {
  const value = percentage(metric)
  return value === null ? 'n/a' : `${value.toFixed(2)}%`
}

function belowFloor(metric, floor) {
  if (metric.total === 0) return false
  return metric.hits * 100 < floor * metric.total
}

function dropExceeds(metric, baseline, maxDrop) {
  if (metric.total === 0 || baseline.total === 0) return false
  const left = (metric.hits * baseline.total - baseline.hits * metric.total) * 100
  const right = -maxDrop * metric.total * baseline.total
  return left < right
}

function listSourceFiles(root, isSource) {
  const result = runGit(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
  return result.stdout
    .split('\0')
    .map(normalizePath)
    .filter((file) => file !== '' && isSource(file) && existsSync(join(root, file)))
    .sort()
}

export function resolveBase(root, base) {
  for (const candidate of [base, 'origin/main', 'main']) {
    if (!candidate) continue
    const verify = runGit(root, ['rev-parse', '--verify', '--quiet', candidate], { allowFailure: true })
    if (verify.status !== 0) continue
    const merge = runGit(root, ['merge-base', candidate, 'HEAD'], { allowFailure: true })
    if (merge.status === 0) return merge.stdout.trim()
  }
  throw new GateError('cannot resolve a base revision for new-code coverage')
}

/**
 * Collect added lines for all in-scope source files.
 * @param root - repository root.
 * @param base - base revision or ref.
 * @param isSource - scope source predicate.
 * @returns map path -> Set of added line numbers, or null for a fully new file.
 */
export function collectAddedLines(root, base, isSource) {
  const mergeBase = resolveBase(root, base)
  const diff = runGit(root, ['-c', 'core.quotePath=false', 'diff', '--unified=0', '--no-color', '--no-ext-diff', '--find-renames', mergeBase])
  const added = parseUnifiedDiff(diff.stdout)
  const untracked = runGit(root, ['ls-files', '-z', '--others', '--exclude-standard']).stdout
    .split('\0')
    .map(normalizePath)
    .filter((file) => file !== '')
  return mergeUntrackedFiles(added, untracked, isSource)
}

/**
 * Add fully new files to the added-line map without parsing a diff.
 * @param added - existing added-line map.
 * @param files - candidate file paths.
 * @param isSource - scope source predicate.
 * @returns the same map.
 */
export function mergeUntrackedFiles(added, files, isSource) {
  for (const file of files) {
    if (isSource(file)) added.set(file, null)
  }
  return added
}

function readConfig(root) {
  return JSON.parse(readFileSync(join(root, 'coverage.config.json'), 'utf8'))
}

function readBaseline(root) {
  const path = join(root, 'coverage.baseline.json')
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function validateBaselineNode(baseline, requirements) {
  if (baseline?.node?.version === undefined) {
    throw new GateError('baseline has no node.version; regenerate it with npm run coverage:baseline')
  }
  const parsed = parseVersion(baseline.node.version)
  if (parsed.major !== requirements.primaryMajor) {
    throw new GateError(
      `baseline Node ${baseline.node.version} does not match primary major ${requirements.primaryMajor}; regenerate it`,
    )
  }
  if (!satisfies(parsed, requirements.range)) {
    throw new GateError(
      `baseline Node ${baseline.node.version} does not satisfy engines.node ${requirements.range}; regenerate it`,
    )
  }
  return { parsed, range: baseline.node.range ?? null }
}

export function writeBaseline(root, scopes, requirements, { allowLower, reason, missing = [] }) {
  const existing = readBaseline(root)
  for (const scope of Object.keys(SCOPES)) {
    for (const metric of METRICS) {
      const current = scopes[scope][metric]
      const previous = existing?.scopes?.[scope]?.[metric]
      if (!previous || previous.total === 0 || current.total === 0) continue
      const lowered = current.hits * previous.total < previous.hits * current.total
      if (lowered && !allowLower) {
        throw new GateError(
          `${scope} ${metric} would drop from ${pctText(previous)} to ${pctText(current)}; pass --allow-lower --reason to accept`,
        )
      }
    }
  }
  if (allowLower && !reason) {
    throw new GateError('--allow-lower requires --reason')
  }
  const commit = runGit(root, ['rev-parse', '--short', 'HEAD'], { allowFailure: true }).stdout.trim() || null
  const payload = {
    version: 1,
    node: { version: process.version, range: requirements.range },
    commit,
    missing,
    scopes: {},
  }
  if (reason) payload.reason = reason
  for (const scope of Object.keys(SCOPES)) {
    payload.scopes[scope] = {}
    for (const metric of METRICS) {
      const value = scopes[scope][metric]
      payload.scopes[scope][metric] = {
        pct: value.total === 0 ? null : Number(((value.hits / value.total) * 100).toFixed(4)),
        hits: value.hits,
        total: value.total,
      }
    }
  }
  writeFileSync(join(root, 'coverage.baseline.json'), `${JSON.stringify(payload, null, 2)}\n`)
  return payload
}


export function floorViolations(scope, metrics, thresholds) {
  const violations = []
  for (const metric of METRICS) {
    const floor = thresholds[metric]
    if (belowFloor(metrics[metric], floor)) {
      violations.push(`${scope} ${metric} ${pctText(metrics[metric])} < ${floor.toFixed(2)}%`)
    }
  }
  return violations
}

export function newCodeViolations(scope, metrics, thresholds) {
  const violations = []
  for (const metric of METRICS) {
    const floor = thresholds[metric]
    if (belowFloor(metrics[metric], floor)) {
      violations.push(`${scope} new-code ${metric} ${pctText(metrics[metric])} < ${floor.toFixed(2)}%`)
    }
  }
  return violations
}

export function deltaViolations(scope, metrics, baselineMetrics, maxDrop) {
  const violations = []
  for (const metric of METRICS) {
    const previous = baselineMetrics?.[metric]
    if (!previous || !dropExceeds(metrics[metric], previous, maxDrop)) continue
    const drop = percentage(previous) - percentage(metrics[metric])
    violations.push(
      `${scope} ${metric} dropped ${drop.toFixed(2)} points below baseline (max ${maxDrop.toFixed(2)})`,
    )
  }
  return violations
}

function formatReport({ mode, current, requirements, baseline, baselineNode, scopes, added, missing, violations, warnings, newCode, newCodeMissList }) {
  const lines = []
  lines.push(`# Coverage gate (${mode})`)
  lines.push('')
  lines.push(`- current Node: ${process.version}`)
  lines.push(`- primary major: ${requirements.primaryMajor}`)
  lines.push(`- engines.node: ${requirements.range}`)
  if (baseline?.node) lines.push(`- baseline Node: ${baseline.node.version}`)
  if (baselineNode?.range) lines.push(`- baseline range: ${baselineNode.range}`)
  lines.push('')
  lines.push('| scope | line | branch | function |')
  lines.push('| --- | --- | --- | --- |')
  for (const scope of Object.keys(SCOPES)) {
    lines.push(`| ${scope} | ${pctText(scopes[scope].line)} | ${pctText(scopes[scope].branch)} | ${pctText(scopes[scope].function)} |`)
  }
  lines.push('')
  lines.push('## New code')
  lines.push('')
  lines.push('| scope | line | branch | function |')
  lines.push('| --- | --- | --- | --- |')
  for (const scope of Object.keys(SCOPES)) {
    lines.push(`| ${scope} | ${pctText(newCode[scope].line)} | ${pctText(newCode[scope].branch)} | ${pctText(newCode[scope].function)} |`)
  }
  lines.push('')
  if (missing.length > 0) {
    lines.push('## Missing coverage records')
    lines.push('')
    for (const item of missing) lines.push(`- ${item}`)
    lines.push('')
  }
  if (newCodeMissList.length > 0) {
    lines.push('## New-code misses')
    lines.push('')
    for (const item of newCodeMissList.slice(0, 20)) lines.push(`- ${item}`)
    if (newCodeMissList.length > 20) lines.push(`- ... ${newCodeMissList.length - 20} more`)
    lines.push('')
  }
  if (warnings.length > 0) {
    lines.push('## Warnings')
    lines.push('')
    for (const item of warnings) lines.push(`- ${item}`)
    lines.push('')
  }
  lines.push('## Violations')
  lines.push('')
  if (violations.length === 0) lines.push('- none')
  else for (const item of violations) lines.push(`- ${item}`)
  lines.push('')
  lines.push(`Test scope files: ${Object.keys(SCOPES).map((scope) => `${scope}=${[...current[scope].files].length}`).join(', ')}`)
  lines.push(`Added-line files observed: ${added.size}`)
  return `${lines.join('\n')}\n`
}

/**
 * Evaluate coverage from an already completed instrumented run.
 * @param options - mode, base, and baseline update options.
 * @returns process exit code.
 */
export async function runGate({
  root = ROOT,
  mode,
  base = 'origin/main',
  updateBaseline = false,
  allowLower = false,
  reason = null,
  onEnforcePass = null,
  onEnforceFail = null,
} = {}) {
  const requirements = readNodeRequirements(root)
  assertCurrentNode({ root })
  const config = readConfig(root)
  const effectiveMode = resolveMode(root, mode)

  const parsed = {}
  for (const [scope, definition] of Object.entries(SCOPES)) {
    const path = join(root, definition.lcov)
    if (!existsSync(path)) {
      throw new GateError(`missing lcov for ${scope}: ${definition.lcov}; run npm run coverage instead of npm test`)
    }
    parsed[scope] = parseLcov(readFileSync(path, 'utf8'))
  }

  const resolvedBase = resolveBase(root, base)
  const added = collectAddedLines(root, base, (file) => Object.values(SCOPES).some((scope) => scope.isSource(file)))
  const scopes = {}
  const newCode = {}
  const missing = []
  const newCodeMissList = []
  const records = {}
  for (const [scope, definition] of Object.entries(SCOPES)) {
    const sourceFiles = listSourceFiles(root, definition.isSource)
    const present = [...parsed[scope].keys()].filter((file) => definition.isSource(file))
    const missingFiles = sourceFiles.filter((file) => !parsed[scope].has(file))
    for (const file of missingFiles) missing.push(`${scope}: ${file}`)
    scopes[scope] = aggregateScope(parsed[scope], definition.isSource)
    newCode[scope] = newCodeTotals(parsed[scope], added, definition.isSource)
    newCodeMissList.push(...newCodeMisses(parsed[scope], added, definition.isSource))
    records[scope] = { files: new Set(present), total: present.length }
  }

  const baseline = readBaseline(root)
  let baselineNode = null
  const warnings = []
  let baselineUsable = baseline !== null
  if (baseline !== null) {
    try {
      baselineNode = validateBaselineNode(baseline, requirements)
      if (baselineNode.range !== null && baselineNode.range !== requirements.range) {
        warnings.push(`baseline range ${baselineNode.range} differs from current ${requirements.range}`)
      }
      if (baseline.node.version !== process.version) {
        warnings.push(`baseline Node ${baseline.node.version} differs from current ${process.version}; coverage may drift across patches`)
      }
    } catch (error) {
      baselineUsable = false
      if (effectiveMode === 'enforce' && !updateBaseline) throw error
      warnings.push(`baseline unusable: ${error.message}`)
    }
  } else if (effectiveMode === 'enforce' && !updateBaseline) {
    throw new GateError('coverage.baseline.json is missing; run npm run coverage:baseline')
  } else {
    warnings.push('coverage.baseline.json is missing; delta checks skipped')
  }

  const violations = []
  for (const scope of Object.keys(SCOPES)) {
    violations.push(...floorViolations(scope, scopes[scope], config.thresholds.absolute))
    violations.push(...newCodeViolations(scope, newCode[scope], config.thresholds.newCode))
    if (baselineUsable && baseline?.scopes?.[scope]) {
      violations.push(...deltaViolations(scope, scopes[scope], baseline.scopes[scope], config.thresholds.deltaMaxDrop))
    }
  }
  for (const item of missing) violations.push(`missing coverage record: ${item}`)

  const report = formatReport({
    mode: effectiveMode,
    current: records,
    requirements,
    baseline,
    baselineNode,
    scopes,
    added,
    missing,
    violations,
    warnings,
    newCode,
    newCodeMissList,
  })
  mkdirSync(join(root, '.coverage'), { recursive: true })
  writeFileSync(join(root, '.coverage', 'report.md'), report)
  process.stdout.write(report)

  if (updateBaseline) {
    const payload = writeBaseline(root, scopes, requirements, { allowLower, reason, missing })
    console.log(`baseline written: ${payload.node.version} ${payload.node.range}`)
    return 0
  }

  const code = violations.length > 0 && effectiveMode === 'enforce' ? 1 : 0
  const record = shouldRecordStamp({ mode: effectiveMode, updateBaseline, code, violations })
  if (record) onEnforcePass?.({ base: resolvedBase, violations })
  if (code === 1) onEnforceFail?.({ violations })
  return code
}

/**
 * Resolve the effective coverage mode from one rule.
 *
 * @param root - repository root.
 * @param requested - the mode the caller asked for, if any.
 * @returns `report` or `enforce`.
 * @throws GateError for an unknown mode.
 */
export function resolveMode(root = ROOT, requested) {
  const config = readConfig(root)
  const mode = requested ?? config.mode ?? 'report'
  if (!['report', 'enforce'].includes(mode)) {
    throw new GateError(`unknown coverage mode: ${mode}`)
  }
  return mode
}

/**
 * True only when an enforce run passed with no violation and without a
 * baseline update, so the stamp never attests a run that printed violations.
 *
 * @param options - mode, updateBaseline flag, exit code and violations.
 * @returns whether the caller may record a stamp.
 */
export function shouldRecordStamp({ mode, updateBaseline, code, violations }) {
  return (
    mode === 'enforce' &&
    updateBaseline === false &&
    code === 0 &&
    Array.isArray(violations) &&
    violations.length === 0
  )
}

function parseArgs(argv) {
  const options = { mode: undefined, base: 'origin/main', updateBaseline: false, allowLower: false, reason: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--check') options.mode = 'enforce'
    else if (arg === '--report-only') options.mode = 'report'
    else if (arg === '--update-baseline') options.updateBaseline = true
    else if (arg === '--allow-lower') options.allowLower = true
    else if (arg === '--base') options.base = argv[++index]
    else if (arg === '--reason') options.reason = argv[++index]
    else throw new GateError(`unknown argument: ${arg}`)
  }
  if (options.allowLower && !options.reason) throw new GateError('--allow-lower requires --reason')
  return options
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    const code = await runGate(options)
    process.exitCode = code
  } catch (error) {
    console.error(`coverage gate: ${error.message}`)
    console.error('Activate a Node 24 runtime that satisfies engines.node and retry; no version manager is invoked automatically.')
    process.exitCode = error.exitCode ?? 2
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main()
}
