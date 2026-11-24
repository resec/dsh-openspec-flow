import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { applyLockLocation } from '../lib/review/apply-lock.js'
import { reviewDirectory } from '../lib/review/store.js'
import {
  CHANGE, PROBE_ROOT, call, cleanupFixtures, externalSetup, fixture, gitFixture, passDraft, report, setup, writePolicy,
} from './review-fixtures.mjs'

test.after(cleanupFixtures)

const SECOND = 'second-change'

/**
 * Build a registered git-backed store with the probe change committed, plus the
 * user data directory that holds its registry. The store is resolved through
 * `--store team`, so the review record and the store lock live in its git dir.
 * @returns the store root, its git runner and the user data directory.
 */
function storeFixture() {
  const home = mkdtempSync(join(tmpdir(), 'openspec-flow-store-home-'))
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-store-'))
  cpSync(PROBE_ROOT, join(root, 'openspec'), { recursive: true })
  mkdirSync(join(root, '.openspec-store'), { recursive: true })
  writeFileSync(join(root, '.openspec-store', 'store.yaml'), 'version: 1\nid: team\n')
  mkdirSync(join(home, 'openspec', 'stores'), { recursive: true })
  writeFileSync(
    join(home, 'openspec', 'stores', 'registry.yaml'),
    `version: 1\nstores:\n  team:\n    backend:\n      type: git\n      local_path: ${realpathSync(root)}\n`,
  )
  const run = (args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  run(['init'])
  run(['config', 'user.email', 'test@example.com'])
  run(['config', 'user.name', 'Test'])
  run(['add', '-A'])
  run(['commit', '-m', 'store root'])
  run(['commit', '--allow-empty', '-m', 'base bump'])
  return { home, root, run }
}

/** Run one test body with the store registry redirected to a temporary home. */
async function withStoreHome(home, body) {
  const previous = process.env.XDG_DATA_HOME
  process.env.XDG_DATA_HOME = home
  try {
    return await body()
  } finally {
    if (previous === undefined) delete process.env.XDG_DATA_HOME
    else process.env.XDG_DATA_HOME = previous
  }
}

/** The lock file a git domain keeps, never visible in `git status`. */
function gitLockPath(root, run) {
  return join(root, run(['rev-parse', '--git-dir']), 'openspec-flow', 'apply.lock.json')
}

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
  run(['init'])
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
  run(['init'])
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

test('a store change takes the store lock through the apply entry', async () => {
  const store = storeFixture()
  const first = gitFixture()
  const second = gitFixture()
  try {
    await withStoreHome(store.home, async () => {
      const settings = { draft: { enabled: false }, apply: { enabled: true, reviewers: 0 } }
      const fake = setup(first.root, settings)
      const base = store.run(['rev-parse', 'HEAD~1'])
      const started = await call(fake, 'openspec_review', {
        action: 'start', change: CHANGE, review: 'apply', store: 'team', base,
      })
      assert.equal(started.state, 'in-review')
      assert.equal(started.mode, 'self')

      // The implementation lock stays in the project's git dir; the store lock
      // stays in the store's git dir and records the implementation root.
      const implementationLock = gitLockPath(first.root, first.run)
      const storeLock = gitLockPath(store.root, store.run)
      assert.equal(implementationLock, join(first.root, '.git', 'openspec-flow', 'apply.lock.json'))
      assert.equal(storeLock, join(store.root, '.git', 'openspec-flow', 'apply.lock.json'))
      assert.equal(existsSync(implementationLock), true)
      assert.equal(existsSync(storeLock), true)
      const record = JSON.parse(readFileSync(storeLock, 'utf8'))
      assert.equal(record.change, CHANGE)
      assert.equal(record.store, 'team')
      assert.equal(realpathSync(record.implementationRoot), realpathSync(first.root))

      // A second project is refused by the store lock and releases only the
      // implementation lock it created itself.
      const otherFake = setup(second.root, settings)
      await assert.rejects(
        () => call(otherFake, 'openspec_apply_next', { change: CHANGE, store: 'team' }),
        /team#add-dark-mode/,
      )
      assert.equal(existsSync(gitLockPath(second.root, second.run)), false)
      assert.equal(existsSync(implementationLock), true)
      assert.equal(existsSync(storeLock), true)

      // The second project cannot archive the store change either.
      await assert.rejects(
        () => call(otherFake, 'openspec_archive', { change: CHANGE, store: 'team' }),
        /team#add-dark-mode/,
      )
      assert.equal(existsSync(join(store.root, 'openspec', 'changes', CHANGE)), true)
      assert.equal(existsSync(join(store.root, 'openspec', 'changes', 'archive', CHANGE)), false)

      // The owning project archives the change and releases its own locks.
      await call(fake, 'openspec_review', {
        action: 'self-report', change: CHANGE, review: 'apply', store: 'team', report: report(),
      })
      const archived = await call(fake, 'openspec_archive', { change: CHANGE, store: 'team' })
      assert.equal(archived.archived, true)
      assert.equal(existsSync(implementationLock), false)
      assert.equal(existsSync(storeLock), false)
    })
  } finally {
    rmSync(first.root, { recursive: true, force: true })
    rmSync(second.root, { recursive: true, force: true })
    rmSync(store.root, { recursive: true, force: true })
    rmSync(store.home, { recursive: true, force: true })
  }
})
