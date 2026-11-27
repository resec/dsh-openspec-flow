import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { listActiveChanges, main } from '../scripts/check-change-metadata.mjs'
import { cleanupTempDirs, tempDir } from './temp.mjs'

test.after(cleanupTempDirs)

const SCRIPT = fileURLToPath(new URL('../scripts/check-change-metadata.mjs', import.meta.url))

/** The malformed `.openspec.yaml` bytes from the failing PR #30 revision. */
const MALFORMED_METADATA = [
  'schema: spec-driven',
  'created: 2026-11-22',
  'goal: Fail the coverage gate in report mode too when the baseline is absent or',
  '  records a Node version that fails validation, as decided on issue #10, and',
  '  state that rule in the mode requirement.',
  '',
].join('\n')

const VALID_METADATA = [
  'schema: spec-driven',
  'created: 2026-11-22',
  'goal: Fail the coverage gate in report mode too when the baseline is absent or Node-invalid.',
  '',
].join('\n')

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
 * Build a minimal OpenSpec project with one directory per named change.
 * @param options - `{ metadata, changes }`; omit metadata for a change without one.
 * @returns the temporary project root.
 */
function makeProject({ metadata, changes = ['widget'] } = {}) {
  const root = tempDir('dsh-check-metadata-')
  writeFile(root, 'openspec/config.yaml', 'schema: spec-driven\n')
  mkdirSync(join(root, 'openspec', 'changes'), { recursive: true })
  for (const change of changes) {
    mkdirSync(join(root, 'openspec', 'changes', change), { recursive: true })
    if (metadata !== undefined) writeFile(root, join('openspec', 'changes', change, '.openspec.yaml'), metadata)
  }
  return root
}

/**
 * Run the script as CI runs it, in the given project.
 * @param root - project root.
 * @returns the spawn result.
 */
function runScript(root) {
  return spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf8' })
}

/**
 * Write a fake OpenSpec CLI that logs its argv and answers per change.
 * @param responses - map from change name to `{ exit, stdout, stderr }`.
 * @returns the fake CLI path and its call log.
 */
function makeFakeCli(responses = {}) {
  const dir = tempDir('dsh-check-metadata-cli-')
  const log = join(dir, 'calls.log')
  const file = join(dir, 'fake-openspec.mjs')
  writeFileSync(file, [
    '#!/usr/bin/env node',
    "import { appendFileSync } from 'node:fs'",
    'const args = process.argv.slice(2)',
    `appendFileSync(${JSON.stringify(log)}, args.join(' ') + '\\n')`,
    `const responses = ${JSON.stringify(responses)}`,
    "const change = args[args.indexOf('--change') + 1]",
    'const response = responses[change] ?? { exit: 0 }',
    "process.stdout.write(response.stdout ?? '')",
    "process.stderr.write(response.stderr ?? '')",
    'process.exit(response.exit ?? 0)',
    '',
  ].join('\n'))
  return { file, log }
}

/**
 * Run the exported main with captured output.
 * @param options - fake CLI, resolver, project root and captured sinks.
 * @returns the exit code and captured text.
 */
function runMain({ cli, resolveCli, root, cwd = root, argv = [] } = {}) {
  let stdout = ''
  let stderr = ''
  const code = main(argv, (text) => { stdout += text }, (text) => { stderr += text }, { cli, resolveCli, cwd })
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

test('skips archive and dot-prefixed directories', () => {
  const root = makeProject({ changes: ['.hidden', 'widget', 'archive'] })
  assert.deepEqual(listActiveChanges(root), ['widget'])
})

test('the embedded PR #30 metadata fails with the parser message', () => {
  const root = makeProject({ metadata: MALFORMED_METADATA })
  const result = runScript(root)
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stderr, /active change 'widget' failed to load/u)
  assert.match(result.stderr, /Invalid YAML in metadata file/u)
  assert.match(result.stderr, /line 5, column 1/u)
})

test('valid metadata passes', () => {
  const root = makeProject({ metadata: VALID_METADATA })
  const result = runScript(root)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /change metadata gate: ok \(1 active change\)/u)
})

test('a change without metadata loads through the default schema', () => {
  const root = makeProject()
  const result = runScript(root)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /change metadata gate: ok/u)
})

