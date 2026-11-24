import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply as reviewerApply } from '../reviewer.js'
import { createFakeContext } from './fake-context.mjs'
import { draftObject } from '../lib/review/object.js'
import {
  armRoundWatch, clearRoundWatches, disarmRoundWatch, resetRoundWatchTestHooks, setRoundWatchTestHooks,
} from '../lib/review/watch.js'
import {
  CHANGE, fixture, setup, call, reviewDir, report, externalSetup, cleanupFixtures,
} from './review-fixtures.mjs'

test.after(() => {
  resetRoundWatchTestHooks()
  clearRoundWatches()
  cleanupFixtures()
})

function fakeWatchFactory() {
  const watchers = []
  const factory = (dir, options, listener) => {
    const watcher = {
      dir, options, listener, closed: false, close() { this.closed = true },
    }
    watchers.push(watcher)
    return watcher
  }
  return { factory, watchers }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 25))

function editTasks(root, body = '\n## 1. Edited\n\n- [ ] 1.1 Edited task\n') {
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), body)
}

function noticeText(entry) {
  return entry.content.map((part) => part.text ?? '').join(' ')
}

function reviewerRunner(root) {
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  return (args) => reviewer.tools.get('openspec_reviewer').execute(args, {
    agent: { id: 'reviewer-1' }, signal: new AbortController().signal,
  })
}

test('an edit during a draft round notifies the reviewer once', async () => {
  const root = fixture()
  const { fake, messages } = externalSetup(root, undefined, { seedAgents: [{ id: 'review-test' }] })
  const { factory, watchers } = fakeWatchFactory()
  setRoundWatchTestHooks({ watch: factory, debounceMs: 1 })
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  assert.equal(watchers.length, 1)
  assert.match(watchers[0].dir, /add-dark-mode$/)
  const before = messages.length
  editTasks(root)
  watchers[0].listener()
  await settle()
  assert.equal(messages.length, before + 1)
  const text = noticeText(messages.at(-1))
  assert.match(text, /round 1/)
  assert.match(text, /blocked/)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.staleNotice.round, 1)
  assert.equal(record.rounds[0].report, undefined)
  watchers[0].listener()
  await settle()
  assert.equal(messages.length, before + 1)
})

test('a recorded report stops the watch', async () => {
  const root = fixture()
  const { fake, messages } = externalSetup(root, undefined, { seedAgents: [{ id: 'review-test' }] })
  const { factory, watchers } = fakeWatchFactory()
  setRoundWatchTestHooks({ watch: factory, debounceMs: 1 })
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  const watcher = watchers[0]
  const execute = reviewerRunner(root)
  await execute({ action: 'submit', change: CHANGE, review: 'draft', round: 1, report: report() })
  assert.equal(watcher.closed, true)
  const before = messages.length
  editTasks(root)
  watcher.listener()
  await settle()
  assert.equal(messages.length, before)
})

test('a later stale round gets its own notice', async () => {
  const root = fixture()
  const { fake, messages } = externalSetup(root, undefined, { seedAgents: [{ id: 'review-test' }] })
  const { factory, watchers } = fakeWatchFactory()
  setRoundWatchTestHooks({ watch: factory, debounceMs: 1 })
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  const execute = reviewerRunner(root)
  await execute({ action: 'submit', change: CHANGE, review: 'draft', round: 1, report: report() })
  editTasks(root)
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  assert.equal(watchers.length, 2)
  editTasks(root, '\n## 1. Edited again\n\n- [ ] 1.2 Another task\n')
  watchers[1].listener()
  await settle()
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.staleNotice.round, 2)
  assert.match(noticeText(messages.at(-1)), /round 2/)
})

test('a round opened after a waiver arms its own watch', async () => {
  const root = fixture()
  const { fake, messages } = externalSetup(root, undefined, { seedAgents: [{ id: 'review-test' }] })
  const { factory, watchers } = fakeWatchFactory()
  setRoundWatchTestHooks({ watch: factory, debounceMs: 1 })
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', {
    action: 'waive-reviewer', change: CHANGE, review: 'draft', waiver: 'accepted', approvedBy: 'user',
  })
  editTasks(root)
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  assert.equal(watchers.length, 2)
  assert.equal(watchers[0].closed, true)
  editTasks(root, '\n## 1. Edited again\n\n- [ ] 1.2 Another task\n')
  watchers[1].listener()
  await settle()
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.staleNotice.round, 2)
  assert.match(noticeText(messages.at(-1)), /round 2/)
})

