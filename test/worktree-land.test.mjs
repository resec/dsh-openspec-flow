import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import { CHANGE, cleanupFixtures, gitFixture, passDraft, passDraftConstructing, report, reviewDir, setup, call } from './review-fixtures.mjs'
import { readApplyState, writeApplyState } from '../lib/worktree/state.js'
import { sha256 } from '../lib/review/store.js'
import { manifestPath } from '../lib/worktree/land.js'
import { removeSealRef, sealRefName } from '../lib/worktree/seal.js'

test.after(cleanupFixtures)

async function readyLand({ feature = false } = {}) {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  const state = readApplyState(root, null, CHANGE)
  if (feature) {
    writeFileSync(join(state.worktree, 'feature.txt'), 'feature\n')
    run(['-C', state.worktree, 'add', 'feature.txt'])
    run(['-C', state.worktree, 'commit', '-m', 'feature work'])
  }
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  return { root, run, fake, state }
}

async function withGitRace(root, mode, run) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-land-race-'))
  const realGit = spawnSync('which', ['git'], { encoding: 'utf8' })
  assert.equal(realGit.status, 0, realGit.stderr)
  const wrapper = join(directory, 'git')
  const counter = join(directory, 'count')
  writeFileSync(wrapper, [
    '#!/bin/sh',
    'if [ "$1" = "-C" ] && [ "$2" = "$RACE_ROOT" ]; then',
    '  if [ "$3" = "rev-parse" ] && [ "$4" = "HEAD" ] && [ "$RACE_MODE" = "recheck" ]; then',
    '    count=$(cat "$RACE_COUNTER" 2>/dev/null || echo 0)',
    '    count=$((count + 1))',
    '    printf "%s\\n" "$count" > "$RACE_COUNTER"',
    '    if [ "$count" = "2" ]; then',
    '      "$REAL_GIT" -C "$2" commit --allow-empty -m "seal recheck" >/dev/null 2>&1',
    '    fi',
    '  fi',
    '  if [ "$3" = "merge" ] && [ "$4" = "--ff-only" ] && [ "$RACE_MODE" = "merge" ]; then',
    '    "$REAL_GIT" -C "$2" commit --allow-empty -m "seal merge" >/dev/null 2>&1',
    '  fi',
    'fi',
    'exec "$REAL_GIT" "$@"',
    '',
  ].join('\n'), { mode: 0o755 })
  chmodSync(wrapper, 0o755)
  const saved = {}
  for (const key of ['PATH', 'REAL_GIT', 'RACE_ROOT', 'RACE_MODE', 'RACE_COUNTER']) {
    saved[key] = process.env[key]
  }
  process.env.PATH = `${directory}:${saved.PATH ?? ''}`
  process.env.REAL_GIT = realGit.stdout.trim()
  process.env.RACE_ROOT = root
  process.env.RACE_MODE = mode
  process.env.RACE_COUNTER = counter
  try {
    return await run()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(directory, { recursive: true, force: true })
  }
}

async function prepareLegacyLanding({ archive = false } = {}) {
  const { root, run, fake, state } = await readyLand({ feature: true })
  const featureHead = run(['-C', state.worktree, 'rev-parse', 'HEAD'])
  rmSync(join(root, 'openspec', 'changes', CHANGE), { recursive: true, force: true })
  run(['-C', root, 'merge', '--no-ff', '-m', 'legacy land', state.branch])
  const landCommit = run(['rev-parse', 'HEAD'])
  let archiveCommit
  if (archive) {
    const archiveRoot = join(root, 'openspec', 'changes', 'archive')
    mkdirSync(archiveRoot, { recursive: true })
    run(['mv', `openspec/changes/${CHANGE}`, `openspec/changes/archive/2026-11-20-${CHANGE}`])
    run(['add', '-A', '--', 'openspec/changes'])
    run(['commit', '-m', 'legacy archive'])
    archiveCommit = run(['rev-parse', 'HEAD'])
  }
  const current = readApplyState(root, null, CHANGE)
  writeApplyState(root, null, CHANGE, { ...current, status: 'landing' })
  return { root, run, fake, state, featureHead, landCommit, archiveCommit }
}

test('land fast-forwards, archives, writes the manifest and marks archived', async () => {
  const { root, run, fake, state } = await readyLand()
  const landed = await call(fake, 'openspec_apply_worktree', {
    action: 'land', change: CHANGE, approvedBy: 'user',
  })
  assert.equal(landed.change, CHANGE)
  assert.equal(landed.landCommit, run(['rev-parse', `${landed.archiveCommit}^1`]))
  assert.equal(landed.mergeCommit, landed.landCommit)
  assert.equal(run(['log', '-1', '--format=%P', landed.landCommit]).split(' ').length, 1)
  assert.equal(run(['rev-list', '--merges', `${state.baseCommit}..HEAD`]), '')
  assert.equal(run(['log', '-1', '--format=%s']), `chore(openspec): archive ${CHANGE} via land ${landed.landCommit.slice(0, 8)}`)
  assert.equal(landed.archiveCommit, run(['rev-parse', 'HEAD']))
  assert.equal(existsSync(manifestPath(root, landed.landCommit)), true)
  const manifest = JSON.parse(readFileSync(manifestPath(root, landed.landCommit), 'utf8'))
  assert.equal(manifest.landCommit, landed.landCommit)
  assert.equal(manifest.landMode, 'fast-forward')
  assert.equal(manifest.mergeCommit, undefined)
  const landedState = readApplyState(root, null, CHANGE)
  assert.equal(landedState.status, 'archived')
  assert.equal(landedState.cleanup.worktreeRemoved, true)
  assert.equal(landedState.cleanup.branchRemoved, true)
  assert.equal(landed.cleanup.complete, true)
  assert.equal(existsSync(state.worktree), false)
  assert.equal(run(['branch', '--list', state.branch]), '')
  assert.equal(run(['status', '--porcelain']), '')
  assert.equal(run(['ls-tree', '-r', '--name-only', 'HEAD', `openspec/changes/${CHANGE}`]), '')
})

