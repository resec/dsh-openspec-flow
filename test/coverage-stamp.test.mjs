import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  STAMP_INPUTS,
  checkStamp,
  clearStamp,
  clearStampOnFailure,
  fingerprint,
  stampPath,
  writeStamp,
} from '../scripts/coverage-stamp.mjs'
import { resolveBase } from '../scripts/coverage-gate.mjs'
import { initFixtureRepo } from './git-fixture.mjs'

/** @param root - git repository root. @param args - git arguments. @returns stdout. */
function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`)
  return (result.stdout ?? '').trim()
}

/**
 * Build a throwaway git repository that carries every fingerprinted input.
 *
 * `.cache/` is ignored so the clean-tree rule can be exercised, and the
 * repository is created directly: `test/review-fixtures.mjs` forbids a
 * registered fixture root that carries a `.cache` directory.
 *
 * @returns the repository root.
 */
function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'coverage-stamp-'))
  initFixtureRepo(root, ['-b', 'main'])
  git(root, ['config', 'user.email', 'stamp@example.test'])
  git(root, ['config', 'user.name', 'Stamp Test'])
  writeFileSync(join(root, '.gitignore'), '.cache/\n')
  writeFileSync(join(root, 'index.js'), 'export const value = 1\n')
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(join(root, 'lib', 'a.js'), 'export function a() { return 1 }\n')
  mkdirSync(join(root, 'test'), { recursive: true })
  writeFileSync(join(root, 'test', 'a.test.mjs'), "import test from 'node:test'\n")
  writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n')
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3}\n')
  writeFileSync(join(root, 'coverage.config.json'), '{"mode":"enforce"}\n')
  writeFileSync(join(root, 'coverage.baseline.json'), '{"version":1}\n')
  mkdirSync(join(root, 'scripts'), { recursive: true })
  for (const name of ['coverage.mjs', 'coverage-gate.mjs', 'coverage-stamp.mjs', 'run-tests.mjs', 'test-env.mjs', 'node-version.mjs']) {
    writeFileSync(join(root, 'scripts', name), '// fixture\n')
  }
  git(root, ['add', '-A'])
  git(root, ['commit', '-m', 'initial'])
  // A local `origin/main` mirrors the real repository: later commits advance
  // `HEAD` without moving the comparison base, which is what the stamp relies on.
  git(root, ['branch', 'origin/main'])
  return root
}

/** @param root - repository root. @param message - commit message. */
function commitAll(root, message) {
  git(root, ['add', '-A'])
  git(root, ['commit', '-m', message])
}

/** @param root - repository root. @returns the base the gate would resolve. */
function baseOf(root) {
  return resolveBase(root, 'origin/main')
}

/** @param root - repository root. @param update - mutator for the parsed record. */
function rewriteStamp(root, update) {
  const path = stampPath(root)
  const record = JSON.parse(readFileSync(path, 'utf8'))
  update(record)
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`)
}

test('the input list names every verdict input', () => {
  assert.deepEqual(STAMP_INPUTS, [
    'lib',
    'index.js',
    'test',
    'package.json',
    'package-lock.json',
    'coverage.config.json',
    'coverage.baseline.json',
    'scripts/coverage.mjs',
    'scripts/coverage-gate.mjs',
    'scripts/coverage-stamp.mjs',
    'scripts/run-tests.mjs',
    'scripts/test-env.mjs',
    'scripts/node-version.mjs',
  ])
})

test('a passing run on a clean tree writes a usable stamp', () => {
  const root = makeRepo()
  const result = writeStamp({ root, base: baseOf(root) })
  assert.equal(result.written, true)
  assert.equal(result.record.head, git(root, ['rev-parse', 'HEAD']))
  assert.equal(result.record.node, process.version)
  assert.match(result.record.fingerprint, /^[0-9a-f]{64}$/)
  assert.equal(checkStamp({ root }).ok, true)
})

