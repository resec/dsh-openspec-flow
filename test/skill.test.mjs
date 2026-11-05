import assert from 'node:assert/strict'
import test from 'node:test'
import { withStore } from '../lib/openspec.js'
import { loadSkillDocument } from '../lib/skill.js'

test('withStore appends the flag only when a store is selected', () => {
  const args = ['list', '--json']
  assert.deepEqual(withStore(args, 'team'), ['list', '--json', '--store', 'team'])
  assert.deepEqual(withStore(args, '  '), args)
  assert.deepEqual(withStore(args, undefined), args)
})

test('the shipped skill document is valid and describes the tool loop', () => {
  const document = loadSkillDocument()
  assert.equal(document.name, 'openspec-flow')
  assert.ok(document.description.length <= 500)
  assert.match(document.description, /OpenSpec/)
  assert.match(document.content, /openspec_apply_next/)
  assert.match(document.content, /openspec_mark_task_done/)
  assert.match(document.content, /openspec_validate/)
})