test('land advances main to a feature commit without a merge commit', async () => {
  const { root, run, fake, state } = await readyLand({ feature: true })
  const before = run(['rev-parse', 'HEAD'])
  const featureHead = run(['-C', state.worktree, 'rev-parse', 'HEAD'])
  const landed = await call(fake, 'openspec_apply_worktree', {
    action: 'land', change: CHANGE, approvedBy: 'user',
  })
  assert.equal(landed.landCommit, featureHead)
  assert.notEqual(landed.landCommit, before)
  assert.equal(run(['rev-parse', `${landed.landCommit}^1`]), state.sealedCommit)
  assert.equal(run(['rev-parse', `${state.sealedCommit}^1`]), before)
  assert.equal(run(['log', '-1', '--format=%P', landed.landCommit]).split(' ').length, 1)
  assert.equal(run(['rev-list', '--merges', `${before}..HEAD`]), '')
  assert.equal(run(['show', `${landed.landCommit}:feature.txt`]), 'feature')
  assert.equal(existsSync(join(root, 'feature.txt')), true)
})

test('land resumes a legacy merge and records the legacy mode', async () => {
  const { root, run, fake, landCommit } = await prepareLegacyLanding()
  const landed = await call(fake, 'openspec_apply_worktree', {
    action: 'land', change: CHANGE, approvedBy: 'user',
  })
  assert.equal(landed.landCommit, landCommit)
  assert.equal(landed.mergeCommit, landCommit)
  assert.equal(landed.archiveCommit, run(['rev-parse', 'HEAD']))
  const manifest = JSON.parse(readFileSync(manifestPath(root, landCommit), 'utf8'))
  assert.equal(manifest.landMode, 'legacy-merge')
  assert.equal(manifest.landCommit, landCommit)
})

test('land resumes a legacy merge whose archive commit already exists', async () => {
  const { root, run, fake, landCommit, archiveCommit } = await prepareLegacyLanding({ archive: true })
  const landed = await call(fake, 'openspec_apply_worktree', {
    action: 'land', change: CHANGE, approvedBy: 'user',
  })
  assert.equal(landed.landCommit, landCommit)
  assert.equal(landed.archiveCommit, archiveCommit)
  assert.equal(run(['rev-parse', 'HEAD']), archiveCommit)
  const manifest = JSON.parse(readFileSync(manifestPath(root, landCommit), 'utf8'))
  assert.equal(manifest.landMode, 'legacy-merge')
  assert.equal(manifest.archiveCommit, archiveCommit)
})

test('land refuses without user approval', async () => {
  const { fake } = await readyLand()
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE }),
    /approvedBy/,
  )
})

test('remove is idempotent after land cleanup', async () => {
  const { root, fake, state } = await readyLand()
  await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
  fake.ctx.workingDirectory.set({ id: 'review-test' }, root)
  const removed = await call(fake, 'openspec_apply_worktree', { action: 'remove', change: CHANGE })
  assert.equal(removed.removed, false)
  assert.equal(removed.branch, state.branch)
  assert.equal(existsSync(state.worktree), false)
  assert.notEqual(readApplyState(root, null, CHANGE), undefined)
})

test('land works when apply review is disabled', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = setup(root, { draft: { enabled: true, reviewers: 0 }, apply: { enabled: false } }, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  const landed = await call(fake, 'openspec_apply_worktree', {
    action: 'land', change: CHANGE, approvedBy: 'user',
  })
  assert.equal(readApplyState(root, null, CHANGE).status, 'archived')
  assert.equal(landed.archiveCommit, run(['rev-parse', 'HEAD']))
  const manifest = JSON.parse(readFileSync(manifestPath(root, landed.landCommit), 'utf8'))
  assert.equal(manifest.store, null)
  assert.equal(manifest.applyReviewId, null)
  assert.equal(manifest.reviewRecordHash, null)
  assert.equal(manifest.landMode, 'fast-forward')
})

test('remove guards active and dirty checkouts', async () => {
  const { fake, state } = await readyLand()
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'remove', change: CHANGE }),
    /archived state or abandon/,
  )
  writeFileSync(join(state.worktree, 'dirty.txt'), 'dirty\n')
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', {
      action: 'remove', change: CHANGE, abandon: true, approvedBy: 'user', reason: 'cleaning',
    }),
    /clean worktree/,
  )
})

test('land refuses no git, no state, a foreign state and non-main', async () => {
  const plainRoot = (await import('node:fs')).mkdtempSync(join((await import('node:os')).tmpdir(), 'land-plain-'))
  const plain = setup(plainRoot)
  await assert.rejects(
    call(plain, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /outside a git repository/,
  )
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /active or landing state/,
  )
  const { writeApplyState } = await import('../lib/worktree/state.js')
  writeApplyState(root, null, CHANGE, {
    schemaVersion: 1, change: CHANGE, store: null, mainRoot: root,
    worktree: join(root, 'foreign'), branch: 'foreign', baseCommit: 'a'.repeat(40),
    sealedCommit: null, status: 'active', createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(), lockToken: null, lockPid: null,
  })
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /plugin-created apply worktree/,
  )
})

