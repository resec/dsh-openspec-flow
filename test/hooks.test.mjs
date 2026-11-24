import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HOOK = join(ROOT, '.githooks', 'pre-push')

/**
 * Put a fake `npm` on PATH that records each script it is asked to run.
 * @param options - `failValidation` exits nonzero for the validation step.
 * @returns the fake bin directory and the call log path.
 */
function fakeNpm({ failValidation = false, failLab = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'openspec-hook-'))
  const bin = join(dir, 'npm')
  const body = [
    '#!/bin/sh',
    'printf "%s\\n" "$*" >> "$HOOK_LOG"',
    failValidation
      ? 'case "$*" in *openspec:check*) exit 1 ;; esac'
      : '',
    failLab
      ? 'case "$*" in *test:lab*) exit 1 ;; esac'
      : '',
    'exit 0',
    '',
  ].join('\n')
  writeFileSync(bin, body)
  chmodSync(bin, 0o755)
  return { dir, log: join(dir, 'calls.log') }
}

/**
 * Put a fake `node` on PATH that records the stamp check and returns a verdict.
 * @param options - `stampExit` is the exit code the stamp check reports.
 * @returns the fake bin directory and the call log path.
 */
function fakeNode({ stampExit = 1 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'openspec-hook-node-'))
  const bin = join(dir, 'node')
  const body = [
    '#!/bin/sh',
    'printf "%s\\n" "$*" >> "$NODE_LOG"',
    `exit ${stampExit}`,
    '',
  ].join('\n')
  writeFileSync(bin, body)
  chmodSync(bin, 0o755)
  return { dir, log: join(dir, 'node.log') }
}

/**
 * Run the hook with a fake npm and a fake node.
 * @param options - fake behavior, stdin refs, stdin mode and extra hook environment.
 * @returns the spawn result, the recorded npm calls and the recorded node calls.
 */
function runHook({ failValidation = false, failLab = false, stampExit = 1, input = '', stdin = 'pipe', env = {} } = {}) {
  const fake = fakeNpm({ failValidation, failLab })
  const fakeBin = fakeNode({ stampExit })
  const options = {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin.dir}:${fake.dir}:${process.env.PATH}`,
      HOOK_LOG: fake.log,
      NODE_LOG: fakeBin.log,
      ...env,
    },
  }
  if (stdin === 'ignore') options.stdio = ['ignore', 'pipe', 'pipe']
  else options.input = input
  const result = spawnSync('sh', [HOOK], options)
  const read = (path) =>
    existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').filter((line) => line !== '') : []
  return { result, calls: read(fake.log), nodeCalls: read(fakeBin.log) }
}

const MAIN_REF = 'refs/heads/main 1111111111111111111111111111111111111111 refs/heads/main 2222222222222222222222222222222222222222\n'
const BRANCH_REF = 'refs/heads/topic 3333333333333333333333333333333333333333 refs/heads/topic 4444444444444444444444444444444444444444\n'

test('a main-only push runs the scoped gate', () => {
  const { result, calls } = runHook({ input: MAIN_REF })
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check:push', 'run test:lab -- --mock-only', 'run verify'])
})

test('a non-main push keeps the full check', () => {
  const { result, calls } = runHook({ input: BRANCH_REF })
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check', 'run test:lab -- --mock-only', 'run verify'])
})

test('a mixed push keeps the full check', () => {
  const { result, calls } = runHook({ input: `${MAIN_REF}${BRANCH_REF}` })
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check', 'run test:lab -- --mock-only', 'run verify'])
})

test('absent stdin keeps the full check', () => {
  const { result, calls } = runHook()
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check', 'run test:lab -- --mock-only', 'run verify'])
})

test('a closed stdin keeps the full check', () => {
  const { result, calls } = runHook({ stdin: 'ignore' })
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check', 'run test:lab -- --mock-only', 'run verify'])
})

test('a failed scoped validation stops before the lab gate', () => {
  const { result, calls, nodeCalls } = runHook({ input: MAIN_REF, failValidation: true })
  assert.equal(result.status, 1)
  assert.deepEqual(calls, ['run openspec:check:push'])
  assert.deepEqual(nodeCalls, [])
})

test('a failing stamp check runs strict validation and then verification', () => {
  const { result, calls, nodeCalls } = runHook()
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check', 'run test:lab -- --mock-only', 'run verify'])
  assert.deepEqual(nodeCalls, ['scripts/coverage-stamp.mjs check'])
})

test('a matching stamp skips verification after validation', () => {
  const { result, calls, nodeCalls } = runHook({ stampExit: 0 })
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check', 'run test:lab -- --mock-only'])
  assert.deepEqual(nodeCalls, ['scripts/coverage-stamp.mjs check'])
})

test('COVERAGE_SKIP still runs validation and the lab gate without checking the stamp', () => {
  const { result, calls, nodeCalls } = runHook({ env: { COVERAGE_SKIP: '1' } })
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check', 'run test:lab -- --mock-only'])
  assert.deepEqual(nodeCalls, [])
})

test('a failed lab gate blocks the push before the stamp check', () => {
  const { result, calls, nodeCalls } = runHook({ failLab: true, stampExit: 0 })
  assert.equal(result.status, 1)
  assert.deepEqual(calls, ['run openspec:check', 'run test:lab -- --mock-only'])
  assert.deepEqual(nodeCalls, [])
})

test('COVERAGE_SKIP does not hide a failed lab gate', () => {
  const { result, calls } = runHook({ failLab: true, env: { COVERAGE_SKIP: '1' } })
  assert.equal(result.status, 1)
  assert.deepEqual(calls, ['run openspec:check', 'run test:lab -- --mock-only'])
})

test('a failed validation blocks the push before the stamp check and coverage', () => {
  const { result, calls, nodeCalls } = runHook({ failValidation: true, stampExit: 0 })
  assert.equal(result.status, 1)
  assert.deepEqual(calls, ['run openspec:check'])
  assert.deepEqual(nodeCalls, [])
})

test('openspec:check validates active artifacts and archived task state', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const script = manifest.scripts['openspec:check']
  assert.match(script, /validate --all --strict/)
  assert.match(script, /validate --archived --strict/)
})

test('openspec:check:push runs the scoped main gate', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(manifest.scripts['openspec:check:push'], 'node scripts/check-pre-push.mjs')
})

test('the hook installer names the ref-aware gate', () => {
  const source = readFileSync(join(ROOT, 'scripts', 'install-hooks.mjs'), 'utf8')
  assert.match(source, /openspec:check:push/)
  assert.match(source, /refs\/heads\/main/)
})

test('verify and coverage:check run the same command', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(manifest.scripts.verify, manifest.scripts['coverage:check'])
  assert.equal(manifest.scripts.verify, 'node scripts/coverage.mjs --check')
})

test('the hook installer names the stamp file and every invalidator', () => {
  const source = readFileSync(join(ROOT, 'scripts', 'install-hooks.mjs'), 'utf8')
  assert.match(source, /npm run verify/)
  assert.match(source, /scripts\/coverage-stamp\.mjs check/)
  assert.match(source, /\.cache\/coverage-stamp\.json/)
  assert.match(source, /missing or corrupt stamp/)
  assert.match(source, /dirty tree/)
  assert.match(source, /fingerprint mismatch/)
  assert.match(source, /merge base/)
  assert.match(source, /different Node version/)
  assert.doesNotMatch(source, /coverage:check/)
})
