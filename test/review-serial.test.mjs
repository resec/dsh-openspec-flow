import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { applyLockLocation } from '../lib/review/apply-lock.js'
import { reviewDirectory } from '../lib/review/store.js'
import {
  CHANGE, call, cleanupFixtures, externalSetup, fixture, gitFixture, passDraft, report, setup, writePolicy,
} from './review-fixtures.mjs'
import { initFixtureRepo } from './git-fixture.mjs'

test.after(cleanupFixtures)

const SECOND = 'second-change'

function copySecond(root) {
  cpSync(
    join(root, 'openspec', 'changes', CHANGE),
    join(root, 'openspec', 'changes', SECOND),
    { recursive: true },
  )
}

test('two changes run their draft reviews side by side', async () => {
  const root = fixture()
  copySecond(root)
  writePolicy(root, SECOND, {
    draft: { enabled: true, reviewers: 0, maxRounds: 3, waitMinutes: 15 },
    apply: { enabled: false },
  })
  const fake = setup(root)
  const first = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const second = await call(fake, 'openspec_review', {
    action: 'start', change: SECOND, intent: 'A second change in the same project.',
  })
  assert.equal(first.state, 'in-review')
  assert.equal(second.state, 'in-review')
  assert.notEqual(first.objectHash, second.objectHash)

  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  const untouched = await call(fake, 'openspec_review', { action: 'status', change: SECOND })
  assert.equal(untouched.state, 'in-review')
  assert.equal(untouched.ready, false)

  await call(fake, 'openspec_review', {
    action: 'self-report', change: SECOND, report: report(),
  })
  const ready = await call(fake, 'openspec_review', { action: 'status', change: SECOND })
  assert.equal(ready.ready, true)
})

test('a draft-disabled apply takes the lock and refuses a second change', async () => {
  const root = fixture()
  copySecond(root)
  const fake = setup(root, { draft: { enabled: false }, apply: { enabled: false } })
  const first = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(first.change, CHANGE)
  await assert.rejects(
    () => call(fake, 'openspec_apply_next', { change: SECOND }),
    /held by local#add-dark-mode/,
  )
})

test('apply is serial and a successful archive releases the lock', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, { draft: { enabled: true, reviewers: 0 }, apply: { enabled: false } })
  await passDraft(fake, root, run)
  const lock = applyLockLocation(root)
  assert.equal(existsSync(lock.file), true)
  copySecond(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: SECOND, intent: 'The second change stays in draft.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: SECOND, report: report(),
  })
  await assert.rejects(
    () => call(fake, 'openspec_apply_next', { change: SECOND }),
    /held by local#add-dark-mode/,
  )
  await assert.rejects(
    () => call(fake, 'openspec_archive', { change: SECOND }),
    /held by local#add-dark-mode/,
  )
  const archived = await call(fake, 'openspec_archive', { change: CHANGE })
  assert.equal(archived.archived, true)
  assert.equal(existsSync(lock.file), false)
})

test('apply review takes the lock and refuses another change', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, {
    draft: { enabled: true, reviewers: 0 },
    apply: { enabled: true, reviewers: 0 },
  })
  await passDraft(fake, root, run)
  copySecond(root)
  writePolicy(root, SECOND, {
    draft: { enabled: true, reviewers: 0, maxRounds: 3, waitMinutes: 15 },
    apply: { enabled: true, reviewers: 0, maxRounds: 3, waitMinutes: 15 },
  })
  run(['add', `openspec/changes/${SECOND}`])
  run(['commit', '-m', 'second change'])
  await call(fake, 'openspec_review', {
    action: 'start', change: SECOND, intent: 'The second change stays in draft.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: SECOND, report: report(),
  })
  const draftFile = join(reviewDirectory(root, undefined, SECOND), 'review.json')
  const draftRecord = JSON.parse(readFileSync(draftFile, 'utf8'))
  draftRecord.applyBaseCommit = run(['rev-parse', 'HEAD~1'])
  writeFileSync(draftFile, `${JSON.stringify(draftRecord, null, 2)}\n`)
  await assert.rejects(
    () => call(fake, 'openspec_review', { action: 'start', change: SECOND, review: 'apply' }),
    /held by local#add-dark-mode/,
  )
})

test('a failed seal releases the lock it acquired', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, { draft: { enabled: true, reviewers: 0 }, apply: { enabled: false } })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  if (existsSync(join(root, 'openspec', '.gitignore'))) run(['add', 'openspec/.gitignore'])
  writeFileSync(join(root, 'src.js'), 'export const x = 1\n')
  run(['add', `openspec/changes/${CHANGE}`, 'src.js'])
  run(['commit', '-m', 'mixed seal'])
  await assert.rejects(
    () => call(fake, 'openspec_apply_next', { change: CHANGE }),
    /seal commit must contain only/,
  )
  assert.equal(existsSync(applyLockLocation(root).file), false)
})

test("a parallel draft's uncommitted artifacts do not block the seal", async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, { draft: { enabled: true, reviewers: 0 }, apply: { enabled: false } })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  copySecond(root)
  if (existsSync(join(root, 'openspec', '.gitignore'))) run(['add', 'openspec/.gitignore'])
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'seal the draft'])
  const applied = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(applied.state, 'all_done')
})

