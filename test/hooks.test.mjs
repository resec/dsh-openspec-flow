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
function fakeNpm({ failValidation = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'openspec-hook-'))
  const bin = join(dir, 'npm')
  const body = [
    '#!/bin/sh',
    'printf "%s\\n" "$*" >> "$HOOK_LOG"',
    failValidation
      ? 'case "$*" in *openspec:check*) exit 1 ;; esac'
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
 * @param options - fake behavior and extra hook environment.
 * @returns the spawn result, the recorded npm calls and the recorded node calls.
 */
function runHook({ failValidation = false, stampExit = 1, env = {} } = {}) {
  const fake = fakeNpm({ failValidation })
  const fakeBin = fakeNode({ stampExit })
  const result = spawnSync('sh', [HOOK], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin.dir}:${fake.dir}:${process.env.PATH}`,
      HOOK_LOG: fake.log,
      NODE_LOG: fakeBin.log,
      ...env,
    },
  })
  const read = (path) =>
    existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').filter((line) => line !== '') : []
  return { result, calls: read(fake.log), nodeCalls: read(fakeBin.log) }
}

test('a failing stamp check runs strict validation and then verification', () => {
  const { result, calls, nodeCalls } = runHook()
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check', 'run verify'])
  assert.deepEqual(nodeCalls, ['scripts/coverage-stamp.mjs check'])
})

test('a matching stamp skips verification after validation', () => {
  const { result, calls, nodeCalls } = runHook({ stampExit: 0 })
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check'])
  assert.deepEqual(nodeCalls, ['scripts/coverage-stamp.mjs check'])
})

test('COVERAGE_SKIP still runs strict validation without checking the stamp', () => {
  const { result, calls, nodeCalls } = runHook({ env: { COVERAGE_SKIP: '1' } })
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check'])
  assert.deepEqual(nodeCalls, [])
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

test('verify and coverage:check run the same command', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(manifest.scripts.verify, manifest.scripts['coverage:check'])
  assert.equal(manifest.scripts.verify, 'node scripts/coverage.mjs --check')
})

test('the hook installer names the verification entrypoint and the stamp check', () => {
  const source = readFileSync(join(ROOT, 'scripts', 'install-hooks.mjs'), 'utf8')
  assert.match(source, /npm run verify/)
  assert.match(source, /scripts\/coverage-stamp\.mjs check/)
  assert.doesNotMatch(source, /coverage:check/)
})
