import assert from 'node:assert/strict'
import test from 'node:test'
import { markInterrupted, requireTaskIds, taskNotFound } from '../lib/tools/shared.js'

test('requireTaskIds trims, rejects and deduplicates', () => {
  assert.deepEqual(requireTaskIds({ taskIds: [' 1.1 ', '1.2', '1.1'] }), ['1.1', '1.2'])
  assert.throws(() => requireTaskIds({}), /taskIds must be a non-empty array of task ids/)
  assert.throws(() => requireTaskIds({ taskIds: [] }), /taskIds must be a non-empty array of task ids/)
  assert.throws(
    () => requireTaskIds({ taskIds: ['1.1', ''] }),
    /Every taskIds entry must be a non-empty task id/,
  )
  assert.throws(
    () => requireTaskIds({ taskIds: ['1.1', 2] }),
    /Every taskIds entry must be a non-empty task id/,
  )
})

test('taskNotFound names every missing id of a batch', () => {
  const entry = {
    tasks: [
      { numericId: '1.1', id: '1', description: '1.1 one', done: false, line: 3 },
      { numericId: '1.2', id: '2', description: '1.2 two', done: true, line: 4 },
    ],
    payload: { state: 'ready', instruction: '' },
  }
  const single = taskNotFound('c', ['9.9'], entry, false)
  assert.match(single.message, /Task '9\.9' was not found in change 'c'/)
  assert.doesNotMatch(single.message, /No task was marked/)

  const batch = taskNotFound('c', ['9.9', '8.8'], entry, false, true)
  assert.match(batch.message, /Tasks '9\.9', '8\.8' were not found in change 'c'/)
  assert.match(batch.message, /Pending tasks: 1\.1 \(line 3\)/)
  assert.match(batch.message, /No task was marked because a batch writes only when every id is found/)

  const blocked = taskNotFound(
    'c',
    ['9.9'],
    { ...entry, payload: { state: 'blocked', instruction: 'Add tasks.md first.' } },
    true,
  )
  assert.match(blocked.message, /Apply is blocked: Add tasks\.md first\./)
})

test('markInterrupted reports what was already marked', () => {
  const partial = markInterrupted('c', '1.2', [{ id: '1.1', status: 'flipped' }])
  assert.match(partial.message, /Task '1\.2' changed while the batch was being marked in change 'c'/)
  assert.match(partial.message, /Marked before stopping: 1\.1\./)
  assert.match(partial.message, /Run openspec_apply_next to resync the task list\./)

  const none = markInterrupted('c', '1.1', [{ id: '1.1', status: 'already-done' }])
  assert.match(none.message, /No task was marked\./)
})
