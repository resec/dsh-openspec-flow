import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  ATTEMPTS_RANGE,
  BACKOFF_RANGE_MS,
  DEFAULT_BACKOFF_MS,
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_POLL_TIMEOUT_MS,
  DEFAULT_PROBE_TIMEOUT_MS,
  DEFAULT_READ_ATTEMPTS,
  DEFAULT_TIMEOUT_MS,
  TIMEOUT_RANGE_MS,
} from '../scripts/gh-exec.mjs'
import { DETAIL_CHUNK_SIZE, RECONCILE_LIST_FIELDS } from '../scripts/pr-review-owner-review.mjs'
import { TELEMETRY_FILE, TELEMETRY_MAX_LINES } from '../scripts/pr-review-watch.mjs'

const doc = readFileSync(new URL('../docs/pr-review.md', import.meta.url), 'utf8')

/** The default and accepted columns of one documented override row. */
function row(variable) {
  const line = doc.split('\n').find((entry) => entry.startsWith(`| \`${variable}\` |`))
  assert.ok(line !== undefined, `docs/pr-review.md documents ${variable}`)
  const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
  return cells.slice(1)
}

test('the documented overrides match the module defaults and ranges', () => {
  const timeoutRange = `${TIMEOUT_RANGE_MS[0]} to ${TIMEOUT_RANGE_MS[1]}`
  assert.deepEqual(row('PR_REVIEW_GH_TIMEOUT_MS'), [String(DEFAULT_TIMEOUT_MS), timeoutRange])
  assert.deepEqual(row('PR_REVIEW_GH_ATTEMPTS'), [String(DEFAULT_READ_ATTEMPTS), `${ATTEMPTS_RANGE[0]} to ${ATTEMPTS_RANGE[1]}`])
  assert.deepEqual(row('PR_REVIEW_GH_BACKOFF_MS'), [
    DEFAULT_BACKOFF_MS.join(','),
    `each delay ${BACKOFF_RANGE_MS[0]} to ${BACKOFF_RANGE_MS[1]}`,
  ])
  assert.deepEqual(row('PR_REVIEW_GH_POLL_TIMEOUT_MS'), [String(DEFAULT_POLL_TIMEOUT_MS), timeoutRange])
  assert.deepEqual(row('PR_REVIEW_GH_PROBE_TIMEOUT_MS'), [String(DEFAULT_PROBE_TIMEOUT_MS), timeoutRange])
  assert.deepEqual(row('PR_REVIEW_GH_FETCH_TIMEOUT_MS'), [String(DEFAULT_FETCH_TIMEOUT_MS), timeoutRange])
})

test('the documented retry, batching, lock and telemetry behaviour is named', () => {
  assert.match(doc, /three attempts/u)
  assert.match(doc, /stale-lock-reclaimed pid=/u)
  assert.match(doc, /ten minutes/u)
  assert.match(doc, new RegExp(`at most ${DETAIL_CHUNK_SIZE} pull requests`, 'u'))
  assert.match(doc, new RegExp(TELEMETRY_FILE, 'u'))
  assert.match(doc, new RegExp(`${TELEMETRY_MAX_LINES} lines`, 'u'))
  assert.match(doc, new RegExp(RECONCILE_LIST_FIELDS.split(',').length + ' milliseconds|lightweight open list', 'u'))
  assert.match(doc, /five-second deadline/u)
})
