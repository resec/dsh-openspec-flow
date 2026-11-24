import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { COMPILE_CACHE, testEnvFor } from '../scripts/test-env.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function scratch(t) {
  const base = mkdtempSync(join(tmpdir(), 'test-env-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  return base
}

test('a symlinked TMPDIR is resolved to its canonical path', (t) => {
  const base = scratch(t)
  const real = join(base, 'real')
  const link = join(base, 'link')
  mkdirSync(real)
  symlinkSync(real, link, 'dir')
  const env = { ...process.env, TMPDIR: link }
  assert.equal(testEnvFor(false, env).TMPDIR, realpathSync.native(real))
  assert.equal(testEnvFor(true, env).TMPDIR, realpathSync.native(real))
})

test('an already canonical TMPDIR is passed through unchanged', (t) => {
  const canonical = realpathSync.native(mkdtempSync(join(tmpdir(), 'test-env-canonical-')))
  t.after(() => rmSync(canonical, { recursive: true, force: true }))
  const env = { ...process.env, TMPDIR: canonical }
  assert.equal(testEnvFor(false, env).TMPDIR, canonical)
})

test('an unresolvable TMPDIR keeps the inherited value', () => {
  const missing = join(tmpdir(), 'test-env-missing-dir')
  const env = { ...process.env, TMPDIR: missing }
  assert.equal(testEnvFor(false, env).TMPDIR, missing)
  assert.equal(testEnvFor(true, env).TMPDIR, missing)
})

test('the compile-cache split stays unchanged', () => {
  assert.equal(COMPILE_CACHE, join(process.cwd(), '.cache', 'node-compile'))
  assert.equal(testEnvFor(false).NODE_COMPILE_CACHE, COMPILE_CACHE)
  assert.equal(testEnvFor(true).NODE_COMPILE_CACHE, undefined)
})

const GIT_INJECTED = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_COMMON_DIR',
  'GIT_PREFIX',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
]

test('git-injected variables never reach the test process', () => {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/tmp/fixture-gitconfig', GIT_CONFIG_SYSTEM: '/tmp/system' }
  for (const name of GIT_INJECTED) env[name] = name === 'GIT_PREFIX' || name === 'GIT_WORK_TREE' ? '' : '/host/.git/worktrees/wt'
  for (const coverage of [false, true]) {
    const child = testEnvFor(coverage, env)
    for (const name of GIT_INJECTED) assert.equal(Object.hasOwn(child, name), false, `${name} is dropped`)
    assert.equal(child.GIT_CONFIG_GLOBAL, '/tmp/fixture-gitconfig')
    assert.equal(child.GIT_CONFIG_SYSTEM, '/tmp/system')
  }
  assert.equal(env.GIT_DIR, '/host/.git/worktrees/wt', 'the base environment is left as it was')
})

function cleanGitEnv() {
  const env = { ...process.env }
  for (const name of GIT_INJECTED) delete env[name]
  return env
}

function hostGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanGitEnv() })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

test('a hook-shaped run leaves the hosting repository untouched', (t) => {
  const base = realpathSync.native(scratch(t))
  const host = join(base, 'host')
  mkdirSync(host)
  hostGit(host, ['init', '-q', '-b', 'main'])
  hostGit(host, ['config', 'user.email', 'test@example.com'])
  hostGit(host, ['config', 'user.name', 'Test'])
  writeFileSync(join(host, 'README.md'), 'host\n')
  hostGit(host, ['add', 'README.md'])
  hostGit(host, ['commit', '-qm', 'host'])
  const linked = join(base, 'linked')
  hostGit(host, ['worktree', 'add', '-q', '-b', 'linked-branch', linked])
  const hostGitDir = join(host, '.git', 'worktrees', 'linked')
  assert.equal(existsSync(join(hostGitDir, 'HEAD')), true, 'the linked worktree has its own git dir')
  const refsBefore = hostGit(host, ['for-each-ref'])
  const configBefore = hostGit(host, ['config', '--local', '--list'])

  const fixture = join(base, 'fixture')
  mkdirSync(fixture)
  const env = testEnvFor(false, { ...process.env, GIT_DIR: hostGitDir, GIT_WORK_TREE: linked })
  const helper = new URL('./git-fixture.mjs', import.meta.url).href
  const child = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    `const { initFixtureRepo } = await import(${JSON.stringify(helper)}); initFixtureRepo(process.argv[1], ['-q', '-b', 'main'])`,
    fixture,
  ], { cwd: ROOT, encoding: 'utf8', env })

  assert.equal(child.status, 0, child.stderr)
  assert.equal(existsSync(join(fixture, '.git', 'HEAD')), true, 'the fixture root owns its repository')
  assert.equal(hostGit(host, ['for-each-ref']), refsBefore, 'the hosting repository gained or lost a ref')
  assert.equal(hostGit(host, ['config', '--local', '--list']), configBefore, 'the hosting repository configuration changed')
})
