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
const SCRIPTS = Object.keys(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts)

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

/**
 * Collect the npm scripts a document names.
 * @param markdown - document contents.
 * @returns script names in first-seen order.
 */
function documentedScripts(markdown) {
  const names = []
  for (const match of markdown.matchAll(/npm run ([a-z][\w:-]*)/gu)) {
    if (!names.includes(match[1])) names.push(match[1])
  }
  return names
}

test('CONTRIBUTING.md states the coverage floors from coverage.config.json', () => {
  assertCoverageRows(parseCoverageTable(CONTRIBUTING), CONFIG)
})

test('CONTRIBUTING.md documents check:pr with a base commit', () => {
  assert.match(CONTRIBUTING, /npm run check:pr/)
  assert.match(CONTRIBUTING, /npm run check:pr -- --base origin\/main/)
})

test('every npm run command in CONTRIBUTING.md exists in package.json', () => {
  const documented = documentedScripts(CONTRIBUTING)
  assert.ok(documented.includes('check:pr'), 'CONTRIBUTING.md does not document check:pr')
  assert.deepEqual(
    documented.filter((name) => !SCRIPTS.includes(name)),
    [],
    'CONTRIBUTING.md names a script that package.json does not define',
  )
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
  assert.match(CONTRIBUTING, /same-repository branch that is behind/)
  assert.match(CONTRIBUTING, /current pull request head/)
})

test('AGENTS.md permits the labeled same-repository sync', () => {
  assert.match(AGENTS, /update-branch/)
  assert.match(AGENTS, /never modifies PR code or a fork branch/)
  assert.match(AGENTS, /creates a merge commit on `main`/)
  assert.match(AGENTS, /recorded and merged in the same run/)
  assert.match(AGENTS, /re-listing returns the pull request as a not-behind landing candidate/)
  assert.match(AGENTS, /continues in the same run through/)
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


test('AGENTS.md states the online local completion path and the retarget step', () => {
  assert.match(AGENTS, /scripts\/pr-publish\.mjs --session <id> --apply/)
  assert.match(AGENTS, /gh pr merge --rebase/)
  assert.match(AGENTS, /scripts\/pr-local-land\.mjs verify <n> --session <id>/)
  assert.match(AGENTS, /retarget <n> --session <id> --apply/)
  assert.match(AGENTS, /pr-local-land\.mjs adopt <n> --tree <merged-tree> --session <id> --apply/)
  assert.match(AGENTS, /finish never adopts by itself/)
  assert.match(AGENTS, /accept the matching owner session without the lock token/)
  assert.match(AGENTS, /a supplied token must match/)
  assert.match(AGENTS, /releases the landing lock/)
  assert.match(AGENTS, /openspec_apply_worktree action=land/)
  assert.match(AGENTS, /publish only the archive commit/)
  assert.match(AGENTS, /check-main-push\.mjs/)
  assert.match(AGENTS, /push-landed --offline/)
  assert.match(AGENTS, /docs\/local-pr\.md/)
})

test('AGENTS.md states the offline local completion path and the deferred push', () => {
  assert.match(AGENTS, /offline-land/)
  assert.match(AGENTS, /npm run test:lab -- --mock-only/)
  assert.match(AGENTS, /stop at local `main` without a push/)
  assert.match(AGENTS, /push-landed --push --offline` publishes the deferred land and archive commits/)
  assert.match(AGENTS, /offline-land\.mjs record/)
  assert.match(AGENTS, /Local `main` leading `origin\/main` blocks a new online pull request and contributor landing/)
})

test('AGENTS.md excludes local pull requests from the scheduled watch', () => {
  assert.match(AGENTS, /local-prs\.json/)
  assert.match(AGENTS, /owner-managed/)
  assert.match(AGENTS, /landing\.lock/)
  assert.match(AGENTS, /`poll` reports its number as owner-managed/)
  assert.match(AGENTS, /never reviews, prepares, comments on, retargets, lands or merges it/)
})
