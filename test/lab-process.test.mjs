import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OUTPUT_SUMMARY_LIMIT,
  OUTPUT_SUMMARY_MARKER,
  profileInitFailure,
  summarizeOutput,
} from '../scripts/lab/core/process.mjs'

const CAUSE = 'Error: Failed to initialize the profile store'
const LAST_LINE = 'Node.js v24.22.2'

/**
 * Build an output whose first line names the cause and whose last line closes
 * the process, the way a real DSH boot failure does.
 * @param lines - number of stack lines to add.
 * @returns the joined output.
 */
function bootFailure(lines = 200) {
  const body = [CAUSE]
  for (let index = 1; index < lines; index += 1) {
    body.push(`    at step${index} (/opt/dsh/lib/profile-boot.js:${index}:4)`)
  }
  body.push(LAST_LINE)
  return body.join('\n')
}

test('an output within the budget is returned whole', () => {
  const text = `${CAUSE}\n  code: EIO\n${LAST_LINE}`
  assert.equal(summarizeOutput(text), text)
})

test('an output exactly at the budget keeps no marker', () => {
  const text = 'x'.repeat(OUTPUT_SUMMARY_LIMIT)
  assert.equal(summarizeOutput(text), text)
  assert.equal(summarizeOutput(text).includes(OUTPUT_SUMMARY_MARKER), false)
})

test('an over-long output carries its first line', () => {
  const text = bootFailure()
  assert.ok(text.length > OUTPUT_SUMMARY_LIMIT)
  assert.equal(summarizeOutput(text).slice(0, CAUSE.length), CAUSE)
})

test('an over-long output carries its last line and marks the omission', () => {
  const summary = summarizeOutput(bootFailure())
  assert.ok(summary.endsWith(LAST_LINE))
  assert.equal(summary.split(OUTPUT_SUMMARY_MARKER).length, 2, 'the marker must appear exactly once')
})

test('the split keeps the head share and the total bound', () => {
  const summary = summarizeOutput(bootFailure())
  assert.equal(summary.length, OUTPUT_SUMMARY_LIMIT + OUTPUT_SUMMARY_MARKER.length)
  assert.equal(summary.indexOf(OUTPUT_SUMMARY_MARKER), 900)
})

test('the retained text does not grow with the output', () => {
  const small = summarizeOutput(bootFailure(200))
  const large = summarizeOutput(bootFailure(20_000))
  assert.equal(small.length, large.length)
})

test('leading and trailing whitespace is dropped before the split', () => {
  const summary = summarizeOutput(`\n\n${bootFailure()}\n\n`)
  assert.equal(summary.slice(0, CAUSE.length), CAUSE)
  assert.ok(summary.endsWith(LAST_LINE))
})

test('a non-string input summarizes to an empty string', () => {
  assert.equal(summarizeOutput(undefined), '')
  assert.equal(summarizeOutput(null), '')
  assert.equal(summarizeOutput(42), '')
})

test('the profile failure message carries the output and the artifact path', () => {
  const message = profileInitFailure('verify-headless', bootFailure(), '/tmp/run/artifacts/init-headless.log')
  assert.ok(message.startsWith('could not initialize verify-headless: '))
  assert.ok(message.includes(CAUSE))
  assert.ok(message.includes(LAST_LINE))
  assert.ok(message.includes(OUTPUT_SUMMARY_MARKER))
  assert.ok(message.endsWith('(full output: /tmp/run/artifacts/init-headless.log)'))
})

test('the profile failure message omits the path when nothing was written', () => {
  const message = profileInitFailure('verify-web', `${CAUSE}\n${LAST_LINE}`)
  assert.equal(message, `could not initialize verify-web: ${CAUSE}\n${LAST_LINE}`)
})
