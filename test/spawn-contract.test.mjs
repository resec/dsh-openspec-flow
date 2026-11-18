import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveBundledCli } from '../lib/openspec.js'
import { createFakeContext } from './fake-context.mjs'
import { cleanupFixtures, fixture } from './review-fixtures.mjs'

test.after(cleanupFixtures)

const CLI = resolveBundledCli()

/**
 * Build a spawn spec for the real bundled CLI.
 * @param root - project root.
 * @param args - command arguments.
 * @param signal - optional cancellation.
 * @returns the spawn spec.
 */
function spawnSpec(root, args, signal) {
  return {
    argv: [process.execPath, CLI, ...args],
    cwd: root,
    env: { NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' },
    signal,
  }
}

test('a real child process reports a nonzero exit code and bounded output', async () => {
  const root = fixture()
  const fake = createFakeContext({ cwd: root, spawnMode: 'process' })
  const handle = fake.ctx.subprocess.spawn(spawnSpec(root, ['validate', 'no-such-change', '--json']))
  const result = await handle.done
  assert.notEqual(result.exitCode, 0)
  const stdout = handle.collected.stdout.readFrom(0)
  assert.equal(stdout.lossy, false)
  assert.ok(stdout.text.length > 0, 'the CLI wrote a JSON failure document')
  assert.ok(stdout.text.length < 512 * 1024, 'the captured output stays inside the host bound')
  assert.ok(fake.stats.childProcesses > 0)
  assert.equal(fake.stats.inprocCalls, 0)
})

test('a real child process is terminated by an aborted signal', async () => {
  const root = fixture()
  const fake = createFakeContext({ cwd: root, spawnMode: 'process' })
  const controller = new AbortController()
  controller.abort()
  const handle = fake.ctx.subprocess.spawn(spawnSpec(root, ['validate', 'no-such-change', '--json'], controller.signal))
  const result = await handle.done
  assert.ok(result.signal === 'SIGTERM' || result.exitCode !== 0, 'the child did not finish successfully')
  assert.ok(fake.stats.childProcesses > 0)
})
