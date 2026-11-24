import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  LANDING_LABEL,
  REVIEW_FAILED_PHASE,
  abandonLanding,
  archiveLanding,
  assertSingleLanding,
  failLanding,
  finishLanding,
  hasLandingLabel,
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
  trustedPass,
} from '../scripts/pr-review-land.mjs'
import { resolvePaths, saveState } from '../scripts/pr-review-watch.mjs'

const HEAD = 'a'.repeat(40)
const LOGIN = 'maintainer'

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-pr-review-land-'))
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
  const remote = mkdtempSync(join(tmpdir(), 'dsh-pr-review-land-remote-'))
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

test('prepare rebases the local landing branch and reviewed checks the record tree', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  // Advance main after the PR was created so prepare must rebase.
  writeFileSync(join(root, 'README.md'), 'main moved\n')
  git(root, ['add', 'README.md'])
  git(root, ['commit', '-qm', 'main moved'])
  git(root, ['push', '-q', 'origin', 'main'])
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  const prepared = prepareLanding({ root, number: 12, apply: true, gh: fake })
  assert.equal(prepared.phase, 'prepared')
  assert.notEqual(prepared.landingHead, head)
  const tree = git(prepared.worktree, ['rev-parse', 'HEAD^{tree}'])
  assert.throws(() => reviewedLanding({ root, number: 12, apply: true }), /apply review record/)
  reviewRecord(root, tree)
  const reviewed = reviewedLanding({ root, number: 12, apply: true })
  assert.equal(reviewed.phase, 'reviewed')
  assert.equal(reviewed.reviewedTree, tree)
  const again = reviewedLanding({ root, number: 12, apply: true })
  assert.equal(again.phase, 'reviewed')
})

test('prepare reports a rebase conflict and leaves the contributor ref alone', () => {
  const { root, remote } = makeRepo()
  const { head } = addPullRequest(root, remote)
  writeFileSync(join(root, 'feature.txt'), 'main conflict\n')
  git(root, ['add', 'feature.txt'])
  git(root, ['commit', '-qm', 'main conflict'])
  git(root, ['push', '-q', 'origin', 'main'])
  const fake = fakeGh({ pr: JSON.parse(prJson(head)) })
  assert.throws(() => prepareLanding({ root, number: 12, apply: true, gh: fake }), /rebase conflict/)
  assert.equal(loadLandings(root).lands['12'].phase, 'blocked')
  assert.equal(git(remote, ['rev-parse', 'refs/pull/12/head']), head)
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
  git(root, ['mv', 'openspec/changes/widget', 'openspec/changes/archive/2026-01-01-widget'])
  git(root, ['commit', '-qm', 'archive widget'])
  archiveLanding({ root, number: 12, apply: true })
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
  git(root, ['mv', 'openspec/changes/widget', 'openspec/changes/archive/2026-01-01-widget'])
  git(root, ['commit', '-qm', 'archive widget'])
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
  assert.deepEqual(result.candidates, [{ number: 12, head, change: 'widget', base: 'main' }])
  assert.deepEqual(result.refused, [])
  assert.equal(readFileSync(stateFile, 'utf8'), beforeState)
  assert.equal(existsSync(join(resolvePaths(root).cache, 'landings.json')), false)
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
