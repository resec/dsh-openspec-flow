import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import {
  artifactPaths,
  assertFresh,
  BundleError,
  corePaths,
  dirtyPaths,
  DIST_DIR,
  expectedPublishedPaths,
  metadataFor,
  publishVerified,
  readManifest,
  SCRATCH_DIR,
  sha512Hex,
  tarballPaths,
  verifyTarball,
} from '../lib/bundle.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Build one ustar header block.
 * @param name - entry path.
 * @param size - body size.
 * @param type - tar type flag.
 * @returns the 512-byte header.
 */
function header(name, size, type = '0') {
  const block = Buffer.alloc(512)
  block.write(name, 0, 100, 'utf8')
  block.write('0000644\0', 100, 8)
  block.write('0000000\0', 108, 8)
  block.write('0000000\0', 116, 8)
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12)
  block.write('00000000000\0', 136, 12)
  block.write('        ', 148, 8)
  block.write(type, 156, 1)
  block.write('ustar\0', 257, 6)
  block.write('00', 263, 2)
  let sum = 0
  for (const byte of block) sum += byte
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8)
  return block
}

/**
 * Build a gzipped tar from named entries.
 * @param entries - pairs of path and text.
 * @returns the gzipped bytes.
 */
function tarball(entries) {
  const blocks = []
  for (const [name, text] of entries) {
    const body = Buffer.from(text)
    const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512)
    body.copy(padded)
    blocks.push(header(`package/${name}`, body.length), padded)
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks))
}

/**
 * Build a minimal repository fixture with a manifest and the shipped layout.
 * @returns the fixture root.
 */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-fixture-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'fixture-bundle',
    version: '1.0.0',
    type: 'module',
    main: 'index.js',
    exports: { '.': './index.js', './client': './client.js', './locale/*.json': './locale/*.json', './icon': './icon.svg' },
    files: ['index.js', 'client.js', 'reviewer.js', 'cordis.patch.yml', 'icon.svg', 'lib/**', 'skills/**', 'locale/*.json'],
  }))
  for (const name of ['index.js', 'client.js', 'reviewer.js', 'cordis.patch.yml', 'icon.svg']) {
    writeFileSync(join(root, name), `export default '${name}'\n`)
  }
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(join(root, 'lib', 'mod.js'), 'export const x = 1\n')
  mkdirSync(join(root, 'skills', 'demo'), { recursive: true })
  writeFileSync(join(root, 'skills', 'demo', 'SKILL.md'), '# demo\n')
  mkdirSync(join(root, 'locale'), { recursive: true })
  writeFileSync(join(root, 'locale', 'en.json'), '{}\n')
  return root
}

test('reads the manifest and refuses a missing one', () => {
  const manifest = readManifest(ROOT)
  assert.equal(manifest.name, 'dsh-openspec-flow')
  const empty = mkdtempSync(join(tmpdir(), 'openspec-flow-manifest-'))
  assert.throws(() => readManifest(empty), (error) => error instanceof BundleError && /cannot read package.json/.test(error.message))
  rmSync(empty, { recursive: true, force: true })
})

test('the core set is independent of the file list', () => {
  const manifest = readManifest(ROOT)
  const core = corePaths(ROOT, manifest)
  for (const required of ['package.json', 'index.js', 'client.js', 'reviewer.js', 'cordis.patch.yml', 'icon.svg', 'lib/bundle.js']) {
    assert.ok(core.includes(required), required)
  }
  assert.ok(core.some((path) => path.startsWith('skills/') && path.endsWith('/SKILL.md')))
  assert.ok(core.some((path) => path.startsWith('locale/') && path.endsWith('.json')))
  const withoutFiles = corePaths(ROOT, { ...manifest, files: [] })
  assert.deepEqual(withoutFiles, core)
  assert.deepEqual(expectedPublishedPaths(ROOT, { ...manifest, files: undefined }), core)
  assert.ok(expectedPublishedPaths(ROOT).includes('lib/bundle.js'))
})

