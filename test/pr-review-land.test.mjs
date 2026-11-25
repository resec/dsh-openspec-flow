import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  LANDING_LABEL,
  REVIEW_FAILED_PHASE,
  abandonLanding,
  assertLandingLockFree,
  assertNotLocal,
  archiveLanding,
  assertSingleLanding,
  failLanding,
  finishLanding,
  hasLandingLabel,
  isGhWrite,
  isHeadPoll,
  listLandingCandidates,
  loadLandings,
  main,
  mergeLanding,
  parseArgs,
  planLanding,
  prepareLanding,
  pushLanding,
  reviewedLanding,
  saveLandings,
  syncLanding,
  syncBatch,
  trustedPass,
} from '../scripts/pr-review-land.mjs'
import { loadState, resolvePaths, saveLocalState, saveState } from '../scripts/pr-review-watch.mjs'
import { acquireLock, forceRelease } from '../scripts/pr-review-lock.mjs'
import { cleanupTempDirs, tempDir } from './temp.mjs'

test.after(cleanupTempDirs)

const HEAD = 'a'.repeat(40)
const LOGIN = 'maintainer'

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function makeRepo() {
  const root = tempDir('dsh-pr-review-land-')
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test'])
  const change = join(root, 'openspec', 'changes', 'widget')
  mkdirSync(change, { recursive: true })
  writeFileSync(join(change, '.openspec.yaml'), 'schema: spec-driven\n')
  writeFileSync(join(change, 'proposal.md'), '# Widget\n')
  mkdirSync(join(root, 'openspec', 'changes', 'archive'), { recursive: true })
  writeFileSync(join(root, '.gitignore'), '.cache/\n')
  writeFileSync(join(root, 'README.md'), 'base\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', 'initial'])
  const remote = tempDir('dsh-pr-review-land-remote-')
  git(remote, ['init', '--bare', '-q'])
  git(root, ['remote', 'add', 'origin', remote])
  git(root, ['push', '-q', '-u', 'origin', 'main'])
  return { root, remote }
}

function addPullRequest(root, remote, change = 'widget', line = 'feature') {
  git(root, ['checkout', '-q', '-b', 'pr-branch'])
  writeFileSync(join(root, 'feature.txt'), `${line}\n`)
  git(root, ['add', 'feature.txt'])
  git(root, ['commit', '-qm', 'pr change'])
  const head = git(root, ['rev-parse', 'HEAD'])
  git(root, ['push', '-q', 'origin', 'HEAD:refs/pull/12/head'])
  git(root, ['checkout', '-q', 'main'])
  const worktree = join(resolvePaths(root).worktrees, 'pr-12')
  const state = {
    schemaVersion: 1,
    prs: {
      12: {
        number: 12,
        head,
        base: git(root, ['merge-base', 'origin/main', head]),
        baseTip: git(root, ['rev-parse', 'origin/main']),
        change,
        worktree,
        round: 1,
        status: 'commented',
        error: null,
        commentId: 'https://example.test/comment/1',
        updatedAt: new Date().toISOString(),
      },
    },
  }
  saveState(root, state)
  return { head, worktree }
}

function prJson(head, baseRefName = 'main', overrides = {}) {
  return JSON.stringify({
    number: 12,
    state: 'OPEN',
    isDraft: false,
    headRefOid: head,
    baseRefOid: 'b'.repeat(40),
    baseRefName,
    headRefName: 'pr-branch',
    statusCheckRollup: [{ conclusion: 'SUCCESS' }],
    files: [{ path: 'openspec/changes/widget/proposal.md' }, { path: 'feature.txt' }],
    labels: [{ name: LANDING_LABEL }],
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'BEHIND',
    comments: [{
      author: { login: LOGIN },
      body: `## Apply review\n\n**Verdict:** pass\n\n<!-- pr-review: pr=12 head=${head} round=1 -->`,
    }],
    ...overrides,
  })
}

function fakeGh({ pr = {}, list = [], onMerge } = {}) {
  return (args, cwd) => {
    if (args[0] === 'api') return LOGIN
    if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify(pr)
    if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify(list)
    if (args[0] === 'pr' && args[1] === 'merge') {
      if (onMerge) onMerge(cwd)
      return 'merged'
    }
    throw new Error(`unexpected gh ${args.join(' ')}`)
  }
}

function reviewRecord(root, tree, state = 'passed') {
  const paths = resolvePaths(root)
  const directory = join(paths.commonDir, 'openspec-flow', 'review', 'local#widget')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'apply-review.json'), `${JSON.stringify({ state, treeSha: tree }, null, 2)}\n`)
}

function writeParallelDraft(root) {
  mkdirSync(join(root, 'openspec', 'changes', 'other'), { recursive: true })
  writeFileSync(join(root, 'openspec', 'changes', 'other', 'proposal.md'), '# Other\n')
}

function moveWidgetToArchive(root, name = '2026-01-01-widget') {
  renameSync(join(root, 'openspec/changes/widget'), join(root, 'openspec/changes/archive', name))
}

function landingToArchivePending({ changeSpec = false, draft = false } = {}) {
  const { root, remote } = makeRepo()
  if (draft) writeParallelDraft(root)
  if (changeSpec) {
    const directory = join(root, 'openspec', 'changes', 'widget', 'specs', 'widget')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'spec.md'), '# Widget spec\n')
    git(root, ['add', '.'])
    git(root, ['commit', '-qm', 'add the widget delta'])
    git(root, ['push', '-q', 'origin', 'main'])
  }
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
  const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
  reviewRecord(root, tree)
  reviewedLanding({ root, number: 12, apply: true })
  const onMerge = () => {
    git(root, ['push', '-q', 'origin', `${prepared.landingHead}:refs/heads/main`])
  }
  mergeLanding({ root, number: 12, apply: true, gh: fakeGh({ pr: JSON.parse(prJson(head)), onMerge }) })
  return { root, remote, prepared }
}

function landingToReviewed() {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
  const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
  reviewRecord(root, tree)
  reviewedLanding({ root, number: 12, apply: true })
  return { root, remote, head, prepared }
}

test('help and argument parsing are strict', () => {
  assert.equal(parseArgs(['--help']).command, 'help')
  assert.equal(parseArgs(['plan', '12']).number, 12)
  assert.equal(parseArgs(['archive', '12', '--commit', 'abc', '--apply']).commit, 'abc')
  assert.equal(parseArgs(['candidates']).command, 'candidates')
  const failed = parseArgs(['state', '--fail', '12', '--error', 'reviewer gone', '--apply'])
  assert.equal(failed.fail, 12)
  assert.equal(failed.error, 'reviewer gone')
  assert.equal(failed.apply, true)
  assert.throws(() => parseArgs(['state', '--fail', '12', '--apply']), /non-empty --error/)
  assert.throws(() => parseArgs(['candidates', '--apply']), /read-only/)
  assert.throws(() => parseArgs(['plan', '12', '--fail', '3']), /belong to state/)
  assert.throws(() => parseArgs(['plan']), /needs one PR number/)
  assert.throws(() => parseArgs(['wat', '12']), /unknown command/)
  let help = ''
  assert.equal(main(['--help'], (text) => { help += text }), 0)
  assert.match(help, /pr-review-land/)
  assert.match(help, /candidates/)
})

test('landing documentation names the label, candidates, resume and recovery', () => {
  const doc = readFileSync(new URL('../docs/pr-review.md', import.meta.url), 'utf8')
  assert.match(doc, /`mergeable`/)
  assert.match(doc, /gh pr merge <n> --rebase/)
  assert.match(doc, /openspec_archive/)
  assert.match(doc, /tree-mismatch/)
  assert.match(doc, /pr-review-land\.mjs candidates/)
  assert.match(doc, /sync <n> --apply/)
  assert.match(doc, /update-branch/)
  assert.match(doc, /same-repository/)
  assert.match(doc, /latest main/)
  assert.match(doc, /action=resume/)
  assert.match(doc, /state=passed/)
  assert.match(doc, /state=in-review/)
  assert.match(doc, /treeSha/)
  assert.match(doc, /landing tree/)
  assert.match(doc, /action=wait/)
  assert.match(doc, /without disposing a finding/)
  assert.match(doc, /state --fail/)
  assert.match(doc, /`review-failed`/)
  assert.match(doc, /every five minutes/)
  assert.match(doc, /archive <n> --apply/)
  assert.match(doc, /body is empty/)
  assert.match(doc, /capability directories/)
  const agents = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8')
  assert.match(agents, /tolerates other changes' uncommitted planning files/)
  assert.match(agents, /subject-only commit/)
})

test('label and trusted pass checks are exact', () => {
  assert.equal(hasLandingLabel({ labels: [{ name: LANDING_LABEL }] }), true)
  assert.equal(hasLandingLabel({ labels: [{ name: 'merge' }] }), false)
  const comments = [{ author: { login: LOGIN }, body: `**Verdict:** pass\n<!-- pr-review: pr=12 head=${HEAD} round=1 -->` }]
  assert.equal(trustedPass(comments, LOGIN, 12, HEAD), true)
  assert.equal(trustedPass(comments, 'other', 12, HEAD), false)
  assert.equal(trustedPass([{ ...comments[0], body: '**Verdict:** changes-requested\n<!-- pr-review: pr=12 head=' + HEAD + ' round=1 -->' }], LOGIN, 12, HEAD), false)
})

test('a second unfinished landing is refused', () => {
  assert.throws(() => assertSingleLanding({ lands: { 2: { phase: 'prepared' } } }, 1), /already landing/)
  assert.doesNotThrow(() => assertSingleLanding({ lands: { 2: { phase: 'failed' } } }, 1))
})

test('plan refuses a missing label, a stale head and a non-main base', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const good = fakeGh({ pr: JSON.parse(prJson(head)) })
  assert.equal(planLanding({ root, number: 12, gh: good }).change, 'widget')
  assert.throws(() => planLanding({
    root,
    number: 12,
    gh: fakeGh({ pr: JSON.parse(prJson(head, 'main', { labels: [] })) }),
  }), /no mergeable label/)
  assert.throws(() => planLanding({
    root,
    number: 12,
    gh: fakeGh({ pr: JSON.parse(prJson(head, 'release')) }),
  }), /targets release, not main/)
})

