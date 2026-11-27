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
  recoverArtifacts,
  readManifest,
  SCRATCH_DIR,
  sha512Hex,
  splitDirtyPaths,
  tarballPaths,
  untrackedPaths,
  verifyTarball,
} from '../lib/bundle.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Run git in a repository.
 * @param root - repository root.
 * @param args - arguments after `git -C <root>`.
 * @returns the command result.
 */
function git(root, ...args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
}

/**
 * The paths `git ls-files` lists, as the pack entrypoint reads them.
 * @param root - repository root.
 * @returns the tracked POSIX paths.
 */
function trackedOf(root) {
  const listed = git(root, 'ls-files', '-z')
  assert.equal(listed.status, 0, listed.stderr)
  return listed.stdout.split('\0').filter(Boolean)
}

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

/**
 * Turn a fixture into a committed repository that holds an ignored and an
 * untracked file npm never packs, and an ignored file the `lib/**` glob packs.
 * @param root - the fixture root.
 * @returns the fixture root.
 */
function commitFixture(root) {
  writeFileSync(join(root, '.gitignore'), '*.log\nlib/.DS_Store\n')
  const commands = [
    ['init', '-q'],
    ['config', 'user.email', 'bundle@example.test'],
    ['config', 'user.name', 'Bundle Test'],
    ['add', '.gitignore', 'package.json', 'index.js', 'client.js', 'reviewer.js', 'cordis.patch.yml', 'icon.svg', 'lib/mod.js', 'skills/demo/SKILL.md', 'locale/en.json'],
    ['commit', '-qm', 'init'],
  ]
  for (const args of commands) {
    const result = git(root, ...args)
    assert.equal(result.status, 0, result.stderr)
  }
  writeFileSync(join(root, 'lib', 'debug.log'), 'debug\n')
  writeFileSync(join(root, 'lib', '.DS_Store'), '\0')
  writeFileSync(join(root, 'skills', '.DS_Store'), '\0')
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
  const tracked = trackedOf(ROOT)
  const core = corePaths(ROOT, manifest, tracked)
  for (const required of ['package.json', 'index.js', 'client.js', 'reviewer.js', 'cordis.patch.yml', 'icon.svg', 'lib/bundle.js']) {
    assert.ok(core.includes(required), required)
  }
  assert.ok(core.some((path) => path.startsWith('skills/') && path.endsWith('/SKILL.md')))
  assert.ok(core.some((path) => path.startsWith('locale/') && path.endsWith('.json')))
  const withoutFiles = corePaths(ROOT, { ...manifest, files: [] }, tracked)
  assert.deepEqual(withoutFiles, core)
  assert.deepEqual(expectedPublishedPaths(ROOT, { ...manifest, files: undefined }, tracked), core)
  assert.ok(expectedPublishedPaths(ROOT, manifest, tracked).includes('lib/bundle.js'))
})

