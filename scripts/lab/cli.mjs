#!/usr/bin/env node
/**
 * The lab CLI: doctor, cache, isolated instances, one-shot POC runs and the
 * reusable `test:lab` scenario entrypoint.
 */

import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertCurrentNode } from '../node-version.mjs'
import { INSTANCES, LAB_ROOT, ROOT } from './core/paths.mjs'
import { listCache, pruneCache, removeCache } from './core/cache.mjs'
import { formatDoctor, runDoctor } from './core/doctor.mjs'
import { packPlugin } from './core/install.mjs'
import { createLab, discoverScenarios, runScenarios, selectScenarioFiles } from './index.mjs'
import { run as execute } from './core/process.mjs'

const COMMANDS = ['doctor', 'cache', 'up', 'run', 'exec', 'inspect', 'down', 'test']

// Flags that always take a value, and switches that never do. A switch takes
// no value, so the token after it stays a positional argument: `--offline
// a.scenario.mjs` is the switch plus one scenario path, not a path-valued
// `--offline`. An unknown flag is read as a switch for the same reason.
const VALUE_FLAGS = new Set(['name', 'mode', 'plugin'])
const SWITCHES = new Set(['offline', 'fresh-dsh', 'mock-only', 'include-real-model', 'cleanup', 'all'])

/**
 * Parse `--flag value`, boolean switches and positional arguments.
 * @param argv - arguments after the command.
 * @param options - `keepIsValue` reads `--keep` as a value, which only the
 *   `cache prune` command uses; every other command uses it as a switch.
 * @returns flags and positionals.
 */
export function parseOptions(argv, { keepIsValue = false } = {}) {
  const flags = {}
  const positional = []
  const takesValue = (name) => VALUE_FLAGS.has(name) || (name === 'keep' && keepIsValue)
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (value === '--') {
      positional.push(...argv.slice(index + 1))
      break
    }
    if (value.startsWith('--')) {
      const name = value.slice(2)
      const next = argv[index + 1]
      if (next === undefined || next.startsWith('--') || !takesValue(name)) flags[name] = true
      else {
        flags[name] = next
        index++
      }
    } else {
      positional.push(value)
    }
  }
  return { flags, positional }
}

function statePath(name) {
  return join(INSTANCES, name, 'state.json')
}

