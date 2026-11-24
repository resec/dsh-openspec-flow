import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCRIPT = join(ROOT, 'scripts', 'affected-tests.mjs')
const RUNNER = join(ROOT, 'scripts', 'run-tests.mjs')

/** Create a scratch probe directory that the test removes afterwards. */
function scratch(t) {
  const directory = mkdtempSync(join(tmpdir(), 'run-root-lifecycle-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

/** Build an environment that no longer carries the outer test runner's context. */
function childEnv(overrides) {
  const env = { ...process.env, ...overrides }
  delete env.NODE_TEST_CONTEXT
  delete env.COVERAGE
  return env
}

/** Run the plain entrypoint with a name filter and resolve with its status. */
function runRunner(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [RUNNER, ...args], {
      cwd: ROOT,
      env: childEnv(env),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', (error) => resolve({ code: -1, stderr: String(error) }))
    child.once('exit', (code) => resolve({ code: code ?? 1, stderr }))
  })
}

/** Run the scoped entrypoint and resolve with its exit status and stderr. */
function runScoped(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: ROOT,
      env: childEnv(env),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', (error) => resolve({ code: -1, stderr: String(error) }))
    child.once('exit', (code) => resolve({ code: code ?? 1, stderr }))
  })
}

test('a passing scoped run removes its run root', async (t) => {
  const probe = scratch(t)
  const result = await runScoped(['--run', 'test/temp.test.mjs'], { TMPDIR: probe })
  assert.equal(result.code, 0)
  assert.deepEqual(readdirSync(probe), [])
})

test('a kept scoped run leaves one root and reports its path', async (t) => {
  const probe = scratch(t)
  const result = await runScoped(['--run', 'test/temp.test.mjs'], { TMPDIR: probe, DSH_TEST_KEEP_TMP: '1' })
  assert.equal(result.code, 0)
  const entries = readdirSync(probe)
  assert.equal(entries.length, 1)
  assert.match(entries[0], /^openspec-flow-run-/)
  assert.ok(result.stderr.includes(join(probe, entries[0])))
  rmSync(join(probe, entries[0]), { recursive: true, force: true })
})

test('listing creates no run root', async (t) => {
  const probe = scratch(t)
  const result = await runScoped(['--list', 'lib/review/brief.js'], { TMPDIR: probe })
  assert.equal(result.code, 0)
  assert.deepEqual(readdirSync(probe), [])
})

test('a scoped run interrupted by SIGTERM removes its root and exits 143', async (t) => {
  const probe = scratch(t)
  const child = spawn(process.execPath, [SCRIPT, '--run', 'test/e2e.test.mjs'], {
    cwd: ROOT,
    env: childEnv({ TMPDIR: probe }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let childStderr = ''
  child.stderr.on('data', (chunk) => { childStderr += chunk })
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)))
  const timer = setTimeout(() => child.kill('SIGTERM'), 1500)
  try {
    const code = await exited
    assert.equal(code, 143, `child stderr: ${childStderr.slice(0, 500)}`)
    assert.deepEqual(readdirSync(probe), [])
  } finally {
    clearTimeout(timer)
  }
})

test('a passing plain run removes its run root', async (t) => {
  const probe = scratch(t)
  const result = await runRunner(['plugin', '--', '--test-name-pattern=a registered root is created'], { TMPDIR: probe })
  assert.equal(result.code, 0)
  assert.deepEqual(readdirSync(probe), [])
})

test('a failing plain run removes its run root', async (t) => {
  const probe = scratch(t)
  const result = await runRunner(['plugin', '--', '--bogus-test-flag'], { TMPDIR: probe })
  assert.notEqual(result.code, 0)
  assert.deepEqual(readdirSync(probe), [])
})

test('a kept plain run leaves one root and reports its path', async (t) => {
  const probe = scratch(t)
  const result = await runRunner(['plugin', '--', '--test-name-pattern=a registered root is created'], {
    TMPDIR: probe,
    DSH_TEST_KEEP_TMP: '1',
  })
  assert.equal(result.code, 0)
  const entries = readdirSync(probe)
  assert.equal(entries.length, 1)
  assert.match(entries[0], /^openspec-flow-run-/)
  assert.ok(result.stderr.includes(join(probe, entries[0])))
  rmSync(join(probe, entries[0]), { recursive: true, force: true })
})

test('a plain run interrupted by SIGTERM removes its root and exits 143', async (t) => {
  const probe = scratch(t)
  const child = spawn(process.execPath, [RUNNER, 'plugin', '--', '--test-name-pattern=runs init, plan, apply and archive'], {
    cwd: ROOT,
    env: childEnv({ TMPDIR: probe }),
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)))
  const timer = setTimeout(() => child.kill('SIGTERM'), 1500)
  try {
    assert.equal(await exited, 143)
    assert.deepEqual(readdirSync(probe), [])
  } finally {
    clearTimeout(timer)
  }
})
