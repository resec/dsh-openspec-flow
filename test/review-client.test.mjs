/**
 * The browser half: the review configuration page bundle.
 *
 * The bundle is a loader artifact, so the test captures the registration the
 * page performs, drives the pure form transitions the page calls between
 * renders, and compares the endpoint literals against the Host contract.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { REVIEW_CHANNEL, REVIEW_ENDPOINTS } from '../lib/client/channel.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Load the bundle with a recording module loader.
 * @returns the loader's captured registration and the package manifest.
 */
let cached = undefined

async function loadBundle() {
  if (cached !== undefined) return cached
  const loaded = []
  globalThis.window = {
    __ModuleLoader__: {
      load(entry) {
        loaded.push(entry)
      },
    },
  }
  await import(new URL('../client.js', import.meta.url).href)
  const entry = loaded[0]
  const effectDeps = []
  const stateSetters = []
  const cleanups = []
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: (initial) => {
      let value = typeof initial === 'function' ? initial() : initial
      return [value, (next) => {
        stateSetters.push(next)
        value = typeof next === 'function' ? next(value) : next
      }]
    },
    useEffect: (fn, deps) => {
      effectDeps.push(deps)
      const cleanup = fn()
      cleanups.push(typeof cleanup === 'function' ? cleanup : undefined)
    },
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
  }
  const plugin = entry.factory((name) => {
    assert.equal(name, 'react')
    return react
  })
  cached = { entry, plugin, effectDeps, stateSetters, cleanups }
  return cached
}

/**
 * Build the client context the bundle's `apply` reads.
 * @returns the context, registered dictionaries and registrations.
 */
