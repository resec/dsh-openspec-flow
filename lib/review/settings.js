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
 * The channel owns four answers and one write:
 * - the model catalog (providers, models, reasoning efforts), cached for a minute;
 * - the current review settings, read from the validated row config;
 * - the locked policies of every OpenSpec project a live agent works in;
 * - the review cards of the caller's session for the current turn, bound and
 *   delivered under the review root;
 * - a settings save that validates the complete candidate twice, by shape and by
 *   catalog, before the configuration editor persists it.
 *
 * Reads never resolve a Session and never touch the worktree. The card answer
 * writes only inside the ignored review root: turn bindings and the delivery
 * watermark under `openspec/.review/`; it never touches the record, the report,
 * the Session or anything outside that root.
 *
 * @module dsh-openspec-flow/review/settings
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  REVIEW_CHANNEL,
  REVIEW_ENDPOINTS,
  failure,
  success,
} from '../client/channel.js'
import { validateConfig } from '../config.js'
import { isOpenSpecProject } from '../policy.js'
import { applySettings, draftSettings } from './config.js'
import { assertReviewerModelAvailable } from './model.js'
import { policyApply, policyDraft, readPolicy } from './policy.js'
import { isGitRepository, reviewRoot, withReviewLock, writeJsonAtomic } from './store.js'
import { CARD_PHASES, sessionKeyOf } from './cards.js'

/** How long one catalog answer stays fresh, in milliseconds. */
export const CATALOG_TTL_MS = 60_000

/** Largest number of projects the page lists. */
const MAX_PROJECTS = 20

/** Largest number of locked changes listed per project. */
const MAX_CHANGES = 50

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
  let names
  try {
    names = readdirSync(reviewRoot(projectRoot))
  } catch {
    return facts
  }
  for (const name of names.sort()) {
    const directory = join(reviewRoot(projectRoot), name)
    try {
      if (!statSync(directory).isDirectory()) continue
    } catch {
      continue
    }
    const policy = readPolicy(directory)
    if (policy === undefined) continue
    const change = typeof policy.change === 'string' && policy.change.trim() !== '' ? policy.change : name
    facts.changes.push({
      change,
      store: typeof policy.store === 'string' && policy.store !== '' ? policy.store : null,
      lockedAt: typeof policy.lockedAt === 'string' ? policy.lockedAt : null,
      lockedBy: typeof policy.lockedBy === 'string' ? policy.lockedBy : null,
      reviews: { draft: policyDraft(policy), apply: policyApply(policy) },
    })
    if (facts.changes.length >= MAX_CHANGES) break
  }
  return facts
}

/**
 * Build the channel's request handling.
 * @param options - host context, resolved plugin settings, the row entry and a clock.
 * @returns `{ dispatch, handleRequest }`.
 */
