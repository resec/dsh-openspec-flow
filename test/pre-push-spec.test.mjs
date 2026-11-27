import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { resolveBundledCli } from '../lib/openspec.js'

const GATE = fileURLToPath(new URL('../scripts/check-pre-push.mjs', import.meta.url))
const PURPOSE = 'Defines the capability behavior that the pre-push spec test needs.'

/**
 * Write one file under a fixture root.
 * @param root - fixture root.
 * @param path - repository-relative path.
 * @param text - file content.
 */
function writeFile(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

/**
 * Build a project whose main spec passes strict validation.
 * @returns the temporary project root.
 */
function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-pre-push-spec-'))
  writeFile(root, 'openspec/config.yaml', 'schema: spec-driven\n')
  writeFile(root, 'openspec/specs/cap/spec.md', [
    '# cap',
    '',
    '## Purpose',
    '',
    PURPOSE,
    '',
    '## Requirements',
    '',
    '### Requirement: Thing',
    '',
    'The system SHALL do a thing.',
    '',
    '#### Scenario: It works',
    '',
    '- **WHEN** x',
    '- **THEN** y',
    '',
  ].join('\n'))
  return root
}

/**
 * Add one active change with an unchecked task.
 * @param root - fixture root.
 * @param name - change name.
 * @param delta - optional capability delta.
 */
function addChange(root, name, delta) {
  writeFile(root, `openspec/changes/${name}/proposal.md`, `# ${name}\n\n## Why\n\nA thing.\n`)
  writeFile(root, `openspec/changes/${name}/tasks.md`, '# Tasks\n\n- [ ] 1.1 Do it\n')
  if (delta !== undefined) writeFile(root, `openspec/changes/${name}/specs/cap/spec.md`, delta)
}

/**
 * Run node with the given script arguments in the project.
 * @param root - project root.
 * @param args - script and arguments.
 * @returns the spawn result.
 */
function run(root, args) {
  return spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' })
}

test('a main-only push does not validate an unrelated in-progress change', () => {
  const root = makeProject()
  try {
    addChange(root, 'widget', '## ADDED Requirements\n\n### Requirement: Broken\n\nThis delta has no scenario.\n')
    const full = run(root, [resolveBundledCli(), 'validate', '--all', '--strict'])
    assert.notEqual(full.status, 0, 'the fixture delta must fail the full check')
    assert.match(full.stderr, /change\/widget/u)
    assert.match(full.stderr, /must include at least one scenario/u)

    const gate = run(root, [GATE])
    assert.equal(gate.status, 0, gate.stderr)
    assert.match(gate.stdout, /pre-push gate: ok/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
