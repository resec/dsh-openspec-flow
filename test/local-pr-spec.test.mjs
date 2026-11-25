import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DELTA = 'openspec/changes/local-pr-flight/specs/pr-review-pipeline/spec.md'
const LANDING_DELTA = 'openspec/changes/same-run-review-landing/specs/pr-review-pipeline/spec.md'
const MAIN = 'openspec/specs/pr-review-pipeline/spec.md'

/**
 * Read the delta before archive and the merged main spec afterwards.
 * @returns Markdown text.
 */
function pipelineSpec() {
  const path = join(ROOT, existsSync(join(ROOT, DELTA)) ? DELTA : MAIN)
  return readFileSync(path, 'utf8')
}

/**
 * Read this change's delta before archive and the merged main spec afterwards.
 * @returns Markdown text.
 */
function landingSpec() {
  const path = join(ROOT, existsSync(join(ROOT, LANDING_DELTA)) ? LANDING_DELTA : MAIN)
  return readFileSync(path, 'utf8')
}

test('the delta specifies the contributor landing lock protocol', () => {
  const text = pipelineSpec()
  assert.match(text, /### Requirement: Contributor landing lock protocol/)
  for (const scenario of [
    'Candidates precede the acquire',
    'A landing command uses the run session',
    'The same session re-enters its lock',
    'A stopped run releases the lock',
    'A local owner still blocks contributor landing',
  ]) {
    assert.ok(text.includes(`#### Scenario: ${scenario}`), `spec has scenario ${scenario}`)
  }
  assert.match(text, /run `candidates` before acquiring `landing\.lock`/)
  assert.match(text, /including `plan`/)
  assert.match(text, /same owner session SHALL re-enter a lock left by an earlier run/)
  assert.match(text, /`finish` SHALL release the lock/)
  assert.match(text, /reviews SHALL remain available/)
})

test('the scheduled-run requirement keeps its scenarios and adds the acquire ordering', () => {
  const text = landingSpec()
  const section = text.slice(
    text.indexOf('### Requirement: Scheduled run sequencing'),
    text.indexOf('### Requirement:', text.indexOf('### Requirement: Scheduled run sequencing') + 1),
  )
  for (const scenario of [
    'A run stops after one landing phase',
    'A polling run',
    'A cleanup-only run',
    'Final review and merge in one run',
    'Archive and push wait',
    'A synced head waits for CI',
    'Contributor landing precedes review',
    'Landing lock is held',
    'A run acquires the lock before landing',
    'Local pull request needs recovery',
  ]) {
    assert.ok(section.includes(`#### Scenario: ${scenario}`), `scheduled-run spec keeps scenario ${scenario}`)
  }
  assert.doesNotMatch(section, /Without a held `landing\.lock`/)
  assert.match(section, /stop the run and release the lock/)
  assert.match(section, /syncs a same-repository branch/)
})

test('the same-run review landing requirement carries its scenarios', () => {
  const text = landingSpec()
  assert.match(text, /### Requirement: Same-run review landing/)
  for (const scenario of [
    'A review pass continues into landing',
    'A behind pass waits for sync',
    'An unlisted pass stops',
  ]) {
    assert.ok(text.includes(`#### Scenario: ${scenario}`), `same-run spec has scenario ${scenario}`)
  }
  assert.match(text, /not behind `origin\/main`/)
  assert.match(text, /openspec_archive/)
})

test('the fixed-session reviewer reuse requirement carries the resume skip', () => {
  const text = landingSpec()
  assert.match(text, /### Requirement: Fixed-session reviewer reuse/)
  for (const scenario of [
    'Final review resumes the reviewer',
    'Resume fails',
    'Reviewer is not started twice',
    'A passed record skips the resume',
  ]) {
    assert.ok(text.includes(`#### Scenario: ${scenario}`), `reviewer reuse spec has scenario ${scenario}`)
  }
  assert.match(text, /skip the resume and advance `reviewed`/)
})
