import assert from 'node:assert/strict'
import {
  existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { cacheKey, clearCache, readCache } from '../lib/cache.js'
import { apply } from '../index.js'
import { createFakeContext } from './fake-context.mjs'
import {
  CHANGE, DRAFT_OPENING, fixture, setup, call, writeReviewConfig, writePolicy, reviewDir, report, majorFinding, minorFinding, captureSpawn, gitFixture, passDraft, externalSetup, cleanupFixtures,
} from './review-fixtures.mjs'

test.after(cleanupFixtures)

test('self review passes the apply gate', async () => {
  const root = fixture()
  const fake = setup(root)
  const argv = captureSpawn(fake)
  const started = await call(fake, 'openspec_review', {
    action: 'start',
    change: CHANGE,
    intent: 'Add a theme selector and persist it.',
  })
  assert.equal(started.state, 'in-review')
  assert.equal(started.round, 1)
  assert.ok(started.objectHash)
  assert.match(started.brief, /Draft review brief/)
  assert.equal(started.brief.split('\n')[2], DRAFT_OPENING)
  assert.doesNotMatch(started.brief, /you (wrote|drafted|planned)|as the changer/i)
  assert.match(started.brief, /"id": "R1-01"/)
  assert.match(started.brief, /"verifications": \[\]/)
  assert.match(started.brief, /`title`/)
  const validation = argv.find((args) => args.includes('validate'))
  assert.ok(validation, 'the draft start validates the change')
  assert.ok(!validation.includes('--strict'), 'the draft start stays non-strict')

  const submitted = await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    report: report(),
  })
  assert.equal(submitted.state, 'passed')
  assert.equal(submitted.ready, true)

  const applied = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(applied.state, 'all_done')

  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.mode, 'self')
  assert.equal(record.independent, false)
  assert.equal(record.state, 'passed')
  assert.equal(record.length.blocking, false)
  assert.deepEqual(record.criteria, {
    passCriteria: 'major', allowDeferred: true, allowRejected: true,
  })
  assert.ok(record.applyBaseCommit === undefined || typeof record.applyBaseCommit === 'string')
})

test('a self-review finding located in another change is refused and moves to outOfScope', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start',
    change: CHANGE,
    intent: 'Add a theme selector and persist it.',
  })
  const cross = report({
    verdict: 'changes-requested',
    findings: [{ ...majorFinding(), location: 'openspec/changes/other-change/tasks.md:12' }],
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: cross }),
    /another change.*outOfScope/,
  )
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.rounds[0].report, undefined)
  const submitted = await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    report: report({ outOfScope: ['openspec/changes/other-change/tasks.md:12'] }),
  })
  assert.equal(submitted.ready, true)
})

test('a MODIFIED growth blocks draft readiness and carries the official handling', async () => {
  const root = fixture()
  const fake = setup(root)
  const mainDir = join(root, 'openspec', 'specs', 'theme')
  mkdirSync(mainDir, { recursive: true })
  const baseline = 'The app SHALL let users switch between light and dark themes, defaulting to the system preference.'
  const grown = `${baseline} It SHALL also preserve the selected theme across restarts and explain the choice in the settings panel.${' detail'.repeat(90)}`
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
  const started = await call(fake, 'openspec_review', {
    action: 'start',
    change: CHANGE,
    intent: 'Add a theme selector and persist it.',
  })
  assert.match(started.brief, /## Requirement length/)
  assert.match(started.brief, /Do not compress/)
  assert.match(started.brief, /Report a blocking length finding/)

  const beforeReport = await call(fake, 'openspec_review', { action: 'status', change: CHANGE })
  assert.equal(beforeReport.nextAction, 'openspec_review action=self-report')

  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.length.blocking, true)
  assert.equal(record.length.issues[0].kind, 'modified-growth')
  assert.ok(record.length.issues[0].length > record.length.issues[0].baseline)

  const submitted = await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    report: report(),
  })
  assert.equal(submitted.ready, false)
  assert.match(submitted.reasons.join(' '), /requirement description gate/)
  assert.equal(submitted.nextAction, 'openspec_review action=resume review=draft')

  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /requirement description limit.*openspec_review action=resume review=draft/s,
  )

  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'specs', 'theme', 'spec.md'), `## ADDED Requirements

### Requirement: Theme persistence

The app SHALL keep the selected theme across restarts.

#### Scenario: A restart keeps the theme

- **WHEN** the app restarts
- **THEN** the selected theme is restored
`)
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  const cleared = await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    report: report(),
  })
  assert.equal(cleared.ready, true)
  const clearedRecord = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(clearedRecord.length.blocking, false)
})

