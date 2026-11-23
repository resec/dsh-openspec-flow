import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { resolveBundledCli } from '../lib/openspec.js'
import { classifyRequirementLength } from '../lib/review/length.js'
import {
  checkChange,
  entryRow,
  escapeCommandProperty,
  listActiveChanges,
  main,
  parseArgs,
  renderReport,
  reportBlockers,
  requirementLocation,
  usage,
} from '../scripts/check-requirement-length.mjs'

const CLI = resolveBundledCli()
const LONG = 'x'.repeat(510)
const LEGACY = 'y'.repeat(510)

function writeFile(path, text) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

function addedDelta(text, name = 'Big') {
  return [
    '## ADDED Requirements',
    '',
    `### Requirement: ${name}`,
    text,
    '',
    '#### Scenario: It works',
    '- **WHEN** x',
    '- **THEN** y',
    '',
  ].join('\n')
}

function modifiedDelta(text, name = 'Thing') {
  return [
    '## MODIFIED Requirements',
    '',
    `### Requirement: ${name}`,
    text,
    '',
    '#### Scenario: It works',
    '- **WHEN** x',
    '- **THEN** y',
    '',
  ].join('\n')
}

function mainSpec(text, name = 'Thing') {
  return [
    '# cap',
    '',
    '## Purpose',
    '',
    'Defines the capability behavior this project relies on.',
    '',
    '## Requirements',
    '',
    `### Requirement: ${name}`,
    text,
    '',
    '#### Scenario: It works',
    '- **WHEN** a',
    '- **THEN** b',
    '',
  ].join('\n')
}

/**
 * Write one project whose active change is `widget`.
 * @param options - `{ delta, mainSpec }` texts; a missing main spec is not written.
 * @returns the temporary project root.
 */
function makeProject({ delta = addedDelta(LONG), mainSpec: spec } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-req-length-'))
  writeFile(join(root, 'openspec', 'changes', 'widget', 'proposal.md'), '# Widget\n\n## Why\n\nA thing.\n\n## What Changes\n\n- A thing.\n')
  writeFile(join(root, 'openspec', 'changes', 'widget', 'tasks.md'), '# Tasks\n\n- [ ] 1.1 Do it\n')
  writeFile(join(root, 'openspec', 'changes', 'widget', 'specs', 'cap', 'spec.md'), delta)
  if (spec !== undefined) writeFile(join(root, 'openspec', 'specs', 'cap', 'spec.md'), spec)
  return root
}

function remove(root) {
  rmSync(root, { recursive: true, force: true })
}

test('parses the command line and refuses unknown arguments', () => {
  assert.deepEqual(parseArgs([]), { change: undefined, root: undefined })
  assert.deepEqual(parseArgs(['--change', 'widget', '--root', '.']), { change: 'widget', root: '.' })
  assert.deepEqual(parseArgs(['--help']), { help: true })
  assert.throws(() => parseArgs(['--change']), /needs a value/u)
  assert.throws(() => parseArgs(['--change', '--root', '.']), /needs a value/u)
  assert.throws(() => parseArgs(['--nope']), /unknown argument/u)
  assert.match(usage(), /--change <name>/u)
})

test('lists active changes and excludes the archive', () => {
  const root = makeProject()
  try {
    mkdirSync(join(root, 'openspec', 'changes', 'archive', 'old'), { recursive: true })
    assert.deepEqual(listActiveChanges(root), ['widget'])
    assert.deepEqual(listActiveChanges(root, 'widget'), ['widget'])
    assert.throws(() => listActiveChanges(root, 'nope'), /not an active change/u)
    assert.throws(() => listActiveChanges(join(root, 'missing')), /does not exist/u)
  } finally {
    remove(root)
  }
})

test('classifies an over-long added description as blocking', () => {
  const root = makeProject({ delta: addedDelta(LONG) })
  try {
    const report = checkChange(CLI, root, 'widget')
    assert.equal(report.blocking, true)
    assert.equal(report.issues.length, 1)
    assert.equal(report.issues[0].operation, 'ADDED')
    assert.equal(report.issues[0].requirement, 'Big')
    assert.equal(report.issues[0].length, LONG.length)
    assert.equal(report.issues[0].path, 'specs/cap/spec.md')
  } finally {
    remove(root)
  }
})

