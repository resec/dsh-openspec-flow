import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DELTA = 'openspec/changes/gate-unmerged-landed-push/specs/pr-review-pipeline/spec.md'
const MAIN = 'openspec/specs/pr-review-pipeline/spec.md'

/**
 * Read the delta before archive and the merged main spec afterwards.
 * @returns Markdown text.
 */
function pipelineSpec() {
  return readFileSync(join(ROOT, existsSync(join(ROOT, DELTA)) ? DELTA : MAIN), 'utf8')
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
