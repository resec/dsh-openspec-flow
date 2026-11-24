import test from 'node:test'
import assert from 'node:assert/strict'
import { headlessCheck } from '../scripts/lab/index.mjs'
import { parseHeadlessEvents, toolCalls, toolResults } from '../scripts/lab/drivers/headless.mjs'

const stream = [
  '{"type":"session","sessionId":"s1","cwd":"/tmp"}',
  '{"type":"status","phase":"turn_start","turn":1}',
  '{"type":"tool_call","callId":"c1","tool":"openspec_review","input":{"action":"report"}}',
  '{"type":"tool_result","callId":"c1","status":"completed","result":"ok"}',
  '{"type":"final","sessionId":"s1","reason":{"kind":"completed"},"text":"done"}',
  'not json',
].join('\n')

test('headless NDJSON is parsed and tool events are exposed', () => {
  const events = parseHeadlessEvents(stream)
  assert.equal(events.length, 5)
  assert.equal(toolCalls(events).length, 1)
  assert.equal(toolCalls(events)[0].tool, 'openspec_review')
  assert.equal(toolResults(events)[0].status, 'completed')
  assert.equal(events.at(-1).type, 'final')
})

test('malformed lines are skipped instead of failing the run', () => {
  assert.deepEqual(parseHeadlessEvents('{bad\n{"type":"final"}\n'), [{ type: 'final' }])
})

test('the headless report check records the exit status and final reason', () => {
  const passed = headlessCheck({ result: { status: 0, completed: true, final: { reason: { kind: 'completed' } } }, evidence: '/run/artifacts/headless.ndjson' })
  assert.deepEqual(passed, {
    name: 'headless',
    status: 'ok',
    exitStatus: 0,
    finalReason: 'completed',
    evidence: '/run/artifacts/headless.ndjson',
  })
  const failed = headlessCheck({ result: { status: 3, completed: false, final: { reason: { kind: 'error' } } }, evidence: '/run/artifacts/headless.ndjson' })
  assert.equal(failed.status, 'fail')
  assert.equal(failed.exitStatus, 3)
  assert.equal(failed.finalReason, 'error')
  const silent = headlessCheck({ result: { status: 1, completed: false }, evidence: '/run/artifacts/headless.ndjson' })
  assert.equal(silent.status, 'fail')
  assert.equal(silent.exitStatus, 1)
  assert.equal(silent.finalReason, null)
})
