import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { resolveBundledCli } from '../lib/openspec.js'
import { main } from '../scripts/check-pre-push.mjs'

const SCRIPT = fileURLToPath(new URL('../scripts/check-pre-push.mjs', import.meta.url))
const CLI = resolveBundledCli()
const PURPOSE = 'Defines the capability behavior that the pre-push validation test needs.'

/**
 * Write one file under a fixture root.
 * @param root - fixture root.
 * @param path - relative path.
 * @param text - file content.
 */
function writeFile(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

/**
 * Build a minimal OpenSpec project with one active change.
 * @param options - `{ tasks }`; omit for an empty task file.
 * @returns the temporary project root.
 */
function makeProject({ tasks = '# Tasks\n\n## 1. Work\n\n- [ ] 1.1 Do it\n' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-check-pre-push-'))
  writeFile(root, 'openspec/config.yaml', 'schema: spec-driven\n')
  writeFile(root, 'openspec/specs/cap/spec.md', [
    '# cap',
    '',
    '## Purpose',
    '',
    PURPOSE,
    '',
    '## Requirements',
    '',
    '### Requirement: Thing',
    '',
    'The system SHALL do a thing.',
    '',
    '#### Scenario: It works',
    '',
    '- **WHEN** x',
    '- **THEN** y',
    '',
  ].join('\n'))
  writeFile(root, 'openspec/changes/widget/proposal.md', '# Widget\n\n## Why\n\nA thing.\n')
  writeFile(root, 'openspec/changes/widget/tasks.md', tasks)
  return root
}

/**
 * Run the script as the hook would run it, in the given project.
 * @param root - project root.
 * @returns the spawn result.
 */
function runScript(root) {
  return spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf8' })
}

/**
 * Build a fake OpenSpec CLI that records its argv and returns a fixed verdict.
 * @param options - list projection or raw text, and per-command exit codes.
 * @returns the fake CLI path and its call log.
 */
function makeFakeCli({ list = { changes: [] }, listRaw, specsExit = 0, archivedExit = 0, listExit = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-check-pre-push-cli-'))
  const log = join(dir, 'calls.log')
  const projection = listRaw ?? JSON.stringify(list)
  const file = join(dir, 'fake-openspec.mjs')
  writeFileSync(file, [
    '#!/usr/bin/env node',
    "import { appendFileSync } from 'node:fs'",
    '',
    'const [command, ...args] = process.argv.slice(2)',
    `appendFileSync(${JSON.stringify(log)}, [command, ...args].join(' ') + '\\n')`,
    "if (command === 'validate') {",
    `  process.exit(args[0] === '--specs' ? ${String(specsExit)} : ${String(archivedExit)})`,
    '}',
    "if (command === 'list') {",
    `  process.stdout.write(${JSON.stringify(projection)})`,
    `  process.exit(${String(listExit)})`,
    '}',
    'process.exit(0)',
    '',
  ].join('\n'))
  return { file, log }
}

/**
 * Run the exported main with captured output.
 * @param options - fake CLI, resolver, project root and captured sinks.
 * @returns the exit code and captured text.
 */
function runMain({ cli, resolveCli, root, cwd = root } = {}) {
  let stdout = ''
  let stderr = ''
  const code = main({
    cli,
    resolveCli,
    cwd,
    stdout: (text) => { stdout += text },
    stderr: (text) => { stderr += text },
  })
  return { code, stdout, stderr }
}

/**
 * Read a fake CLI's argv log.
 * @param path - log path.
 * @returns the recorded command lines.
 */
function calls(path) {
  return readFileSync(path, 'utf8').trim().split('\n').filter((line) => line !== '')
}

test('the real bundled CLI allows an in-progress change', () => {
  const root = makeProject()
  try {
    const result = runScript(root)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /pre-push gate: ok/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the real bundled CLI blocks a complete change and names it', () => {
  const root = makeProject({ tasks: '# Tasks\n\n- [x] 1.1 Done\n' })
  try {
    const result = runScript(root)
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /active change 'widget' reports 'complete'/u)
    assert.match(result.stderr, /land or archive it before pushing main/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the real bundled CLI blocks a task-less change', () => {
  const root = makeProject({ tasks: '# Tasks\n' })
  try {
    const result = runScript(root)
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /active change 'widget' reports 'no-tasks'/u)
    assert.match(result.stderr, /add tracked checkbox tasks/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the gate runs the exact validations before listing active changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-check-pre-push-empty-'))
  const fake = makeFakeCli()
  try {
    const result = runMain({ cli: fake.file, root })
    assert.equal(result.code, 0)
    assert.deepEqual(calls(fake.log), [
      'validate --specs --strict',
      'validate --archived --strict',
      'list --json',
    ])
    assert.equal(calls(fake.log).some((line) => /--all|--changes/u.test(line)), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a complete active change blocks with its name and archive-or-land correction', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-check-pre-push-complete-'))
  const fake = makeFakeCli({ list: { changes: [{ name: 'widget', status: 'complete' }] } })
  try {
    const result = runMain({ cli: fake.file, root })
    assert.equal(result.code, 1)
    assert.match(result.stderr, /active change 'widget' reports 'complete'/u)
    assert.match(result.stderr, /land or archive it before pushing main/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a task-less active change blocks and says which task state is required', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-check-pre-push-no-tasks-'))
  const fake = makeFakeCli({ list: { changes: [{ name: 'widget', status: 'no-tasks' }] } })
  try {
    const result = runMain({ cli: fake.file, root })
    assert.equal(result.code, 1)
    assert.match(result.stderr, /active change 'widget' reports 'no-tasks'/u)
    assert.match(result.stderr, /add tracked checkbox tasks/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an unknown status blocks and is named', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-check-pre-push-unknown-'))
  const fake = makeFakeCli({ list: { changes: [{ name: 'widget', status: 'paused' }] } })
  try {
    const result = runMain({ cli: fake.file, root })
    assert.equal(result.code, 1)
    assert.match(result.stderr, /active change 'widget' reports 'paused'/u)
    assert.match(result.stderr, /finish it before pushing main/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a failed spec validation stops before archived validation and listing', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-check-pre-push-specs-'))
  const fake = makeFakeCli({ specsExit: 1 })
  try {
    const result = runMain({ cli: fake.file, root })
    assert.equal(result.code, 1)
    assert.deepEqual(calls(fake.log), ['validate --specs --strict'])
    assert.match(result.stderr, /validate --specs --strict failed with exit code 1/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a failed archived validation stops before listing', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-check-pre-push-archived-'))
  const fake = makeFakeCli({ archivedExit: 2 })
  try {
    const result = runMain({ cli: fake.file, root })
    assert.equal(result.code, 1)
    assert.deepEqual(calls(fake.log), ['validate --specs --strict', 'validate --archived --strict'])
    assert.match(result.stderr, /validate --archived --strict failed with exit code 2/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a failed listing is reported before any status decision', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-check-pre-push-list-'))
  const fake = makeFakeCli({ listExit: 3 })
  try {
    const result = runMain({ cli: fake.file, root })
    assert.equal(result.code, 1)
    assert.match(result.stderr, /cannot read active changes/u)
    assert.match(result.stderr, /exit code 3/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('invalid JSON and a missing changes array fail closed', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-check-pre-push-json-'))
  const malformed = makeFakeCli({ listRaw: 'not json' })
  const missing = makeFakeCli({ list: {} })
  const invalid = makeFakeCli({ list: { changes: [{ status: 'in-progress' }] } })
  try {
    const malformedResult = runMain({ cli: malformed.file, root })
    assert.equal(malformedResult.code, 1)
    assert.match(malformedResult.stderr, /invalid JSON/u)

    const missingResult = runMain({ cli: missing.file, root })
    assert.equal(missingResult.code, 1)
    assert.match(missingResult.stderr, /no changes array/u)

    const invalidResult = runMain({ cli: invalid.file, root })
    assert.equal(invalidResult.code, 1)
    assert.match(invalidResult.stderr, /invalid change at index 0/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a resolver failure reports the missing bundled CLI before spawning', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-check-pre-push-resolver-'))
  try {
    const result = runMain({ root, resolveCli: () => { throw new Error('the pinned package is missing') } })
    assert.equal(result.code, 1)
    assert.match(result.stderr, /cannot resolve the bundled OpenSpec CLI/u)
    assert.match(result.stderr, /the pinned package is missing/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
