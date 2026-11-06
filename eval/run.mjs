#!/usr/bin/env node
/**
 * Entry point for the real-model evaluation harness.
 *
 * Without `--execute` this prints the planned matrix and exits without any
 * model call. With `--execute` it loads the orchestrator, which prepares
 * fixtures, runs both arms and writes the report.
 */

import { parseArgs, planCells, resolveConfig, USAGE } from './lib/config.mjs'
import { FIXTURES, fixtureById } from './lib/registry.mjs'

function printPlan(config) {
  const cells = planCells(config)
  console.log('Evaluation plan')
  console.log(`  fixtures: ${config.fixtures.join(', ')}`)
  console.log(`  arms:     ${config.arms.join(', ')}`)
  console.log(`  runs:     ${config.runs} per fixture and arm`)
  console.log(`  workers:  ${config.concurrency}`)
  console.log(`  timeout:  ${config.timeoutMs / 60_000} min per run`)
  console.log(`  budget:   ${config.budgetTokensPerRun} tokens per run`)
  console.log(`  output:   ${config.out}`)
  console.log(`  DSH_HOME: ${config.home}${config.keepHome ? ' (kept)' : ''}`)
  console.log(`  agents:   ${config.agentsHome}`)
  console.log(`  source:   ${config.sourceHome}`)
  console.log(`  cells:    ${cells.length}`)
  for (const fixtureId of config.fixtures) {
    const fixture = fixtureById(fixtureId)
    console.log(`  - ${fixture.id}: ${fixture.title} (${fixture.kind})`)
  }
}

let options
try {
  options = parseArgs(process.argv.slice(2))
} catch (error) {
  console.error(`eval: ${error.message}`)
  console.error('Run `node eval/run.mjs --help` for usage.')
  process.exit(1)
}

if (options.help) {
  console.log(USAGE)
  process.exit(0)
}

if (options.list) {
  for (const fixture of FIXTURES) {
    console.log(`${fixture.id}\t${fixture.kind}\t${fixture.title}`)
  }
  process.exit(0)
}

const config = resolveConfig(options)
if (!config.execute) {
  printPlan(config)
  process.exit(0)
}

try {
  const { runMatrix } = await import('./lib/matrix.mjs')
  const result = await runMatrix(config)
  console.log(`Report: ${result.reportPath}`)
} catch (error) {
  console.error(`eval: ${error.stack ?? error.message}`)
  process.exit(1)
}