function clientContext() {
  const dictionaries = []
  const registrations = []
  const injections = []
  const effects = []
  const ctx = {
    locale: {
      register(namespace, dicts) {
        dictionaries.push({ namespace, dicts })
        return () => {}
      },
      bind(namespace) {
        return (key) => `${namespace}:${key}`
      },
    },
    slots: {
      inject(name, factory) {
        injections.push(name)
        return factory()
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
    connection: {
      rpc: {
        async call(channel, endpoint, payload) {
          return { ok: true, value: { channel, endpoint, payload } }
        },
      },
    },
    effect(fn) {
      const disposer = fn()
      effects.push(disposer)
      return disposer
    },
  }
  return { ctx, dictionaries, registrations, injections, effects }
}

test('the bundle registers one row configuration page', async () => {
  const { entry, plugin } = await loadBundle()
  assert.equal(entry.id, 'dsh-openspec-flow')
  assert.deepEqual(plugin.inject, ['slots', 'locale', 'connection'])

  const { ctx, dictionaries, registrations, injections } = clientContext()
  plugin.apply(ctx)
  assert.equal(dictionaries.length, 1)
  assert.equal(dictionaries[0].namespace, 'openspecReview')
  assert.equal(typeof dictionaries[0].dicts.zh.title, 'string')
  assert.equal(typeof dictionaries[0].dicts.en.title, 'string')
  assert.deepEqual(Object.keys(dictionaries[0].dicts.zh).sort(), Object.keys(dictionaries[0].dicts.en).sort())

  assert.deepEqual(injections, ['plugins.row.config', 'conversation.chat.turnTail'])
  assert.equal(registrations.length, 2)
  assert.equal(registrations[0].options.name, 'plugins.row.config')
  assert.equal(registrations[0].options.key, 'dsh-openspec-flow#openspec-flow')
  assert.equal(registrations[0].options.locale, 'openspecReview')
  assert.equal(registrations[1].options.name, 'conversation.chat.turnTail')
  assert.equal(registrations[1].options.id, 'dsh-openspec-flow/review-cards')
  assert.equal(registrations[1].options.locale, 'openspecReview')

  // The owner asks for a one-line summary and for the page itself.
  assert.equal(registrations[0].component({ view: 'summary' }), 'openspecReview:summary')
  const page = registrations[0].component({ view: 'page' })
  assert.equal(typeof page, 'object')
  assert.equal(page.type.name, 'Page')
})

test('the card tail requests the current turn and hides on failure', async () => {
  const { plugin, effectDeps } = await loadBundle()
  const built = clientContext()
  const calls = []
  built.ctx.connection.rpc.call = async (channel, endpoint, payload) => {
    calls.push({ channel, endpoint, payload })
    return { ok: false, error: { code: 'reviewCards/failed', message: 'no cards' } }
  }
  plugin.apply(built.ctx)
  const turnTail = built.registrations.find((entry) => entry.options.name === 'conversation.chat.turnTail')
  const start = Date.parse('2026-01-01T00:00:00.000Z')
  const end = Date.parse('2026-01-01T01:00:00.000Z')
  assert.equal(turnTail.component({
    turn: { turn: 7, start: { time: start }, end: { time: end } },
    sessionId: 'session-7',
  }), null)
  await Promise.resolve()
  assert.deepEqual(calls[0], {
    channel: '/openspec-review',
    endpoint: 'reviewCards/get',
    payload: {
      sessionId: 'session-7',
      turn: 7,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-01T01:00:00.000Z',
    },
  })
  assert.deepEqual(effectDeps.at(-1), ['session-7', 7, start, end])
  assert.equal(turnTail.component({ turn: { turn: 8 }, sessionId: '' }), null)
  assert.equal(calls.length, 1)
  assert.equal(turnTail.component({
    turn: { turn: 11, start: { time: 1e9 }, end: { time: 1e18 } },
    sessionId: 'session-odd',
  }), null)
  await Promise.resolve()
  assert.deepEqual(calls[1].payload, { sessionId: 'session-odd', turn: 11 })
  assert.equal(turnTail.component({
    turn: { turn: 7, start: { time: start }, end: { time: end + 60_000 } },
    sessionId: 'session-7',
  }), null)
  await Promise.resolve()
  assert.equal(calls[2].payload.to, '2026-01-01T01:01:00.000Z')
  assert.equal(turnTail.component({ turn: { turn: 9, sessionId: 'turn-session' } }), null)
  await Promise.resolve()
  assert.equal(calls[3].payload.sessionId, 'turn-session')
  assert.equal(calls[3].payload.turn, 9)
  assert.equal(calls[3].payload.from, undefined)
  assert.equal(calls[3].payload.to, undefined)
})

test('the card tail omits non-finite times', async () => {
  const { plugin } = await loadBundle()
  const built = clientContext()
  const calls = []
  built.ctx.connection.rpc.call = async (channel, endpoint, payload) => {
    calls.push(payload)
    return { ok: true, value: { cards: [] } }
  }
  plugin.apply(built.ctx)
  const turnTail = built.registrations.find((entry) => entry.options.name === 'conversation.chat.turnTail')
  assert.equal(turnTail.component({
    turn: { turn: 12, start: { time: Number.NaN }, end: { time: Number.POSITIVE_INFINITY } },
    sessionId: 'session-nonfinite',
  }), null)
  await Promise.resolve()
  assert.deepEqual(calls[0], { sessionId: 'session-nonfinite', turn: 12 })
})

test('the bundle repeats the channel and endpoint literals exactly', () => {
  const text = readFileSync(join(ROOT, 'client.js'), 'utf8')
  assert.match(text, new RegExp(`const CHANNEL = '${REVIEW_CHANNEL}'`))
  for (const value of Object.values(REVIEW_ENDPOINTS)) {
    assert.ok(text.includes(`'${value}'`), `client.js names ${value}`)
  }
})

test('a locked section is described in one line', async () => {
  const { plugin } = await loadBundle()
  const { lockLine } = plugin.__test
  const t = (key, params) => (params?.n === undefined ? key : `${key}:${String(params.n)}`)
  const line = lockLine(t, { enabled: true, reviewers: 1, waitMinutes: 15 }, 'draft')
  assert.equal(line, 'draft: enabledOn · reviewersText:1 · 15m')
  assert.match(lockLine(t, { enabled: false, reviewers: 0, waitMinutes: 15 }, 'apply'), /apply: enabledOff/)
})

/**
 * Drive the read-only page controller with a scripted channel.
 * @param answers - endpoint to answer function; a thrown error models a transport failure.
 * @returns the controller and its calls.
 */
async function controllerWith(answers) {
  const { plugin } = await loadBundle()
  const calls = []
  /** Answer one endpoint from the script. */
  async function call(endpoint, payload) {
    calls.push({ endpoint, payload })
    const answer = answers[endpoint]
    if (answer === undefined) throw new Error(`unexpected endpoint ${endpoint}`)
    return await answer(payload)
  }
  const controller = plugin.__test.createController({ call })
  return { controller, calls }
}

test('the controller reads the switch and each project configuration', async () => {
  const settings = {
    reviewEnabled: false,
    legacyReviews: true,
    projects: [
      {
        path: '/p',
        git: true,
        changes: [],
        config: {
          profiles: {
            d: { object: 'directory', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
            a: { object: 'tree', enabled: true, reviewers: 1, waitMinutes: 20, reviewerModel: { source: 'inherit' } },
          },
          reviews: { draft: 'd', apply: 'a' },
        },
        configPath: 'openspec/reviews.json',
      },
      { path: '/q', git: false, changes: [], configError: 'openspec/reviews.json: reviewers is required' },
    ],
  }
  const { controller, calls } = await controllerWith({
    'reviewSettings/get': () => ({ ok: true, value: settings }),
  })
  const seen = []
  controller.subscribe(() => { seen.push(controller.getState().status) })
  await controller.load()
  assert.deepEqual(calls.map((entry) => entry.endpoint), ['reviewSettings/get'])
  const state = controller.getState()
  assert.equal(state.status, 'ready')
  assert.equal(state.reviewEnabled, false)
  assert.equal(state.legacyReviews, true)
  assert.equal(state.projects.length, 2)
  assert.equal(state.projects[0].config.reviews.apply, 'a')
  assert.match(state.projects[1].configError, /reviewers is required/)
  assert.ok(seen.includes('ready'))

  // A failed read is the one failure that stops the page.
  const failing = await controllerWith({
    'reviewSettings/get': () => ({ ok: false, error: { code: 'reviewSettings/invalid', message: 'no config' } }),
  })
  await failing.controller.load()
  assert.equal(failing.controller.getState().status, 'error')
  assert.match(failing.controller.getState().error, /no config/)
})

test('the page states the locking boundary', () => {
  const text = readFileSync(join(ROOT, 'client.js'), 'utf8')
  assert.ok(text.includes('只影响之后新建的变更'))
  assert.ok(text.includes('affects only changes created afterwards'))
})

test('the page has no write path', () => {
  const text = readFileSync(join(ROOT, 'client.js'), 'utf8')
  assert.equal(text.includes('reviewSettings/update'), false)
  assert.equal(text.includes('configEditor'), false)
  assert.equal(text.includes('type="submit"'), false)
})

test('the package exports the client half and packs it', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(manifest.exports['./client'], './client.js')
  assert.ok(manifest.files.includes('client.js'))
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.deepEqual(manifest.dsh.client.inject, [
    '@deepseek-ai/dsh-client-ui-plugin-manager',
    '@deepseek-ai/dsh-client-ui-slots',
  ])
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')

  // npm keeps its cache outside the workspace; point it at a temporary directory
  // so a sandboxed run never writes into the home directory.
  const cache = mkdtempSync(join(tmpdir(), 'dsh-openspec-pack-'))
  const packed = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: cache,
      npm_config_update_notifier: 'false',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    },
  })
  rmSync(cache, { recursive: true, force: true })
  assert.equal(packed.status, 0, packed.stderr)
  const parsed = JSON.parse(packed.stdout)
  const entry = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0]
  assert.ok(entry !== undefined, 'npm pack reports one package entry')
  const path = entry.files.map((file) => file.path)
  assert.ok(path.includes('client.js'), 'the packed file list includes client.js')
  assert.ok(path.includes('index.js'))
  assert.ok(path.some((name) => name.startsWith('lib/review/settings.js')))
  assert.ok(path.some((name) => name.startsWith('lib/client/channel.js')))
})

