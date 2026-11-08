#!/usr/bin/env node
/**
 * Compare the JSON contract of the pinned OpenSpec CLI with a candidate CLI.
 *
 * This is a development-only check: it is not part of the plugin runtime and
 * is never invoked by `npm test`. `scripts/cli-contract.json` records the
 * commands the plugin runs and the payload fields its projections read; this
 * script builds one fixture project per CLI, records the JSON shape of every
 * command, and reports a missing field, a type change, or an added field.
 *
 * @module dsh-openspec-flow/check-cli-contract
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveBundledCli } from '../lib/openspec.js'

const CONTRACT_PATH = fileURLToPath(new URL('./cli-contract.json', import.meta.url))

const USAGE = `Usage: node scripts/check-cli-contract.mjs [options]

Compare the JSON shape of the pinned OpenSpec CLI with a candidate CLI.

Options:
  --candidate <version>     Install this @fission-ai/openspec version into a
                            temporary prefix and use it as the candidate. It
                            writes only to a temporary directory and a
                            temporary npm cache.
  --candidate-bin <path>    Use an existing CLI entry as the candidate. No
                            registry access.
  --baseline-bin <path>     Use this CLI entry as the baseline. Defaults to the
                            plugin's own @fission-ai/openspec installation.
  --json                    Print the report as JSON.
  --help, -h                Print this usage.
`

/**
 * Describe a parsed JSON value as a structural shape.
 *
 * Objects keep their key set, arrays merge the shapes of their elements, and
 * scalars keep `typeof`. Two different scalar types or a null/object mix
 * become `mixed`, so a diff does not report a value-level change as a type
 * change.
 *
 * @param value - parsed JSON value.
 * @returns the shape.
 */
export function shapeOf(value) {
  if (value === null) return { type: 'null' }
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'array', items: null }
    return {
      type: 'array',
      items: value.map((item) => shapeOf(item)).reduce((left, right) => mergeShapes(left, right)),
    }
  }
  if (typeof value === 'object') {
    const keys = {}
    for (const key of Object.keys(value).sort()) keys[key] = shapeOf(value[key])
    return { type: 'object', keys }
  }
  if (value === null || value === undefined) return { type: 'null' }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return { type: typeof value }
  }
  return { type: 'unknown' }
}

/**
 * Merge two shapes observed at the same path.
 * @param left - first shape.
 * @param right - second shape.
 * @returns a shape that covers both.
 */
export function mergeShapes(left, right) {
  if (left === undefined) return right
  if (right === undefined) return left
  if (left.type !== right.type) {
    const types = new Set([...(left.type === 'mixed' ? left.types : [left.type])])
    types.add(right.type)
    if (right.type === 'mixed') for (const type of right.types) types.add(type)
    return { type: 'mixed', types: [...types].sort() }
  }
  if (left.type === 'object') {
    const keys = { ...left.keys }
    for (const key of Object.keys(right.keys)) {
      keys[key] = key in keys ? mergeShapes(keys[key], right.keys[key]) : right.keys[key]
    }
    return { type: 'object', keys }
  }
  if (left.type === 'array') {
    const items = left.items === null
      ? right.items
      : right.items === null
        ? left.items
        : mergeShapes(left.items, right.items)
    return { type: 'array', items }
  }
  return left
}

/**
 * Walk two shapes and collect structural differences.
 * @param base - baseline shape.
 * @param candidate - candidate shape.
 * @param prefix - path prefix for the report.
 * @returns `{ path, kind, from, to }` entries.
 */
export function diffShapes(base, candidate, prefix = '$') {
  const changes = []
  walk(base, candidate, prefix, changes)
  return changes
}

/**
 * Depth-first shape walk shared by `diffShapes`.
 * @param base - baseline shape.
 * @param candidate - candidate shape.
 * @param path - current path.
 * @param changes - output array.
 * @returns nothing.
 */
