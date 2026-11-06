/**
 * Fixture registry.
 *
 * A synthetic fixture carries its complete template under `eval/fixtures/<id>/`.
 * A git-history fixture carries only the request, acceptance and a manifest;
 * its repository tree is extracted from a pinned commit of this repository.
 *
 * @module eval/lib/registry
 */

import { join } from 'node:path'
import { FIXTURES_ROOT } from './paths.mjs'

/** Every fixture the harness can run. */
export const FIXTURES = Object.freeze([
  Object.freeze({
    id: 'budget-cli',
    title: 'Synthetic monthly-budget feature',
    kind: 'synthetic',
    template: 'budget-cli',
    changeName: 'add-budget-report',
    skillSource: 'plugin',
    source: 'harness fixture',
  }),
  Object.freeze({
    id: 'policy-rule',
    title: 'Scoped OpenSpec flow policy',
    kind: 'git',
    baseCommit: '14dada0baf78522013b68dc7665af52c8a33c0b4',
    referenceCommit: '3f30caffef74ea8743860578cd6db15ba05aedb1',
    changeName: 'add-scoped-flow-policy',
    skillSource: 'plugin',
    source: 'dsh-openspec-flow history',
  }),
  Object.freeze({
    id: 'skill-command-maps',
    title: 'Remove skill command maps',
    kind: 'git',
    baseCommit: '4a3b5077efda33191175185100c6e62e2c680e10',
    referenceCommit: '6fd4df36c5287c135430fb8803910c9caddb8291',
    changeName: 'remove-skill-command-maps',
    skillSource: 'fixture',
    source: 'dsh-openspec-flow history',
  }),
])

/**
 * Resolve one fixture by id.
 * @param id - fixture id.
 * @returns the fixture manifest.
 */
export function fixtureById(id) {
  const fixture = FIXTURES.find((candidate) => candidate.id === id)
  if (fixture === undefined) throw new Error(`unknown fixture: ${id}`)
  return fixture
}

/**
 * Directory holding one fixture's request, acceptance and synthetic template.
 * @param fixture - fixture manifest.
 * @returns absolute directory.
 */
export function fixtureDir(fixture) {
  return join(FIXTURES_ROOT, fixture.id)
}

/**
 * Absolute path to a fixture request.
 * @param fixture - fixture manifest.
 * @returns absolute path.
 */
export function requestPath(fixture) {
  return join(fixtureDir(fixture), 'request.md')
}

/**
 * Directory holding hidden acceptance files.
 * @param fixture - fixture manifest.
 * @returns absolute directory.
 */
export function acceptanceDir(fixture) {
  return join(fixtureDir(fixture), 'acceptance')
}
