/**
 * Shared fixtures for the split review test files.
 *
 * Nothing here is a test: the module has no `.test.mjs` suffix, so the runner
 * never schedules it. Every split file imports what it needs and registers
 * `test.after(cleanupFixtures)`.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply } from '../index.js'
import { clearCache } from '../lib/cache.js'
import { reviewDirectory } from '../lib/review/store.js'
import { clearRoundWatches } from '../lib/review/watch.js'
import { createFakeContext } from './fake-context.mjs'
import { initFixtureRepo } from './git-fixture.mjs'

export const PROBE_ROOT = fileURLToPath(new URL('./fixtures/probe/openspec', import.meta.url))
export const CHANGE = 'add-dark-mode'
export const DRAFT_OPENING = 'You are reviewing a change before implementation starts. Review this planning material adversarially. Do not assume the proposal is correct. Read the artifacts yourself; the hashes below bind the version you are reviewing.'
const CREATED = []

export function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-review-'))
  cpSync(PROBE_ROOT, join(root, 'openspec'), { recursive: true })
  CREATED.push(root)
  return root
}

export function setup(root, reviews, options = {}) {
  clearCache()
  const fake = createFakeContext({ cwd: root })
  const settings = {
    reviews: reviews ?? { draft: { enabled: true }, apply: { enabled: true } },
    worktree: options.worktree ?? { enabled: false },
  }
  apply(fake.ctx, {
    timeoutMs: 30_000,
    ...settings,
  })
  fake.settings = settings
  return fake
}

export async function call(fake, name, args) {
  const tool = fake.tools.get(name)
  assert.ok(tool, `tool ${name} is registered`)
  return await tool.execute(args, {
    agent: { id: 'review-test' },
    signal: new AbortController().signal,
  })
}

export function reviewDir(root) {
  return reviewDirectory(root, null, CHANGE)
}

export function writePolicy(root, change, reviews) {
  const directory = reviewDirectory(root, null, change)
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    join(directory, 'policy.json'),
    `${JSON.stringify({ schemaVersion: 1, change, store: null, reviews }, null, 2)}\n`,
  )
}

export function report(extra = {}) {
  return {
    verdict: 'pass',
    summary: 'The planning artifacts are coherent.',
    findings: [],
    verifications: [],
    outOfScope: [],
    residualRisks: [],
    ...extra,
  }
}

export function majorFinding() {
  return {
    id: 'R1-01',
    severity: 'major',
    axis: 'coherence',
    location: 'proposal.md',
    title: 'Task misses the new capability',
    problem: 'The proposal adds a capability that tasks do not implement.',
    evidence: 'proposal.md adds capability theme; tasks.md has no matching task.',
    impact: 'The implementation would ship without the requested behavior.',
    rule: 'proposal.md Capabilities and tasks.md coverage',
    failure: 'An agent follows tasks.md and never adds the capability.',
    suggestion: 'Add a task that implements the capability.',
  }
}

export function minorFinding(extra = {}) {
  return {
    id: 'R1-02',
    severity: 'minor',
    axis: 'coherence',
    location: 'design.md',
    title: 'A minor wording issue',
    problem: 'A sentence in the design is unclear.',
    evidence: 'design.md leaves the reader guessing what changed.',
    suggestion: 'Rewrite the sentence.',
    ...extra,
  }
}

export function gitFixture() {
  const root = fixture()
  const run = (args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  initFixtureRepo(root)
  run(['config', 'user.email', 'test@example.com'])
  run(['config', 'user.name', 'Test'])
  run(['add', 'openspec'])
  // The change directory stays uncommitted so `passDraft` can seal it alone.
  run(['rm', '-r', '--cached', '--quiet', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'fixture'])
  return { root, run }
}

export async function passDraft(fake, root, run) {
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  if (run !== undefined && fake?.settings?.worktree?.enabled !== true) {
    const ignore = join(root, 'openspec', '.gitignore')
    if (existsSync(ignore) && run(['status', '--porcelain', '--', 'openspec/.gitignore']) !== '') {
      run(['add', 'openspec/.gitignore'])
    }
    run(['add', `openspec/changes/${CHANGE}`])
    run(['commit', '-m', 'seal the draft'])
  }
  await call(fake, 'openspec_apply_next', { change: CHANGE })
}

/** Pass the draft and start apply in a git worktree apply without a seal commit. */
export async function passDraftConstructing(fake, root) {
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  await call(fake, 'openspec_apply_next', { change: CHANGE })
}

