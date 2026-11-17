/**
 * The draft seal write.
 *
 * `sealDraft` is exported so its re-read branch is reachable: the tool path
 * skips the seal once a base is recorded, so a record changed between the
 * caller's read and the seal can only be produced directly.
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { draftObject } from '../lib/review/object.js'
import { sealDraft } from '../lib/tools/review.js'
import {
  CHANGE, call, cleanupFixtures, gitFixture, report, reviewDir, setup,
} from './review-fixtures.mjs'

test.after(cleanupFixtures)

/**
 * Commit the change directory as the seal and read the seal inputs.
 * @param root - fixture root.
 * @param run - git runner.
 * @returns the context, review directory and current draft object.
 */
function sealInputs(root, run) {
  const directory = reviewDir(root)
  const ignore = join(root, 'openspec', '.gitignore')
  if (existsSync(ignore) && run(['status', '--porcelain', '--', 'openspec/.gitignore']) !== '') {
    run(['add', 'openspec/.gitignore'])
  }
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'seal the draft'])
  const context = {
    rootPath: root,
    changeRoot: join(root, 'openspec', 'changes', CHANGE),
  }
  const intent = readFileSync(join(directory, 'intent.md'), 'utf8')
  return { context, directory, object: draftObject(context.changeRoot, intent) }
}

/**
 * Rewrite the draft record after reading it, like a concurrent writer.
 * @param directory - review directory.
 * @param mutate - receives the parsed record.
 * @returns nothing.
 */
function rewriteRecord(directory, mutate) {
  const file = join(directory, 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  mutate(record)
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
}

/**
 * Start a draft review and pass it without sealing.
 * @param root - fixture root.
 * @returns the fake host context.
 */
async function readyDraft(root) {
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  return fake
}

test('the seal keeps a record change written after the caller read it', async () => {
  const { root, run } = gitFixture()
  await readyDraft(root)
  const { context, directory, object } = sealInputs(root, run)

  rewriteRecord(directory, (record) => { record.changerSessionId = 'concurrent-session' })

  assert.deepEqual(sealDraft(context, directory, object, CHANGE), [])
  const sealed = JSON.parse(readFileSync(join(directory, 'review.json'), 'utf8'))
  assert.equal(sealed.changerSessionId, 'concurrent-session')
  assert.match(sealed.applyBaseCommit, /^[0-9a-f]{40}$/)
})

test('the seal refuses a record whose readiness dropped', async () => {
  const { root, run } = gitFixture()
  await readyDraft(root)
  const { context, directory, object } = sealInputs(root, run)

  rewriteRecord(directory, (record) => { record.state = 'abandoned' })

  assert.throws(
    () => sealDraft(context, directory, object, CHANGE),
    /draft review is not ready: .*abandoned/,
  )
  const unsealed = JSON.parse(readFileSync(join(directory, 'review.json'), 'utf8'))
  assert.equal(unsealed.applyBaseCommit, undefined)
})

test('the seal leaves an already recorded base alone', async () => {
  const { root, run } = gitFixture()
  await readyDraft(root)
  const { context, directory, object } = sealInputs(root, run)

  assert.deepEqual(sealDraft(context, directory, object, CHANGE), [])
  const sealed = JSON.parse(readFileSync(join(directory, 'review.json'), 'utf8'))
  assert.deepEqual(sealDraft(context, directory, object, CHANGE), [])
  const again = JSON.parse(readFileSync(join(directory, 'review.json'), 'utf8'))
  assert.equal(again.applyBaseCommit, sealed.applyBaseCommit)
})

test('the seal refuses a vanished record', async () => {
  const { root, run } = gitFixture()
  await readyDraft(root)
  const { context, directory, object } = sealInputs(root, run)

  rmSync(join(directory, 'review.json'))
  assert.throws(
    () => sealDraft(context, directory, object, CHANGE),
    /disappeared while sealing/,
  )
})
