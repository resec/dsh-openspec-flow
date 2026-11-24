import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineScenario, discoverScenarios, loadScenario, selectScenarioFiles } from '../scripts/lab/index.mjs'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-lab-discovery-'))
  mkdirSync(join(root, 'test', 'lab', 'nested'), { recursive: true })
  mkdirSync(join(root, '.cache', 'lab', 'experiments'), { recursive: true })
  writeFileSync(join(root, 'test', 'lab', 'a.scenario.mjs'), 'export default { name: "a", run() {} }\n')
  writeFileSync(join(root, 'test', 'lab', 'nested', 'b.scenario.mjs'), 'export default { name: "b", model: "mock", run() {} }\n')
  writeFileSync(join(root, '.cache', 'lab', 'experiments', 'poc.scenario.mjs'), 'export default { name: "poc", run() {} }\n')
  return root
}

test('discovery walks test/lab and ignores POCs', () => {
  const root = fixture()
  try {
    const poc = join(root, '.cache', 'lab', 'experiments', 'poc.scenario.mjs')
    assert.ok(existsSync(poc))
    assert.deepEqual(discoverScenarios({ root }), [
      join(root, 'test', 'lab', 'a.scenario.mjs'),
      join(root, 'test', 'lab', 'nested', 'b.scenario.mjs'),
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a scenario defaults to the mock model', () => {
  assert.equal(defineScenario({ name: 'x', run() {} }).model, 'mock')
  assert.throws(() => defineScenario({ name: 'x', model: 'other', run() {} }), /unknown model/)
})

test('a positional path outside test/lab is rejected', () => {
  const root = fixture()
  try {
    const discovered = discoverScenarios({ root })
    const poc = join(root, '.cache', 'lab', 'experiments', 'poc.scenario.mjs')
    assert.throws(
      () => selectScenarioFiles({ positional: [poc], discovered, base: join(root, 'test', 'lab') }),
      /outside test\/lab/,
    )
    const selected = selectScenarioFiles({ positional: [discovered[0]], discovered, base: join(root, 'test', 'lab') })
    assert.deepEqual(selected, [discovered[0]])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a scenario file is loaded through its default export', async () => {
  const root = fixture()
  try {
    const scenario = await loadScenario(join(root, 'test', 'lab', 'a.scenario.mjs'))
    assert.equal(scenario.name, 'a')
    assert.equal(scenario.model, 'mock')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
