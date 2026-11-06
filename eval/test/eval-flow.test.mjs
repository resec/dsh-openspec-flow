import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  classifyRound,
  countTasks,
  hasProgress,
  inspectStage,
  nextMessage,
} from '../lib/flow.mjs'

const confirmations = {
  create: '确认。请创建该变更并继续。',
  apply: '确认，开始实施。',
  archive: '请归档该变更并完成。',
}

function fixture(t, tasks) {
  const root = mkdtempSync(join(tmpdir(), 'eval-flow-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const changeDir = join(root, 'openspec', 'changes', 'demo')
  mkdirSync(changeDir, { recursive: true })
  if (tasks !== undefined) writeFileSync(join(changeDir, 'tasks.md'), tasks)
  return { root, changeDir }
}

test('reports no change before a change exists', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'eval-flow-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'openspec', 'changes'), { recursive: true })

  const stage = inspectStage(root, 'demo')
  assert.equal(stage.stage, 'no-change')
  assert.equal(stage.change, null)
  assert.equal(nextMessage(stage.stage, confirmations), confirmations.create)
})

test('reports created while tasks remain', (t) => {
  const { root } = fixture(t, '# Tasks\n\n- [ ] 1.1 Add the module\n- [ ] 1.2 Add the test\n')
  const stage = inspectStage(root, 'demo')
  assert.equal(stage.stage, 'created')
  assert.deepEqual(stage.tasks, { total: 2, checked: 0, unchecked: 2 })
  assert.equal(nextMessage(stage.stage, confirmations), confirmations.apply)
})

test('reports applied when every task is checked', (t) => {
  const { root } = fixture(t, '# Tasks\n\n- [x] 1.1 Add the module\n- [x] 1.2 Add the test\n')
  const stage = inspectStage(root, 'demo')
  assert.equal(stage.stage, 'applied')
  assert.equal(nextMessage(stage.stage, confirmations), confirmations.archive)
})

test('reports archived for the expected change', (t) => {
  const { root } = fixture(t, '# Tasks\n\n- [x] 1.1 Done\n')
  const archiveDir = join(root, 'openspec', 'changes', 'archive', '2026-11-06-demo')
  mkdirSync(archiveDir, { recursive: true })
  writeFileSync(join(archiveDir, 'tasks.md'), '- [x] 1.1 Done\n')

  const stage = inspectStage(root, 'demo')
  assert.equal(stage.stage, 'archived')
  assert.equal(stage.archivedAs, '2026-11-06-demo')
  assert.equal(nextMessage(stage.stage, confirmations), null)
})

test('does not treat an unrelated archive as the target', (t) => {
  const { root } = fixture(t, '# Tasks\n\n- [ ] 1.1 Work\n')
  mkdirSync(join(root, 'openspec', 'changes', 'archive', '2026-11-06-other'), { recursive: true })

  const stage = inspectStage(root, 'demo')
  assert.equal(stage.stage, 'created')
})

test('classifies confirmations and measures progress', () => {
  assert.equal(classifyRound(confirmations.apply, confirmations), 'confirmation')
  assert.equal(classifyRound('an unrelated message', confirmations), 'work')
  assert.equal(hasProgress('no-change', 'created'), true)
  assert.equal(hasProgress('created', 'created'), false)
  assert.equal(hasProgress('applied', 'archived'), true)
})

test('counts checked and unchecked checkboxes only', () => {
  assert.deepEqual(countTasks('# Tasks\n\n- [ ] 1.1 A\n- [x] 1.2 B\n- [X] 1.3 C\nnot a task\n'), {
    total: 3,
    checked: 2,
    unchecked: 1,
  })
})