test('a legacy record without length is rechecked at the first apply entry', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'specs', 'theme', 'spec.md'), `## ADDED Requirements

### Requirement: Long theme note

The app SHALL keep a long theme note.${' detail'.repeat(100)}

#### Scenario: A long theme note is read

- **WHEN** the theme note is read
- **THEN** it is accepted
`)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() })
  const path = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(path, 'utf8'))
  delete record.length
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`)
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'seal the legacy record'])

  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /requirement description limit.*openspec_review action=resume review=draft/s,
  )
})

test('an execution preflight path block is recorded, shown and cleared', async () => {
  const root = fixture()
  const fake = setup(root)
  const tasksPath = join(root, 'openspec', 'changes', CHANGE, 'tasks.md')
  const original = readFileSync(tasksPath, 'utf8')
  writeFileSync(tasksPath, `${original}\n## 9. Preflight\n\n- [ ] 9.1 Verify \`test/missing-preflight.test.mjs\` passes.\n`)
  const started = await call(fake, 'openspec_review', {
    action: 'start',
    change: CHANGE,
    intent: 'Add a theme selector and persist it.',
  })
  assert.match(started.brief, /## Execution preflight/)
  assert.match(started.brief, /test\/missing-preflight\.test\.mjs/)
  assert.match(started.brief, /If another unarchived change supplies a missing requirement/)

  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.execution.blocking, true)
  assert.equal(record.execution.issues[0].kind, 'path')
  assert.equal(record.execution.issues[0].task, '9.1')

  const submitted = await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    report: report(),
  })
  assert.equal(submitted.ready, false)
  assert.match(submitted.reasons.join(' '), /execution preflight/)
  assert.equal(submitted.nextAction, 'openspec_review action=resume review=draft')

  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /draft execution preflight failed.*openspec_review action=resume review=draft/s,
  )

  writeFileSync(tasksPath, `${original}\n## 9. Preflight\n\n- [ ] 9.1 Add \`test/missing-preflight.test.mjs\` and verify it passes.\n`)
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  const cleared = await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    report: report(),
  })
  assert.equal(cleared.ready, true)
  const clearedRecord = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(clearedRecord.execution.blocking, false)
})

test('a changed main-spec baseline is rechecked at the first apply entry', async () => {
  const { root } = gitFixture()
  const fake = setup(root)
  const changeSpec = join(root, 'openspec', 'changes', CHANGE, 'specs', 'theme', 'spec.md')
  const mainSpec = join(root, 'openspec', 'specs', 'theme', 'spec.md')
  mkdirSync(join(root, 'openspec', 'specs', 'theme'), { recursive: true })
  const baseline = `The app SHALL let users switch themes.${' detail'.repeat(90)}`
  const grown = `The app SHALL let users switch themes.${' detail'.repeat(70)}`
  const mainText = (body) => `# Theme Specification

## Purpose

Lets users choose a visual theme and keeps that choice across sessions.

## Requirements

### Requirement: Theme selection

${body}

#### Scenario: User toggles dark mode

- **WHEN** the user clicks the theme toggle
- **THEN** the app switches to dark mode and persists the choice
`
  writeFileSync(mainSpec, mainText(baseline))
  writeFileSync(changeSpec, `## MODIFIED Requirements

### Requirement: Theme selection

${grown}

#### Scenario: User toggles dark mode

- **WHEN** the user clicks the theme toggle
- **THEN** the app switches to dark mode and persists the choice
`)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const submitted = await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  assert.equal(submitted.ready, true, 'the unchanged overlong baseline does not block')

  writeFileSync(mainSpec, mainText(`The app SHALL let users switch themes.${' detail'.repeat(50)}`))
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /requirement description limit.*openspec_review action=resume review=draft/s,
  )
})

test('an open blocker refuses apply', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start',
    change: CHANGE,
    intent: 'Add a theme selector.',
  })
  const submitted = await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  assert.equal(submitted.ready, false)
  assert.match(submitted.reasons.join(' '), /R1-01 is open/)

  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /draft review is not ready: .*openspec_review action=dispose/,
  )
})

test('the draft gate names the report step before a report exists', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /Next: openspec_review action=self-report/,
  )
})

test('the draft gate points an abandoned review at a new change', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', { action: 'abandon', change: CHANGE })
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /Next: openspec_new_change/,
  )
})

test('start and resume reject dispositions', async () => {
  const root = fixture()
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, intent: 'Add a theme selector.', dispositions: [],
    }),
    /start does not accept dispositions.*action=dispose/,
  )
  assert.equal(existsSync(reviewDir(root)), false)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'resume', change: CHANGE,
      dispositions: [{ id: 'R1-01', status: 'fixed', note: 'x' }],
    }),
    /resume does not accept dispositions.*action=dispose/,
  )
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE })
  assert.equal(status.round, 1)
  assert.equal(status.findings.total, 0)
  assert.equal(existsSync(join(reviewDir(root), 'round-2')), false)
})

test('resume refuses a new round while a finding is open', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE }),
    /still open: R1-01.*action=dispose/,
  )
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE })
  assert.equal(status.round, 1)
  assert.equal(status.findings.open, 1)
  assert.equal(existsSync(join(reviewDir(root), 'round-2')), false)
  await call(fake, 'openspec_review', {
    action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Fixed.',
  })
  const next = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  assert.equal(next.round, 2)
  assert.match(next.brief, /"id": "R2-01"/)
  assert.match(next.brief, /"verifications": \[\{ "id": "R1-01"/)
})

test('a record without findings still renders the report contract', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const path = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(path, 'utf8'))
  delete record.findings
  writeFileSync(path, JSON.stringify(record, null, 2))
  const resumed = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  assert.equal(resumed.round, 1)
  assert.match(resumed.brief, /"verifications": \[\]/)
})

