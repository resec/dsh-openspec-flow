import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import {
  acquireInstallLockSync,
  checkEnvironment,
  initEnvironment,
  inspectInstallLock,
  installLockPath,
  prepareChromium,
  releaseInstallLock,
  renderPrint,
  resolveBrowsersPath,
  resolveEnvironment,
  resolveNpmCache,
} from '../scripts/worktree-env.mjs'

const MODULE = fileURLToPath(new URL('../scripts/worktree-env.mjs', import.meta.url))

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function makeRepository() {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-worktree-env-'))
  git(directory, ['init', '-q'])
  git(directory, ['config', 'user.email', 'test@example.com'])
  git(directory, ['config', 'user.name', 'Test'])
  writeFileSync(join(directory, 'README.md'), '# test\n')
  git(directory, ['add', '.'])
  git(directory, ['commit', '-qm', 'initial'])
  return directory
}

function cleanup(directory) {
  rmSync(directory, { recursive: true, force: true })
}

test('resolves the main worktree, current worktree and shared paths', () => {
  const root = makeRepository()
  const linked = join(root, '..', `dsh-linked-${process.pid}-${Date.now()}`)
  try {
    git(root, ['worktree', 'add', '-q', '-b', 'linked-test', linked])
    const main = resolveEnvironment({ cwd: root, env: {} })
    assert.equal(main.mainRoot, root)
    assert.equal(main.worktree, root)
    assert.equal(main.sharedRoot, join(root, '.cache', 'openspec-flow', 'shared'))
    assert.equal(main.dshHome, join(root, '.cache', 'openspec-flow', 'dsh-home'))
    const worktree = resolveEnvironment({ cwd: linked, env: {} })
    assert.equal(worktree.mainRoot, root)
    assert.equal(worktree.worktree, linked)
    assert.equal(worktree.sharedRoot, main.sharedRoot)
    assert.equal(worktree.dshHome, join(linked, '.cache', 'openspec-flow', 'dsh-home'))
    assert.notEqual(worktree.dshHome, main.dshHome)
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', linked], { cwd: root, stdio: 'ignore' })
    cleanup(root)
  }
})

test('uses an absolute shared-root override and rejects an invalid one', () => {
  const root = makeRepository()
  try {
    const shared = join(root, 'custom-shared')
    const resolved = resolveEnvironment({ cwd: root, env: { OPENSPEC_FLOW_SHARED_ROOT: shared } })
    assert.equal(resolved.sharedRoot, shared)
    assert.equal(resolved.npmCache, join(shared, 'npm'))
    assert.throws(
      () => resolveEnvironment({ cwd: root, env: { OPENSPEC_FLOW_SHARED_ROOT: 'relative' } }),
      /must be absolute/,
    )
    assert.throws(
      () => resolveEnvironment({ cwd: root, env: { OPENSPEC_FLOW_SHARED_ROOT: '/tmp/with\nnewline' } }),
      /must not contain/,
    )
  } finally {
    cleanup(root)
  }
})

test('the shell output carries caches and a per-worktree home but no node_modules', () => {
  const root = makeRepository()
  try {
    const environment = resolveEnvironment({ cwd: root, env: {} })
    const text = renderPrint(environment)
    assert.match(text, /npm_config_cache=/)
    assert.match(text, /PNPM_STORE_DIR=/)
    assert.match(text, /PLAYWRIGHT_BROWSERS_PATH=/)
    assert.match(text, /DSH_HOME=/)
    assert.doesNotMatch(text, /node_modules/)
    assert.doesNotMatch(text, /openspec-flow\/review/)
  } finally {
    cleanup(root)
  }
})

test('resolves lab browser and npm paths from root and environment', () => {
  const root = '/tmp/lab-root'
  assert.equal(resolveBrowsersPath({ root, env: {} }), join(root, '.cache', 'lab', 'pw-browsers'))
  assert.equal(resolveBrowsersPath({ root, env: { PLAYWRIGHT_BROWSERS_PATH: '/shared/pw' } }), '/shared/pw')
  assert.equal(resolveNpmCache({ fallback: '/fallback', env: { npm_config_cache: '/npm' } }), '/npm')
  assert.equal(resolveNpmCache({ fallback: '/fallback', env: { LAB_NPM_CACHE: '/lab' } }), '/lab')
})

