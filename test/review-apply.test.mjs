import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  CHANGE, fixture, setup, call, reviewDir, writePolicy, report, majorFinding, minorFinding, gitFixture, passDraft, passDraftConstructing, captureSpawn, cleanupFixtures,
} from './review-fixtures.mjs'
import { reviewDirectory } from '../lib/review/store.js'
import { readApplyState } from '../lib/worktree/state.js'
import { buildSealCommit, pinSeal, sealBranchName, sealRefName } from '../lib/worktree/seal.js'
import { prepareApplyWorktree } from '../lib/tools/apply.js'
import { assertApplyReviewReady, assertDraftReviewReady } from '../lib/tools/review.js'

test.after(cleanupFixtures)

test('new change locks a policy and ignores later settings', async () => {
  const root = fixture()
  const fake = setup(root, { draft: { enabled: false, reviewers: 0 } })
  const created = await call(fake, 'openspec_new_change', { name: 'add-light-mode' })
  assert.equal(created.change.id, 'add-light-mode')
  const policyPath = join(reviewDirectory(root, undefined, 'add-light-mode'), 'policy.json')
  assert.equal(existsSync(policyPath), true)
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  assert.equal(policy.reviews.draft.enabled, false)
  assert.match(readFileSync(join(root, 'openspec', '.gitignore'), 'utf8'), /\.review\//)
})

test('a no-git project locks apply review off even when settings enable it', async () => {
  const root = fixture()
  const fake = setup(root, { draft: { enabled: true }, apply: { enabled: true } })
  await call(fake, 'openspec_new_change', { name: 'add-no-git-apply' })
  const policy = JSON.parse(readFileSync(
    join(reviewDirectory(root, undefined, 'add-no-git-apply'), 'policy.json'),
    'utf8',
  ))
  assert.equal(policy.git.enabled, false)
  assert.equal(policy.reviews.apply.enabled, false)
  assert.equal(policy.reviews.draft.enabled, true)
})

test('a git project locks apply review from the settings', async () => {
  const { root } = gitFixture()
  const fake = setup(root, { draft: { enabled: true }, apply: { enabled: true } })
  await call(fake, 'openspec_new_change', { name: 'add-git-apply' })
  const policy = JSON.parse(readFileSync(
    join(reviewDirectory(root, undefined, 'add-git-apply'), 'policy.json'),
    'utf8',
  ))
  assert.equal(policy.git.enabled, true)
  assert.equal(policy.reviews.apply.enabled, true)
})

test('apply refuses a policy that has no review record', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_new_change', { name: 'add-light-mode' })
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: 'add-light-mode' }),
    /draft review has not started/,
  )
})

test('a git project records the apply base commit', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.applyBaseCommit, run(['rev-parse', 'HEAD']))
})

test('apply review starts on the committed tree and records its base', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const argv = captureSpawn(fake)
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply',
  })
  assert.equal(started.review, 'apply')
  assert.equal(started.treeSha, run(['rev-parse', 'HEAD^{tree}']))
  assert.ok(started.brief)
  assert.match(started.brief, /Apply review brief/)
  assert.match(started.brief, /"id": "R1-01"/)
  assert.match(started.brief, /"verifications": \[\]/)
  assert.match(started.brief, /repository-relative path and line/)
  assert.match(started.brief, /- validation: host strict pass \(0 issues\)/)
  assert.match(started.brief, /host validated the committed change with strict validation/)
  assert.match(started.brief, /do not run validation yourself/)
  assert.doesNotMatch(started.brief, /strict validation passes/)
  assert.match(started.brief, /The base is the seal commit recorded by the first `openspec_apply_next`\./)
  assert.match(started.brief, /The diff starts at the base tree/)
  assert.match(started.brief, /whole committed tree/)
  assert.match(started.brief, /An empty diff means/)
  assert.match(started.brief, /see `## Base and diff` for the scope/)
  assert.match(started.brief, /Review any plan change in the diff on the plan axes/)
  assert.equal(readFileSync(join(reviewDir(root), 'apply-round-1', 'diff.patch'), 'utf8'), '')
  const validation = argv.find((args) => args.includes('validate'))
  assert.ok(validation, 'the apply start validates the change')
  assert.ok(validation.includes('--strict'), 'the apply start validates strictly')
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.objectKind, 'tree')
  assert.deepEqual(record.criteria, {
    passCriteria: 'major', allowDeferred: true, allowRejected: true,
  })
  assert.equal(record.baseTreeSha, run(['rev-parse', `${record.baseCommit}^{tree}`]))
  assert.ok(started.brief.includes(`- base: ${record.baseCommit}`))
})

test('apply review refuses a strict-only warning before it records a round', async () => {
  const { root, run } = gitFixture()
  const specDirectory = join(root, 'openspec', 'changes', CHANGE, 'specs', 'theme')
  mkdirSync(specDirectory, { recursive: true })
  writeFileSync(join(specDirectory, 'spec.md'), [
    '# Spec Delta',
    '',
    '## ADDED Requirements',
    '',
    '### Requirement: Theme probe',
    '',
    'The probe SHALL report its state.',
    '',
    '#### Scenario: Probe has a trigger only',
    '',
    '- **WHEN** the probe runs',
    '',
  ].join('\n'))
  const fake = setup(root)
  await passDraft(fake, root, run)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /apply review refuses change 'add-dark-mode' that does not pass strict validation/,
  )
  assert.equal(existsSync(join(reviewDir(root), 'apply-review.json')), false)
})

test('apply review refuses a disabled policy before strict validation', async () => {
  const { root, run } = gitFixture()
  const specDirectory = join(root, 'openspec', 'changes', CHANGE, 'specs', 'theme')
  mkdirSync(specDirectory, { recursive: true })
  writeFileSync(join(specDirectory, 'spec.md'), [
    '# Spec Delta',
    '',
    '## ADDED Requirements',
    '',
    '### Requirement: Theme probe',
    '',
    'The probe SHALL report its state.',
    '',
    '#### Scenario: Probe has a trigger only',
    '',
    '- **WHEN** the probe runs',
    '',
  ].join('\n'))
  const fake = setup(root)
  await passDraft(fake, root, run)
  writePolicy(root, CHANGE, {
    draft: { enabled: true, reviewers: 0, maxRounds: 3, waitMinutes: 15 },
    apply: { enabled: false, reviewers: 0, maxRounds: 5, waitMinutes: 15 },
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /apply review is disabled for this change/,
  )
})

test('apply review refuses a dirty tree', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'), '# Changed\n')
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /clean working tree/,
  )
})

test('apply review refuses a plan change that grows a MODIFIED requirement', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)

  const policyPath = join(reviewDir(root), 'policy.json')
  const policyBefore = readFileSync(policyPath, 'utf8')

  const mainDir = join(root, 'openspec', 'specs', 'theme')
  mkdirSync(mainDir, { recursive: true })
  const baseline = 'The app SHALL let users switch between light and dark themes, defaulting to the system preference.'
  const grown = `${baseline} It SHALL also preserve the selected theme across restarts.${' detail'.repeat(90)}`
  writeFileSync(join(mainDir, 'spec.md'), `# Theme Specification

## Purpose

Lets users choose a visual theme and keeps that choice across sessions.

## Requirements

### Requirement: Theme selection

${baseline}

#### Scenario: User toggles dark mode

- **WHEN** the user clicks the theme toggle
- **THEN** the app switches to dark mode and persists the choice
`)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'specs', 'theme', 'spec.md'), `## MODIFIED Requirements

### Requirement: Theme selection

${grown}

#### Scenario: User toggles dark mode

- **WHEN** the user clicks the theme toggle
- **THEN** the app switches to dark mode and persists the choice
`)
  run(['add', '-A'])
  run(['commit', '-m', 'change plan'])
  await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'The user approved the longer requirement.', files: ['specs/theme/spec.md'],
  })

  const resync = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(resync.state, 'all_done')

  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /apply review refuses change 'add-dark-mode'.*requirement description limit.*openspec_review action=start review=apply/s,
  )
  assert.equal(readFileSync(policyPath, 'utf8'), policyBefore)
})

test('apply review keeps refusing an overlong ADDED requirement with the CLI message', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)

  const specDirectory = join(root, 'openspec', 'changes', CHANGE, 'specs', 'theme')
  mkdirSync(specDirectory, { recursive: true })
  writeFileSync(join(specDirectory, 'spec.md'), `## ADDED Requirements

### Requirement: Theme growth

The app SHALL ${'show '.repeat(120)}a theme.

#### Scenario: Theme renders

- **WHEN** the app starts
- **THEN** the theme renders
`)
  run(['add', '-A'])
  run(['commit', '-m', 'add an overlong requirement'])

  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /apply review refuses change 'add-dark-mode' that does not pass strict validation[\s\S]*Requirement text is very long/,
  )
  assert.equal(existsSync(join(reviewDir(root), 'apply-review.json')), false)
})

test('apply review accepts a plan change and records the drift', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 1. New\n\n- [ ] 1.1 New task\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'change plan'])
  await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'The user approved the added task.', files: ['tasks.md'],
  })
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  assert.equal(started.review, 'apply')
  assert.match(started.brief, /Plan changes since the draft/)
  assert.match(started.brief, /modified: tasks\.md/)
  assert.match(started.brief, /Plan change waiver/)
  assert.match(started.brief, /The user approved the added task\./)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.draftDrift.files[0].path, 'tasks.md')
  assert.equal(record.draftDrift.files[0].status, 'modified')
})

test('apply review refuses a missing requirement anchor after the main spec changes', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  const mainSpec = join(root, 'openspec', 'specs', 'theme', 'spec.md')
  mkdirSync(join(root, 'openspec', 'specs', 'theme'), { recursive: true })
  writeFileSync(mainSpec, `# Theme Specification

## Purpose

Lets users choose a visual theme and keeps that choice across sessions.

## Requirements

### Requirement: Theme selection

The app SHALL let users switch between light and dark themes, defaulting to the system preference.

#### Scenario: User toggles dark mode

- **WHEN** the user clicks the theme toggle
- **THEN** the app switches to dark mode and persists the choice
`)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'specs', 'theme', 'spec.md'), `## MODIFIED Requirements

### Requirement: Theme selection

The app SHALL let users switch between light and dark themes, defaulting to the system preference and keeping the choice.

#### Scenario: User toggles dark mode

- **WHEN** the user clicks the theme toggle
- **THEN** the app switches to dark mode and persists the choice
`)
  run(['add', 'openspec/specs/theme/spec.md'])
  run(['commit', '-m', 'add the theme baseline'])
  await passDraft(fake, root, run)

  writeFileSync(mainSpec, `# Theme Specification

## Purpose

Lets users choose a visual theme and keeps that choice across sessions.

## Requirements

### Requirement: Other theme note

A different requirement.

#### Scenario: The other note is read

- **WHEN** the theme note is read
- **THEN** it is accepted
`)
  run(['add', 'openspec/specs/theme/spec.md'])
  run(['commit', '-m', 'remove the theme baseline'])

  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /apply review refuses change 'add-dark-mode' because the draft execution preflight failed:.*specs\/theme\/spec\.md.*openspec_review action=start review=apply/s,
  )
})