test('a later round verifies a fixed blocker and passes apply', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start',
    change: CHANGE,
    intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await call(fake, 'openspec_review', {
    action: 'dispose', review: 'draft',
    change: CHANGE,
    id: 'R1-01',
    status: 'fixed',
    note: 'Added the missing task.',
  })
  const next = await call(fake, 'openspec_review', {
    action: 'resume',
    change: CHANGE,
    round: 2,
  })
  assert.equal(next.round, 2)
  const verified = await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    round: 2,
    report: report({
      verifications: [{ id: 'R1-01', status: 'verified-fixed', evidence: 'Checked the new task.' }],
    }),
  })
  assert.equal(verified.ready, true)
  await call(fake, 'openspec_apply_next', { change: CHANGE })
})

test('a dispositions batch disposes several findings and declares its result', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding(), minorFinding()] }),
  })
  const result = await call(fake, 'openspec_review', {
    action: 'dispose', review: 'draft', change: CHANGE,
    dispositions: [
      { id: 'R1-01', status: 'fixed', note: 'Added the missing task.' },
      { id: 'R1-02', status: 'deferred', note: 'Follow up in ISS-42.' },
    ],
  })
  assert.deepEqual(result.dispositions, [
    { id: 'R1-01', status: 'fixed' },
    { id: 'R1-02', status: 'deferred' },
  ])
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.findings.find((finding) => finding.id === 'R1-01').status, 'fixed')
  assert.equal(record.findings.find((finding) => finding.id === 'R1-02').status, 'deferred')
  assert.equal(record.findings.find((finding) => finding.id === 'R1-02').note, 'Follow up in ISS-42.')
  assert.equal(record.findings.find((finding) => finding.id === 'R1-01').issue, undefined)
  const tool = fake.tools.get('openspec_review')
  assert.equal(tool.output.schema.properties.dispositions.type, 'array')
  assert.deepEqual(tool.output.schema.properties.dispositions.items.required, ['id', 'status'])
  for (const key of Object.keys(result)) {
    assert.ok(
      Object.hasOwn(tool.output.schema.properties, key),
      `dispose returned an undeclared key: ${key}`,
    )
  }
})

test('a dispositions batch writes nothing when one entry is invalid', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding(), minorFinding()] }),
  })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', review: 'draft',
      change: CHANGE,
      dispositions: [
        { id: 'R1-01', status: 'fixed', note: 'Added the missing task.' },
        { id: 'R1-02', status: 'deferred' },
      ],
    }),
    /dispositions\[1\] R1-02: deferred needs a note/,
  )
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.findings.find((finding) => finding.id === 'R1-01').status, 'open')
  assert.equal(record.findings.find((finding) => finding.id === 'R1-02').status, 'open')
})

test('a waived blocker cannot be disposed again and the review stays passed', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding(), minorFinding()] }),
  })
  await call(fake, 'openspec_review', {
    action: 'waive', review: 'draft', change: CHANGE, id: 'R1-01',
    approvedBy: 'user', waiver: 'The user accepted the risk.',
  })
  await call(fake, 'openspec_review', {
    action: 'dispose', review: 'draft', change: CHANGE,
    dispositions: [{ id: 'R1-02', status: 'rejected', note: 'Not a defect.' }],
  })
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  const passed = await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, round: 2, report: report(),
  })
  assert.equal(passed.state, 'passed')
  assert.equal(passed.ready, true)
  const path = join(reviewDir(root), 'review.json')
  const before = readFileSync(path, 'utf8')

  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Added the task.',
    }),
    /^Error: finding R1-01 is already waived and closed, so it cannot be disposed again$/u,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', review: 'draft', change: CHANGE,
      dispositions: [
        { id: 'R1-01', status: 'deferred', note: 'Later.' },
      ],
    }),
    /^Error: dispositions\[0\] R1-01: finding R1-01 is already waived and closed, so it cannot be disposed again$/u,
  )
  assert.equal(readFileSync(path, 'utf8'), before)
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE })
  assert.equal(status.state, 'passed')
  assert.equal(status.ready, true)
  assert.equal(status.findings.blocking, 0)
})

test('a verified blocker cannot be disposed or waived again', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await call(fake, 'openspec_review', {
    action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Added the task.',
  })
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, round: 2 })
  const passed = await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, round: 2,
    report: report({ verifications: [{ id: 'R1-01', status: 'verified-fixed', evidence: 'Checked the new task.' }] }),
  })
  assert.equal(passed.state, 'passed')
  const path = join(reviewDir(root), 'review.json')
  const before = readFileSync(path, 'utf8')

  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Again.',
    }),
    /^Error: finding R1-01 is already verified and closed, so it cannot be disposed again$/u,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'waive', review: 'draft', change: CHANGE, id: 'R1-01',
      approvedBy: 'user', waiver: 'The user accepted the risk.',
    }),
    /^Error: finding R1-01 is already verified and closed, so it cannot be disposed again$/u,
  )
  assert.equal(readFileSync(path, 'utf8'), before)
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE })
  assert.equal(status.state, 'passed')
  assert.equal(status.findings.verified, 1)
  assert.equal(status.findings.waived, 0)
})

