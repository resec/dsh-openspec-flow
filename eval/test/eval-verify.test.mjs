import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runGates } from '../lib/verify.mjs'

const REPO = fileURLToPath(new URL('../..', import.meta.url))
const ARCHIVED_CHANGE = join(REPO, 'openspec/changes/archive/2026-11-05-add-scoped-flow-policy')

const PASS = `import assert from 'node:assert/strict'\nimport test from 'node:test'\ntest('ok', () => assert.equal(1, 1))\n`
const FAIL = `import assert from 'node:assert/strict'\nimport test from 'node:test'\ntest('bad', () => assert.equal(1, 2))\n`

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'eval-verify-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'openspec/changes'), { recursive: true })
  writeFileSync(join(root, 'openspec/config.yaml'), 'schema: spec-driven\n')
  cpSync(ARCHIVED_CHANGE, join(root, 'openspec/changes/demo'), { recursive: true })
  mkdirSync(join(root, 'openspec/changes/archive/2026-11-06-demo'), { recursive: true })
  mkdirSync(join(root, 'test'), { recursive: true })
  writeFileSync(join(root, 'test/ok.test.mjs'), PASS)
  mkdirSync(join(root, 'acceptance'), { recursive: true })
  writeFileSync(join(root, 'acceptance/hidden.test.mjs'), PASS)
  return root
}

function gatesByName(result) {
  return Object.fromEntries(result.gates.map((entry) => [entry.name, entry.passed]))
}

test('passes every gate for a valid archived change', (t) => {
  const root = fixture(t)
  const archived = join(root, 'openspec/changes/archive/2026-11-06-demo')
  rmSync(archived, { recursive: true, force: true })
  renameSync(join(root, 'openspec/changes/demo'), archived)
  const result = runGates({
    destination: root,
    changeName: 'demo',
    outDir: join(root, 'out'),
    acceptanceDir: join(root, 'acceptance'),
  })

  assert.equal(result.passed, true)
  assert.deepEqual(gatesByName(result), {
    tasks: true,
    archive: true,
    'repo-tests': true,
    'hidden-acceptance': true,
    validate: true,
  })
})

test('fails the archive gate when the change is not archived', (t) => {
  const root = fixture(t)
  rmSync(join(root, 'openspec/changes/archive/2026-11-06-demo'), { recursive: true, force: true })
  const result = runGates({
    destination: root,
    changeName: 'demo',
    outDir: join(root, 'out'),
    acceptanceDir: join(root, 'acceptance'),
  })

  assert.equal(gatesByName(result).archive, false)
  assert.equal(result.passed, false)
})

test('fails the task gate when a task is unchecked', (t) => {
  const root = fixture(t)
  const path = join(root, 'openspec/changes/demo/tasks.md')
  writeFileSync(path, readFileSync(path, 'utf8').replace('- [x]', '- [ ]'))
  const result = runGates({
    destination: root,
    changeName: 'demo',
    outDir: join(root, 'out'),
    acceptanceDir: join(root, 'acceptance'),
  })

  assert.equal(gatesByName(result).tasks, false)
})

test('fails the repository test gate on a broken test', (t) => {
  const root = fixture(t)
  writeFileSync(join(root, 'test/ok.test.mjs'), FAIL)
  const result = runGates({
    destination: root,
    changeName: 'demo',
    outDir: join(root, 'out'),
    acceptanceDir: join(root, 'acceptance'),
  })

  assert.equal(gatesByName(result)['repo-tests'], false)
  assert.equal(gatesByName(result)['hidden-acceptance'], true)
})

test('fails the hidden acceptance gate on a broken acceptance test', (t) => {
  const root = fixture(t)
  writeFileSync(join(root, 'acceptance/hidden.test.mjs'), FAIL)
  const result = runGates({
    destination: root,
    changeName: 'demo',
    outDir: join(root, 'out'),
    acceptanceDir: join(root, 'acceptance'),
  })

  assert.equal(gatesByName(result)['hidden-acceptance'], false)
})

test('fails validation when no change exists', (t) => {
  const root = fixture(t)
  rmSync(join(root, 'openspec/changes/demo'), { recursive: true, force: true })
  rmSync(join(root, 'openspec/changes/archive/2026-11-06-demo'), { recursive: true, force: true })
  const result = runGates({
    destination: root,
    changeName: 'missing',
    outDir: join(root, 'out'),
    acceptanceDir: join(root, 'acceptance'),
  })

  assert.equal(gatesByName(result).validate, false)
})