test('apply review resume refuses and then clears an execution preflight block', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  assert.equal(started.round, 1)
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })

  const tasksPath = join(root, 'openspec', 'changes', CHANGE, 'tasks.md')
  await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'The user approved the task list change.', files: ['tasks.md'],
  })
  writeFileSync(tasksPath, '\n## 9. Missing\n\n- [ ] 9.1 Verify `test/missing-resume.test.mjs` passes.\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'name a missing test'])
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' }),
    /apply review refuses change 'add-dark-mode' because the draft execution preflight failed:.*test\/missing-resume\.test\.mjs.*openspec_review action=resume review=apply/s,
  )

  writeFileSync(tasksPath, '\n## 9. Missing\n\n- [ ] 9.1 Add `test/missing-resume.test.mjs` and verify it passes.\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'declare the new test'])
  const resumed = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  assert.equal(resumed.round, 2)
  assert.equal(resumed.state, 'in-review')
})

test('archive proceeds in a no-git project with a legacy enabled apply policy', async () => {
  const root = fixture()
  const fake = setup(root, { draft: { enabled: true }, apply: { enabled: true } })
  writePolicy(root, CHANGE, {
    draft: { enabled: true, reviewers: 0, maxRounds: 3, waitMinutes: 15 },
    apply: { enabled: true, reviewers: 0, maxRounds: 5, waitMinutes: 15 },
  })
  const archived = await call(fake, 'openspec_archive', { change: CHANGE })
  assert.equal(archived.archived, true)
})

test('a ready apply review allows archive and a blocker refuses it', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const intentTarget = /^- intent: (.+)$/mu.exec(started.brief)?.[1]
  const diffTarget = /^- diff: (.+)$/mu.exec(started.brief)?.[1]
  assert.ok(intentTarget !== undefined && existsSync(intentTarget), `apply brief intent path exists: ${intentTarget}`)
  assert.ok(diffTarget !== undefined && existsSync(diffTarget), `apply brief diff path exists: ${diffTarget}`)
  await assert.rejects(
    call(fake, 'openspec_archive', { change: CHANGE }),
    /Next: openspec_review action=self-report review=apply/,
  )
  const blocked = await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply',
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  assert.equal(blocked.ready, false)
  await assert.rejects(
    call(fake, 'openspec_archive', { change: CHANGE }),
    /apply review is not ready: .*Next: openspec_review action=dispose review=apply/,
  )
  assert.equal(existsSync(join(root, 'openspec', 'changes', CHANGE)), true)

  await call(fake, 'openspec_review', {
    action: 'waive', change: CHANGE, review: 'apply',
    id: 'R1-01', waiver: 'accepted by the user', approvedBy: 'user',
  })
  await call(fake, 'openspec_review', {
    action: 'resume', change: CHANGE, review: 'apply', round: 2,
  })
  const passed = await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', round: 2, report: report(),
  })
  assert.equal(passed.ready, true)
  const archived = await call(fake, 'openspec_archive', { change: CHANGE })
  assert.equal(archived.archived, true)
})

test('moving HEAD after an apply pass refuses archive', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const intentTarget = /^- intent: (.+)$/mu.exec(started.brief)?.[1]
  const diffTarget = /^- diff: (.+)$/mu.exec(started.brief)?.[1]
  assert.ok(intentTarget !== undefined && existsSync(intentTarget), `apply brief intent path exists: ${intentTarget}`)
  assert.ok(diffTarget !== undefined && existsSync(diffTarget), `apply brief diff path exists: ${diffTarget}`)
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  writeFileSync(join(root, 'notes.txt'), 'new content\n')
  run(['add', 'notes.txt'])
  run(['commit', '-m', 'move'])
  await assert.rejects(
    call(fake, 'openspec_archive', { change: CHANGE }),
    /tree no longer matches HEAD/,
  )
})

test('apply review is unavailable without git', async () => {
  const root = fixture()
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /no git repository/,
  )
})

test('apply review can run with draft review disabled and an explicit base', async () => {
  const { root, run } = gitFixture()
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'seal the draft'])
  const base = run(['rev-parse', 'HEAD'])
  const fake = setup(root, { draft: { enabled: false }, apply: { enabled: true } })
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply', base,
  })
  assert.equal(started.review, 'apply')
  assert.equal(started.baseline, 'none')
  assert.match(started.brief, /- baseline: none/)
  assert.match(started.brief, /The base is the explicit base passed to this review\./)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.baseCommit, base)
  assert.equal(record.baseline, 'none')
})

test('apply review can run with draft review disabled and the merge-base fallback', async () => {
  const { root, run } = gitFixture()
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  run(['add', 'openspec/.gitignore', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'seal the draft'])
  const seal = run(['rev-parse', 'HEAD'])
  run(['branch', 'origin/main', seal])
  const fake = setup(root, { draft: { enabled: false }, apply: { enabled: true } })
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply',
  })
  assert.equal(started.baseline, 'none')
  assert.match(started.brief, /- baseline: none/)
  assert.match(started.brief, /The base is `git merge-base HEAD origin\/main`; no seal commit was recorded for this change\./)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.baseline, 'none')
  assert.equal(record.baseSource, 'merge-base')
  const resumed = await call(fake, 'openspec_review', {
    action: 'resume', change: CHANGE, review: 'apply',
  })
  assert.match(resumed.brief, /The base is `git merge-base HEAD origin\/main`; no seal commit was recorded for this change\./)
  const resumedRecord = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(resumedRecord.baseSource, 'merge-base')
})

test('a no-draft automatic base re-bases onto the fork', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, { draft: { enabled: false }, apply: { enabled: true } })
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  run(['add', 'openspec/.gitignore', `openspec/changes/${CHANGE}`])
  run(['commit', '-q', '-m', 'branch'])
  const seal = run(['rev-parse', 'HEAD'])
  run(['update-ref', 'refs/remotes/origin/main', seal])
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  assert.equal(started.baseline, 'none')
  const first = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(first.baseSource, 'merge-base')
  assert.equal(first.baseCommit, seal)

  writeFileSync(join(root, 'feature.txt'), 'feature\n')
  run(['add', 'feature.txt'])
  run(['commit', '-q', '-m', 'feature work'])
  run(['checkout', '-q', '-b', 'advance', seal])
  writeFileSync(join(root, 'main-only.txt'), 'landed\n')
  run(['add', 'main-only.txt'])
  run(['commit', '-q', '-m', 'main advance'])
  const fork = run(['rev-parse', 'HEAD'])
  run(['update-ref', 'refs/remotes/origin/main', fork])
  run(['checkout', '-q', '-'])
  run(['rebase', '-q', 'advance'])

  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.baseSource, 'merge-base')
  assert.equal(record.baseCommit, fork)
  assert.equal(record.rebasedFrom, seal)
  const diff = readFileSync(join(reviewDir(root), 'apply-round-1', 'diff.patch'), 'utf8')
  assert.match(diff, /feature\.txt/)
  assert.doesNotMatch(diff, /main-only\.txt/)
})

test('a no-draft explicit base stays after main advanced into the branch', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, { draft: { enabled: false }, apply: { enabled: true } })
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  run(['add', 'openspec/.gitignore', `openspec/changes/${CHANGE}`])
  run(['commit', '-q', '-m', 'branch'])
  const seal = run(['rev-parse', 'HEAD'])
  run(['update-ref', 'refs/remotes/origin/main', seal])
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply', base: seal })

  writeFileSync(join(root, 'feature.txt'), 'feature\n')
  run(['add', 'feature.txt'])
  run(['commit', '-q', '-m', 'feature work'])
  run(['checkout', '-q', '-b', 'advance', seal])
  writeFileSync(join(root, 'main-only.txt'), 'landed\n')
  run(['add', 'main-only.txt'])
  run(['commit', '-q', '-m', 'main advance'])
  run(['update-ref', 'refs/remotes/origin/main', run(['rev-parse', 'HEAD'])])
  run(['checkout', '-q', '-'])
  run(['rebase', '-q', 'advance'])

  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.baseSource, 'explicit')
  assert.equal(record.baseCommit, seal)
  assert.equal(record.rebasedFrom, undefined)
  const diff = readFileSync(join(reviewDir(root), 'apply-round-1', 'diff.patch'), 'utf8')
  assert.match(diff, /main-only\.txt/)
})

test('a no-draft automatic base that is not an ancestor stays', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, { draft: { enabled: false }, apply: { enabled: true } })
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  run(['add', 'openspec/.gitignore', `openspec/changes/${CHANGE}`])
  run(['commit', '-q', '-m', 'branch'])
  const seal = run(['rev-parse', 'HEAD'])
  run(['update-ref', 'refs/remotes/origin/main', seal])
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })

  run(['checkout', '-q', '-b', 'sibling', `${seal}^`])
  writeFileSync(join(root, 'main-only.txt'), 'landed\n')
  run(['add', 'main-only.txt'])
  run(['commit', '-q', '-m', 'sibling advance'])
  run(['update-ref', 'refs/remotes/origin/main', run(['rev-parse', 'HEAD'])])
  run(['checkout', '-q', '-'])

  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.baseSource, 'merge-base')
  assert.equal(record.baseCommit, seal)
  assert.equal(record.rebasedFrom, undefined)
})