test('plan accepts a green newest run after a superseded failure', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const superseded = prJson(head, 'main', {
    statusCheckRollup: [
      { name: 'verify', workflowName: 'ci', conclusion: 'FAILURE', startedAt: '2026-11-23T03:06:12Z' },
      { name: 'verify', workflowName: 'ci', conclusion: 'SUCCESS', startedAt: '2026-11-23T03:27:16Z' },
    ],
  })
  assert.equal(planLanding({ root, number: 12, gh: fakeGh({ pr: JSON.parse(superseded) }) }).change, 'widget')
  const failed = prJson(head, 'main', {
    statusCheckRollup: [
      { name: 'verify', workflowName: 'ci', conclusion: 'SUCCESS', startedAt: '2026-11-23T03:06:12Z' },
      { name: 'verify', workflowName: 'ci', conclusion: 'FAILURE', startedAt: '2026-11-23T03:27:16Z' },
    ],
  })
  assert.throws(() => planLanding({ root, number: 12, gh: fakeGh({ pr: JSON.parse(failed) }) }), /green CI rollup/)
})

test('plan refuses a changes-requested comment and a stale watch head', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const comments = [{ author: { login: LOGIN }, body: `**Verdict:** changes-requested\n<!-- pr-review: pr=12 head=${head} round=1 -->` }]
  assert.throws(() => planLanding({
    root,
    number: 12,
    gh: fakeGh({ pr: JSON.parse(prJson(head, 'main', { comments })) }),
  }), /trusted pass/)
  const state = JSON.parse(readFileSync(join(resolvePaths(root).cache, 'state.json'), 'utf8'))
  state.prs['12'].head = 'c'.repeat(40)
  writeFileSync(join(resolvePaths(root).cache, 'state.json'), `${JSON.stringify(state, null, 2)}\n`)
  assert.throws(() => planLanding({ root, number: 12, gh: fakeGh({ pr: JSON.parse(prJson(head)) }) }), /head moved/)
})

test('prepare creates the landing branch at the current head and reviewed checks the record tree', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
  assert.equal(prepared.phase, 'prepared')
  assert.equal(prepared.landingHead, head)
  const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
  assert.throws(() => reviewedLanding({ root, number: 12, apply: true }), /apply review record/)
  reviewRecord(root, tree)
  const reviewed = reviewedLanding({ root, number: 12, apply: true })
  assert.equal(reviewed.phase, 'reviewed')
  assert.equal(reviewed.reviewedTree, tree)
  const again = reviewedLanding({ root, number: 12, apply: true })
  assert.equal(again.phase, 'reviewed')
})

test('plan and prepare refuse a behind same-repository head without a landing entry', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  writeFileSync(join(root, 'README.md'), 'main moved\n')
  git(root, ['add', 'README.md'])
  git(root, ['commit', '-qm', 'main moved'])
  git(root, ['push', '-q', 'origin', 'main'])
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  assert.throws(() => planLanding({ root, number: 12, gh: fake }), /behind origin\/main; run sync 12/)
  assert.throws(() => prepareLanding({ root, number: 12, apply: true, gh: fake }), /behind origin\/main; run sync 12/)
  assert.equal(loadLandings(root).lands['12'], undefined)
  assert.equal(git(remote, ['rev-parse', 'refs/pull/12/head']), head)
})

test('prepare names the author update for a behind fork head', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  writeFileSync(join(root, 'README.md'), 'main moved\n')
  git(root, ['add', 'README.md'])
  git(root, ['commit', '-qm', 'main moved'])
  git(root, ['push', '-q', 'origin', 'main'])
  const fake = fakeGh({ pr: JSON.parse(prJson(head, 'main', { isCrossRepository: true })) })
  assert.throws(() => prepareLanding({ root, number: 12, apply: true, gh: fake }), /author must update the branch/)
  assert.equal(loadLandings(root).lands['12'], undefined)
})


