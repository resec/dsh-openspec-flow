#!/usr/bin/env node
/**
 * Shared Node runtime requirements for the test and coverage entrypoints.
 *
 * The project targets the DSH primary Node major (24) and accepts any
 * concrete version that satisfies `engines.node`. Version managers are never
 * invoked or searched.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/
const COMPARATOR_PATTERN = /^(>=|<=|>|<|=)?v?(\d+)\.(\d+)\.(\d+)$/

export class NodeRequirementError extends Error {
  constructor(message) {
    super(message)
    this.name = 'NodeRequirementError'
    this.exitCode = 2
  }
}

/**
 * Parse a stable Node version such as `v24.22.2`.
 * @param value - version string.
 * @returns parsed version.
 */
export function parseVersion(value) {
  const match = VERSION_PATTERN.exec(String(value))
  if (match === null) {
    throw new NodeRequirementError(`unsupported Node version: ${value}`)
  }
  return {
    raw: String(value),
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

function compare(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1
  }
  return 0
}

function parseComparator(token) {
  const match = COMPARATOR_PATTERN.exec(token)
  if (match === null) {
    throw new NodeRequirementError(`unsupported engines.node comparator: ${token}`)
  }
  return {
    operator: match[1] ?? '=',
    version: {
      major: Number(match[2]),
      minor: Number(match[3]),
      patch: Number(match[4]),
    },
  }
}

function matchesComparator(version, comparator) {
  const result = compare(version, comparator.version)
  switch (comparator.operator) {
    case '>=': return result >= 0
    case '>': return result > 0
    case '<=': return result <= 0
    case '<': return result < 0
    case '=': return result === 0
    default: throw new NodeRequirementError(`unsupported comparator: ${comparator.operator}`)
  }
}

/**
 * Test a concrete version against the comparator subset used by engines.node.
 * Supports full `x.y.z` comparators, space-separated AND, and `||` OR.
 * @param version - concrete version or parsed version.
 * @param range - engines.node range.
 * @returns whether the version satisfies the range.
 */
export function satisfies(version, range) {
  const parsed = typeof version === 'string' ? parseVersion(version) : version
  if (typeof range !== 'string' || range.trim() === '') {
    throw new NodeRequirementError('engines.node must be a non-empty string')
  }
  return range.split('||').some((alternative) => {
    const tokens = alternative.trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) {
      throw new NodeRequirementError(`invalid engines.node range: ${range}`)
    }
    return tokens.every((token) => matchesComparator(parsed, parseComparator(token)))
  })
}

/**
 * Read the primary major and the declared Node range.
 * @param root - repository root.
 * @returns requirements.
 */
export function readNodeRequirements(root = ROOT) {
  const config = JSON.parse(readFileSync(join(root, 'coverage.config.json'), 'utf8'))
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (!Number.isInteger(config.primaryNodeMajor) || config.primaryNodeMajor < 1) {
    throw new NodeRequirementError('coverage.config.json primaryNodeMajor must be a positive integer')
  }
  const range = manifest.engines?.node
  if (typeof range !== 'string' || range.trim() === '') {
    throw new NodeRequirementError('package.json engines.node must be a non-empty string')
  }
  return { primaryMajor: config.primaryNodeMajor, range }
}

/**
 * Assert that one concrete version meets the primary major and range.
 * @param version - concrete version.
 * @param requirements - primary major and range.
 * @returns parsed version.
 */
export function assertPrimaryNode(version, requirements) {
  const parsed = parseVersion(version)
  if (parsed.major !== requirements.primaryMajor) {
    throw new NodeRequirementError(
      `coverage gate requires Node ${requirements.primaryMajor}.x; current ${version} has major ${parsed.major}`,
    )
  }
  if (!satisfies(parsed, requirements.range)) {
    throw new NodeRequirementError(
      `coverage gate requires a version satisfying ${requirements.range}; current ${version}`,
    )
  }
  return parsed
}

/**
 * Assert that the running process meets the project Node requirements.
 * @param options - optional version and repository root.
 * @returns parsed current version.
 */
export function assertCurrentNode({ version = process.version, root = ROOT } = {}) {
  const requirements = readNodeRequirements(root)
  const parsed = assertPrimaryNode(version, requirements)
  return parsed
}

function main() {
  try {
    const requirements = readNodeRequirements()
    assertPrimaryNode(process.version, requirements)
    console.log(`node ${process.version} satisfies primary major ${requirements.primaryMajor} and ${requirements.range}`)
  } catch (error) {
    console.error(`coverage gate: ${error.message}`)
    console.error('Activate a Node 24 runtime that satisfies engines.node and retry; no version manager is invoked automatically.')
    process.exit(error.exitCode ?? 2)
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main()
}
