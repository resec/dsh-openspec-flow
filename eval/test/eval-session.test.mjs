import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { findSessionDir, loadSession, readSessionEvents, summarizeSession, usageForTurns } from '../lib/session.mjs'

const SAMPLE = fileURLToPath(new URL('../fixtures/sessions/sample.v4.jsonl.zstd', import.meta.url))

test('projects provider usage and tools from a real sample log', () => {
  const summary = loadSession(SAMPLE)

  assert.equal(summary.sessionId, 'session-f9976bd7-e7c2-4f84-abd4-48a7e16c9b0f')
  assert.equal(summary.steps, 2)
  assert.equal(summary.turns, 1)
  assert.deepEqual(summary.usage, {
    inputTokens: 2705,
    outputTokens: 65,
    cacheReadTokens: 12928,
    cacheWriteTokens: 0,
    totalTokens: 15698,
  })
  assert.equal(summary.prompt.firstRequestTokens, 7717)
  assert.equal(summary.prompt.peakRequestTokens, 7916)
  assert.equal(summary.toolSurface.count, 24)
  assert.deepEqual(summary.toolSurface.openspecTools, [])
  assert.equal(summary.toolSurface.hasWeb, true)
  assert.equal(summary.toolSurface.hasSubagent, true)
  assert.equal(summary.tools.resultBytes, 367)
  assert.equal(summary.tools.openspecCliCalls, 1)
  assert.equal(summary.tools.askUserQuestions, 0)
  assert.equal(summary.skills.catalog.includes('openspec-apply-change'), true)
  assert.deepEqual(summary.skills.loaded, [])
  assert.equal(summary.final.kind, 'completed')
})

test('sums usage for selected turns', () => {
  const summary = loadSession(SAMPLE)
  assert.deepEqual(usageForTurns(summary, [1]), summary.usage)
  assert.deepEqual(usageForTurns(summary, [99]), {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
  })
})

test('names an assistant message without usage', () => {
  const summary = summarizeSession([
    { type: 'session', id: 'session-test', cwd: '/tmp/project' },
    { type: 'assistant/message', time: 1, data: { turn: 1, step: 1 } },
    { type: 'turn/end', time: 2, data: { reason: { kind: 'completed' } } },
  ])

  assert.equal(summary.steps, 1)
  assert.deepEqual(summary.missingUsage, [{ turn: 1, step: 1 }])
  assert.equal(summary.usage.totalTokens, 0)
  assert.equal(summary.prompt.firstRequestTokens, 0)
})

test('extracts the skill catalog and the loaded-skill calls', () => {
  const summary = summarizeSession([
    { type: 'session', id: 'session-test', cwd: '/tmp/project' },
    {
      type: 'user/message',
      data: {
        content: [
          {
            type: 'text',
            text: '<available_skills>\n- `openspec-flow`: Drive a flow.\n- `tdd`: Tests first.\n</available_skills>',
          },
        ],
      },
    },
    { type: 'tool/call', data: { callId: 'c1', name: 'skill', arguments: '{"name":"tdd"}' } },
  ])

  assert.deepEqual(summary.skills.catalog, ['openspec-flow', 'tdd'])
  assert.deepEqual(summary.skills.loaded, ['tdd'])
})

function u(input, output, cacheRead = 0) {
  return { inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: 0, totalTokens: input + output + cacheRead }
}

test('records per-step usage and tool-call steps', () => {
  const summary = summarizeSession([
    { type: 'session', id: 'session-steps', cwd: '/tmp/project' },
    { type: 'assistant/message', data: { turn: 1, step: 1, usage: u(10, 1) } },
    { type: 'tool/call', data: { turn: 1, step: 2, callId: 'c1', name: 'bash', arguments: '{}' } },
    { type: 'assistant/message', data: { turn: 1, step: 2, usage: u(20, 2) } },
  ])

  assert.deepEqual(summary.perTurn[0].stepDetails, [
    { step: 1, usage: u(10, 1), hasToolCall: false },
    { step: 2, usage: u(20, 2), hasToolCall: true },
  ])
})

