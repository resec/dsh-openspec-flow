import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { assertCliVersion, parseJson, PINNED_CLI_VERSION, resolveBundledCli, withStore } from '../lib/openspec.js'
import { createFakeContext } from './fake-context.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))

/**
 * Copy the module under test into a throwaway installation tree.
 *
 * The resolution failures read the plugin's own manifest and resolve from the
 * module's location, so a copy under a temporary root is the only way to build
 * a broken install without touching the real `node_modules`.
 *
 * @param files - relative path to file content below the temporary root.
 * @returns the root and a loader for the copied module.
 */
function installation(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'openspec-incomplete-'))
  mkdirSync(join(root, 'lib'), { recursive: true })
  copyFileSync(join(ROOT, 'lib', 'openspec.js'), join(root, 'lib', 'openspec.js'))
  copyFileSync(join(ROOT, 'package.json'), join(root, 'package.json'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return { root, load: () => import(pathToFileURL(join(root, 'lib', 'openspec.js')).href) }
}

/**
 * Build the bundled package manifest for an installation fixture.
 * @param bin - `bin` field; omitted when undefined.
 * @returns the manifest text.
 */
function bundledManifest(bin) {
  return JSON.stringify({
    name: '@fission-ai/openspec',
    version: PINNED_CLI_VERSION,
    main: 'index.js',
    ...(bin === undefined ? {} : { bin }),
  })
}

test('pins an exact bundled CLI version', () => {
  assert.equal(PINNED_CLI_VERSION, '2.2.0')
  assert.match(PINNED_CLI_VERSION, /^\d+\.\d+\.\d+$/)
  assert.equal(manifest.dependencies['@fission-ai/openspec'], PINNED_CLI_VERSION)
  assert.equal(manifest.devDependencies?.['@fission-ai/openspec'], undefined)
})

test('resolves the bin from the plugin installation tree', () => {
  const bin = resolveBundledCli()
  assert.ok(existsSync(bin), `bundled bin exists: ${bin}`)
  assert.match(bin, /node_modules[\\/]@fission-ai[\\/]openspec[\\/]bin[\\/]openspec\.js$/u)
  assert.equal(resolveBundledCli(), bin)
  assert.equal(
    bin,
    join(fileURLToPath(new URL('../node_modules/@fission-ai/openspec', import.meta.url)), 'bin', 'openspec.js'),
  )
})

test('accepts the pinned version and JSON envelope', () => {
  assert.doesNotThrow(() => assertCliVersion({ version: PINNED_CLI_VERSION, schemaVersion: 1 }))
})

test('rejects a mismatched CLI version or schema envelope', () => {
  assert.throws(
    () => assertCliVersion({ version: '1.15.0', schemaVersion: 1 }),
    /reports version '1\.15\.0'.*pins '2\.2\.0'/s,
  )
  assert.throws(
    () => assertCliVersion({ version: PINNED_CLI_VERSION, schemaVersion: 2 }),
    /schemaVersion '2'.*expects 1/,
  )
  assert.throws(() => assertCliVersion(null), /non-object version report/)
})


test('parses JSON output and treats empty or malformed text as absent', () => {
  assert.deepEqual(parseJson('{"ok":true}'), { ok: true })
  assert.equal(parseJson(''), undefined)
  assert.equal(parseJson('not json'), undefined)
})

test('withStore appends only a non-empty string store', () => {
  assert.deepEqual(withStore(['list'], 'team'), ['list', '--store', 'team'])
  assert.deepEqual(withStore(['list'], '  '), ['list'])
  assert.deepEqual(withStore(['list'], 3), ['list'])
})

test('rejects an array version report', () => {
  assert.throws(() => assertCliVersion([]), /non-object version report/)
})

test('an install without the bundled package names it and asks for a reinstall', async () => {
  const { root, load } = installation()
  try {
    const { resolveBundledCli: resolve } = await load()
    assert.throws(
      () => resolve(),
      /could not resolve its bundled @fission-ai\/openspec CLI\. Reinstall the plugin so its runtime dependencies are installed\./,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a bundled package without a bin entry names the missing field and asks for a reinstall', async () => {
  const { root, load } = installation({
    'node_modules/@fission-ai/openspec/package.json': bundledManifest(),
    'node_modules/@fission-ai/openspec/index.js': 'export default {}\n',
  })
  try {
    const { resolveBundledCli: resolve } = await load()
    assert.throws(() => resolve(), (error) => {
      assert.match(error.message, /has no bin\.openspec entry\. Reinstall the plugin\./)
      assert.ok(error.message.includes(join(root, 'node_modules', '@fission-ai', 'openspec')), error.message)
      return true
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a bin entry whose file is gone names the missing path and asks for a reinstall', async () => {
  const { root, load } = installation({
    'node_modules/@fission-ai/openspec/package.json': bundledManifest({ openspec: 'bin/openspec.js' }),
    'node_modules/@fission-ai/openspec/index.js': 'export default {}\n',
  })
  try {
    const { resolveBundledCli: resolve } = await load()
    assert.throws(() => resolve(), (error) => {
      assert.match(error.message, /points at a missing bin '.+bin[\\/]openspec\.js'\. Reinstall the plugin\./)
      assert.ok(error.message.includes(join(root, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js')), error.message)
      return true
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a version call that prints no JSON names the exit code and the output', async () => {
  const { root, load } = installation({
    'node_modules/@fission-ai/openspec/package.json': bundledManifest({ openspec: 'bin/openspec.js' }),
    'node_modules/@fission-ai/openspec/index.js': 'export default {}\n',
    'node_modules/@fission-ai/openspec/bin/openspec.js': "console.log('this build prints prose, not JSON')\n",
  })
  try {
    const { runOpenSpec } = await load()
    const { ctx } = createFakeContext({ cwd: root, spawnMode: 'child' })
    await assert.rejects(
      () => runOpenSpec(ctx, { timeoutMs: 10_000 }, root, ['list', '--json']),
      /bundled OpenSpec CLI returned no JSON version report \(exit 0\): this build prints prose, not JSON/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
