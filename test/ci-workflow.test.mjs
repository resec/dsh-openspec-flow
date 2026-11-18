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
    'npm run verify',
  ]) {
    assert.ok(WORKFLOW.includes(command), command)
  }
})

test('the lab job installs the browser where the doctor looks', () => {
  for (const command of [
    'PLAYWRIGHT_BROWSERS_PATH: .cache/lab/pw-browsers',
    'fonts-noto-cjk',
    'npx playwright install --with-deps chromium',
    'npm run lab -- doctor',
    'npm run test:lab -- --mock-only',
  ]) {
    assert.ok(WORKFLOW.includes(command), command)
  }
})

test('the lab job provisions the pinned pnpm before npm ci', () => {
  const lab = WORKFLOW.slice(WORKFLOW.indexOf('\n  lab:\n'))
  const action = lab.indexOf('pnpm/action-setup@v4')
  const version = lab.indexOf(`version: ${PNPM_VERSION}`)
  const install = lab.indexOf('npm ci')
  assert.ok(action >= 0, 'the lab job does not install pnpm')
  assert.ok(version > action, `the lab job does not pin pnpm@${PNPM_VERSION}`)
  assert.ok(install > version, 'the lab job installs pnpm after npm ci')

  const documentation = readFileSync(new URL('../docs/lab.md', import.meta.url), 'utf8')
  assert.ok(
    documentation.includes(`pnpm@${PNPM_VERSION}`),
    `docs/lab.md does not name pnpm@${PNPM_VERSION}`,
  )
})
