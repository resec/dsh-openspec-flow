/**
 * The Host side of the review configuration channel.
 *
 * A generated Typert Remote is out of reach for this plugin: the browser half
 * would need build-time invocation descriptors and the Host half a runtime
 * `@deepseek-ai/*` import, and neither survives a linked plain-ESM install. The
 * channel is therefore one prefix route on the Web server, mounted only while
 * both `connection` and `webServer` are present, and it speaks the generic
 * Connection envelope the page's `ctx.connection.rpc.call` already sends.
 *
 * The channel owns four answers and no write:
 * - the model catalog (providers, models, reasoning efforts), cached for a minute;
 * - the read-only review configuration of every OpenSpec project a live agent
 *   works in: the global switch, each project's parsed file or its schema error,
 *   and that project's locked policies;
 * - the review cards of the caller's session for the current turn, bound and
 *   delivered under the review root.
 *
 * The page never writes: review parameters live in the project review file and
 * the switch lives in the profile row config. Reads never resolve a Session and
 * never touch the worktree. The card answer writes only inside the ignored
 * review root: turn bindings and the delivery watermark under `openspec/.review/`;
 * it never touches the record, the report, the Session or anything outside that
 * root.
 *
 * @module dsh-openspec-flow/review/settings
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  REVIEW_CHANNEL,
  REVIEW_ENDPOINTS,
  failure,
  success,
} from '../client/channel.js'
import { isOpenSpecProject } from '../policy.js'
import { readReviewConfig } from './file.js'
import { policyApply, policyDraft, readPolicy } from './policy.js'
import { readReview } from './record.js'
import {
  hasReviewMigrationMarker, isGitRepository, legacyReviewRoot, migrateLegacyRecordByKey, reviewRecordNameForKey, reviewRoot,
  withReviewLock, writeJsonAtomic,
} from './store.js'
import { CARD_PHASES, sessionKeyOf } from './cards.js'

/** How long one catalog answer stays fresh, in milliseconds. */
export const CATALOG_TTL_MS = 60_000

/** Largest number of projects the page lists. */
const MAX_PROJECTS = 20

/** Largest number of locked changes listed per project. */
const MAX_CHANGES = 50

/** Largest number of turns one batch card request may carry. */
const MAX_BATCH_TURNS = 64

/** Largest request body accepted, in bytes. */
const MAX_BODY_BYTES = 1_048_576

/** Correlation id used when the request never carried a usable one. */
const INVALID_REQUEST_ID = 'invalid-request'

/** Endpoint path segments the channel accepts, matching the platform's own rule. */
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/

/** Bounds the page renders next to each numeric field. */
const BOUNDS = {
  reviewers: { min: 0, max: 1 },
  waitMinutes: { min: 1, max: 120 },
}

/**
 * Read one failure's message.
 * @param error - a rejection.
 * @returns the message.
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Read a payload object, or undefined when it is not one.
 * @param value - untrusted payload.
 * @returns the record, or undefined.
 */
function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
}

/**
 * Read a non-empty string field.
 * @param input - decoded payload.
 * @param name - field name.
 * @returns the trimmed value, or undefined.
 */