test('a no-draft apply review starts without a draft record and reports its baseline', async () => {
  const { root, run } = gitFixture()
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  run(['add', 'openspec/.gitignore', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'branch'])
  const base = run(['rev-parse', 'HEAD'])
  const fake = setup(root)
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply', baseline: 'none', base,
  })
  assert.equal(started.baseline, 'none')
  assert.match(started.brief, /This review has no draft baseline/)
  assert.doesNotMatch(started.brief, /- intent:/)
  assert.doesNotMatch(started.brief, /## Plan changes since the draft/)
  assert.doesNotMatch(started.brief, /## Plan change waiver/)
  const resumed = await call(fake, 'openspec_review', {
    action: 'resume', change: CHANGE, review: 'apply',
  })
  assert.equal(resumed.round, 1)
  assert.equal(resumed.baseline, 'none')
  assert.equal(resumed.baseTreeSha, started.baseTreeSha)
  const resumedRecord = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(resumedRecord.baseCommit, base)
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  const status = await call(fake, 'openspec_review', {
    action: 'status', change: CHANGE, review: 'apply',
  })
  assert.equal(status.baseline, 'none')
  const reportResult = await call(fake, 'openspec_review', {
    action: 'report', change: CHANGE, review: 'apply',
  })
  assert.equal(reportResult.baseline, 'none')
})

test('an explicit no-draft baseline needs a base', async () => {
  const { root, run } = gitFixture()
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'branch'])
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, review: 'apply', baseline: 'none',
    }),
    /needs a non-empty base/,
  )
})

test('an explicit no-draft baseline is refused when a draft record exists', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const base = run(['rev-parse', 'HEAD'])
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, review: 'apply', baseline: 'none', base,
    }),
    /already has a draft review/,
  )
})

test('the default apply review still requires a draft record', async () => {
  const { root, run } = gitFixture()
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'branch'])
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /needs a completed draft review/,
  )
})

