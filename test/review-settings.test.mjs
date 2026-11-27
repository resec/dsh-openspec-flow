/**
 * The review configuration channel: catalog, settings, policies and the route.
 *
 * The channel is exercised through its own dispatch surface for behavior and
 * through a recorded HTTP request/response for the fence, the envelope and the
 * status codes, so a page-visible failure is asserted where the page would see it.
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  REVIEW_CHANNEL,
  REVIEW_ENDPOINTS,
} from '../lib/client/channel.js'
import {
  CATALOG_TTL_MS,
  createReviewChannel,
  knownProjects,
  nearestOpenSpecProject,
  projectFacts,
  registerReviewChannel,
} from '../lib/review/settings.js'
import { ensurePolicy } from '../lib/review/policy.js'
import { reviewDirectory, writeJsonAtomic } from '../lib/review/store.js'

const RESOLVED = { provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max' }

/**
 * Build a catalog whose calls are counted and whose failures are selectable.
 * @param options - whether providers, models and the model lookup fail.
 * @returns the catalog and its counters.
 */
function catalog({ failProviders = false, failModels = false, failResolve = false, efforts = [{ id: 'max', name: 'Max' }] } = {}) {
  const calls = { providers: 0, models: 0, resolve: 0 }
  const llm = {
    listProviders() {
      calls.providers += 1
      if (failProviders) throw new Error('provider lookup failed')
      return [{ id: 'deepseek', name: 'DeepSeek' }, { id: 'other', name: 'Other', extra: true }]
    },
    async listModels(provider) {
      calls.models += 1
      if (failModels) throw new Error('model lookup failed')
      return [{ provider, id: 'deepseek-flash', name: 'DeepSeek Flash' }]
    },
    async resolveModelInfo(provider, model) {
      calls.resolve += 1
      if (failResolve) throw new Error('resolve failed')
      if (model !== 'deepseek-flash') throw new Error('model not found')
      return { provider, model, reasoning: { efforts, defaultEffort: 'max' } }
    },
  }
  return { llm, calls }
}

/**
 * Build a project with one locked change and one recorded review, so a test can
 * assert that only the policy sections are returned.
 * @param options - git flag and a second change name.
 * @returns the project root, the review directory and a disposer.
 */
