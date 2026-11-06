import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  assertAcceptanceHidden,
  assertNoTargetChange,
  ensureOfficialSkills,
  findChange,
  fixtureTestTargets,
  injectAcceptance,
  installedSkills,
  prepareFixture,
} from '../lib/fixtures.mjs'
import { fixtureById } from '../lib/registry.mjs'

function root(t) {
  const directory = mkdtempSync(join(tmpdir(), 'eval-fixtures-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

function officialSkills(directory) {
  const target = join(directory, 'official-skills')
  mkdirSync(target, { recursive: true })
  for (const name of [
    'openspec-explore',
    'openspec-propose',
    'openspec-apply-change',
    'openspec-archive-change',
    'openspec-sync-specs',
    'openspec-update-change',
  ]) {
    mkdirSync(join(target, name), { recursive: true })
    writeFileSync(join(target, name, 'SKILL.md'), `---\nname: ${name}\ndescription: official\n---\n`)
  }
  return target
}

test('prepares the synthetic fixture for the official arm', (t) => {
  const directory = root(t)
  const destination = join(directory, 'run', 'fixture')
  mkdirSync(join(directory, 'run'), { recursive: true })

  const info = prepareFixture({
    fixture: fixtureById('budget-cli'),
    arm: 'official',
    destination,
    officialSkillsDir: officialSkills(directory),
  })

  assert.equal(info.commit.length, 40)
  assert.deepEqual(installedSkills(destination), [
    'openspec-apply-change',
    'openspec-archive-change',
    'openspec-explore',
    'openspec-propose',
    'openspec-sync-specs',
    'openspec-update-change',
  ])
  assert.match(readFileSync(join(destination, 'src/cli.js'), 'utf8'), /renderSummary/u)
  assert.equal(existsSync(join(destination, 'test/monthly.test.mjs')), false)
  assertAcceptanceHidden(fixtureById('budget-cli'), destination)

  const tracked = spawnSync('git', ['ls-files'], { cwd: destination, encoding: 'utf8' }).stdout
  assert.doesNotMatch(tracked, /node_modules/u)

  const injected = injectAcceptance(fixtureById('budget-cli'), destination)
  assert.equal(injected.length, 1)
  assert.equal(existsSync(injected[0]), true)
})

test('prepares the synthetic fixture for the plugin arm', (t) => {
  const directory = root(t)
  const destination = join(directory, 'run', 'fixture')
  mkdirSync(join(directory, 'run'), { recursive: true })

  prepareFixture({
    fixture: fixtureById('budget-cli'),
    arm: 'plugin',
    destination,
  })

  const skill = readFileSync(join(destination, '.dsh/skills/openspec-apply-change/SKILL.md'), 'utf8')
  assert.match(skill, /generatedBy: dsh-openspec-flow@/u)
  assert.equal(existsSync(join(destination, '.dsh/openspec-flow-backup')), false)
})

test('rejects a fixture that already contains the target change', (t) => {
  const directory = root(t)
  const destination = join(directory, 'fixture')
  mkdirSync(join(destination, 'openspec/changes/add-budget-report'), { recursive: true })

  assert.throws(
    () => assertNoTargetChange(destination, 'add-budget-report'),
    /leaks the target change/u,
  )
})

test('finds the change the run created', (t) => {
  const directory = root(t)
  const destination = join(directory, 'fixture')
  mkdirSync(join(destination, 'openspec/changes/add-budget-report'), { recursive: true })
  mkdirSync(join(destination, 'openspec/changes/archive'), { recursive: true })

  assert.equal(findChange(destination, 'add-budget-report'), 'add-budget-report')
  assert.equal(findChange(destination, 'other-name'), 'add-budget-report')
  assert.equal(findChange(join(directory, 'empty'), 'add-budget-report'), null)
})

test('prepares the policy fixture without the solution or acceptance', (t) => {
  const directory = root(t)
  const destination = join(directory, 'run', 'fixture')
  mkdirSync(join(directory, 'run'), { recursive: true })

  prepareFixture({
    fixture: fixtureById('policy-rule'),
    arm: 'plugin',
    destination,
  })

  assert.equal(existsSync(join(destination, 'lib/policy.js')), false)
  assert.equal(existsSync(join(destination, 'test/policy-acceptance.test.mjs')), false)
  assert.equal(existsSync(join(destination, 'openspec/changes/add-scoped-flow-policy')), false)
  assert.equal(existsSync(join(destination, 'openspec/config.yaml')), true)
  const skill = readFileSync(join(destination, '.dsh/skills/openspec-apply-change/SKILL.md'), 'utf8')
  assert.match(skill, /generatedBy: dsh-openspec-flow@/u)
})

test('prepares the skill fixture with the pre-change command maps', (t) => {
  const directory = root(t)
  const destination = join(directory, 'run', 'fixture')
  mkdirSync(join(directory, 'run'), { recursive: true })

  prepareFixture({
    fixture: fixtureById('skill-command-maps'),
    arm: 'plugin',
    destination,
    officialSkillsDir: officialSkills(directory),
  })

  const packaged = readFileSync(join(destination, 'skills/openspec-apply-change/SKILL.md'), 'utf8')
  assert.match(packaged, /^## Command map/mu)
  const installed = readFileSync(join(destination, '.dsh/skills/openspec-apply-change/SKILL.md'), 'utf8')
  assert.match(installed, /^## Command map/mu)
  assert.equal(existsSync(join(destination, 'test/skills-acceptance.test.mjs')), false)
  assert.equal(existsSync(join(destination, 'openspec/changes/remove-skill-command-maps')), false)
  assert.equal(existsSync(join(destination, 'openspec/changes/complete-openspec-toolset')), false)
  assert.equal(existsSync(join(destination, 'openspec/changes/archive/2026-01-01-complete-openspec-toolset')), true)
  assert.equal(existsSync(join(destination, '..', '.probe', 'proj', 'openspec', 'config.yaml')), true)
  assert.equal(existsSync(join(destination, 'node_modules', '@fission-ai', 'openspec', 'package.json')), true)
})

test('uses a cached official-skill directory without invoking the CLI', (t) => {
  const directory = root(t)
  const cache = join(directory, 'cache')
  mkdirSync(join(cache, 'openspec-apply-change'), { recursive: true })
  writeFileSync(join(cache, 'openspec-apply-change/SKILL.md'), 'cached\n')

  const result = ensureOfficialSkills({ cacheDir: cache, openspecBin: '/does/not/exist' })
  assert.equal(result, cache)
})


test('rejects a fixture with no test files', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eval-fixture-targets-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'test'), { recursive: true })
  assert.throws(() => fixtureTestTargets(root), /no test files/)
  writeFileSync(join(root, 'test', 'a.test.mjs'), '')
  assert.deepEqual(fixtureTestTargets(root), ['test/a.test.mjs'])
})

test('uses the supplied plugin root for the fixture git archive', (t) => {
  const directory = root(t)
  const destination = join(directory, 'run', 'fixture')
  mkdirSync(join(directory, 'run'), { recursive: true })
  const plugin = join(directory, 'plugin')
  mkdirSync(plugin, { recursive: true })
  writeFileSync(
    join(plugin, 'package.json'),
    `${JSON.stringify({ name: 'dsh-openspec-flow', version: '0.1.0' })}\n`,
  )
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Eval Fixture',
    GIT_AUTHOR_EMAIL: 'eval@example.invalid',
    GIT_COMMITTER_NAME: 'Eval Fixture',
    GIT_COMMITTER_EMAIL: 'eval@example.invalid',
  }
  for (const args of [
    ['init', '-b', 'main'],
    ['add', '-A'],
    ['-c', 'user.name=Eval', '-c', 'user.email=eval@example.invalid', 'commit', '-m', 'base'],
  ]) {
    const result = spawnSync('git', args, { cwd: plugin, encoding: 'utf8', env })
    assert.equal(result.status, 0, result.stderr)
  }

  assert.throws(
    () =>
      prepareFixture({
        fixture: fixtureById('policy-rule'),
        arm: 'plugin',
        destination,
        pluginRoot: plugin,
      }),
    /fixture base commit .* is not reachable/u,
  )
})

test('generates official skills with an injected CLI', (t) => {
  const directory = root(t)
  const cache = join(directory, 'cache')
  const fake = join(directory, 'fake-openspec.sh')
  writeFileSync(
    fake,
    '#!/bin/sh\nmkdir -p "$PWD/.dsh/skills/openspec-apply-change"\nprintf "%s\\n" ok > "$PWD/.dsh/skills/openspec-apply-change/SKILL.md"\n',
    { mode: 0o755 },
  )

  const result = ensureOfficialSkills({ cacheDir: cache, openspecBin: fake })

  assert.equal(result, cache)
  assert.equal(existsSync(join(cache, 'openspec-apply-change', 'SKILL.md')), true)
})

test('generates official skills with the harness CLI', (t) => {
  const cache = join(root(t), 'official')

  ensureOfficialSkills({ cacheDir: cache })

  assert.equal(existsSync(join(cache, 'openspec-apply-change', 'SKILL.md')), true)
})