test('a legacy apply record without baseline reports draft', async () => {
  const { root, run } = gitFixture()
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'branch'])
  const base = run(['rev-parse', 'HEAD'])
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply', baseline: 'none', base,
  })
  const path = join(reviewDir(root), 'apply-review.json')
  const record = JSON.parse(readFileSync(path, 'utf8'))
  delete record.baseline
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`)
  const status = await call(fake, 'openspec_review', {
    action: 'status', change: CHANGE, review: 'apply',
  })
  assert.equal(status.baseline, 'draft')
})

test('a resume cannot change the recorded baseline', async () => {
  const { root, run } = gitFixture()
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  run(['add', 'openspec/.gitignore', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'branch'])
  const base = run(['rev-parse', 'HEAD'])
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply', baseline: 'none', base,
  })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'resume', change: CHANGE, review: 'apply', baseline: 'draft', base,
    }),
    /baseline is none/,
  )

  const second = gitFixture()
  const secondFake = setup(second.root)
  await passDraft(secondFake, second.root, second.run)
  await call(secondFake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await assert.rejects(
    call(secondFake, 'openspec_review', {
      action: 'resume', change: CHANGE, review: 'apply', baseline: 'none',
    }),
    /baseline is draft/,
  )
})

test('an explicit draft baseline is refused when the draft policy is disabled', async () => {
  const { root, run } = gitFixture()
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'branch'])
  const base = run(['rev-parse', 'HEAD'])
  const fake = setup(root, { draft: { enabled: false }, apply: { enabled: true } })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, review: 'apply', baseline: 'draft', base,
    }),
    /draft review is disabled/,
  )
})

test('an explicit draft baseline is accepted when the draft policy is enabled', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const base = run(['rev-parse', 'HEAD'])
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply', baseline: 'draft', base,
  })
  assert.equal(started.baseline, 'draft')
})

test('an explicit base on resume sets the explicit source', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const base = run(['rev-parse', 'HEAD'])
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const resumed = await call(fake, 'openspec_review', {
    action: 'resume', change: CHANGE, review: 'apply', base,
  })
  assert.match(resumed.brief, /The base is the explicit base passed to this review\./)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.baseSource, 'explicit')
})

test('apply review ignores a blank base and keeps the seal source', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply', base: '   ',
  })
  assert.match(started.brief, /The base is the seal commit recorded by the first `openspec_apply_next`\./)
})

test('openspec_review declares the optional apply base and ignores it outside apply', async () => {
  const { root } = gitFixture()
  const fake = setup(root)
  const schema = fake.tools.get('openspec_review').parameters
  assert.equal(schema.properties.base.type, 'string')
  assert.ok(schema.properties.base.description.includes('Apply review base'))
  assert.equal(schema.required.includes('base'), false)
  assert.equal(schema.properties.baseline.type, 'string')
  assert.deepEqual(schema.properties.baseline.enum, ['draft', 'none'])
  assert.equal(schema.required.includes('baseline'), false)
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, base: 'ignored' })
  assert.equal(status.review, 'draft')
  assert.equal(status.state, 'not-started')
})

test('apply start and resume reject dispositions and gate open findings', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, review: 'apply', dispositions: [],
    }),
    /start does not accept dispositions.*action=dispose/,
  )
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'resume', change: CHANGE, review: 'apply',
      dispositions: [{ id: 'R1-01', status: 'fixed', note: 'x' }],
    }),
    /resume does not accept dispositions.*action=dispose/,
  )
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply',
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' }),
    /still open: R1-01.*action=dispose review=apply/,
  )
  await call(fake, 'openspec_review', {
    action: 'dispose', change: CHANGE, review: 'apply', id: 'R1-01', status: 'fixed', note: 'Fixed.',
  })
  const next = await call(fake, 'openspec_review', {
    action: 'resume', change: CHANGE, review: 'apply',
  })
  assert.equal(next.round, 2)
  assert.match(next.brief, /"id": "R2-01"/)
  assert.match(next.brief, /"verifications": \[\{ "id": "R1-01"/)
})

test('an apply record without findings still renders the report contract', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const intentTarget = /^- intent: (.+)$/mu.exec(started.brief)?.[1]
  const diffTarget = /^- diff: (.+)$/mu.exec(started.brief)?.[1]
  assert.ok(intentTarget !== undefined && existsSync(intentTarget), `apply brief intent path exists: ${intentTarget}`)
  assert.ok(diffTarget !== undefined && existsSync(diffTarget), `apply brief diff path exists: ${diffTarget}`)
  const path = join(reviewDir(root), 'apply-review.json')
  const record = JSON.parse(readFileSync(path, 'utf8'))
  delete record.findings
  writeFileSync(path, JSON.stringify(record, null, 2))
  const resumed = await call(fake, 'openspec_review', {
    action: 'resume', change: CHANGE, review: 'apply',
  })
  assert.equal(resumed.round, 1)
  assert.match(resumed.brief, /"verifications": \[\]/)
})

test('the apply gate points an abandoned review at a new change', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const intentTarget = /^- intent: (.+)$/mu.exec(started.brief)?.[1]
  const diffTarget = /^- diff: (.+)$/mu.exec(started.brief)?.[1]
  assert.ok(intentTarget !== undefined && existsSync(intentTarget), `apply brief intent path exists: ${intentTarget}`)
  assert.ok(diffTarget !== undefined && existsSync(diffTarget), `apply brief diff path exists: ${diffTarget}`)
  await call(fake, 'openspec_review', { action: 'abandon', change: CHANGE, review: 'apply' })
  await assert.rejects(
    call(fake, 'openspec_archive', { change: CHANGE }),
    /Next: openspec_new_change/,
  )
})

test('apply review is idempotent after pass and a legacy round cap does not block a new round', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const intentTarget = /^- intent: (.+)$/mu.exec(started.brief)?.[1]
  const diffTarget = /^- diff: (.+)$/mu.exec(started.brief)?.[1]
  assert.ok(intentTarget !== undefined && existsSync(intentTarget), `apply brief intent path exists: ${intentTarget}`)
  assert.ok(diffTarget !== undefined && existsSync(diffTarget), `apply brief diff path exists: ${diffTarget}`)
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  const again = await call(fake, 'openspec_review', {
    action: 'resume', change: CHANGE, review: 'apply',
  })
  assert.equal(again.state, 'passed')
  assert.match(again.brief, /Apply review brief/)

  const cappedRoot = gitFixture()
  const capped = setup(cappedRoot.root, {
    draft: { enabled: true }, apply: { enabled: true, maxRounds: 1 },
  })
  await passDraft(capped, cappedRoot.root, cappedRoot.run)
  await call(capped, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(capped, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply',
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await assert.rejects(
    call(capped, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' }),
    /still open: R1-01/,
  )
  await call(capped, 'openspec_review', {
    action: 'dispose', change: CHANGE, review: 'apply', id: 'R1-01', status: 'fixed', note: 'Fixed.',
  })
  const next = await call(capped, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  assert.equal(next.round, 2)
})

test('apply review supports status, report, extend, dispose and abandon', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const status = await call(fake, 'openspec_review', {
    action: 'status', change: CHANGE, review: 'apply',
  })
  assert.equal(status.state, 'not-started')
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'report', change: CHANGE, review: 'apply' }),
    /no report/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', change: CHANGE, review: 'apply', id: 'R1-01', status: 'fixed', note: 'x',
    }),
    /not recorded/,
  )
  const extended = await call(fake, 'openspec_review', {
    action: 'extend', change: CHANGE, review: 'apply', approvedBy: 'user', reason: 'more', minutes: 10,
  })
  assert.equal(extended.state, 'in-review')
  const abandoned = await call(fake, 'openspec_review', {
    action: 'abandon', change: CHANGE, review: 'apply', reason: 'superseded',
  })
  assert.equal(abandoned.state, 'abandoned')
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /already started/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' }),
    /abandoned/,
  )
})

test('an apply review disposes a dispositions batch', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const intentTarget = /^- intent: (.+)$/mu.exec(started.brief)?.[1]
  const diffTarget = /^- diff: (.+)$/mu.exec(started.brief)?.[1]
  assert.ok(intentTarget !== undefined && existsSync(intentTarget), `apply brief intent path exists: ${intentTarget}`)
  assert.ok(diffTarget !== undefined && existsSync(diffTarget), `apply brief diff path exists: ${diffTarget}`)
  await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    review: 'apply',
    report: report({ verdict: 'changes-requested', findings: [majorFinding(), minorFinding()] }),
  })
  const result = await call(fake, 'openspec_review', {
    action: 'dispose',
    change: CHANGE,
    review: 'apply',
    dispositions: [
      { id: 'R1-01', status: 'fixed', note: 'Added the task.' },
      { id: 'R1-02', status: 'deferred', note: 'Follow up in ISS-7.' },
    ],
  })
  assert.deepEqual(result.dispositions, [
    { id: 'R1-01', status: 'fixed' },
    { id: 'R1-02', status: 'deferred' },
  ])
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.findings.find((finding) => finding.id === 'R1-01').status, 'fixed')
  assert.equal(record.findings.find((finding) => finding.id === 'R1-02').status, 'deferred')
})

test('archive refuses before an apply review and after dirtying the tree', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  await assert.rejects(
    call(fake, 'openspec_archive', { change: CHANGE }),
    /apply review has not started/,
  )
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  writeFileSync(join(root, 'dirty.txt'), 'dirty\n')
  await assert.rejects(
    call(fake, 'openspec_archive', { change: CHANGE }),
    /clean working tree/,
  )
})

test('apply status reports unavailable without git and does not fail', async () => {
  const root = fixture()
  const fake = setup(root)
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'apply' })
  assert.equal(status.policy, false)
  assert.equal(status.enabled, false)
  assert.equal(status.available, false)
  assert.match(status.reasons.join(' '), /no git repository/)
  assert.equal(status.nextAction, 'openspec_archive')
})

test('apply status separates new, legacy and draft-only no-git policies', async () => {
  const root = fixture()
  const fake = setup(root, { draft: { enabled: true }, apply: { enabled: true } })
  await call(fake, 'openspec_new_change', { name: 'add-new-policy' })
  const locked = await call(fake, 'openspec_review', {
    action: 'status', change: 'add-new-policy', review: 'apply',
  })
  assert.equal(locked.policy, true)
  assert.equal(locked.enabled, false)
  assert.equal(locked.available, false)
  assert.equal(locked.nextAction, 'openspec_archive')

  writePolicy(root, CHANGE, {
    draft: { enabled: true, reviewers: 0, maxRounds: 3, waitMinutes: 15 },
    apply: { enabled: true, reviewers: 0, maxRounds: 5, waitMinutes: 15 },
  })
  const legacy = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'apply' })
  assert.equal(legacy.policy, true)
  assert.equal(legacy.enabled, true)
  assert.equal(legacy.available, false)
  assert.equal(legacy.nextAction, 'openspec_archive')

  await call(fake, 'openspec_new_change', { name: 'add-draft-only' })
  writePolicy(root, 'add-draft-only', {
    draft: { enabled: true, reviewers: 0, maxRounds: 3, waitMinutes: 15 },
  })
  const draftOnly = await call(fake, 'openspec_review', {
    action: 'status', change: 'add-draft-only', review: 'apply',
  })
  assert.equal(draftOnly.policy, false)
  assert.equal(draftOnly.enabled, false)
  assert.equal(draftOnly.available, false)
  assert.equal(draftOnly.nextAction, 'openspec_archive')
})

test('apply status reports disabled, enabled and unset git policies', async () => {
  const { root } = gitFixture()
  const disabledFake = setup(root, { draft: { enabled: true }, apply: { enabled: false } })
  await call(disabledFake, 'openspec_new_change', { name: 'add-disabled-apply' })
  const disabled = await call(disabledFake, 'openspec_review', {
    action: 'status', change: 'add-disabled-apply', review: 'apply',
  })
  assert.equal(disabled.policy, true)
  assert.equal(disabled.enabled, false)
  assert.equal(disabled.available, true)
  assert.equal(disabled.nextAction, 'openspec_archive')

  const enabledFake = setup(root, { draft: { enabled: true }, apply: { enabled: true } })
  await call(enabledFake, 'openspec_new_change', { name: 'add-enabled-apply' })
  const enabled = await call(enabledFake, 'openspec_review', {
    action: 'status', change: 'add-enabled-apply', review: 'apply',
  })
  assert.equal(enabled.policy, true)
  assert.equal(enabled.enabled, true)
  assert.equal(enabled.available, true)
  assert.equal(enabled.nextAction, 'openspec_review action=start review=apply')
  assert.equal(enabled.currentObjectHash, undefined)
  assert.match(enabled.reasons.join(' '), /apply review has not started/)

  const unset = await call(enabledFake, 'openspec_review', { action: 'status', change: CHANGE, review: 'apply' })
  assert.equal(unset.policy, false)
  assert.equal(unset.enabled, false)
  assert.equal(unset.available, true)
  assert.match(unset.nextAction, /openspec_review action=start/)
})

test('a draft-only policy reports the configPath supplement and refuses a start without it', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const policyPath = join(reviewDir(root), 'policy.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  delete policy.reviews.apply
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)

  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'apply' })
  assert.equal(status.policy, false)
  assert.equal(status.enabled, false)
  assert.equal(status.available, true)
  assert.match(status.reasons.join(' '), /configPath/)
  assert.match(status.nextAction, /openspec_review action=start/)
  assert.match(status.nextAction, /configPath=openspec\/reviews\.json/)

  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /unknown review entry "apply".*configured entries/,
  )
})

test('a locked policy refuses an undeclared entry and a configPath supplements it once', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  const directory = reviewDir(root)
  mkdirSync(directory, { recursive: true })
  const policyPath = join(directory, 'policy.json')
  writeFileSync(policyPath, `${JSON.stringify({
    schemaVersion: 3,
    change: CHANGE,
    store: null,
    git: { enabled: true },
    pipeline: { beforeApply: 'draft', beforeArchive: 'apply' },
    lockedAt: '2026-01-01T00:00:00.000Z',
    lockedBy: 'test',
    reviews: {
      draft: {
        object: 'directory', enabled: true, reviewers: 0, waitMinutes: 15,
        reviewerModel: { source: 'inherit', provider: 'deepseek', model: 'deepseek-flash' },
      },
      apply: {
        object: 'tree', enabled: true, reviewers: 0, waitMinutes: 15,
        reviewerModel: { source: 'inherit', provider: 'deepseek', model: 'deepseek-flash' },
      },
    },
  }, null, 2)}\n`)

  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'pr', baseline: 'none', base: 'HEAD' }),
    /unknown review entry "pr".*configured entries: draft, apply/,
  )

  const outside = mkdtempSync(join(tmpdir(), 'openspec-flow-baseline-'))
  const custom = join(outside, 'reviews.json')
  writeFileSync(custom, JSON.stringify({
    profiles: {
      d: { object: 'directory', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
      t: { object: 'tree', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
      p: { object: 'tree', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
    },
    reviews: { draft: 'd', apply: 't', pr: 'p' },
    pipeline: { beforeApply: 'draft', beforeArchive: 'apply' },
  }))
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'commit the change for the pr review'])
  const head = run(['rev-parse', 'HEAD'])
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'pr', configPath: custom, baseline: 'none', base: head,
  })
  assert.equal(started.review, 'pr')
  const supplemented = JSON.parse(readFileSync(policyPath, 'utf8'))
  assert.equal(supplemented.schemaVersion, 4)
  assert.equal(supplemented.reviews.pr.object, 'tree')
  assert.deepEqual(supplemented.pipeline, { beforeApply: 'draft', beforeArchive: 'apply' })
  const bytes = readFileSync(policyPath, 'utf8')
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, review: 'pr', configPath: custom, baseline: 'none', base: head,
    }),
    /already|record/i,
  )
  assert.equal(readFileSync(policyPath, 'utf8'), bytes)
})

test('a draft-only policy migrates from the supplied configuration path', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const policyPath = join(reviewDir(root), 'policy.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  delete policy.reviews.apply
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)

  const outside = mkdtempSync(join(tmpdir(), 'openspec-flow-baseline-'))
  const custom = join(outside, 'reviews.json')
  writeFileSync(custom, JSON.stringify({
    profiles: {
      d: { object: 'directory', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
      t: { object: 'tree', enabled: true, reviewers: 0, waitMinutes: 30, reviewerModel: { source: 'inherit' } },
    },
    reviews: { draft: 'd', apply: 't' },
  }))
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply', configPath: custom,
  })
  assert.equal(started.review, 'apply')
  const migrated = JSON.parse(readFileSync(policyPath, 'utf8'))
  assert.equal(migrated.reviews.apply.waitMinutes, 30)
})

test('the disabled switch clears both review gates for a locked change', async () => {
  const { root } = gitFixture()
  writePolicy(root, CHANGE, {
    draft: { enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit', provider: 'deepseek', model: 'deepseek-flash' } },
    apply: { enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit', provider: 'deepseek', model: 'deepseek-flash' } },
  })
  const signal = new AbortController().signal
  const off = setup(root, undefined, { reviewEnabled: false })
  const draft = await assertDraftReviewReady(off.ctx, off.settings, root, CHANGE, undefined, signal)
  assert.ok(draft.context)
  const apply = await assertApplyReviewReady(off.ctx, off.settings, root, CHANGE, undefined, signal)
  assert.ok(apply.context)

  const on = setup(root, undefined, { reviewEnabled: true })
  await assert.rejects(
    assertDraftReviewReady(on.ctx, on.settings, root, CHANGE, undefined, signal),
    /draft review has not started/,
  )
  await assert.rejects(
    assertApplyReviewReady(on.ctx, on.settings, root, CHANGE, undefined, signal),
    /apply review has not started/,
  )
})

test('starting the same round twice before a report resumes it', async () => {
  const root = fixture()
  const fake = setup(root)
  const first = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const second = await call(fake, 'openspec_review', {
    action: 'resume', change: CHANGE,
  })
  assert.equal(second.round, first.round)

  const { root: gitRoot, run } = gitFixture()
  const gitFake = setup(gitRoot)
  await passDraft(gitFake, gitRoot, run)
  const applyFirst = await call(gitFake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply',
  })
  const applySecond = await call(gitFake, 'openspec_review', {
    action: 'resume', change: CHANGE, review: 'apply',
  })
  assert.equal(applySecond.round, applyFirst.round)
})

test('apply start refuses an unknown base and a wrong round', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, { draft: { enabled: false }, apply: { enabled: true } })
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'seal the draft'])
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /base commit/,
  )
  if (existsSync(join(root, 'openspec', '.gitignore'))) {
    run(['add', 'openspec/.gitignore'])
    run(['commit', '-m', 'add review ignore'])
  }
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, review: 'apply', base: run(['rev-parse', 'HEAD']), round: 2,
    }),
    /next apply review round is 1/,
  )
})

test('apply status reads a recorded tree', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const intentTarget = /^- intent: (.+)$/mu.exec(started.brief)?.[1]
  const diffTarget = /^- diff: (.+)$/mu.exec(started.brief)?.[1]
  assert.ok(intentTarget !== undefined && existsSync(intentTarget), `apply brief intent path exists: ${intentTarget}`)
  assert.ok(diffTarget !== undefined && existsSync(diffTarget), `apply brief diff path exists: ${diffTarget}`)
  const status = await call(fake, 'openspec_review', {
    action: 'status', change: CHANGE, review: 'apply',
  })
  assert.equal(status.state, 'in-review')
  assert.equal(status.treeSha, run(['rev-parse', 'HEAD^{tree}']))
})

test('apply start fails closed when a locked policy needs a reviewer but the service is absent', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const policyPath = join(reviewDir(root), 'policy.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  policy.reviews.apply.reviewers = 1
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /reviewer service is unavailable/,
  )
})

test('apply status names resume with the apply kind when the tree moved', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const intentTarget = /^- intent: (.+)$/mu.exec(started.brief)?.[1]
  const diffTarget = /^- diff: (.+)$/mu.exec(started.brief)?.[1]
  assert.ok(intentTarget !== undefined && existsSync(intentTarget), `apply brief intent path exists: ${intentTarget}`)
  assert.ok(diffTarget !== undefined && existsSync(diffTarget), `apply brief diff path exists: ${diffTarget}`)
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'design.md'), '# Design\n\nChanged after the pass.\n')
  run(['add', 'openspec'])
  run(['commit', '-m', 'move the tree'])
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'apply' })
  assert.equal(status.nextAction, 'openspec_review action=resume review=apply')
})

test('apply resume refuses a record without a policy', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const intentTarget = /^- intent: (.+)$/mu.exec(started.brief)?.[1]
  const diffTarget = /^- diff: (.+)$/mu.exec(started.brief)?.[1]
  assert.ok(intentTarget !== undefined && existsSync(intentTarget), `apply brief intent path exists: ${intentTarget}`)
  assert.ok(diffTarget !== undefined && existsSync(diffTarget), `apply brief diff path exists: ${diffTarget}`)
  rmSync(join(reviewDir(root), 'policy.json'))
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' }),
    /apply review policy is missing; remove the review record/,
  )
})

test('apply refuses an unsealed change when the working tree is dirty', async () => {
  const { root } = gitFixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() })
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /commit or stash these changes first/,
  )
})

test('apply refuses a seal commit that changes files outside the change directory', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() })
  writeFileSync(join(root, 'outside.txt'), 'outside\n')
  run(['add', 'openspec'])
  run(['add', 'outside.txt'])
  run(['commit', '-m', 'mixed seal'])
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /the seal commit must contain only 'openspec\/changes\/add-dark-mode\//,
  )
})

test('apply refuses a seal commit without a change-directory file', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() })
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'seal the change'])
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  run(['add', 'openspec/.gitignore'])
  run(['commit', '-m', 'ignore only'])
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /must change at least one file under 'openspec\/changes\/add-dark-mode\//,
  )
})

test('apply refuses a changed plan before the seal records a base', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() })
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'seal the change'])
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'), '# Changed after draft\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'change the plan'])
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /the change artifacts changed since the review started/,
  )
})

test('a project without git skips the seal', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() })
  const applied = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(applied.change, CHANGE)
})

test('apply re-syncs after a plan change once apply started', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'design.md'), '# Design changed during apply\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'change the plan during apply'])
  const applied = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(applied.change, CHANGE)
})

test('draft status points at the apply review once apply started', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'design.md'), '# Design changed during apply\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'change the plan during apply'])
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE })
  assert.match(status.nextAction, /review=apply/)
  assert.equal(status.reasons.includes('the change artifacts changed since the review started'), false)
})

test('a plan-change waiver needs a started apply', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'waive', scope: 'plan-change', change: CHANGE,
      approvedBy: 'user', waiver: 'Approved.', files: ['design.md'],
    }),
    /needs a started apply/,
  )
})

test('a plan-change waiver is recorded and merges files', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const first = await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'The user approved the design change.', files: ['design.md'],
  })
  assert.deepEqual(first.planChangeWaiver.files, ['design.md'])
  assert.match(first.nextAction, /start review=apply/)
  const second = await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'The user approved the task change.', files: ['tasks.md'],
  })
  assert.deepEqual(second.planChangeWaiver.files, ['design.md', 'tasks.md'])
  assert.equal(second.planChangeWaiver.text, 'The user approved the task change.')
  const stored = JSON.parse(readFileSync(join(reviewDir(root), 'plan-change-waiver.json'), 'utf8'))
  assert.deepEqual(stored.files, ['design.md', 'tasks.md'])
})

test('apply review refuses an unwaived plan change', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 1. New\n\n- [ ] 1.1 New task\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'change plan'])
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /needs a user waiver for the changed plan files: tasks\.md/,
  )
})

test('a plan-change waiver validates its approval, text and files', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'waive', scope: 'plan-change', change: CHANGE, waiver: 'x', files: ['design.md'],
    }),
    /needs approvedBy user/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'waive', scope: 'plan-change', change: CHANGE, approvedBy: 'user', files: ['design.md'],
    }),
    /needs the waiver text/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'waive', scope: 'plan-change', change: CHANGE, approvedBy: 'user', waiver: 'x',
    }),
    /needs the changed files/,
  )
  const filtered = await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'x', files: [' design.md ', ''],
  })
  assert.deepEqual(filtered.planChangeWaiver.files, ['design.md'])
})

test('apply review refuses an unwaived plan change on resume', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const intentTarget = /^- intent: (.+)$/mu.exec(started.brief)?.[1]
  const diffTarget = /^- diff: (.+)$/mu.exec(started.brief)?.[1]
  assert.ok(intentTarget !== undefined && existsSync(intentTarget), `apply brief intent path exists: ${intentTarget}`)
  assert.ok(diffTarget !== undefined && existsSync(diffTarget), `apply brief diff path exists: ${diffTarget}`)
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 2. More\n\n- [ ] 2.1 More work\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'change plan during apply'])
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' }),
    /needs a user waiver for the changed plan files: tasks\.md/,
  )
  await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'Approved on resume.', files: ['tasks.md'],
  })
  const resumed = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  assert.equal(resumed.round, 2)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.draftDrift.files[0].path, 'tasks.md')
})

test('a legacy draft record without artifact files records an empty drift list', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const recordPath = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(recordPath, 'utf8'))
  delete record.artifactFiles
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 2. More\n\n- [ ] 2.1 More work\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'change plan without a recorded list'])
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  assert.match(started.brief, /no per-file list was recorded for this draft/)
  const applyRecord = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.deepEqual(applyRecord.draftDrift.files, [])
})

test('the seal names a recovery that stays available after apply started', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const intentTarget = /^- intent: (.+)$/mu.exec(started.brief)?.[1]
  const diffTarget = /^- diff: (.+)$/mu.exec(started.brief)?.[1]
  assert.ok(intentTarget !== undefined && existsSync(intentTarget), `apply brief intent path exists: ${intentTarget}`)
  assert.ok(diffTarget !== undefined && existsSync(diffTarget), `apply brief diff path exists: ${diffTarget}`)
  const recordPath = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(recordPath, 'utf8'))
  delete record.applyBaseCommit
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'design.md'), '# Changed after apply\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'change after apply'])
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /record a user waiver with openspec_review action=waive scope=plan-change/,
  )
})

test('a store-backed change skips the seal and keeps the warning', async () => {
  const { root } = gitFixture()
  const external = mkdtempSync(join(tmpdir(), 'openspec-flow-store-'))
  const externalChange = join(external, 'changes', CHANGE)
  try {
    cpSync(join(root, 'openspec', 'changes', CHANGE), externalChange, { recursive: true })
    const fake = setup(root)
    const original = fake.ctx.subprocess.spawn
    fake.ctx.subprocess.spawn = (spec) => {
      if (spec.argv.includes('status') && spec.argv.includes('--change')) {
        const payload = JSON.stringify({
          root: { path: root },
          changeRoot: externalChange,
          changeName: CHANGE,
          schemaName: 'spec-driven',
        })
        return {
          done: Promise.resolve({ exitCode: 0, signal: undefined }),
          collected: {
            stdout: { readFrom: () => ({ text: payload, lossy: false }) },
            stderr: { readFrom: () => ({ text: '', lossy: false }) },
          },
          terminate() {},
          waitForExit() {
            return Promise.resolve(true)
          },
        }
      }
      return original(spec)
    }
    await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
    await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() })
    const applied = await call(fake, 'openspec_apply_next', { change: CHANGE })
    assert.match(applied.warnings.join(' '), /seal checks were skipped for a store-backed change/)
    const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
    assert.equal(record.applyBaseCommit, undefined)
  } finally {
    rmSync(external, { recursive: true, force: true })
  }
})

test('a started apply freezes draft dispositions and not apply ones', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const draftFile = join(reviewDir(root), 'review.json')
  const draft = JSON.parse(readFileSync(draftFile, 'utf8'))
  draft.findings = [{
    id: 'R1-01',
    severity: 'major',
    axis: 'coherence',
    location: 'proposal.md',
    title: 'Draft finding',
    problem: 'The proposal and tasks disagree.',
    evidence: 'proposal.md adds a capability tasks.md does not implement.',
    impact: 'The implementation would miss the capability.',
    rule: 'proposal Capabilities and tasks coverage',
    failure: 'An agent follows tasks.md and skips the capability.',
    suggestion: 'Add the task.',
    status: 'open',
    firstRound: 1,
  }]
  writeFileSync(draftFile, `${JSON.stringify(draft, null, 2)}\n`)
  const applyFile = join(reviewDir(root), 'apply-review.json')

  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Fixed.',
    }),
    (error) => {
      assert.match(error.message, /frozen once apply started/)
      assert.match(error.message, /openspec_review action=status review=apply/)
      return true
    },
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'waive', review: 'draft', change: CHANGE, id: 'R1-01', approvedBy: 'user', waiver: 'Accepted.',
    }),
    /frozen once apply started/,
  )
  const untouched = JSON.parse(readFileSync(draftFile, 'utf8'))
  assert.equal(untouched.findings[0].status, 'open')
  assert.equal(untouched.findings[0].disposedAt, undefined)
  assert.equal(existsSync(applyFile), false)

  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', {
    action: 'self-report', review: 'apply', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  const disposed = await call(fake, 'openspec_review', {
    action: 'dispose', review: 'apply', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Fixed the task.',
  })
  assert.deepEqual(disposed.dispositions, [{ id: 'R1-01', status: 'fixed' }])
  const draftAfter = JSON.parse(readFileSync(draftFile, 'utf8'))
  assert.equal(draftAfter.findings[0].status, 'open')
})

test('a waiver records project-relative and absolute paths change-relative', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const changeRoot = join(root, 'openspec', 'changes', CHANGE)
  const waived = await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'Approved.',
    files: [`openspec/changes/${CHANGE}/proposal.md`, join(changeRoot, 'tasks.md'), 'design.md'],
  })
  assert.deepEqual(waived.planChangeWaiver.files, ['design.md', 'proposal.md', 'tasks.md'])
  const stored = JSON.parse(readFileSync(join(reviewDir(root), 'plan-change-waiver.json'), 'utf8'))
  assert.deepEqual(stored.files, ['design.md', 'proposal.md', 'tasks.md'])
})

test('a second waiver normalizes a legacy recorded set', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  writeFileSync(join(reviewDir(root), 'plan-change-waiver.json'), `${JSON.stringify({
    text: 'legacy',
    approvedBy: 'user',
    files: [`openspec/changes/${CHANGE}/proposal.md`, 'proposal.md'],
    recordedAt: new Date().toISOString(),
  })}\n`)
  const waived = await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'Approved the task.', files: ['tasks.md'],
  })
  assert.deepEqual(waived.planChangeWaiver.files, ['proposal.md', 'tasks.md'])
})

test('a refused waiver entry names the entry and writes nothing', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'waive', scope: 'plan-change', change: CHANGE,
      approvedBy: 'user', waiver: 'Approved.', files: ['../outside.md'],
    }),
    /refused these files:[\s\S]*\.\.\/outside\.md[\s\S]*outside the change directory/,
  )
  assert.equal(existsSync(join(reviewDir(root), 'plan-change-waiver.json')), false)
  const filtered = await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'Approved.', files: [' design.md ', ''],
  })
  assert.deepEqual(filtered.planChangeWaiver.files, ['design.md'])
})

test('a legacy waiver with project-relative paths lets apply review start', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  writeFileSync(join(reviewDir(root), 'plan-change-waiver.json'), `${JSON.stringify({
    text: 'legacy',
    approvedBy: 'user',
    files: [`openspec/changes/${CHANGE}/tasks.md`],
    recordedAt: new Date().toISOString(),
  })}\n`)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 2. More\n\n- [ ] 2.1 More work\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'change plan'])
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  assert.equal(started.review, 'apply')
  assert.match(started.brief, /- files: tasks\.md/)
})

test('the unwaived error carries the change-relative example', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'design.md'), '# Design changed\n')
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 2. More\n\n- [ ] 2.1 More work\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'change plan'])
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /files: \["design\.md","tasks\.md"\][\s\S]*relative to the change directory/,
  )
})

test('a legacy-form waiver lets a later apply round resume', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const intentTarget = /^- intent: (.+)$/mu.exec(started.brief)?.[1]
  const diffTarget = /^- diff: (.+)$/mu.exec(started.brief)?.[1]
  assert.ok(intentTarget !== undefined && existsSync(intentTarget), `apply brief intent path exists: ${intentTarget}`)
  assert.ok(diffTarget !== undefined && existsSync(diffTarget), `apply brief diff path exists: ${diffTarget}`)
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 2. More\n\n- [ ] 2.1 More work\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'change plan'])
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' }),
    /needs a user waiver for the changed plan files: tasks\.md/,
  )
  await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'Approved.', files: [`openspec/changes/${CHANGE}/tasks.md`],
  })
  const resumed = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  assert.equal(resumed.round, 2)
})

test('a legacy waiver with an unnormalizable entry does not block a covered start', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  writeFileSync(join(reviewDir(root), 'plan-change-waiver.json'), `${JSON.stringify({
    text: 'legacy',
    approvedBy: 'user',
    files: ['openspec/changes/other-change/tasks.md', 'tasks.md'],
    recordedAt: new Date().toISOString(),
  })}\n`)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 2. More\n\n- [ ] 2.1 More work\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'change plan'])
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  assert.equal(started.review, 'apply')
  assert.match(started.brief, /- files: tasks\.md/)
})

test('a waiver before the apply review does not claim coverage', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const waived = await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'Approved.', files: ['proposal.md'],
  })
  assert.equal(waived.ready, false)
  assert.match(waived.reasons.join(' '), /coverage is checked when the apply review starts/)
})

test('a waiver result names the uncovered drift', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const intentTarget = /^- intent: (.+)$/mu.exec(started.brief)?.[1]
  const diffTarget = /^- diff: (.+)$/mu.exec(started.brief)?.[1]
  assert.ok(intentTarget !== undefined && existsSync(intentTarget), `apply brief intent path exists: ${intentTarget}`)
  assert.ok(diffTarget !== undefined && existsSync(diffTarget), `apply brief diff path exists: ${diffTarget}`)
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'), '# Proposal changed\n')
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 2. More\n\n- [ ] 2.1 More work\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'change plan'])
  const waived = await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'Approved.', files: ['proposal.md'],
  })
  assert.equal(waived.ready, false)
  assert.match(waived.reasons.join(' '), /does not cover tasks\.md/)
})

test('a plan-change waiver follows the planning/pr pipeline and names pr drift', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const directory = reviewDir(root)
  const draftRecord = JSON.parse(readFileSync(join(directory, 'review.json'), 'utf8'))
  writeFileSync(join(directory, 'planning-review.json'), `${JSON.stringify({ ...draftRecord, review: 'planning' }, null, 2)}\n`)
  writeFileSync(join(directory, 'pr-review.json'), `${JSON.stringify({
    review: 'pr',
    state: 'in-review',
    rounds: [{ round: 1 }],
    draftDrift: { currentObjectHash: draftRecord.objectHash },
  }, null, 2)}\n`)
  const policyPath = join(directory, 'policy.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  const model = policy.reviews.apply.reviewerModel
  policy.reviews.planning = { object: 'directory', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: model }
  policy.reviews.pr = { object: 'tree', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: model }
  policy.pipeline = { beforeApply: 'planning', beforeArchive: 'pr' }
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)

  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'), '# Proposal changed\n')
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 2. More\n\n- [ ] 2.1 More work\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'change plan'])

  const waived = await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'Approved.', files: ['proposal.md'],
  })
  assert.equal(waived.review, 'planning')
  assert.match(waived.nextAction, /review=pr/)
  assert.equal(waived.ready, false)
  assert.match(waived.reasons.join(' '), /does not cover tasks\.md/)
  const waiver = JSON.parse(readFileSync(join(directory, 'plan-change-waiver.json'), 'utf8'))
  assert.equal(waiver.draftObjectHash, draftRecord.objectHash)
})

test('a waiver that covers every drift file reports ready', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const intentTarget = /^- intent: (.+)$/mu.exec(started.brief)?.[1]
  const diffTarget = /^- diff: (.+)$/mu.exec(started.brief)?.[1]
  assert.ok(intentTarget !== undefined && existsSync(intentTarget), `apply brief intent path exists: ${intentTarget}`)
  assert.ok(diffTarget !== undefined && existsSync(diffTarget), `apply brief diff path exists: ${diffTarget}`)
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'), '# Proposal changed\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'change plan'])
  const waived = await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'Approved.', files: [`openspec/changes/${CHANGE}/proposal.md`],
  })
  assert.equal(waived.ready, true)
  assert.deepEqual(waived.reasons, [])
})

test('a waiver in a draft-disabled project is recorded without coverage', async () => {
  const { root, run } = gitFixture()
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'seal the draft'])
  const base = run(['rev-parse', 'HEAD'])
  const fake = setup(root, { draft: { enabled: false }, apply: { enabled: true } })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply', base,
  })
  const waived = await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'Approved.', files: ['proposal.md'],
  })
  assert.equal(waived.ready, false)
  assert.match(waived.reasons.join(' '), /draft review is disabled or its record is missing/)
  const stored = JSON.parse(readFileSync(join(reviewDir(root), 'plan-change-waiver.json'), 'utf8'))
  assert.deepEqual(stored.files, ['proposal.md'])
})

test('a waiver with a legacy draft record without artifact files lists no artifact', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const intentTarget = /^- intent: (.+)$/mu.exec(started.brief)?.[1]
  const diffTarget = /^- diff: (.+)$/mu.exec(started.brief)?.[1]
  assert.ok(intentTarget !== undefined && existsSync(intentTarget), `apply brief intent path exists: ${intentTarget}`)
  assert.ok(diffTarget !== undefined && existsSync(diffTarget), `apply brief diff path exists: ${diffTarget}`)
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  const recordPath = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(recordPath, 'utf8'))
  delete record.artifactFiles
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'), '# Proposal changed\n')
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'change plan'])
  const waived = await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'Approved.', files: ['proposal.md'],
  })
  assert.equal(waived.ready, false)
  assert.match(waived.reasons.join(' '), /no per-file drift was recorded/)
  assert.doesNotMatch(waived.reasons.join(' '), /does not cover/)
})

test('a store-backed waiver refuses the project-relative form and keeps change-relative', async () => {
  const { root, run } = gitFixture()
  const external = mkdtempSync(join(tmpdir(), 'openspec-flow-store-'))
  const externalChange = join(external, 'changes', CHANGE)
  try {
    cpSync(join(root, 'openspec', 'changes', CHANGE), externalChange, { recursive: true })
    const fake = setup(root)
    const original = fake.ctx.subprocess.spawn
    fake.ctx.subprocess.spawn = (spec) => {
      if (spec.argv.includes('status') && spec.argv.includes('--change')) {
        const payload = JSON.stringify({
          root: { path: root },
          changeRoot: externalChange,
          changeName: CHANGE,
          schemaName: 'spec-driven',
        })
        return {
          done: Promise.resolve({ exitCode: 0, signal: undefined }),
          collected: {
            stdout: { readFrom: () => ({ text: payload, lossy: false }) },
            stderr: { readFrom: () => ({ text: '', lossy: false }) },
          },
          terminate() {},
          waitForExit() {
            return Promise.resolve(true)
          },
        }
      }
      return original(spec)
    }
    await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
    await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() })
    const recordPath = join(reviewDir(root), 'review.json')
    const record = JSON.parse(readFileSync(recordPath, 'utf8'))
    record.applyBaseCommit = run(['rev-parse', 'HEAD'])
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`)
    await assert.rejects(
      call(fake, 'openspec_review', {
        action: 'waive', scope: 'plan-change', change: CHANGE,
        approvedBy: 'user', waiver: 'Approved.', files: [`openspec/changes/${CHANGE}/proposal.md`],
      }),
      /refused these files:[\s\S]*change-relative or absolute/,
    )
    const waived = await call(fake, 'openspec_review', {
      action: 'waive', scope: 'plan-change', change: CHANGE,
      approvedBy: 'user', waiver: 'Approved.', files: ['proposal.md'],
    })
    assert.deepEqual(waived.planChangeWaiver.files, ['proposal.md'])
  } finally {
    rmSync(external, { recursive: true, force: true })
  }
})

