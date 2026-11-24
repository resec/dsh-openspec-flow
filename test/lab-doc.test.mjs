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
  assert.match(doc, /`COVERAGE_SKIP=1` skips the whole `npm run verify` run, tests and coverage alike/)
  assert.doesNotMatch(doc, /skips only coverage/)
})

test('the documents say COVERAGE_SKIP skips the whole verification run', () => {
  const agents = read('AGENTS.md')
  assert.match(agents, /`COVERAGE_SKIP=1` skips the whole `npm run verify` run, tests and coverage alike/)
  assert.doesNotMatch(agents, /skips only coverage/)
  const readme = read('README.md')
  assert.match(readme, /`COVERAGE_SKIP=1` 跳过整个 `npm run verify`（单测与覆盖率一并跳过）/)
  assert.doesNotMatch(readme, /只跳过覆盖率/)
  const installer = read('scripts/install-hooks.mjs')
  assert.match(installer, /COVERAGE_SKIP=1 skips the whole npm run verify run, tests and coverage alike/)
  assert.doesNotMatch(installer, /skips only coverage/)
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


test('the remote lab job guards pull requests and main while the offline path runs the lab locally', () => {
  const doc = read('docs/lab.md')
  assert.match(doc, /remote `lab` CI job/)
  assert.match(doc, /pull requests and `main`/)
  assert.match(doc, /offline/)
  assert.match(doc, /npm run test:lab -- --mock-only/)
  assert.doesNotMatch(doc, /hook runs strict OpenSpec validation, then `npm run test:lab/)
  const agents = read('AGENTS.md')
  assert.match(agents, /remote `lab` CI job/)
  assert.match(agents, /local hook does not run the lab/)
  assert.match(agents, /offline local path runs `npm run test:lab -- --mock-only`/)
  assert.match(agents, /docs\/local-pr\.md/)
  const readme = read('README.md')
  assert.match(readme, /远端 `lab` CI 任务/)
  assert.match(readme, /pre-push 不再运行 lab/)
  assert.match(readme, /docs\/local-pr\.md/)
})
