/**
 * Read one persisted DSH session and project the figures the harness needs.
 *
 * The session log is the source of record for provider usage, tool calls and
 * result bytes. Token figures are read from each `assistant/message` usage
 * record; nothing here estimates tokens from characters.
 *
 * @module eval/lib/session
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { sessionsRoot } from './paths.mjs'

const USAGE_KEYS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens']

function emptyUsage() {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 }
}

function addUsage(target, usage) {
  for (const key of USAGE_KEYS) target[key] += Number(usage?.[key] ?? 0)
  return target
}

function messageText(data) {
  const content = data?.message?.content ?? data?.content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

function parseJson(value, fallback) {
  if (typeof value !== 'string') return value ?? fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

/**
 * Find the directory of a persisted session id.
 * @param sessionId - exact session identity.
 * @param root - sessions root; defaults to the process DSH home.
 * @returns absolute session directory.
 */
export function findSessionDir(sessionId, root = sessionsRoot()) {
  if (!existsSync(root)) {
    throw new Error(`session root not found: ${root}`)
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidate = join(root, entry.name, sessionId)
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`session not found under ${root}: ${sessionId}`)
}

/**
 * Read a session log as parsed events.
 * @param target - session id, session directory, or an explicit log file.
 * @param options - sessions root used when target is an id.
 * @returns parsed session events in log order.
 */
export function readSessionEvents(target, { sessionsRoot: root = sessionsRoot() } = {}) {
  let file
  if (existsSync(target) && statSync(target).isFile()) {
    file = target
  } else {
    const directory = existsSync(target) ? target : findSessionDir(target, root)
    file = join(directory, 'session.v4.jsonl.zstd')
  }
  if (!existsSync(file)) throw new Error(`session log not found: ${file}`)
  const text = zstdDecompressSync(readFileSync(file)).toString('utf8')
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line))
}

/**
 * Project a complete session log into harness metrics.
 * @param events - parsed session events.
 * @returns the session summary.
 */