test('a nested OpenSpec root seals with worktree-relative paths', async () => {
  const root = fixture()
  mkdirSync(join(root, 'packages', 'x'), { recursive: true })
  renameSync(join(root, 'openspec'), join(root, 'packages', 'x', 'openspec'))
  const project = join(root, 'packages', 'x')
  const run = (args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  initFixtureRepo(root)
  run(['config', 'user.email', 'test@example.com'])
  run(['config', 'user.name', 'Test'])
  run(['add', 'packages/x/openspec'])
  run(['rm', '-r', '--cached', '--quiet', `packages/x/openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'fixture'])
  const fake = setup(project, { draft: { enabled: true, reviewers: 0 }, apply: { enabled: false } })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  if (existsSync(join(project, 'openspec', '.gitignore'))) run(['add', 'packages/x/openspec/.gitignore'])
  run(['add', `packages/x/openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'seal the nested draft'])
  const applied = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(applied.state, 'all_done')
})


test("a parallel draft's uncommitted artifacts do not block the apply review", async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, {
    draft: { enabled: true, reviewers: 0 },
    apply: { enabled: true, reviewers: 0 },
  })
  await passDraft(fake, root, run)
  copySecond(root)
  const review = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply',
  })
  assert.equal(review.state, 'in-review')
})

test('a failed archive keeps the locks', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, { draft: { enabled: true, reviewers: 0 }, apply: { enabled: false } })
  await passDraft(fake, root, run)
  const lock = applyLockLocation(root)
  assert.equal(existsSync(lock.file), true)
  const tasksFile = join(root, 'openspec', 'changes', CHANGE, 'tasks.md')
  const original = readFileSync(tasksFile, 'utf8')
  writeFileSync(tasksFile, original.replace('- [x] 1.1', '- [ ] 1.1'))
  try {
    await assert.rejects(
      () => call(fake, 'openspec_archive', { change: CHANGE }),
      /incomplete task/,
    )
    assert.equal(existsSync(lock.file), true)
  } finally {
    writeFileSync(tasksFile, original)
  }
})

test('a user-released lock lets another change proceed', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, { draft: { enabled: true, reviewers: 0 }, apply: { enabled: false } })
  await passDraft(fake, root, run)
  copySecond(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: SECOND, intent: 'The second change waits for its turn.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: SECOND, report: report(),
  })
  run(['add', `openspec/changes/${SECOND}`])
  run(['commit', '-m', 'seal the second change'])
  rmSync(applyLockLocation(root).file, { force: true })
  const applied = await call(fake, 'openspec_apply_next', { change: SECOND })
  assert.equal(applied.change, SECOND)
})

test('two changes start independent reviewers side by side', async () => {
  const root = fixture()
  copySecond(root)
  const { fake, activations } = externalSetup(root, {
    draft: { enabled: true, reviewers: 1 },
    apply: { enabled: false },
  })
  const first = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'The first change.',
  })
  const second = await call(fake, 'openspec_review', {
    action: 'start', change: SECOND, intent: 'The second change.',
  })
  assert.equal(first.mode, 'reviewer')
  assert.equal(second.mode, 'reviewer')
  assert.equal(activations.length, 2)
  const firstRecord = JSON.parse(readFileSync(
    join(reviewDirectory(root, undefined, CHANGE), 'review.json'), 'utf8',
  ))
  const secondRecord = JSON.parse(readFileSync(
    join(reviewDirectory(root, undefined, SECOND), 'review.json'), 'utf8',
  ))
  assert.notEqual(firstRecord.reviewers.slots[0].agentId, secondRecord.reviewers.slots[0].agentId)
})

test('a nested-root seal rejects the worktree-root ignore file', async () => {
  const root = fixture()
  mkdirSync(join(root, 'packages', 'x'), { recursive: true })
  renameSync(join(root, 'openspec'), join(root, 'packages', 'x', 'openspec'))
  const project = join(root, 'packages', 'x')
  const run = (args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  initFixtureRepo(root)
  run(['config', 'user.email', 'test@example.com'])
  run(['config', 'user.name', 'Test'])
  run(['add', 'packages/x/openspec'])
  run(['rm', '-r', '--cached', '--quiet', `packages/x/openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'fixture'])
  const fake = setup(project, { draft: { enabled: true, reviewers: 0 }, apply: { enabled: false } })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  mkdirSync(join(root, 'openspec'), { recursive: true })
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  if (existsSync(join(project, 'openspec', '.gitignore'))) run(['add', 'packages/x/openspec/.gitignore'])
  run(['add', `packages/x/openspec/changes/${CHANGE}`, 'openspec/.gitignore'])
  run(['commit', '-m', 'mixed nested seal'])
  await assert.rejects(
    () => call(fake, 'openspec_apply_next', { change: CHANGE }),
    /seal commit must contain only/,
  )
})

test("a seal commit with another change's directory is accepted", async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, { draft: { enabled: true, reviewers: 0 }, apply: { enabled: false } })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  copySecond(root)
  if (existsSync(join(root, 'openspec', '.gitignore'))) run(['add', 'openspec/.gitignore'])
  run(['add', `openspec/changes/${CHANGE}`, `openspec/changes/${SECOND}`])
  run(['commit', '-m', 'seal with another change directory'])
  const applied = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(applied.state, 'all_done')
})

test("archive ignores another change's uncommitted planning files", async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, {
    draft: { enabled: true, reviewers: 0 },
    apply: { enabled: true, reviewers: 0 },
  })
  await passDraft(fake, root, run)
  copySecond(root)
  const review = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply',
  })
  assert.equal(review.state, 'in-review')
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  const archived = await call(fake, 'openspec_archive', { change: CHANGE })
  assert.equal(archived.archived, true)
  assert.equal(existsSync(applyLockLocation(root).file), false)
})
