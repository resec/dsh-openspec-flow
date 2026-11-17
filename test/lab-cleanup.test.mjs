import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRun, finalizeRun } from '../scripts/lab/core/run-dir.mjs'

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'dsh-lab-cleanup-'))
  const run = createRun({ base })
  return { base, run }
}

function populate(run) {
  const session = join(run.home, 'sessions', 'p', 's')
  mkdirSync(session, { recursive: true })
  writeFileSync(join(session, 'session.v4.jsonl.zstd'), 'fixture')
  const cards = join(run.project, 'openspec', '.review', 'store#demo', 'cards')
  mkdirSync(cards, { recursive: true })
  writeFileSync(join(cards, 'one.json'), '{"turn":1}')
}

test('a failing run keeps the full directory', () => {
  const { base, run } = fixture()
  try {
    populate(run)
    const result = finalizeRun(run, { passed: false, report: { schemaVersion: 1 } })
    assert.equal(result.kept, true)
    assert.ok(existsSync(run.home))
    assert.ok(existsSync(run.artifacts))
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('the default pass copies evidence and removes the disposable home', () => {
  const { base, run } = fixture()
  try {
    populate(run)
    const result = finalizeRun(run, { passed: true, report: { schemaVersion: 1, ok: true } })
    assert.equal(result.kept, true)
    assert.equal(existsSync(run.home), false)
    assert.equal(existsSync(run.project), false)
    assert.ok(existsSync(join(run.artifacts, 'sessions')))
    assert.ok(existsSync(join(run.artifacts, 'cards')))
    const report = JSON.parse(readFileSync(join(run.artifacts, 'report.json'), 'utf8'))
    assert.equal(report.ok, true)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('--keep retains the home and profile after a pass', () => {
  const { base, run } = fixture()
  try {
    populate(run)
    finalizeRun(run, { passed: true, report: { schemaVersion: 1 }, keep: true })
    assert.ok(existsSync(run.home))
    assert.ok(existsSync(run.project))
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('--cleanup removes the run directory after a pass', () => {
  const { base, run } = fixture()
  try {
    populate(run)
    const result = finalizeRun(run, { passed: true, report: { schemaVersion: 1 }, cleanup: true })
    assert.equal(result.runDir, null)
    assert.equal(existsSync(run.dir), false)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})
