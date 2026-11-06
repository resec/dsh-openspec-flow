/**
 * Command-line options and the immutable defaults for one matrix.
 *
 * @module eval/lib/config
 */

import { DEFAULT_AGENTS_HOME, DEFAULT_DSH_HOME, DEFAULT_SOURCE_HOME } from './dsh-home.mjs'
import { RUNS_ROOT } from './paths.mjs'
import { FIXTURES } from './registry.mjs'

/** Defaults shared by a dry run and a real run. */
export const DEFAULT_CONFIG = Object.freeze({
  arms: Object.freeze(['official', 'plugin']),
  runs: 5,
  concurrency: 1,
  timeoutMs: 45 * 60 * 1000,
  maxRounds: 6,
  budgetTokensPerRun: 8_000_000,
  permissionMode: 'workspace-write',
  approvalPolicy: 'never',
  model: Object.freeze({
    provider: 'deepseek-account',
    model: 'deepseek-flash',
    reasoningEffort: 'high',
  }),
  confirmations: Object.freeze({
    create: '确认。请创建该变更并继续。',
    apply: '确认，开始实施。',
    archive: '请归档该变更并完成。',
  }),
})

function requireValue(argv, index, flag) {
  const value = argv[index]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

function positiveInteger(value, flag) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${flag} must be a positive integer`)
  }
  return number
}

/**
 * Parse harness arguments.
 * @param argv - arguments after the script name.
 * @returns parsed options.
 */
export function parseArgs(argv) {
  const options = {
    help: false,
    list: false,
    execute: false,
    fixtures: [],
    arms: null,
    runs: null,
    out: null,
    timeoutMin: null,
    budget: null,
    concurrency: null,
    home: null,
    agentsHome: null,
    sourceHome: null,
    keepHome: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true
        break
      case '--list':
        options.list = true
        break
      case '--execute':
        options.execute = true
        break
      case '--fixture':
        options.fixtures.push(requireValue(argv, (index += 1), arg))
        break
      case '--arms': {
        const raw = requireValue(argv, (index += 1), arg)
        options.arms = raw.split(',').map((value) => value.trim()).filter(Boolean)
        break
      }
      case '--runs':
        options.runs = positiveInteger(requireValue(argv, (index += 1), arg), arg)
        break
      case '--out':
        options.out = requireValue(argv, (index += 1), arg)
        break
      case '--timeout-min':
        options.timeoutMin = positiveInteger(requireValue(argv, (index += 1), arg), arg)
        break
      case '--budget':
        options.budget = positiveInteger(requireValue(argv, (index += 1), arg), arg)
        break
      case '--concurrency':
        options.concurrency = positiveInteger(requireValue(argv, (index += 1), arg), arg)
        break
      case '--home':
        options.home = requireValue(argv, (index += 1), arg)
        break
      case '--agents-home':
        options.agentsHome = requireValue(argv, (index += 1), arg)
        break
      case '--source-home':
        options.sourceHome = requireValue(argv, (index += 1), arg)
        break
      case '--keep-home':
        options.keepHome = true
        break
      default:
        throw new Error(`unknown option: ${arg}`)
    }
  }
  return options
}

/**
 * Resolve parsed options into a complete matrix configuration.
 * @param options - parsed command-line options.
 * @returns the resolved configuration.
 */
export function resolveConfig(options) {
  const known = new Set(FIXTURES.map((fixture) => fixture.id))
  const fixtures = options.fixtures.length > 0 ? options.fixtures : [...known]
  for (const id of fixtures) {
    if (!known.has(id)) throw new Error(`unknown fixture: ${id}`)
  }
  const arms = options.arms ?? [...DEFAULT_CONFIG.arms]
  for (const arm of arms) {
    if (arm !== 'official' && arm !== 'plugin') throw new Error(`unknown arm: ${arm}`)
  }
  return {
    ...DEFAULT_CONFIG,
    fixtures,
    arms,
    runs: options.runs ?? DEFAULT_CONFIG.runs,
    timeoutMs: (options.timeoutMin ?? DEFAULT_CONFIG.timeoutMs / 60_000) * 60_000,
    budgetTokensPerRun: options.budget ?? DEFAULT_CONFIG.budgetTokensPerRun,
    out: options.out ?? RUNS_ROOT,
    concurrency: options.concurrency ?? DEFAULT_CONFIG.concurrency,
    home: options.home ?? DEFAULT_DSH_HOME,
    agentsHome: options.agentsHome ?? DEFAULT_AGENTS_HOME,
    sourceHome: options.sourceHome ?? DEFAULT_SOURCE_HOME,
    keepHome: options.keepHome,
    execute: options.execute,
  }
}

/**
 * Order one replicate with an ABBA pattern so time and provider drift do not
 * favour one arm.
 * @param arms - arms to run.
 * @param replicate - zero-based replicate index.
 * @returns the arm order for this replicate.
 */
export function armOrder(arms, replicate) {
  const forward = [...arms]
  if (replicate % 2 === 0) return forward
  return forward.reverse()
}

/**
 * Build the planned cells for one matrix.
 * @param config - resolved configuration.
 * @returns ordered cells.
 */
export function planCells(config) {
  const cells = []
  for (const fixture of config.fixtures) {
    for (let replicate = 0; replicate < config.runs; replicate += 1) {
      for (const arm of armOrder(config.arms, replicate)) {
        cells.push({ fixture, arm, replicate })
      }
    }
  }
  return cells
}

/** Help text for `node eval/run.mjs --help`. */
export const USAGE = `Usage: node eval/run.mjs [options]

Real-model end-to-end evaluation harness for the official OpenSpec workflow
and this plugin.

Options:
  --fixture <id>       Fixture id; repeatable. Default: every fixture.
  --arms <a,b>         Arms to run: official, plugin. Default: official,plugin.
  --runs <n>           Replicates per fixture and arm. Default: 5.
  --concurrency <n>    Concurrent workers. Default: 1.
  --timeout-min <n>    Wall-clock limit for one run. Default: 45.
  --budget <tokens>    Token budget for one run. Default: 8000000.
  --out <dir>          Output root. Default: eval/runs.
  --home <dir>         Private DSH_HOME. Default: eval/.dsh-home.
  --agents-home <dir>  Private DSH_AGENTS_HOME. Default: eval/.agents-home.
  --source-home <dir>  Home holding .credentials.yaml. Default: ~/.dsh.
  --keep-home          Keep the private roots after the matrix.
  --execute            Run the matrix. Without it, print the plan only.
  --list               List fixtures and exit.
  --help               Print this help and exit.
`