test('expands the manifest files on top of the core', () => {
  const root = fixture()
  try {
    const manifest = readManifest(root)
    const paths = expectedPublishedPaths(root, manifest)
    for (const required of ['package.json', 'index.js', 'lib/mod.js', 'skills/demo/SKILL.md', 'locale/en.json', 'cordis.patch.yml', 'icon.svg']) {
      assert.ok(paths.includes(required), required)
    }
    assert.ok(!paths.includes('README.md'))
    assert.ok(!paths.includes('LICENSE'))
    assert.deepEqual(expectedPublishedPaths(root), paths)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('reports a missing published directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-manifest-dir-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'pkg', version: '1.0.0' }))
  assert.throws(() => corePaths(root, readManifest(root)), /published directory lib\/ is missing/)
  rmSync(root, { recursive: true, force: true })
})

test('lists the paths of a tarball', () => {
  assert.deepEqual(tarballPaths(tarball([['index.js', 'x'], ['lib/a.js', 'y']])), ['index.js', 'lib/a.js'])
})

test('ignores non-package and non-regular entries', () => {
  const blocks = [
    header('package/index.js', 1),
    Buffer.alloc(512),
    header('other/file.js', 1),
    Buffer.alloc(512),
    header('package/link.js', 0, '2'),
    Buffer.alloc(512),
    Buffer.alloc(1024),
  ]
  assert.deepEqual(tarballPaths(gzipSync(Buffer.concat(blocks))), ['index.js'])
})

test('verifies a complete tarball', () => {
  const bytes = tarball([['index.js', 'x'], ['skills/demo/SKILL.md', 'y']])
  assert.deepEqual(verifyTarball(bytes, ['index.js', 'skills/demo/SKILL.md']), ['index.js', 'skills/demo/SKILL.md'])
})

test('reports a missing core path', () => {
  const bytes = tarball([['lib/mod.js', 'x']])
  assert.throws(() => verifyTarball(bytes, ['index.js', 'package.json']), /missing: index\.js, package\.json/)
})

test('reports a missing lib path', () => {
  const bytes = tarball([['index.js', 'x']])
  assert.throws(() => verifyTarball(bytes, ['index.js', 'lib/bundle.js']), /missing: lib\/bundle\.js/)
})

test('reports a forbidden path', () => {
  const bytes = tarball([['index.js', 'x'], ['test/a.test.mjs', 'y']])
  assert.throws(() => verifyTarball(bytes, ['index.js']), /forbidden: test\/a\.test\.mjs/)
})

test('refuses a truncated archive', () => {
  const bytes = tarball([['index.js', 'x']]).subarray(0, 8)
  assert.throws(() => tarballPaths(bytes), /cannot read the tarball/)
})

test('refuses an archive that ends inside an entry', () => {
  const body = Buffer.alloc(512)
  const blocks = Buffer.concat([header('package/index.js', 2048), body])
  assert.throws(() => tarballPaths(gzipSync(blocks)), /ends inside an entry/)
})

test('parses the dirty paths of a status listing', () => {
  assert.deepEqual(dirtyPaths(' M lib/a.js\n?? test/b.mjs\n'), ['lib/a.js', 'test/b.mjs'])
  assert.deepEqual(dirtyPaths(''), [])
})

test('computes the artifact paths and the sha512 digest', () => {
  assert.deepEqual(artifactPaths('/repo/dist', 'pkg', '1.0.0'), {
    tarball: '/repo/dist/pkg-1.0.0.tgz',
    metadata: '/repo/dist/pkg-1.0.0.json',
  })
  assert.equal(sha512Hex(Buffer.from('x')).length, 128)
  assert.equal(DIST_DIR, 'dist')
  assert.equal(SCRATCH_DIR, '.cache/pack')
})

test('refuses an existing pair unless forced', () => {
  const dist = mkdtempSync(join(tmpdir(), 'openspec-flow-dist-'))
  assertFresh(dist, 'pkg', '1.0.0', false)
  const paths = artifactPaths(dist, 'pkg', '1.0.0')
  writeFileSync(paths.tarball, 't')
  assert.throws(() => assertFresh(dist, 'pkg', '1.0.0', false), /already exists/)
  assertFresh(dist, 'pkg', '1.0.0', true)
  writeFileSync(paths.metadata, '{}')
  assert.throws(() => assertFresh(dist, 'pkg', '1.0.0', false), /already exists/)
  rmSync(dist, { recursive: true, force: true })
})

test('builds the metadata record', () => {
  const bytes = tarball([['index.js', 'x']])
  const record = metadataFor({ name: 'pkg', version: '1.0.0' }, bytes, ['index.js'], 'a'.repeat(40), '2026-11-15T00:00:00.000Z')
  assert.deepEqual(record, {
    name: 'pkg',
    version: '1.0.0',
    file: 'pkg-1.0.0.tgz',
    sha512: sha512Hex(bytes),
    bytes: bytes.length,
    files: 1,
    revision: 'a'.repeat(40),
    dirty: false,
    at: '2026-11-15T00:00:00.000Z',
  })
})

test('publishes a verified pair only after the check passes', () => {
  const dist = mkdtempSync(join(tmpdir(), 'openspec-flow-publish-'))
  const empty = mkdtempSync(join(tmpdir(), 'openspec-flow-publish-empty-'))
  const manifest = { name: 'pkg', version: '1.0.0' }
  try {
    const first = publishVerified(dist, manifest, tarball([['index.js', 'x']]), ['index.js'], 'a'.repeat(40), '2026-11-15T00:00:00.000Z')
    assert.equal(first.revision, 'a'.repeat(40))
    assert.ok(existsSync(join(dist, 'pkg-1.0.0.tgz')))

    assert.throws(() => publishVerified(empty, manifest, tarball([['index.js', 'x']]), ['client.js'], 'b'.repeat(40), 'later'), /missing/)
    assert.deepEqual(readdirSync(empty), [])

    assert.throws(() => publishVerified(dist, manifest, tarball([['index.js', 'z']]), ['client.js'], 'b'.repeat(40), 'later'), /missing/)
    assert.equal(JSON.parse(readFileSync(join(dist, 'pkg-1.0.0.json'), 'utf8')).revision, 'a'.repeat(40))

    const second = publishVerified(dist, manifest, tarball([['index.js', 'z']]), ['index.js'], 'b'.repeat(40), 'later')
    assert.equal(second.revision, 'b'.repeat(40))
    assert.equal(JSON.parse(readFileSync(join(dist, 'pkg-1.0.0.json'), 'utf8')).revision, 'b'.repeat(40))
  } finally {
    rmSync(dist, { recursive: true, force: true })
    rmSync(empty, { recursive: true, force: true })
  }
})

test('packs a fixture with npm and verifies the bytes', () => {
  const root = fixture()
  const out = mkdtempSync(join(tmpdir(), 'openspec-flow-pack-out-'))
  try {
    const packed = spawnSync('npm', ['pack', '--json', '--pack-destination', out, '--cache', join(out, 'cache')], { cwd: root, encoding: 'utf8' })
    assert.equal(packed.status, 0, packed.stderr)
    const name = JSON.parse(packed.stdout)[0].filename
    const bytes = readFileSync(join(out, name))
    const paths = verifyTarball(bytes, expectedPublishedPaths(root))
    assert.ok(paths.includes('skills/demo/SKILL.md'))
    assert.ok(paths.includes('lib/mod.js'))
    assert.ok(!paths.some((path) => path.startsWith('test/')))
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(out, { recursive: true, force: true })
  }
})
