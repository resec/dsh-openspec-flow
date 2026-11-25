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

const startupUrl = 'http://127.0.0.1:3210/?token=startup-abc'
const quiet = { log() {}, error() {} }

test('a failed scenario keeps the startup token out of the summary report', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-lab-runner-'))
  const file = join(root, 'web.scenario.mjs')
  writeFileSync(file, `export default { name: 'web', model: 'mock', async run() { throw new Error('dsh web: ${startupUrl} closed the page') } }\n`)
  const lines = []
  const fakeLab = { close: async () => ({ runDir: join(root, 'runs', 'fake') }) }
  try {
    const result = await runScenarios({
      files: [file],
      mockOnly: true,
      plugin: fakePlugin,
      root,
      createLab: () => fakeLab,
      log: { log() {}, error: (line) => lines.push(line) },
    })
    assert.equal(result.passed, false)
    assert.match(result.results[0].error, /token=<redacted>/u)
    assert.equal(result.results[0].error.includes('startup-abc'), false)
    assert.equal(readFileSync(result.reportPath, 'utf8').includes('startup-abc'), false)
    assert.equal(lines.join('\n').includes('startup-abc'), false, 'the printed failure carries no token')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a provisioning failure keeps the startup token out of the summary report', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-lab-runner-'))
  const file = join(root, 'web.scenario.mjs')
  writeFileSync(file, "export default { name: 'web', model: 'mock', run() {} }\n")
  const lines = []
  try {
    const result = await runScenarios({
      files: [file],
      mockOnly: true,
      plugin: fakePlugin,
      root,
      createLab: () => {
        throw new Error(`dsh web: ${startupUrl} did not start`)
      },
      log: { log() {}, error: (line) => lines.push(line) },
    })
    assert.equal(result.results[0].reason, 'provisioning failed')
    assert.match(result.results[0].error, /token=<redacted>/u)
    assert.equal(readFileSync(result.reportPath, 'utf8').includes('startup-abc'), false)
    assert.equal(lines.join('\n').includes('startup-abc'), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a passing scenario still reaches the summary report', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-lab-runner-'))
  const file = join(root, 'web.scenario.mjs')
  writeFileSync(file, "export default { name: 'web', model: 'mock', async run() {} }\n")
  const fakeLab = { close: async ({ passed }) => ({ runDir: join(root, 'runs', passed ? 'pass' : 'fail') }) }
  try {
    const result = await runScenarios({ files: [file], mockOnly: true, plugin: fakePlugin, root, createLab: () => fakeLab, log: quiet })
    assert.equal(result.passed, true)
    assert.equal(result.results[0].status, 'passed')
    assert.equal(result.results[0].runDir, join(root, 'runs', 'pass'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