test('prepareChromium installs once, reuses the browser and resets under the lock', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-chromium-'))
  const browsers = join(root, 'pw-browsers')
  const installations = []
  const install = ({ browsersPath }) => {
    installations.push(browsersPath)
    mkdirSync(join(browsersPath, 'chrome-linux'), { recursive: true })
    writeFileSync(join(browsersPath, 'chrome-linux', 'chrome'), '')
  }
  try {
    assert.deepEqual(prepareChromium({ browsersPath: browsers, install }), { installed: true, reused: false })
    assert.deepEqual(prepareChromium({ browsersPath: browsers, install }), { installed: false, reused: true })
    assert.deepEqual(prepareChromium({ browsersPath: browsers, reset: true, install }), { installed: true, reused: false })
    assert.equal(installations.length, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a stale install lock is reclaimed and a live lock times out with the owner', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-lock-'))
  const browsers = join(root, 'pw-browsers')
  const lock = installLockPath(browsers)
  mkdirSync(lock, { recursive: true })
  writeFileSync(join(lock, 'owner.json'), `${JSON.stringify({ schema: 1, token: 'dead', pid: 2_147_483_647, what: 'old' })}\n`)
  try {
    const result = prepareChromium({
      browsersPath: browsers,
      install: () => {
        mkdirSync(join(browsers, 'chrome'), { recursive: true })
        writeFileSync(join(browsers, 'chrome', 'chrome'), '')
      },
    })
    assert.equal(result.installed, true)
    assert.equal(inspectInstallLock(lock).held, false)
    const held = acquireInstallLockSync(lock, 'test', { timeoutMs: 1000 })
    try {
      assert.equal(inspectInstallLock(lock).held, true)
      assert.throws(
        () => prepareChromium({ browsersPath: browsers, install: () => {}, timeoutMs: 30, pollMs: 5 }),
        /timed out waiting/,
      )
    } finally {
      releaseInstallLock(held)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('two worktree preparations serialize and one Chromium install wins', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-prepare-'))
  const browsers = join(root, 'pw-browsers')
  const counter = join(root, 'installs.txt')
  const worker = join(root, 'worker.mjs')
  writeFileSync(worker, `
    import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
    import { join } from 'node:path'
    import { prepareChromium } from ${JSON.stringify(pathToFileURL(MODULE).href)}
    const browsers = process.argv[2]
    const counter = process.argv[3]
    prepareChromium({
      browsersPath: browsers,
      install: () => {
        appendFileSync(counter, 'install\\n')
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
        mkdirSync(join(browsers, 'chrome'), { recursive: true })
        writeFileSync(join(browsers, 'chrome', 'chrome'), '')
      },
    })
  `)
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, browsers, counter], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr || `exit ${code}`)))
  })
  try {
    await Promise.all([run(), run()])
    assert.equal(readFileSync(counter, 'utf8').trim().split('\n').length, 1)
    assert.equal(existsSync(join(browsers, 'chrome', 'chrome')), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('check reports missing paths, a mismatched inherited DSH_HOME and a held lock', () => {
  const root = makeRepository()
  const shared = join(root, 'shared')
  const environment = resolveEnvironment({ cwd: root, env: { OPENSPEC_FLOW_SHARED_ROOT: shared } })
  const fakeSpawn = () => ({ status: 0, stdout: '12.6.0\n' })
  try {
    const missing = checkEnvironment({ environment, env: {}, spawn: fakeSpawn })
    assert.equal(missing.ok, false)
    assert.ok(missing.errors.some((line) => line.includes('shared root')))
    mkdirSync(join(shared, 'npm'), { recursive: true })
    mkdirSync(join(shared, 'pnpm-store'), { recursive: true })
    mkdirSync(join(shared, 'pw-browsers', 'chrome'), { recursive: true })
    writeFileSync(join(shared, 'pw-browsers', 'chrome', 'chrome'), '')
    mkdirSync(environment.dshHome, { recursive: true })
    const mismatched = checkEnvironment({ environment, env: { DSH_HOME: '/other/home' }, spawn: fakeSpawn })
    assert.equal(mismatched.ok, false)
    assert.ok(mismatched.errors.some((line) => line.includes('inherited DSH_HOME')))
    const held = acquireInstallLockSync(environment.installLock, 'test', { timeoutMs: 1000 })
    try {
      const locked = checkEnvironment({ environment, env: {}, spawn: fakeSpawn })
      assert.equal(locked.lock.held, true)
      assert.equal(locked.lock.state, 'alive')
    } finally {
      releaseInstallLock(held)
    }
  } finally {
    cleanup(root)
  }
})

test('init creates the shared layout and can prepare Chromium', () => {
  const root = makeRepository()
  const shared = join(root, 'shared')
  const environment = resolveEnvironment({ cwd: root, env: { OPENSPEC_FLOW_SHARED_ROOT: shared } })
  try {
    initEnvironment({
      environment,
      browser: true,
      install: ({ browsersPath }) => {
        mkdirSync(join(browsersPath, 'chrome'), { recursive: true })
        writeFileSync(join(browsersPath, 'chrome', 'chrome'), '')
      },
    })
    for (const directory of [environment.sharedRoot, environment.npmCache, environment.pnpmStore, environment.browsersPath, environment.dshHome]) {
      assert.equal(existsSync(directory), true, directory)
    }
    assert.equal(checkEnvironment({ environment, env: {}, spawn: () => ({ status: 0, stdout: '12.6.0\n' }) }).ok, true)
    assert.equal(existsSync(join(shared, 'node_modules')), false)
  } finally {
    cleanup(root)
  }
})
