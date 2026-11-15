#!/usr/bin/env node
/**
 * Pack the plugin into an installable npm tarball under `dist/`.
 *
 * The entrypoint owns the process-level steps: it demands a clean tree, packs
 * with npm into an ignored scratch directory, verifies the produced bytes, and
 * only then publishes the pair into `dist/`. Installing the tarball stays a
 * user action in the Plugins page; this script never writes the profile.
 */

import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  artifactPaths,
  assertFresh,
  BundleError,
  dirtyPaths,
  DIST_DIR,
  expectedPublishedPaths,
  publishVerified,
  readManifest,
  SCRATCH_DIR,
} from '../lib/bundle.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Print the accepted flags. */
function usage() {
  console.log('usage: node scripts/bundle-pack.mjs [--force]')
  console.log('')
  console.log('Packs the current commit into dist/<name>-<version>.tgz and writes')
  console.log('dist/<name>-<version>.json. The tree must be clean.')
  console.log('')
  console.log('  --force   replace an existing artifact pair for this version')
}

/**
 * Run git and return its stdout.
 * @param args - git arguments.
 * @returns stdout.
 */
function git(args) {
  const result = spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new BundleError(`git ${args.join(' ')} failed: ${result.stderr.trim()}`)
  return result.stdout
}

/** Pack, verify and publish the artifact pair. */
function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    usage()
    return
  }
  const unknown = args.filter((argument) => argument !== '--force')
  if (unknown.length > 0) {
    console.error(`bundle-pack: unknown argument ${JSON.stringify(unknown[0])}`)
    console.error('bundle-pack: run with --help for the accepted flags')
    process.exitCode = 2
    return
  }
  const force = args.includes('--force')

  const dirty = dirtyPaths(git(['status', '--porcelain']))
  if (dirty.length > 0) {
    console.error('bundle-pack: the working tree is dirty; commit before packing:')
    for (const path of dirty) console.error(`  ${path}`)
    process.exitCode = 1
    return
  }

  const manifest = readManifest(ROOT)
  const distDir = join(ROOT, DIST_DIR)
  assertFresh(distDir, manifest.name, manifest.version, force)

  const scratch = join(ROOT, SCRATCH_DIR)
  mkdirSync(scratch, { recursive: true })
  try {
    const packed = spawnSync('npm', ['pack', '--json', '--pack-destination', scratch, '--cache', join(ROOT, '.cache', 'npm')], {
      cwd: ROOT,
      encoding: 'utf8',
    })
    if (packed.status !== 0) {
      console.error(packed.stderr.trim())
      process.exitCode = 1
      return
    }
    const file = JSON.parse(packed.stdout)[0].filename
    const bytes = readFileSync(join(scratch, file))
    const revision = git(['rev-parse', 'HEAD']).trim()
    const record = publishVerified(
      distDir,
      manifest,
      bytes,
      expectedPublishedPaths(ROOT, manifest),
      revision,
      new Date().toISOString(),
    )
    const { tarball } = artifactPaths(distDir, manifest.name, manifest.version)
    console.log(`bundle-pack: wrote ${tarball}`)
    console.log(`bundle-pack: revision ${record.revision}, ${record.files} files, sha512 ${record.sha512.slice(0, 16)}...`)
    console.log('bundle-pack: to install, remove the bundle in the Plugins page first, then add this tarball.')
    console.log('bundle-pack: source edits do not change the installed copy; pack and reinstall only when new logic must run.')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error) {
  console.error(`bundle-pack: ${error.message}`)
  process.exitCode = error instanceof BundleError ? 1 : 2
}
