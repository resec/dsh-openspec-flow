import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT } from '../scripts/lab/core/paths.mjs'
import { createLab, runScenarios } from '../scripts/lab/index.mjs'

const fakePlugin = {
  tarball: join(ROOT, 'missing.tgz'),
  name: 'fixture',
  version: '0.0.0',
  sha512: 'fixture',
  dirty: { dirty: false, paths: [] },
  head: '0000000',
}

test('mock-only mode skips real-model scenarios before creating a sandbox', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-lab-runner-'))
  const file = join(root, 'real.scenario.mjs')
  writeFileSync(file, 'export default { name: "real", model: "real", run() { throw new Error("must not run") } }\n')
  try {
    const result = await runScenarios({ files: [file], mockOnly: true, includeReal: false, plugin: fakePlugin, root, log: { log() {}, error() {} } })
    assert.equal(result.passed, true)
    assert.equal(result.results[0].status, 'skipped')
    assert.match(result.results[0].reason, /mock-only/)
    const report = JSON.parse(readFileSync(result.reportPath, 'utf8'))
    assert.equal(report.results[0].status, 'skipped')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a provisioning failure leaves a failed run report', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-lab-runner-'))
  try {
    await assert.rejects(
      createLab({ pluginTarball: fakePlugin, offline: true, fresh: true, root, env: { ...process.env } }),
      /cannot be combined/,
    )
    const runs = join(root, '.cache', 'lab', 'runs')
    const entries = existsSync(runs) ? readdirSync(runs) : []
    assert.equal(entries.length, 1)
    const report = join(runs, entries[0], 'artifacts', 'report.json')
    assert.ok(existsSync(report))
    assert.equal(JSON.parse(readFileSync(report, 'utf8')).ok, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a real-model scenario requires the explicit flag', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-lab-runner-'))
  const file = join(root, 'real.scenario.mjs')
  writeFileSync(file, 'export default { name: "real", model: "real", run() {} }\n')
  try {
    const result = await runScenarios({ files: [file], mockOnly: false, includeReal: false, plugin: fakePlugin, root, log: { log() {}, error() {} } })
    assert.equal(result.results[0].status, 'skipped')
    assert.match(result.results[0].reason, /include-real-model/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
