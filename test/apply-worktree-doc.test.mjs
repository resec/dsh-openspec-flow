import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

test('the apply worktree document and README row describe the state and locks', () => {
  const doc = readFileSync(join(ROOT, 'docs', 'apply-worktree.md'), 'utf8')
  for (const text of [
    'openspec-flow/apply/<store>#<change>.json',
    'lifecycle.lock.d',
    'changes/<store>#<change>.lock.d',
    'expectedOwner',
    'repair.action',
    'cleanup',
    'rebaseReview',
    'cleanup.complete',
  ]) {
    assert.ok(doc.includes(text), `document names ${text}`)
  }
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
  assert.ok(readme.includes('openspec_apply_worktree'), 'README names the recover tool')
  assert.ok(readme.includes('docs/apply-worktree.md'), 'README lists the document')
})

test('the apply worktree document names the land cleanup and rebase marker', () => {
  const doc = readFileSync(join(ROOT, 'docs', 'apply-worktree.md'), 'utf8')
  for (const text of [
    'rebaseReview',
    'worktreeRemoved',
    'branchRemoved',
    'cleanup.error',
    'fast-forward',
    '--ff-only',
    'landCommit',
    'landMode',
    'legacy-merge',
    'never resets or rewinds main',
    'linear rebase',
    'the commit after the branch tip is not an archive commit',
    'never repairs main',
  ]) {
    assert.ok(doc.includes(text), `document names ${text}`)
  }
})

test('the apply worktree document names the seal, the ref and the land copy handling', () => {
  const doc = readFileSync(join(ROOT, 'docs', 'apply-worktree.md'), 'utf8')
  for (const text of [
    'constructed with a temporary index',
    'refs/openspec-flow/seal/<slug>-<hash>',
    'reconciles the main planning copy with the seal tree',
    'restored to its `HEAD` version',
    'deletes only a branch the call created itself',
    'a seal-created branch and its seal ref remain',
    'task counters stay at the pre-apply values until land',
  ]) {
    assert.ok(doc.includes(text), `document names ${text}`)
  }
})