test('land refuses a dirty main, dirty worktree, non-main and a worktree behind main', async () => {
  {
    const { root, run, fake } = await readyLand()
    run(['checkout', '-B', 'other'])
    await assert.rejects(call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }), /branch main/)
    writeFileSync(join(root, 'dirty.txt'), 'dirty\n')
    run(['checkout', '-B', 'main'])
    await assert.rejects(call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }), /clean main/)
  }
  {
    const { state, fake } = await readyLand()
    writeFileSync(join(state.worktree, 'dirty.txt'), 'dirty\n')
    await assert.rejects(call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }), /clean worktree/)
  }
  {
    const { root, run, fake } = await readyLand()
    writeFileSync(join(root, 'ahead.txt'), 'ahead\n')
    run(['add', 'ahead.txt'])
    run(['commit', '-m', 'main ahead'])
    await assert.rejects(call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }), /behind main/)
  }
})

test('land returns the fast-forward commit for an unchanged feature head', async () => {
  const { root, run, fake, state } = await readyLand()
  rmSync(join(root, 'openspec', 'changes', CHANGE), { recursive: true, force: true })
  run(['merge', '--ff-only', state.branch])
  const head = run(['rev-parse', 'HEAD'])
  const path = manifestPath(root, head)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ change: CHANGE, mergeCommit: head })}\n`)
  const result = await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
  assert.equal(result.landCommit, head)
  assert.equal(result.mergeCommit, head)
})

test('land rejects a non-linear feature history before updating main', async () => {
  const { root, run, fake, state } = await readyLand()
  const before = run(['rev-parse', 'HEAD'])
  run(['-C', state.worktree, 'checkout', '-b', 'side'])
  run(['-C', state.worktree, 'commit', '--allow-empty', '-m', 'side work'])
  run(['-C', state.worktree, 'checkout', state.branch])
  run(['-C', state.worktree, 'merge', '--no-ff', '-m', 'merge side', 'side'])
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /merge commits|linear/,
  )
  assert.equal(run(['rev-parse', 'HEAD']), before)
  assert.equal(readApplyState(root, null, CHANGE).status, 'active')
})

test('land rechecks main under the locks and preserves the moved head', async () => {
  const { root, run, fake, state } = await readyLand()
  const before = run(['rev-parse', 'HEAD'])
  await withGitRace(root, 'recheck', async () => {
    await assert.rejects(
      call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
      /behind main/,
    )
  })
  const after = run(['rev-parse', 'HEAD'])
  assert.notEqual(after, before)
  assert.equal(run(['log', '-1', '--format=%s']), 'seal recheck')
  assert.equal(existsSync(state.worktree), true)
  const current = readApplyState(root, null, CHANGE)
  assert.equal(current.status, 'active')
  assert.equal(typeof current.lockToken, 'string')
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.rebaseReview.mainHead, after)
})

test('a fast-forward race keeps the seal commit and records the marker', async () => {
  const { root, run, fake, state } = await readyLand()
  const before = run(['rev-parse', 'HEAD'])
  await withGitRace(root, 'merge', async () => {
    await assert.rejects(
      call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
      /fast-forward|merge|Not possible/i,
    )
  })
  const after = run(['rev-parse', 'HEAD'])
  assert.notEqual(after, before)
  assert.equal(run(['log', '-1', '--format=%s']), 'seal merge')
  assert.equal(run(['rev-list', '--merges', `${before}..HEAD`]), '')
  assert.equal(existsSync(state.worktree), true)
  const current = readApplyState(root, null, CHANGE)
  assert.equal(current.status, 'active')
  assert.equal(typeof current.lockToken, 'string')
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.rebaseReview.mainHead, after)
})

test('land refuses an unready apply review and a tree mismatch', async () => {
  {
    const { root, run } = gitFixture()
    run(['branch', '-M', 'main'])
    const fake = setup(root, undefined, { worktree: { enabled: true } })
    await passDraft(fake, root, run)
    await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
    await assert.rejects(
      call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
      /apply review is not ready/,
    )
  }
  {
    const { state, fake, run } = await readyLand()
    writeFileSync(join(state.worktree, 'late.txt'), 'late\n')
    run(['-C', state.worktree, 'add', 'late.txt'])
    run(['-C', state.worktree, 'commit', '-m', 'late worktree change'])
    await assert.rejects(
      call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
      /not ready|does not match/,
    )
  }
})

test('land keeps a resumable state when the archive commit fails', async () => {
  const { root, run, fake } = await readyLand()
  const hook = join(root, '.git', 'hooks', 'pre-commit')
  writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /commit/,
  )
  assert.equal(readApplyState(root, null, CHANGE).status, 'landing')
  rmSync(hook, { force: true })
  const retried = await call(fake, 'openspec_apply_worktree', {
    action: 'land', change: CHANGE, approvedBy: 'user',
  })
  assert.equal(retried.archiveCommit, run(['rev-parse', 'HEAD']))
  assert.equal(readApplyState(root, null, CHANGE).status, 'archived')
})

test('remove supports an approved abandon and refuses a missing state', async () => {
  const { root, fake, state } = await readyLand()
  const removed = await call(fake, 'openspec_apply_worktree', {
    action: 'remove', change: CHANGE, abandon: true, approvedBy: 'user', reason: 'stale trial',
  })
  assert.equal(removed.removed, true)
  assert.equal(existsSync(state.worktree), false)
  assert.equal(readApplyState(root, null, CHANGE), undefined)
  fake.ctx.workingDirectory.set({ id: 'review-test' }, root)
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'remove', change: CHANGE }),
    /no apply worktree state/,
  )
})

test('land refuses incomplete tasks and abandoned removal needs approval', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  writeFileSync(
    join(root, 'openspec', 'changes', CHANGE, 'tasks.md'),
    readFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), 'utf8').replace('- [x] 1.1', '- [ ] 1.1'),
  )
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'incomplete tasks'])
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  const { createOrReuseApplyWorktree } = await import('../lib/worktree/create.js')
  await createOrReuseApplyWorktree(fake.ctx, {
    mainRoot: root, store: null, change: CHANGE, sealCommit: run(['rev-parse', 'HEAD']),
    agent: { id: 'review-test' }, signal: new AbortController().signal,
  })
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /incomplete task/i,
  )
  const state = readApplyState(root, null, CHANGE)
  fake.ctx.workingDirectory.set({ id: 'review-test' }, root)
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'remove', change: CHANGE, abandon: true }),
    /abandon requires/,
  )
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'remove', change: CHANGE }),
    /archived state or abandon/,
  )
  assert.equal(readApplyState(root, null, CHANGE).worktree, state.worktree)
})

test('land and remove require a change and remove refuses a foreign state', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await assert.rejects(call(fake, 'openspec_apply_worktree', { action: 'land', approvedBy: 'user' }), /requires a non-empty change/)
  await assert.rejects(call(fake, 'openspec_apply_worktree', { action: 'remove' }), /requires a non-empty change/)
  const { writeApplyState } = await import('../lib/worktree/state.js')
  writeApplyState(root, null, CHANGE, {
    schemaVersion: 1, change: CHANGE, store: null, mainRoot: root,
    worktree: join(root, 'foreign'), branch: 'foreign', baseCommit: 'a'.repeat(40),
    sealedCommit: null, status: 'active', createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(), lockToken: null, lockPid: null,
  })
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'remove', change: CHANGE }),
    /plugin-created apply worktree/,
  )
})

test('land accepts a landing state and remove refuses a changed lock owner', async () => {
  const { root, fake, state } = await readyLand()
  const { writeApplyState } = await import('../lib/worktree/state.js')
  writeApplyState(root, null, CHANGE, { ...state, status: 'landing' })
  const landed = await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
  assert.equal(landed.change, CHANGE)
  const second = await readyLand()
  writeApplyState(second.root, null, CHANGE, { ...second.state, lockToken: 'wrong-token' })
  await assert.rejects(
    call(second.fake, 'openspec_apply_worktree', {
      action: 'remove', change: CHANGE, abandon: true, approvedBy: 'user', reason: 'cleanup',
    }),
    /changed owner|recover it/,
  )
})

test('a missing branch keeps a resumable active state and remove refuses no git', async () => {
  const { root, state, fake, run } = await readyLand()
  run(['-C', state.worktree, 'checkout', '--detach'])
  run(['branch', '-D', state.branch])
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /merge|not something we can merge/i,
  )
  assert.equal(readApplyState(root, null, CHANGE).status, 'active')
})

test('remove refuses outside git', async () => {
  const plainRoot = (await import('node:fs')).mkdtempSync(join((await import('node:os')).tmpdir(), 'remove-plain-'))
  const plain = setup(plainRoot)
  await assert.rejects(
    call(plain, 'openspec_apply_worktree', { action: 'remove', change: CHANGE }),
    /outside a git repository/,
  )
})

test('a CLI archive without a result is refused', async () => {
  const { root, fake } = await readyLand()
  const original = fake.ctx.subprocess.spawn
  fake.ctx.subprocess.spawn = (spec) => {
    if (spec.argv.some((arg) => arg === 'archive')) {
      return {
        stdin: undefined,
        stdout: undefined,
        stderr: undefined,
        control: undefined,
        collected: {
          stdout: { readFrom: () => ({ text: '{"archive":null}' }) },
          stderr: { readFrom: () => ({ text: '' }) },
        },
        done: Promise.resolve({ exitCode: 0, signal: null }),
        terminate() {},
        waitForExit() {},
      }
    }
    return original(spec)
  }
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /no archive result/,
  )
  assert.equal(readApplyState(root, null, CHANGE).status, 'landing')
  fake.ctx.subprocess.spawn = original
  const retried = await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
  assert.equal(readApplyState(root, null, CHANGE).status, 'archived')
  assert.equal(typeof retried.archiveCommit, 'string')
})

test('land refuses an archived state and abandon needs a reason', async () => {
  const { root, fake, state } = await readyLand()
  const { writeApplyState } = await import('../lib/worktree/state.js')
  writeApplyState(root, null, CHANGE, { ...state, status: 'archived', lockToken: null, lockPid: null })
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /active or landing state/,
  )
  fake.ctx.workingDirectory.set({ id: 'review-test' }, root)
  writeApplyState(root, null, CHANGE, { ...state, status: 'active' })
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', {
      action: 'remove', change: CHANGE, abandon: true, approvedBy: 'user',
    }),
    /abandon requires/,
  )
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', {
      action: 'remove', change: CHANGE, abandon: true, approvedBy: 'user', reason: '   ',
    }),
    /abandon requires/,
  )
})

test('the worktree tool rejects an unknown action and recover outside git', async () => {
  const plainRoot = (await import('node:fs')).mkdtempSync(join((await import('node:os')).tmpdir(), 'worktree-tool-'))
  const fake = setup(plainRoot)
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'bogus' }),
    /use recover, land or remove/,
  )
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'recover', scope: 'change', change: CHANGE, expectedOwner: 'x' }),
    /outside a git repository/,
  )
})

test('land refuses when apply review never started', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /apply review has not started/,
  )
})


test('a manifest write failure is retried after the archive commit', async () => {
  const { root, fake } = await readyLand()
  const landedDirectory = dirname(manifestPath(root, 'x'))
  mkdirSync(dirname(landedDirectory), { recursive: true })
  writeFileSync(landedDirectory, 'blocked')
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /EEXIST|ENOTDIR|not a directory/i,
  )
  assert.equal(readApplyState(root, null, CHANGE).status, 'landing')
  rmSync(landedDirectory, { force: true })
  const retried = await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
  assert.equal(readApplyState(root, null, CHANGE).status, 'archived')
  assert.equal(existsSync(manifestPath(root, retried.landCommit)), true)
})

test('land refuses a dead or mismatched change lock', async () => {
  {
    const { root, fake, state } = await readyLand()
    const { writeApplyState } = await import('../lib/worktree/state.js')
    writeApplyState(root, null, CHANGE, { ...state, lockPid: 999999 })
    await assert.rejects(
      call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
      /not owned/,
    )
  }
  {
    const { root, fake, state } = await readyLand()
    const path = join(root, '.git', 'openspec-flow', 'changes', 'local#add-dark-mode.lock.d', 'owner')
    const owner = JSON.parse(readFileSync(path, 'utf8'))
    writeFileSync(path, `${JSON.stringify({ ...owner, pid: 999999 })}\n`)
    await assert.rejects(
      call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
      /dead process|recover/,
    )
  }
})

test('land treats a missing change lock as free', async () => {
  const { root, fake } = await readyLand()
  const lock = join(root, '.git', 'openspec-flow', 'changes', 'local#add-dark-mode.lock.d')
  const fs = await import('node:fs')
  fs.rmSync(lock, { recursive: true, force: true })
  const landed = await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
  assert.equal(readApplyState(root, null, CHANGE).status, 'archived')
  assert.equal(landed.change, CHANGE)
})

test('land refuses when strict validation fails', async () => {
  const { fake } = await readyLand()
  const original = fake.ctx.subprocess.spawn
  fake.ctx.subprocess.spawn = (spec) => {
    if (spec.argv.some((arg) => arg === 'validate')) {
      return {
        stdin: undefined,
        stdout: undefined,
        stderr: undefined,
        control: undefined,
        collected: {
          stdout: { readFrom: () => ({ text: '{"items":[{"valid":false}]}' }) },
          stderr: { readFrom: () => ({ text: '' }) },
        },
        done: Promise.resolve({ exitCode: 0, signal: null }),
        terminate() {},
        waitForExit() {},
      }
    }
    return original(spec)
  }
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /validate refused/,
  )
})


test('the shared archive operation honors skipSpecs', async () => {
  const { fixture } = await import('./review-fixtures.mjs')
  const root = fixture()
  const fake = setup(root)
  const archived = await call(fake, 'openspec_archive', { change: CHANGE, skipSpecs: true })
  assert.equal(archived.archived, true)
})

test('archive from main names land even when the worktree has commits', async () => {
  const { root, run, fake } = await readyLand()
  const state = readApplyState(root, null, CHANGE)
  writeFileSync(join(state.worktree, 'feature.txt'), 'feature\n')
  run(['-C', state.worktree, 'add', 'feature.txt'])
  run(['-C', state.worktree, 'commit', '-m', 'feature commit'])
  fake.ctx.workingDirectory.set({ id: 'review-test' }, root)
  await assert.rejects(
    call(fake, 'openspec_archive', { change: CHANGE }),
    /openspec_apply_worktree action=land/,
  )
})

test('archive observes a dead lifecycle lock', async () => {
  const { root } = gitFixture()
  const fake = setup(root, { draft: { enabled: false, reviewers: 0 }, apply: { enabled: false } })
  const path = join(root, '.git', 'openspec-flow', 'lifecycle.lock.d')
  mkdirSync(path, { recursive: true })
  writeFileSync(join(path, 'owner'), `${JSON.stringify({ schema: 1, token: 'dead', pid: 999999, at: new Date().toISOString() })}\n`)
  await assert.rejects(
    call(fake, 'openspec_archive', { change: CHANGE }),
    /dead process|recover/,
  )
})

test('the tree guard refuses without resetting main', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const before = run(['rev-parse', 'HEAD'])
  writeFileSync(join(root, 'extra.txt'), 'extra\n')
  run(['add', 'extra.txt'])
  run(['commit', '-m', 'extra'])
  const after = run(['rev-parse', 'HEAD'])
  const { assertLandedTree } = await import('../lib/worktree/land.js')
  assert.throws(() => assertLandedTree(root, 'not-the-current-tree'), /tree differs/)
  assert.equal(run(['rev-parse', 'HEAD']), after)
  assert.notEqual(before, after)
})

test('land writes a rebase marker when the worktree is behind main', async () => {
  const { root, run, fake } = await readyLand()
  writeFileSync(join(root, 'ahead.txt'), 'ahead\n')
  run(['add', 'ahead.txt'])
  run(['commit', '-m', 'main ahead'])
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /behind main/,
  )
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(typeof record.rebaseReview?.treeSha, 'string')
  assert.equal(record.rebaseReview.mainHead, run(['rev-parse', 'HEAD']))
})

test('land uses a ready extra round tree after a rebase marker', async () => {
  const { root, run, fake } = await readyLand()
  const file = join(reviewDir(root), 'apply-review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  record.rebaseReview = {
    requiredAt: new Date().toISOString(),
    mainHead: record.baseCommit,
    worktreeHead: record.commitSha,
    treeSha: 'b'.repeat(40),
  }
  record.treeSha = 'b'.repeat(40)
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const opened = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  assert.equal(opened.roundToken, 'E1')
  await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, review: 'apply', report: report() })
  const landed = await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
  assert.equal(landed.cleanup.complete, true)
  const landedRecord = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(landedRecord.rebaseReview, undefined)
})

test('land retries only cleanup for an archived state with a manifest', async () => {
  const { root, run, fake, state } = await readyLand()
  const { writeApplyState } = await import('../lib/worktree/state.js')
  rmSync(join(root, 'openspec', 'changes', CHANGE), { recursive: true, force: true })
  run(['merge', '--ff-only', state.branch])
  const fakeLand = 'd'.repeat(40)
  const path = manifestPath(root, fakeLand)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ change: CHANGE, store: null, landCommit: fakeLand, landMode: 'fast-forward', archiveCommit: 'e'.repeat(40) })}\n`)
  writeApplyState(root, null, CHANGE, {
    ...state, status: 'archived', cleanup: { worktreeRemoved: false, branchRemoved: false },
  })
  const retried = await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
  assert.equal(retried.landCommit, fakeLand)
  assert.equal(retried.mergeCommit, fakeLand)
  assert.equal(retried.cleanup.complete, true)
  assert.equal(existsSync(state.worktree), false)
  const after = readApplyState(root, null, CHANGE)
  assert.equal(after.cleanup.worktreeRemoved, true)
  assert.equal(after.cleanup.branchRemoved, true)
  assert.equal(existsSync(path), true)
})