function readString(input, name) {
  const value = input?.[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * The catalog facade over the `llm` service.
 *
 * Every answer is cached for one minute per key. A failed lookup is returned as
 * a failure and leaves the cached entry alone, so a transient provider outage
 * does not drop a selector the page is already showing.
 * @param llm - the `llm` service, or undefined when the profile has none.
 * @param now - clock, injectable for tests.
 * @returns `{ providers, models, efforts }`, each returning a channel result.
 */
export function createCatalog(llm, now = Date.now) {
  const entries = new Map()
  if (llm === undefined || typeof llm.listProviders !== 'function') {
    const unavailable = () => failure('reviewModels/unavailable', 'the model catalog is unavailable')
    return { providers: unavailable, models: unavailable, efforts: unavailable }
  }

  /**
   * Serve one key from the cache, or read it and cache the answer.
   * @param key - cache key.
   * @param load - reader.
   * @returns the channel result.
   */
  async function read(key, load) {
    const cached = entries.get(key)
    if (cached !== undefined && now() - cached.at < CATALOG_TTL_MS) return success(cached.value)
    let value
    try {
      value = await load()
    } catch (error) {
      return failure('reviewModels/unavailable', messageOf(error))
    }
    entries.set(key, { at: now(), value })
    return success(value)
  }

  return {
    providers() {
      return read('providers', async () => {
        const value = await llm.listProviders()
        if (!Array.isArray(value)) throw new Error('the model catalog returned no provider list')
        return value.map((entry) => ({
          id: typeof entry?.id === 'string' ? entry.id : '',
          name: typeof entry?.name === 'string' ? entry.name : String(entry?.id ?? ''),
        }))
      })
    },
    models(provider) {
      return read(`models:${provider}`, async () => {
        const value = await llm.listModels(provider)
        if (!Array.isArray(value)) throw new Error(`the catalog returned no models for '${provider}'`)
        return value.map((entry) => ({
          provider: typeof entry?.provider === 'string' ? entry.provider : provider,
          id: typeof entry?.id === 'string' ? entry.id : '',
          name: typeof entry?.name === 'string' ? entry.name : String(entry?.id ?? ''),
        }))
      })
    },
    efforts(provider, model) {
      return read(`efforts:${provider}:${model}`, async () => {
        const info = await llm.resolveModelInfo(provider, model)
        const reasoning = info?.reasoning
        return {
          efforts: Array.isArray(reasoning?.efforts)
            ? reasoning.efforts.map((entry) => ({
              id: typeof entry?.id === 'string' ? entry.id : '',
              name: typeof entry?.name === 'string' ? entry.name : String(entry?.id ?? ''),
            }))
            : [],
          defaultEffort: typeof reasoning?.defaultEffort === 'string' ? reasoning.defaultEffort : null,
        }
      })
    },
  }
}

/**
 * Walk up from one directory to the nearest OpenSpec project.
 * @param start - absolute or relative directory.
 * @returns the project root, or undefined when no ancestor holds an `openspec/` root.
 */
export function nearestOpenSpecProject(start) {
  if (typeof start !== 'string' || start.trim() === '') return undefined
  let current = resolve(start)
  while (true) {
    if (isOpenSpecProject(current)) return current
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

/**
 * The OpenSpec projects the live agents work in.
 *
 * The page is profile-scoped and belongs to no project, so the Host supplies the
 * project list from the agents it is running: every directory whose nearest
 * ancestor holds an `openspec/` root, deduplicated and sorted.
 * @param ctx - host context.
 * @returns absolute project roots.
 */
export function knownProjects(ctx) {
  const agents = ctx.get?.('agents') ?? ctx.agents
  const workingDirectory = ctx.get?.('workingDirectory') ?? ctx.workingDirectory
  const list = typeof agents?.list === 'function' ? agents.list() : []
  const roots = new Set()
  for (const agent of list) {
    let directory
    try {
      directory = typeof workingDirectory?.get === 'function'
        ? workingDirectory.get(agent?.session ?? agent)
        : undefined
    } catch {
      continue
    }
    const root = nearestOpenSpecProject(directory)
    if (root !== undefined) roots.add(root)
  }
  return [...roots].sort().slice(0, MAX_PROJECTS)
}

/**
 * Read one project's locked policies.
 *
 * Only `policy.json` files are read: review records, reports and findings never
 * enter this answer. A project without a review root is a project without locked
 * changes, not an error.
 * @param projectRoot - absolute project root.
 * @returns the project facts.
 */
export function projectFacts(projectRoot) {
  const facts = { path: projectRoot, git: isGitRepository(projectRoot), changes: [] }
  const primary = reviewRoot(projectRoot)
  const legacy = legacyReviewRoot(projectRoot)
  const names = new Set()
  for (const root of legacy === primary ? [primary] : [primary, legacy]) {
    try {
      for (const name of readdirSync(root)) {
        if (!name.startsWith('.')) names.add(name)
      }
    } catch {
      // A missing root is a project without locked changes.
    }
  }
  for (const name of [...names].sort()) {
    let directory = join(primary, name)
    let policy = readPolicy(directory)
    if (policy === undefined && legacy !== primary) {
      const legacyDirectory = join(legacy, name)
      policy = readPolicy(legacyDirectory)
      if (policy !== undefined) {
        directory = migrateLegacyRecordByKey(projectRoot, name)
        policy = readPolicy(directory)
      }
    }
    if (policy === undefined) continue
    const change = typeof policy.change === 'string' && policy.change.trim() !== '' ? policy.change : name
    facts.changes.push({
      change,
      store: typeof policy.store === 'string' && policy.store !== '' ? policy.store : null,
      lockedAt: typeof policy.lockedAt === 'string' ? policy.lockedAt : null,
      lockedBy: typeof policy.lockedBy === 'string' ? policy.lockedBy : null,
      reviews: { ...(policy.reviews ?? {}) },
      pipeline: { ...(policy.pipeline ?? {}) },
    })
    if (facts.changes.length >= MAX_CHANGES) break
  }
  return facts
}

/**
 * Compare two delivered cards by phase, write time and round.
 * @param left - card entry with `payload` and `writtenAt`.
 * @param right - card entry with `payload` and `writtenAt`.
 * @returns the sort order.
 */
export function compareCards(left, right) {
  const rank = { review: 0, resolution: 1 }
  const phase = (rank[left.payload.phase] ?? 9) - (rank[right.payload.phase] ?? 9)
  if (phase !== 0) return phase
  const leftAt = left.writtenAt ?? ''
  const rightAt = right.writtenAt ?? ''
  if (leftAt !== rightAt) {
    if (leftAt === '') return 1
    if (rightAt === '') return -1
    return leftAt < rightAt ? -1 : 1
  }
  return (left.payload.round ?? 0) - (right.payload.round ?? 0)
}

/**
 * Create the review configuration channel for one Host context.
 * @param options - `{ ctx, settings, now?, entry?, io? }`; `io` optionally
 *   overrides the card filesystem calls for tests.
 * @returns the channel.
 */
export function createReviewChannel({ ctx, settings, now = Date.now, entry = undefined, io = undefined }) {
  const fs = {
    existsSync,
    readFileSync,
    readdirSync,
    statSync,
    writeJsonAtomic,
    ...(io ?? {}),
  }
  const llm = ctx.get?.('llm') ?? ctx.llm
  const catalog = createCatalog(llm, now)

  /**
   * The review configuration, as the page renders it: the global switch and,
   * for every known project, its parsed review file or the schema error and
   * the locked policies. The page never writes.
   * @returns the channel result.
   */
  function readSettings() {
    const projects = knownProjects(ctx).map((path) => {
      const facts = projectFacts(path)
      const config = readReviewConfig(path)
      return {
        ...facts,
        ...(config.ok === true
          ? { config: config.value, configPath: config.source.path }
          : { configError: config.issues.map((issue) => issue.message).join('; ') }),
      }
    })
    return success({
      reviewEnabled: settings?.reviewEnabled !== false,
      legacyReviews: settings?.legacyReviews === true,
      bounds: BOUNDS,
      projects,
    })
  }

  /**
   * Read one card file, or null when it is not a valid card.
   * @param path - file path.
   * @returns the card file, or null.
   */
  function readCardFile(path) {
    try {
      const value = JSON.parse(fs.readFileSync(path, 'utf8'))
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
      if (value.schemaVersion !== 1) return null
      if (typeof value.sessionId !== 'string' || value.sessionId === '') return null
      if (!CARD_PHASES.includes(value.phase)) return null
      if (!Number.isInteger(value.round) || value.round < 1) return null
      if (value.payload === null || typeof value.payload !== 'object' || Array.isArray(value.payload)) return null
      return value
    } catch {
      return null
    }
  }

  /**
   * Scan one review root for one session's cards, once per request.
   * @param base - review root path.
   * @param sessionKey - requested session key, or undefined for every card.
   * @param cache - per-request scan cache keyed by root path.
   * @returns card file records.
   */
  function scanCardsRoot(base, sessionKey, cache) {
    const cached = cache.get(base)
    if (cached !== undefined) return cached
    const out = []
    let names
    try {
      names = fs.readdirSync(base)
    } catch {
      cache.set(base, out)
      return out
    }
    for (const name of names) {
      if (name.startsWith('.')) continue
      const directory = join(base, name)
      try {
        if (!fs.statSync(directory).isDirectory()) continue
      } catch {
        continue
      }
      const cardsDirectory = join(directory, 'cards')
      let files
      try {
        files = fs.readdirSync(cardsDirectory)
      } catch {
        continue
      }
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        if (sessionKey !== undefined && !file.startsWith(`${sessionKey}-`)) continue
        const path = join(cardsDirectory, file)
        const data = readCardFile(path)
        if (data !== null) out.push({ name, directory, path, data })
      }
    }
    cache.set(base, out)
    return out
  }

  /**
   * Every valid card file of one session under one project's review roots.
   * @param project - project root.
   * @param sessionKey - requested session key.
   * @param cache - per-request scan cache keyed by root path.
   * @returns card file records.
   */
  function cardFilesOf(project, sessionKey, cache) {
    const primary = reviewRoot(project)
    const legacy = legacyReviewRoot(project)
    const out = []
    for (const file of scanCardsRoot(primary, sessionKey, cache)) out.push(file)
    if (legacy === primary) return out
    const legacyDecisions = new Map()
    for (const file of scanCardsRoot(legacy, sessionKey, cache)) {
      let skip = legacyDecisions.get(file.name)
      if (skip === undefined) {
        const recordName = reviewRecordNameForKey(project, file.name)
        skip = fs.existsSync(join(primary, recordName)) || hasReviewMigrationMarker(project, recordName)
        legacyDecisions.set(file.name, skip)
      }
      if (skip) continue
      out.push(file)
    }
    return out
  }

  /**
   * Read one review directory's delivery watermark.
   * @param directory - review directory.
   * @returns a delivery map.
   */
  function readDelivery(directory) {
    try {
      const value = JSON.parse(fs.readFileSync(join(directory, 'card-delivery.json'), 'utf8'))
      if (value !== null && typeof value === 'object' && !Array.isArray(value)
        && value.sessions !== null && typeof value.sessions === 'object' && !Array.isArray(value.sessions)) {
        return value
      }
    } catch {
      // a missing or corrupt watermark starts empty
    }
    return { schemaVersion: 1, sessions: {} }
  }

  /**
   * Parse one turn window from a request entry.
   * @param input - candidate `{ turn, from?, to? }`.
   * @returns `{ value }` or `{ error }`.
   */
  function parseTurnWindow(input) {
    const turn = input.turn
    if (!Number.isInteger(turn) || turn < 1) {
      return { error: 'cards needs a positive turn' }
    }
    const fromText = readString(input, 'from')
    const from = fromText !== undefined && !Number.isNaN(Date.parse(fromText))
      ? new Date(fromText).toISOString()
      : undefined
    const toText = readString(input, 'to')
    const hasTo = Object.prototype.hasOwnProperty.call(input, 'to')
    if (hasTo && (toText === undefined || Number.isNaN(Date.parse(toText)))) {
      return { error: 'cards needs an ISO turn end time' }
    }
    const to = hasTo && toText !== undefined ? new Date(toText).toISOString() : undefined
    return { value: { turn, from, to } }
  }

  /**
   * Answer `reviewCards/get` for one turn or a batch of turns.
   *
   * The single-turn form returns `{ cards }`; the batch form returns
   * `{ byTurn }` with one entry per requested turn. Both scan each review root
   * at most once and return each card file at most once.
   * @param payload - `{ sessionId, turn, from?, to? }` or `{ sessionId, turns }`.
   * @returns the channel result.
   */
  function readCards(payload) {
    const input = asRecord(payload) ?? {}
    const sessionId = readString(input, 'sessionId')
    if (sessionId === undefined) {
      return failure('reviewCards/bad-argument', 'cards needs a sessionId')
    }
    const batch = Array.isArray(input.turns)
    let requested
    if (batch) {
      if (input.turns.length > MAX_BATCH_TURNS) {
        return failure('reviewCards/bad-argument', `cards accepts at most ${String(MAX_BATCH_TURNS)} turns`)
      }
      if (input.turns.length === 0) return success({ byTurn: {} })
      const unique = new Map()
      for (const raw of input.turns) {
        const parsed = parseTurnWindow(asRecord(raw) ?? {})
        if (parsed.error !== undefined) return failure('reviewCards/bad-argument', parsed.error)
        if (!unique.has(parsed.value.turn)) unique.set(parsed.value.turn, parsed.value)
      }
      requested = [...unique.values()].sort((left, right) => left.turn - right.turn)
    } else {
      const parsed = parseTurnWindow(input)
      if (parsed.error !== undefined) return failure('reviewCards/bad-argument', parsed.error)
      requested = [parsed.value]
    }
    const sessionKey = sessionKeyOf(sessionId)
    const nowIso = new Date(now()).toISOString()
    const scanCache = new Map()
    const grouped = new Map()
    const seenPaths = new Set()
    for (const project of knownProjects(ctx)) {
      for (const file of cardFilesOf(project, sessionKey, scanCache)) {
        if (file.data.sessionId !== sessionId) continue
        if (seenPaths.has(file.path)) continue
        seenPaths.add(file.path)
        const group = grouped.get(file.directory) ?? []
        group.push(file)
        grouped.set(file.directory, group)
      }
    }
    const byTurn = new Map(requested.map((request) => [request.turn, []]))
    for (const [directory, files] of grouped) {
      const changerSessions = new Map()
      /** The changer session of an independent review for one card's kind, if any. */
      const changerSessionOf = (data) => {
        const kind = typeof data.review === 'string' && data.review.trim() !== ''
          ? data.review.trim()
          : 'draft'
        if (changerSessions.has(kind)) return changerSessions.get(kind)
        let changer
        try {
          const record = readReview(directory, kind)
          const independent = record?.independent === true || record?.mode === 'reviewer'
          changer = independent && typeof record.changerSessionId === 'string' && record.changerSessionId !== ''
            ? record.changerSessionId
            : undefined
        } catch (error) {
          ctx.logger?.warn?.(
            `openspec-flow: the review record could not be read for card filtering: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        changerSessions.set(kind, changer)
        return changer
      }
      try {
        withReviewLock(directory, 'cards-deliver', () => {
          const delivery = readDelivery(directory)
          const stored = delivery.sessions[sessionKey]?.lastDeliveredAt
          let watermark = typeof stored === 'string' ? stored : undefined
          for (const request of requested) {
            const cutoff = request.from ?? watermark
            for (const file of files) {
              const data = file.data
              if (data.phase === 'review' && data.sessionId === changerSessionOf(data)) continue
              const writtenAt = typeof data.writtenAt === 'string' ? data.writtenAt : null
              if (data.turn === request.turn) {
                byTurn.get(request.turn).push({ payload: data.payload, writtenAt })
                continue
              }
              if (data.turn !== null && data.turn !== undefined) continue
              if (cutoff !== undefined && (writtenAt === null || writtenAt < cutoff)) continue
              if (request.to !== undefined && (writtenAt === null || writtenAt > request.to)) continue
              data.turn = request.turn
              data.claimedAt = nowIso
              fs.writeJsonAtomic(file.path, data)
              byTurn.get(request.turn).push({ payload: data.payload, writtenAt })
            }
            const bounded = request.to === undefined ? nowIso : (request.to < nowIso ? request.to : nowIso)
            watermark = request.to === undefined
              ? bounded
              : (watermark !== undefined && watermark > bounded ? watermark : bounded)
          }
          delivery.sessions[sessionKey] = { lastDeliveredAt: watermark ?? nowIso }
          fs.writeJsonAtomic(join(directory, 'card-delivery.json'), delivery)
        })
      } catch (error) {
        ctx.logger?.warn?.(
          `openspec-flow: review cards could not be delivered: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    if (!batch) {
      const cards = [...byTurn.get(requested[0].turn)].sort(compareCards)
      return success({ cards: cards.map((card) => card.payload) })
    }
    const answer = {}
    for (const request of requested) {
      answer[String(request.turn)] = [...byTurn.get(request.turn)]
        .sort(compareCards)
        .map((card) => card.payload)
    }
    return success({ byTurn: answer })
  }

  /**
   * Route one endpoint call.
   * @param endpoint - endpoint name.
   * @param payload - untrusted payload.
   * @returns the channel result.
   */
  async function dispatch(endpoint, payload) {
    const input = payload === undefined ? {} : payload
    if (endpoint === REVIEW_ENDPOINTS.providers) return await catalog.providers()
    if (endpoint === REVIEW_ENDPOINTS.models) {
      const provider = readString(asRecord(input), 'provider')
      if (provider === undefined) return failure('reviewModels/bad-argument', 'models needs a provider')
      return await catalog.models(provider)
    }
    if (endpoint === REVIEW_ENDPOINTS.efforts) {
      const record = asRecord(input)
      const provider = readString(record, 'provider')
      const model = readString(record, 'model')
      if (provider === undefined || model === undefined) {
        return failure('reviewModels/bad-argument', 'efforts needs a provider and a model')
      }
      return await catalog.efforts(provider, model)
    }
    if (endpoint === REVIEW_ENDPOINTS.settings) return readSettings()
    if (endpoint === REVIEW_ENDPOINTS.cards) return readCards(input)
    if (endpoint === REVIEW_ENDPOINTS.policies) {
      const projects = knownProjects(ctx).map((path) => projectFacts(path))
      return success({ projects })
    }
    return failure('reviewChannel/unknown-endpoint', `unknown endpoint '${String(endpoint)}'`)
  }

  /**
   * Answer one HTTP request on the channel.
   * @param req - incoming request.
   * @param res - response this handler owns.
   * @returns fulfillment after the response is written.
   */
  async function handleRequest(req, res) {
    const admission = ctx.connection?.admit({ headers: req.headers })
    if (admission !== undefined && 'rejection' in admission) {
      res.writeHead(admission.rejection, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      res.end(admission.rejection === 401 ? 'unauthorized' : 'forbidden')
      return
    }
    const endpoint = requestedEndpoint(req)
    if (req.method !== 'POST' || endpoint === undefined) {
      res.writeHead(404).end('not found')
      return
    }
    const mediaType = req.headers?.['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
    if (mediaType !== 'application/json') {
      res.writeHead(415).end('content type must be application/json')
      return
    }
    let body
    try {
      body = JSON.parse(await readBody(req))
    } catch (error) {
      res.writeHead(error instanceof BodyTooLargeError ? 413 : 400)
        .end(error instanceof BodyTooLargeError ? 'request body too large' : 'body is not JSON')
      return
    }
    const envelope = asClientRequest(body)
    if (envelope === undefined || envelope.method !== endpoint) {
      sendJson(res, 200, {
        type: 'server-response',
        rpcId: envelope?.rpcId ?? INVALID_REQUEST_ID,
        result: failure('reviewChannel/bad-request', 'invalid client-request message'),
      })
      return
    }
    let result
    try {
      result = await dispatch(endpoint, envelope.payload)
    } catch (error) {
      result = failure('reviewChannel/internal', messageOf(error))
    }
    sendJson(res, 200, { type: 'server-response', rpcId: envelope.rpcId, result })
  }

  return { dispatch, handleRequest }
}

/** Raised when a request body exceeds the channel's cap. */
class BodyTooLargeError extends Error {}

/**
 * Extract the endpoint one request path names.
 * @param req - the incoming request.
 * @returns the endpoint, or undefined when the path is not this channel's.
 */
function requestedEndpoint(req) {
  const pathname = new URL(req.url ?? '/', 'http://openspec-flow.invalid').pathname
  if (!pathname.startsWith(`${REVIEW_CHANNEL}/`)) return undefined
  const endpoint = pathname.slice(REVIEW_CHANNEL.length + 1)
  const segments = endpoint.split('/')
  if (segments.length !== 2) return undefined
  if (segments.some((segment) => segment === '' || !ENDPOINT_SEGMENT_PATTERN.test(segment))) return undefined
  return endpoint
}

/**
 * Read the request body as UTF-8 text, bounded by {@link MAX_BODY_BYTES}.
 * @param req - the incoming request.
 * @returns the decoded body.
 * @throws BodyTooLargeError when the body exceeds the cap.
 */
async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new BodyTooLargeError()
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Validate the decoded body as a client request envelope.
 * @param body - decoded JSON body.
 * @returns the envelope, or undefined when it is not one.
 */
function asClientRequest(body) {
  const candidate = asRecord(body)
  if (candidate === undefined) return undefined
  if (candidate.type !== 'client-request') return undefined
  if (typeof candidate.rpcId !== 'string' || candidate.rpcId === '') return undefined
  if (typeof candidate.method !== 'string' || candidate.method === '') return undefined
  return { rpcId: candidate.rpcId, method: candidate.method, payload: candidate.payload }
}

/**
 * Write one JSON response.
 * @param res - the response to own.
 * @param status - HTTP status.
 * @param body - JSON body.
 */
function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  })
  res.end(text)
}

/**
 * Mount the channel on the plugin's context.
 *
 * The route exists only while the Web server and the Client connection are both
 * mounted: a headless profile keeps every tool and loses only the page's data
 * source.
 * @param ctx - host context.
 * @param settings - resolved plugin settings.
 * @returns nothing; the registration is owned by the plugin's effect scope.
 */
export function registerReviewChannel(ctx, settings) {
  if (typeof ctx.inject !== 'function') return
  // The row entry belongs to the plugin's fiber; the injected scope is a child,
  // so capture it here rather than reading it from the child.
  const entry = ctx.fiber?.entry
  ctx.inject(['connection', 'webServer'], (scope) => {
    const channel = createReviewChannel({ ctx: scope, settings, entry })
    scope.effect(() => scope.webServer.register({
      kind: 'prefix',
      path: REVIEW_CHANNEL,
      handler: (req, res) => channel.handleRequest(req, res),
    }), `openspec-flow: ${REVIEW_CHANNEL} route`)
  })
}
