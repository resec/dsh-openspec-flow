import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { isGeneratedSkillPath } from '../scripts/check-generated-skills.mjs'
import { PROBE_ROOT } from './review-fixtures.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

test('the tracked tree carries no generated OpenSpec skill copies', (t) => {
  const result = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    t.skip('git is unavailable')
    return
  }
  const files = result.stdout.split('\n').filter(Boolean)
  const generated = files.filter((path) => isGeneratedSkillPath(path))
  assert.deepEqual(generated, [], `generated skill paths are tracked: ${generated.join(', ')}`)
  assert.ok(files.includes('skills/openspec-propose/SKILL.md'), 'the root plugin skill is missing')
})

test('review probe fixtures stay inside the repository and are tracked', (t) => {
  assert.ok(PROBE_ROOT.startsWith(ROOT), `fixture path escapes the repository: ${PROBE_ROOT}`)

  const testDir = fileURLToPath(new URL('.', import.meta.url))
  const offenders = readdirSync(testDir)
    .filter((name) => name.endsWith('.test.mjs') && name !== 'repo-layout.test.mjs')
    .filter((name) => {
      const source = readFileSync(join(testDir, name), 'utf8')
      return source.includes('.probe') || /(?:const|let|var)\s+PROBE_ROOT\b/.test(source)
    })
  assert.deepEqual(offenders, [], `test modules define their own probe path: ${offenders.join(', ')}`)

  const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: ROOT, encoding: 'utf8' })
  if (inside.error || inside.status !== 0) {
    t.skip('git is unavailable')
    return
  }

  const prefix = 'test/fixtures/probe/openspec'
  const tracked = spawnSync('git', ['ls-files', prefix], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(tracked.status, 0, `git ls-files failed: ${tracked.stderr}`)
  const trackedPaths = tracked.stdout.trim().split('\n').filter(Boolean).sort()
  const fixturePaths = readdirSync(PROBE_ROOT, { recursive: true })
    .filter((name) => statSync(join(PROBE_ROOT, name)).isFile())
    .map((name) => `${prefix}/${name}`.replaceAll('\\', '/'))
    .sort()
  assert.equal(fixturePaths.length, 8, `unexpected fixture file count: ${fixturePaths.length}`)
  assert.deepEqual(trackedPaths, fixturePaths, 'every fixture file must be tracked')
})
