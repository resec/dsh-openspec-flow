import test from 'node:test'
import assert from 'node:assert/strict'
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
