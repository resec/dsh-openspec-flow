#!/usr/bin/env node
/**
 * Development bootstrap after a Node 24 runtime exists.
 *
 * The shell entrypoint owns runtime discovery and the download fallback; this
 * module installs the clone's development dependencies and verifies the gate.
 * It never writes tracked files, shell configuration or DSH profiles.
 */

import { statfsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assertCurrentNode } from './node-version.mjs'
import { MIN_FREE_BYTES } from './bootstrap-lib.mjs'
import { findBrowserExecutable } from './lab/core/doctor.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BROWSERS_PATH = join(ROOT, '.cache', 'lab', 'pw-browsers')

const USAGE = `Usage: scripts/bootstrap.sh [options]

Options:
  --full                 Run npm run verify and npm run test:lab -- --mock-only.
  --skip-test            Skip npm test.
  --skip-playwright      Skip the Playwright Chromium installation.
  --force                Continue past the free-disk threshold.
  --registry URL         npm registry for npm ci and npx.
  --help                 Show this usage and exit.

The script never edits shell rc files, global Git configuration or DSH
profiles, and never runs the CLI's init or update commands.
`

/**
 * Parse the bootstrap options.
 * @param argv - process arguments after the script name.
 * @returns parsed options.
 */
export function parseBootstrapArgs(argv) {
  const options = {
    full: false,
    skipTest: false,
    skipPlaywright: false,
    force: false,
    registry: undefined,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--full': options.full = true; break
      case '--skip-test': options.skipTest = true; break
      case '--skip-playwright': options.skipPlaywright = true; break
      case '--force': options.force = true; break
      case '--help': options.help = true; break
      case '--registry': {
        const value = argv[index + 1]
        if (value === undefined) throw new Error('--registry needs a value')
        options.registry = value
        index += 1
        break
      }
      default:
        throw new Error(`unknown bootstrap option: ${arg}`)
    }
  }
  return options
}

function log(step, total, message) {
  console.log(`bootstrap [${step}/${total}] ${message}`)
}

/**
 * Run one child process, failing the bootstrap on a nonzero exit.
 * @param command - executable.
 * @param args - arguments.
 * @param env - environment additions.
 */
function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status ?? 'unknown'}`)
}

function freeBytes(path) {
  const stats = statfsSync(path)
  return Number(stats.bavail) * Number(stats.bsize)
}

function main() {
  const options = parseBootstrapArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(USAGE)
    return
  }

  assertCurrentNode()

  const free = freeBytes(ROOT)
  if (free < MIN_FREE_BYTES && !options.force) {
    throw new Error(
      `bootstrap needs at least ${Math.round(MIN_FREE_BYTES / 1024 / 1024)} MiB free under ${ROOT}; ${Math.round(free / 1024 / 1024)} MiB available (use --force to continue)`,
    )
  }

  const npmEnv = options.registry === undefined ? {} : { npm_config_registry: options.registry }
  const total = options.full ? 7 : 5

  log(1, total, 'installing locked dependencies')
  run('npm', ['ci'], npmEnv)

  log(2, total, 'installing Git hooks')
  run('npm', ['run', 'hooks:install'], npmEnv)

  if (!options.skipPlaywright && findBrowserExecutable(BROWSERS_PATH) === undefined) {
    log(3, total, 'installing Playwright Chromium')
    run('npx', ['playwright', 'install', 'chromium'], {
      ...npmEnv,
      PLAYWRIGHT_BROWSERS_PATH: BROWSERS_PATH,
    })
  } else {
    log(3, total, 'Playwright Chromium already present or skipped')
  }

  const labEnv = { PLAYWRIGHT_BROWSERS_PATH: BROWSERS_PATH, ...npmEnv }
  log(4, total, 'checking the lab prerequisites')
  run('npm', ['run', 'lab', '--', 'doctor'], labEnv)

  if (!options.skipTest) {
    log(5, total, 'running the test suite')
    run('npm', ['test'], npmEnv)
  } else {
    log(5, total, 'test suite skipped')
  }

  if (options.full) {
    log(6, total, 'running verification')
    run('npm', ['run', 'verify'], npmEnv)
    log(7, total, 'running the reusable lab scenarios')
    run('npm', ['run', 'test:lab', '--', '--mock-only'], labEnv)
  }

  console.log('bootstrap: ready')
  console.log('Next: source scripts/activate.sh to use a clone-local runtime, then npm run verify.')
}

try {
  main()
} catch (error) {
  console.error(`bootstrap: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
