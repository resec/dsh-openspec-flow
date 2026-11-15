import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import { artifactPaths, SCRATCH_DIR, DIST_DIR } from '../lib/bundle.js'
import { runPack, USAGE_LINES } from '../lib/pack.js'

/**
 * Build one ustar header block.
 * @param name - entry path.
 * @param size - body size.
 * @returns the 512-byte header.
 */
function header(name, size) {
  const block = Buffer.alloc(512)
  block.write(name, 0, 100, 'utf8')
  block.write('0000644\0', 100, 8)
  block.write('0000000\0', 108, 8)
  block.write('0000000\0', 116, 8)
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12)
  block.write('00000000000\0', 136, 12)
  block.write('        ', 148, 8)
  block.write('0', 156, 1)
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

/** The entries a complete fixture tarball carries. */
const COMPLETE = [
  ['package.json', '{}'],
  ['index.js', 'x'],
  ['client.js', 'x'],
  ['reviewer.js', 'x'],
  ['cordis.patch.yml', 'x'],
  ['icon.svg', 'x'],
  ['lib/mod.js', 'x'],
  ['skills/demo/SKILL.md', 'x'],
  ['locale/en.json', '{}'],
]

/**
 * Create a small repository fixture with the shipped layout.
 * @returns the fixture root.
 */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-pack-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'fixture-bundle',
    version: '1.0.0',
    type: 'module',
    main: 'index.js',
    files: ['index.js', 'client.js', 'reviewer.js', 'cordis.patch.yml', 'icon.svg', 'lib/**', 'skills/**', 'locale/*.json'],
  }))
  for (const name of ['index.js', 'client.js', 'reviewer.js', 'cordis.patch.yml', 'icon.svg']) {
    writeFileSync(join(root, name), 'x')
  }
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(join(root, 'lib', 'mod.js'), 'x')
  mkdirSync(join(root, 'skills', 'demo'), { recursive: true })
  writeFileSync(join(root, 'skills', 'demo', 'SKILL.md'), 'x')
  mkdirSync(join(root, 'locale'), { recursive: true })
  writeFileSync(join(root, 'locale', 'en.json'), '{}')
  return root
}

/**
 * Build a fake executor that answers git and writes the npm tarball.
 * @param options - overrides.
 * @returns the executor and its call log.
 */
function fakeExec(options = {}) {
  const calls = []
  const exec = (command, args) => {
    calls.push([command, ...args])
    if (command === 'git') {
      if (options.gitFails) return { status: 1, stdout: '', stderr: 'git failed' }
      if (args.includes('--porcelain')) return { status: 0, stdout: options.status ?? '', stderr: '' }
      return { status: 0, stdout: `${options.revision ?? 'a'.repeat(40)}\n`, stderr: '' }
    }
    if (command !== 'npm') throw new Error(`unexpected command ${command}`)
    if (options.npmFails) return { status: 1, stdout: '', stderr: 'npm failed' }
    const scratch = args[args.indexOf('--pack-destination') + 1]
    const name = 'fixture-bundle-1.0.0.tgz'
    writeFileSync(join(scratch, name), options.bytes ?? tarball(COMPLETE))
    return { status: 0, stdout: JSON.stringify([{ filename: name }]), stderr: '' }
  }
  return { exec, calls }
}