test('cards select by turn, collapse and expose the full report', async () => {
  const { plugin } = await loadBundle()
  const { selectCards, cardTailElement, cardSummary, cardSections } = plugin.__test
  const reviewCard = {
    phase: 'review',
    review: 'draft',
    change: 'demo',
    round: 2,
    verdict: 'changes-requested',
    counts: { total: 1, blocking: 1 },
    nextAction: 'openspec_review action=dispose',
    object: { kind: 'change', hash: 'abc', changed: true },
    report: {
      summary: 'One blocker.',
      findings: [{
        id: 'R2-01', severity: 'major', status: 'open', location: 'proposal.md:3', title: 'Missing goal',
        problem: 'The goal is missing.', evidence: 'proposal.md', impact: 'Intent cannot be checked.',
        rule: 'Intent fit', failure: 'Apply starts without a goal.', suggestion: 'Add the goal.',
      }],
      verifications: [{ id: 'R1-01', status: 'verified-fixed', evidence: 'Checked tasks.md.' }],
      residualRisks: ['The goal may stay vague.'],
      outOfScope: ['Not this change.'],
    },
    findings: [{ id: 'R2-01', severity: 'major', status: 'fixed', note: 'Added the goal.', waiver: null, approvedBy: null, verifiedInRound: null }],
    planChangeWaiver: {
      approvedBy: 'user', recordedAt: '2026-01-01T00:00:00.000Z', text: 'Approved.',
      files: ['proposal.md'], draftObjectHash: 'd1', currentObjectHash: 'd2',
    },
    readinessReasons: ['the review is not ready'],
  }
  const resolutionCard = { ...reviewCard, phase: 'resolution', verdict: 'pass' }
  const view = { cards: [reviewCard, resolutionCard] }

  assert.deepEqual(selectCards(view).map((card) => card.phase), ['review', 'resolution'])
  assert.deepEqual(selectCards({ cards: [] }), [])
  assert.deepEqual(selectCards(undefined), [])
  assert.equal(cardSummary(reviewCard), '评审汇报 · demo · draft · 第 2 轮 · changes-requested · critical 0 · major 1 · minor 0 · nit 0')
  assert.match(cardSummary({ ...reviewCard, review: 'pr' }), /· pr ·/)
  assert.match(cardSummary({ ...reviewCard, review: '' }), /· draft ·/)
  assert.ok(!cardSummary(reviewCard).includes('下一步'))

  const sections = cardSections(reviewCard)
  const roundSection = sections.find((section) => section.title === '轮次信息')
  assert.deepEqual(roundSection.rows.find((row) => row[0] === '下一步'), ['下一步', 'openspec_review action=dispose'])
  const disposedSection = sections.find((section) => section.title === '处理情况')
  assert.deepEqual(disposedSection.items[0].rows.map((row) => row[0]), ['说明', '验证轮次'])
  const text = JSON.stringify(sections)
  for (const phrase of [
    '报告结论', 'One blocker.', '问题', 'The goal is missing.', '证据', 'proposal.md',
    '影响', '规则', '失败路径', '建议', '本轮验证', 'Checked tasks.md.',
    '残余风险', 'The goal may stay vague.', 'Out of scope', 'Not this change.',
    '处理情况', 'Added the goal.', '规划变更豁免', 'Approved.', '未就绪原因',
  ]) {
    assert.ok(text.includes(phrase), `the expanded card shows ${phrase}`)
  }

  const built = clientContext()
  plugin.apply(built.ctx)
  const turnTail = built.registrations.find((entry) => entry.options.name === 'conversation.chat.turnTail')
  assert.deepEqual(turnTail.options.inject('session-2'), { sessionId: 'session-2' })
  const element = cardTailElement([reviewCard, resolutionCard])
  assert.equal(element.type, 'div')
  assert.equal(cardTailElement([]), null)
  const list = element.props.children[0]
  const first = Array.isArray(list) ? list[0] : list
  const rendered = first.type(first.props)
  assert.ok(JSON.stringify(rendered).includes('展开'))
  assert.ok(JSON.stringify(rendered).includes('评审汇报'))
})