test('land uses the reviewed tree when the rebased tree is unchanged', async () => {
  const { root, fake } = await readyLand()
  const file = join(reviewDir(root), 'apply-review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  record.rebaseReview = {
    requiredAt: new Date().toISOString(),
    mainHead: record.baseCommit,
    worktreeHead: record.commitSha,
    treeSha: record.treeSha,
  }
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const landed = await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
  assert.equal(landed.cleanup.complete, true)
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).rebaseReview, undefined)
})

test('a cleanup failure records the error and keeps the archived state', async () => {
  const { root, run, fake, state } = await readyLand()
  const { writeApplyState } = await import('../lib/worktree/state.js')
  const fakeMerge = 'd'.repeat(40)
  const path = manifestPath(root, fakeMerge)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ change: CHANGE, store: null, mergeCommit: fakeMerge, archiveCommit: 'e'.repeat(40) })}\n`)
  run(['checkout', '-b', 'unmerged-branch'])
  writeFileSync(join(root, 'unmerged.txt'), 'x\n')
  run(['add', 'unmerged.txt'])
  run(['commit', '-m', 'unmerged'])
  run(['checkout', 'main'])
  writeApplyState(root, null, CHANGE, {
    ...state,
    status: 'archived',
    worktree: join(root, '.cache', 'openspec-flow', 'worktrees', 'local#missing-worktree'),
    branch: 'unmerged-branch',
    lockToken: null,
    lockPid: null,
  })
  const retried = await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
  assert.equal(retried.cleanup.complete, false)
  assert.equal(typeof retried.cleanup.error, 'string')
  const after = readApplyState(root, null, CHANGE)
  assert.equal(after.status, 'archived')
  assert.equal(typeof after.cleanup.error, 'string')
})

test('a cleanup retry tolerates an already removed branch and checkout', async () => {
  const { root, fake, state } = await readyLand()
  const { writeApplyState } = await import('../lib/worktree/state.js')
  const fakeMerge = 'd'.repeat(40)
  const path = manifestPath(root, fakeMerge)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ change: CHANGE, store: null, mergeCommit: fakeMerge, archiveCommit: 'e'.repeat(40) })}\n`)
  writeApplyState(root, null, CHANGE, {
    ...state,
    status: 'archived',
    worktree: join(root, '.cache', 'openspec-flow', 'worktrees', 'local#missing-worktree'),
    branch: 'missing-branch',
    lockToken: null,
    lockPid: null,
  })
  const retried = await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
  assert.equal(retried.cleanup.complete, true)
  assert.equal(retried.cleanup.worktreeRemoved, true)
  assert.equal(retried.cleanup.branchRemoved, true)
})