test('an openspec-only commit keeps the fingerprint', () => {
  const root = makeRepo()
  writeStamp({ root, base: baseOf(root) })
  mkdirSync(join(root, 'openspec', 'changes', 'x'), { recursive: true })
  writeFileSync(join(root, 'openspec', 'changes', 'x', 'proposal.md'), '# Proposal\n')
  commitAll(root, 'chore(openspec): propose x')
  assert.equal(checkStamp({ root }).ok, true, 'an archive-style commit must not invalidate the stamp')
})

test('an uncommitted planning directory of another change does not block the stamp', () => {
  const root = makeRepo()
  mkdirSync(join(root, 'openspec', 'changes', 'other', 'specs'), { recursive: true })
  writeFileSync(join(root, 'openspec', 'changes', 'other', 'proposal.md'), '# Proposal\n')
  const result = writeStamp({ root, base: baseOf(root) })
  assert.equal(result.written, true, 'a parallel change directory must not count as a dirty tree')
  assert.equal(checkStamp({ root }).ok, true)
  writeFileSync(join(root, 'lib', 'a.js'), 'export function a() { return 9 }\n')
  assert.equal(writeStamp({ root, base: baseOf(root) }).written, false)
})

test('a lib change invalidates the stamp', () => {
  const root = makeRepo()
  writeStamp({ root, base: baseOf(root) })
  writeFileSync(join(root, 'lib', 'a.js'), 'export function a() { return 2 }\n')
  commitAll(root, 'fix(lib): change a')
  const result = checkStamp({ root })
  assert.equal(result.ok, false)
  assert.match(result.reason, /inputs changed/)
})

test('a test change invalidates the stamp', () => {
  const root = makeRepo()
  writeStamp({ root, base: baseOf(root) })
  writeFileSync(join(root, 'test', 'a.test.mjs'), "import test from 'node:test'\n// changed\n")
  commitAll(root, 'test: change a')
  assert.equal(checkStamp({ root }).ok, false)
})

test('a baseline-only change invalidates the stamp', () => {
  const root = makeRepo()
  writeStamp({ root, base: baseOf(root) })
  writeFileSync(join(root, 'coverage.baseline.json'), '{"version":1,"line":90}\n')
  commitAll(root, 'chore: lower the baseline')
  const result = checkStamp({ root })
  assert.equal(result.ok, false)
  assert.match(result.reason, /inputs changed/)
})

test('a gate-script change invalidates the stamp', () => {
  const root = makeRepo()
  writeStamp({ root, base: baseOf(root) })
  writeFileSync(join(root, 'scripts', 'coverage-gate.mjs'), '// weakened\n')
  commitAll(root, 'chore: change the gate')
  const result = checkStamp({ root })
  assert.equal(result.ok, false)
  assert.match(result.reason, /inputs changed/)
})

test('a dirty tree refuses the write as a no-op', () => {
  const root = makeRepo()
  writeFileSync(join(root, 'lib', 'a.js'), 'export function a() { return 3 }\n')
  const result = writeStamp({ root, base: baseOf(root) })
  assert.equal(result.written, false)
  assert.match(result.reason, /dirty/)
})

test('a dirty tree refuses the clear', () => {
  const root = makeRepo()
  writeStamp({ root, base: baseOf(root) })
  writeFileSync(join(root, 'lib', 'a.js'), 'export function a() { return 4 }\n')
  const result = clearStamp({ root })
  assert.equal(result.cleared, false)
  assert.match(result.reason, /dirty/)
  assert.ok(readFileSync(stampPath(root), 'utf8').includes('"version": 1'))
})

test('a failed enforce run clears the stamp', () => {
  const root = makeRepo()
  writeStamp({ root, base: baseOf(root) })
  const result = clearStampOnFailure({ root, mode: 'enforce' })
  assert.equal(result.cleared, true)
  assert.equal(checkStamp({ root }).ok, false)
})

