import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import test from 'node:test'

import {
  PNPM_VERSION,
  RecordError,
  buildRecord,
  chromiumBucket,
  hashInputs,
  missingRecordPaths,
  realOrResolved,
  nodeBucket,
  pnpmBucket,
  readChromiumRevisions,
  readRecord,
  recordPath,
  requireRecord,
  resolvePlaywrightVersion,
  resolveRecordedPnpm,
  writeRecord,
} from '../scripts/toolchain.mjs'
import { cleanupTempDirs, tempDir } from './temp.mjs'

test.after(cleanupTempDirs)

/**
 * Create a minimal worktree root with the inputs a record binds.
 * @returns the absolute root.
 */
function makeRoot() {
  const root = tempDir('toolchain-record-')
  writeFileSync(join(root, 'package.json'), '{"engines":{"node":">=24.9.0"}}\n')
  writeFileSync(
    join(root, 'package-lock.json'),
    '{"lockfileVersion":3,"packages":{"node_modules/playwright-core":{"version":"1.65.1"}}}\n',
  )
  writeFileSync(join(root, 'coverage.baseline.json'), '{"node":{"version":"v24.22.2"}}\n')
  writeFileSync(join(root, 'coverage.config.json'), '{"primaryNodeMajor":24}\n')
  return root
}

/**
 * Create the tool paths a record names.
 * @param root - worktree root.
 * @returns the record options.
 */
function toolOptions(root) {
  const node = join(root, 'node')
  const npm = join(root, 'npm')
  const pnpmJs = join(root, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
  const binDir = join(root, 'node_modules', 'pnpm', 'bin')
  const browsersPath = join(root, 'browsers')
  writeFileSync(node, '')
  writeFileSync(npm, '')
  mkdirSync(binDir, { recursive: true })
  writeFileSync(pnpmJs, '')
  mkdirSync(browsersPath, { recursive: true })
  return {
    requirements: { nodeRange: '>=24.9.0', primaryNodeMajor: 24, pnpm: PNPM_VERSION },
    node: { path: node, version: 'v24.22.2', source: 'host' },
    npm: { path: npm, version: '11.0.0' },
    pnpm: { bucket: pnpmBucket('/shared', PNPM_VERSION), version: PNPM_VERSION, js: pnpmJs, binDir, node },
    chromium: {
      playwrightVersion: '1.65.1',
      browsersPath,
      revisions: { chromium: '1255', headlessShell: '1255', ffmpeg: '1013' },
    },
  }
}

test('writes and reads a current record', () => {
  const root = makeRoot()
  writeRecord(root, buildRecord({ root, ...toolOptions(root) }))
  const result = readRecord(root)
  assert.equal(result.state, 'current')
  assert.equal(result.record.worktree, root)
  assert.equal(result.record.requirements.pnpm, PNPM_VERSION)
  assert.equal(recordPath(root), join(root, '.cache', 'toolchain', 'manifest.json'))
})

test('a changed lock makes the record stale with a correction', () => {
  const root = makeRoot()
  writeRecord(root, buildRecord({ root, ...toolOptions(root) }))
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}\n')
  const result = readRecord(root)
  assert.equal(result.state, 'stale')
  assert.match(result.reasons.join('\n'), /package-lock\.json changed/)
  assert.match(result.correction, /--deps-only/)
})

test('a changed pin or platform makes the record stale', () => {
  const root = makeRoot()
  writeRecord(root, buildRecord({ root, ...toolOptions(root) }))
  assert.equal(readRecord(root, { pnpmVersion: '9.0.0' }).state, 'stale')
  assert.equal(readRecord(root, { platform: 'darwin' }).state, 'stale')
})

test('another worktree does not see this record', () => {
  const first = makeRoot()
  const second = makeRoot()
  writeRecord(first, buildRecord({ root: first, ...toolOptions(first) }))
  assert.equal(readRecord(second).state, 'absent')
  assert.throws(() => requireRecord(second), RecordError)
})

test('a missing input is an invalid record', () => {
  const root = makeRoot()
  writeRecord(root, buildRecord({ root, ...toolOptions(root) }))
  writeFileSync(join(root, 'package-lock.json'), '')
  const result = readRecord(root)
  assert.equal(result.state, 'stale')
})

test('the bucket paths are version-keyed', () => {
  assert.equal(nodeBucket('/shared', 'v24.22.2'), join('/shared', 'toolchain', 'node', '24.22.2'))
  assert.equal(pnpmBucket('/shared'), join('/shared', 'toolchain', 'pnpm', PNPM_VERSION))
  assert.equal(chromiumBucket('/shared', '1.65.1'), join('/shared', 'browsers', 'playwright-1.65.1'))
})

test('resolves the Playwright version and revisions from the local package', () => {
  const root = makeRoot()
  mkdirSync(join(root, 'node_modules', 'playwright-core'), { recursive: true })
  writeFileSync(join(root, 'node_modules', 'playwright-core', 'package.json'), '{"version":"1.65.2"}\n')
  writeFileSync(
    join(root, 'node_modules', 'playwright-core', 'browsers.json'),
    JSON.stringify({
      browsers: [
        { name: 'chromium', revision: '1255' },
        { name: 'chromium-headless-shell', revision: '1255' },
        { name: 'ffmpeg', revision: '1013' },
      ],
    }),
  )
  assert.equal(resolvePlaywrightVersion(root), '1.65.2')
  assert.deepEqual(readChromiumRevisions(root), { chromium: '1255', headlessShell: '1255', ffmpeg: '1013' })
})

