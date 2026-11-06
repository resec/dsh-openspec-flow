import assert from 'node:assert/strict'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  applyHomeEnv,
  cleanupEvalHome,
  cleanupStaleHomes,
  createEvalHome,
  isOwnedRoot,
  restoreHomeEnv,
} from '../lib/dsh-home.mjs'
import { dshHome, sessionsRoot } from '../lib/paths.mjs'

function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), 'eval-home-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return {
    root,
    source: join(root, 'source'),
    dshHome: join(root, 'dsh'),
    agentsHome: join(root, 'agents'),
  }
}

function credentials(home) {
  mkdirSync(home.source, { recursive: true })
  writeFileSync(join(home.source, '.credentials.yaml'), 'deepseek:\n  token: test\n')
}

function pluginCheckout(t) {
  const root = mkdtempSync(join(tmpdir(), 'eval-home-plugin-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'dsh-openspec-flow', version: '0.1.0' })}\n`,
  )
  return root
}

test('creates a marked home with profile and restricted credentials', (t) => {
  const home = workspace(t)
  credentials(home)
  const plugin = pluginCheckout(t)
  const created = createEvalHome({
    root: home.dshHome,
    agentsRoot: home.agentsHome,
    sourceHome: home.source,
    repoRoot: plugin,
  })

  assert.equal(created.dshHome, home.dshHome)
  assert.equal(isOwnedRoot(home.dshHome, 'dsh-home'), true)
  assert.equal(isOwnedRoot(home.agentsHome, 'agents-home'), true)

  const profile = join(home.dshHome, 'profiles', 'headless')
  const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
  assert.match(manifest.dependencies['dsh-openspec-flow'], /^link:/u)
  assert.deepEqual(manifest.dsh.profile.bundles, [
    '@deepseek-ai/dsh-base',
    '@deepseek-ai/dsh-headless',
    'dsh-openspec-flow',
  ])
  assert.equal(lstatSync(join(profile, 'node_modules', 'dsh-openspec-flow')).isSymbolicLink(), true)
  assert.equal(readlinkSync(join(profile, 'node_modules', 'dsh-openspec-flow')), plugin)
  assert.match(readFileSync(join(profile, 'cordis.patch.yml'), 'utf8'), /reasoningEffort: high/u)
  assert.equal(statSync(join(home.dshHome, '.credentials.yaml')).mode & 0o777, 0o600)
  assert.equal(existsSync(join(home.agentsHome, 'skills')), true)

  cleanupEvalHome({ dshHome: home.dshHome, agentsHome: home.agentsHome })
  assert.equal(existsSync(home.dshHome), false)
  assert.equal(existsSync(home.agentsHome), false)
  assert.equal(existsSync(home.source), true)
})

test('refuses to create without credentials', (t) => {
  const home = workspace(t)
  const plugin = pluginCheckout(t)
  mkdirSync(home.source, { recursive: true })
  assert.throws(
    () =>
      createEvalHome({
        root: home.dshHome,
        agentsRoot: home.agentsHome,
        sourceHome: home.source,
        repoRoot: plugin,
      }),
    /credentials not found/u,
  )
  assert.equal(existsSync(home.dshHome), false)
  assert.equal(existsSync(home.agentsHome), false)
})

test('refuses an unmarked existing root', (t) => {
  const home = workspace(t)
  credentials(home)
  const plugin = pluginCheckout(t)
  mkdirSync(home.dshHome, { recursive: true })
  writeFileSync(join(home.dshHome, 'keep.txt'), 'user data\n')

  assert.throws(
    () =>
      createEvalHome({
        root: home.dshHome,
        agentsRoot: home.agentsHome,
        sourceHome: home.source,
        repoRoot: plugin,
      }),
    /unmarked directory/u,
  )
  assert.equal(existsSync(join(home.dshHome, 'keep.txt')), true)
})

test('applies and restores the home environment', (t) => {
  const home = workspace(t)
  credentials(home)
  const plugin = pluginCheckout(t)
  const created = createEvalHome({
    root: home.dshHome,
    agentsRoot: home.agentsHome,
    sourceHome: home.source,
    repoRoot: plugin,
  })
  const previous = applyHomeEnv(created)
  t.after(() => restoreHomeEnv(previous))

  assert.equal(dshHome(), home.dshHome)
  assert.equal(sessionsRoot(), join(home.dshHome, 'sessions'))
  restoreHomeEnv(previous)
  assert.notEqual(dshHome(), home.dshHome)
  t.after(() => cleanupEvalHome({ dshHome: home.dshHome, agentsHome: home.agentsHome }))
})

test('a blank DSH_HOME falls back to the default home', () => {
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = '   '
  try {
    assert.match(dshHome(), /\.dsh$/u)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
})

test('cleans marked worker homes', (t) => {
  const home = workspace(t)
  credentials(home)
  const plugin = pluginCheckout(t)
  for (let index = 0; index < 2; index += 1) {
    createEvalHome({
      root: join(home.root, `.dsh-home-worker-${index}`),
      agentsRoot: join(home.root, `.agents-home-worker-${index}`),
      sourceHome: home.source,
      repoRoot: plugin,
    })
  }

  const removed = cleanupStaleHomes({ root: home.root })

  assert.equal(removed.length, 4)
  assert.equal(existsSync(join(home.root, '.dsh-home-worker-0')), false)
  assert.equal(existsSync(join(home.root, '.agents-home-worker-1')), false)
  assert.equal(existsSync(home.source), true)
})

test('requires a resolved plugin root', (t) => {
  const home = workspace(t)
  credentials(home)

  assert.throws(
    () =>
      createEvalHome({
        root: home.dshHome,
        agentsRoot: home.agentsHome,
        sourceHome: home.source,
      }),
    /createEvalHome requires a resolved plugin root/u,
  )
})