test('the collapsed summary counts every recorded finding by severity', async () => {
  const { plugin } = await loadBundle()
  const { cardSummary } = plugin.__test
  const base = {
    phase: 'review',
    review: 'draft',
    round: 4,
    verdict: 'pass',
    nextAction: 'openspec_apply_next',
    findings: [
      { id: 'R1-01', severity: 'critical', status: 'fixed' },
      { id: 'R1-02', severity: 'major', status: 'open' },
      { id: 'R2-01', severity: 'minor', status: 'verified' },
      { id: 'R2-02', severity: 'minor', status: 'waived' },
      { id: 'R3-01', severity: 'nit', status: 'open' },
      { id: 'R3-02', severity: 'unknown', status: 'open' },
    ],
  }
  assert.equal(cardSummary(base), '评审汇报 · draft · 第 4 轮 · pass · critical 1 · major 1 · minor 2 · nit 1')
  assert.equal(cardSummary({ ...base, change: 'demo' }), '评审汇报 · demo · draft · 第 4 轮 · pass · critical 1 · major 1 · minor 2 · nit 1')
  assert.equal(cardSummary({ ...base, change: '  ' }), '评审汇报 · draft · 第 4 轮 · pass · critical 1 · major 1 · minor 2 · nit 1')
  assert.equal(cardSummary({ ...base, findings: undefined }), '评审汇报 · draft · 第 4 轮 · pass · critical 0 · major 0 · minor 0 · nit 0')
  assert.match(cardSummary({ ...base, change: 'demo', phase: 'resolution' }), /^处理汇报 · demo · draft · 第 4 轮/)
})