function walk(base, candidate, path, changes) {
  if (base.type !== candidate.type) {
    if (base.type !== 'mixed' && candidate.type !== 'mixed') {
      changes.push({ path, kind: 'type-changed', from: base.type, to: candidate.type })
    }
    return
  }
  if (base.type === 'object') {
    for (const key of Object.keys(base.keys)) {
      const next = `${path}.${key}`
      if (!(key in candidate.keys)) changes.push({ path: next, kind: 'removed' })
      else walk(base.keys[key], candidate.keys[key], next, changes)
    }
    for (const key of Object.keys(candidate.keys)) {
      if (!(key in base.keys)) changes.push({ path: `${path}.${key}`, kind: 'added' })
    }
    return
  }
  if (base.type === 'array' && base.items !== null && candidate.items !== null) {
    walk(base.items, candidate.items, `${path}[]`, changes)
  }
}

/**
 * Resolve one contract field path against a shape.
 *
 * `a.b[]` walks an object key and then one array element; a leading `[]`
 * walks a top-level array. An empty array has no element shape, so a path
 * through it is reported as `unobserved` rather than missing.
 *
 * @param shape - root shape.
 * @param fieldPath - path such as `changes[].name` or `[].source`.
 * @returns `{ shape }`, `{ missing: true }`, or `{ unobserved: true, missing: true }`.
 */
export function resolveField(shape, fieldPath) {
  let current = shape
  let unobserved = false
  for (const token of String(fieldPath).split('.')) {
    if (token === '') {
      const step = stepArray(current)
      if (step.missing) return mergeUnobserved(step, unobserved)
      current = step.shape
      if (step.unobserved) unobserved = true
      continue
    }
    let key = token
    let walkArray = false
    while (key.endsWith('[]')) {
      key = key.slice(0, -2)
      walkArray = true
    }
    if (key === '') {
      const array = stepArray(current)
      if (array.missing) return mergeUnobserved(array, unobserved)
      current = array.shape
      if (array.unobserved) unobserved = true
      continue
    }
    const step = stepObject(current, key)
    if (step.missing) return mergeUnobserved(step, unobserved)
    current = step.shape
    if (walkArray) {
      const array = stepArray(current)
      if (array.missing) return mergeUnobserved(array, unobserved)
      current = array.shape
      if (array.unobserved) unobserved = true
    }
  }
  return unobserved ? { shape: current, unobserved } : { shape: current }
}

/**
 * Add a previously seen empty-array observation to a failure.
 * @param result - step result.
 * @param unobserved - whether an earlier step was unobserved.
 * @returns the result, marked unobserved when either source did.
 */
function mergeUnobserved(result, unobserved) {
  return unobserved || result.unobserved ? { ...result, unobserved: true } : result
}

/**
 * Read one object key from a shape.
 * @param shape - current shape.
 * @param key - object key.
 * @returns `{ shape }` or `{ missing: true }`.
 */
function stepObject(shape, key) {
  if (shape.type !== 'object' || !(key in shape.keys)) return { missing: true }
  return { shape: shape.keys[key] }
}

/**
 * Walk one array element from a shape.
 * @param shape - current shape.
 * @returns `{ shape }`, or `{ missing: true }`; empty arrays add `unobserved`.
 */
function stepArray(shape) {
  if (shape.type !== 'array') return { missing: true }
  if (shape.items === null) return { missing: true, unobserved: true }
  return { shape: shape.items }
}

/**
 * Check every consumed field in a command contract against a shape.
 * @param shape - root shape of the command output.
 * @param fields - field path to type map from `scripts/cli-contract.json`.
 * @returns `{ missing, typeChanged, unobserved }` entries.
 */
export function checkConsumed(shape, fields) {
  const missing = []
  const typeChanged = []
  const unobserved = []
  for (const [path, spec] of Object.entries(fields ?? {})) {
    const expected = typeof spec === 'string' ? spec : spec.type
    const optional = typeof spec === 'object' && spec.optional === true
    const result = resolveField(shape, path)
    if (result.missing) {
      if (optional) continue
      if (result.unobserved) unobserved.push({ path, expected })
      else missing.push({ path, expected })
      continue
    }
    if (result.unobserved) {
      if (!optional) unobserved.push({ path, expected })
      continue
    }
    if (result.shape.type !== expected) {
      typeChanged.push({ path, expected, actual: result.shape.type })
    }
  }
  return { missing, typeChanged, unobserved }
}

/**
 * Read and validate a contract file.
 * @param path - contract path; defaults to `scripts/cli-contract.json`.
 * @returns the parsed contract.
 * @throws Error when the file or a command entry is malformed.
 */
