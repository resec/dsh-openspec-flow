import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OUTPUT_SUMMARY_LIMIT,
  OUTPUT_SUMMARY_MARKER,
  summarizeOutput,
} from '../scripts/lab/core/process.mjs'

/**
 * Build an output whose lines are distinguishable and whose first line names
 * the cause, the way a real DSH boot failure does.
 * @param lines - number of lines to produce.
 * @returns the joined output.
 */
function bootFailure(lines = 200) {
  const body = []
  body.push('Error: Failed to initialize the profile store')
  for (let index = 1; index < lines; index += 1) {
    body.push(`    at step${index} (/opt/dsh/lib/profile-boot.js:${index}:4)`)
  }
  body.push('Node.js v24.22.2')
  return body.join('\n')
}

test('an output within the budget arrives unchanged', () => {
  const text = 'Error: a short failure\nNode.js v24.22.2'
  assert.equal(summarizeOutput(text), text)
})

test('an output at the budget arrives unchanged', () => {
  const text = 'x'.repeat(OUTPUT_SUMMARY_LIMIT)
  assert.equal(summarizeOutput(text), text)
  assert.equal(summarizeOutput(text).includes(OUTPUT_SUMMARY_MARKER), false)
})

test('an over-long output keeps its first line', () => {
  const text = bootFailure()
  const summary = summarizeOutput(text)
  assert.ok(text.length > OUTPUT_SUMMARY_LIMIT)
  assert.ok(
    summary.startsWith('Error: Failed to initialize the profile store'),
    `summary must start with the cause, got: ${summary.slice(0, 80)}`,
  )
})

test('an over-long output keeps its last line and marks the omission', () => {
  const text = bootFailure()
  const summary = summarizeOutput(text)
  assert.ok(summary.endsWith('Node.js v24.22.2'))
  assert.ok(summary.includes(OUTPUT_SUMMARY_MARKER))
  assert.deepEqual(
    summary.split(OUTPUT_SUMMARY_MARKER).length,
    2,
    'the marker must appear exactly once',
  )
})

test('the retained text stays bounded as the output grows', () => {
  const small = summarizeOutput(bootFailure(200))
  const large = summarizeOutput(bootFailure(20_000))
  assert.equal(small.length, large.length)
  assert.ok(small.length <= OUTPUT_SUMMARY_LIMIT + OUTPUT_SUMMARY_MARKER.length)
})

test('the trimming keeps the budget for output padded with whitespace', () => {
  const padded = `\n\n${bootFailure()}\n\n`
  const summary = summarizeOutput(padded)
  assert.ok(summary.startsWith('Error: Failed to initialize the profile store'))
  assert.ok(summary.endsWith('Node.js v24.22.2'))
})

test('a non-string input summarizes to an empty string', () => {
  assert.equal(summarizeOutput(undefined), '')
  assert.equal(summarizeOutput(null), '')
  assert.equal(summarizeOutput(42), '')
})

test('a custom limit is honoured', () => {
  const summary = summarizeOutput(bootFailure(), 100)
  assert.equal(summary.length, 100 + OUTPUT_SUMMARY_MARKER.length)
  assert.ok(summary.startsWith('Error: Failed to initialize the profile store'))
})