test('a watch without a live changer logs and skips the message', async () => {
  const root = fixture()
  const { fake, messages } = externalSetup(root)
  const { factory, watchers } = fakeWatchFactory()
  setRoundWatchTestHooks({ watch: factory, debounceMs: 1 })
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  const before = messages.length
  editTasks(root)
  watchers[0].listener()
  await settle()
  assert.equal(messages.length, before)
  assert.match(fake.warnings.join(' '), /no live changer agent/)
})

test('a watch that cannot start leaves the review usable', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  setRoundWatchTestHooks({
    watch: () => {
      throw new Error('no watch here')
    },
    debounceMs: 1,
  })
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  assert.equal(started.state, 'in-review')
  assert.match(fake.warnings.join(' '), /draft watch could not start/)
})

test('a self review arms no watch', async () => {
  const root = fixture()
  const fake = setup(root)
  const { factory, watchers } = fakeWatchFactory()
  setRoundWatchTestHooks({ watch: factory, debounceMs: 1 })
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  assert.equal(watchers.length, 0)
})

function directFixture(closeThrows = false) {
  const root = fixture()
  const changeRoot = join(root, 'openspec', 'changes', CHANGE)
  const directory = join(root, 'watch-review')
  const listeners = []
  const watchers = []
  const factory = (dir, options, listener) => {
    listeners.push(listener)
    const watcher = {
      closed: false,
      close() {
        this.closed = true
        if (closeThrows) throw new Error('close failed')
      },
    }
    watchers.push(watcher)
    return watcher
  }
  return {
    root, changeRoot, directory, listeners, watchers, factory,
    dispose() { rmSync(root, { recursive: true, force: true }) },
  }
}

test('the watch module reports a hash failure, an unchanged object and a notice failure', async () => {
  const f = directFixture()
  const warnings = []
  const logger = { warn: (message) => warnings.push(message) }
  const seen = []
  const intent = 'intent'
  const hash = draftObject(f.changeRoot, intent).objectHash
  const unchanged = armRoundWatch({
    directory: f.directory, changeRoot: f.changeRoot, intent, round: 1, hash,
    watchFactory: f.factory, debounceMs: 1, logger, onStale: () => seen.push('unchanged'),
  })
  assert.equal(unchanged.round, 1)
  f.listeners[0]()
  await settle()
  assert.equal(seen.length, 0)
  disarmRoundWatch(f.directory)

  const broken = armRoundWatch({
    directory: f.directory, changeRoot: join(f.root, 'missing'), intent, round: 2, hash: 'x',
    watchFactory: f.factory, debounceMs: 1, logger, onStale: () => seen.push('broken'),
  })
  assert.equal(broken.round, 2)
  f.listeners.at(-1)()
  await settle()
  assert.match(warnings.join(' '), /could not hash the artifacts/)

  armRoundWatch({
    directory: f.directory, changeRoot: f.changeRoot, intent, round: 3, hash: 'old',
    watchFactory: f.factory, debounceMs: 1, logger,
    onStale: async () => { throw new Error('handler failed') },
  })
  f.listeners.at(-1)()
  await settle()
  assert.match(warnings.join(' '), /draft watch notice failed/)
  disarmRoundWatch(f.directory)
  f.dispose()
})

test('the watch module tolerates a close failure and clears every entry', () => {
  const f = directFixture(true)
  armRoundWatch({
    directory: f.directory, changeRoot: f.changeRoot, intent: 'intent', round: 1, hash: 'x',
    watchFactory: f.factory, logger: { warn() {} },
  })
  assert.doesNotThrow(() => disarmRoundWatch(f.directory))
  assert.equal(f.watchers[0].closed, true)
  assert.doesNotThrow(() => disarmRoundWatch(join(f.root, 'never-armed')))

  armRoundWatch({
    directory: f.directory, changeRoot: f.changeRoot, intent: 'intent', round: 2, hash: 'x',
    watchFactory: f.factory, logger: { warn() {} },
  })
  setRoundWatchTestHooks()
  resetRoundWatchTestHooks()
  clearRoundWatches()
  assert.equal(f.watchers.at(-1).closed, true)
  f.dispose()
})

test('the watch module falls back to fs.watch and the default debounce', () => {
  const f = directFixture()
  const armed = armRoundWatch({
    directory: f.directory, changeRoot: f.changeRoot, intent: 'intent', round: 1, hash: 'x',
    logger: { warn() {} },
  })
  assert.equal(armed.round, 1)
  clearRoundWatches()
  f.dispose()
})

