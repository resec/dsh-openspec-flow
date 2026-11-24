import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { initFixtureRepo } from './git-fixture.mjs'

function scratch(t, name) {
  const base = mkdtempSync(join(tmpdir(), 'git-fixture-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = join(base, name)
  mkdirSync(root)
  return { base, root }
}

test('git init lands in the fixture root', (t) => {
  const { root } = scratch(t, 'repo')
  initFixtureRepo(root)
  assert.equal(readdirSync(join(root, '.git')).includes('HEAD'), true)
})

test('a bare fixture repository lands in the fixture root', (t) => {
  const { root } = scratch(t, 'remote.git')
  initFixtureRepo(root, ['--bare', '-q'])
  assert.equal(existsSync(join(root, 'HEAD')), true)
  assert.equal(existsSync(join(root, '.git')), false)
})

test('an inherited GIT_DIR makes the fixture registration fail and name the fixture root', (t) => {
  const { base, root } = scratch(t, 'fixture')
  const host = join(base, 'host')
  mkdirSync(host)
  initFixtureRepo(host, ['-q'])
  process.env.GIT_DIR = join(host, '.git')
  try {
    assert.throws(
      () => initFixtureRepo(root, ['-b', 'main']),
      (error) => {
        assert.equal(error.code, 'ERR_ASSERTION')
        assert.ok(error.message.includes(root), `the message names the fixture root: ${error.message}`)
        assert.match(error.message, /GIT_DIR/)
        return true
      },
    )
  } finally {
    delete process.env.GIT_DIR
  }
  assert.equal(existsSync(join(root, '.git')), false)
})

test('a failed git init reports the git error', (t) => {
  const { base } = scratch(t, 'present')
  assert.throws(() => initFixtureRepo(join(base, 'missing')), /No such file or directory/)
})