test('the core set holds tracked files only', () => {
  const root = commitFixture(fixture())
  try {
    const manifest = readManifest(root)
    const tracked = trackedOf(root)
    assert.ok(!tracked.includes('lib/debug.log'))
    for (const path of ['lib/debug.log', 'lib/.DS_Store', 'skills/.DS_Store']) {
      assert.ok(!corePaths(root, manifest, tracked).includes(path), path)
      assert.ok(!expectedPublishedPaths(root, manifest, tracked).includes(path), path)
    }
    assert.ok(corePaths(root, manifest, tracked).includes('lib/mod.js'))
    assert.ok(expectedPublishedPaths(root, manifest, tracked).includes('skills/demo/SKILL.md'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the toolchain record helper ships from lib and never from scripts', () => {
  const paths = expectedPublishedPaths(ROOT)
  assert.deepEqual(paths.filter((path) => path.includes('toolchain-record')), ['lib/toolchain-record.js'])
  assert.ok(!paths.some((path) => path.startsWith('scripts/')))
})

test('expands the manifest files on top of the core', () => {
  const root = fixture()
  const tracked = ['index.js', 'lib/mod.js', 'skills/demo/SKILL.md', 'locale/en.json']
  try {
    const manifest = readManifest(root)
    const paths = expectedPublishedPaths(root, manifest, tracked)
    for (const required of ['package.json', 'index.js', 'lib/mod.js', 'skills/demo/SKILL.md', 'locale/en.json', 'cordis.patch.yml', 'icon.svg']) {
      assert.ok(paths.includes(required), required)
    }
    assert.ok(!paths.includes('README.md'))
    assert.ok(!paths.includes('LICENSE'))
    assert.deepEqual(expectedPublishedPaths(root, { ...manifest, files: ['lib/**', 'locale/*.json'] }, tracked), paths)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('reports a missing published directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-manifest-dir-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'pkg', version: '1.0.0' }))
  assert.throws(() => corePaths(root, readManifest(root), []), /published directory lib\/ is missing/)
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

test('refuses an archive without the end-of-archive marker', () => {
  const body = Buffer.alloc(512)
  const blocks = Buffer.concat([header('package/index.js', 4), body])
  assert.throws(() => tarballPaths(gzipSync(blocks)), /missing its end-of-archive marker/)
})

test('refuses an archive with only one end-of-archive block', () => {
  const blocks = Buffer.concat([header('package/index.js', 4), Buffer.alloc(512), Buffer.alloc(512)])
  assert.throws(() => tarballPaths(gzipSync(blocks)), /missing its end-of-archive marker/)
})

test('recovers an interrupted directory swap', () => {
  const dist = mkdtempSync(join(tmpdir(), 'openspec-flow-recover-'))
  try {
    const { directory } = artifactPaths(dist, 'pkg', '1.0.0')
    const staging = `${directory}.staging-old`
    const previous = `${directory}.previous-old`
    mkdirSync(staging, { recursive: true })
    recoverArtifacts(dist, 'pkg', '1.0.0')
    assert.ok(!existsSync(staging))

    mkdirSync(previous, { recursive: true })
    recoverArtifacts(dist, 'pkg', '1.0.0')
    assert.ok(existsSync(directory))
    assert.ok(!existsSync(previous))

    const other = `${directory}.previous-other`
    mkdirSync(other, { recursive: true })
    recoverArtifacts(dist, 'pkg', '1.0.0')
    assert.ok(!existsSync(other))
    assert.ok(existsSync(directory))
  } finally {
    rmSync(dist, { recursive: true, force: true })
  }
})

test('refuses an archive that ends inside an entry', () => {
  const body = Buffer.alloc(512)
  const blocks = Buffer.concat([header('package/index.js', 2048), body])
  assert.throws(() => tarballPaths(gzipSync(blocks)), /missing its end-of-archive marker/)
})

test('parses the dirty paths of a status listing', () => {
  assert.deepEqual(dirtyPaths(' M lib/a.js\n?? test/b.mjs\n'), ['lib/a.js', 'test/b.mjs'])
  assert.deepEqual(dirtyPaths(''), [])
  assert.deepEqual(dirtyPaths('R  lib/a.js -> lib/b.js\n'), ['lib/a.js', 'lib/b.js'])
  assert.deepEqual(dirtyPaths('?? "space name.md"\n'), ['space name.md'])
})

test('splits dirty paths into blocking and ignored OpenSpec paths', () => {
  assert.deepEqual(splitDirtyPaths(['lib/a.js', 'openspec/changes/x/tasks.md', 'test/b.mjs']), {
    blocking: ['lib/a.js', 'test/b.mjs'],
    ignored: ['openspec/changes/x/tasks.md'],
  })
  assert.deepEqual(splitDirtyPaths(['openspec\\changes\\x\\tasks.md']), {
    blocking: [],
    ignored: ['openspec/changes/x/tasks.md'],
  })
  assert.deepEqual(splitDirtyPaths(['packages\\x\\openspec\\changes\\y\\tasks.md']), {
    blocking: ['packages/x/openspec/changes/y/tasks.md'],
    ignored: [],
  })
  assert.deepEqual(splitDirtyPaths([]), { blocking: [], ignored: [] })
})

test('computes the artifact paths and the sha512 digest', () => {
  assert.deepEqual(artifactPaths('/repo/dist', 'pkg', '1.0.0'), {
    directory: '/repo/dist/pkg-1.0.0',
    tarball: '/repo/dist/pkg-1.0.0/pkg-1.0.0.tgz',
    metadata: '/repo/dist/pkg-1.0.0/pkg-1.0.0.json',
  })
  assert.equal(sha512Hex(Buffer.from('x')).length, 128)
  assert.equal(DIST_DIR, 'dist')
  assert.equal(SCRATCH_DIR, '.cache/pack')
})

test('refuses an existing pair unless forced', () => {
  const dist = mkdtempSync(join(tmpdir(), 'openspec-flow-dist-'))
  assertFresh(dist, 'pkg', '1.0.0', false)
  const paths = artifactPaths(dist, 'pkg', '1.0.0')
  mkdirSync(paths.directory, { recursive: true })
  writeFileSync(paths.tarball, 't')
  assert.throws(() => assertFresh(dist, 'pkg', '1.0.0', false), /already exists/)
  assertFresh(dist, 'pkg', '1.0.0', true)
  writeFileSync(paths.metadata, '{}')
  assert.throws(() => assertFresh(dist, 'pkg', '1.0.0', false), /already exists/)
  rmSync(dist, { recursive: true, force: true })
})

test('builds the metadata record', () => {
  const bytes = tarball([['index.js', 'x']])
  const record = metadataFor({ name: 'pkg', version: '1.0.0' }, bytes, ['index.js'], 'a'.repeat(40), '2026-11-15T00:00:00.000Z', false)
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
  assert.equal(metadataFor({ name: 'pkg', version: '1.0.0' }, bytes, ['index.js'], 'a'.repeat(40), '2026-11-15T00:00:00.000Z', true).dirty, true)
})

test('lists the tarball paths the repository does not track', () => {
  assert.deepEqual(untrackedPaths(['index.js', 'lib/debug.log', 'lib/mod.js'], ['index.js', 'lib/mod.js', 'skills/a/SKILL.md']), ['lib/debug.log'])
  assert.deepEqual(untrackedPaths(['index.js'], ['index.js']), [])
  assert.deepEqual(untrackedPaths([], ['index.js']), [])
})

test('publishes a verified pair only after the check passes', () => {
  const dist = mkdtempSync(join(tmpdir(), 'openspec-flow-publish-'))
  const empty = mkdtempSync(join(tmpdir(), 'openspec-flow-publish-empty-'))
  const manifest = { name: 'pkg', version: '1.0.0' }
  const tracked = ['index.js']
  try {
    const { tarball: tarballPath, metadata } = artifactPaths(dist, 'pkg', '1.0.0')
    const first = publishVerified(dist, manifest, tarball([['index.js', 'x']]), ['index.js'], 'a'.repeat(40), '2026-11-15T00:00:00.000Z', tracked)
    assert.equal(first.revision, 'a'.repeat(40))
    assert.equal(first.dirty, false)
    assert.ok(existsSync(tarballPath))

    assert.throws(() => publishVerified(empty, manifest, tarball([['index.js', 'x']]), ['client.js'], 'b'.repeat(40), 'later', tracked), /missing/)
    assert.deepEqual(readdirSync(empty), [])

    assert.throws(() => publishVerified(dist, manifest, tarball([['index.js', 'z']]), ['client.js'], 'b'.repeat(40), 'later', tracked), /missing/)
    assert.equal(JSON.parse(readFileSync(metadata, 'utf8')).revision, 'a'.repeat(40))

    const second = publishVerified(dist, manifest, tarball([['index.js', 'z']]), ['index.js'], 'b'.repeat(40), 'later', tracked)
    assert.equal(second.revision, 'b'.repeat(40))
    assert.equal(JSON.parse(readFileSync(metadata, 'utf8')).revision, 'b'.repeat(40))
    assert.deepEqual(readdirSync(dist).filter((name) => name !== 'pkg-1.0.0'), [])
  } finally {
    rmSync(dist, { recursive: true, force: true })
    rmSync(empty, { recursive: true, force: true })
  }
})

test('publishes a tarball that carries an untracked path as dirty', () => {
  const dist = mkdtempSync(join(tmpdir(), 'openspec-flow-publish-dirty-'))
  const manifest = { name: 'pkg', version: '1.0.0' }
  try {
    const { metadata } = artifactPaths(dist, 'pkg', '1.0.0')
    const bytes = tarball([['index.js', 'x'], ['lib/debug.log', 'debug']])
    const record = publishVerified(dist, manifest, bytes, ['index.js'], 'a'.repeat(40), '2026-11-15T00:00:00.000Z', ['index.js'])
    assert.equal(record.dirty, true)
    assert.equal(record.files, 2)
    assert.equal(record.sha512, sha512Hex(bytes))
    assert.equal(JSON.parse(readFileSync(metadata, 'utf8')).dirty, true)
  } finally {
    rmSync(dist, { recursive: true, force: true })
  }
})

test('packs a fixture with npm and verifies the bytes', () => {
  const root = commitFixture(fixture())
  const out = mkdtempSync(join(tmpdir(), 'openspec-flow-pack-out-'))
  try {
    const packed = spawnSync('npm', ['pack', '--json', '--pack-destination', out, '--cache', join(out, 'cache')], { cwd: root, encoding: 'utf8' })
    assert.equal(packed.status, 0, packed.stderr)
    const name = JSON.parse(packed.stdout)[0].filename
    const bytes = readFileSync(join(out, name))
    const tracked = trackedOf(root)
    const paths = verifyTarball(bytes, expectedPublishedPaths(root, readManifest(root), tracked))
    assert.ok(paths.includes('skills/demo/SKILL.md'))
    assert.ok(paths.includes('lib/mod.js'))
    assert.ok(!paths.some((path) => path.startsWith('test/')))
    assert.deepEqual(untrackedPaths(paths, tracked), ['lib/debug.log'])
    assert.ok(!paths.includes('lib/.DS_Store'))
    assert.ok(!paths.includes('skills/.DS_Store'))
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(out, { recursive: true, force: true })
  }
})