test('prints the usage and exits zero', () => {
  const root = fixture()
  try {
    const { exec } = fakeExec()
    const result = runPack({ root, argv: ['--help'], exec })
    assert.equal(result.code, 0)
    assert.deepEqual(result.lines.map((line) => line.text), USAGE_LINES)
    assert.ok(result.lines.some((line) => line.text.includes('dist/<name>-<version>/<name>-<version>.tgz')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('accepts -h as the help flag', () => {
  const root = fixture()
  try {
    const result = runPack({ root, argv: ['-h'], exec: fakeExec().exec })
    assert.equal(result.code, 0)
    assert.deepEqual(result.lines.map((line) => line.text), USAGE_LINES)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('returns the generic exit code for an unreadable manifest', () => {
  const root = fixture()
  try {
    writeFileSync(join(root, 'package.json'), '{invalid')
    const result = runPack({ root, argv: [], exec: fakeExec().exec })
    assert.equal(result.code, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('refuses an unknown argument', () => {
  const root = fixture()
  try {
    const result = runPack({ root, argv: ['--bogus'], exec: fakeExec().exec })
    assert.equal(result.code, 2)
    assert.match(result.lines[0].text, /unknown argument/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('refuses a dirty tree and does not pack', () => {
  const root = fixture()
  try {
    const { exec, calls } = fakeExec({ status: ' M lib/mod.js\n' })
    const result = runPack({ root, argv: [], exec })
    assert.equal(result.code, 1)
    assert.ok(result.lines.some((line) => line.text.includes('lib/mod.js')))
    assert.ok(!calls.some((call) => call[0] === 'npm'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('packs a clean tree and publishes the pair', () => {
  const root = fixture()
  try {
    const result = runPack({ root, argv: [], exec: fakeExec({ revision: 'b'.repeat(40) }).exec })
    assert.equal(result.code, 0)
    const { directory, tarball, metadata } = artifactPaths(join(root, DIST_DIR), 'fixture-bundle', '1.0.0')
    assert.ok(existsSync(tarball))
    assert.equal(JSON.parse(readFileSync(metadata, 'utf8')).revision, 'b'.repeat(40))
    assert.ok(result.lines.some((line) => line.text.includes(directory)))
    assert.ok(!existsSync(join(root, SCRATCH_DIR)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('refuses an existing pair without --force and replaces it with --force', () => {
  const root = fixture()
  try {
    const first = fakeExec({ revision: 'b'.repeat(40) })
    assert.equal(runPack({ root, argv: [], exec: first.exec }).code, 0)

    const second = fakeExec({ revision: 'c'.repeat(40) })
    const refused = runPack({ root, argv: [], exec: second.exec })
    assert.equal(refused.code, 1)
    assert.ok(refused.lines.some((line) => line.text.includes('already exists')))

    const third = fakeExec({ revision: 'c'.repeat(40) })
    assert.equal(runPack({ root, argv: ['--force'], exec: third.exec }).code, 0)
    const { metadata } = artifactPaths(join(root, DIST_DIR), 'fixture-bundle', '1.0.0')
    assert.equal(JSON.parse(readFileSync(metadata, 'utf8')).revision, 'c'.repeat(40))
    const leftovers = readdirSync(join(root, DIST_DIR)).filter((name) => name.includes('previous') || name.includes('staging'))
    assert.deepEqual(leftovers, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('publishes nothing and clears the scratch directory when the content check fails', () => {
  const root = fixture()
  try {
    const incomplete = tarball(COMPLETE.filter(([name]) => name !== 'index.js'))
    const result = runPack({ root, argv: [], exec: fakeExec({ bytes: incomplete }).exec })
    assert.equal(result.code, 1)
    assert.ok(result.lines.some((line) => line.text.includes('missing: index.js')))
    assert.ok(!existsSync(join(root, DIST_DIR)) || readdirSync(join(root, DIST_DIR)).length === 0)
    assert.ok(!existsSync(join(root, SCRATCH_DIR)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('reports a package-manager failure', () => {
  const root = fixture()
  try {
    const result = runPack({ root, argv: [], exec: fakeExec({ npmFails: true }).exec })
    assert.equal(result.code, 1)
    assert.ok(result.lines.some((line) => line.text.includes('npm failed')))
    assert.ok(!existsSync(join(root, SCRATCH_DIR)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('reports a git failure', () => {
  const root = fixture()
  try {
    const result = runPack({ root, argv: [], exec: fakeExec({ gitFails: true }).exec })
    assert.equal(result.code, 1)
    assert.ok(result.lines.some((line) => line.text.includes('git failed')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
