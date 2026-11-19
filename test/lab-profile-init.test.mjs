import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recordProfileInitFailure } from '../scripts/lab/core/profile-init.mjs'

const CAUSE = 'Error: Failed to initialize the profile store'
const FULL_OUTPUT = `${CAUSE}\n    at boot (/opt/dsh/lib/profile-boot.js:164:4)\nNode.js v24.22.2`

/**
 * Create a throwaway artifact directory.
 * @returns the absolute path.
 */
function artifacts() {
  return mkdtempSync(join(tmpdir(), 'dsh-lab-profile-init-'))
}

test('the untouched output lands in the artifact directory and the message names it', () => {
  const directory = artifacts()
  try {
    const message = recordProfileInitFailure({
      profile: 'verify-headless',
      mode: 'headless',
      init: { status: 1, stdout: '', stderr: FULL_OUTPUT },
      artifactsDir: directory,
    })
    const logPath = join(directory, 'init-headless.log')
    assert.equal(readFileSync(logPath, 'utf8'), FULL_OUTPUT)
    assert.equal(message, `could not initialize verify-headless: ${FULL_OUTPUT} (full output: ${logPath})`)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the message prefers stderr and falls back to stdout', () => {
  const directory = artifacts()
  try {
    const fromStderr = recordProfileInitFailure({
      profile: 'verify-web',
      mode: 'web',
      init: { status: 1, stdout: 'out', stderr: 'err' },
      artifactsDir: directory,
    })
    assert.ok(fromStderr.includes('err'))
    assert.equal(readFileSync(join(directory, 'init-web.log'), 'utf8'), 'err')

    const fromStdout = recordProfileInitFailure({
      profile: 'verify-web',
      mode: 'web',
      init: { status: 1, stdout: 'out', stderr: '' },
      artifactsDir: directory,
    })
    assert.ok(fromStdout.includes('out'))
    assert.equal(readFileSync(join(directory, 'init-web.log'), 'utf8'), 'out')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a write failure keeps the diagnosis and names no file', () => {
  const directory = join(artifacts(), 'absent')
  const message = recordProfileInitFailure({
    profile: 'verify-headless',
    mode: 'headless',
    init: { status: 1, stdout: '', stderr: FULL_OUTPUT },
    artifactsDir: directory,
  })
  assert.equal(message, `could not initialize verify-headless: ${FULL_OUTPUT}`)
  assert.equal(message.includes('full output:'), false)
})