export function readContract(path = CONTRACT_PATH) {
  let contract
  try {
    contract = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`cannot read the contract at '${path}': ${detail}`)
  }
  if (contract === null || typeof contract !== 'object' || !Array.isArray(contract.commands)) {
    throw new Error(`the contract at '${path}' has no commands array`)
  }
  const seen = new Set()
  for (const command of contract.commands) {
    if (command === null || typeof command !== 'object') {
      throw new Error(`the contract at '${path}' has a non-object command`)
    }
    if (typeof command.id !== 'string' || command.id === '') {
      throw new Error(`the contract at '${path}' has a command without an id`)
    }
    if (seen.has(command.id)) throw new Error(`the contract repeats command '${command.id}'`)
    seen.add(command.id)
    if (!Array.isArray(command.args)) {
      throw new Error(`command '${command.id}' has no args array`)
    }
    if (command.fields === null || typeof command.fields !== 'object' || Array.isArray(command.fields)) {
      throw new Error(`command '${command.id}' has no fields object`)
    }
  }
  return contract
}

/**
 * Parse one command's stdout as JSON.
 *
 * A command may exit non-zero and still carry JSON (`validate` exits 1 for an
 * invalid item), so the caller decides what to do with the exit code; this
 * helper only separates parseable JSON from everything else.
 *
 * @param result - `{ stdout, exitCode, stderr }`.
 * @returns `{ json }` or `{ error }`.
 */
export function parseCommandOutput(result) {
  const text = typeof result?.stdout === 'string' ? result.stdout.trim() : ''
  if (text === '') return { error: 'no output' }
  try {
    return { json: JSON.parse(text) }
  } catch {
    return { error: 'output is not JSON' }
  }
}

/**
 * Parse the command line.
 * @param argv - arguments after the script name.
 * @returns `{ help, json, candidate, candidateBin, baselineBin }`.
 * @throws Error for an unknown option, a missing value, or conflicting candidates.
 */
export function parseArgs(argv) {
  const options = {
    help: false,
    json: false,
    candidate: undefined,
    candidateBin: undefined,
    baselineBin: undefined,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--json') {
      options.json = true
      continue
    }
    const equals = arg.indexOf('=')
    const name = equals === -1 ? arg : arg.slice(0, equals)
    if (name === '--candidate' || name === '--candidate-bin' || name === '--baseline-bin') {
      const value = equals === -1 ? argv[++index] : arg.slice(equals + 1)
      if (value === undefined || value === '' || value.startsWith('--')) {
        throw new Error(`option '${name}' needs a value`)
      }
      if (name === '--candidate') options.candidate = value
      if (name === '--candidate-bin') options.candidateBin = value
      if (name === '--baseline-bin') options.baselineBin = value
      continue
    }
    throw new Error(`unknown option '${arg}'`)
  }
  if (options.candidate !== undefined && options.candidateBin !== undefined) {
    throw new Error('use either --candidate or --candidate-bin, not both')
  }
  return options
}

/** Change name used by every fixture project. */
const FIXTURE_CHANGE = 'fixture-change'
/** Capability name used by every fixture project. */
const FIXTURE_SPEC = 'fixture-spec'

const FIXTURE_PROPOSAL = `# Fixture change

## Why

Contract fixture for the CLI check.

## What Changes

- Add a fixture capability.

## Capabilities

### New Capabilities

- \`${FIXTURE_SPEC}\`: fixture capability.

## Impact

- None.
`

const FIXTURE_DELTA_SPEC = `# Fixture spec

## ADDED Requirements

### Requirement: Fixture requirement
The fixture SHALL exist.

#### Scenario: Fixture runs
- **WHEN** the fixture runs
`

const FIXTURE_DESIGN = `# Design

## Context

Contract fixture.

## Decisions

- None.
`

const FIXTURE_TASKS = `## 1. Fixture

- [ ] 1.1 Do the fixture
- [ ] 1.2 Finish the fixture
`

const FIXTURE_MAIN_SPEC = `# Fixture spec

## Purpose

Fixture.

## Requirements

### Requirement: Baseline requirement
The baseline SHALL exist.

#### Scenario: Baseline runs
- **WHEN** the baseline runs
- **THEN** it exists
`

