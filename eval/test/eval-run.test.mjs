import assert from 'node:assert/strict'
import test from 'node:test'
import { main } from '../run.mjs'

function capture() {
  const stdout = []
  const stderr = []
  return {
    stdout,
    stderr,
    io: {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    },
  }
}

test('prints usage and fixture lists without a model call', async () => {
  const help = capture()
  assert.equal(await main(['--help'], help.io), 0)
  assert.match(help.stdout.join('\n'), /Usage|usage/)

  const list = capture()
  assert.equal(await main(['--list'], list.io), 0)
  assert.ok(list.stdout.length > 0)
  assert.match(list.stdout[0], /\t/)
})

test('prints the dry-run plan and reports configuration errors', async () => {
  const plan = capture()
  assert.equal(await main([], plan.io), 0)
  assert.match(plan.stdout[0], /Evaluation plan/)

  const kept = capture()
  assert.equal(await main(['--keep-home'], kept.io), 0)
  assert.match(kept.stdout.join('\n'), /\(kept\)/)

  const unknown = capture()
  assert.equal(await main(['--unknown'], unknown.io), 1)
  assert.match(unknown.stderr[0], /unknown option/)

  const fixture = capture()
  assert.equal(await main(['--fixture', 'missing'], fixture.io), 1)
  assert.match(fixture.stderr[0], /unknown fixture/)
})

test('executes through an injected runner without a real model call', async () => {
  const success = capture()
  let received = null
  const code = await main(['--execute'], {
    ...success.io,
    runMatrix: async (config) => {
      received = config
      return { reportPath: '/tmp/report.md' }
    },
  })
  assert.equal(code, 0)
  assert.equal(received.execute, true)
  assert.match(success.stdout.at(-1), /Report: \/tmp\/report\.md/)

  const failure = capture()
  const failed = await main(['--execute'], {
    ...failure.io,
    runMatrix: async () => {
      throw new Error('runner failed')
    },
  })
  assert.equal(failed, 1)
  assert.match(failure.stderr.join('\n'), /runner failed/)

  const plain = capture()
  const plainFailed = await main(['--execute'], {
    ...plain.io,
    runMatrix: async () => {
      throw { code: 'plain' }
    },
  })
  assert.equal(plainFailed, 1)
  assert.match(plain.stderr.join('\n'), /undefined/)
})


test('falls back to console output when no sinks are supplied', async () => {
  const logs = []
  const errors = []
  const log = console.log
  const error = console.error
  console.log = (line) => logs.push(line)
  console.error = (line) => errors.push(line)
  try {
    assert.equal(await main(['--help']), 0)
    assert.equal(await main(['--unknown']), 1)
  } finally {
    console.log = log
    console.error = error
  }
  assert.ok(logs.length > 0)
  assert.match(errors[0], /unknown option/)
})