test('an unknown schema fails and names the change', () => {
  const root = makeProject({ metadata: 'schema: not-installed\n' })
  const result = runScript(root)
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stderr, /active change 'widget' failed to load/u)
  assert.match(result.stderr, /Unknown schema 'not-installed'/u)
})

test('no active change passes', () => {
  const root = makeProject({ changes: [] })
  const result = runScript(root)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /change metadata gate: ok \(0 active changes\)/u)
})

test('every failing change is checked and reported', () => {
  const root = makeProject({ changes: ['alpha', 'beta'] })
  const fake = makeFakeCli({
    alpha: { exit: 1, stdout: JSON.stringify({ status: [{ severity: 'error', message: 'alpha is broken' }] }) },
    beta: { exit: 1, stdout: JSON.stringify({ status: [{ severity: 'error', message: 'beta is broken' }] }) },
  })
  const result = runMain({ cli: fake.file, root })
  assert.equal(result.code, 1)
  assert.deepEqual(calls(fake.log), ['status --change alpha --json', 'status --change beta --json'])
  assert.match(result.stderr, /active change 'alpha' failed to load: alpha is broken/u)
  assert.match(result.stderr, /active change 'beta' failed to load: beta is broken/u)
})

test('a later change is still checked after an earlier failure', () => {
  const root = makeProject({ changes: ['alpha', 'beta'] })
  const fake = makeFakeCli({
    alpha: { exit: 1, stdout: JSON.stringify({ status: [{ severity: 'error', message: 'alpha is broken' }] }) },
    beta: { exit: 0, stdout: JSON.stringify({ changeName: 'beta' }) },
  })
  const result = runMain({ cli: fake.file, root })
  assert.equal(result.code, 1)
  assert.deepEqual(calls(fake.log), ['status --change alpha --json', 'status --change beta --json'])
  assert.match(result.stderr, /active change 'alpha' failed to load/u)
  assert.doesNotMatch(result.stderr, /active change 'beta'/u)
})

test('an error payload with a zero exit fails closed', () => {
  const root = makeProject()
  const fake = makeFakeCli({
    widget: { exit: 0, stdout: JSON.stringify({ status: [{ severity: 'error', message: 'reported anyway' }] }) },
  })
  const result = runMain({ cli: fake.file, root })
  assert.equal(result.code, 1)
  assert.match(result.stderr, /active change 'widget' failed to load: reported anyway/u)
})

test('unreadable output fails closed', () => {
  const root = makeProject()
  const fake = makeFakeCli({ widget: { exit: 0, stdout: 'not json' } })
  const result = runMain({ cli: fake.file, root })
  assert.equal(result.code, 1)
  assert.match(result.stderr, /returned no readable projection/u)
})

test('a nonzero exit without an error payload reports the exit and detail', () => {
  const root = makeProject()
  const fake = makeFakeCli({ widget: { exit: 3, stderr: 'boom' } })
  const result = runMain({ cli: fake.file, root })
  assert.equal(result.code, 1)
  assert.match(result.stderr, /failed with exit code 3: boom/u)
})

test('a resolver failure fails the gate before spawning', () => {
  const root = makeProject()
  const result = runMain({ root, resolveCli: () => { throw new Error('the pinned package is missing') } })
  assert.equal(result.code, 2)
  assert.match(result.stderr, /cannot resolve the bundled OpenSpec CLI/u)
  assert.match(result.stderr, /the pinned package is missing/u)
})

test('an unexecutable CLI fails the gate', () => {
  const root = makeProject()
  const result = runMain({ root, cli: join(root, 'missing-openspec.mjs') })
  assert.equal(result.code, 2)
  assert.match(result.stderr, /cannot run the bundled OpenSpec CLI/u)
})

test('unknown arguments and --help follow the gate contract', () => {
  const root = makeProject()
  const unknown = runMain({ root, argv: ['--change', 'widget'] })
  assert.equal(unknown.code, 2)
  assert.match(unknown.stderr, /unknown argument '--change'/u)
  const help = runMain({ root, argv: ['--help'] })
  assert.equal(help.code, 0)
  assert.match(help.stdout, /usage: node scripts\/check-change-metadata\.mjs/u)
})
