import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diffFingerprints, hostFingerprint } from '../scripts/lab/core/host-guard.mjs'

test('the host fingerprint covers profile configuration but not generated or session files', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-lab-home-'))
  try {
    const profile = join(home, 'profiles', 'web')
    mkdirSync(profile, { recursive: true })
    writeFileSync(join(profile, 'package.json'), '{}')
    writeFileSync(join(profile, 'cordis.patch.yml'), '[]\n')
    writeFileSync(join(profile, 'cordis.yml'), '[]\n')
    writeFileSync(join(profile, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    writeFileSync(join(home, '.credentials.yaml'), 'secret: value\n')
    mkdirSync(join(home, 'sessions'), { recursive: true })

    const fingerprint = hostFingerprint(home)
    assert.ok('profiles/web/package.json' in fingerprint)
    assert.ok('profiles/web/cordis.patch.yml' in fingerprint)
    assert.ok('.credentials.yaml' in fingerprint)
    assert.equal('profiles/web/cordis.yml' in fingerprint, false)
    assert.equal('sessions' in fingerprint, false)

    writeFileSync(join(profile, 'package.json'), '{"changed":true}')
    const after = hostFingerprint(home)
    const difference = diffFingerprints(fingerprint, after)
    assert.deepEqual(difference.changed, ['profiles/web/package.json'])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