function rewriteRecord(root, mutate) {
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  mutate(record)
  writeFileSync(file, `${JSON.stringify(record)}\n`)
}

async function fireStaleNotice(root, options = {}) {
  const { messages = [], warnings } = options
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'), `# Proposal edited ${Date.now()}\n`)
  const watchers = options.watchers
  watchers.at(-1).listener()
  await settle()
  return { messages, warnings }
}

test('the notice is skipped for a passed, abandoned, reported or moved-round record', async () => {
  for (const mutate of [
    (record) => { record.state = 'passed' },
    (record) => { record.state = 'abandoned' },
    (record) => { record.rounds.at(-1).report = { path: 'x' } },
    (record) => { record.rounds.at(-1).round = 5 },
    (record) => { record.staleNotice = { round: 1 } },
  ]) {
    const root = fixture()
    const { fake, messages } = externalSetup(root, undefined, { seedAgents: [{ id: 'review-test' }] })
    const { factory, watchers } = fakeWatchFactory()
    setRoundWatchTestHooks({ watch: factory, debounceMs: 1 })
    await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
    rewriteRecord(root, mutate)
    const before = messages.length
    await fireStaleNotice(root, { watchers })
    assert.equal(messages.length, before)
  }
})

test('the notice is written but skipped without a reviewer slot', async () => {
  const root = fixture()
  const { fake, messages } = externalSetup(root, undefined, { seedAgents: [{ id: 'review-test' }] })
  const { factory, watchers } = fakeWatchFactory()
  setRoundWatchTestHooks({ watch: factory, debounceMs: 1 })
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  rewriteRecord(root, (record) => { record.reviewers = { count: 1, slots: [] } })
  const before = messages.length
  await fireStaleNotice(root, { watchers })
  assert.equal(messages.length, before)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.staleNotice.round, 1)
})

test('the notice logs when the review lock is held', async () => {
  const root = fixture()
  const { fake } = externalSetup(root, undefined, { seedAgents: [{ id: 'review-test' }] })
  const { factory, watchers } = fakeWatchFactory()
  setRoundWatchTestHooks({ watch: factory, debounceMs: 1 })
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  mkdirSync(join(reviewDir(root), '.lock'))
  try {
    await fireStaleNotice(root, { watchers })
  } finally {
    rmSync(join(reviewDir(root), '.lock'), { recursive: true, force: true })
  }
  assert.match(fake.warnings.join(' '), /another write holds/)
})

test('a watcher error is logged and disarms the watch', () => {
  const f = directFixture()
  const warnings = []
  const emitters = []
  const factory = () => {
    const watcher = {
      handlers: {},
      closed: false,
      close() { this.closed = true },
      on(event, handler) { this.handlers[event] = handler },
    }
    emitters.push(watcher)
    return watcher
  }
  const armed = armRoundWatch({
    directory: f.directory, changeRoot: f.changeRoot, intent: 'intent', round: 1, hash: 'x',
    watchFactory: factory, debounceMs: 1, logger: { warn: (message) => warnings.push(message) },
  })
  assert.equal(armed.round, 1)
  emitters[0].handlers.error(new Error('watch broke'))
  assert.match(warnings.join(' '), /draft watch stopped/)
  assert.equal(emitters[0].closed, true)
  assert.doesNotThrow(() => disarmRoundWatch(f.directory))
})

test('an error from a replaced watcher leaves the live entry registered', () => {
  const f = directFixture()
  const emitters = []
  const factory = () => {
    const watcher = {
      handlers: {},
      closed: false,
      close() { this.closed = true },
      on(event, handler) { this.handlers[event] = handler },
    }
    emitters.push(watcher)
    return watcher
  }
  const options = {
    directory: f.directory,
    changeRoot: f.changeRoot,
    intent: 'intent',
    watchFactory: factory,
    debounceMs: 1,
    logger: { warn() {} },
  }
  armRoundWatch({ ...options, round: 1, hash: 'a' })
  armRoundWatch({ ...options, round: 2, hash: 'b' })
  assert.equal(emitters[0].closed, true)
  emitters[0].handlers.error(new Error('late error'))
  assert.equal(emitters[1].closed, false)
  disarmRoundWatch(f.directory)
  assert.equal(emitters[1].closed, true)
})