export function captureSpawn(fake) {
  const argv = []
  const original = fake.ctx.subprocess.spawn
  fake.ctx.subprocess.spawn = (spec) => {
    argv.push(spec.argv)
    return original(spec)
  }
  return argv
}

export function externalSetup(root, reviews = { draft: { enabled: true, reviewers: 1 }, apply: { enabled: true, reviewers: 1 } }, options = {}) {
  const { seedAgents = [], deliverSteer = false } = options
  const activations = []
  const messages = []
  const steered = []
  let fake
  const subagents = {
    getProvider() {
      return { capabilities: { agentPreset: true, agentOptions: true } }
    },
    async startActivation(spec) {
      activations.push(spec)
      return { childId: `reviewer-${activations.length}` }
    },
    async sendMessage(sender, target, content) {
      messages.push({ sender, target, content })
      if (!deliverSteer) return
      const agent = fake?.ctx.agents.get(target)
      if (agent === undefined) return
      const message = { id: `steer-${messages.length}`, content, source: { kind: 'reviewer' } }
      agent.steer?.(message)
      steered.push({ target, message })
    },
  }
  clearCache()
  fake = createFakeContext({ cwd: root, subagents, agents: seedAgents })
  const disposers = []
  const originalEffect = fake.ctx.effect
  fake.ctx.effect = (fn) => {
    const result = fn()
    if (typeof result === 'function') disposers.push(result)
    return result
  }
  apply(fake.ctx, { timeoutMs: 30_000, reviews })
  fake.settings = { reviews, worktree: { enabled: true } }
  return { fake, activations, messages, steered, subagents, disposers }
}

export function reviewerPresetDeclaration() {
  const lines = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8').split('\n')
  const start = lines.findIndex((line) => line.trim() === '- id: preset-openspec-reviewer')
  assert.ok(start >= 0, 'the reviewer preset row exists')
  const plugins = []
  let current
  for (const line of lines.slice(start + 1)) {
    if (/^ {4}- id: /.test(line)) break
    const child = /^ {10}- id: (\S+)$/.exec(line)
    if (child !== null) {
      current = { id: child[1], config: '' }
      plugins.push(current)
      continue
    }
    if (current !== undefined) current.config += `${line}\n`
  }
  return plugins
}

export function reviewerPresetToolNames(plugins) {
  const names = new Set()
  for (const plugin of plugins) {
    if (plugin.id === 'tool-fs') {
      if (/\bread:\s*true/.test(plugin.config)) names.add('read')
      if (/\breadImage:\s*true/.test(plugin.config)) names.add('read_image')
      if (/\bwrite:\s*true/.test(plugin.config)) names.add('write')
      if (/\bedit:\s*true/.test(plugin.config)) names.add('edit')
      if (/\bapplyPatch:\s*true/.test(plugin.config)) names.add('apply_patch')
    } else if (plugin.id === 'tool-fs-search') {
      names.add('grep')
      names.add('glob')
    } else if (plugin.id === 'tool-web') {
      if (/\bsearch:\s*true/.test(plugin.config)) names.add('web_search')
      if (/\bfetch:\s*true/.test(plugin.config)) names.add('web_fetch')
    } else if (plugin.id === 'reviewer') {
      names.add('openspec_reviewer')
    }
  }
  return names
}

/**
 * Assert that no fixture root picked up a compile-cache directory, then delete
 * every recorded root. The assertion runs before the removal so a leaked
 * `.cache/` stays inspectable when it fails.
 */
export function cleanupFixtures() {
  clearRoundWatches()
  const leaked = CREATED.filter((root) => {
    const cache = join(root, '.cache')
    if (!existsSync(cache)) return false
    if (!statSync(cache).isDirectory()) return true
    return readdirSync(cache).some((name) => name !== 'openspec-flow')
  })
  assert.deepEqual(
    leaked.map((root) => join(root, '.cache')),
    [],
    'no fixture root may carry a .cache directory',
  )
  for (const root of CREATED) rmSync(root, { recursive: true, force: true })
  CREATED.length = 0
}