test('marks a tool call that starts the first step', () => {
  const summary = summarizeSession([
    { type: 'session', id: 'session-tool-first', cwd: '/tmp/project' },
    { type: 'tool/call', data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{}' } },
    { type: 'assistant/message', data: { turn: 1, step: 1, usage: u(5, 1) } },
  ])

  assert.equal(summary.perTurn[0].stepDetails[0].hasToolCall, true)
})

test('resolves a session under an explicit sessions root', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eval-sessions-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const project = join(root, '--project--')
  const session = join(project, 'session-explicit')
  mkdirSync(session, { recursive: true })
  copyFileSync(SAMPLE, join(session, 'session.v4.jsonl.zstd'))

  assert.equal(findSessionDir('session-explicit', root), session)
  const summary = loadSession('session-explicit', { sessionsRoot: root })
  assert.equal(summary.steps, 2)
  assert.equal(summary.sessionId, 'session-f9976bd7-e7c2-4f84-abd4-48a7e16c9b0f')
})

test('summarizes an empty session without optional fields', () => {
  const summary = summarizeSession([])
  assert.equal(summary.sessionId, null)
  assert.equal(summary.turns, 0)
  assert.equal(summary.steps, 0)
  assert.equal(summary.final, null)
  assert.equal(summary.durationMs, null)
  assert.deepEqual(summary.perTurn, [])
  assert.deepEqual(summary.tools.byTool, {})
  assert.deepEqual(summary.skills.catalog, [])
})

test('tolerates malformed session events', () => {
  const summary = summarizeSession([
    { type: 'request/header', data: { header: { tools: [{ name: '' }, {}] } } },
    { type: 'assistant/message', data: {} },
    { type: 'assistant/message', data: { turn: 2, step: 1, usage: 'bad' } },
    { type: 'assistant/message', data: { turn: 2, step: 2, usage: { inputTokens: 1 } } },
    { type: 'tool/call', data: {} },
    { type: 'tool/call', data: { name: 'skill', arguments: 'not json' } },
    { type: 'tool/call', data: { name: 'bash', arguments: { command: 'openspec list' } } },
    { type: 'tool/call', data: { name: 'openspec_list' } },
    { type: 'tool/result', data: {} },
    { type: 'tool/result', data: { message: { toolCallId: 'c1', isError: true, content: [{ type: 'text', text: 'x' }] } } },
    { type: 'user/message', data: { content: 'not-an-array' } },
    { type: 'user/message', data: { content: [{ type: 'text' }, { type: 'text', text: 'no skills' }] } },
    { type: 'system/message', data: { content: [{ type: 'text', text: 'system' }] } },
    { type: 'turn/end', time: 10, data: {} },
    { type: 'turn/end', time: 20, data: { reason: { kind: 'completed' } } },
  ])
  assert.equal(summary.steps, 3)
  assert.equal(summary.missingUsage.length, 2)
  assert.equal(summary.tools.calls, 4)
  assert.deepEqual(summary.tools.byTool, { unknown: 1, skill: 1, bash: 1, openspec_list: 1 })
  assert.deepEqual(summary.tools.skillLoads, [''])
  assert.deepEqual(summary.tools.actions, ['openspec_list'])
  assert.deepEqual(summary.tools.resultErrors, 1)
  assert.equal(summary.toolSurface.systemPromptBytes, Buffer.byteLength('system'))
  assert.equal(summary.durationMs, 10)
  assert.deepEqual(summary.final, { kind: 'completed' })
})

test('rejects a missing session root and an unknown session', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eval-sessions-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  assert.throws(() => findSessionDir('missing', join(root, 'absent')), /session root not found/)
  writeFileSync(join(root, 'file'), 'x')
  assert.throws(() => findSessionDir('missing', root), /session not found/)
})

test('rejects a session directory without a log', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eval-sessions-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  assert.throws(() => readSessionEvents(root), /session log not found/)
})
