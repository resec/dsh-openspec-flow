import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import {
  SESSION_FORMAT_VERSION,
  Session,
  appendPluginRecord,
  pluginRecordOf,
} from '@deepseek-ai/dsh-session'
import { CARD_EVENT } from '../lib/review/cards.js'

/** Build a detached Session header. */
function header(id) {
  return { version: SESSION_FORMAT_VERSION, id, createdAt: Date.now(), isSeeded: false }
}

/** Build one detached Session. */
function session(id = 'probe-session') {
  return Session.create(id, [], header(id))
}

/** A record payload with no report body. */
const PAYLOAD = {
  phase: 'review',
  change: 'add-review-round-cards',
  review: 'draft',
  round: 1,
  verdict: 'pass',
  findings: [],
}

test('a card record is committed and stays out of the surface', () => {
  const target = session()
  const seq = appendPluginRecord(target, CARD_EVENT, PAYLOAD)
  assert.equal(target.log.at(-1).seq, seq)
  assert.equal(pluginRecordOf(target.log.at(-1))?.type, CARD_EVENT)
  assert.ok(!target.surface.nodes.includes(seq), 'the card record must not enter the model-visible surface')
  assert.equal(target.surface.nodes.length, 0)
})

test('two copies of the session package cannot share a Session', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-card-probe-'))
  try {
    const copyRoot = join(directory, 'node_modules', '@deepseek-ai')
    cpSync(join(process.cwd(), 'node_modules', '@deepseek-ai'), copyRoot, { recursive: true })
    const copy = await import(pathToFileURL(join(copyRoot, 'dsh-session', 'lib', 'index.js')).href)
    assert.notEqual(copy.Session, Session, 'the fixture must load a second module instance')
    const target = session('mismatch')
    const before = target.log.length
    assert.throws(
      () => copy.appendPluginRecord(target, CARD_EVENT, PAYLOAD),
      TypeError,
      'a record from another copy must fail on the private Session brand',
    )
    assert.equal(target.log.length, before, 'the failed write leaves the log unchanged')
    assert.doesNotThrow(() => appendPluginRecord(target, CARD_EVENT, PAYLOAD))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the session dependency matches engines.dsh', () => {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
  const declared = manifest.dependencies['@deepseek-ai/dsh-session']
  assert.equal(declared, manifest.engines.dsh.replace(/^=/, ''))
})

test('runtime imports allow only Node built-ins, relatives and the session package', () => {
  const root = process.cwd()
  const files = [join(root, 'index.js'), join(root, 'reviewer.js')]
  for (const entry of readdirSync(join(root, 'lib'), { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) files.push(join(entry.parentPath, entry.name))
  }
  const forbidden = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const line of source.split('\n')) {
      const match = line.match(/^\s*(?:import|export)\b[^'"]*?\bfrom\s+'([^']+)'/)
        ?? line.match(/^\s*import\s+'([^']+)'/)
      if (match === null) continue
      const specifier = match[1]
      if (specifier.startsWith('node:') || specifier.startsWith('.')) continue
      if (specifier === '@deepseek-ai/dsh-session') continue
      forbidden.push(`${file.slice(root.length)}: ${specifier}`)
    }
  }
  assert.deepEqual(forbidden, [])
})
