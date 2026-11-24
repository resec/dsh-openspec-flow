import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DELTA = 'openspec/changes/gate-unmerged-landed-push/specs/pr-review-pipeline/spec.md'
const MAIN = 'openspec/specs/pr-review-pipeline/spec.md'
const DEV_DELTA = 'openspec/changes/gate-unmerged-landed-push/specs/development-workflow/spec.md'
const DEV_MAIN = 'openspec/specs/development-workflow/spec.md'

/**
 * Read the delta before archive and the merged main spec afterwards.
 * @param delta - change-relative delta path.
 * @param main - merged main-spec path.
 * @returns Markdown text.
 */
function specText(delta, main) {
  return readFileSync(join(ROOT, existsSync(join(ROOT, delta)) ? delta : main), 'utf8')
}

/**
 * Read the pr-review-pipeline delta before archive and the merged main spec afterwards.
 * @returns Markdown text.
 */
function pipelineSpec() {
  return specText(DELTA, MAIN)
}

test('the offline pipeline requirements name the record and the deferred command', () => {
  const text = pipelineSpec()
  assert.match(text, /### Requirement: Offline local completion/)
  assert.match(text, /record the offline land/)
  assert.match(text, /### Requirement: Offline deferred push/)
  assert.match(text, /push-landed --push --offline/)
  assert.match(text, /after the offline land is recorded/)
  assert.match(text, /`landed-offline` through `pr-local-land finish`/)
})

test('the offline scenarios keep the fallback and the deferred push', () => {
  const text = pipelineSpec()
  for (const scenario of [
    'Offline land completes locally',
    'A local owner entry records the fallback',
    'Deferred push',
    'Local main leads origin/main',
    'Published pull request falls back offline',
  ]) {
    assert.ok(text.includes(`#### Scenario: ${scenario}`), `spec has scenario ${scenario}`)
  }
  assert.match(text, /pr-local-land finish` records `pushed`/)
})

test('the development-workflow offline body names the deferred command', () => {
  const text = specText(DEV_DELTA, DEV_MAIN)
  const section = text.slice(
    text.indexOf('### Requirement: Offline local completion'),
    text.indexOf('### Requirement:', text.indexOf('### Requirement: Offline local completion') + 1),
  )
  assert.match(section, /push-landed --push --offline/)
  assert.match(section, /after the offline land is recorded/)
  assert.doesNotMatch(section, /When GitHub returns, `push-landed` SHALL/)
})
