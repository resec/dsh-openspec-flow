import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { countEvents, eventsOfType, findSessionLog, readSessionEvents } from '../scripts/lab/inspect/sessions.mjs'

test('a session log is found and decompressed', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-lab-session-'))
  try {
    const directory = join(home, 'sessions', '--project--', 'session-lab')
    mkdirSync(directory, { recursive: true })
    const text = [
      '{"type":"session","id":"session-lab"}',
      '{"type":"turn/start","data":{"turn":1}}',
      '{"type":"turn/end","data":{"turn":1}}',
    ].join('\n')
    writeFileSync(join(directory, 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(`${text}\n`)))

    const path = findSessionLog(home, 'session-lab')
    assert.ok(path !== undefined)
    const events = readSessionEvents(path)
    assert.deepEqual(countEvents(events), { session: 1, 'turn/start': 1, 'turn/end': 1 })
    assert.equal(eventsOfType(events, 'turn/end').length, 1)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
