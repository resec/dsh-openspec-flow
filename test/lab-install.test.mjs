import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT } from '../scripts/lab/core/paths.mjs'
import { gitDirty, gitHead, packPlugin, pluginEnvironment } from '../scripts/lab/core/install.mjs'
import { PNPM_VERSION, pnpmBucket, buildRecord, writeRecord } from '../scripts/toolchain.mjs'

test('the working tree can be packed without writing dist', () => {
  const out = mkdtempSync(join(tmpdir(), 'dsh-lab-pack-'))
  try {
    const packed = packPlugin({ root: ROOT, outDir: out })
    assert.equal(packed.name, 'dsh-openspec-flow')
    assert.match(packed.version, /^\d+\.\d+\.\d+/)
    assert.ok(existsSync(packed.tarball))
    assert.equal(typeof packed.sha512, 'string')
    assert.ok(packed.sha512.length > 20)
    assert.equal(typeof packed.dirty.dirty, 'boolean')
    assert.match(packed.head, /^[0-9a-f]{7,40}$/)
    assert.equal(typeof gitDirty(ROOT).paths, 'object')
    assert.match(gitHead(ROOT), /^[0-9a-f]{7,40}$/)
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})


test('the plugin environment uses the recorded pnpm and refuses a stale record', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-lab-install-'))
  try {
    writeFileSync(join(root, 'package.json'), '{"engines":{"node":">=24.9.0"}}\n')
    writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}\n')
    writeFileSync(join(root, 'coverage.baseline.json'), '{"node":{"version":"v24.22.2"}}\n')
    writeFileSync(join(root, 'coverage.config.json'), '{"primaryNodeMajor":24}\n')
    const node = join(root, 'node')
    const pnpmJs = join(root, 'pnpm.mjs')
    const binDir = join(root, 'bin')
    writeFileSync(node, '')
    writeFileSync(pnpmJs, '')
    mkdirSync(binDir, { recursive: true })
    writeRecord(root, buildRecord({
      root,
      requirements: { nodeRange: '>=24.9.0', primaryNodeMajor: 24, pnpm: PNPM_VERSION },
      node: { path: node, version: 'v24.22.2', source: 'host' },
      npm: { path: node, version: '11.0.0' },
      pnpm: { bucket: pnpmBucket('/shared'), version: PNPM_VERSION, js: pnpmJs, binDir, node },
      chromium: null,
    }))
    const env = pluginEnvironment({ root, env: { PATH: '/usr/bin' } })
    assert.equal(env.PATH, `${binDir}:${root}:/usr/bin`)
    writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{"x":{}}}\n')
    assert.throws(() => pluginEnvironment({ root, env: { PATH: '/usr/bin' } }), (error) => /--deps-only/.test(error.correction))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
