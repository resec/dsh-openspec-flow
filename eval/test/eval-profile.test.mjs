import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  assertToolSurface,
  checkDump,
  dumpConfig,
  parseDump,
  readDumpFixture,
} from '../lib/profile.mjs'

const MODEL = {
  provider: 'deepseek-account',
  model: 'deepseek-flash',
  reasoningEffort: 'high',
}

function summary(names) {
  return {
    toolSurface: {
      names,
      openspecTools: names.filter((name) => name.startsWith('openspec_')),
      hasWeb: names.includes('web_search') && names.includes('web_fetch'),
      hasSubagent: names.some((name) =>
        ['subagent', 'subagent_fork', 'send_message', 'list_agents', 'interrupt_agent', 'workflow'].includes(name),
      ),
    },
  }
}

test('accepts the recorded plugin-arm dump', () => {
  const entries = parseDump(readDumpFixture('headless-plugin.yml'))
  assert.deepEqual(checkDump(entries, { arm: 'plugin', model: MODEL }), [])
  assert.equal(entries.get('openspec-flow').disabled, false)
  assert.equal(entries.get('tool-workflow').disabled, true)
})

test('accepts the recorded official-arm dump', () => {
  const entries = parseDump(readDumpFixture('headless-official.yml'))
  assert.deepEqual(checkDump(entries, { arm: 'official', model: MODEL }), [])
  assert.equal(entries.get('openspec-flow').disabled, true)
})

test('rejects a plugin row that is disabled in the plugin arm', () => {
  const entries = parseDump(readDumpFixture('headless-plugin.yml'))
  entries.get('openspec-flow').disabled = true
  assert.match(checkDump(entries, { arm: 'plugin', model: MODEL }).join('\n'), /must be enabled/u)
})

test('rejects a model that differs from the recorded one', () => {
  const entries = parseDump(readDumpFixture('headless-plugin.yml'))
  const issues = checkDump(entries, {
    arm: 'plugin',
    model: { ...MODEL, reasoningEffort: 'max' },
  })
  assert.match(issues.join('\n'), /reasoningEffort/u)
})

test('checks the recorded tool surface', () => {
  const base = ['bash', 'read', 'write', 'web_search', 'web_fetch', 'skill']
  const openspec = Array.from({ length: 13 }, (_, index) => `openspec_tool_${index}`)

  assert.deepEqual(assertToolSurface(summary(base), 'official'), [])
  assert.deepEqual(assertToolSurface(summary([...base, ...openspec]), 'plugin'), [])
  assert.match(assertToolSurface(summary([...base, ...openspec]), 'official').join('\n'), /official arm exposes/u)
  assert.match(assertToolSurface(summary(base), 'plugin').join('\n'), /only 0 openspec tools/u)
})

test('rejects subagent and missing web tools', () => {
  const names = ['bash', 'subagent', 'workflow']
  const issues = assertToolSurface(summary(names), 'official')
  assert.match(issues.join('\n'), /subagent tools/u)
  assert.match(issues.join('\n'), /web tools are missing/u)
})

test('passes the environment overlay to dump-config', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-profile-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const bin = join(dir, 'fake-dsh.mjs')
  writeFileSync(bin, '#!/usr/bin/env node\nprocess.stdout.write(process.env.DSH_HOME ?? "unset")\n')
  chmodSync(bin, 0o755)

  assert.equal(
    dumpConfig({ arm: 'official', model: MODEL, dshBin: bin, env: { DSH_HOME: '/tmp/isolated' } }),
    '/tmp/isolated',
  )
})
