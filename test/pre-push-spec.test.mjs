import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const CHANGE_DIR = 'openspec/changes/draft-review-length-gate'
const ACTIVE = join(CHANGE_DIR, 'specs', 'development-workflow', 'spec.md')
const MAIN = join('openspec', 'specs', 'development-workflow', 'spec.md')
const ARCHIVE = join('openspec', 'changes', 'archive')

/**
 * Read the split requirement from the active delta, the archived delta or the
 * main spec, whichever is authoritative at this checkout.
 * @returns Markdown text.
 */
function splitSpec() {
  if (existsSync(ACTIVE)) return readFileSync(ACTIVE, 'utf8')
  const main = readFileSync(MAIN, 'utf8')
  if (main.includes('### Requirement: Coverage stamp verification')) return main
  const archived = readdirSync(ARCHIVE)
    .filter((name) => name.endsWith('-draft-review-length-gate'))
    .sort()
    .at(-1)
  assert.ok(archived, 'the active or archived development-workflow delta exists')
  return readFileSync(join(ARCHIVE, archived, 'specs', 'development-workflow', 'spec.md'), 'utf8')
}

test('the pre-push requirement split keeps the restored obligations', () => {
  const text = splitSpec()
  assert.match(text, /### Requirement: Strict artifact validation gate/)
  assert.match(text, /### Requirement: Coverage stamp verification/)
  assert.match(text, /coverage-gate/)
  assert.match(text, /any other stamp outcome SHALL run verification/i)
  assert.match(text, /Scenario: Coverage is skipped but the lab gate runs/)
})