test('a dispositions batch writes nothing when an entry names a closed finding', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding(), minorFinding()] }),
  })
  await call(fake, 'openspec_review', {
    action: 'waive', review: 'draft', change: CHANGE, id: 'R1-01',
    approvedBy: 'user', waiver: 'The user accepted the risk.',
  })
  const before = readFileSync(join(reviewDir(root), 'review.json'), 'utf8')
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', review: 'draft',
      change: CHANGE,
      dispositions: [
        { id: 'R1-02', status: 'fixed', note: 'Rewrote the sentence.' },
        { id: 'R1-01', status: 'fixed', note: 'Added the missing task.' },
      ],
    }),
    /^Error: dispositions\[1\] R1-01: finding R1-01 is already waived and closed, so it cannot be disposed again$/u,
  )
  assert.equal(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'), before)
  const record = JSON.parse(before)
  assert.equal(record.findings.find((finding) => finding.id === 'R1-02').status, 'open')
  assert.equal(record.findings.find((finding) => finding.id === 'R1-01').status, 'waived')
})

test('dispositions batch validation names the offending entry', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding(), minorFinding()] }),
  })
  const tool = fake.tools.get('openspec_review')
  assert.equal(tool.parameters.properties.dispositions.type, 'array')
  assert.equal(tool.parameters.properties.dispositions.minItems, 1)
  assert.deepEqual(tool.parameters.properties.dispositions.items.required, ['id'])
  assert.equal(tool.parameters.properties.dispositions.items.additionalProperties, false)
  assert.deepEqual(
    Object.keys(tool.parameters.properties.dispositions.items.properties).sort(),
    ['approvedBy', 'id', 'note', 'status', 'waiver'],
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', review: 'draft',
      change: CHANGE,
      dispositions: [
        { id: 'R1-01', status: 'fixed', note: 'first' },
        { id: 'R1-01', status: 'fixed', note: 'second' },
      ],
    }),
    /appears more than once/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', review: 'draft', change: CHANGE,
      dispositions: [{ id: 'R9-01', status: 'fixed', note: 'x' }],
    }),
    /dispositions\[0\] finding 'R9-01' is not recorded/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01',
      dispositions: [{ id: 'R1-01', status: 'fixed', note: 'x' }],
    }),
    /either id or dispositions/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', review: 'draft', change: CHANGE, note: 'top-level',
      dispositions: [{ id: 'R1-01', status: 'fixed', note: 'x' }],
    }),
    /does not accept top-level status or note/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', review: 'draft', change: CHANGE,
      dispositions: [{ id: 'R1-01', status: 'fixed', note: 'x', issue: '#12' }],
    }),
    /removed issue field/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'x', issue: '#12',
    }),
    /issue was removed/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'dispose', review: 'draft', change: CHANGE }),
    /a finding id is required/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'dispose', review: 'draft', change: CHANGE, dispositions: [] }),
    /non-empty array/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'dispose', review: 'draft', change: CHANGE, dispositions: 'x' }),
    /non-empty array/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'dispose', review: 'draft', change: CHANGE, dispositions: [null] }),
    /is not an object/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', review: 'draft',
      change: CHANGE,
      dispositions: [{ id: 'R1-01', status: 'fixed', note: 'x', extra: true }],
    }),
    /unknown field 'extra'/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', review: 'draft', change: CHANGE, dispositions: [{ status: 'fixed', note: 'x' }],
    }),
    /needs a finding id/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'waive',
      review: 'draft',
      change: CHANGE,
      approvedBy: 'user',
      waiver: 'The user accepted it.',
      dispositions: [{ id: 'R1-01', status: 'fixed' }],
    }),
    /cannot set status/,
  )
})

test('a disposition tolerates a record without a findings array', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  delete record.findings
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'x',
    }),
    /not recorded/,
  )
})

test('a finding waive accepts a batch with shared approval defaults', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding(), minorFinding()] }),
  })
  const result = await call(fake, 'openspec_review', {
    action: 'waive',
    review: 'draft',
    change: CHANGE,
    approvedBy: 'user',
    waiver: 'The user accepted both risks.',
    dispositions: [{ id: 'R1-01' }, { id: 'R1-02' }],
  })
  assert.deepEqual(result.dispositions, [
    { id: 'R1-01', status: 'waived' },
    { id: 'R1-02', status: 'waived' },
  ])
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  const waived = record.findings.find((finding) => finding.id === 'R1-01')
  assert.equal(waived.waiver, 'The user accepted both risks.')
  assert.equal(waived.approvedBy, 'user')
})

test('the single-id disposition still returns its result entry', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  const result = await call(fake, 'openspec_review', {
    action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Added the missing task.',
  })
  assert.deepEqual(result.dispositions, [{ id: 'R1-01', status: 'fixed' }])
})

test('a plan-change waiver refuses finding dispositions', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'waive',
      change: CHANGE,
      scope: 'plan-change',
      approvedBy: 'user',
      waiver: 'The user accepted the plan change.',
      files: ['tasks.md'],
      dispositions: [{ id: 'R1-01' }],
    }),
    /does not accept dispositions/,
  )
})

test('a user waiver closes a blocker', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start',
    change: CHANGE,
    intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  const waived = await call(fake, 'openspec_review', {
    action: 'waive',
    review: 'draft',
    change: CHANGE,
    id: 'R1-01',
    waiver: 'Ship without the task; accepted by the user.',
    approvedBy: 'user',
  })
  assert.equal(waived.ready, false)
  await call(fake, 'openspec_review', {
    action: 'resume',
    change: CHANGE,
    round: 2,
  })
  const passed = await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    round: 2,
    report: report(),
  })
  assert.equal(passed.ready, true)
  await call(fake, 'openspec_apply_next', { change: CHANGE })
})