function project({ git = false, extraChange = undefined } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-openspec-settings-'))
  mkdirSync(join(root, 'openspec', 'changes'), { recursive: true })
  const config = {
    draft: { object: 'directory', enabled: true, reviewers: 1, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
    apply: { object: 'tree', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
  }
  const source = { path: 'openspec/reviews.json', sha256: 'a'.repeat(64), profiles: { draft: 'draft', apply: 'apply' } }
  writeFileSync(join(root, 'openspec', 'reviews.json'), JSON.stringify({
    profiles: {
      draft: { object: 'directory', enabled: true, reviewers: 1, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
      apply: { object: 'tree', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
    },
    reviews: { draft: 'draft', apply: 'apply' },
  }, null, 2))
  ensurePolicy({
    projectRoot: root,
    change: 'add-dark-mode',
    config,
    source,
    gitEnabled: git,
    lockedBy: 'new-change',
    resolveModel: () => RESOLVED,
  })
  const directory = reviewDirectory(root, undefined, 'add-dark-mode')
  writeJsonAtomic(join(directory, 'review.json'), {
    schemaVersion: 1,
    id: 'draft-1',
    change: 'add-dark-mode',
    review: 'draft',
    state: 'passed',
    findings: [{ id: 'R1-01', severity: 'major', status: 'fixed' }],
    rounds: [{ round: 1, report: { verdict: 'pass', summary: 'secret' } }],
  })
  if (extraChange !== undefined) {
    ensurePolicy({
      projectRoot: root,
      change: extraChange,
      store: 'team',
      config,
      source,
      gitEnabled: git,
      lockedBy: 'first-review',
      resolveModel: () => RESOLVED,
    })
  }
  return {
    root,
    directory,
    dispose() {
      rmSync(root, { recursive: true, force: true })
    },
  }
}

/**
 * Build the host context one channel reads.
 * @param options - directory, catalog, editor behavior and admission outcome.
 * @returns the context and the recorded edits.
 */
function channelContext({ directory, llm, editor = undefined, admission = { peer: {} } }) {
  const edits = []
  const configEditor = editor ?? {
    async edit(entry, change) {
      edits.push({ entry, next: change({ timeoutMs: 30_000, reviews: { draft: {}, apply: {} } }) })
    },
  }
  const agents = {
    list: () => [{ session: { id: 'session-1' } }, { session: { id: 'session-2' } }, { session: { id: 'session-3' } }],
  }
  const directories = new Map([
    ['session-1', directory],
    ['session-2', join(directory, 'openspec', 'changes')],
    ['session-3', '/nonexistent-place'],
  ])
  const ctx = {
    agents,
    workingDirectory: {
      get(session) {
        return directories.get(session?.id)
      },
    },
    llm,
    connection: {
      admit() {
        return admission
      },
    },
    configEditor,
    fiber: { entry: { id: 'openspec-flow' } },
    get(name) {
      if (name === 'agents') return agents
      if (name === 'workingDirectory') return ctx.workingDirectory
      if (name === 'llm') return llm
      if (name === 'configEditor') return configEditor
      if (name === 'connection') return ctx.connection
      return undefined
    },
  }
  return { ctx, edits }
}

/** A request whose body streams the given text as one chunk. */
function request({ method = 'POST', url, headers = {}, body }) {
  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(body)
    },
  }
}

/** A response recorder. */
function response() {
  return {
    status: undefined,
    headers: undefined,
    body: '',
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
      return this
    },
    end(text = '') {
      this.body = text
      return this
    },
  }
}

/**
 * Send one envelope through the channel's HTTP surface.
 * @param channel - the channel under test.
 * @param options - method, endpoint, body and headers.
 * @returns the recorded response.
 */
async function send(channel, {
  method = 'POST',
  endpoint = REVIEW_ENDPOINTS.settings,
  body = undefined,
  headers = { 'content-type': 'application/json' },
} = {}) {
  const res = response()
  await channel.handleRequest(
    request({ method, url: `${REVIEW_CHANNEL}/${endpoint}`, headers, body }),
    res,
  )
  return res
}

/** One valid client envelope. */
function envelope(method, payload = {}, rpcId = 'rpc-1') {
  return JSON.stringify({ type: 'client-request', rpcId, method, payload })
}

test('the catalog returns providers, models and efforts', async () => {
  const { llm } = catalog()
  const dir = project()
  try {
    const { ctx } = channelContext({ directory: dir.root, llm })
    const channel = createReviewChannel({ ctx, settings: { timeoutMs: 30_000, reviews: {} } })
    const providers = await channel.dispatch(REVIEW_ENDPOINTS.providers, {})
    assert.deepEqual(providers.value, [
      { id: 'deepseek', name: 'DeepSeek' },
      { id: 'other', name: 'Other' },
    ])
    const models = await channel.dispatch(REVIEW_ENDPOINTS.models, { provider: 'deepseek' })
    assert.deepEqual(models.value, [{ provider: 'deepseek', id: 'deepseek-flash', name: 'DeepSeek Flash' }])
    const efforts = await channel.dispatch(REVIEW_ENDPOINTS.efforts, { provider: 'deepseek', model: 'deepseek-flash' })
    assert.deepEqual(efforts.value, { efforts: [{ id: 'max', name: 'Max' }], defaultEffort: 'max' })
    const noEfforts = await channel.dispatch(REVIEW_ENDPOINTS.efforts, { provider: 'deepseek', model: 'other' })
    assert.equal(noEfforts.ok, false)
    assert.match(noEfforts.error.message, /model not found/)
  } finally {
    dir.dispose()
  }
})

test('catalog reads are cached for a minute and a failure keeps the last answer', async () => {
  let clock = 1_000
  const live = catalog()
  const dir = project()
  try {
    const { ctx } = channelContext({ directory: dir.root, llm: live.llm })
    const channel = createReviewChannel({
      ctx,
      settings: { timeoutMs: 30_000, reviews: {} },
      now: () => clock,
    })
    const first = await channel.dispatch(REVIEW_ENDPOINTS.providers, {})
    const second = await channel.dispatch(REVIEW_ENDPOINTS.providers, {})
    assert.deepEqual(first.value, second.value)
    assert.equal(live.calls.providers, 1)

    // A different endpoint has its own entry.
    await channel.dispatch(REVIEW_ENDPOINTS.models, { provider: 'deepseek' })
    assert.equal(live.calls.models, 1)

    // After the TTL the catalog is asked again.
    clock += CATALOG_TTL_MS
    await channel.dispatch(REVIEW_ENDPOINTS.providers, {})
    assert.equal(live.calls.providers, 2)

    // A failing lookup reports the reason and keeps the cached provider list.
    const broken = catalog({ failProviders: true })
    const brokenChannel = createReviewChannel({
      ctx: channelContext({ directory: dir.root, llm: broken.llm }).ctx,
      settings: { timeoutMs: 30_000, reviews: {} },
      now: () => clock,
    })
    const failureResult = await brokenChannel.dispatch(REVIEW_ENDPOINTS.providers, {})
    assert.equal(failureResult.ok, false)
    assert.equal(failureResult.error.code, 'reviewModels/unavailable')
    assert.match(failureResult.error.message, /provider lookup failed/)

    // A missing catalog reports every read as unavailable.
    const empty = createReviewChannel({
      ctx: channelContext({ directory: dir.root, llm: undefined }).ctx,
      settings: { timeoutMs: 30_000, reviews: {} },
    })
    for (const endpoint of [REVIEW_ENDPOINTS.providers, REVIEW_ENDPOINTS.models, REVIEW_ENDPOINTS.efforts]) {
      const result = await empty.dispatch(endpoint, { provider: 'deepseek', model: 'deepseek-flash' })
      assert.equal(result.error.code, 'reviewModels/unavailable')
    }
  } finally {
    dir.dispose()
  }
})

test('the catalog rejects a bad argument and a malformed catalog answer', async () => {
  const dir = project()
  try {
    const { ctx } = channelContext({ directory: dir.root, llm: catalog().llm })
    const channel = createReviewChannel({ ctx, settings: { timeoutMs: 30_000, reviews: {} } })
    assert.equal((await channel.dispatch(REVIEW_ENDPOINTS.models, {})).error.code, 'reviewModels/bad-argument')
    assert.equal((await channel.dispatch(REVIEW_ENDPOINTS.efforts, { provider: 'deepseek' })).error.code, 'reviewModels/bad-argument')
    assert.equal((await channel.dispatch(REVIEW_ENDPOINTS.efforts, { model: 'x' })).error.code, 'reviewModels/bad-argument')

    const malformed = createReviewChannel({
      ctx: channelContext({
        directory: dir.root,
        llm: { listProviders: () => 'nope', listModels: async () => 'nope', resolveModelInfo: async () => ({ reasoning: undefined }) },
      }).ctx,
      settings: { timeoutMs: 30_000, reviews: {} },
    })
    const providers = await malformed.dispatch(REVIEW_ENDPOINTS.providers, {})
    assert.match(providers.error.message, /no provider list/)
    const models = await malformed.dispatch(REVIEW_ENDPOINTS.models, { provider: 'p' })
    assert.match(models.error.message, /no models for 'p'/)
    const efforts = await malformed.dispatch(REVIEW_ENDPOINTS.efforts, { provider: 'p', model: 'm' })
    assert.deepEqual(efforts.value, { efforts: [], defaultEffort: null })
  } finally {
    dir.dispose()
  }
})

test('settings reads report the switch and each project configuration read-only', async () => {
  const dir = project()
  try {
    const settings = { timeoutMs: 30_000, reviewEnabled: true, legacyReviews: true }
    const { ctx } = channelContext({ directory: dir.root, llm: catalog().llm })
    const channel = createReviewChannel({ ctx, settings })
    const read = await channel.dispatch(REVIEW_ENDPOINTS.settings, {})
    assert.equal(read.ok, true)
    assert.equal(read.value.reviewEnabled, true)
    assert.equal(read.value.legacyReviews, true)
    assert.equal(read.value.projects.length, 1)
    const [first] = read.value.projects
    assert.equal(first.path, dir.root)
    assert.equal(first.config.reviews.draft, 'draft')
    assert.equal(first.config.draft.reviewers, 1)
    assert.equal(first.config.draft.passCriteria, 'major')
    assert.equal(first.config.draft.allowDeferred, true)
    assert.equal(first.config.draft.allowRejected, true)
    assert.equal(first.configError, undefined)
    assert.equal('reviews' in read.value, false, 'the channel no longer returns editable sections')
  } finally {
    dir.dispose()
  }
})

test('settings reads report a schema error without failing', async () => {
  const dir = project()
  try {
    writeFileSync(join(dir.root, 'openspec', 'reviews.json'), '{ broken')
    const settings = { timeoutMs: 30_000, reviewEnabled: false, legacyReviews: false }
    const { ctx } = channelContext({ directory: dir.root, llm: catalog().llm })
    const channel = createReviewChannel({ ctx, settings })
    const read = await channel.dispatch(REVIEW_ENDPOINTS.settings, {})
    assert.equal(read.ok, true)
    assert.equal(read.value.reviewEnabled, false)
    const [first] = read.value.projects
    assert.match(first.configError, /not valid JSON/)
    assert.equal(first.config, undefined)
  } finally {
    dir.dispose()
  }
})

test('there is no settings update endpoint', async () => {
  const dir = project()
  try {
    const { ctx } = channelContext({ directory: dir.root, llm: catalog().llm })
    const channel = createReviewChannel({ ctx, settings: { timeoutMs: 30_000 } })
    const refused = await channel.dispatch('reviewSettings/update', {})
    assert.equal(refused.error.code, 'reviewChannel/unknown-endpoint')
    assert.equal(REVIEW_ENDPOINTS.update, undefined)
  } finally {
    dir.dispose()
  }
})
test('locked policies list only the review sections of each project', async () => {
  const dir = project({ git: true, extraChange: 'add-light-mode' })
  try {
    const { ctx } = channelContext({ directory: dir.root, llm: catalog().llm })
    const channel = createReviewChannel({ ctx, settings: { timeoutMs: 30_000, reviews: {} } })
    const result = await channel.dispatch(REVIEW_ENDPOINTS.policies, {})
    assert.equal(result.ok, true)
    assert.equal(result.value.projects.length, 1)
    const [first] = result.value.projects
    assert.equal(first.path, dir.root)
    assert.equal(first.git, projectFacts(dir.root).git)
    assert.deepEqual(first.changes.map((change) => change.change).sort(), ['add-dark-mode', 'add-light-mode'])
    const dark = first.changes.find((change) => change.change === 'add-dark-mode')
    assert.equal(dark.reviews.draft.reviewers, 1)
    assert.equal(dark.reviews.apply.reviewers, 0)
    assert.deepEqual(dark.pipeline, { beforeApply: 'draft', beforeArchive: 'apply' })
    assert.equal(dark.reviews.draft.reviewerModel.provider, 'deepseek')
    assert.equal(dark.lockedBy, 'new-change')
    assert.equal(typeof dark.lockedAt, 'string')
    // Reports and findings never appear.
    const text = JSON.stringify(result.value)
    assert.doesNotMatch(text, /secret/)
    assert.doesNotMatch(text, /findings/)
    assert.doesNotMatch(text, /R1-01/)
  } finally {
    dir.dispose()
  }
})

test('project discovery walks up, deduplicates and skips plain directories', () => {
  const dir = project()
  try {
    const nested = join(dir.root, 'openspec', 'changes', 'add-dark-mode')
    assert.equal(nearestOpenSpecProject(nested), dir.root)
    assert.equal(nearestOpenSpecProject('/definitely/not/a/project'), undefined)
    assert.equal(nearestOpenSpecProject(''), undefined)
    assert.equal(nearestOpenSpecProject(undefined), undefined)

    const { ctx } = channelContext({ directory: dir.root, llm: catalog().llm })
    assert.deepEqual(knownProjects(ctx), [dir.root])

    // No agents means no known project rather than a failure.
    const empty = { get: () => undefined }
    assert.deepEqual(knownProjects(empty), [])
    const throwing = {
      get(name) {
        if (name === 'agents') return { list: () => [{ session: { id: 'x' } }] }
        if (name === 'workingDirectory') {
          return {
            get() {
              throw new Error('directory unavailable')
            },
          }
        }
        return undefined
      },
    }
    assert.deepEqual(knownProjects(throwing), [])

    // A project without a review root reports no locked changes.
    const bare = mkdtempSync(join(tmpdir(), 'dsh-openspec-bare-'))
    try {
      mkdirSync(join(bare, 'openspec'))
      assert.deepEqual(projectFacts(bare).changes, [])
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }

    // A non-directory entry and a directory without a policy are skipped.
    mkdirSync(join(dir.root, 'openspec', '.review', 'empty-dir'), { recursive: true })
    writeFileSync(join(dir.root, 'openspec', '.review', 'stray.txt'), 'x')
    assert.deepEqual(projectFacts(dir.root).changes.map((change) => change.change), ['add-dark-mode'])
  } finally {
    dir.dispose()
  }
})

test('the route answers the fence, the envelope and every refusal', async () => {
  const dir = project()
  try {
    const { ctx } = channelContext({ directory: dir.root, llm: catalog().llm })
    const channel = createReviewChannel({ ctx, settings: { timeoutMs: 30_000, reviews: {} } })

    const ok = await send(channel, { body: envelope(REVIEW_ENDPOINTS.settings) })
    assert.equal(ok.status, 200)
    const parsed = JSON.parse(ok.body)
    assert.equal(parsed.type, 'server-response')
    assert.equal(parsed.rpcId, 'rpc-1')
    assert.equal(parsed.result.ok, true)

    const denied = createReviewChannel({
      ctx: channelContext({ directory: dir.root, llm: catalog().llm, admission: { rejection: 403 } }).ctx,
      settings: { timeoutMs: 30_000, reviews: {} },
    })
    const refused = await send(denied, { body: envelope(REVIEW_ENDPOINTS.settings) })
    assert.equal(refused.status, 403)
    assert.equal(refused.body, 'forbidden')

    const unauthorized = createReviewChannel({
      ctx: channelContext({ directory: dir.root, llm: catalog().llm, admission: { rejection: 401 } }).ctx,
      settings: { timeoutMs: 30_000, reviews: {} },
    })
    assert.equal((await send(unauthorized, { body: envelope(REVIEW_ENDPOINTS.settings) })).status, 401)

    assert.equal((await send(channel, { method: 'GET', body: envelope(REVIEW_ENDPOINTS.settings) })).status, 404)
    assert.equal((await send(channel, { endpoint: 'a', body: envelope('a') })).status, 404)
    const unknownPath = await send(channel, { endpoint: 'unknown/path', body: envelope('unknown/path') })
    assert.equal(JSON.parse(unknownPath.body).result.error.code, 'reviewChannel/unknown-endpoint')
    assert.equal((await send(channel, { headers: { 'content-type': 'text/plain' }, body: 'x' })).status, 415)
    assert.equal((await send(channel, { body: 'not json' })).status, 400)

    const wrongMethod = await send(channel, {
      body: JSON.stringify({ type: 'client-request', rpcId: 'rpc-2', method: REVIEW_ENDPOINTS.policies, payload: {} }),
    })
    assert.equal(JSON.parse(wrongMethod.body).result.error.code, 'reviewChannel/bad-request')

    const malformed = await send(channel, { body: JSON.stringify({ type: 'nope' }) })
    assert.equal(JSON.parse(malformed.body).rpcId, 'invalid-request')

    const huge = await send(channel, { body: `{"pad":"${'x'.repeat(1_048_577)}"}` })
    assert.equal(huge.status, 413)

    const unknown = await channel.dispatch('reviewNope/list', {})
    assert.equal(unknown.error.code, 'reviewChannel/unknown-endpoint')

    // A dispatch failure becomes one internal failure rather than a crash.
    const exploding = createReviewChannel({
      ctx: {
        get(name) {
          if (name === 'agents') {
            return {
              list() {
                throw new Error('agent list unavailable')
              },
            }
          }
          return undefined
        },
      },
      settings: { timeoutMs: 30_000, reviews: {} },
    })
    const failed = await send(exploding, { endpoint: REVIEW_ENDPOINTS.policies, body: envelope(REVIEW_ENDPOINTS.policies) })
    assert.equal(JSON.parse(failed.body).result.error.code, 'reviewChannel/internal')
  } finally {
    dir.dispose()
  }
})

test('the route registers as one prefix and unregisters with the plugin', async () => {
  const dir = project()
  try {
    const registered = []
    const disposers = []
    const effects = []
    const scope = {
      webServer: {
        register(route) {
          registered.push(route)
          return () => {
            disposers.push(route)
          }
        },
      },
      effect(fn) {
        const disposer = fn()
        effects.push(disposer)
        return disposer
      },
      get() {
        return undefined
      },
    }
    const ctx = {
      inject(dependencies, callback) {
        assert.deepEqual(dependencies, ['connection', 'webServer'])
        callback(scope)
      },
    }
    registerReviewChannel(ctx, { timeoutMs: 30_000, reviews: {} })
    assert.equal(registered.length, 1)
    assert.equal(registered[0].kind, 'prefix')
    assert.equal(registered[0].path, REVIEW_CHANNEL)
    assert.equal(typeof registered[0].handler, 'function')

    // The registered handler answers through the same channel implementation.
    const answered = response()
    await registered[0].handler(
      request({
        url: `${REVIEW_CHANNEL}/${REVIEW_ENDPOINTS.settings}`,
        headers: { 'content-type': 'application/json' },
        body: envelope(REVIEW_ENDPOINTS.settings),
      }),
      answered,
    )
    assert.equal(answered.status, 200)
    assert.equal(JSON.parse(answered.body).result.ok, true)

    // The registration is one effect: unloading it removes the route.
    assert.equal(effects.length, 1)
    effects[0]()
    assert.equal(disposers.length, 1)

    // A context without optional injection registers nothing and does not throw.
    assert.doesNotThrow(() => registerReviewChannel({}, { timeoutMs: 30_000, reviews: {} }))
  } finally {
    dir.dispose()
  }
})


test('a project policy lists an extra entry and its pipeline', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-openspec-extra-entry-'))
  try {
    execFileSync('git', ['-C', root, 'init', '-q'])
    mkdirSync(join(root, 'openspec'), { recursive: true })
    const directory = reviewDirectory(root, null, 'demo')
    mkdirSync(directory, { recursive: true })
    writeJsonAtomic(join(directory, 'policy.json'), {
      schemaVersion: 3,
      change: 'demo',
      reviews: {
        draft: {
          object: 'directory', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' },
        },
        pr: {
          object: 'tree', enabled: true, reviewers: 1, waitMinutes: 15, reviewerModel: { source: 'inherit' },
        },
      },
      pipeline: { beforeApply: 'draft', beforeArchive: 'pr' },
    })
    const facts = projectFacts(root)
    assert.equal(facts.changes.length, 1)
    assert.equal(facts.changes[0].reviews.pr.reviewers, 1)
    assert.deepEqual(facts.changes[0].pipeline, { beforeApply: 'draft', beforeArchive: 'pr' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a legacy policy is listed once and migrated to the shared root', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-openspec-legacy-policy-'))
  try {
    execFileSync('git', ['-C', root, 'init', '-q'])
    const legacy = join(root, 'openspec', '.review', 'local#demo')
    mkdirSync(legacy, { recursive: true })
    const reviews = {
      draft: { enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
      apply: { enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
    }
    writeFileSync(join(legacy, 'policy.json'), `${JSON.stringify({ schemaVersion: 1, change: 'demo', store: null, reviews }, null, 2)}\n`)
    const other = join(root, 'openspec', '.review', 'local#other')
    mkdirSync(other, { recursive: true })
    writeFileSync(join(other, 'policy.json'), `${JSON.stringify({ schemaVersion: 1, reviews }, null, 2)}\n`)
    const facts = projectFacts(root)
    assert.equal(facts.changes.length, 2)
    assert.deepEqual(facts.changes.map((entry) => entry.change).sort(), ['demo', 'local#other'])
    const sharedDemo = reviewDirectory(root, null, 'demo')
    assert.ok(sharedDemo.includes('openspec-flow'))
    rmSync(sharedDemo, { recursive: true, force: true })
    assert.equal(projectFacts(root).changes.some((entry) => entry.change === 'demo'), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
