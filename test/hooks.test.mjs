import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { cleanupTempDirs, tempDir } from './temp.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HOOK = join(ROOT, '.githooks', 'pre-push')

test.after(cleanupTempDirs)

/**
 * Put a fake `npm` on PATH that records each script it is asked to run.
 * @param options - `failValidation` exits nonzero for the validation step.
 * @returns the fake bin directory and the call log path.
 */
function fakeNpm({ failValidation = false } = {}) {
  const dir = tempDir('openspec-hook-')
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
 * Put a fake `node` on PATH that records the landed check and the stamp check.
 * @param options - exit codes for the landed check and the stamp check.
 * @returns the fake bin directory and the call log path.
 */
function fakeNode({ stampExit = 1, checkExit = 0 } = {}) {
  const dir = tempDir('openspec-hook-node-')
  const bin = join(dir, 'node')
  const body = [
    '#!/bin/sh',
    'printf "%s\\n" "$*" >> "$NODE_LOG"',
    'case "$1" in',
    '  scripts/toolchain.mjs) [ -n "${RECORD_NODE:-}" ] && printf "%s\\n" "$RECORD_NODE"; exit "${RECORD_EXIT:-0}" ;;',
    `  scripts/check-main-push.mjs) exit ${checkExit} ;;`,
    `  scripts/coverage-stamp.mjs) exit ${stampExit} ;;`,
    '  *) exit 1 ;;',
    'esac',
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
function runHook({ failValidation = false, stampExit = 1, checkExit = 0, input = '', stdin = 'pipe', env = {}, cwd } = {}) {
  const fake = fakeNpm({ failValidation })
  const fakeBin = fakeNode({ stampExit, checkExit })
  const options = {
    cwd: cwd ?? fake.dir,
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

const MAIN_LOCAL = '1111111111111111111111111111111111111111'
const MAIN_REMOTE = '2222222222222222222222222222222222222222'
const MAIN_REF = `refs/heads/main ${MAIN_LOCAL} refs/heads/main ${MAIN_REMOTE}\n`
const BRANCH_REF = 'refs/heads/topic 3333333333333333333333333333333333333333 refs/heads/topic 4444444444444444444444444444444444444444\n'
const MAIN_CHECK = `scripts/check-main-push.mjs ${MAIN_LOCAL} ${MAIN_REMOTE}`

test('a main-only push runs the scoped gate and the landed check', () => {
  const { result, calls, nodeCalls } = runHook({ input: MAIN_REF })
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check:push', 'run verify'])
  assert.deepEqual(nodeCalls, [MAIN_CHECK, 'scripts/coverage-stamp.mjs check'])
})

test('a non-main push keeps the full check and skips the landed check', () => {
  const { result, calls, nodeCalls } = runHook({ input: BRANCH_REF })
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check', 'run verify'])
  assert.deepEqual(nodeCalls, ['scripts/coverage-stamp.mjs check'])
})

test('a mixed push checks the main line pair, not the last ref', () => {
  const { result, calls, nodeCalls } = runHook({ input: `${MAIN_REF}${BRANCH_REF}` })
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check', 'run verify'])
  assert.equal(nodeCalls[0], MAIN_CHECK)
  assert.equal(nodeCalls[0].includes('3333333333333333333333333333333333333333'), false)
})

test('absent stdin keeps the full check and skips the landed check', () => {
  const { result, calls, nodeCalls } = runHook()
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check', 'run verify'])
  assert.deepEqual(nodeCalls, ['scripts/coverage-stamp.mjs check'])
})

test('a closed stdin keeps the full check and skips the landed check', () => {
  const { result, calls, nodeCalls } = runHook({ stdin: 'ignore' })
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check', 'run verify'])
  assert.deepEqual(nodeCalls, ['scripts/coverage-stamp.mjs check'])
})

test('a failed scoped validation stops before the landed and stamp checks', () => {
  const { result, calls, nodeCalls } = runHook({ input: MAIN_REF, failValidation: true })
  assert.equal(result.status, 1)
  assert.deepEqual(calls, ['run openspec:check:push'])
  assert.deepEqual(nodeCalls, [])
})

test('a failed landed check blocks the push before the stamp and verification', () => {
  const { result, calls, nodeCalls } = runHook({ input: MAIN_REF, checkExit: 1, stampExit: 0 })
  assert.equal(result.status, 1)
  assert.deepEqual(calls, ['run openspec:check:push'])
  assert.deepEqual(nodeCalls, [MAIN_CHECK])
})

test('a failing stamp check runs validation, the landed check and verification', () => {
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

test('COVERAGE_SKIP still runs the landed check for a main push', () => {
  const { result, calls, nodeCalls } = runHook({ input: MAIN_REF, env: { COVERAGE_SKIP: '1' } })
  assert.equal(result.status, 0)
  assert.deepEqual(calls, ['run openspec:check:push'])
  assert.deepEqual(nodeCalls, [MAIN_CHECK])
})

test('the hook does not run the reusable lab scenarios', () => {
  const source = readFileSync(join(ROOT, '.githooks', 'pre-push'), 'utf8')
  assert.doesNotMatch(source, /test:lab/)
  const { result, calls, nodeCalls } = runHook({ stampExit: 0 })
  assert.equal(result.status, 0)
  assert.equal(calls.some((call) => call.includes('test:lab')), false)
  assert.deepEqual(calls, ['run openspec:check'])
  assert.deepEqual(nodeCalls, ['scripts/coverage-stamp.mjs check'])
})

test('the remote lab job guards pull requests and main', () => {
  const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
  assert.match(workflow, /^\s{2}lab:/mu)
  assert.match(workflow, /on:\n  pull_request:\n  push:\n    branches:\n      - main/u)
  assert.match(workflow, /npm run test:lab -- --mock-only/u)
})

test('a failed validation blocks the push before the landed check and coverage', () => {
  const { result, calls, nodeCalls } = runHook({ failValidation: true, stampExit: 0 })
  assert.equal(result.status, 1)
  assert.deepEqual(calls, ['run openspec:check'])
  assert.deepEqual(nodeCalls, [])
})

test('openspec:check validates active artifacts, archived task state and change metadata', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const script = manifest.scripts['openspec:check']
  assert.match(script, /validate --all --strict/)
  assert.match(script, /validate --archived --strict/)
  assert.match(script, /check-change-metadata\.mjs/)
})

test('openspec:check:push runs the scoped main gate', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(manifest.scripts['openspec:check:push'], 'node scripts/check-pre-push.mjs')
})

test('the hook installer names the ref-aware gate and the landed check', () => {
  const source = readFileSync(join(ROOT, 'scripts', 'install-hooks.mjs'), 'utf8')
  assert.match(source, /openspec:check:push/)
  assert.match(source, /refs\/heads\/main/)
  assert.match(source, /scripts\/check-main-push\.mjs/)
  assert.match(source, /push-landed --offline/)
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
  assert.match(source, /remote lab CI job for pull requests and main/)
  assert.match(source, /offline local path runs npm run test:lab -- --mock-only/)
  assert.doesNotMatch(source, /never the lab gate/)
  assert.doesNotMatch(source, /coverage:check/)
})


test('a recorded Node is put first and a missing record keeps PATH', () => {
  const root = tempDir('openspec-hook-record-')
  mkdirSync(join(root, '.cache', 'toolchain'), { recursive: true })
  writeFileSync(join(root, '.cache', 'toolchain', 'manifest.json'), '{}\n')
  const recordedDir = tempDir('openspec-hook-recorded-node-')
  const marker = join(recordedDir, 'called.txt')
  const recordedNode = join(recordedDir, 'node')
  writeFileSync(recordedNode, `#!/bin/sh\nprintf '%s\\n' "$@" >> ${JSON.stringify(marker)}\nexit 1\n`)
  chmodSync(recordedNode, 0o755)
  const { result, calls } = runHook({
    input: BRANCH_REF,
    cwd: root,
    env: { RECORD_NODE: recordedNode },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.ok(existsSync(marker))
  assert.deepEqual(calls, ['run openspec:check', 'run verify'])
  const recorded = readFileSync(marker, 'utf8')
  assert.match(recorded, /scripts\/coverage-stamp\.mjs/)
  assert.match(recorded, /check/)
})