test('a waiver after apply start with no drift reports no drift pending', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const intentTarget = /^- intent: (.+)$/mu.exec(started.brief)?.[1]
  const diffTarget = /^- diff: (.+)$/mu.exec(started.brief)?.[1]
  assert.ok(intentTarget !== undefined && existsSync(intentTarget), `apply brief intent path exists: ${intentTarget}`)
  assert.ok(diffTarget !== undefined && existsSync(diffTarget), `apply brief diff path exists: ${diffTarget}`)
  const waived = await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'Approved.', files: ['proposal.md'],
  })
  assert.equal(waived.ready, false)
  assert.match(waived.reasons.join(' '), /no drift is pending/)
})

test('a waiver whose coverage cannot be computed reports the error', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const intentTarget = /^- intent: (.+)$/mu.exec(started.brief)?.[1]
  const diffTarget = /^- diff: (.+)$/mu.exec(started.brief)?.[1]
  assert.ok(intentTarget !== undefined && existsSync(intentTarget), `apply brief intent path exists: ${intentTarget}`)
  assert.ok(diffTarget !== undefined && existsSync(diffTarget), `apply brief diff path exists: ${diffTarget}`)
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  rmSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'))
  const waived = await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'Approved.', files: ['tasks.md'],
  })
  assert.equal(waived.ready, false)
  assert.match(waived.reasons.join(' '), /coverage could not be computed/)
})