export function createReviewChannel({ ctx, settings, now = Date.now, entry = undefined }) {
  const llm = ctx.get?.('llm') ?? ctx.llm
  const catalog = createCatalog(llm, now)

  /**
   * The configuration editor and the row entry it edits.
   * @returns the pair, or undefined when this profile cannot persist configuration.
   */
  function editorOf() {
    const editor = ctx.get?.('configEditor') ?? ctx.configEditor
    const target = entry ?? ctx.fiber?.entry
    if (target === undefined || editor === undefined || typeof editor.edit !== 'function') return undefined
    return { editor, entry: target }
  }

  /**
   * The current review settings, as the page renders them.
   * @returns the channel result.
   */
  function readSettings() {
    const target = editorOf()
    return success({
      reviews: {
        draft: draftSettings(settings),
        apply: applySettings(settings),
      },
      bounds: BOUNDS,
      canSave: target !== undefined,
      ...(target === undefined
        ? { saveReason: 'configuration cannot be saved in this profile' }
        : {}),
    })
  }

  /**
   * Validate and persist one settings candidate.
   * @param payload - `{ reviews }`.
   * @returns the channel result.
   */
  async function writeSettings(payload) {
    const input = asRecord(payload)
    const reviews = asRecord(input?.reviews)
    if (reviews === undefined) {
      return failure('reviewSettings/invalid', 'reviews must carry the draft and apply sections')
    }
    const candidate = validateConfig({ timeoutMs: settings.timeoutMs, reviews })
    if (Array.isArray(candidate.issues)) {
      return failure(
        'reviewSettings/invalid',
        candidate.issues.map((issue) => issue.message).join('; '),
        { issues: candidate.issues.map((issue) => issue.message) },
      )
    }
    for (const kind of ['draft', 'apply']) {
      const model = candidate.value.reviews[kind].reviewerModel
      if (model.source !== 'explicit') continue
      try {
        await assertReviewerModelAvailable(llm, model)
      } catch (error) {
        return failure('reviewSettings/model', `reviews.${kind}.reviewerModel: ${messageOf(error)}`)
      }
    }
    const target = editorOf()
    if (target === undefined) {
      return failure('reviewSettings/unavailable', 'configuration cannot be saved in this profile')
    }
    try {
      await target.editor.edit(target.entry, (current) => ({
        ...(asRecord(current) ?? {}),
        reviews: candidate.value.reviews,
      }))
    } catch (error) {
      return failure('reviewSettings/rejected', messageOf(error))
    }
    return success({ reviews: candidate.value.reviews })
  }

  /**
   * Read one card file, or null when it is not a valid card.
   * @param path - file path.
   * @returns the card file, or null.
   */
  function readCardFile(path) {
    try {
      const value = JSON.parse(readFileSync(path, 'utf8'))
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
   * Every valid card file under one project's review root.
   * @param project - project root.
   * @returns card file records.
   */
  function cardFilesOf(project) {
    const base = reviewRoot(project)
    let names
    try {
      names = readdirSync(base)
    } catch {
      return []
    }
    const out = []
    for (const name of names) {
      const directory = join(base, name)
      try {
        if (!statSync(directory).isDirectory()) continue
      } catch {
        continue
      }
      const cardsDirectory = join(directory, 'cards')
      let files
      try {
        files = readdirSync(cardsDirectory)
      } catch {
        continue
      }
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const path = join(cardsDirectory, file)
        const data = readCardFile(path)
        if (data !== null) out.push({ directory, path, data })
      }
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
      const value = JSON.parse(readFileSync(join(directory, 'card-delivery.json'), 'utf8'))
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
   * Answer `reviewCards/get`: return cards bound to the turn, bind unclaimed
   * cards written within it, and persist the binding plus the watermark.
   * @param payload - `{ sessionId, turn, from?, to? }`.
   * @returns the channel result.
   */
  function readCards(payload) {
    const input = asRecord(payload) ?? {}
    const sessionId = readString(input, 'sessionId')
    if (sessionId === undefined) {
      return failure('reviewCards/bad-argument', 'cards needs a sessionId')
    }
    const turn = input.turn
    if (!Number.isInteger(turn) || turn < 1) {
      return failure('reviewCards/bad-argument', 'cards needs a positive turn')
    }
    const fromText = readString(input, 'from')
    const from = fromText !== undefined && !Number.isNaN(Date.parse(fromText))
      ? new Date(fromText).toISOString()
      : undefined
    const toText = readString(input, 'to')
    if (toText !== undefined && Number.isNaN(Date.parse(toText))) {
      return failure('reviewCards/bad-argument', 'cards needs an ISO turn end time')
    }
    const to = toText !== undefined ? new Date(toText).toISOString() : undefined
    const nowIso = new Date(now()).toISOString()
    const cards = []
    for (const project of knownProjects(ctx)) {
      const grouped = new Map()
      for (const file of cardFilesOf(project)) {
        if (file.data.sessionId !== sessionId) continue
        const group = grouped.get(file.directory) ?? []
        group.push(file)
        grouped.set(file.directory, group)
      }
      for (const [directory, files] of grouped) {
        try {
          withReviewLock(directory, 'cards-deliver', () => {
            const delivery = readDelivery(directory)
            const key = sessionKeyOf(sessionId)
            const watermark = delivery.sessions[key]?.lastDeliveredAt
            const previous = typeof watermark === 'string' ? watermark : undefined
            const cutoff = from ?? previous
            for (const file of files) {
              const data = file.data
              const writtenAt = typeof data.writtenAt === 'string' ? data.writtenAt : null
              if (data.turn === turn) {
                cards.push({ payload: data.payload, writtenAt })
                continue
              }
              if (data.turn !== null && data.turn !== undefined) continue
              if (cutoff !== undefined && (writtenAt === null || writtenAt < cutoff)) continue
              if (to !== undefined && (writtenAt === null || writtenAt > to)) continue
              data.turn = turn
              data.claimedAt = nowIso
              writeJsonAtomic(file.path, data)
              cards.push({ payload: data.payload, writtenAt })
            }
            const bounded = to !== undefined && to < nowIso ? to : nowIso
            delivery.sessions[key] = {
              lastDeliveredAt: previous !== undefined && previous > bounded ? previous : bounded,
            }
            writeJsonAtomic(join(directory, 'card-delivery.json'), delivery)
          })
        } catch (error) {
          ctx.logger?.warn?.(
            `openspec-flow: review cards could not be delivered: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }
    const rank = { review: 0, resolution: 1 }
    cards.sort((left, right) => {
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
    })
    return success({ cards: cards.map((card) => card.payload) })
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
    if (endpoint === REVIEW_ENDPOINTS.update) return await writeSettings(input)
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