test('classifies a growing modified description and exempts a legacy one', () => {
  const growing = makeProject({ delta: modifiedDelta(LONG), mainSpec: mainSpec('Short behavior.') })
  const legacy = makeProject({ delta: modifiedDelta(LEGACY), mainSpec: mainSpec(LEGACY) })
  try {
    const blocked = checkChange(CLI, growing, 'widget')
    assert.equal(blocked.blocking, true)
    assert.equal(blocked.issues[0].operation, 'MODIFIED')
    assert.equal(blocked.issues[0].baseline, 'Short behavior.'.length)

    const exempt = checkChange(CLI, legacy, 'widget')
    assert.equal(exempt.blocking, false)
    assert.equal(exempt.issues.length, 0)
    assert.equal(exempt.legacy.length, 1)
  } finally {
    remove(growing)
    remove(legacy)
  }
})

test('a missing main spec leaves the baseline undefined and does not block', () => {
  const root = makeProject({ delta: modifiedDelta(LONG) })
  try {
    const report = checkChange(CLI, root, 'widget')
    assert.equal(report.blocking, false)
    assert.equal(report.issues.length, 0)
  } finally {
    remove(root)
  }
})

test('refuses a CLI failure and a malformed projection', () => {
  const root = makeProject()
  try {
    const failing = join(root, 'failing-cli.mjs')
    writeFileSync(failing, 'process.exit(3)\n')
    assert.throws(() => checkChange(failing, root, 'widget'), /failed/u)

    const malformed = join(root, 'malformed-cli.mjs')
    writeFileSync(malformed, 'process.stdout.write("not json")\n')
    assert.throws(() => checkChange(malformed, root, 'widget'), /returned no JSON/u)

    writeFileSync(malformed, 'process.stdout.write("[1]")\n')
    assert.throws(() => checkChange(malformed, root, 'widget'), /unreadable projection/u)
  } finally {
    remove(root)
  }
})

test('fails closed when the bundled CLI cannot run', () => {
  const root = makeProject()
  const out = []
  const err = []
  try {
    const missing = join(root, 'missing-cli.mjs')
    assert.throws(() => checkChange(missing, root, 'widget'), /failed/u)
    assert.equal(main(['--root', root], {}, (text) => out.push(text), (text) => err.push(text), { cli: missing }), 2)
    assert.match(err.join(''), /requirement length gate: openspec show widget --type change --json failed/u)
  } finally {
    remove(root)
  }
})

test('escapes annotation properties so a path cannot end the property early', () => {
  assert.equal(escapeCommandProperty('a,b:c%d'), 'a%2Cb%3Ac%25d')
  assert.equal(escapeCommandProperty('plain/path.md'), 'plain/path.md')
})