test('the expanded card keeps recorded optional finding and disposition rows', async () => {
  const { plugin } = await loadBundle()
  const { cardSections } = plugin.__test
  const card = {
    phase: 'review',
    review: 'draft',
    round: 2,
    verdict: 'pass',
    findings: [{
      id: 'R2-01', severity: 'major', status: 'fixed', note: 'Added the goal.',
      waiver: 'Approved by user.', approvedBy: 'user', verifiedInRound: 3,
    }],
    report: {
      summary: 'One blocker.',
      findings: [{
        id: 'R2-01', severity: 'major', status: 'open', location: 'proposal.md:3', title: 'Missing goal',
        axis: 'intent',
        problem: 'The goal is missing.', evidence: 'proposal.md', impact: 'Intent cannot be checked.',
        rule: 'Intent fit', failure: 'Apply starts without a goal.', suggestion: 'Add the goal.',
      }],
      verifications: [],
      residualRisks: [],
      outOfScope: [],
    },
  }
  const sections = cardSections(card)
  const finding = sections.find((section) => section.title === 'Findings').items[0]
  assert.deepEqual(finding.rows.map((row) => row[0]), ['问题', '证据', '类别', '影响', '规则', '失败路径', '建议'])
  assert.deepEqual(finding.rows.find((row) => row[0] === '类别'), ['类别', 'intent'])
  const disposed = sections.find((section) => section.title === '处理情况').items[0]
  assert.deepEqual(disposed.rows.map((row) => row[0]), ['说明', '豁免', '批准者', '验证轮次'])
})

test('the expanded card omits unrecorded optional finding and disposition rows', async () => {
  const { plugin } = await loadBundle()
  const { cardSections } = plugin.__test
  const card = {
    phase: 'review',
    review: 'draft',
    round: 2,
    verdict: 'pass',
    findings: [
      {
        id: 'R2-01', severity: 'nit', status: 'rejected', note: 'Not a defect.',
        waiver: '', approvedBy: '', verifiedInRound: null,
      },
      {
        id: 'R2-02', severity: 'nit', status: 'rejected', note: 'Also not a defect.',
        verifiedInRound: null,
      },
    ],
    report: {
      summary: 'Two nits.',
      findings: [
        {
          id: 'R2-01', severity: 'nit', status: 'open', location: 'a.md:1', title: 'Nit',
          problem: 'P', evidence: 'E', rule: null, failure: null, suggestion: 'S',
        },
        {
          id: 'R2-02', severity: 'nit', status: 'open', location: 'a.md:2', title: 'Another nit',
          problem: 'P2', evidence: 'E2', suggestion: 'S2',
        },
        {
          id: 'R2-03', severity: 'nit', status: 'open', location: 'a.md:3', title: 'Third nit',
          problem: 'P3', evidence: 'E3', rule: '', failure: '', suggestion: 'S3',
        },
      ],
      verifications: [],
      residualRisks: [],
      outOfScope: [],
    },
  }
  const sections = cardSections(card)
  const findingLabels = sections.find((section) => section.title === 'Findings').items
    .map((item) => item.rows.map((row) => row[0]))
  assert.deepEqual(findingLabels, [
    ['问题', '证据', '影响', '建议'],
    ['问题', '证据', '影响', '建议'],
    ['问题', '证据', '影响', '建议'],
  ])
  const disposedLabels = sections.find((section) => section.title === '处理情况').items
    .map((item) => item.rows.map((row) => row[0]))
  assert.deepEqual(disposedLabels, [
    ['说明', '验证轮次'],
    ['说明', '验证轮次'],
  ])
})