test('an artifact change invalidates the review', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start',
    change: CHANGE,
    intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    report: report(),
  })
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 1. New\n\n- [ ] 1.1 New task\n')
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE })
  assert.equal(status.ready, false)
  assert.match(status.reasons.join(' '), /artifacts changed/)
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /draft review is not ready/,
  )
})

test('a change created without a model fails closed and leaves no policy', async () => {
  const root = fixture()
  clearCache()
  const fake = createFakeContext({ cwd: root, modelSelection: null })
  apply(fake.ctx, { timeoutMs: 30_000, reviews: { draft: { enabled: false } } })
  await assert.rejects(
    call(fake, 'openspec_new_change', { name: 'add-light-mode' }),
    /no current model is available/,
  )
  assert.equal(existsSync(join(root, 'openspec', 'changes', 'add-light-mode')), false)
  assert.equal(existsSync(join(root, 'openspec', '.review', 'local#add-light-mode')), false)
})

test('the policy locks the reviewer model and ignores a later settings edit', async () => {
  const root = fixture()
  const fake = setup(root, { draft: { enabled: true } })
  const created = await call(fake, 'openspec_new_change', { name: 'add-locked-model' })
  assert.equal(created.change.id, 'add-locked-model')
  const policyPath = join(root, 'openspec', '.review', 'local#add-locked-model', 'policy.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  assert.deepEqual(policy.reviews.draft.reviewerModel, {
    source: 'inherit', provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max',
  })

  // A later settings revision names another model; a review start does not move
  // the locked route, because the policy already carries one.
  const later = setup(root, {
    draft: { enabled: true, reviewerModel: { source: 'explicit', provider: 'other', model: 'other-model' } },
  })
  await call(later, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Review the fixture change.',
  })
  const unchanged = JSON.parse(readFileSync(policyPath, 'utf8'))
  assert.deepEqual(unchanged.reviews.draft.reviewerModel, policy.reviews.draft.reviewerModel)
  const fresh = JSON.parse(readFileSync(join(reviewDir(root), 'policy.json'), 'utf8'))
  assert.deepEqual(fresh.reviews.draft.reviewerModel, {
    source: 'explicit', provider: 'other', model: 'other-model',
  })
})

test('an old policy gains its reviewer model on the first review start', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  const policyPath = join(reviewDir(root), 'policy.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  assert.deepEqual(policy.reviews.draft.reviewerModel, {
    source: 'inherit', provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max',
  })

  // Strip the field to mimic a record written before this capability existed.
  delete policy.reviews.draft.reviewerModel
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  const migrated = JSON.parse(readFileSync(policyPath, 'utf8'))
  assert.equal(migrated.reviews.draft.reviewerModel.provider, 'deepseek')

  // A second start keeps the migrated value even when the settings now name another model.
  migrated.reviews.draft.reviewerModel = {
    source: 'explicit', provider: 'other', model: 'other-model',
  }
  writeFileSync(policyPath, `${JSON.stringify(migrated, null, 2)}\n`)
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  assert.equal(JSON.parse(readFileSync(policyPath, 'utf8')).reviews.draft.reviewerModel.provider, 'other')
})

test('the review tool is absent when the switch is off and the gates pass', async () => {
  const root = fixture()
  const fake = setup(root, undefined, { reviewEnabled: false })
  assert.equal(fake.tools.has('openspec_review'), false)
  const applied = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(applied.state, 'all_done')
})

test('the first start locks from a supplied configuration path and ignores a blank one', async () => {
  const root = fixture()
  const custom = join(root, 'custom-reviews.json')
  writeFileSync(custom, JSON.stringify({
    profiles: {
      c: {
        object: 'directory', enabled: true, reviewers: 0, waitMinutes: 20, reviewerModel: { source: 'inherit' },
      },
      t: {
        object: 'tree', enabled: true, reviewers: 0, waitMinutes: 20, reviewerModel: { source: 'inherit' },
      },
    },
    reviews: { draft: 'c', apply: 't' },
  }))
  const fake = setup(root, { draft: { enabled: true, reviewers: 0 } })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.', configPath: custom,
  })
  const policy = JSON.parse(readFileSync(join(reviewDir(root), 'policy.json'), 'utf8'))
  assert.equal(policy.source.path, 'custom-reviews.json')
  assert.equal(policy.reviews.draft.waitMinutes, 20)

  const blank = fixture()
  const blankFake = setup(blank, { draft: { enabled: true, reviewers: 0 } })
  await call(blankFake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.', configPath: '   ',
  })
  const blankPolicy = JSON.parse(readFileSync(join(reviewDir(blank), 'policy.json'), 'utf8'))
  assert.equal(blankPolicy.source.path, 'openspec/reviews.json')
})

test('a first start with a complete policy does not read the project file', async () => {
  const root = fixture()
  writePolicy(root, CHANGE, {
    draft: { enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit', provider: 'deepseek', model: 'deepseek-flash' } },
    apply: { enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit', provider: 'deepseek', model: 'deepseek-flash' } },
  })
  const fake = setup(root)
  rmSync(join(root, 'openspec', 'reviews.json'))
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  assert.equal(started.mode, 'self')
})

test('a changed project review file does not relock or fail a resume', async () => {
  const root = fixture()
  const fake = setup(root, { draft: { enabled: true, reviewers: 0 } })
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  writeReviewConfig(root, { draft: { enabled: true, reviewers: 1, waitMinutes: 30 } })
  const resumed = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  assert.equal(resumed.mode, 'self')
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE })
  assert.equal(status.mode, 'self')
})