/**
 * Run the CLI once.
 * @param bin - CLI entry.
 * @param argv - arguments after the entry.
 * @param cwd - working directory.
 * @returns `{ exitCode, stdout, stderr }`.
 * @throws Error when the process cannot be started.
 */
function runCli(bin, argv, cwd) {
  const result = spawnSync(process.execPath, [bin, ...argv], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' },
    timeout: 120_000,
  })
  if (result.error) {
    throw new Error(`running '${argv.join(' ')}' failed: ${result.error.message}`)
  }
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

/**
 * Read the version a CLI reports.
 * @param bin - CLI entry.
 * @param cwd - working directory.
 * @returns the reported version.
 * @throws Error when the CLI prints no version JSON.
 */
function readVersion(bin, cwd) {
  const result = runCli(bin, ['version', '--json'], cwd)
  const parsed = parseCommandOutput(result)
  if (parsed.json === undefined || typeof parsed.json.version !== 'string') {
    throw new Error(
      `'${bin}' did not print a version report (exit ${result.exitCode}): `
      + `${(result.stderr || result.stdout).trim().slice(0, 500)}`,
    )
  }
  return parsed.json.version
}

/**
 * Install a candidate version into a temporary prefix.
 * @param version - exact version or `@fission-ai/openspec@<version>`.
 * @param workDir - temporary directory that holds the prefix and npm cache.
 * @returns the installed CLI entry.
 * @throws Error when npm fails or the entry is missing.
 */
function installCandidate(version, workDir) {
  const prefix = join(workDir, 'candidate-cli')
  mkdirSync(prefix, { recursive: true })
  const spec = version.startsWith('@fission-ai/openspec@')
    ? version
    : `@fission-ai/openspec@${version}`
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(
    npm,
    [
      'install',
      '--prefix',
      prefix,
      spec,
      '--no-save',
      '--no-package-lock',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ],
    {
      cwd: prefix,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        npm_config_cache: join(workDir, 'npm-cache'),
      },
      timeout: 300_000,
    },
  )
  if (result.error) {
    throw new Error(`npm install ${spec} failed: ${result.error.message}`)
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim().slice(0, 800)
    throw new Error(`npm install ${spec} exited ${result.status}: ${detail}`)
  }
  const bin = join(prefix, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js')
  if (!existsSync(bin)) {
    throw new Error(`npm installed ${spec}, but '${bin}' does not exist`)
  }
  return bin
}

/**
 * Resolve the candidate CLI from the command line.
 * @param options - parsed options.
 * @param workDir - temporary directory.
 * @returns `{ bin, version, source }`.
 * @throws Error when neither candidate source is supplied or the version differs.
 */
function resolveCandidate(options, workDir) {
  if (options.candidateBin !== undefined) {
    const bin = resolve(options.candidateBin)
    if (!existsSync(bin)) throw new Error(`candidate CLI '${bin}' does not exist`)
    return { bin, version: readVersion(bin, workDir), source: 'file' }
  }
  if (options.candidate !== undefined) {
    const bin = installCandidate(options.candidate, workDir)
    const version = readVersion(bin, workDir)
    const expected = options.candidate.startsWith('@fission-ai/openspec@')
      ? options.candidate.slice('@fission-ai/openspec@'.length)
      : options.candidate
    if (version !== expected) {
      throw new Error(
        `the candidate installed as '${expected}' reports version '${version}'; `
        + 'use an exact version or --candidate-bin',
      )
    }
    return { bin, version, source: 'npm' }
  }
  throw new Error('provide --candidate <version> or --candidate-bin <path>')
}

/**
 * Write the fixed fixture project.
 * @param project - project root.
 * @returns nothing.
 */
function writeFixture(project) {
  const changeDir = join(project, 'openspec', 'changes', FIXTURE_CHANGE)
  const deltaDir = join(changeDir, 'specs', FIXTURE_SPEC)
  const mainDir = join(project, 'openspec', 'specs', FIXTURE_SPEC)
  mkdirSync(deltaDir, { recursive: true })
  mkdirSync(mainDir, { recursive: true })
  writeFileSync(join(changeDir, 'proposal.md'), FIXTURE_PROPOSAL)
  writeFileSync(join(deltaDir, 'spec.md'), FIXTURE_DELTA_SPEC)
  writeFileSync(join(changeDir, 'design.md'), FIXTURE_DESIGN)
  writeFileSync(join(changeDir, 'tasks.md'), FIXTURE_TASKS)
  writeFileSync(join(mainDir, 'spec.md'), FIXTURE_MAIN_SPEC)
}