test('the expanded card merges same-kind readiness reasons', async () => {
  const { plugin } = await loadBundle()
  const { cardSections } = plugin.__test
  const card = {
    phase: 'review',
    review: 'draft',
    round: 3,
    verdict: 'changes-requested',
    findings: [],
    readinessReasons: [
      'the latest report verdict is changes-requested',
      'finding R3-01 is open',
      'finding R1-01 is fixed but not verified in a later round',
      'finding R3-03 is open',
      'blocking finding R2-01 is deferred',
      'finding R3-02 is open',
      'blocking finding R2-02 is deferred',
      'finding R2-03 is deferred',
      'the change artifacts changed since the review started',
    ],
  }
  const section = cardSections(card).find((entry) => entry.title === '未就绪原因')
  assert.deepEqual(section.rows, [
    ['原因 1', 'the latest report verdict is changes-requested'],
    ['原因 2', 'findings R3-01, R3-03, R3-02 are open'],
    ['原因 3', 'finding R1-01 is fixed but not verified in a later round'],
    ['原因 4', 'blocking findings R2-01, R2-02 are deferred'],
    ['原因 5', 'finding R2-03 is deferred'],
    ['原因 6', 'the change artifacts changed since the review started'],
  ])
})

test('the card batcher merges one session and dispatches byTurn', async () => {
  const { plugin } = await loadBundle()
  const { createCardBatcher } = plugin.__test
  const calls = []
  const call = async (_endpoint, payload) => {
    calls.push(payload)
    if (Array.isArray(payload.turns)) {
      const byTurn = {}
      for (const entry of payload.turns) byTurn[String(entry.turn)] = [{ phase: 'review', round: entry.turn }]
      return { ok: true, value: { byTurn } }
    }
    return { ok: true, value: { cards: [{ phase: 'review', round: payload.turn }] } }
  }
  const batcher = createCardBatcher(call)
  const [first, second] = await Promise.all([
    batcher.request('session-1', { turn: 50, from: '2026-01-01T00:00:00.000Z', to: '2026-01-01T00:10:00.000Z' }),
    batcher.request('session-1', { turn: 51, from: '2026-01-01T00:10:00.000Z', to: '2026-01-01T00:20:00.000Z' }),
  ])
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].turns.map((entry) => entry.turn), [50, 51])
  assert.deepEqual(calls[0].turns[1], {
    turn: 51, from: '2026-01-01T00:10:00.000Z', to: '2026-01-01T00:20:00.000Z',
  })
  assert.equal(first[0].round, 50)
  assert.equal(second[0].round, 51)
})

test('the card batcher caps a request at 64 turns', async () => {
  const { plugin } = await loadBundle()
  const { createCardBatcher } = plugin.__test
  const calls = []
  const call = async (_endpoint, payload) => {
    calls.push(payload)
    if (Array.isArray(payload.turns)) {
      const byTurn = {}
      for (const entry of payload.turns) byTurn[String(entry.turn)] = [{ phase: 'review', round: entry.turn }]
      return { ok: true, value: { byTurn } }
    }
    return { ok: true, value: { cards: [{ phase: 'review', round: payload.turn }] } }
  }
  const batcher = createCardBatcher(call)
  const results = await Promise.all(
    Array.from({ length: 65 }, (_value, index) => batcher.request('session-1', { turn: index + 1 })),
  )
  assert.equal(calls.length, 2)
  assert.equal(calls[0].turns.length, 64)
  assert.equal(calls[1].turn, 65)
  assert.equal(results[64][0].round, 65)
})

