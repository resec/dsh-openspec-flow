import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { hashText } from '../lib/hash.js'
import { isStale, markDone, projectMark } from '../lib/state.js'
import { numericIdOf, parseTaskLines } from '../lib/tasks.js'

function makeEntry(content = '- [ ] 1.1 one\n- [ ] 1.2 two\n- [ ]\n') {
  const dir = mkdtempSync(join(tmpdir(), 'openspec-flow-state-'))
  const file = join(dir, 'tasks.md')
  writeFileSync(file, content)
  const parsed = parseTaskLines(content)
  const tasks = parsed
    .filter((task) => task.description.length > 0)
    .map((task) => ({
      ...task,
      sourcePath: file,
      numericId: numericIdOf(task.description),
    }))
  const complete = parsed.filter((task) => task.done).length
  const entry = {
    change: 'demo',
    changeDir: dir,
    schemaName: 'spec-driven',
    payload: {
      changeName: 'demo',
      schemaName: 'spec-driven',
      state: complete === parsed.length ? 'all_done' : 'ready',
      progress: { total: parsed.length, complete, remaining: parsed.length - complete },
      contextFiles: { tasks: [file] },
      instruction: 'do the work',
    },
    tasks,
    hashes: new Map([[file, hashText(content)]]),
  }
  return { dir, file, entry, content }
}

test('marks one task, updates progress, and keeps the other bytes', () => {
  const { dir, file, entry, content } = makeEntry()
  try {
    const result = markDone(entry, '1.1')
    assert.equal(result.found, true)
    assert.equal(result.status, 'flipped')
    const after = readFileSync(file, 'utf8')
    assert.equal(after, content.replace('- [ ] 1.1 one', '- [x] 1.1 one'))
    assert.deepEqual(entry.payload.progress, { total: 3, complete: 1, remaining: 2 })
    assert.equal(entry.payload.state, 'ready')
    const projected = projectMark(entry, result, '1.1')
    assert.equal(projected.next.id, '1.2')
    assert.equal(isStale(entry), false)
    assert.equal(markDone(entry, '1.1').status, 'already-done')
    assert.equal(markDone(entry, '9.9').found, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('reports all_done after the last task', () => {
  const { dir, entry } = makeEntry('- [ ] 1.1 one\n- [ ] 1.2 two\n')
  try {
    assert.equal(markDone(entry, '1.1').status, 'flipped')
    const last = markDone(entry, '1.2')
    assert.equal(last.status, 'flipped')
    assert.deepEqual(entry.payload.progress, { total: 2, complete: 2, remaining: 0 })
    assert.equal(entry.payload.state, 'all_done')
    const projected = projectMark(entry, last, '1.2')
    assert.equal(projected.next, undefined)
    assert.equal(projected.state, 'all_done')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('detects an external edit', () => {
  const { dir, file, entry } = makeEntry()
  try {
    assert.equal(isStale(entry), false)
    writeFileSync(file, '- [ ] 1.1 one\n- [x] 1.2 two\n- [ ]\n')
    assert.equal(isStale(entry), true)
    // The direct mark still resolves the target line; the tool layer reloads
    // the entry before this point, which is what keeps progress authoritative.
    assert.equal(markDone(entry, '1.1').status, 'flipped')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('reports stale when the source or task disappears', () => {
  const missing = makeEntry()
  const removed = makeEntry()
  try {
    writeFileSync(removed.file, '- [ ] 1.1 one\n')
    assert.equal(markDone(removed.entry, '1.2').stale, true)
    rmSync(missing.file)
    assert.equal(markDone(missing.entry, '1.1').stale, true)
  } finally {
    rmSync(missing.dir, { recursive: true, force: true })
    rmSync(removed.dir, { recursive: true, force: true })
  }
})

test('falls back to the numeric id when the line hint moved', () => {
  const { dir, entry } = makeEntry()
  try {
    const result = markDone(entry, '1.1', { line: 2 })
    assert.equal(result.status, 'flipped')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('detects a missing hash target', () => {
  const { dir, entry } = makeEntry()
  try {
    entry.hashes.set(join(dir, 'missing.md'), 'expected')
    assert.equal(isStale(entry), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