test('the review tool declares the configuration path parameter', () => {
  const root = fixture()
  const fake = setup(root)
  const tool = fake.tools.get('openspec_review')
  assert.equal(tool.parameters.properties.configPath.type, 'string')
  assert.match(tool.parameters.properties.configPath.description, /review configuration/i)
  assert.equal(Object.hasOwn(fake.tools.get('openspec_new_change').parameters.properties, 'configPath'), false)
})

test('status reports a not-started review', async () => {
  const root = fixture()
  const fake = setup(root)
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE })
  assert.equal(status.state, 'not-started')
  assert.equal(status.ready, false)
  assert.equal(status.nextAction, 'openspec_review action=start review=draft')
  assert.match(status.reasons.join(' '), /has not started/)
})

test('the stored report can be read back', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  const read = await call(fake, 'openspec_review', { action: 'report', change: CHANGE })
  assert.equal(read.report.verdict, 'pass')
  assert.equal(read.report.findings.length, 0)
})

test('extend updates limits and refuses missing approval', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'extend', change: CHANGE, minutes: 15 }),
    /approvedBy user/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'extend', change: CHANGE, approvedBy: 'user', reason: 'more time', minutes: 16 }),
    /between 1 and 15/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'extend', change: CHANGE, approvedBy: 'user', reason: 'more time' }),
    /needs minutes/,
  )
  const extended = await call(fake, 'openspec_review', {
    action: 'extend', change: CHANGE, approvedBy: 'user', reason: 'more time', minutes: 15,
  })
  assert.equal(extended.state, 'in-review')
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.limits.maxRounds, undefined)
  assert.equal(record.limits.waitMinutes, 30)
  assert.equal(record.extensions.length, 1)
  const tool = fake.tools.get('openspec_review')
  assert.equal(tool.parameters.properties.maxRounds, undefined)
})

test('abandon closes the review', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const abandoned = await call(fake, 'openspec_review', {
    action: 'abandon', change: CHANGE, reason: 'superseded',
  })
  assert.equal(abandoned.state, 'abandoned')
  assert.equal(abandoned.nextAction, 'openspec_new_change')
  assert.match(abandoned.reasons.join(' '), /remove the review record/)
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, intent: 'Add a theme selector.',
    }),
    /already started/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE }),
    /abandoned/,
  )
})

test('dispose refuses an unknown finding and a deferred blocker', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'dispose', review: 'draft', change: CHANGE, id: 'R9-01', status: 'fixed', note: 'no' }),
    /not recorded/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'deferred', note: 'later' }),
    /cannot be deferred.*allowed: fixed, waived/,
  )
})

test('dispose honors the threshold and the disposition switches', async () => {
  const root = fixture()
  const fake = setup(root, {
    draft: { passCriteria: 'nit', allowDeferred: false, allowRejected: false },
  })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [minorFinding()] }),
  })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-02', status: 'deferred', note: 'later',
    }),
    /cannot be deferred.*allowed: fixed, waived/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-02', status: 'rejected', note: 'no',
    }),
    /cannot be rejected/,
  )
})

test('self-report refuses a duplicate report and a wrong round', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, round: 2, report: report() }),
    /current draft round is 1/,
  )
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() }),
    /already has a report/,
  )
})

test('start refuses a missing intent and an invalid round', async () => {
  const root = fixture()
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE }),
    /needs intent/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'goal', round: 0 }),
    /round must be a positive integer/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'goal', review: 'apply' }),
    /apply review is unavailable/,
  )
})

test('start refuses an invalid change', async () => {
  const root = fixture()
  writeFileSync(
    join(root, 'openspec', 'changes', CHANGE, 'specs', 'theme', 'spec.md'),
    '# Theme\n\n## BROKEN Requirements\n\n### Requirement: Broken\nText.\n',
  )
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, intent: 'Add a theme selector.',
    }),
    /draft review refuses an invalid change/,
  )
})

test('a passed review is idempotent and a legacy round cap does not block a new round', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  const again = await call(fake, 'openspec_review', {
    action: 'resume', change: CHANGE,
  })
  assert.equal(again.state, 'passed')
  assert.equal(again.ready, true)
  assert.match(again.brief, /Draft review brief/)

  const cappedRoot = fixture()
  const capped = setup(cappedRoot, { draft: { enabled: true, reviewers: 0, maxRounds: 1 } })
  await call(capped, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(capped, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await assert.rejects(
    call(capped, 'openspec_review', {
      action: 'resume', change: CHANGE,
    }),
    /still open: R1-01/,
  )
  await call(capped, 'openspec_review', {
    action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Fixed.',
  })
  const next = await call(capped, 'openspec_review', { action: 'resume', change: CHANGE })
  assert.equal(next.round, 2)
})

test('start refuses a round that is not next', async () => {
  const root = fixture()
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, intent: 'Add a theme selector.', round: 2,
    }),
    /next draft review round is 1/,
  )
})

test('self-report refuses artifacts changed before the report', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 1. New\n\n- [ ] 1.1 New task\n')
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() }),
    /changed since this round started; run openspec_review action=resume review=draft/,
  )
})

