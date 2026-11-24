import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('the local pull-request document names the state, lock and phases', () => {
  const doc = read('docs/local-pr.md')
  for (const text of [
    '.cache/pr-review/local-prs.json',
    '.cache/pr-review/landing.lock/',
    'schemaVersion',
    'ownerSession',
    '`published`',
    '`merged`',
    '`retargeted`',
    '`landed`',
    '`pushed`',
    '`landed-offline`',
    '`failed`',
    'state --cleanup',
    'force-release',
    '120 minutes',
    'resolved against the main worktree',
  ]) {
    assert.ok(doc.includes(text), `local-pr.md names ${text}`)
  }
})

test('the local pull-request document names the preflight and publication gates', () => {
  const doc = read('docs/local-pr.md')
  for (const text of [
    'node scripts/pr-review-watch.mjs preflight',
    'node scripts/pr-publish.mjs --session <id>',
    'node scripts/pr-publish.mjs --session <id> --apply',
    'npm run pr:publish',
    'offline-land',
    'local-main-ahead',
    'push-landed.mjs --push',
    'push-landed.mjs --push --offline',
    'offline-lands.json',
    'local-apply-review: change=<change>',
    'no `mergeable`',
    'no `owner-review`',
    'no review comment',
    'draft',
    'closed or merged pull request',
  ]) {
    assert.ok(doc.includes(text), `local-pr.md names ${text}`)
  }
})

test('the local pull-request document names the online retarget, land and push sequence', () => {
  const doc = read('docs/local-pr.md')
  for (const text of [
    'gh pr merge --rebase',
    'node scripts/pr-local-land.mjs verify <n> --session <id>',
    'node scripts/pr-local-land.mjs retarget <n> --session <id> --apply',
    '`--token` is optional when `--session` matches',
    'releases the landing lock',
    'appends the recorded `--token`',
    'openspec_apply_worktree action=land change=<change> approvedBy=user',
    'node scripts/push-landed.mjs --push',
    'finish <n> --phase pushed --session <id> --apply',
    'only the archive commit',
    'openspec_review action=resume review=apply',
    're-running the publish command with its `--token`',
    'merge commit tree differs from the reviewed tree',
  ]) {
    assert.ok(doc.includes(text), `local-pr.md names ${text}`)
  }
})

test('the local pull-request document names recovery and the offline route', () => {
  const doc = read('docs/local-pr.md')
  for (const text of [
    'node scripts/pr-local-land.mjs recover <n>',
    'openspec_apply_worktree action=recover scope=change expectedOwner=<token>',
    'npm run test:lab -- --mock-only',
    'node scripts/offline-land.mjs record --change <change> --land <sha> --apply',
    'node scripts/push-landed.mjs --push --offline',
    'finish <n> --phase landed-offline --session <id> --apply',
    'deferred land and archive commits',
    'close it manually',
    'never reviews, retargets, lands or merges it',
  ]) {
    assert.ok(doc.includes(text), `local-pr.md names ${text}`)
  }
})

test('the review document excludes local pull requests and documents the lock and same-run completion', () => {
  const doc = read('docs/pr-review.md')
  for (const text of [
    'scripts/pr-review-watch.mjs preflight',
    'scripts/pr-review-lock.mjs status',
    'local-prs.json',
    'landing.lock/owner.json',
    'owner-managed',
    'never becomes a review candidate',
    '`ownerManaged`',
    'owner-managed (skipped)',
    'same scheduled',
    'refuses while a local owner holds `landing.lock`',
    'pr-review-lock.mjs acquire',
    'read-only pre-acquire step',
    'plan is a locked command',
    'force-release',
    'lock.stale',
    'finish releases the lock',
    'merges, archives, pushes and finishes in one locked run',
    'node scripts/pr-local-land.mjs status',
    'phase is merged, retargeted, landed or landed-offline',
    'docs/local-pr.md',
  ]) {
    assert.ok(doc.includes(text), `pr-review.md names ${text}`)
  }
})

test('the landed push document names the online archive-only range and the offline deferred push', () => {
  const doc = read('docs/land-push.md')
  for (const text of [
    'local-pr.md',
    'retargeted to the pull-request merge commit',
    'only the archive commit',
    'landed-offline',
    'deferred push',
    'npm run test:lab -- --mock-only',
    'remote `lab` CI job',
  ]) {
    assert.ok(doc.includes(text), `land-push.md names ${text}`)
  }
})

test('the README and the lab document route the lab gate to remote CI', () => {
  const readme = read('README.md')
  assert.ok(readme.includes('docs/local-pr.md'))
  assert.ok(readme.includes('远端 `lab` CI 任务'))
  assert.ok(readme.includes('pre-push 不再运行 lab'))
  const lab = read('docs/lab.md')
  assert.ok(lab.includes('remote `lab` CI job'))
  assert.ok(lab.includes('npm run test:lab -- --mock-only'))
  assert.ok(lab.includes('offline maintainer path'))
})

test('the local pull-request document scopes the restricted-path exemption to maintainer pull requests', () => {
  const doc = read('docs/local-pr.md')
  for (const text of [
    'scripts/check-pr-change.mjs',
    '`--maintainer`',
    '`resec`',
    '`github.event.pull_request.head.repo.full_name`',
    'external pull request still fails on a restricted path',
    'The flag skips only the restricted-path refusal',
  ]) {
    assert.ok(doc.includes(text), `local-pr.md names ${text}`)
  }
})

test('the landing lock documents the contributor run lifecycle and stale release', () => {
  const doc = read('docs/local-pr.md')
  for (const text of [
    'A contributor landing run takes the same lock',
    'read-only pre-acquire step',
    'including the otherwise read-only `plan`',
    'The same owner session re-enters its existing lock',
    '--owner-session <scheduled-session>',
    '`finish` releases the lock',
    'a stale lock, the operator force-releases it',
    'passes `--session <scheduled-session>`',
  ]) {
    assert.ok(doc.includes(text), `local-pr.md names ${text}`)
  }
})

test('package.json exposes the publish and local-land commands', () => {
  const manifest = JSON.parse(read('package.json'))
  assert.equal(manifest.scripts['pr:publish'], 'node scripts/pr-publish.mjs')
  assert.equal(manifest.scripts['pr:local-land'], 'node scripts/pr-local-land.mjs')
})
