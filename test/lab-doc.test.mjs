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
  assert.match(doc, /`--offline`, `--fresh-dsh`, `--mock-only`, `--include-real-model`, `--cleanup` and `--keep` are boolean/)
  assert.match(doc, /and so is `inspect --all`/)
  assert.match(doc, /There is no `--all` flag for `test:lab`/)
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