test('falls back to the lockfile for the Playwright version', () => {
  const root = makeRoot()
  assert.equal(resolvePlaywrightVersion(root), '1.65.1')
})

test('resolves the recorded pnpm and reports a missing path', () => {
  const root = makeRoot()
  writeRecord(root, buildRecord({ root, ...toolOptions(root) }))
  const resolved = resolveRecordedPnpm(root)
  assert.equal(resolved.pnpm.version, PNPM_VERSION)
  const missing = { ...resolved.record, pnpm: { ...resolved.pnpm, js: join(root, 'missing-pnpm.mjs') } }
  assert.deepEqual(missingRecordPaths(missing), [`pnpm entry at ${join(root, 'missing-pnpm.mjs')}`])
})

test('a record with a missing tool path is rejected', () => {
  const root = makeRoot()
  const options = toolOptions(root)
  writeRecord(root, buildRecord({ root, ...options }))
  assert.equal(missingRecordPaths(options).length, 0)
  const image = JSON.parse(readFileSync(recordPath(root), 'utf8'))
  image.pnpm.js = join(root, 'missing-pnpm.mjs')
  writeRecord(root, image)
  assert.throws(() => resolveRecordedPnpm(root), /missing paths/)
})


test('the node-path command prints the recorded Node and refuses a stale record', () => {
  const root = makeRoot()
  const script = fileURLToPath(new URL('../scripts/toolchain.mjs', import.meta.url))
  const absent = spawnSync(process.execPath, [script, 'node-path'], { cwd: root, encoding: 'utf8' })
  assert.equal(absent.status, 0)
  assert.equal(absent.stdout, '')
  writeRecord(root, buildRecord({ root, ...toolOptions(root) }))
  const current = spawnSync(process.execPath, [script, 'node-path'], { cwd: root, encoding: 'utf8' })
  assert.equal(current.status, 0)
  assert.match(current.stdout.trim(), /\/node$/)
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}\n')
  const stale = spawnSync(process.execPath, [script, 'node-path'], { cwd: root, encoding: 'utf8' })
  assert.equal(stale.status, 1)
  assert.match(stale.stderr, /--deps-only/)
  writeRecord(root, buildRecord({ root, ...toolOptions(root) }))
  const image = JSON.parse(readFileSync(recordPath(root), 'utf8'))
  image.node.path = join(root, 'missing-node')
  writeFileSync(recordPath(root), JSON.stringify(image))
  const missing = spawnSync(process.execPath, [script, 'node-path'], { cwd: root, encoding: 'utf8' })
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /--deps-only/)
})


test('a missing input throws before a record is built', () => {
  const root = makeRoot()
  rmSync(join(root, 'package-lock.json'))
  assert.throws(() => hashInputs(root), (error) => error.code === 'invalid')
})

test('an unreadable or non-object record is invalid', () => {
  const root = makeRoot()
  writeRecord(root, buildRecord({ root, ...toolOptions(root) }))
  const path = recordPath(root)
  writeFileSync(path, '{')
  assert.equal(readRecord(root).state, 'invalid')
  writeFileSync(path, '[]')
  assert.equal(readRecord(root).state, 'invalid')
})

test('a record naming another worktree is stale', () => {
  const root = makeRoot()
  writeRecord(root, buildRecord({ root, ...toolOptions(root) }))
  const path = recordPath(root)
  const image = JSON.parse(readFileSync(path, 'utf8'))
  image.worktree = join(root, 'elsewhere')
  writeFileSync(path, JSON.stringify(image))
  const result = readRecord(root)
  assert.equal(result.state, 'stale')
  assert.match(result.reasons.join('\n'), /another worktree/)
})

test('a removed input while reading is stale', () => {
  const root = makeRoot()
  writeRecord(root, buildRecord({ root, ...toolOptions(root) }))
  rmSync(join(root, 'coverage.config.json'))
  const result = readRecord(root)
  assert.equal(result.state, 'stale')
})

test('requireRecord refuses a stale record with its code', () => {
  const root = makeRoot()
  writeRecord(root, buildRecord({ root, ...toolOptions(root) }))
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{"x":{}}}\n')
  assert.throws(() => requireRecord(root), (error) => error.code === 'stale' && error.correction.includes('--deps-only'))
})

test('missingRecordPaths ignores absent optional paths and normalizes real paths', () => {
  assert.deepEqual(missingRecordPaths({}), [])
  assert.deepEqual(missingRecordPaths({ node: { path: '' } }), ['Node at '])
  const root = makeRoot()
  assert.equal(realOrResolved(join(root, 'package.json')), realpathSync(join(root, 'package.json')))
  assert.equal(realOrResolved(join(root, 'nope')), join(root, 'nope'))
})