test('report mode and baseline updates leave the stamp', () => {
  const root = makeRepo()
  writeStamp({ root, base: baseOf(root) })
  assert.equal(clearStampOnFailure({ root, mode: 'report' }).cleared, false)
  assert.equal(clearStampOnFailure({ root, mode: 'enforce', updateBaseline: true }).cleared, false)
  assert.equal(checkStamp({ root }).ok, true)
})

test('a missing stamp refuses reuse', () => {
  const root = makeRepo()
  const result = checkStamp({ root })
  assert.equal(result.ok, false)
  assert.match(result.reason, /no stamp is recorded/)
})

test('a corrupt record refuses reuse', () => {
  const root = makeRepo()
  writeStamp({ root, base: baseOf(root) })
  writeFileSync(stampPath(root), '{not json')
  const result = checkStamp({ root })
  assert.equal(result.ok, false)
  assert.match(result.reason, /not valid JSON/)
})

test('an unsupported record version refuses reuse', () => {
  const root = makeRepo()
  writeStamp({ root, base: baseOf(root) })
  rewriteStamp(root, (record) => { record.version = 99 })
  const result = checkStamp({ root })
  assert.equal(result.ok, false)
  assert.match(result.reason, /unsupported version/)
})

test('an unreadable stamp file refuses reuse', () => {
  const root = makeRepo()
  mkdirSync(stampPath(root), { recursive: true })
  const result = checkStamp({ root })
  assert.equal(result.ok, false)
  assert.match(result.reason, /cannot read/)
})

test('a different Node version refuses reuse', () => {
  const root = makeRepo()
  writeStamp({ root, base: baseOf(root) })
  const result = checkStamp({ root, node: 'v22.0.0' })
  assert.equal(result.ok, false)
  assert.match(result.reason, /written on/)
})

test('a moved merge base refuses reuse', () => {
  const root = makeRepo()
  writeStamp({ root, base: baseOf(root) })
  rewriteStamp(root, (record) => { record.base = 'deadbeef' })
  const result = checkStamp({ root })
  assert.equal(result.ok, false)
  assert.match(result.reason, /merge base moved/)
})

test('a missing input path refuses reuse', () => {
  const root = makeRepo()
  writeStamp({ root, base: baseOf(root) })
  rmSync(join(root, 'coverage.baseline.json'))
  commitAll(root, 'chore: drop the baseline')
  assert.throws(() => fingerprint(root), /cannot read coverage.baseline.json/)
  const result = checkStamp({ root })
  assert.equal(result.ok, false)
  assert.match(result.reason, /cannot read coverage.baseline.json/)
})

test('a directory without git refuses reuse', () => {
  const root = mkdtempSync(join(tmpdir(), 'coverage-stamp-nogit-'))
  const result = checkStamp({ root })
  assert.equal(result.ok, false)
  assert.match(result.reason, /no stamp is recorded|git /)
})

test('the check command exits nonzero without a stamp and zero with one', () => {
  const root = makeRepo()
  const script = fileURLToPath(new URL('../scripts/coverage-stamp.mjs', import.meta.url))
  const missing = spawnSync(process.execPath, [script, 'check', '--root', root], { encoding: 'utf8' })
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /no stamp is recorded/)
  writeStamp({ root, base: baseOf(root) })
  const present = spawnSync(process.execPath, [script, 'check', '--root', root], { encoding: 'utf8' })
  assert.equal(present.status, 0)
  assert.match(present.stdout, /reused the pass recorded at/)
})

test('the check command rejects an unknown command and argument', () => {
  const script = fileURLToPath(new URL('../scripts/coverage-stamp.mjs', import.meta.url))
  const unknownCommand = spawnSync(process.execPath, [script, 'resume'], { encoding: 'utf8' })
  assert.equal(unknownCommand.status, 2)
  assert.match(unknownCommand.stderr, /unknown command/)
  const unknownArgument = spawnSync(process.execPath, [script, 'check', '--bogus'], { encoding: 'utf8' })
  assert.equal(unknownArgument.status, 2)
  assert.match(unknownArgument.stderr, /unknown argument/)
})