export function summarizeSession(events) {
  const head = events.find((event) => event.type === 'session') ?? {}
  const headers = events.filter((event) => event.type === 'request/header')
  const header = headers.at(-1)?.data?.header ?? {}
  const tools = Array.isArray(header.tools) ? header.tools : []
  const toolNames = tools.map((tool) => tool.name).filter(Boolean)

  const steps = events
    .filter((event) => event.type === 'assistant/message')
    .map((event) => ({
      turn: event.data?.turn ?? null,
      step: event.data?.step ?? null,
      usage: event.data?.usage ?? null,
    }))

  const usage = emptyUsage()
  const missingUsage = []
  for (const step of steps) {
    if (step.usage === null || typeof step.usage !== 'object') {
      missingUsage.push({ turn: step.turn, step: step.step })
      continue
    }
    addUsage(usage, step.usage)
  }

  const prompts = steps.map(
    (step) => Number(step.usage?.inputTokens ?? 0) + Number(step.usage?.cacheReadTokens ?? 0),
  )

  const calls = events.filter((event) => event.type === 'tool/call')
  const toolSteps = new Set(calls.map((event) => `${event.data?.turn}:${event.data?.step}`))

  const byTurn = new Map()
  for (const step of steps) {
    const turn = step.turn ?? 0
    const entry = byTurn.get(turn) ?? { turn, usage: emptyUsage(), prompts: [], steps: 0, stepDetails: [] }
    entry.steps += 1
    if (step.usage) {
      addUsage(entry.usage, step.usage)
      entry.prompts.push(Number(step.usage.inputTokens ?? 0) + Number(step.usage.cacheReadTokens ?? 0))
    }
    entry.stepDetails.push({
      step: step.step,
      usage: step.usage ?? null,
      hasToolCall: toolSteps.has(`${step.turn}:${step.step}`),
    })
    byTurn.set(turn, entry)
  }
  for (const entry of byTurn.values()) {
    entry.stepDetails.sort((left, right) => (left.step ?? 0) - (right.step ?? 0))
  }
  const callNames = new Map()
  const byTool = {}
  const cliCommands = []
  const skillLoads = []
  const actions = []
  for (const event of calls) {
    const name = event.data?.name ?? 'unknown'
    byTool[name] = (byTool[name] ?? 0) + 1
    const args = parseJson(event.data?.arguments, {})
    callNames.set(event.data?.callId, name)
    if (name === 'skill') skillLoads.push(String(args.name ?? args.skill ?? ''))
    if (name === 'bash' && typeof args.command === 'string') {
      cliCommands.push(args.command)
    }
    if (name.startsWith('openspec_')) actions.push(name)
  }

  const results = events.filter((event) => event.type === 'tool/result')
  let resultBytes = 0
  let resultErrors = 0
  const resultBytesByTool = {}
  for (const event of results) {
    const bytes = Buffer.byteLength(messageText(event.data), 'utf8')
    resultBytes += bytes
    const name = callNames.get(event.data?.message?.toolCallId) ?? null
    if (name) resultBytesByTool[name] = (resultBytesByTool[name] ?? 0) + bytes
    if (event.data?.message?.isError === true) resultErrors += 1
  }

  const catalog = new Set()
  for (const event of events) {
    if (event.type !== 'user/message') continue
    const content = event.data?.content ?? event.data?.message?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block?.type !== 'text' || typeof block.text !== 'string') continue
      if (!block.text.includes('<available_skills>')) continue
      for (const match of block.text.matchAll(/`([^`]+)`:/gu)) catalog.add(match[1])
    }
  }

  const systemText = events
    .filter((event) => event.type === 'system/message')
    .map((event) => messageText(event.data))
    .join('')

  const firstTime = events.find((event) => typeof event.time === 'number')?.time ?? null
  const lastTime = [...events].reverse().find((event) => typeof event.time === 'number')?.time ?? null

  return {
    sessionId: head.id ?? null,
    cwd: head.cwd ?? null,
    createdAt: head.createdAt ?? null,
    model: header.config ?? null,
    events: events.length,
    turns: events.filter((event) => event.type === 'turn/end').length,
    steps: steps.length,
    usage,
    missingUsage,
    prompt: {
      firstRequestTokens: prompts[0] ?? 0,
      peakRequestTokens: prompts.length ? Math.max(...prompts) : 0,
      totalRequestTokens: prompts.reduce((sum, value) => sum + value, 0),
    },
    perTurn: [...byTurn.values()].sort((left, right) => left.turn - right.turn),
    toolSurface: {
      count: toolNames.length,
      names: toolNames,
      openspecTools: toolNames.filter((name) => name.startsWith('openspec_')),
      hasWeb: toolNames.includes('web_search') && toolNames.includes('web_fetch'),
      hasSubagent: toolNames.some((name) =>
        ['subagent', 'subagent_fork', 'send_message', 'list_agents', 'interrupt_agent', 'workflow'].includes(name),
      ),
      schemaBytes: Buffer.byteLength(JSON.stringify(tools), 'utf8'),
      systemPromptBytes: Buffer.byteLength(systemText, 'utf8'),
    },
    tools: {
      calls: calls.length,
      byTool,
      cliCommands,
      openspecCliCalls: cliCommands.filter((command) => /\bopenspec\b/u.test(command)).length,
      actions,
      skillLoads,
      results: results.length,
      resultBytes,
      resultBytesByTool,
      resultErrors,
      askUserQuestions: byTool.ask_user_question ?? 0,
    },
    skills: {
      catalog: [...catalog],
      loaded: skillLoads,
    },
    retries: events.filter((event) => event.type === 'llm/retry').length,
    compactions: events.filter((event) => event.type === 'compaction/start').length,
    durationMs: firstTime !== null && lastTime !== null ? lastTime - firstTime : null,
    final: events.filter((event) => event.type === 'turn/end').at(-1)?.data?.reason ?? null,
  }
}

/**
 * Read and summarise a session in one call.
 * @param target - session id, directory, or log file.
 * @returns the session summary.
 */
export function loadSession(target, options) {
  return summarizeSession(readSessionEvents(target, options))
}

/**
 * Sum the usage of a set of turns.
 * @param summary - session summary.
 * @param turns - turn numbers to include.
 * @returns summed usage.
 */
export function usageForTurns(summary, turns) {
  const selected = new Set(turns)
  const total = emptyUsage()
  for (const entry of summary.perTurn) {
    if (selected.has(entry.turn)) addUsage(total, entry.usage)
  }
  return total
}
