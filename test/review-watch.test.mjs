import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { apply as reviewerApply } from '../reviewer.js'
import { createFakeContext } from './fake-context.mjs'
import { clearRoundWatches, resetRoundWatchTestHooks, setRoundWatchTestHooks } from '../lib/review/watch.js'
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
