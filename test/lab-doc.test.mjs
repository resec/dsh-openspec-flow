import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (path) => readFileSync(join(ROOT, path), 'utf8')

test('the lab document states the commands, POC location and browser install', () => {
  const doc = read('docs/lab.md')
  assert.match(doc, /npm run lab -- doctor/)
  assert.match(doc, /npm run test:lab/)
  assert.match(doc, /--mock-only/)
  assert.match(doc, /\.cache\/lab\/experiments\//)
  assert.match(doc, /PLAYWRIGHT_BROWSERS_PATH/)
  assert.match(doc, /apply-worktree-dev\.md/)
  assert.match(doc, /otherwise `\.cache\/lab\/pw-browsers`/)
  assert.match(doc, /COVERAGE_SKIP=1/)
})

test('AGENTS and the README point at the lab gate and documentation', () => {
  const agents = read('AGENTS.md')
  assert.match(agents, /npm run test:lab -- --mock-only/)
  assert.match(agents, /docs\/lab\.md/)
  const readme = read('README.md')
  assert.match(readme, /npm run test:lab/)
  assert.match(readme, /docs\/lab\.md/)
  assert.match(readme, /scripts\/lab\//)
  assert.match(agents, /apply-worktree-dev\.md/)
  assert.match(readme, /apply-worktree-dev\.md/)
})