test('the card batcher dedupes a pending turn and clears the key on flush', async () => {
  const { plugin } = await loadBundle()
  const { createCardBatcher } = plugin.__test
  const calls = []
  const call = async (_endpoint, payload) => {
    calls.push(payload)
    return { ok: true, value: { cards: [{ phase: 'review', round: payload.turn }] } }
  }
  const batcher = createCardBatcher(call)
  const first = batcher.request('session-1', { turn: 7 })
  const same = batcher.request('session-1', { turn: 7 })
  assert.equal(first, same)
  await first
  await batcher.request('session-1', { turn: 7 })
  assert.equal(calls.length, 2)
})

test('a failed batch falls back to single-turn requests', async () => {
  const { plugin } = await loadBundle()
  const { createCardBatcher } = plugin.__test
  const calls = []
  const call = async (_endpoint, payload) => {
    calls.push(payload)
    if (Array.isArray(payload.turns)) throw new Error('batch failed')
    return { ok: true, value: { cards: [{ phase: 'review', round: payload.turn }] } }
  }
  const batcher = createCardBatcher(call)
  const [first, second] = await Promise.all([
    batcher.request('session-1', { turn: 1 }),
    batcher.request('session-1', { turn: 2 }),
  ])
  assert.equal(calls.length, 3)
  assert.equal(calls[1].turn, 1)
  assert.equal(calls[2].turn, 2)
  assert.equal(first[0].round, 1)
  assert.equal(second[0].round, 2)
})

test('an empty batch entry renders no cards', async () => {
  const { plugin } = await loadBundle()
  const { createCardBatcher } = plugin.__test
  const call = async (_endpoint, payload) => (Array.isArray(payload.turns)
    ? { ok: true, value: { byTurn: {} } }
    : { ok: true, value: { cards: [] } })
  const batcher = createCardBatcher(call)
  const [first, second] = await Promise.all([
    batcher.request('session-1', { turn: 3 }),
    batcher.request('session-1', { turn: 4 }),
  ])
  assert.deepEqual(first, [])
  assert.deepEqual(second, [])
})

test('each turn tail renders only its own turn cards', async () => {
  const { plugin } = await loadBundle()
  const { cardTailElement } = plugin.__test
  const textOf = (card) => {
    const element = cardTailElement([card])
    const list = element.props.children[0]
    const first = Array.isArray(list) ? list[0] : list
    return JSON.stringify(first.type(first.props))
  }
  const firstText = textOf({ phase: 'review', review: 'draft', change: 'demo', round: 50, verdict: 'pass', findings: [] })
  const secondText = textOf({ phase: 'review', review: 'draft', change: 'demo', round: 51, verdict: 'pass', findings: [] })
  assert.ok(firstText.includes('第 50 轮'))
  assert.ok(!firstText.includes('第 51 轮'))
  assert.ok(secondText.includes('第 51 轮'))
  assert.ok(!secondText.includes('第 50 轮'))
})

test('an unmounted turn tail does not update state', async () => {
  const { plugin, cleanups, stateSetters } = await loadBundle()
  cleanups.length = 0
  stateSetters.length = 0
  const built = clientContext()
  let resolveCall
  const pending = new Promise((resolve) => { resolveCall = resolve })
  const calls = []
  built.ctx.connection.rpc.call = async (channel, endpoint, payload) => {
    calls.push(payload)
    return pending
  }
  plugin.apply(built.ctx)
  const turnTail = built.registrations.find((entry) => entry.options.name === 'conversation.chat.turnTail')
  turnTail.component({ turn: { turn: 50 }, sessionId: 'session-unmount' })
  turnTail.component({ turn: { turn: 51 }, sessionId: 'session-unmount' })
  await Promise.resolve()
  assert.equal(calls.length, 1)
  for (const cleanup of cleanups) if (cleanup) cleanup()
  resolveCall({
    ok: true,
    value: {
      byTurn: {
        50: [{ phase: 'review', round: 50 }],
        51: [{ phase: 'review', round: 51 }],
      },
    },
  })
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(stateSetters, [])
})
