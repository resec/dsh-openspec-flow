import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'coverage.config.json'), 'utf8'))
const CONTRIBUTING = readFileSync(join(ROOT, 'CONTRIBUTING.md'), 'utf8')
const AGENTS = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8')
const README = readFileSync(join(ROOT, 'README.md'), 'utf8')

const ROWS = {
  'Absolute floor': 'absolute',
  'New-code': 'newCode',
}

/**
 * Read the labelled coverage rows from the contribution document.
 * @param markdown - CONTRIBUTING.md contents.
 * @returns row label to line, branch and function values.
 */
function parseCoverageTable(markdown) {
  const rows = {}
  for (const line of markdown.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    if (cells.length < 6) continue
    const label = cells[1]
    if (!Object.hasOwn(ROWS, label)) continue
    rows[label] = {
      line: Number.parseInt(cells[2], 10),
      branch: Number.parseInt(cells[3], 10),
      function: Number.parseInt(cells[4], 10),
    }
  }
  return rows
}

/**
 * Compare the documented rows with the gate configuration.
 * @param rows - parsed coverage rows.
 * @param config - coverage.config.json contents.
 */
function assertCoverageRows(rows, config) {
  for (const [label, key] of Object.entries(ROWS)) {
    const documented = rows[label]
    if (documented === undefined) throw new Error(`CONTRIBUTING.md has no ${label} row for line, branch and function`)
    const expected = config.thresholds[key]
    for (const metric of ['line', 'branch', 'function']) {
      if (documented[metric] !== expected[metric]) {
        throw new Error(
          `CONTRIBUTING.md ${label} ${metric} is ${documented[metric]}, coverage.config.json requires ${expected[metric]}`,
        )
      }
    }
  }
}

test('CONTRIBUTING.md states the coverage floors from coverage.config.json', () => {
  assertCoverageRows(parseCoverageTable(CONTRIBUTING), CONFIG)
})

test('a mislabelled or drifted row fails with the row and metric', () => {
  const relabelled = CONTRIBUTING.replace('| Absolute floor |', '| Absolute floors |')
  assert.throws(() => assertCoverageRows(parseCoverageTable(relabelled), CONFIG), /Absolute floor/)
  const drifted = CONTRIBUTING.replace('| New-code | 95% | 90% | 100% |', '| New-code | 95% | 85% | 100% |')
  assert.throws(() => assertCoverageRows(parseCoverageTable(drifted), CONFIG), /New-code branch/)
})

test('CONTRIBUTING.md links the worktree environment and resolves the browser path', () => {
  assert.match(CONTRIBUTING, /docs\/apply-worktree-dev\.md/)
  assert.match(CONTRIBUTING, /PLAYWRIGHT_BROWSERS_PATH/)
  assert.match(CONTRIBUTING, /--reset-browsers[^\n]*resolved browser directory/)
})

test('CONTRIBUTING.md names the baseline guard and the coverage commands', () => {
  assert.equal(CONFIG.thresholds.deltaMaxDrop, 1)
  assert.match(CONTRIBUTING, /1\.00 percentage point/)
  assert.match(CONTRIBUTING, /npm run verify/)
  assert.match(CONTRIBUTING, /npm run coverage -- --report-only/)
})

test('CONTRIBUTING.md requires exactly one active change', () => {
  assert.match(CONTRIBUTING, /exactly one active change/i)
  assert.doesNotMatch(CONTRIBUTING, /at least one active change/i)
})

test('CONTRIBUTING.md describes the labeled rebase landing', () => {
  assert.match(CONTRIBUTING, /`mergeable`/)
  assert.match(CONTRIBUTING, /gh pr merge --rebase/)
  assert.match(CONTRIBUTING, /merged tree equals the reviewed tree/)
})

test('CONTRIBUTING.md and AGENTS.md separate owner-review from mergeable', () => {
  assert.match(CONTRIBUTING, /owner-review/)
  assert.match(CONTRIBUTING, /does not authorize landing/)
  assert.match(CONTRIBUTING, /never adds or removes `mergeable`/)
  assert.match(AGENTS, /owner-review/)
  assert.match(AGENTS, /writes only `owner-review` and never `mergeable`/)
})

test('AGENTS.md scopes the push step to the maintainer', () => {
  const pushLine = AGENTS.split('\n').find((line) => line.includes('origin/main') && line.includes('push'))
  assert.ok(pushLine, 'AGENTS.md has no push step naming origin/main')
  assert.match(pushLine, /maintainer/i)
  assert.match(AGENTS, /external contributions? (stop|end) at/i)
})

test('the README publish order names the maintainer', () => {
  const publishLine = README.split('\n').find((line) => line.includes('origin/main') && line.includes('推送'))
  assert.ok(publishLine, 'README.md has no publish step naming origin/main')
  assert.match(publishLine, /维护者/)
})
