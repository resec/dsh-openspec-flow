/**
 * Packaging orchestration: the process-level steps behind the CLI entrypoint.
 *
 * `scripts/bundle-pack.mjs` is a thin wrapper over {@link runPack}. Keeping
 * the orchestration here lets the tests drive it with an injected `exec`, so
 * the dirty-tree refusal, the existing-artifact refusal, the scratch cleanup
 * and the exit codes have regression coverage without a live profile.
 *
 * @module dsh-openspec-flow/pack
 */

import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
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
  splitDirtyPaths,
  tarballPaths,
  untrackedPaths,
} from './bundle.js'

/** Lines the entrypoint prints for `--help`. */
export const USAGE_LINES = [
  'usage: node scripts/bundle-pack.mjs [--force]',
  '',
  'Packs the current commit into dist/<name>-<version>/<name>-<version>.tgz',
  'and writes the .json metadata beside it. Uncommitted changes outside',
  'openspec/ are refused; uncommitted paths under openspec/ are ignored.',
  'An ignored file a files glob carries into the tarball is reported and',
  'sets the metadata dirty flag.',
  '',
  '  --force   replace an existing artifact pair for this version',
]

/**
 * Run one command through the injected executor.
 * @param exec - command runner.
 * @param command - executable name.
 * @param args - arguments.
 * @param options - spawn options.
 * @returns the command result.
 */
function run(exec, command, args, options) {
  const result = exec(command, args, options)
  if (result.status !== 0) {
    throw new BundleError(`${command} ${args.join(' ')} failed: ${String(result.stderr ?? '').trim()}`)
  }
  return result
}

/**
 * Pack, verify and publish the artifact pair.
 *
 * @param options - run inputs.
 * @param options.root - repository root.
 * @param options.argv - command-line arguments after the script name.
 * @param options.exec - command runner; defaults to `spawnSync`.
 * @param options.clock - timestamp source; defaults to the current date.
 * @returns the exit code and the lines to print.
 */
export function runPack({ root, argv, exec = spawnSync, clock = () => new Date() }) {
  const lines = []
  const write = (text, error = false) => lines.push({ text, error })

  if (argv.includes('--help') || argv.includes('-h')) {
    for (const line of USAGE_LINES) write(line)
    return { code: 0, lines }
  }
  const unknown = argv.filter((argument) => argument !== '--force')
  if (unknown.length > 0) {
    write(`bundle-pack: unknown argument ${JSON.stringify(unknown[0])}`, true)
    write('bundle-pack: run with --help for the accepted flags', true)
    return { code: 2, lines }
  }
  const force = argv.includes('--force')
  const scratch = join(root, SCRATCH_DIR)

  try {
    const dirty = dirtyPaths(run(exec, 'git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).stdout)
    const { blocking, ignored } = splitDirtyPaths(dirty)
    if (ignored.length > 0) {
      write('bundle-pack: ignoring uncommitted OpenSpec paths:')
      for (const path of ignored) write(`  ${path}`)
    }
    if (blocking.length > 0) {
      write('bundle-pack: the working tree is dirty; commit before packing:', true)
      for (const path of blocking) write(`  ${path}`, true)
      return { code: 1, lines }
    }

    const manifest = readManifest(root)
    const distDir = join(root, DIST_DIR)
    assertFresh(distDir, manifest.name, manifest.version, force)

    // `-z` separates the paths with NUL, so git prints none of them quoted.
    const tracked = run(exec, 'git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' }).stdout.split('\0').filter(Boolean)
    mkdirSync(scratch, { recursive: true })
    const packed = run(
      exec,
      'npm',
      ['pack', '--json', '--pack-destination', scratch, '--cache', join(root, '.cache', 'npm')],
      { cwd: root, encoding: 'utf8' },
    )
    const file = JSON.parse(packed.stdout)[0].filename
    const bytes = readFileSync(join(scratch, file))
    const revision = run(exec, 'git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim()
    const record = publishVerified(
      distDir,
      manifest,
      bytes,
      expectedPublishedPaths(root, manifest, tracked),
      revision,
      clock().toISOString(),
      tracked,
    )
    const untracked = untrackedPaths(tarballPaths(bytes), tracked)
    if (untracked.length > 0) {
      write('bundle-pack: the tarball carries paths HEAD does not track; the metadata records dirty true:')
      for (const path of untracked) write(`  ${path}`)
    }
    const { tarball } = artifactPaths(distDir, manifest.name, manifest.version)
    write(`bundle-pack: wrote ${tarball}`)
    write(`bundle-pack: revision ${record.revision}, ${record.files} files, sha512 ${record.sha512.slice(0, 16)}...`)
    write('bundle-pack: to install, remove the bundle in the Plugins page first, then add this tarball.')
    write('bundle-pack: source edits do not change the installed copy; pack and reinstall only when new logic must run.')
    return { code: 0, lines }
  } catch (error) {
    write(`bundle-pack: ${error.message}`, true)
    return { code: error instanceof BundleError ? 1 : 2, lines }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}