test('a waiver accepts a file that does not exist yet', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const waived = await call(fake, 'openspec_review', {
    action: 'waive', scope: 'plan-change', change: CHANGE,
    approvedBy: 'user', waiver: 'Approved.',
    files: [`openspec/changes/${CHANGE}/specs/new-capability/spec.md`],
  })
  assert.deepEqual(waived.planChangeWaiver.files, ['specs/new-capability/spec.md'])
})

test('a rebase marker opens extra rounds without changing the normal rounds', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  const file = join(reviewDir(root), 'apply-review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  record.rebaseReview = {
    requiredAt: new Date().toISOString(),
    mainHead: record.baseCommit,
    worktreeHead: record.commitSha,
    treeSha: 'b'.repeat(40),
  }
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const first = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  assert.equal(first.roundToken, 'E1')
  const after = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(after.rounds.length, record.rounds.length)
  assert.equal(after.extraRounds.length, 1)
  assert.equal(after.extraRounds[0].round, 'E1')
  assert.equal(typeof after.extraRounds[0].seq, 'number')
  assert.match(first.brief, /E1-01/)
  const reused = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  assert.equal(reused.roundToken, 'E1')
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply',
    report: report({
      verdict: 'changes-requested',
      findings: [{ ...majorFinding(), id: 'E1-01' }],
    }),
  })
  await call(fake, 'openspec_review', {
    action: 'dispose', change: CHANGE, review: 'apply',
    dispositions: [{ id: 'E1-01', status: 'fixed', note: 'fixed in the worktree' }],
  })
  const second = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  assert.equal(second.roundToken, 'E2')
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply',
    report: report({ verifications: [{ id: 'E1-01', status: 'verified-fixed', evidence: 'checked' }] }),
  })
  const ready = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  assert.equal(ready.roundToken, 'E2')
  assert.equal(ready.ready, true)
  const final = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(final.rounds.length, record.rounds.length)
  assert.equal(final.extraRounds.length, 2)
  assert.equal(final.rebaseReview.treeSha, 'b'.repeat(40))
})