function readState(name) {
  const path = statePath(name)
  if (!existsSync(path)) throw new Error(`no lab instance ${name}; run lab up first`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

function pluginMeta(tarball) {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  return {
    tarball: resolve(tarball),
    name: pkg.name,
    version: pkg.version,
    sha512: createHash('sha512').update(readFileSync(resolve(tarball))).digest('base64'),
    dirty: undefined,
    head: undefined,
  }
}

async function packOrUse(flags) {
  if (flags.plugin !== undefined) return pluginMeta(flags.plugin)
  return packPlugin({ root: ROOT, outDir: join(LAB_ROOT, 'tarballs', String(Date.now())) })
}

/**
 * Run the CLI.
 * @param argv - process arguments.
 * @returns exit code.
 */
export async function main(argv = process.argv.slice(2)) {
  const command = argv[0]
  if (command === undefined || command === '--help' || command === '-h') {
    printHelp()
    return 0
  }
  if (!COMMANDS.includes(command)) throw new Error(`unknown command ${command}; use ${COMMANDS.join(', ')}`)
  const { flags, positional } = parseOptions(argv.slice(1), { keepIsValue: command === 'cache' })
  if (command === 'doctor') {
    const result = runDoctor()
    console.log(formatDoctor(result).join('\n'))
    return result.ok ? 0 : 1
  }
  assertCurrentNode()
  if (command === 'cache') return cacheCommand(positional, flags)
  if (command === 'up') return upCommand(flags)
  if (command === 'run') return runCommand(flags, positional)
  if (command === 'exec') return execCommand(flags, positional)
  if (command === 'inspect') return inspectCommand(flags)
  if (command === 'down') return downCommand(flags)
  if (command === 'test') return testCommand(flags, positional)
  return 0
}

function cacheCommand(positional, flags) {
  const sub = positional[0] ?? 'list'
  if (sub === 'list' || sub === 'verify') {
    const entries = listCache()
    if (entries.length === 0) {
      console.log('no DSH cache entries')
      return sub === 'verify' ? 1 : 0
    }
    for (const entry of entries) console.log(`${entry.ok ? 'OK' : 'FAIL'} ${entry.key} ${entry.ok ? '' : entry.reason}`)
    return sub === 'verify' && entries.some((entry) => !entry.ok) ? 1 : 0
  }
  if (sub === 'rm') {
    if (positional[1] === undefined) throw new Error('cache rm needs a key')
    for (const path of removeCache(positional[1])) console.log(`removed ${path}`)
    return 0
  }
  if (sub === 'prune') {
    const removed = pruneCache({ keep: flags.keep === undefined ? [] : String(flags.keep).split(',') })
    for (const path of removed) console.log(`removed ${path}`)
    return 0
  }
  throw new Error(`unknown cache command ${sub}`)
}

async function upCommand(flags) {
  const name = String(flags.name ?? 'default')
  const mode = String(flags.mode ?? 'web')
  if (!['web', 'headless'].includes(mode)) throw new Error('--mode must be web or headless')
  const tarball = await packOrUse(flags)
  const keep = flags.keep === true || mode === 'headless'
  const lab = await createLab({
    pluginTarball: tarball,
    model: 'mock',
    keep,
    offline: flags.offline === true,
    fresh: flags['fresh-dsh'] === true,
  })
  const directory = join(INSTANCES, name)
  mkdirSync(directory, { recursive: true })
  const state = {
    name,
    mode,
    runDir: lab.run.dir,
    home: lab.run.home,
    agentsHome: lab.run.agentsHome,
    dshBin: lab.dsh.bin,
    env: {
      DSH_HOME: lab.run.home,
      DSH_AGENTS_HOME: lab.run.agentsHome,
      LAB_MOCK_KEY: 'lab-mock-key',
      PLAYWRIGHT_BROWSERS_PATH: lab.env.PLAYWRIGHT_BROWSERS_PATH,
    },
    plugin: tarball,
  }
  if (mode === 'web') {
    const web = await lab.web.open()
    state.url = web.url
    state.pid = web.process.child.pid
    writeFileSync(statePath(name), `${JSON.stringify(state, null, 2)}\n`)
    console.log(`lab ${name} web listening at ${web.url}`)
    console.log(`run directory: ${lab.run.dir}`)
    return await new Promise((resolvePromise) => {
      const stop = async () => {
        await lab.close({ passed: true }).catch(() => {})
        rmSync(directory, { recursive: true, force: true })
        resolvePromise(0)
      }
      process.once('SIGINT', stop)
      process.once('SIGTERM', stop)
    })
  }
  writeFileSync(statePath(name), `${JSON.stringify(state, null, 2)}\n`)
  await lab.close({ passed: true, keep: true })
  console.log(`lab ${name} headless prepared at ${lab.run.dir}`)
  return 0
}

async function runCommand(flags, positional) {
  const task = positional.join(' ').trim()
  if (task === '') throw new Error('lab run needs a task after --')
  const tarball = await packOrUse(flags)
  const keep = flags.keep === true
  const lab = await createLab({
    pluginTarball: tarball,
    model: 'mock',
    keep,
    offline: flags.offline === true,
    fresh: flags['fresh-dsh'] === true,
  })
  try {
    const result = await lab.headless.run({ prompt: task })
    process.stdout.write(result.stdout)
    process.stderr.write(result.stderr)
    await lab.close({ passed: result.completed })
    return result.completed ? 0 : 1
  } catch (error) {
    await lab.close({ passed: false, error })
    throw error
  }
}

function execCommand(flags, positional) {
  const state = readState(String(flags.name ?? 'default'))
  const result = execute(process.execPath, [state.dshBin, ...positional], {
    timeoutMs: 10 * 60_000,
    env: { ...process.env, ...state.env },
  })
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  return result.status ?? 1
}

function inspectCommand(flags) {
  const state = readState(String(flags.name ?? 'default'))
  const report = join(state.runDir, 'artifacts', 'report.json')
  if (existsSync(report)) console.log(readFileSync(report, 'utf8'))
  else console.log(JSON.stringify(state, null, 2))
  if (flags.all === true) {
    for (const file of filesUnder(state.runDir)) console.log(file)
  }
  return 0
}

function filesUnder(directory) {
  const out = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) out.push(...filesUnder(path))
    else out.push(path)
  }
  return out.sort()
}

function downCommand(flags) {
  const name = String(flags.name ?? 'default')
  const state = readState(name)
  if (typeof state.pid === 'number') {
    try {
      process.kill(state.pid, 'SIGTERM')
    } catch {
      // The process already exited.
    }
  }
  rmSync(join(INSTANCES, name), { recursive: true, force: true })
  console.log(`stopped lab ${name}`)
  return 0
}

async function testCommand(flags, positional) {
  const doctor = runDoctor()
  if (!doctor.ok) {
    console.error(formatDoctor(doctor).join('\n'))
    return 1
  }
  const discovered = discoverScenarios()
  const files = selectScenarioFiles({ positional, discovered })
  if (files.length === 0) throw new Error('no lab scenarios under test/lab')
  const mockOnly = flags['include-real-model'] !== true
  const plugin = flags.plugin === undefined ? undefined : pluginMeta(flags.plugin)
  const summary = await runScenarios({
    files,
    mockOnly,
    includeReal: flags['include-real-model'] === true,
    plugin,
    keep: flags.keep === true,
    cleanup: flags.cleanup === true,
    offline: flags.offline === true,
    fresh: flags['fresh-dsh'] === true,
  })
  console.log(JSON.stringify({ report: summary.reportPath, results: summary.results }, null, 2))
  return summary.passed ? 0 : 1
}

function printHelp() {
  console.log([
    'usage: npm run lab -- <command> [options]',
    '',
    'commands:',
    '  doctor                       check runtime, pnpm, cache, browser, font, disk',
    '  cache list|verify|prune|rm   manage cached DSH installs',
    '  up --name <n> --mode web|headless [--keep] [--fresh-dsh] [--offline]',
    '  run -- <task>                one headless task in a fresh lab',
    '  exec --name <n> -- <args...> run a DSH command in a named instance',
    '  inspect --name <n>           print the instance report',
    '  down --name <n>              stop a named instance',
    '  test [scenario...] [--mock-only] [--include-real-model] [--cleanup] [--keep]',
  ].join('\n'))
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main()
  } catch (error) {
    console.error(`lab: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
  }
}