test('report and dispose refuse a review that never started', async () => {
  const root = fixture()
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'report', change: CHANGE }),
    /no draft review is recorded/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'x' }),
    /no draft review is recorded/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'extend', change: CHANGE, approvedBy: 'user', reason: 'x', minutes: 1 }),
    /no draft review is recorded/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'abandon', change: CHANGE }),
    /no draft review is recorded/,
  )
})

test('dispose and extend validate their inputs', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01' }),
    /status must be/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'extend', change: CHANGE, approvedBy: 'user', reason: 'x' }),
    /needs minutes/,
  )
})

test('an unknown review action is refused', async () => {
  const root = fixture()
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'unknown', change: CHANGE }),
    /Unsupported review action/,
  )
})

test('the apply gate refuses a missing intent file', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  rmSync(join(reviewDir(root), 'intent.md'))
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /intent file is missing; remove the review record/,
  )
})

test('a policy write failure creates no change', async () => {
  const root = fixture()
  writeFileSync(join(root, 'openspec', '.review'), 'not a directory')
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_new_change', { name: 'add-light-mode' }),
    /EEXIST|not a directory|exists/i,
  )
  assert.equal(existsSync(join(root, 'openspec', 'changes', 'add-light-mode')), false)
})

test('openspec validation ignores the review directory', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const validation = await call(fake, 'openspec_inspect', {
    action: 'validate', scope: 'all', strict: true,
  })
  assert.equal(validation.valid, true, JSON.stringify(validation.issues))
})

test('a refused gate leaves no cached apply state', async () => {
  const root = fixture()
  const fake = setup(root)
  clearCache()
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await assert.rejects(call(fake, 'openspec_apply_next', { change: CHANGE }), /draft review is not ready/)
  assert.equal(readCache(cacheKey(root, CHANGE, '')), undefined)
})

test('the draft review can resume before apply started', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() })
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'design.md'), '# Design changed before apply\n')
  const second = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  assert.equal(second.round, 2)
  assert.equal(second.state, 'in-review')
})

test('the draft review cannot resume once apply started', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE }),
    /cannot be resumed once apply started/,
  )
})

test('a disposition without a review kind is refused', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  for (const args of [
    { action: 'dispose', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Fixed.' },
    { action: 'dispose', change: CHANGE, dispositions: [{ id: 'R1-01', status: 'fixed', note: 'Fixed.' }] },
    { action: 'waive', change: CHANGE, id: 'R1-01', approvedBy: 'user', waiver: 'Accepted.' },
  ]) {
    await assert.rejects(
      call(fake, 'openspec_review', args),
      /needs review; configured entries:/,
    )
  }
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.findings[0].status, 'open')
  assert.equal(record.findings[0].waiver, undefined)
})

test('a second directory entry guards its own intent on resume', async () => {
  const root = fixture()
  const fake = setup(root, undefined, {
    reviewFile: JSON.stringify({
      profiles: {
        d: { object: 'directory', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
        t: { object: 'tree', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
      },
      reviews: { draft: 'd', apply: 't', planning: 'd' },
      pipeline: { beforeApply: 'draft', beforeArchive: 'apply' },
    }),
  })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'planning', intent: 'First plan.',
  })
  writeFileSync(join(reviewDir(root), 'intent.md'), 'Second plan.\n')
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'planning' }),
    /intent file changed/,
  )
})

test('a refreshed planning attempt archives under its entry prefix', async () => {
  const root = fixture()
  const fake = setup(root, undefined, {
    reviewFile: JSON.stringify({
      profiles: {
        d: { object: 'directory', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
        t: { object: 'tree', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
      },
      reviews: { draft: 'd', apply: 't', planning: 'd' },
      pipeline: { beforeApply: 'draft', beforeArchive: 'apply' },
    }),
  })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'planning', intent: 'First plan.',
  })
  writeFileSync(
    join(root, 'openspec', 'changes', CHANGE, 'proposal.md'),
    '# Add dark mode\n\n## Why\nUsers need a dark theme at night.\n\n## What Changes\n- Add a theme context provider.\n',
  )
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'planning' })
  assert.equal(existsSync(join(reviewDir(root), 'planning-round-1', 'revisions', '01', 'meta.json')), true)
  assert.equal(existsSync(join(reviewDir(root), 'round-1', 'revisions', '01', 'meta.json')), false)
})

test('draft review refuses an extra round token', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE, round: 'E1' }),
    /draft review has no extra rounds/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE, round: 'x' }),
    /positive integer or an E<n> token/,
  )
})

function editTasks(root) {
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 1. Edited\n\n- [ ] 1.1 Edited task\n')
}

test('an unchanged unreported round is reused without a new round', async () => {
  const root = fixture()
  const fake = setup(root)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  const resumed = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  assert.equal(resumed.round, started.round)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.rounds.length, 1)
  assert.equal(record.rounds[0].report, undefined)
})

test('resume refreshes a stale draft attempt without consuming its number', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  const before = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  editTasks(root)
  const resumed = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  assert.equal(resumed.round, 1)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.rounds.length, 1)
  const attempt = record.rounds[0]
  assert.equal(attempt.report, undefined)
  assert.equal(attempt.revisions.length, 1)
  assert.equal(attempt.revisions[0].cause, 'object-changed')
  assert.equal(attempt.revisions[0].objectHash, before.objectHash)
  assert.equal(attempt.revisions[0].report, undefined)
  assert.equal(attempt.objectHash, resumed.objectHash)
  assert.equal(existsSync(join(reviewDir(root), attempt.revisions[0].brief.path)), true)
  assert.equal(existsSync(join(reviewDir(root), 'round-1', 'revisions', '01', 'meta.json')), true)
})