/**
 * Run one contract command.
 * @param command - contract entry.
 * @param context - `{ bin, project }`.
 * @returns the recorded result.
 */
function runCommand(command, { bin, project }) {
  const argv = command.args.map((argument) => argument
    .replaceAll('{change}', FIXTURE_CHANGE)
    .replaceAll('{spec}', FIXTURE_SPEC))
  const result = runCli(bin, argv, project)
  const parsed = command.json === false ? { json: false } : parseCommandOutput(result)
  return {
    id: command.id,
    stage: command.stage,
    fields: command.fields,
    argv,
    exitCode: result.exitCode,
    stderr: result.stderr,
    json: parsed.json,
    error: parsed.error,
  }
}

/**
 * Build one fixture project and run every command against it.
 * @param label - `baseline` or `candidate`.
 * @param bin - CLI entry.
 * @param version - reported CLI version.
 * @param contract - parsed contract.
 * @param workDir - temporary directory.
 * @returns `{ label, bin, version, project, commands }`.
 */
function runSuite(label, bin, version, contract, workDir) {
  const project = join(workDir, `${label}-project`)
  mkdirSync(project, { recursive: true })
  const commands = []
  for (const command of contract.commands.filter((entry) => entry.stage === 'setup')) {
    commands.push(runCommand(command, { bin, project }))
    if (command.id === 'new-change') writeFixture(project)
  }
  for (const command of contract.commands.filter((entry) => entry.stage === 'base')) {
    commands.push(runCommand(command, { bin, project }))
  }
  const tasksPath = join(project, 'openspec', 'changes', FIXTURE_CHANGE, 'tasks.md')
  if (existsSync(tasksPath)) {
    writeFileSync(tasksPath, readFileSync(tasksPath, 'utf8').replaceAll('- [ ]', '- [x]'))
  }
  for (const command of contract.commands.filter((entry) => entry.stage === 'completed')) {
    commands.push(runCommand(command, { bin, project }))
  }
  return { label, bin, version, project, commands }
}

/**
 * Check one suite's commands against the consumed-field list.
 * @param suite - result of `runSuite`.
 * @returns `{ failures, consumed }`.
 */
function checkSuite(suite) {
  const failures = []
  const consumed = []
  for (const command of suite.commands) {
    if (command.json === false) {
      if (command.exitCode !== 0) {
        failures.push({
          command: command.id,
          message: `exit ${command.exitCode}`,
          stderr: command.stderr.trim(),
        })
      }
      continue
    }
    if (command.error !== undefined) {
      failures.push({
        command: command.id,
        message: command.error,
        stderr: command.stderr.trim(),
      })
      continue
    }
    if (command.exitCode !== 0 && command.stage !== 'base') {
      failures.push({
        command: command.id,
        message: `exit ${command.exitCode}`,
        stderr: command.stderr.trim(),
      })
    }    const result = checkConsumed(shapeOf(command.json), command.fields)
    consumed.push({ id: command.id, ...result })
    for (const item of result.missing) {
      failures.push({ command: command.id, message: `missing '${item.path}' (expected ${item.expected})` })
    }
    for (const item of result.typeChanged) {
      failures.push({
        command: command.id,
        message: `'${item.path}' is ${item.actual}, expected ${item.expected}`,
      })
    }
  }
  return { failures, consumed }
}

/**
 * Diff the shapes of the two suites command by command.
 * @param baseline - baseline suite.
 * @param candidate - candidate suite.
 * @returns `[{ id, changes }]`.
 */
function compareSuites(baseline, candidate) {
  const byId = new Map(baseline.commands.map((command) => [command.id, command]))
  const differences = []
  for (const command of candidate.commands) {
    const base = byId.get(command.id)
    if (base === undefined || base.json === undefined || command.json === undefined) continue
    if (base.json === false || command.json === false) continue
    differences.push({
      id: command.id,
      changes: diffShapes(shapeOf(base.json), shapeOf(command.json)),
    })
  }
  return differences
}

