import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const CHANGE_DIR = 'openspec/changes/draft-review-length-gate'
const ACTIVE = join(CHANGE_DIR, 'specs', 'development-workflow', 'spec.md')
const MAIN = join('openspec', 'specs', 'development-workflow', 'spec.md')

/**
 * Read the split requirement from the active delta before archive and from
 * the main spec after archive. There is no archived-delta fallback: a total
 * loss in the main spec must fail this test.
 * @returns Markdown text.
 */
function splitSpec() {
  return readFileSync(existsSync(ACTIVE) ? ACTIVE : MAIN, 'utf8')
}

test('the pre-push requirement split keeps the restored obligations', () => {
  const text = splitSpec()
  assert.match(text, /### Requirement: Strict artifact validation gate/)
  assert.match(text, /### Requirement: Coverage stamp verification/)
  assert.match(text, /coverage-gate/)
  assert.match(text, /any other stamp outcome SHALL run verification/i)
  assert.match(text, /Scenario: Coverage is skipped but the lab gate runs/)
})