test('a rebased tree equal to the reviewed tree clears the marker without a round', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  const file = join(reviewDir(root), 'apply-review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  record.rebaseReview = {
    requiredAt: new Date().toISOString(),
    mainHead: record.baseCommit,
    worktreeHead: record.commitSha,
    treeSha: record.treeSha,
  }
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const result = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  assert.equal(result.roundToken, undefined)
  const after = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(after.rebaseReview, undefined)
  assert.equal(Array.isArray(after.extraRounds) ? after.extraRounds.length : 0, 0)
})

test('the marker clear returns to normal rounds', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, review: 'apply', report: report() })
  const file = join(reviewDir(root), 'apply-review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  record.rebaseReview = {
    requiredAt: new Date().toISOString(),
    mainHead: record.baseCommit,
    worktreeHead: record.commitSha,
    treeSha: record.treeSha,
  }
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const cleared = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  assert.equal(cleared.roundToken, undefined)
  const state = readApplyState(root, null, CHANGE)
  writeFileSync(join(state.worktree, 'follow-up.txt'), 'follow-up\n')
  const commit = spawnSync('git', ['-C', state.worktree, 'add', 'follow-up.txt'], { encoding: 'utf8' })
  assert.equal(commit.status, 0)
  const made = spawnSync('git', ['-C', state.worktree, 'commit', '-m', 'follow-up'], { encoding: 'utf8' })
  assert.equal(made.status, 0)
  const normal = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  assert.equal(normal.round, 2)
  assert.equal(normal.roundToken, undefined)
  const after = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(after.rounds.length, 2)
  assert.equal(Array.isArray(after.extraRounds) ? after.extraRounds.length : 0, 0)
})

test('an extra round report is stored, read and waived by token', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, review: 'apply', report: report() })
  const file = join(reviewDir(root), 'apply-review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  record.rebaseReview = {
    requiredAt: new Date().toISOString(),
    mainHead: record.baseCommit,
    worktreeHead: record.commitSha,
    treeSha: 'b'.repeat(40),
  }
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const opened = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  assert.equal(opened.roundToken, 'E1')
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply',
    report: report({ findings: [minorFinding({ id: 'E1-01' })] }),
  })
  assert.equal(existsSync(join(reviewDir(root), 'apply-round-E1', 'report.json')), true)
  const read = await call(fake, 'openspec_review', {
    action: 'report', change: CHANGE, review: 'apply', round: 'E1',
  })
  assert.equal(read.report.verdict, 'pass')
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'apply' })
  assert.ok(status.extraRounds.some((entry) => entry.roundToken === 'E1'))
  const waived = await call(fake, 'openspec_review', {
    action: 'waive', change: CHANGE, review: 'apply', round: 'E1',
    id: 'E1-01', waiver: 'accepted by the user', approvedBy: 'user',
  })
  assert.equal(waived.findings.waived, 1)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'report', change: CHANGE, review: 'apply', round: 'E9' }),
    /has no report/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', change: CHANGE, review: 'apply', round: 'E9',
      id: 'E1-01', status: 'fixed', note: 'x',
    }),
    /not recorded/,
  )
})

test('an extra round resume refuses while a finding is open', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, review: 'apply', report: report() })
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
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply',
    report: report({ findings: [minorFinding({ id: 'E1-01' })] }),
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' }),
    /still open: E1-01/,
  )
})


const sealWorktreeApply = (root) => setup(root, undefined, { worktree: { enabled: true } })
const sealRef = sealRefName(null, CHANGE)
test('a worktree apply seals on the branch without moving main', async () => {
  const { root, run } = gitFixture()
  const fake = sealWorktreeApply(root)
  const head = run(['rev-parse', 'HEAD'])
  await passDraftConstructing(fake, root)
  const state = readApplyState(root, null, CHANGE)
  assert.equal(run(['rev-parse', 'HEAD']), head)
  assert.notEqual(state.baseCommit, head)
  assert.equal(state.sealedCommit, state.baseCommit)
  assert.equal(run(['rev-parse', sealRef]), state.baseCommit)
  assert.equal(run(['rev-parse', `refs/heads/${state.branch}`]), state.baseCommit)
  assert.equal(run(['rev-parse', `${state.baseCommit}^1`]), head)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.applyBaseCommit, state.baseCommit)
  assert.match(run(['status', '--porcelain']), new RegExp(`openspec/changes/${CHANGE}`))
})

test('the seal stages the uncommitted ignore file and refuses outside dirt', async () => {
  const { root, run } = gitFixture()
  const fake = sealWorktreeApply(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() })
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  writeFileSync(join(root, 'outside.txt'), 'outside\n')
  await assert.rejects(call(fake, 'openspec_apply_next', { change: CHANGE }), /working tree is not clean/)
  assert.equal(readApplyState(root, null, CHANGE), undefined)
  rmSync(join(root, 'outside.txt'))
  await call(fake, 'openspec_apply_next', { change: CHANGE })
  const state = readApplyState(root, null, CHANGE)
  assert.equal(run(['show', `${state.baseCommit}:openspec/.gitignore`]), '.review/')
})

test('a changed plan leaves no seal ref or branch', async () => {
  const { root, run } = gitFixture()
  const fake = sealWorktreeApply(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() })
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'), '# Changed after the draft\n')
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /changed since the review started|differ from the reviewed draft/,
  )
  assert.equal(readApplyState(root, null, CHANGE), undefined)
  assert.notEqual(spawnSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', sealRef]).status, 0)
  assert.notEqual(spawnSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', `refs/heads/${sealBranchName(null, CHANGE)}`]).status, 0)
})

test('a resync tolerates a missing main planning copy', async () => {
  const { root } = gitFixture()
  const fake = sealWorktreeApply(root)
  await passDraftConstructing(fake, root)
  rmSync(join(root, 'openspec', 'changes', CHANGE), { recursive: true, force: true })
  const resync = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(resync.change, CHANGE)
  assert.equal(typeof resync.state, 'string')
})