/**
 * Format one shape difference for a human report.
 * @param change - diff entry.
 * @returns a display line.
 */
function describeChange(change) {
  if (change.kind === 'added') return `+ ${change.path}`
  if (change.kind === 'removed') return `- ${change.path}`
  return `~ ${change.path} (${change.from} -> ${change.to})`
}

/**
 * Print the human-readable report.
 * @param report - built report.
 * @returns nothing.
 */
function printHuman(report) {
  const lines = []
  lines.push(`baseline: ${report.baseline.version}`)
  lines.push(`candidate: ${report.candidate.version}`)
  lines.push('')
  for (const command of report.differences) {
    const added = command.changes.filter((change) => change.kind === 'added').length
    const removed = command.changes.filter((change) => change.kind === 'removed').length
    const changed = command.changes.filter((change) => change.kind === 'type-changed').length
    if (added + removed + changed === 0) {
      lines.push(`${command.id}: no shape change`)
      continue
    }
    lines.push(`${command.id}: ${added} added, ${removed} removed, ${changed} type-changed`)
    for (const change of command.changes.slice(0, 20)) lines.push(`  ${describeChange(change)}`)
    if (command.changes.length > 20) {
      lines.push(`  ... ${command.changes.length - 20} more`)
    }
  }
  for (const warning of report.unobserved) {
    lines.push(`warning: ${warning.command} '${warning.path}' was not observed (empty fixture array)`)
  }
  if (report.failures.length > 0) {
    lines.push('')
    for (const failure of report.failures) {
      const detail = failure.stderr === undefined || failure.stderr === ''
        ? ''
        : `\n  ${failure.stderr.split('\n').slice(0, 3).join('\n  ')}`
      lines.push(`FAIL ${failure.suite}/${failure.command}: ${failure.message}${detail}`)
    }
  }
  lines.push('')
  lines.push(report.ok ? 'RESULT: compatible' : 'RESULT: breaking differences found')
  process.stdout.write(`${lines.join('\n')}\n`)
}

/**
 * Build the full report.
 * @param baseline - baseline suite.
 * @param candidate - candidate suite.
 * @returns the report.
 */
function buildReport(baseline, candidate) {
  const baselineCheck = checkSuite(baseline)
  const candidateCheck = checkSuite(candidate)
  const failures = [
    ...baselineCheck.failures.map((failure) => ({ ...failure, suite: baseline.label })),
    ...candidateCheck.failures.map((failure) => ({ ...failure, suite: candidate.label })),
  ]
  const unobserved = []
  for (const command of candidateCheck.consumed) {
    for (const item of command.unobserved) {
      unobserved.push({ command: command.id, path: item.path, expected: item.expected })
    }
  }
  return {
    baseline: { version: baseline.version, bin: baseline.bin },
    candidate: { version: candidate.version, bin: candidate.bin },
    differences: compareSuites(baseline, candidate),
    consumed: candidateCheck.consumed,
    unobserved,
    failures,
    ok: failures.length === 0,
  }
}

/**
 * Entry point.
 * @returns nothing.
 */
function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    process.stderr.write(`contract check: ${detail}\n`)
    process.exitCode = 2
    return
  }
  if (options.help) {
    process.stdout.write(USAGE)
    return
  }

  const workDir = mkdtempSync(join(tmpdir(), 'openspec-cli-contract-'))
  try {
    const contract = readContract()
    const baselineBin = options.baselineBin === undefined
      ? resolveBundledCli()
      : resolve(options.baselineBin)
    if (!existsSync(baselineBin)) {
      throw new Error(`baseline CLI '${baselineBin}' does not exist`)
    }
    const candidate = resolveCandidate(options, workDir)
    const baselineVersion = readVersion(baselineBin, workDir)
    const baseline = runSuite('baseline', baselineBin, baselineVersion, contract, workDir)
    const candidateSuite = runSuite('candidate', candidate.bin, candidate.version, contract, workDir)
    const report = buildReport(baseline, candidateSuite)
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    } else {
      printHuman(report)
    }
    if (!report.ok) process.exitCode = 1
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    process.stderr.write(`contract check: ${detail}\n`)
    process.exitCode = 2
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main()
}