function setWatchHead(root, head) {
  const file = join(resolvePaths(root).cache, 'state.json')
  const state = JSON.parse(readFileSync(file, 'utf8'))
  state.prs['12'].head = head
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`)
}

function newPullRequestHead(root, remote) {
  git(root, ['checkout', '-q', 'pr-branch'])
  writeFileSync(join(root, 'feature.txt'), `feature ${Date.now()}\n`)
  git(root, ['add', 'feature.txt'])
  git(root, ['commit', '-qm', 'pr follow-up'])
  const head = git(root, ['rev-parse', 'HEAD'])
  git(root, ['push', '-q', 'origin', `${head}:refs/pull/12/head`])
  git(root, ['checkout', '-q', 'main'])
  setWatchHead(root, head)
  return head
}

test('prepare re-preps a moved PR head instead of returning the stale landing', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  const first = prepareLanding({ root, number: 12, apply: true, gh: fake })
  const next = newPullRequestHead(root, remote)
  const nextFake = fakeGh({ pr: JSON.parse(prJson(next)) })
  const second = prepareLanding({ root, number: 12, apply: true, gh: nextFake })
  assert.equal(second.prHead, next)
  assert.notEqual(second.landingHead, first.landingHead)
  assert.equal(loadLandings(root).lands['12'].phase, 'prepared')
})

test('reviewed refuses a non-passed record, a dirty checkout and a record tree mismatch', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
  const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
  reviewRecord(root, tree, 'in-review')
  assert.throws(() => reviewedLanding({ root, number: 12, apply: true }), /not passed/)
  reviewRecord(root, tree)
  writeFileSync(join(prepared.worktree, 'dirty.txt'), 'dirty\n')
  assert.throws(() => reviewedLanding({ root, number: 12, apply: true }), /not clean/)
  rmSync(join(prepared.worktree, 'dirty.txt'))
  reviewRecord(root, 'f'.repeat(40))
  assert.throws(() => reviewedLanding({ root, number: 12, apply: true }), /does not match/)
})

test('merge records failed on a gh merge failure', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
  const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
  reviewRecord(root, tree)
  reviewedLanding({ root, number: 12, apply: true })
  assert.throws(() => mergeLanding({
    root,
    number: 12,
    apply: true,
    gh: fakeGh({ pr: JSON.parse(prJson(head)), onMerge: () => { throw new Error('merge refused') } }),
  }), /gh pr merge failed/)
  assert.equal(loadLandings(root).lands['12'].phase, 'failed')
})


test('merge refuses when origin/main moved after prepare', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
  const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
  reviewRecord(root, tree)
  reviewedLanding({ root, number: 12, apply: true })
  writeFileSync(join(root, 'README.md'), 'main moved after prepare\n')
  git(root, ['add', 'README.md'])
  git(root, ['commit', '-qm', 'main moved after prepare'])
  git(root, ['push', '-q', 'origin', 'main'])
  git(root, ['fetch', 'origin', 'main'])
  assert.throws(() => mergeLanding({ root, number: 12, apply: true, gh: fake }), /origin\/main moved/)
  assert.equal(loadLandings(root).lands['12'].phase, 'failed')
})

test('merge records failed when the PR head moved after reviewed', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  let merges = 0
  const fake = fakeGh({ pr: JSON.parse(prJson(head)), onMerge: () => { merges += 1 } })
  const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
  const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
  reviewRecord(root, tree)
  reviewedLanding({ root, number: 12, apply: true })
  newPullRequestHead(root, remote)
  assert.throws(() => mergeLanding({ root, number: 12, apply: true, gh: fake }), /head moved/)
  assert.equal(merges, 0)
  assert.equal(loadLandings(root).lands['12'].phase, 'failed')
})

test('merge names the author update for a fork when origin/main moved', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
  const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
  reviewRecord(root, tree)
  reviewedLanding({ root, number: 12, apply: true })
  advanceMain(root, 'main moved after prepare')
  let merges = 0
  const fork = fakeGh({
    pr: JSON.parse(prJson(head, 'main', { isCrossRepository: true })),
    onMerge: () => { merges += 1 },
  })
  assert.throws(() => mergeLanding({ root, number: 12, apply: true, gh: fork }), /the author must update the branch/)
  assert.equal(merges, 0)
  assert.equal(loadLandings(root).lands['12'].phase, 'failed')
})

test('merge records a head that no longer contains the recorded main', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
  const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
  reviewRecord(root, tree)
  reviewedLanding({ root, number: 12, apply: true })
  advanceMain(root, 'main moved before the synthetic entry')
  git(root, ['fetch', 'origin', 'main'])
  const lands = loadLandings(root)
  lands.lands['12'].preMergeMain = git(root, ['rev-parse', 'origin/main'])
  saveLandings(root, lands)
  let merges = 0
  const gh = fakeGh({ pr: JSON.parse(prJson(head)), onMerge: () => { merges += 1 } })
  assert.throws(() => mergeLanding({ root, number: 12, apply: true, gh }), /behind origin\/main; run sync 12/)
  assert.equal(merges, 0)
  assert.equal(loadLandings(root).lands['12'].phase, 'failed')
})

test('abandon clears a pre-merge landing without touching the watch entry', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
  assert.throws(() => reviewedLanding({ root, number: 12, apply: true }), /apply review record/)
  const result = abandonLanding({ root, number: 12, apply: true })
  assert.equal(result.abandoned, 12)
  assert.equal(loadLandings(root).lands['12'], undefined)
  assert.equal(existsSync(prepared.worktree), false)
  assert.ok(JSON.parse(readFileSync(join(resolvePaths(root).cache, 'state.json'), 'utf8')).prs['12'])
})


test('abandon refuses a post-merge landing and keeps its checkout', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
  const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
  reviewRecord(root, tree)
  reviewedLanding({ root, number: 12, apply: true })
  const onMerge = () => {
    git(root, ['push', '-q', 'origin', `${prepared.landingHead}:refs/heads/main`])
  }
  mergeLanding({ root, number: 12, apply: true, gh: fakeGh({ pr: JSON.parse(prJson(head)), onMerge }) })
  assert.throws(() => abandonLanding({ root, number: 12, apply: true }), /already merged|pre-merge|archive-pending/)
  assert.equal(loadLandings(root).lands['12'].phase, 'archive-pending')
  assert.equal(existsSync(prepared.worktree), true)
})

test('archive and push failures keep retryable phases', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
  const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
  reviewRecord(root, tree)
  reviewedLanding({ root, number: 12, apply: true })
  const onMerge = () => {
    git(root, ['push', '-q', 'origin', `${prepared.landingHead}:refs/heads/main`])
  }
  mergeLanding({ root, number: 12, apply: true, gh: fakeGh({ pr: JSON.parse(prJson(head)), onMerge }) })
  assert.throws(() => archiveLanding({ root, number: 12, apply: true }), /archive failed/)
  assert.equal(loadLandings(root).lands['12'].phase, 'archive-failed')
  renameSync(join(root, 'openspec/changes/widget'), join(root, 'openspec/changes/archive/2026-01-01-widget'))
  archiveLanding({ root, number: 12, apply: true })
  assert.equal(loadLandings(root).lands['12'].phase, 'archived')
  assert.throws(() => pushLanding({ root, number: 12, apply: true }), /push failed/)
  assert.equal(loadLandings(root).lands['12'].phase, 'push-pending')
  git(root, ['push', '-q', 'origin', 'main'])
  pushLanding({ root, number: 12, apply: true })
})


test('a diverged local main keeps the merged landing retryable without a second merge', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
  const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
  reviewRecord(root, tree)
  reviewedLanding({ root, number: 12, apply: true })
  writeFileSync(join(root, 'README.md'), 'local main diverged\n')
  git(root, ['add', 'README.md'])
  git(root, ['commit', '-qm', 'local main diverged'])
  let merges = 0
  const onMerge = () => {
    merges += 1
    git(root, ['push', '-q', 'origin', `${prepared.landingHead}:refs/heads/main`])
  }
  assert.throws(() => mergeLanding({
    root,
    number: 12,
    apply: true,
    gh: fakeGh({ pr: JSON.parse(prJson(head)), onMerge }),
  }), /fast-forward|not possible/)
  const entry = loadLandings(root).lands['12']
  assert.equal(entry.phase, 'archive-pending')
  assert.ok(entry.error)
  assert.throws(() => mergeLanding({
    root,
    number: 12,
    apply: true,
    gh: () => { throw new Error('gh must not be called') },
  }), /fast-forward|not possible/)
  assert.equal(merges, 1)
  assert.equal(loadLandings(root).lands['12'].phase, 'archive-pending')
})

test('a tree-mismatch landing rethrows without a second merge', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
  const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
  reviewRecord(root, tree)
  reviewedLanding({ root, number: 12, apply: true })
  assert.throws(() => mergeLanding({ root, number: 12, apply: true, gh: fake }), /tree|differs/)
  assert.throws(() => mergeLanding({
    root,
    number: 12,
    apply: true,
    gh: () => { throw new Error('gh must not be called') },
  }), /tree|differs/)
  assert.equal(loadLandings(root).lands['12'].phase, 'tree-mismatch')
})

test('merge verifies the merged tree and archive/push/finish complete the landing', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
  const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
  reviewRecord(root, tree)
  reviewedLanding({ root, number: 12, apply: true })
  const onMerge = () => {
    git(root, ['push', '-q', 'origin', `${prepared.landingHead}:refs/heads/main`])
  }
  const merged = mergeLanding({ root, number: 12, apply: true, gh: fakeGh({ pr: JSON.parse(prJson(head)), onMerge }) })
  assert.equal(merged.phase, 'archive-pending')
  assert.equal(merged.reviewedTree, tree)
  assert.equal(mergeLanding({ root, number: 12, apply: true, gh: () => { throw new Error('must not merge twice') } }).phase, 'archive-pending')
  assert.throws(() => archiveLanding({ root, number: 12, apply: true }), /still active/)
  renameSync(join(root, 'openspec/changes/widget'), join(root, 'openspec/changes/archive/2026-01-01-widget'))
  archiveLanding({ root, number: 12, apply: true })
  assert.throws(() => pushLanding({ root, number: 12, apply: true }), /not pushed/)
  git(root, ['push', '-q', 'origin', 'main'])
  const pushed = pushLanding({ root, number: 12, apply: true })
  assert.equal(pushed.phase, 'pushed')
  const manifest = finishLanding({ root, number: 12, apply: true })
  assert.equal(manifest.change, 'widget')
  assert.equal(existsSync(prepared.worktree), false)
  assert.equal(git(root, ['branch', '--list', 'pr-land/12']), '')
  assert.equal(loadLandings(root).lands['12'], undefined)
})

test('merge refuses a tree mismatch after the PR is merged', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
  const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
  reviewRecord(root, tree)
  reviewedLanding({ root, number: 12, apply: true })
  assert.throws(() => mergeLanding({ root, number: 12, apply: true, gh: fake }), /tree|differs/)
  assert.equal(loadLandings(root).lands['12'].phase, 'tree-mismatch')
})

test('archive and push refuse before the prior phase is complete', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  prepareLanding({ root, number: 12, apply: true, gh: fake })
  assert.throws(() => archiveLanding({ root, number: 12, apply: true }), /phase is prepared/)
  assert.throws(() => pushLanding({ root, number: 12, apply: true }), /phase is prepared/)
})

test('candidates lists a labeled, commented pull request without writing state', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const stateFile = join(resolvePaths(root).cache, 'state.json')
  const beforeState = readFileSync(stateFile, 'utf8')
  const fake = fakeGh({
    pr: JSON.parse(prJson(head)),
    list: [{ number: 12, labels: [{ name: LANDING_LABEL }] }],
  })
  const result = listLandingCandidates({ root, gh: fake })
  assert.equal(result.blocked, undefined)
  assert.deepEqual(result.candidates, [{
    number: 12,
    head,
    change: 'widget',
    base: 'main',
    behind: true,
    sameRepository: true,
    syncable: true,
  }])
  assert.deepEqual(result.refused, [])
  assert.equal(readFileSync(stateFile, 'utf8'), beforeState)
  assert.equal(existsSync(join(resolvePaths(root).cache, 'landings.json')), false)
})

test('candidates refuses a behind fork entry for author update', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const result = listLandingCandidates({
    root,
    gh: fakeGh({
      pr: JSON.parse(prJson(head, 'main', { isCrossRepository: true })),
      list: [{ number: 12, labels: [{ name: LANDING_LABEL }] }],
    }),
  })
  assert.deepEqual(result.candidates, [])
  assert.match(result.refused[0].reason, /author must update the branch/)
})

function advanceMain(root, line = 'main moved') {
  writeFileSync(join(root, 'README.md'), `${line}\n`)
  git(root, ['add', 'README.md'])
  git(root, ['commit', '-qm', line])
  git(root, ['push', '-q', 'origin', 'main'])
}

function syncGh(pr, { newHead = 'e'.repeat(40), failApi = false, pollHead } = {}) {
  let updated = false
  const calls = []
  const runner = (args) => {
    calls.push(args)
    if (args[0] === 'api' && args[1] === 'user') return LOGIN
    if (args[0] === 'api') {
      if (failApi) throw new Error('update rejected')
      updated = true
      return '{}'
    }
    if (args[0] === 'pr' && args[1] === 'view' && args[4] === 'headRefOid') {
      return JSON.stringify({ headRefOid: pollHead ?? (updated ? newHead : pr.headRefOid) })
    }
    if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify(pr)
    throw new Error(`unexpected gh ${args.join(' ')}`)
  }
  runner.calls = calls
  return runner
}

test('sync is a dry run by default and reports the behind head', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  advanceMain(root)
  const gh = syncGh(JSON.parse(prJson(head)))
  const result = syncLanding({ root, number: 12, gh })
  assert.equal(result.dryRun, true)
  assert.equal(result.head, head)
  assert.equal(result.branch, 'pr-branch')
  assert.equal(gh.calls.some((args) => args[0] === 'api' && args[1] !== 'user'), false)
  assert.equal(existsSync(join(resolvePaths(root).cache, 'landings.json')), false)
})

test('sync updates a behind same-repository branch and records the heads', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  advanceMain(root)
  const newHead = 'e'.repeat(40)
  const gh = syncGh(JSON.parse(prJson(head)), { newHead })
  const result = syncLanding({ root, number: 12, apply: true, gh, pollAttempts: 2, pollIntervalMs: 0 })
  assert.equal(result.previousHead, head)
  assert.equal(result.newHead, newHead)
  const updateCall = gh.calls.find((args) => args[0] === 'api' && args[1] === '--method')
  assert.equal(updateCall[2], 'PUT')
  assert.match(updateCall[3], /\/pulls\/12\/update-branch$/)
  assert.equal(updateCall[5], `expected_head_sha=${head}`)
  const landings = loadLandings(root)
  assert.equal(landings.lands['12'], undefined)
  assert.deepEqual(landings.syncs['12'], {
    previousHead: head,
    newHead,
    at: landings.syncs['12'].at,
  })
})

test('sync refuses a fork branch, a missing label, a conflict and an open landing', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  advanceMain(root)
  const landingsFile = join(resolvePaths(root).cache, 'landings.json')
  assert.throws(() => syncLanding({
    root,
    number: 12,
    gh: syncGh(JSON.parse(prJson(head, 'main', { isCrossRepository: true }))),
  }), /cross-repository/)
  assert.equal(existsSync(landingsFile), false)
  assert.throws(() => syncLanding({
    root,
    number: 12,
    gh: syncGh(JSON.parse(prJson(head, 'main', { labels: [] }))),
  }), /no mergeable label/)
  assert.equal(existsSync(landingsFile), false)
  assert.throws(() => syncLanding({
    root,
    number: 12,
    gh: syncGh(JSON.parse(prJson(head, 'main', { mergeable: 'CONFLICTING' }))),
  }), /not mergeable/)
  assert.equal(existsSync(landingsFile), false)
  saveLandings(root, { schemaVersion: 1, lands: { 12: { phase: 'prepared' } }, syncs: {} })
  const before = readFileSync(landingsFile, 'utf8')
  assert.throws(() => syncLanding({ root, number: 12, gh: syncGh(JSON.parse(prJson(head))) }), /already landing/)
  assert.equal(readFileSync(landingsFile, 'utf8'), before)
})

test('sync refuses a head that already contains main', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  assert.throws(() => syncLanding({ root, number: 12, gh: syncGh(JSON.parse(prJson(head))) }), /already contains origin\/main/)
})

test('candidates reports an up-to-date same-repository candidate as not syncable', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const result = listLandingCandidates({
    root,
    gh: fakeGh({
      pr: JSON.parse(prJson(head, 'main', { mergeStateStatus: 'CLEAN' })),
      list: [{ number: 12, labels: [{ name: LANDING_LABEL }] }],
    }),
  })
  assert.deepEqual(result.candidates, [{
    number: 12,
    head,
    change: 'widget',
    base: 'main',
    behind: false,
    sameRepository: true,
    syncable: false,
  }])
})

test('plan names the author update for a behind fork head', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  advanceMain(root)
  assert.throws(() => planLanding({
    root,
    number: 12,
    gh: fakeGh({ pr: JSON.parse(prJson(head, 'main', { isCrossRepository: true })) }),
  }), /author must update the branch/)
})

test('sync refuses a stale head and an update-branch rejection', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  advanceMain(root)
  const moved = JSON.parse(prJson(head))
  const movedHead = newPullRequestHead(root, remote)
  assert.throws(() => syncLanding({ root, number: 12, gh: syncGh(moved) }), /moved from .* to .*; retry/)
  assert.throws(() => syncLanding({
    root,
    number: 12,
    apply: true,
    gh: syncGh(JSON.parse(prJson(movedHead)), { failApi: true }),
  }), /update-branch failed/)
})

test('sync reports a head that never changes', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  advanceMain(root)
  const pr = JSON.parse(prJson(head))
  assert.throws(() => syncLanding({
    root,
    number: 12,
    apply: true,
    gh: syncGh(pr, { pollHead: head }),
    pollAttempts: 2,
    pollIntervalMs: 0,
  }), /request for PR #12 was accepted but the head did not change within/)
  assert.equal(loadLandings(root).syncs, undefined)
})

test('candidates refuses an unlabeled pull request and a mismatched watch entry', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const pr = JSON.parse(prJson(head))
  const unlabeled = listLandingCandidates({
    root,
    gh: fakeGh({ pr, list: [{ number: 12, labels: [{ name: 'other' }] }] }),
  })
  assert.deepEqual(unlabeled.candidates, [])
  assert.match(unlabeled.refused[0].reason, /no mergeable label/)

  const state = JSON.parse(readFileSync(join(resolvePaths(root).cache, 'state.json'), 'utf8'))
  state.prs['12'].status = 'prepared'
  saveState(root, state)
  const stale = listLandingCandidates({
    root,
    gh: fakeGh({ pr, list: [{ number: 12, labels: [{ name: LANDING_LABEL }] }] }),
  })
  assert.equal(stale.candidates.length, 0)
  assert.match(stale.refused[0].reason, /not commented/)
})

test('candidates reports a dirty main worktree once and lists nothing', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  writeFileSync(join(root, 'untracked.txt'), 'dirty\n')
  const result = listLandingCandidates({
    root,
    gh: fakeGh({ pr: JSON.parse(prJson(head)), list: [{ number: 12, labels: [{ name: LANDING_LABEL }] }] }),
  })
  assert.deepEqual(result.candidates, [])
  assert.match(result.blocked, /clean main worktree/)
})

test('candidates omits a review-failed landing and another unfinished landing', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({
    pr: JSON.parse(prJson(head)),
    list: [{ number: 12, labels: [{ name: LANDING_LABEL }] }],
  })
  saveLandings(root, { schemaVersion: 1, lands: { 12: { number: 12, phase: REVIEW_FAILED_PHASE, error: 'reviewer gone' } } })
  const own = listLandingCandidates({ root, gh: fake })
  assert.deepEqual(own.candidates, [])
  assert.match(own.refused[0].reason, /review-failed: reviewer gone/)

  saveLandings(root, { schemaVersion: 1, lands: { 2: { number: 2, phase: 'prepared' } } })
  const other = listLandingCandidates({ root, gh: fake })
  assert.deepEqual(other.candidates, [])
  assert.match(other.refused[0].reason, /already landing in phase prepared/)
})

test('state --fail records review-failed, keeps the checkout and abandon clears it', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const worktree = join(resolvePaths(root).worktrees, 'pr-12')
  mkdirSync(worktree, { recursive: true })
  saveLandings(root, {
    schemaVersion: 1,
    lands: {
      12: {
        number: 12,
        phase: 'prepared',
        worktree,
        landingBranch: 'pr-land/12',
        error: null,
        merged: false,
        mergedHead: null,
      },
    },
  })
  const recorded = failLanding({ root, number: 12, error: 'reviewer unavailable', apply: true })
  assert.equal(recorded.phase, REVIEW_FAILED_PHASE)
  assert.equal(recorded.error, 'reviewer unavailable')
  const again = failLanding({ root, number: 12, error: 'still unavailable', apply: true })
  assert.equal(again.phase, REVIEW_FAILED_PHASE)
  assert.equal(again.error, 'still unavailable')
  assert.equal(loadLandings(root).lands['12'].worktree, worktree)
  assert.equal(existsSync(worktree), true)
  assert.deepEqual(abandonLanding({ root, number: 12, apply: true }), { abandoned: 12 })
  assert.equal(loadLandings(root).lands['12'], undefined)
  const readmitted = listLandingCandidates({
    root,
    gh: fakeGh({
      pr: JSON.parse(prJson(head)),
      list: [{ number: 12, labels: [{ name: LANDING_LABEL }] }],
    }),
  })
  assert.equal(readmitted.candidates.length, 1)
  assert.equal(readmitted.candidates[0].number, 12)
})

test('state --fail refuses a landing past the final review', () => {
  const { root, remote } = makeRepo()
  addPullRequest(root, remote)
  saveLandings(root, { schemaVersion: 1, lands: { 12: { number: 12, phase: 'reviewed' } } })
  assert.throws(() => failLanding({ root, number: 12, error: 'x', apply: true }), /only a prepared landing/)
})



function cleanup(...directories) {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
}

test('a local landing lock refuses every contributor landing command', () => {
  const { root, remote } = makeRepo()
  try {
    const { head } = addPullRequest(root, remote)
    const fake = fakeGh({ pr: JSON.parse(prJson(head)), list: [{ number: 12, labels: [{ name: LANDING_LABEL }] }] })
    acquireLock({ root, session: 'local-owner', token: 'local-token', pr: 99 })
    assert.throws(() => assertLandingLockFree(root), /landing lock belongs to another session/)
    assert.throws(
      () => planLanding({ root, number: 12, gh: fake }),
      /landing lock belongs to another session/,
    )
    assert.throws(
      () => planLanding({ root, number: 12, gh: fake, session: 'local-owner', token: 'wrong' }),
      /landing lock token does not match/,
    )
    saveLocalState(root, {
      schemaVersion: 1,
      prs: {
        99: {
          number: 99, change: 'widget', branch: 'local-branch', head: 'a'.repeat(40),
          tree: 'c'.repeat(40), record: 'apply-local', ownerSession: 'local-owner', phase: 'published',
        },
      },
    })
    assert.throws(
      () => planLanding({ root, number: 12, gh: fake, session: 'local-owner', token: 'local-token' }),
      /owns local PR #99/,
    )
    assert.throws(
      () => assertLandingLockFree(root, { session: 'local-owner', token: 'local-token' }),
      /owns local PR #99/,
    )
    assert.throws(() => prepareLanding({ root, number: 12, gh: fake, apply: true }), /landing lock belongs to another session/)
    assert.throws(() => syncLanding({ root, number: 12, gh: fake }), /landing lock belongs to another session/)
    for (const run of [
      () => reviewedLanding({ root, number: 12, apply: true }),
      () => mergeLanding({ root, number: 12, gh: fake, apply: true }),
      () => archiveLanding({ root, number: 12, apply: true }),
      () => pushLanding({ root, number: 12, apply: true }),
      () => finishLanding({ root, number: 12, apply: true }),
      () => abandonLanding({ root, number: 12, apply: true }),
    ]) {
      assert.throws(run, /landing lock belongs to another session/)
    }
    const blocked = listLandingCandidates({ root, gh: fake })
    assert.deepEqual(blocked.candidates, [])
    assert.match(blocked.blocked, /landing lock belongs to another session/)
    forceRelease({ root, reason: 'test' })
    assert.equal(planLanding({ root, number: 12, gh: fake }).change, 'widget')
  } finally {
    cleanup(root, remote)
  }
})

test('contributor landing excludes an owner-managed local pull request', () => {
  const { root, remote } = makeRepo()
  try {
    const { head } = addPullRequest(root, remote)
    saveLocalState(root, {
      schemaVersion: 1,
      prs: {
        12: {
          number: 12,
          change: 'widget',
          branch: 'openspec/apply/local-widget-12345678',
          head,
          tree: 'f'.repeat(40),
          record: 'local#widget',
          ownerSession: 'owner-1',
          phase: 'published',
        },
      },
    })
    const fake = fakeGh({ pr: JSON.parse(prJson(head)), list: [{ number: 12, labels: [{ name: LANDING_LABEL }] }] })
    assert.throws(() => planLanding({ root, number: 12, gh: fake }), /owner-managed locally/)
    assert.throws(() => prepareLanding({ root, number: 12, gh: fake, apply: true }), /owner-managed locally/)
    assert.throws(() => syncLanding({ root, number: 12, gh: fake }), /owner-managed locally/)
    const result = listLandingCandidates({ root, gh: fake })
    assert.deepEqual(result.candidates, [])
    assert.match(result.refused[0].reason, /owner-managed locally/)
    assert.doesNotThrow(() => assertNotLocal(root, 13))
  } finally {
    cleanup(root, remote)
  }
})

test('a corrupt local owner state refuses contributor landing', () => {
  const { root, remote } = makeRepo()
  try {
    const { head } = addPullRequest(root, remote)
    const file = join(resolvePaths(root).cache, 'local-prs.json')
    writeFileSync(file, '{not json')
    const fake = fakeGh({ pr: JSON.parse(prJson(head)), list: [{ number: 12, labels: [{ name: LANDING_LABEL }] }] })
    assert.throws(() => planLanding({ root, number: 12, gh: fake }), /corrupt/)
    const result = listLandingCandidates({ root, gh: fake })
    assert.deepEqual(result.candidates, [])
    assert.match(result.refused[0].reason, /corrupt/)
  } finally {
    cleanup(root, remote)
  }
})

test('a new landing is refused while local main leads origin/main', () => {
  const { root, remote } = makeRepo()
  try {
    const { head } = addPullRequest(root, remote)
    writeFileSync(join(root, 'local-only.txt'), 'local\n')
    git(root, ['add', 'local-only.txt'])
    git(root, ['commit', '-qm', 'local main leads'])
    const fake = fakeGh({ pr: JSON.parse(prJson(head)), list: [{ number: 12, labels: [{ name: LANDING_LABEL }] }] })
    assert.throws(() => planLanding({ root, number: 12, gh: fake }), /local main leads origin\/main.*push-landed.*--offline/)
    assert.throws(() => prepareLanding({ root, number: 12, gh: fake, apply: true }), /push-landed/)
    assert.throws(() => syncLanding({ root, number: 12, gh: fake }), /push-landed/)
    const blocked = listLandingCandidates({ root, gh: fake })
    assert.deepEqual(blocked.candidates, [])
    assert.match(blocked.blocked, /local main leads origin\/main/)
    git(root, ['push', '-q', 'origin', 'main'])
    assert.throws(() => planLanding({ root, number: 12, gh: fake }), /behind origin\/main; run sync 12/)
  } finally {
    cleanup(root, remote)
  }
})


test('a contributor landing may hold the landing lock for its own run', () => {
  const { root, remote } = makeRepo()
  try {
    const { head } = addPullRequest(root, remote)
    const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
    acquireLock({ root, session: 'watch-1', token: 'watch-token', pr: 12 })
    const prepared = prepareLanding({ root, number: 12, gh: fake, apply: true, session: 'watch-1' })
    assert.equal(prepared.phase, 'prepared')
    const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
    reviewRecord(root, tree)
    reviewedLanding({ root, number: 12, apply: true, session: 'watch-1' })
    const onMerge = () => {
      git(root, ['push', '-q', 'origin', `${prepared.landingHead}:refs/heads/main`])
    }
    mergeLanding({ root, number: 12, apply: true, session: 'watch-1', gh: fakeGh({ pr: JSON.parse(prJson(head)), onMerge }) })
    renameSync(join(root, 'openspec/changes/widget'), join(root, 'openspec/changes/archive/2026-01-01-widget'))
    archiveLanding({ root, number: 12, apply: true, session: 'watch-1' })
    git(root, ['push', '-q', 'origin', 'main'])
    pushLanding({ root, number: 12, apply: true, session: 'watch-1' })
    const manifest = finishLanding({ root, number: 12, apply: true, session: 'watch-1' })
    assert.equal(manifest.change, 'widget')
    assert.equal(loadLandings(root).lands['12'], undefined)
    assert.equal(existsSync(join(resolvePaths(root).landingLock)), false)
  } finally {
    cleanup(root, remote)
  }
})

test('a ready contributor landing merges, archives, pushes and finishes in one run', () => {
  const { root, remote } = makeRepo()
  try {
    const { head } = addPullRequest(root, remote)
    const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
    const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
    const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
    reviewRecord(root, tree)
    reviewedLanding({ root, number: 12, apply: true })
    const onMerge = () => {
      git(root, ['push', '-q', 'origin', `${prepared.landingHead}:refs/heads/main`])
    }
    const merged = mergeLanding({ root, number: 12, apply: true, gh: fakeGh({ pr: JSON.parse(prJson(head)), onMerge }) })
    assert.equal(merged.phase, 'archive-pending')
    renameSync(join(root, 'openspec/changes/widget'), join(root, 'openspec/changes/archive/2026-01-01-widget'))
    const archived = archiveLanding({ root, number: 12, apply: true })
    assert.equal(archived.phase, 'archived')
    git(root, ['push', '-q', 'origin', 'main'])
    const pushed = pushLanding({ root, number: 12, apply: true })
    assert.equal(pushed.phase, 'pushed')
    const manifest = finishLanding({ root, number: 12, apply: true })
    assert.equal(manifest.change, 'widget')
    assert.equal(loadLandings(root).lands['12'], undefined)
    assert.equal(existsSync(prepared.worktree), false)
    assert.equal(loadState(root).prs['12'], undefined)
  } finally {
    cleanup(root, remote)
  }
})

function addBatchPullRequest(root, remote, number) {
  const branch = `pr-branch-${number}`
  const file = `feature-${number}.txt`
  git(root, ['checkout', '-q', '-b', branch])
  writeFileSync(join(root, file), `feature ${number}\n`)
  git(root, ['add', file])
  git(root, ['commit', '-qm', `pr ${number} change`])
  const head = git(root, ['rev-parse', 'HEAD'])
  git(root, ['push', '-q', 'origin', `HEAD:refs/pull/${number}/head`])
  git(root, ['checkout', '-q', 'main'])
  return head
}

function batchRows(entries) {
  return entries.map(({ number, head, crossRepository = false, mergeStateStatus = 'BEHIND' }) => ({
    number,
    headRefOid: head,
    baseRefName: 'main',
    isDraft: false,
    isCrossRepository: crossRepository,
    labels: [{ name: LANDING_LABEL }],
    mergeStateStatus,
    files: [{ path: 'openspec/changes/widget/proposal.md' }],
  }))
}

function batchGh(rows, { failNumbers = [], newHead = 'e'.repeat(40), stuckHeads = false, viewHead } = {}) {
  const calls = []
  const updated = new Set()
  const runner = (args) => {
    calls.push(args)
    if (args[0] === 'pr' && args[1] === 'list') {
      const limit = Number(args[args.indexOf('--limit') + 1])
      return JSON.stringify(rows.slice(0, limit))
    }
    if (args[0] === 'api' && args[1] === 'user') return LOGIN
    if (args[0] === 'api' && args[1] === '--method') {
      const match = /pulls\/(\d+)\/update-branch/.exec(String(args[3]))
      const number = Number(match[1])
      if (failNumbers.includes(number)) throw new Error(`update rejected for ${number}`)
      updated.add(number)
      return '{}'
    }
    if (args[0] === 'pr' && args[1] === 'view') {
      const number = Number(args[2])
      const row = rows.find((entry) => Number(entry.number) === number)
      const head = viewHead === undefined ? row.headRefOid : viewHead
      if (args.includes('headRefOid')) {
        return JSON.stringify({ headRefOid: stuckHeads ? head : (updated.has(number) ? newHead : head) })
      }
      return JSON.stringify({
        number,
        state: 'OPEN',
        isDraft: false,
        headRefOid: head,
        baseRefOid: 'b'.repeat(40),
        baseRefName: 'main',
        statusCheckRollup: [{ conclusion: 'SUCCESS' }],
        files: [{ path: 'openspec/changes/widget/proposal.md' }],
        labels: row.labels,
        isCrossRepository: row.isCrossRepository === true,
        mergeable: 'MERGEABLE',
        mergeStateStatus: row.mergeStateStatus,
      })
    }
    throw new Error(`unexpected gh ${args.join(' ')}`)
  }
  runner.calls = calls
  return runner
}

test('sync-batch updates every eligible branch and records the new heads', () => {
  const { root, remote } = makeRepo()
  const heads = {
    12: addBatchPullRequest(root, remote, 12),
    13: addBatchPullRequest(root, remote, 13),
    14: addBatchPullRequest(root, remote, 14),
  }
  advanceMain(root)
  const rows = batchRows([
    { number: 12, head: heads[12] },
    { number: 13, head: heads[13] },
    { number: 14, head: heads[14] },
  ])
  const newHead = 'e'.repeat(40)
  const gh = batchGh(rows, { newHead })
  const dry = syncBatch({ root, gh })
  assert.equal(dry.locked, false)
  assert.equal(dry.changed, false)
  assert.deepEqual(dry.results.map((entry) => entry.status), ['planned', 'planned', 'planned'])
  assert.equal(dry.results[0].previousHead, heads[12])
  assert.equal(dry.results[0].newHead, null)
  assert.equal(existsSync(join(resolvePaths(root).cache, 'landings.json')), false)
  const applied = syncBatch({ root, gh, apply: true, pollAttempts: 1, pollIntervalMs: 0 })
  assert.equal(applied.changed, true)
  assert.equal(applied.updated, 3)
  assert.deepEqual(applied.results.map((entry) => entry.number), [12, 13, 14])
  assert.equal(applied.results[0].previousHead, heads[12])
  assert.equal(applied.results[0].newHead, newHead)
  const landings = loadLandings(root)
  assert.equal(landings.lands['12'], undefined)
  assert.deepEqual(Object.keys(landings.syncs).sort(), ['12', '13', '14'])
  assert.equal(gh.calls.some((args) => args[0] === 'pr' && args[1] === 'comment'), false)
  assert.equal(gh.calls.some((args) => args[0] === 'label'), false)
  assert.equal(gh.calls.some((args) => args.includes('--force') || args.includes('--admin')), false)
})

test('sync-batch reports a refused update, a fork and a conflict and continues', () => {
  const { root, remote } = makeRepo()
  const heads = {
    12: addBatchPullRequest(root, remote, 12),
    13: addBatchPullRequest(root, remote, 13),
    14: addBatchPullRequest(root, remote, 14),
    15: addBatchPullRequest(root, remote, 15),
  }
  advanceMain(root)
  const rows = batchRows([
    { number: 12, head: heads[12] },
    { number: 13, head: heads[13] },
    { number: 14, head: heads[14], crossRepository: true },
    { number: 16, head: '9'.repeat(40), mergeStateStatus: 'DIRTY' },
    { number: 15, head: heads[15] },
  ])
  const gh = batchGh(rows, { failNumbers: [13], newHead: 'f'.repeat(40) })
  const result = syncBatch({ root, gh, apply: true, pollAttempts: 1, pollIntervalMs: 0 })
  assert.equal(result.updated, 2)
  assert.deepEqual(
    result.results.map((entry) => `${entry.number}:${entry.status}`),
    ['12:synced', '13:refused', '14:refused', '16:refused', '15:synced'],
  )
  assert.match(result.results[1].reason, /update rejected for 13/)
  assert.match(result.results[2].reason, /cross-repository/)
  assert.match(result.results[3].reason, /merge state is DIRTY/)
  assert.equal(result.results[1].previousHead, heads[13])
  assert.equal(loadLandings(root).lands['12'], undefined)
  assert.deepEqual(Object.keys(loadLandings(root).syncs).sort(), ['12', '15'])
})

test('sync-batch refuses a landing lock even for the same session', () => {
  const { root, remote } = makeRepo()
  const heads = { 12: addBatchPullRequest(root, remote, 12) }
  advanceMain(root)
  const rows = batchRows([{ number: 12, head: heads[12] }])
  const gh = batchGh(rows)
  acquireLock({ root, session: 'local-owner', token: 'local-token', pr: 99 })
  const result = syncBatch({ root, gh, apply: true, session: 'local-owner', token: 'local-token' })
  assert.equal(result.locked, true)
  assert.equal(result.apply, true)
  assert.deepEqual(result.results, [])
  assert.equal(existsSync(join(resolvePaths(root).cache, 'landings.json')), false)
})

test('sync-batch applies at most the configured number of updates', () => {
  const { root, remote } = makeRepo()
  const heads = {
    12: addBatchPullRequest(root, remote, 12),
    13: addBatchPullRequest(root, remote, 13),
  }
  advanceMain(root)
  const rows = batchRows([
    { number: 12, head: heads[12] },
    { number: 13, head: heads[13] },
  ])
  const gh = batchGh(rows, { newHead: 'd'.repeat(40) })
  const result = syncBatch({ root, gh, apply: true, limit: 1, pollAttempts: 1, pollIntervalMs: 0 })
  assert.equal(result.updated, 1)
  assert.equal(result.changed, true)
  assert.deepEqual(result.results.map((entry) => entry.number), [12])
  assert.deepEqual(Object.keys(loadLandings(root).syncs), ['12'])
})

test('sync-batch argument parsing rejects a number and command options', () => {
  const options = parseArgs(['sync-batch', '--apply'])
  assert.equal(options.command, 'sync-batch')
  assert.equal(options.apply, true)
  assert.throws(() => parseArgs(['sync-batch', '12']), /no positional/)
  assert.throws(() => parseArgs(['sync-batch', '--commit', 'abc']), /no --commit/)
  assert.equal(parseArgs(['sync-batch']).apply, false)
})

test('candidates reads the full open list and evaluates a labeled tail', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const rows = []
  for (let number = 1; number <= 999; number += 1) rows.push({ number, labels: [] })
  rows.push({ number: 12, labels: [{ name: LANDING_LABEL }] })
  const limits = []
  const fake = (args) => {
    if (args[0] === 'pr' && args[1] === 'list') {
      const limit = Number(args[args.indexOf('--limit') + 1])
      limits.push(limit)
      return JSON.stringify(rows.slice(0, limit))
    }
    if (args[0] === 'pr' && args[1] === 'view') return prJson(head)
    if (args[0] === 'api') return LOGIN
    throw new Error(`unexpected gh ${args.join(' ')}`)
  }
  const result = listLandingCandidates({ root, gh: fake })
  assert.deepEqual(result.candidates.map((candidate) => candidate.number), [12])
  assert.deepEqual(limits, [1000])
})

test('sync-batch reports an empty and an all-refused batch without stopping', () => {
  const { root, remote } = makeRepo()
  const empty = syncBatch({ root, gh: batchGh([]) })
  assert.equal(empty.changed, false)
  assert.deepEqual(empty.results, [])
  const head = addBatchPullRequest(root, remote, 12)
  advanceMain(root)
  const refused = syncBatch({
    root,
    gh: batchGh(batchRows([{ number: 12, head }]), { failNumbers: [12] }),
    apply: true,
    pollAttempts: 1,
    pollIntervalMs: 0,
  })
  assert.equal(refused.changed, false)
  assert.equal(refused.updated, 0)
  assert.deepEqual(refused.results.map((entry) => entry.status), ['refused'])
})

test('sync-batch applies the default 20-update limit and reports the remainder', () => {
  const { root, remote } = makeRepo()
  const entries = []
  for (let number = 100; number < 121; number += 1) {
    entries.push({ number, head: addBatchPullRequest(root, remote, number) })
  }
  advanceMain(root)
  const rows = batchRows(entries)
  const gh = batchGh(rows, { newHead: 'c'.repeat(40) })
  const result = syncBatch({ root, gh, apply: true, pollAttempts: 1, pollIntervalMs: 0 })
  assert.equal(result.updated, 20)
  assert.equal(result.eligible, 21)
  assert.equal(result.remaining, 1)
  assert.equal(result.results.length, 20)
  assert.equal(Object.keys(loadLandings(root).syncs).length, 20)
})

test('sync-batch reports a head that never changes and continues', () => {
  const { root, remote } = makeRepo()
  const heads = {
    12: addBatchPullRequest(root, remote, 12),
    13: addBatchPullRequest(root, remote, 13),
  }
  advanceMain(root)
  const rows = batchRows([
    { number: 12, head: heads[12] },
    { number: 13, head: heads[13] },
  ])
  const result = syncBatch({
    root,
    gh: batchGh(rows, { stuckHeads: true }),
    apply: true,
    pollAttempts: 1,
    pollIntervalMs: 0,
  })
  assert.equal(result.updated, 0)
  assert.equal(result.changed, false)
  assert.deepEqual(result.results.map((entry) => entry.status), ['refused', 'refused'])
  assert.match(result.results[0].reason, /did not change within 1 polls/)
  assert.equal(result.results[0].previousHead, heads[12])
})

test('sync-batch skips an up-to-date branch and reports the previous head', () => {
  const { root, remote } = makeRepo()
  advanceMain(root)
  const head = addBatchPullRequest(root, remote, 12)
  const rows = batchRows([{ number: 12, head }])
  const result = syncBatch({
    root,
    gh: batchGh(rows),
    apply: true,
    pollAttempts: 1,
    pollIntervalMs: 0,
  })
  assert.equal(result.changed, false)
  assert.deepEqual(result.results.map((entry) => `${entry.number}:${entry.status}`), ['12:skipped'])
  assert.match(result.results[0].reason, /already contains origin\/main/)
  assert.equal(result.results[0].previousHead, head)
})

test('sync-batch reports the head it synced when the head moved after the list', () => {
  const { root, remote } = makeRepo()
  const head = addBatchPullRequest(root, remote, 12)
  advanceMain(root)
  const listHead = 'a'.repeat(40)
  const rows = batchRows([{ number: 12, head: listHead }])
  const gh = batchGh(rows, { viewHead: head, newHead: 'b'.repeat(40) })
  const dry = syncBatch({ root, gh })
  assert.equal(dry.results[0].previousHead, head)
  const applied = syncBatch({ root, gh, apply: true, pollAttempts: 1, pollIntervalMs: 0 })
  assert.equal(applied.results[0].previousHead, head)
  assert.equal(applied.results[0].newHead, 'b'.repeat(40))
})

test('sync-batch counts only planned syncs against the dry-run limit', () => {
  const { root, remote } = makeRepo()
  const head = addBatchPullRequest(root, remote, 21)
  advanceMain(root)
  const rows = []
  for (let number = 1; number <= 20; number += 1) {
    rows.push(batchRows([{ number, head: 'a'.repeat(40), crossRepository: true }])[0])
  }
  rows.push(batchRows([{ number: 21, head }])[0])
  const result = syncBatch({ root, gh: batchGh(rows) })
  assert.equal(result.results.length, 21)
  assert.equal(result.results.at(-1).status, 'planned')
  assert.equal(result.results.at(-1).number, 21)
  assert.equal(result.remaining, 0)
})

test('sync-batch reads the open list without change paths and inspects each labeled row', () => {
  const { root, remote } = makeRepo()
  try {
    const head = addBatchPullRequest(root, remote, 12)
    advanceMain(root)
    const gh = batchGh(batchRows([{ number: 12, head }]))
    const result = syncBatch({ root, gh, apply: true, pollAttempts: 1, pollIntervalMs: 0, retryDelayMs: 0 })
    const list = gh.calls.find((args) => args[0] === 'pr' && args[1] === 'list')
    const fields = list[list.indexOf('--json') + 1]
    assert.equal(fields.split(',').includes('files'), false)
    assert.equal(fields.split(',').includes('mergeStateStatus'), false)
    assert.equal(fields.split(',').includes('labels'), true)
    assert.deepEqual(
      gh.calls.find((args) => args[0] === 'pr' && args[1] === 'view' && args.includes('files')),
      ['pr', 'view', '12', '--json', 'files'],
    )
    assert.equal(result.changed, true)
    assert.equal(result.eligible, 1)
  } finally {
    cleanup(root, remote)
  }
})

test('sync-batch leaves out a row that changes two active changes', () => {
  const { root, remote } = makeRepo()
  try {
    const heads = {
      12: addBatchPullRequest(root, remote, 12),
      13: addBatchPullRequest(root, remote, 13),
    }
    advanceMain(root)
    const base = batchGh(batchRows([
      { number: 12, head: heads[12] },
      { number: 13, head: heads[13] },
    ]))
    const gh = (args) => {
      if (args[0] === 'pr' && args[1] === 'view' && args[2] === '13' && args.includes('files') && !args.includes('headRefOid')) {
        return JSON.stringify({ files: [{ path: 'openspec/changes/widget/proposal.md' }, { path: 'openspec/changes/other/proposal.md' }] })
      }
      return base(args)
    }
    const result = syncBatch({ root, gh, apply: true, pollAttempts: 1, pollIntervalMs: 0, retryDelayMs: 0 })
    assert.equal(result.eligible, 1)
    assert.deepEqual(result.results.map((entry) => `${entry.number}:${entry.status}`), ['12:synced'])
    assert.equal(base.calls.some((args) => args[0] === 'api' && args[1] === '--method' && String(args[3]).includes('13')), false)
  } finally {
    cleanup(root, remote)
  }
})

test('sync-batch retries the open list once after a transient gateway error', () => {
  const { root, remote } = makeRepo()
  try {
    const head = addBatchPullRequest(root, remote, 12)
    advanceMain(root)
    const base = batchGh(batchRows([{ number: 12, head }]))
    let lists = 0
    const gh = (args) => {
      if (args[0] === 'pr' && args[1] === 'list') {
        lists += 1
        if (lists === 1) throw new Error('gh pr list failed: HTTP 504: 504 Gateway Timeout (https://api.github.com/graphql)')
      }
      return base(args)
    }
    const result = syncBatch({ root, gh, apply: true, pollAttempts: 1, pollIntervalMs: 0, retryDelayMs: 0 })
    assert.equal(lists, 2)
    assert.equal(result.changed, true)
    assert.deepEqual(result.results.map((entry) => `${entry.number}:${entry.status}`), ['12:synced'])
  } finally {
    cleanup(root, remote)
  }
})

test('sync-batch reports an inspection refusal without counting it in the remainder', () => {
  const { root, remote } = makeRepo()
  try {
    const heads = {
      12: addBatchPullRequest(root, remote, 12),
      13: addBatchPullRequest(root, remote, 13),
      14: addBatchPullRequest(root, remote, 14),
    }
    advanceMain(root)
    const base = batchGh(batchRows([
      { number: 12, head: heads[12] },
      { number: 13, head: heads[13] },
      { number: 14, head: heads[14] },
    ]))
    let views = 0
    const gh = (args) => {
      if (args[0] === 'pr' && args[1] === 'view' && args[2] === '12' && args.includes('files') && !args.includes('headRefOid')) {
        views += 1
        throw new Error('gh pr view 12 failed: HTTP 502: 502 Bad Gateway')
      }
      return base(args)
    }
    const result = syncBatch({ root, gh, apply: true, limit: 1, pollAttempts: 1, pollIntervalMs: 0, retryDelayMs: 0 })
    assert.equal(views, 2)
    assert.equal(result.eligible, 2)
    assert.equal(result.updated, 1)
    assert.equal(result.remaining, 1)
    assert.deepEqual(result.results.map((entry) => `${entry.number}:${entry.status}`), ['12:refused', '13:synced'])
    assert.match(result.results[0].reason, /the changed paths of PR #12 could not be read: .*HTTP 502/)
  } finally {
    cleanup(root, remote)
  }
})

test('sync-batch does not retry the update-branch request', () => {
  const { root, remote } = makeRepo()
  try {
    const head = addBatchPullRequest(root, remote, 12)
    advanceMain(root)
    const base = batchGh(batchRows([{ number: 12, head }]))
    let updates = 0
    const gh = (args) => {
      if (args[0] === 'api' && args[1] === '--method') {
        updates += 1
        throw new Error('update-branch rejected: HTTP 502: 502 Bad Gateway')
      }
      return base(args)
    }
    const result = syncBatch({ root, gh, apply: true, pollAttempts: 1, pollIntervalMs: 0, retryDelayMs: 0 })
    assert.equal(updates, 1)
    assert.equal(result.changed, false)
    assert.deepEqual(result.results.map((entry) => `${entry.number}:${entry.status}`), ['12:refused'])
    assert.match(result.results[0].reason, /update-branch failed for PR #12/)
  } finally {
    cleanup(root, remote)
  }
})

test('sync-batch reports an unavailable open list without writing state', () => {
  const { root, remote } = makeRepo()
  try {
    let lists = 0
    const gh = (args) => {
      assert.equal(args[0], 'pr')
      assert.equal(args[1], 'list')
      lists += 1
      throw new Error('gh pr list failed: HTTP 504: 504 Gateway Timeout')
    }
    const result = syncBatch({ root, gh, apply: true, retryDelayMs: 0 })
    assert.equal(lists, 2)
    assert.equal(result.unavailable, true)
    assert.equal(result.apply, true)
    assert.equal(result.locked, false)
    assert.equal(result.changed, false)
    assert.deepEqual(result.results, [])
    assert.equal(existsSync(join(resolvePaths(root).cache, 'landings.json')), false)
  } finally {
    cleanup(root, remote)
  }
})

test('the sync-batch command exits successfully when the open list is unavailable', () => {
  const { root, remote } = makeRepo()
  const bin = tempDir('dsh-fake-gh-')
  try {
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho "HTTP 504: 504 Gateway Timeout (https://api.github.com/graphql)" >&2\nexit 1\n', { mode: 0o755 })
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../scripts/pr-review-land.mjs', import.meta.url)), 'sync-batch', '--apply'],
      { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } },
    )
    assert.equal(result.status, 0, result.stderr)
    const parsed = JSON.parse(result.stdout)
    assert.equal(parsed.unavailable, true)
    assert.equal(parsed.apply, true)
    assert.equal(parsed.changed, false)
  } finally {
    cleanup(root, remote, bin)
  }
})

test('landing tolerates another change planning directory through prepare and merge', () => {
  const { root } = landingToArchivePending({ draft: true })
  assert.equal(loadLandings(root).lands['12'].phase, 'archive-pending')
  assert.equal(existsSync(join(root, 'openspec', 'changes', 'other', 'proposal.md')), true)
})

test('landing refuses own dirt, outside dirt, a staged index and off-main', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  writeFileSync(join(root, 'openspec', 'changes', 'widget', 'extra.md'), 'extra\n')
  assert.throws(() => planLanding({ root, number: 12, gh: fake }), /clean main worktree[\s\S]*extra\.md/)
  rmSync(join(root, 'openspec', 'changes', 'widget', 'extra.md'))
  writeFileSync(join(root, 'notes.txt'), 'notes\n')
  assert.throws(() => planLanding({ root, number: 12, gh: fake }), /clean main worktree[\s\S]*notes\.txt/)
  rmSync(join(root, 'notes.txt'))
  writeFileSync(join(root, 'staged.txt'), 'staged\n')
  git(root, ['add', 'staged.txt'])
  assert.throws(() => planLanding({ root, number: 12, gh: fake }), /empty index/)
  git(root, ['reset', '-q', 'staged.txt'])
  rmSync(join(root, 'staged.txt'))
  git(root, ['checkout', '-q', '-b', 'side'])
  assert.throws(
    () => planLanding({ root, number: 12, gh: () => { throw new Error('must not be called') } }),
    /must run from main/,
  )
})

test('merge refuses a staged index before gh and stays reviewed', () => {
  const { root, head } = landingToReviewed()
  writeFileSync(join(root, 'staged.txt'), 'staged\n')
  git(root, ['add', 'staged.txt'])
  let merged = 0
  assert.throws(() => mergeLanding({
    root,
    number: 12,
    apply: true,
    gh: fakeGh({ pr: JSON.parse(prJson(head)), onMerge: () => { merged += 1 } }),
  }), /empty index/)
  assert.equal(merged, 0)
  assert.equal(loadLandings(root).lands['12'].phase, 'reviewed')
})

test('candidates tolerates another change planning directory', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  writeParallelDraft(root)
  const result = listLandingCandidates({
    root,
    gh: fakeGh({
      pr: JSON.parse(prJson(head)),
      list: [{ number: 12, labels: [{ name: LANDING_LABEL }] }],
    }),
  })
  assert.equal(result.blocked, undefined)
  assert.equal(result.candidates.length, 1)
})

test('sync runs with a dirty main worktree and refuses off main', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  advanceMain(root)
  writeFileSync(join(root, 'README.md'), 'dirty main\n')
  writeFileSync(join(root, 'notes.txt'), 'notes\n')
  const newHead = 'e'.repeat(40)
  const result = syncLanding({
    root,
    number: 12,
    apply: true,
    gh: syncGh(JSON.parse(prJson(head)), { newHead }),
    pollAttempts: 2,
    pollIntervalMs: 0,
  })
  assert.equal(result.newHead, newHead)
  git(root, ['checkout', '-q', '-b', 'side'])
  assert.throws(() => syncLanding({ root, number: 12, gh: syncGh(JSON.parse(prJson(head))) }), /must run from main/)
})

test('sync-batch runs with a dirty main worktree', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  advanceMain(root)
  writeFileSync(join(root, 'README.md'), 'dirty main\n')
  writeFileSync(join(root, 'notes.txt'), 'notes\n')
  const newHead = 'f'.repeat(40)
  let updated = false
  const pr = JSON.parse(prJson(head))
  const gh = (args) => {
    if (args[0] === 'pr' && args[1] === 'list') {
      return JSON.stringify([{
        number: 12,
        headRefName: 'pr-branch',
        headRefOid: head,
        baseRefName: 'main',
        isDraft: false,
        isCrossRepository: false,
        labels: [{ name: LANDING_LABEL }],
      }])
    }
    if (args[0] === 'pr' && args[1] === 'view' && args.includes('files')) {
      return JSON.stringify({ files: [{ path: 'openspec/changes/widget/proposal.md' }] })
    }
    if (args[0] === 'api' && args[1] === 'user') return LOGIN
    if (args[0] === 'api') {
      updated = true
      return '{}'
    }
    if (args[0] === 'pr' && args[1] === 'view' && args[4] === 'headRefOid') {
      return JSON.stringify({ headRefOid: updated ? newHead : head })
    }
    if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify(pr)
    throw new Error(`unexpected gh ${args.join(' ')}`)
  }
  const result = syncBatch({ root, apply: true, gh, pollAttempts: 2, pollIntervalMs: 0, retryDelayMs: 0 })
  assert.equal(result.changed, true)
  assert.equal(result.updated, 1)
})

test('archive commits only its own outputs and leaves a parallel draft untracked', () => {
  const { root } = landingToArchivePending()
  writeParallelDraft(root)
  moveWidgetToArchive(root)
  const entry = archiveLanding({ root, number: 12, apply: true })
  assert.equal(entry.phase, 'archived')
  const head = git(root, ['rev-parse', 'HEAD'])
  assert.equal(entry.archiveCommit, head)
  assert.equal(git(root, ['show', '-s', '--format=%B', 'HEAD']), 'chore(openspec): archive widget')
  const paths = git(root, ['show', '--no-renames', '--name-only', '--format=', 'HEAD']).split('\n').filter((path) => path !== '')
  assert.ok(paths.some((path) => path.startsWith('openspec/changes/archive/2026-01-01-widget/')))
  assert.ok(paths.includes('openspec/changes/widget/proposal.md'))
  assert.equal(paths.some((path) => path.startsWith('openspec/changes/other/')), false)
  assert.equal(git(root, ['status', '--porcelain']), '?? openspec/changes/other/')
})

test('archive stages the named capability directories', () => {
  const { root } = landingToArchivePending({ changeSpec: true })
  moveWidgetToArchive(root)
  mkdirSync(join(root, 'openspec', 'specs', 'widget'), { recursive: true })
  writeFileSync(join(root, 'openspec', 'specs', 'widget', 'spec.md'), '# Merged widget spec\n')
  archiveLanding({ root, number: 12, apply: true })
  const paths = git(root, ['show', '--no-renames', '--name-only', '--format=', 'HEAD']).split('\n').filter((path) => path !== '')
  assert.ok(paths.includes('openspec/specs/widget/spec.md'))
  assert.ok(paths.some((path) => path.startsWith('openspec/changes/archive/2026-01-01-widget/specs/widget/')))
})

test('archive refuses a spec outside the named capabilities', () => {
  const { root } = landingToArchivePending()
  moveWidgetToArchive(root)
  mkdirSync(join(root, 'openspec', 'specs', 'other'), { recursive: true })
  writeFileSync(join(root, 'openspec', 'specs', 'other', 'spec.md'), '# Other\n')
  assert.throws(() => archiveLanding({ root, number: 12, apply: true }), /outside its outputs/)
  assert.equal(loadLandings(root).lands['12'].phase, 'archive-failed')
})

test('archive refuses a leftover under the source change directory', () => {
  const { root } = landingToArchivePending()
  moveWidgetToArchive(root)
  mkdirSync(join(root, 'openspec', 'changes', 'widget'), { recursive: true })
  writeFileSync(join(root, 'openspec', 'changes', 'widget', 'leftover.md'), 'leftover\n')
  assert.throws(() => archiveLanding({ root, number: 12, apply: true }), /outside its outputs/)
  assert.equal(loadLandings(root).lands['12'].phase, 'archive-failed')
})

test('archive refuses a staged set that is already committed', () => {
  const { root } = landingToArchivePending()
  moveWidgetToArchive(root)
  git(root, ['add', '-A'])
  git(root, ['commit', '-qm', 'chore(openspec): archive widget'])
  assert.throws(() => archiveLanding({ root, number: 12, apply: true }), /produced no staged changes/)
  assert.equal(loadLandings(root).lands['12'].phase, 'archive-failed')
})

test('archive --commit records a commit whose paths stay inside the archive scope', () => {
  const { root } = landingToArchivePending()
  moveWidgetToArchive(root)
  git(root, ['add', '-A'])
  git(root, ['commit', '-qm', 'chore(openspec): archive widget'])
  const head = git(root, ['rev-parse', 'HEAD'])
  const entry = archiveLanding({ root, number: 12, commit: head, apply: true })
  assert.equal(entry.phase, 'archived')
  assert.equal(entry.archiveCommit, head)
})

test('archive --commit refuses a commit that changes a path outside the scope', () => {
  const { root } = landingToArchivePending()
  moveWidgetToArchive(root)
  mkdirSync(join(root, 'openspec', 'changes', 'other'), { recursive: true })
  writeFileSync(join(root, 'openspec', 'changes', 'other', 'proposal.md'), '# Other\n')
  git(root, ['add', '-A'])
  git(root, ['commit', '-qm', 'chore(openspec): archive widget'])
  const head = git(root, ['rev-parse', 'HEAD'])
  assert.throws(
    () => archiveLanding({ root, number: 12, commit: head, apply: true }),
    /outside its scope/,
  )
  assert.equal(loadLandings(root).lands['12'].phase, 'archive-failed')
})

test('archive refuses a missing or ambiguous archived directory', () => {
  const first = landingToArchivePending()
  rmSync(join(first.root, 'openspec', 'changes', 'widget'), { recursive: true })
  git(first.root, ['rm', '-r', '--cached', '-q', '--', 'openspec/changes/widget'])
  assert.throws(() => archiveLanding({ root: first.root, number: 12, apply: true }), /has no archive directory/)
  const second = landingToArchivePending()
  moveWidgetToArchive(second.root)
  mkdirSync(join(second.root, 'openspec', 'changes', 'archive', '2026-01-02-widget'), { recursive: true })
  writeFileSync(join(second.root, 'openspec', 'changes', 'archive', '2026-01-02-widget', 'proposal.md'), '# Second\n')
  assert.throws(() => archiveLanding({ root: second.root, number: 12, apply: true }), /more than one archive directory/)
})

test('archive refuses an unsafe capability name and a staged index', () => {
  const first = landingToArchivePending()
  moveWidgetToArchive(first.root)
  mkdirSync(join(first.root, 'openspec', 'changes', 'archive', '2026-01-01-widget', 'specs', 'escape\\name'), { recursive: true })
  writeFileSync(
    join(first.root, 'openspec', 'changes', 'archive', '2026-01-01-widget', 'specs', 'escape\\name', 'spec.md'),
    '# Escape\n',
  )
  assert.throws(() => archiveLanding({ root: first.root, number: 12, apply: true }), /not a safe path segment/)
  const second = landingToArchivePending()
  moveWidgetToArchive(second.root)
  writeFileSync(join(second.root, 'staged.txt'), 'staged\n')
  git(second.root, ['add', 'staged.txt'])
  assert.throws(() => archiveLanding({ root: second.root, number: 12, apply: true }), /empty index/)
  assert.equal(loadLandings(second.root).lands['12'].phase, 'archive-failed')
})

test('the landing runner classifies writes and the head poll', () => {
  assert.equal(isGhWrite(['pr', 'merge', '12', '--rebase']), true)
  assert.equal(isGhWrite(['api', '--method', 'PUT', 'repos/{owner}/{repo}/pulls/12/update-branch']), true)
  assert.equal(isGhWrite(['api', 'user', '--jq', '.login']), false)
  assert.equal(isHeadPoll(['pr', 'view', '12', '--json', 'headRefOid']), true)
  assert.equal(isHeadPoll(['pr', 'view', '12', '--json', 'files']), false)
  assert.equal(isHeadPoll(['pr', 'list', '--state', 'open']), false)
})