test('a corrupt manifest and a completed cleanup refuse the retry', async () => {
  {
    const { root, fake, state } = await readyLand()
    const { writeApplyState } = await import('../lib/worktree/state.js')
    mkdirSync(join(root, '.git', 'openspec-flow', 'landed'), { recursive: true })
    writeFileSync(join(root, '.git', 'openspec-flow', 'landed', 'bad.json'), '{')
    writeApplyState(root, null, CHANGE, {
      ...state, status: 'archived', lockToken: null, lockPid: null,
    })
    await assert.rejects(
      call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
      /active or landing state/,
    )
  }
  {
    const { root, fake, state } = await readyLand()
    const { writeApplyState } = await import('../lib/worktree/state.js')
    const fakeMerge = 'f'.repeat(40)
    const path = manifestPath(root, fakeMerge)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify({ change: CHANGE, store: null, mergeCommit: fakeMerge, archiveCommit: 'e'.repeat(40) })}\n`)
    writeApplyState(root, null, CHANGE, {
      ...state,
      status: 'archived',
      lockToken: null,
      lockPid: null,
      cleanup: { worktreeRemoved: true, branchRemoved: true },
    })
    await assert.rejects(
      call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
      /active or landing state/,
    )
  }
})

test('land writes no marker when apply review is disabled', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = setup(root, { draft: { enabled: true, reviewers: 0 }, apply: { enabled: false } }, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  writeFileSync(join(root, 'ahead.txt'), 'ahead\n')
  run(['add', 'ahead.txt'])
  run(['commit', '-m', 'main ahead'])
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /behind main/,
  )
  assert.equal(existsSync(join(reviewDir(root), 'apply-review.json')), false)
})

test('land writes no marker for a foreign lock owner', async () => {
  const { root, run, fake } = await readyLand()
  writeFileSync(join(root, 'ahead.txt'), 'ahead\n')
  run(['add', 'ahead.txt'])
  run(['commit', '-m', 'main ahead'])
  const current = readApplyState(root, null, CHANGE)
  writeApplyState(root, null, CHANGE, { ...current, lockToken: 'foreign-token' })
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /not owned by this session/,
  )
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.rebaseReview, undefined)
})

test('land keeps the marker when the archive fails and records the pre-clear hash on success', async () => {
  {
    const { root, run, fake } = await readyLand()
    const file = join(reviewDir(root), 'apply-review.json')
    const record = JSON.parse(readFileSync(file, 'utf8'))
    record.rebaseReview = {
      requiredAt: new Date().toISOString(),
      mainHead: record.baseCommit,
      worktreeHead: record.commitSha,
      treeSha: 'b'.repeat(40),
    }
    record.treeSha = 'b'.repeat(40)
    writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
    await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
    await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, review: 'apply', report: report() })
    const hook = join(root, '.git', 'hooks', 'pre-commit')
    writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
    await assert.rejects(
      call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
      /commit/,
    )
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).rebaseReview.treeSha, 'b'.repeat(40))
    rmSync(hook, { force: true })
  }
  {
    const { root, run, fake } = await readyLand()
    const file = join(reviewDir(root), 'apply-review.json')
    const record = JSON.parse(readFileSync(file, 'utf8'))
    record.rebaseReview = {
      requiredAt: new Date().toISOString(),
      mainHead: record.baseCommit,
      worktreeHead: record.commitSha,
      treeSha: 'b'.repeat(40),
    }
    record.treeSha = 'b'.repeat(40)
    writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
    await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
    await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, review: 'apply', report: report() })
    const before = sha256(readFileSync(file, 'utf8'))
    const landed = await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
    const manifest = JSON.parse(readFileSync(manifestPath(root, landed.landCommit), 'utf8'))
    assert.equal(manifest.reviewRecordHash, before)
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).rebaseReview, undefined)
  }
})

test('land refuses while the extra round is not ready', async () => {
  const { root, fake } = await readyLand()
  const file = join(reviewDir(root), 'apply-review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  record.rebaseReview = {
    requiredAt: new Date().toISOString(),
    mainHead: record.baseCommit,
    worktreeHead: record.commitSha,
    treeSha: 'b'.repeat(40),
  }
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /rebase marker/,
  )
})

test('land writes no marker when the apply review never started', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  writeFileSync(join(root, 'ahead.txt'), 'ahead\n')
  run(['add', 'ahead.txt'])
  run(['commit', '-m', 'main ahead'])
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /has not started/,
  )
  assert.equal(existsSync(join(reviewDir(root), 'apply-review.json')), false)
})


const landWorktreeApply = (root) => setup(root, undefined, { worktree: { enabled: true } })
const runBranch = (root) => spawnSync('git', ['-C', root, 'branch', '-M', 'main'])

async function landReady(root) {
  const fake = landWorktreeApply(root)
  await passDraftConstructing(fake, root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  return fake
}
test('land deletes the seal ref and leaves main clean', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = landWorktreeApply(root)
  await passDraftConstructing(fake, root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  assert.equal(run(['rev-parse', '--verify', sealRefName(null, CHANGE)]).length > 0, true)
  const landed = await call(fake, 'openspec_apply_worktree', {
    action: 'land', change: CHANGE, approvedBy: 'user',
  })
  assert.equal(landed.cleanup.complete, true)
  assert.notEqual(spawnSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', sealRefName(null, CHANGE)]).status, 0)
  assert.equal(run(['status', '--porcelain']), '')
})

test('land restores the planning copy when it fails before the merge', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = landWorktreeApply(root)
  await passDraftConstructing(fake, root)
  const state = readApplyState(root, null, CHANGE)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  writeFileSync(join(state.worktree, 'dirty.txt'), 'dirty\n')
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /clean worktree/,
  )
  assert.equal(run(['rev-parse', 'HEAD']) !== state.baseCommit, true)
  assert.equal(readFileSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'), 'utf8').length > 0, true)
  assert.match(run(['status', '--porcelain']), new RegExp(`openspec/changes/${CHANGE}`))
})

test('land restores a tracked modified ignore file and the fast-forward updates it', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  run(['add', 'openspec/.gitignore'])
  run(['commit', '-m', 'track the ignore file'])
  const fake = landWorktreeApply(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n# docs\n')
  await call(fake, 'openspec_apply_next', { change: CHANGE })
  const state = readApplyState(root, null, CHANGE)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
  assert.equal(run(['show', 'HEAD:openspec/.gitignore']), '.review/\n# docs')
  assert.equal(run(['status', '--porcelain']), '')
  assert.equal(state.baseCommit.length, 40)
})

test('remove deletes the seal ref and keeps the branch', async () => {
  const { root, run } = gitFixture()
  const fake = landWorktreeApply(root)
  await passDraftConstructing(fake, root)
  const state = readApplyState(root, null, CHANGE)
  assert.equal(run(['rev-parse', sealRefName(null, CHANGE)]), state.baseCommit)
  await call(fake, 'openspec_apply_worktree', {
    action: 'remove', change: CHANGE, abandon: true, approvedBy: 'user', reason: 'abandoned for a test',
  })
  assert.notEqual(spawnSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', sealRefName(null, CHANGE)]).status, 0)
  assert.equal(run(['rev-parse', `refs/heads/${state.branch}`]), state.baseCommit)
})

test('land refuses a main copy that differs from the seal', async () => {
  const { root } = gitFixture()
  runBranch(root)
  const fake = await landReady(root)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'), '# Changed in main\n')
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /differs from the seal/,
  )
})

test('land refuses a main file that is not in the seal', async () => {
  const { root } = gitFixture()
  runBranch(root)
  const fake = await landReady(root)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'extra.md'), 'extra\n')
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /not in the seal/,
  )
})

test('land restores a tracked deleted ignore file', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  run(['add', 'openspec/.gitignore'])
  run(['commit', '-m', 'track the ignore file'])
  const fake = await landReady(root)
  rmSync(join(root, 'openspec', '.gitignore'))
  const landed = await call(fake, 'openspec_apply_worktree', {
    action: 'land', change: CHANGE, approvedBy: 'user',
  })
  assert.equal(landed.cleanup.complete, true)
  assert.equal(readFileSync(join(root, 'openspec', '.gitignore'), 'utf8'), '.review/\n')
})

test('land refuses a tracked ignore file that differs from the seal', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  run(['add', 'openspec/.gitignore'])
  run(['commit', '-m', 'track the ignore file'])
  const fake = await landReady(root)
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n# later edit\n')
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /differs from the seal/,
  )
})

test('a branch that does not point at the seal is refused on re-apply', async () => {
  const { root, run } = gitFixture()
  const fake = landWorktreeApply(root)
  await passDraftConstructing(fake, root)
  const state = readApplyState(root, null, CHANGE)
  await call(fake, 'openspec_apply_worktree', {
    action: 'remove', change: CHANGE, abandon: true, approvedBy: 'user', reason: 'restart',
  })
  run(['branch', '-f', state.branch, 'HEAD'])
  const second = landWorktreeApply(root)
  await assert.rejects(
    call(second, 'openspec_apply_next', { change: CHANGE }),
    /does not point at the seal commit/,
  )
})

test('land removes an untracked ignore file staged by the seal', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  const fake = await landReady(root)
  const landed = await call(fake, 'openspec_apply_worktree', {
    action: 'land', change: CHANGE, approvedBy: 'user',
  })
  assert.equal(landed.cleanup.complete, true)
  assert.equal(run(['status', '--porcelain']), '')
  assert.equal(readFileSync(join(root, 'openspec', '.gitignore'), 'utf8'), '.review/\n')
})

test('land restores a tracked modified ignore file when it fails', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  run(['add', 'openspec/.gitignore'])
  run(['commit', '-m', 'track the ignore file'])
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n# docs\n')
  const fake = await landReady(root)
  const state = readApplyState(root, null, CHANGE)
  writeFileSync(join(state.worktree, 'dirty.txt'), 'dirty\n')
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /clean worktree/,
  )
  assert.equal(readFileSync(join(root, 'openspec', '.gitignore'), 'utf8'), '.review/\n# docs\n')
  assert.match(run(['status', '--porcelain']), /M openspec\/\.gitignore/)
})

test('removing a missing seal ref is a no-op', async () => {
  const { root } = gitFixture()
  removeSealRef(root, null, CHANGE)
  removeSealRef(root, null, CHANGE)
})

test('a refused abandon keeps the seal ref and the active state', async () => {
  const { root, fake, state } = await readyLand()
  writeFileSync(join(state.worktree, 'dirty.txt'), 'dirty\n')
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', {
      action: 'remove', change: CHANGE, abandon: true, approvedBy: 'user', reason: 'cleaning',
    }),
    /clean worktree/,
  )
  assert.equal(spawnSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', sealRefName(null, CHANGE)]).status, 0)
  assert.equal(readApplyState(root, null, CHANGE).status, 'active')
})

test('land lists every mismatching path in one refusal', async () => {
  const { root, run } = gitFixture()
  runBranch(root)
  const fake = await landReady(root)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'), '# Changed in main\n')
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'extra.md'), 'extra\n')
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    (error) => /proposal\.md: content differs from the seal/.test(error.message)
      && /extra\.md: not in the seal/.test(error.message),
  )
})

test('land names a tracked modified planning file', async () => {
  const { root, run } = gitFixture()
  runBranch(root)
  const fake = await landReady(root)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'), '# tracked change\n')
  run(['add', `openspec/changes/${CHANGE}/proposal.md`])
  run(['commit', '-m', 'track the planning file'])
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'), '# modified again\n')
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /clean main worktree/,
  )
})