test('a refresh leaves a fixed finding awaiting verification untouched', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await call(fake, 'openspec_review', {
    action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Added the task.',
  })
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  editTasks(root)
  const resumed = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  assert.equal(resumed.round, 2)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.rounds.length, 2)
  assert.equal(record.rounds[1].revisions.length, 1)
  assert.equal(record.rounds[1].revisions[0].cause, 'object-changed')
  assert.equal(record.findings[0].status, 'fixed')
  assert.equal(record.findings[0].verifiedInRound, undefined)
})

test('a stale draft attempt wakes the reviewer for the same round', async () => {
  const root = fixture()
  const { fake, messages } = externalSetup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  const wakes = messages.length
  editTasks(root)
  const resumed = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  assert.equal(resumed.round, 1)
  assert.equal(messages.length, wakes + 1)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.rounds[0].report, undefined)
  assert.equal(record.reviewers.slots[0].round, 1)
  assert.equal(record.reviewers.slots[0].agentId, 'reviewer-1')
})

test('a mismatched round leaves the stale attempt unarchived', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  editTasks(root)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE, round: 3 }),
    /next draft review round is 1, not 3/,
  )
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.rounds.length, 1)
  assert.equal(record.rounds[0].revisions, undefined)
  assert.equal(record.rounds[0].report, undefined)
})

test('a blocked draft report is archived and the same round is refreshed', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'blocked', summary: 'The artifacts could not be reviewed.' }),
  })
  const resumed = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  assert.equal(resumed.round, 1)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.rounds.length, 1)
  assert.equal(record.rounds[0].report, undefined)
  assert.equal(record.rounds[0].revisions.length, 1)
  const revision = record.rounds[0].revisions[0]
  assert.equal(revision.cause, 'blocked-report')
  assert.equal(revision.report.verdict, 'blocked')
  assert.equal(existsSync(join(reviewDir(root), revision.report.path)), true)
  assert.equal(existsSync(join(reviewDir(root), revision.brief.path)), true)
})

test('status lists an archived draft attempt', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'blocked', summary: 'The artifacts could not be reviewed.' }),
  })
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE })
  assert.equal(status.round, 1)
  assert.equal(status.revisions.length, 1)
  assert.equal(status.revisions[0].round, 1)
  assert.equal(status.revisions[0].revision, 1)
  assert.equal(status.revisions[0].cause, 'blocked-report')
  assert.equal(status.revisions[0].verdict, 'blocked')
  assert.equal(typeof status.revisions[0].briefPath, 'string')
  assert.equal(typeof status.revisions[0].reportPath, 'string')
  assert.equal(typeof status.revisions[0].archivedAt, 'string')
})

test('a refreshed round rewrites its review card for the new report', async () => {
  const root = fixture()
  const fake = setup(root)
  const tool = fake.tools.get('openspec_review')
  const execute = (args) => tool.execute(args, {
    agent: { id: 'review-test', session: { id: 'card-session' } },
    signal: new AbortController().signal,
  })
  await execute({ action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await execute({
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'blocked', summary: 'The artifacts could not be reviewed.' }),
  })
  const cardsDir = join(reviewDir(root), 'cards')
  const before = readdirSync(cardsDir)
  assert.equal(before.length, 1)
  assert.equal(JSON.parse(readFileSync(join(cardsDir, before[0]), 'utf8')).payload.verdict, 'blocked')
  await execute({ action: 'resume', change: CHANGE })
  const kept = readdirSync(cardsDir)
  assert.equal(kept.length, 1)
  assert.equal(JSON.parse(readFileSync(join(cardsDir, kept[0]), 'utf8')).payload.verdict, 'blocked')
  await execute({
    action: 'self-report', change: CHANGE,
    report: report(),
  })
  const after = readdirSync(cardsDir).sort()
  assert.equal(after.length, 2)
  assert.deepEqual(
    after.map((name) => JSON.parse(readFileSync(join(cardsDir, name), 'utf8')).payload.verdict).sort(),
    ['blocked', 'pass'],
  )
  assert.ok(after.some((name) => name.includes('-a2.json')), 'the refreshed attempt writes its own file')
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  const markers = record.cards.filter((card) => card.phase === 'review' && card.round === 1)
  assert.equal(markers.length, 2)
  assert.deepEqual(markers.map((card) => card.attempt).sort(), [1, 2])
})


test('status omits revisions before an attempt is archived', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE })
  assert.equal(status.revisions, undefined)
})

test('the apply gate names the beforeApply entry when it is not ready', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  const directory = reviewDir(root)
  const policy = JSON.parse(readFileSync(join(directory, 'policy.json'), 'utf8'))
  policy.reviews.planning = { ...policy.reviews.draft, object: 'directory' }
  policy.pipeline = { ...policy.pipeline, beforeApply: 'planning' }
  writeFileSync(join(directory, 'policy.json'), `${JSON.stringify(policy, null, 2)}\n`)
  await assert.rejects(
    () => call(fake, 'openspec_apply_next', { change: CHANGE }),
    /the planning review has not started; run openspec_review action=start review=planning/,
  )
})
