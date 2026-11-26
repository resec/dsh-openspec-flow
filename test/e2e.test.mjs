import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../index.js'
import { clearCache } from '../lib/cache.js'
import { resolveBundledCli } from '../lib/openspec.js'
import { createFakeContext } from './fake-context.mjs'

const CLI = resolveBundledCli()
const created = []
const CHANGE = 'add-theme'

const PROPOSAL = [
  '# Add theme',
  '',
  '## Why',
  '',
  'Users need a theme.',
  '',
  '## What Changes',
  '',
  '- Add a theme toggle.',
  '',
  '## Capabilities',
  '',
  '### New Capabilities',
  '',
  '- `theme`: theme selection.',
  '',
].join('\n')

const SPEC = [
  '# Theme',
  '',
  '## Purpose',
  '',
  'Lets users choose a theme for the app.',
  '',
  '## ADDED Requirements',
  '',
  '### Requirement: Theme selection',
  'The app SHALL let users choose a theme.',
  '',
  '#### Scenario: Toggle',
  '- **WHEN** the user toggles the theme',
  '- **THEN** the theme changes',
  '',
].join('\n')

const DESIGN = [
  '# Design',
  '',
  '## Context',
  '',
  'The app has one theme today.',
  '',
  '## Decisions',
  '',
  '- Store the choice in local storage.',
  '',
].join('\n')

const TASKS = [
  '## 1. Theme',
  '',
  '- [ ] 1.1 Add the toggle',
  '- [ ] 1.2 Persist the choice',
  '',
].join('\n')

function project() {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-e2e-'))
  created.push(root)
  return root
}

function setup(root) {
  clearCache()
  mkdirSync(join(root, 'openspec'), { recursive: true })
  writeFileSync(join(root, 'openspec', 'reviews.json'), JSON.stringify({
    profiles: {
      'e2e-directory': { object: 'directory', enabled: false, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
      'e2e-tree': { object: 'tree', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
    },
    reviews: { draft: 'e2e-directory', apply: 'e2e-tree' },
  }, null, 2))
  const fake = createFakeContext({ cwd: root, spawnMode: 'process' })
  apply(fake.ctx, { timeoutMs: 30_000 })
  return fake
}

async function call(fake, name, args) {
  const tool = fake.tools.get(name)
  assert.ok(tool, `tool ${name} is registered`)
  return await tool.execute(args, {
    agent: { id: 'e2e-test' },
    signal: new AbortController().signal,
  })
}

function writeArtifacts(changeDir) {
  writeFileSync(join(changeDir, 'proposal.md'), PROPOSAL)
  mkdirSync(join(changeDir, 'specs', 'theme'), { recursive: true })
  writeFileSync(join(changeDir, 'specs', 'theme', 'spec.md'), SPEC)
  writeFileSync(join(changeDir, 'design.md'), DESIGN)
  writeFileSync(join(changeDir, 'tasks.md'), TASKS)
}

function runCli(cwd, args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result
}

function archiveDir(root) {
  const base = join(root, 'openspec', 'changes', 'archive')
  const entries = readdirSync(base).filter((name) => name.endsWith(CHANGE))
  assert.equal(entries.length, 1)
  return join(base, entries[0])
}

test.after(() => {
  for (const root of created) rmSync(root, { recursive: true, force: true })
})

test('runs init, plan, apply and archive through tools, matching a CLI run', async () => {
  const toolRoot = project()
  const fake = setup(toolRoot)

  const init = await call(fake, 'openspec_init', {})
  assert.equal(init.config, 'created')
  assert.equal(existsSync(join(toolRoot, '.dsh', 'skills')), false)

  const change = await call(fake, 'openspec_new_change', { name: CHANGE })
  assert.equal(change.change.id, CHANGE)
  writeArtifacts(join(toolRoot, change.change.path))

  const validation = await call(fake, 'openspec_inspect', { action: 'validate', change: CHANGE })
  assert.equal(validation.valid, true, JSON.stringify(validation.issues))

  let step = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(step.state, 'ready')
  assert.equal(step.next.id, '1.1')
  while (step.next !== undefined) {
    step = await call(fake, 'openspec_mark_task_done', { change: CHANGE, taskIds: [step.next.id] })
  }
  assert.equal(step.state, 'all_done')

  const archived = await call(fake, 'openspec_archive', { change: CHANGE })
  assert.equal(archived.valid, true)
  assert.equal(archived.archived, true)
  assert.equal(archived.specsUpdated, true)

  const toolSpec = readFileSync(join(toolRoot, 'openspec', 'specs', 'theme', 'spec.md'), 'utf8')
  const toolTasks = readFileSync(join(toolRoot, archived.path, 'tasks.md'), 'utf8')
  assert.match(toolTasks, /- \[x\] 1\.1/)
  assert.match(toolTasks, /- \[x\] 1\.2/)

  // Same input through the CLI, so the merge result can be compared byte for byte.
  const cliRoot = project()
  runCli(cliRoot, ['init', '--tools', 'none', '--no-animation'])
  runCli(cliRoot, ['new', 'change', CHANGE, '--json'])
  writeArtifacts(join(cliRoot, 'openspec', 'changes', CHANGE))
  writeFileSync(
    join(cliRoot, 'openspec', 'changes', CHANGE, 'tasks.md'),
    TASKS.replace('- [ ] ', '- [x] ').replace('- [ ] ', '- [x] '),
  )
  runCli(cliRoot, ['validate', CHANGE, '--json'])
  runCli(cliRoot, ['archive', CHANGE, '--yes', '--json'])

  const cliSpec = readFileSync(join(cliRoot, 'openspec', 'specs', 'theme', 'spec.md'), 'utf8')
  const cliTasks = readFileSync(join(archiveDir(cliRoot), 'tasks.md'), 'utf8')
  assert.equal(toolSpec, cliSpec)
  assert.equal(toolTasks, cliTasks)
  assert.ok(existsSync(join(toolRoot, 'openspec', 'specs', 'theme', 'spec.md')))
})