test('reports a blocking run with annotations, the same report in the log and the summary, and exit code 1', () => {
  const root = makeProject({ delta: addedDelta(LONG) })
  const summary = join(root, 'summary.md')
  const out = []
  const err = []
  try {
    const code = main(['--root', root], { GITHUB_STEP_SUMMARY: summary }, (text) => out.push(text), (text) => err.push(text))
    assert.equal(code, 1)
    const printed = out.join('')
    assert.match(printed, /::error file=.*widget.*specs\/cap\/spec\.md,line=3,title=Requirement length::/u)
    assert.match(printed, /An archive merge would exceed the 500-character requirement description limit/u)
    assert.match(printed, /## Requirement length gate/u)
    assert.match(printed, /Official handling:/u)
    assert.match(printed, /add the new behavior as an ADDED requirement/u)
    assert.match(printed, /Edit:/u)
    assert.match(printed, /openspec\/changes\/widget\/specs\/cap\/spec\.md:3/u)
    assert.match(printed, /Verify:/u)
    assert.match(printed, /npm run check:requirement-length/u)
    const written = readFileSync(summary, 'utf8')
    assert.ok(written.endsWith('\n'))
    assert.ok(printed.includes(written.trimEnd()), 'the log does not carry the summary report')
    assert.equal(err.join(''), '')
  } finally {
    remove(root)
  }
})

test('prints the report on stdout when no summary file is configured', () => {
  const root = makeProject({ delta: addedDelta(LONG) })
  const out = []
  const err = []
  try {
    const code = main(['--root', root], {}, (text) => out.push(text), (text) => err.push(text))
    assert.equal(code, 1)
    assert.match(out.join(''), /::error /u)
    assert.match(out.join(''), /## Requirement length gate/u)
    assert.match(out.join(''), /Official handling:/u)
    assert.match(out.join(''), /Verify:/u)
    assert.equal(err.join(''), '')
  } finally {
    remove(root)
  }
})

test('returns zero for a passing gate and two for a bad change name', () => {
  const root = makeProject({ delta: modifiedDelta(LEGACY), mainSpec: mainSpec(LEGACY) })
  const out = []
  const err = []
  try {
    assert.equal(main(['--root', root], {}, (text) => out.push(text), (text) => err.push(text)), 0)
    assert.match(out.join(''), /requirement length gate: ok/u)
    assert.doesNotMatch(out.join(''), /## Requirement length gate/u)
    out.length = 0
    assert.equal(main(['--root', root, '--change', 'nope'], {}, (text) => out.push(text), (text) => err.push(text)), 2)
    assert.match(err.join(''), /not an active change/u)
  } finally {
    remove(root)
  }
})

test('renders entries and locates the requirement heading', () => {
  const root = makeProject({ delta: addedDelta(LONG) })
  try {
    const issue = { path: 'specs/cap/spec.md', operation: 'ADDED', requirement: 'Big', length: LONG.length }
    const row = entryRow('widget', issue)
    assert.deepEqual(row, { change: 'widget', path: 'specs/cap/spec.md', operation: 'ADDED', requirement: 'Big', length: '510', baseline: 'n/a' })
    const report = renderReport([row], [{ path: 'openspec/changes/widget/specs/cap/spec.md', line: 3 }], 500)
    assert.match(report, /^\| widget \| specs\/cap\/spec\.md \| ADDED \| Big \| 510 \| n\/a \|$/mu)
    assert.match(report, /500-character requirement description limit/u)
    assert.match(report, /Official handling:/u)
    assert.match(report, /Edit:\n\n- openspec\/changes\/widget\/specs\/cap\/spec\.md:3\n/u)
    assert.match(report, /Verify:\n\n`npm run check:requirement-length`/u)
    const location = requirementLocation(root, 'widget', issue)
    assert.equal(location.line, 3)
    assert.equal(requirementLocation(root, 'widget', { ...issue, requirement: 'Missing' }).line, undefined)
    assert.equal(reportBlockers(root, [], 500, {}, () => {}, () => {}), 0)
  } finally {
    remove(root)
  }
})

test('names the file without a line when the requirement heading cannot be located', () => {
  const root = makeProject({ delta: modifiedDelta(LONG), mainSpec: mainSpec('Short behavior.') })
  const out = []
  try {
    const issue = { path: 'specs/cap/spec.md', operation: 'MODIFIED', requirement: 'Other', length: LONG.length, baseline: 16 }
    assert.equal(reportBlockers(root, [{ change: 'widget', issues: [issue] }], 500, {}, (text) => out.push(text), () => {}), 1)
    assert.match(out.join(''), /Edit:\n\n- openspec\/changes\/widget\/specs\/cap\/spec\.md\n/u)
    assert.doesNotMatch(out.join(''), /specs\/cap\/spec\.md:3/u)
  } finally {
    remove(root)
  }
})

test('the gate verdict matches the review classifier on the same fixture', () => {
  const root = makeProject({ delta: modifiedDelta(LONG), mainSpec: mainSpec('Short behavior.') })
  try {
    const actual = checkChange(CLI, root, 'widget')
    const expected = classifyRequirementLength(
      [{ spec: 'cap', operation: 'MODIFIED', requirements: [{ name: 'Thing', text: LONG }] }],
      new Map([['cap', [{ name: 'Thing', text: 'Short behavior.' }]]]),
    )
    assert.equal(actual.blocking, expected.blocking)
    assert.deepEqual(
      actual.issues.map((issue) => [issue.path, issue.operation, issue.requirement, issue.length, issue.baseline]),
      expected.issues.map((issue) => [issue.path, issue.operation, issue.requirement, issue.length, issue.baseline]),
    )
  } finally {
    remove(root)
  }
})

test('the script imports the shared classifier instead of restating the rule', () => {
  const source = readFileSync(new URL('../scripts/check-requirement-length.mjs', import.meta.url), 'utf8')
  assert.match(source, /classifyRequirementLength/u)
  assert.match(source, /from '\.\.\/lib\/review\/length\.js'/u)
  assert.doesNotMatch(source, /MAX_REQUIREMENT_DESCRIPTION\s*=/u)
})
