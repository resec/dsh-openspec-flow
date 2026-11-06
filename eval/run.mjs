#!/usr/bin/env node
/**
 * Entry point for the real-model evaluation harness.
 *
 * Without `--execute` this prints the planned matrix and exits without any
 * model call. With `--execute` it loads the orchestrator, which prepares
 * fixtures, runs both arms and writes the report.
 *
 * The entrypoint is importable so tests can exercise argument handling, the
 * help/list/plan paths, and the execute boundary with an injected runner.
 */

import { pathToFileURL } from 'node:url'
import { parseArgs, planCells, resolveConfig, USAGE } from './lib/config.mjs'
import { clonePlugin } from './lib/plugin.mjs'
import { FIXTURES, fixtureById } from './lib/registry.mjs'

function printPlan(config, write) {
  const cells = planCells(config)
  write('Evaluation plan')
  write(`  fixtures: ${config.fixtures.join(', ')}`)
  write(`  arms:     ${config.arms.join(', ')}`)
  write(`  runs:     ${config.runs} per fixture and arm`)
  write(`  workers:  ${config.concurrency}`)
  write(`  timeout:  ${config.timeoutMs / 60_000} min per run`)
  write(`  budget:   ${config.budgetTokensPerRun} tokens per run`)
  write(`  output:   ${config.out}`)
  write(`  DSH_HOME: ${config.home}${config.keepHome ? ' (kept)' : ''}`)
  write(`  agents:   ${config.agentsHome}`)
  write(`  source:   ${config.sourceHome}`)
  if (config.pluginRoot !== null) {
    write(`  plugin:   ${config.pluginRoot} (${config.pluginSource})`)
  } else {
    write(`  plugin:   clone ${config.clone.url} @ ${config.clone.ref} -> ${config.clone.destination}`)
  }
  write(`  cells:    ${cells.length}`)
  for (const fixtureId of config.fixtures) {
    const fixture = fixtureById(fixtureId)
    write(`  - ${fixture.id}: ${fixture.title} (${fixture.kind})`)
  }
}

/**
 * Run the harness entrypoint.
 * @param argv - arguments after the script name.
 * @param io - output sinks, an optional matrix runner, configuration resolver and clone helper.
 * @returns process exit code.
 */
export async function main(argv = process.argv.slice(2), io = {}) {
  const write = io.stdout ?? console.log
  const writeError = io.stderr ?? console.error

  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    writeError(`eval: ${error.message}`)
    writeError('Run `node eval/run.mjs --help` for usage.')
    return 1
  }

  if (options.help) {
    write(USAGE)
    return 0
  }

  if (options.list) {
    for (const fixture of FIXTURES) {
      write(`${fixture.id}\t${fixture.kind}\t${fixture.title}`)
    }
    return 0
  }

  let config
  try {
    const resolve = io.resolveConfig ?? resolveConfig
    config = resolve(options)
  } catch (error) {
    writeError(`eval: ${error.message}`)
    return 1
  }

  if (!config.execute) {
    printPlan(config, write)
    return 0
  }

  if (config.pluginRoot === null) {
    try {
      const cloned = (io.clonePlugin ?? clonePlugin)(config.clone)
      config = { ...config, pluginRoot: cloned.root, pluginSource: 'clone' }
    } catch (error) {
      writeError(`eval: ${error.message}`)
      return 1
    }
  }

  try {
    const runner = io.runMatrix ?? (await import('./lib/matrix.mjs')).runMatrix
    const result = await runner(config)
    write(`Report: ${result.reportPath}`)
    return 0
  } catch (error) {
    writeError(`eval: ${error.stack ?? error.message}`)
    return 1
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await main()
}
