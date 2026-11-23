import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PNPM_VERSION } from '../scripts/lab/core/doctor.mjs'

const WORKFLOW = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

test('CI is pull-request driven, read-only and Ubuntu-only', () => {
  assert.match(WORKFLOW, /^on:\n/m)
  assert.match(WORKFLOW, /^  pull_request:\n/m)
  assert.match(WORKFLOW, /^permissions:\n  contents: read$/m)
  assert.doesNotMatch(WORKFLOW, /macos/i)
})

test('both jobs derive Node from the baseline file', () => {
  assert.match(WORKFLOW, /^  verify:$/m)
  assert.match(WORKFLOW, /^  lab:$/m)
  assert.equal((WORKFLOW.match(/coverage\.baseline\.json/g) ?? []).length, 2)
  assert.equal((WORKFLOW.match(/steps\.node-pin\.outputs\.version/g) ?? []).length, 2)
})

test('the verify job runs the change, skill and verification gates', () => {
  for (const command of [
    'npm ci',
    'check-pr-change.mjs --base',
    'check-generated-skills.mjs --base',
    'npm run openspec:check',
    'npm run check:requirement-length',
    'npm run verify',
  ]) {
    assert.ok(WORKFLOW.includes(command), command)
  }
})

test('the requirement length gate runs after strict validation and before verification', () => {
  const validation = WORKFLOW.indexOf('npm run openspec:check')
  const gate = WORKFLOW.indexOf('npm run check:requirement-length')
  const verification = WORKFLOW.indexOf('npm run verify')
  assert.ok(validation >= 0, 'the workflow does not run openspec:check')
  assert.ok(gate > validation, 'the length gate must run after openspec:check')
  assert.ok(verification > gate, 'the length gate must run before npm run verify')
})

test('the change check compares the base with the pull-request head', () => {
  assert.match(WORKFLOW, /check-pr-change\.mjs --base "\$\{\{ github\.event\.pull_request\.base\.sha \}\}" --head "\$\{\{ github\.event\.pull_request\.head\.sha \}\}"/u)
  const verify = WORKFLOW.slice(WORKFLOW.indexOf('\n  verify:\n'), WORKFLOW.indexOf('\n  lab:\n'))
  assert.match(verify, /fetch-depth: 0/u)
})

test('the lab job installs the browser where the doctor looks', () => {
  for (const command of [
    'PLAYWRIGHT_BROWSERS_PATH: .cache/lab/pw-browsers',
    'fonts-wqy-zenhei',
    'npx playwright install --with-deps chromium',
    'npm run lab -- doctor',
    'npm run test:lab -- --mock-only',
  ]) {
    assert.ok(WORKFLOW.includes(command), command)
  }
})

test('the lab job provisions the pinned pnpm before npm ci', () => {
  const lab = WORKFLOW.slice(WORKFLOW.indexOf('\n  lab:\n'))
  const action = lab.indexOf('pnpm/action-setup@v6')
  const workflowPin = /pnpm\/action-setup@v6[\s\S]*?version:\s*(\S+)/.exec(lab)
  const install = lab.indexOf('npm ci')
  assert.ok(action >= 0, 'the lab job does not install pnpm')
  assert.ok(workflowPin, 'the lab job does not pin a pnpm version')
  assert.ok(install > action, 'the lab job installs pnpm after npm ci')
  assert.equal(
    workflowPin[1],
    PNPM_VERSION,
    `the workflow pins pnpm ${workflowPin[1]}, expected ${PNPM_VERSION}`,
  )

  const documentation = readFileSync(new URL('../docs/lab.md', import.meta.url), 'utf8')
  const documentedPin = /npm install --global pnpm@(\S+)/.exec(documentation)
  assert.ok(documentedPin, 'docs/lab.md does not carry the pnpm install command')
  assert.equal(
    documentedPin[1],
    PNPM_VERSION,
    `docs/lab.md pins pnpm ${documentedPin[1]}, expected ${PNPM_VERSION}`,
  )
})

test('every action reference uses the Node 24 major', () => {
  const allowed = new Set([
    'actions/checkout@v7',
    'actions/setup-node@v7',
    'actions/cache@v6',
    'pnpm/action-setup@v6',
  ])
  const references = [...WORKFLOW.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1])
  assert.equal(references.length, 7, 'the workflow has seven uses references')
  for (const reference of references) {
    assert.ok(allowed.has(reference), `${reference} is not an allowlisted Node 24 action reference`)
  }
  for (const [reference, count] of [
    ['actions/checkout@v7', 2],
    ['actions/setup-node@v7', 2],
    ['actions/cache@v6', 2],
    ['pnpm/action-setup@v6', 1],
  ]) {
    assert.equal(
      references.filter((entry) => entry === reference).length,
      count,
      `${reference} must appear ${count} time(s)`,
    )
  }
})
