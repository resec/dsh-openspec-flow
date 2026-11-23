import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  POLICY_SECTION,
  POLICY_TEXT,
  isOpenSpecProject,
  registerPolicy,
} from '../lib/policy.js'
import { createFakeContext } from './fake-context.mjs'

/**
 * Create one isolated project, one plain directory, and their temporary root.
 * @returns paths plus a disposer.
 */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-openspec-policy-'))
  const project = join(root, 'project')
  const plain = join(root, 'plain')
  mkdirSync(project)
  mkdirSync(join(project, 'openspec'))
  mkdirSync(plain)
  return {
    project,
    plain,
    dispose() {
      rmSync(root, { recursive: true, force: true })
    },
  }
}

test('detects an OpenSpec root and rejects other directories', (t) => {
  const f = fixture()
  t.after(() => f.dispose())
  assert.equal(isOpenSpecProject(f.project), true)
  assert.equal(isOpenSpecProject(f.plain), false)
  assert.equal(isOpenSpecProject(undefined), false)
  assert.equal(isOpenSpecProject(''), false)
})

test('the policy text states the stage gates', () => {
  assert.match(POLICY_TEXT, /openspec_apply_next/)
  assert.match(POLICY_TEXT, /openspec_mark_task_done/)
  assert.match(POLICY_TEXT, /action: "validate"/)
  assert.match(POLICY_TEXT, /openspec_new_change/)
  assert.match(POLICY_TEXT, /openspec_review/)
  assert.match(POLICY_TEXT, /self-report/)
  assert.match(POLICY_TEXT, /draft object is the change artifacts/)
  assert.match(POLICY_TEXT, /action: "instructions"/)
  assert.match(POLICY_TEXT, /openspec_archive/)
  assert.match(POLICY_TEXT, /openspec_init/)
  assert.match(POLICY_TEXT, /\/opsx-admin/)
  assert.match(POLICY_TEXT, /openspec_store_list/)
  assert.match(POLICY_TEXT, /openspec_schemas/)
  assert.match(POLICY_TEXT, /explicit confirmation/)
  assert.match(POLICY_TEXT, /Archive only when the user explicitly asks/)
  assert.match(POLICY_TEXT, /fast-forwards main, archives and commits in one lifecycle section/)
  assert.doesNotMatch(POLICY_TEXT, /which merges and archives in one lifecycle section/)
  assert.match(POLICY_TEXT, /Main specs are updated only by/)
  assert.match(POLICY_TEXT, /no sync-only flow/)
  assert.match(POLICY_TEXT, /seals the draft on the change's apply branch/)
  assert.match(POLICY_TEXT, /keeps it off main/)
  assert.match(POLICY_TEXT, /refuses genuine dirt/)
  assert.match(POLICY_TEXT, /worktree disabled, commit the change directory/)
  assert.match(POLICY_TEXT, /resumed until apply starts; after that it is frozen/)
  assert.match(POLICY_TEXT, /scope: "plan-change"/)
  assert.match(POLICY_TEXT, /openspec-sync-specs/)
  assert.match(POLICY_TEXT, /end the turn when it returns `waiting`/)
  assert.match(POLICY_TEXT, /deadline wakeup resumes you/)
  assert.match(POLICY_TEXT, /reported by the plugin card/)
  assert.match(POLICY_TEXT, /do not restate findings, evidence, impact, rules, failure paths, suggestions, residual risks, scope or notes/)
  assert.match(POLICY_TEXT, /one short note only for information the report cannot express/)
})

test('the policy text names no CLI', () => {
  assert.doesNotMatch(POLICY_TEXT, /\bCLI\b/i)
  assert.doesNotMatch(POLICY_TEXT.replaceAll('/opsx-admin', ''), /\bopsx\b/i)
  assert.doesNotMatch(POLICY_TEXT, /`openspec`/)
})

test('an OpenSpec-project agent receives one scoped rule', (t) => {
  const f = fixture()
  t.after(() => f.dispose())
  const fake = createFakeContext({ cwd: f.plain })
  registerPolicy(fake.ctx)
  const { agent, sections } = fake.createAgent({ directory: f.project })
  fake.emit('agent/created', { agent })

  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, POLICY_SECTION)
  assert.equal(sections[0].text(), POLICY_TEXT)
  assert.equal(fake.globalSections.length, 0)
})

test('an agent outside OpenSpec contributes no text', (t) => {
  const f = fixture()
  t.after(() => f.dispose())
  const fake = createFakeContext({ cwd: f.plain })
  registerPolicy(fake.ctx)
  const { agent, sections } = fake.createAgent({ directory: f.plain })
  fake.emit('agent/created', { agent })

  assert.equal(sections.length, 1)
  assert.equal(sections[0].text(), '')
})

test('the rule follows a working-directory change', (t) => {
  const f = fixture()
  t.after(() => f.dispose())
  const fake = createFakeContext({ cwd: f.plain })
  registerPolicy(fake.ctx)
  const { agent, sections } = fake.createAgent({ directory: f.project })
  fake.emit('agent/created', { agent })

  assert.equal(sections[0].text(), POLICY_TEXT)
  fake.setCwd(agent.id, f.plain)
  assert.equal(sections[0].text(), '')
  fake.setCwd(agent.id, f.project)
  assert.equal(sections[0].text(), POLICY_TEXT)
})

test('a load-time sweep attaches to an already-live agent', (t) => {
  const f = fixture()
  t.after(() => f.dispose())
  const fake = createFakeContext({ cwd: f.plain })
  const { sections } = fake.createAgent({ directory: f.project })

  registerPolicy(fake.ctx)

  assert.equal(sections.length, 1)
  assert.equal(sections[0].text(), POLICY_TEXT)
})

test('both attachment paths register one section', (t) => {
  const f = fixture()
  t.after(() => f.dispose())
  const fake = createFakeContext({ cwd: f.plain })
  const { agent, sections } = fake.createAgent({ directory: f.project })

  registerPolicy(fake.ctx)
  fake.emit('agent/created', { agent })

  assert.equal(sections.length, 1)
})

test('the policy text states the apply review gate', () => {
  assert.match(POLICY_TEXT, /review: "apply"/)
  assert.match(POLICY_TEXT, /committed git tree/)
  assert.match(POLICY_TEXT, /no apply review/)
  assert.match(POLICY_TEXT, /does not hold archive/)
  for (const phrase of [
    "Another change's uncommitted planning files do not count as a dirty tree.",
    'worktree git directory or `openspec/.review/`',
    'a store change also locks its store domain',
    'a lock whose change or implementation root is gone is stale',
    'A store change applied from another project is refused until the first project archives.',
  ]) {
    assert.ok(POLICY_TEXT.includes(phrase), `the policy text states: ${phrase}`)
  }
})

test('the flow rule states the no-edit rule and the blocked recovery', () => {
  assert.match(POLICY_TEXT, /Do not edit the change artifacts while a draft round is open/)
  assert.match(POLICY_TEXT, /closes the round as blocked/)
  assert.match(POLICY_TEXT, /`resume` then opens the next round and wakes the reviewer/)
})