test('a rebase without origin/main keeps the recorded base', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = sealWorktreeApply(root)
  await passDraftConstructing(fake, root)
  const state = readApplyState(root, null, CHANGE)
  writeFileSync(join(state.worktree, 'feature.txt'), 'feature\n')
  run(['-C', state.worktree, 'add', 'feature.txt'])
  run(['-C', state.worktree, 'commit', '-m', 'feature work'])
  run(['commit', '--allow-empty', '-m', 'another land'])
  run(['-C', state.worktree, 'rebase', 'main'])
  assert.notEqual(run(['-C', state.worktree, 'rev-parse', 'HEAD^']), state.sealedCommit)
  assert.equal(run(['cat-file', '-t', state.sealedCommit]), 'commit')
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  assert.equal(started.baseTreeSha, run(['rev-parse', `${state.sealedCommit}^{tree}`]))
  const diff = readFileSync(join(reviewDir(root), 'apply-round-1', 'diff.patch'), 'utf8')
  assert.match(diff, /feature\.txt/)
})

test('a rebase onto newer main re-bases the apply review diff', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = sealWorktreeApply(root)
  await passDraftConstructing(fake, root)
  const state = readApplyState(root, null, CHANGE)
  writeFileSync(join(state.worktree, 'feature.txt'), 'feature\n')
  run(['-C', state.worktree, 'add', 'feature.txt'])
  run(['-C', state.worktree, 'commit', '-q', '-m', 'feature work'])
  run(['checkout', '-q', 'main'])
  writeFileSync(join(root, 'main-only.txt'), 'landed\n')
  run(['add', 'main-only.txt'])
  run(['commit', '-q', '-m', 'another land'])
  const mainTip = run(['rev-parse', 'HEAD'])
  run(['update-ref', 'refs/remotes/origin/main', mainTip])
  run(['-C', state.worktree, 'rebase', 'main'])

  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  assert.equal(started.baseline, 'draft')
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.baseSource, 'rebase')
  assert.equal(record.baseCommit, mainTip)
  assert.equal(record.rebasedFrom, state.sealedCommit)
  assert.notEqual(record.baseTreeSha, run(['rev-parse', `${state.sealedCommit}^{tree}`]))
  const diff = readFileSync(join(reviewDir(root), 'apply-round-1', 'diff.patch'), 'utf8')
  assert.match(diff, /feature\.txt/)
  assert.doesNotMatch(diff, /main-only\.txt/)
})

test('an overlay that cannot be built refuses the round', { skip: process.platform === 'win32' }, async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, { draft: { enabled: true }, apply: { enabled: true } })
  await passDraft(fake, root, run)
  const seal = run(['rev-parse', 'HEAD'])
  writeFileSync(join(root, 'feature.txt'), 'feature\n')
  run(['add', 'feature.txt'])
  run(['commit', '-q', '-m', 'feature work'])
  run(['checkout', '-q', '-b', 'advance', seal])
  writeFileSync(join(root, 'main-only.txt'), 'landed\n')
  run(['add', 'main-only.txt'])
  run(['commit', '-q', '-m', 'main advance'])
  run(['update-ref', 'refs/remotes/origin/main', run(['rev-parse', 'HEAD'])])
  run(['checkout', '-q', '-'])
  run(['rebase', '-q', 'advance'])

  const bin = mkdtempSync(join(tmpdir(), 'openspec-flow-git-'))
  const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim()
  writeFileSync(join(bin, 'git'), `#!/bin/sh\nfor arg in "$@"; do if [ "$arg" = "write-tree" ]; then exit 1; fi; done\nexec ${realGit} "$@"\n`)
  spawnSync('chmod', ['+x', join(bin, 'git')])
  const before = process.env.PATH
  process.env.PATH = `${bin}:${before}`
  try {
    await assert.rejects(
      call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
      /could not build the re-based base tree/,
    )
  } finally {
    process.env.PATH = before
    rmSync(bin, { recursive: true, force: true })
  }
  assert.equal(existsSync(join(reviewDir(root), 'apply-review.json')), false)
})

test('a merge of main into the branch re-bases the apply review diff', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = sealWorktreeApply(root)
  await passDraftConstructing(fake, root)
  const state = readApplyState(root, null, CHANGE)
  writeFileSync(join(state.worktree, 'feature.txt'), 'feature\n')
  run(['-C', state.worktree, 'add', 'feature.txt'])
  run(['-C', state.worktree, 'commit', '-q', '-m', 'feature work'])
  run(['checkout', '-q', 'main'])
  writeFileSync(join(root, 'main-only.txt'), 'landed\n')
  run(['add', 'main-only.txt'])
  run(['commit', '-q', '-m', 'another land'])
  const mainTip = run(['rev-parse', 'HEAD'])
  run(['update-ref', 'refs/remotes/origin/main', mainTip])
  run(['-C', state.worktree, 'merge', '-q', '--no-edit', 'main'])

  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.baseSource, 'rebase')
  assert.equal(record.baseCommit, mainTip)
  assert.equal(record.rebasedFrom, state.sealedCommit)
  const diff = readFileSync(join(reviewDir(root), 'apply-round-1', 'diff.patch'), 'utf8')
  assert.match(diff, /feature\.txt/)
  assert.doesNotMatch(diff, /main-only\.txt/)
})

test('the seal resets a stale apply branch and refuses an attached worktree', async () => {
  const { root, run } = gitFixture()
  const branch = sealBranchName(null, CHANGE)
  run(['branch', branch, 'HEAD'])
  const commit = buildSealCommit({
    root,
    changePath: `openspec/changes/${CHANGE}`,
    change: CHANGE,
  })
  pinSeal({ root, store: null, change: CHANGE, commit })
  assert.equal(run(['rev-parse', `refs/heads/${branch}`]), commit)
  assert.equal(run(['rev-parse', sealRefName(null, CHANGE)]), commit)
  const attached = join(root, '..', `${root.split('/').pop()}-attached`)
  run(['worktree', 'add', attached, branch])
  try {
    assert.throws(
      () => pinSeal({ root, store: null, change: CHANGE, commit }),
      /checked out by a worktree/,
    )
  } finally {
    run(['worktree', 'remove', '--force', attached])
  }
})

test('the seal ref is valid for a double dot and a leading dot', () => {
  for (const [store, change] of [[null, 'release..1'], ['team-store', CHANGE], ['.dot', CHANGE]]) {
    const name = sealRefName(store, change)
    assert.equal(spawnSync('git', ['check-ref-format', name]).status, 0, name)
  }
  assert.match(sealRefName(null, 'release..1'), /seal\/local-release--1-/)
  assert.match(sealRefName('.dot', CHANGE), /seal\/-dot-/)
})


test('remove deletes the seal ref and keeps the branch', async () => {
  const { root, run } = gitFixture()
  const fake = sealWorktreeApply(root)
  await passDraftConstructing(fake, root)
  const state = readApplyState(root, null, CHANGE)
  assert.equal(run(['rev-parse', sealRefName(null, CHANGE)]), state.baseCommit)
  await call(fake, 'openspec_apply_worktree', {
    action: 'remove', change: CHANGE, abandon: true, approvedBy: 'user', reason: 'abandoned for a test',
  })
  assert.notEqual(spawnSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', sealRefName(null, CHANGE)]).status, 0)
  assert.equal(run(['rev-parse', `refs/heads/${state.branch}`]), state.baseCommit)
})

test('a branch that does not point at the seal is refused on re-apply', async () => {
  const { root, run } = gitFixture()
  const fake = sealWorktreeApply(root)
  await passDraftConstructing(fake, root)
  const state = readApplyState(root, null, CHANGE)
  await call(fake, 'openspec_apply_worktree', {
    action: 'remove', change: CHANGE, abandon: true, approvedBy: 'user', reason: 'restart',
  })
  run(['branch', '-f', state.branch, 'HEAD'])
  const second = sealWorktreeApply(root)
  await assert.rejects(
    call(second, 'openspec_apply_next', { change: CHANGE }),
    /does not point at the seal commit/,
  )
})

test('the apply preparation runs the worktree bootstrap and fails when it cannot', () => {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-prepare-'))
  try {
    assert.throws(() => prepareApplyWorktree({ worktree: root }), /no bootstrap entrypoint/)
    mkdirSync(join(root, 'scripts'), { recursive: true })
    const script = join(root, 'scripts', 'bootstrap.sh')
    writeFileSync(script, '#!/bin/sh\nexit 0\n')
    spawnSync('chmod', ['+x', script])
    assert.doesNotThrow(() => prepareApplyWorktree({ worktree: root }))
    writeFileSync(script, '#!/bin/sh\nexit 3\n')
    assert.throws(() => prepareApplyWorktree({ worktree: root }), /exit 3/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an apply resume reports the base source it actually used', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const seal = run(['rev-parse', 'HEAD'])
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply', base: seal,
  })
  assert.match(started.brief, /The base is the explicit base passed to this review\./)
  await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    review: 'apply',
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await call(fake, 'openspec_review', {
    action: 'dispose', change: CHANGE, review: 'apply', id: 'R1-01', status: 'fixed', note: 'Fixed.',
  })
  const resumed = await call(fake, 'openspec_review', {
    action: 'resume', change: CHANGE, review: 'apply',
  })
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.baseCommit, seal)
  assert.equal(record.baseSource, 'seal', JSON.stringify({ baseline: record.baseline, base: record.baseCommit, seal }))
  assert.match(resumed.brief, /The base is the seal commit recorded by the first `openspec_apply_next`\./)
  assert.doesNotMatch(resumed.brief, /The base is the explicit base passed to this review\./)
})

test('archive gates on a pr beforeArchive entry', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  const directory = reviewDir(root)
  const policy = JSON.parse(readFileSync(join(directory, 'policy.json'), 'utf8'))
  policy.reviews.pr = { ...policy.reviews.apply, object: 'tree' }
  policy.pipeline = { ...policy.pipeline, beforeArchive: 'pr' }
  writeFileSync(join(directory, 'policy.json'), `${JSON.stringify(policy, null, 2)}\n`)
  await assert.rejects(
    call(fake, 'openspec_archive', { change: CHANGE }),
    /the pr review has not started; run openspec_review action=start review=pr/,
  )
  const apply = JSON.parse(readFileSync(join(directory, 'apply-review.json'), 'utf8'))
  writeFileSync(
    join(directory, 'pr-review.json'),
    `${JSON.stringify({ ...apply, review: 'pr' }, null, 2)}\n`,
  )
  const archived = await call(fake, 'openspec_archive', { change: CHANGE })
  assert.equal(archived.archived, true)
})
