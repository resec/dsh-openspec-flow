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
 * Run the hook with the fake npm.
 * @param options - fake npm behavior and extra hook environment.
 * @returns the spawn result and the recorded npm calls.
 */
function runHook({ failValidation = false, env = {} } = {}) {
  const fake = fakeNpm({ failValidation })
  const result = spawnSync('sh', [HOOK], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fake.dir}:${process.env.PATH}`,
      HOOK_LOG: fake.log,
      ...env,
    },
  })
  const calls = existsSync(fake.log)
    ? readFileSync(fake.log, 'utf8').trim().split('\n').filter((line) => line !== '')
    : []
  return { result, calls }
}

test('pre-push runs strict validation before coverage', () => {
  const { result, calls } = runHook()
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check', 'run coverage:check'])
})

test('COVERAGE_SKIP still runs strict validation', () => {
  const { result, calls } = runHook({ env: { COVERAGE_SKIP: '1' } })
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check'])
})

test('a failed validation blocks the push before coverage', () => {
  const { result, calls } = runHook({ failValidation: true })
  assert.equal(result.status, 1)
  assert.deepEqual(calls, ['run openspec:check'])
})

test('openspec:check validates active artifacts and archived task state', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const script = manifest.scripts['openspec:check']
  assert.match(script, /validate --all --strict/)
  assert.match(script, /validate --archived --strict/)
})
