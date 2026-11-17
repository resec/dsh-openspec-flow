import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../scripts/lab/core/paths.mjs'
import { defineScenario, discoverScenarios, loadScenario } from '../scripts/lab/index.mjs'

function fixture() {
  const root = mkdtempSync(join(ROOT, '.cache', 'lab', 'test-discovery-'))
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
    const files = discoverScenarios({ root })
    assert.equal(files.length, 2)
    assert.equal(files.some((file) => file.includes('experiments')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a scenario defaults to the mock model', () => {
  assert.equal(defineScenario({ name: 'x', run() {} }).model, 'mock')
  assert.throws(() => defineScenario({ name: 'x', model: 'other', run() {} }), /unknown model/)
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
