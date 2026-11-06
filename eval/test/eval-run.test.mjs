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

function clonePlanConfig(execute = false) {
  return {
    fixtures: ['budget-cli'],
    arms: ['official', 'plugin'],
    runs: 1,
    concurrency: 1,
    out: '/tmp/out',
    home: '/tmp/home',
    agentsHome: '/tmp/agents',
    sourceHome: '/tmp/source',
    timeoutMs: 60_000,
    budgetTokensPerRun: 1_000,
    pluginRoot: null,
    pluginSource: 'clone',
    clone: { url: 'git@example.invalid:plugin.git', ref: 'main', destination: '/tmp/plugin' },
    execute,
  }
}

test('prints the resolved plugin root in the plan', async () => {
  const plan = capture()

  assert.equal(await main([], plan.io), 0)

  const line = plan.stdout.find((entry) => entry.includes('plugin:'))
  assert.match(line, /plugin:\s+\/.+\(.+\)/u)
})

test('prints the clone plan without cloning on a dry run', async () => {
  const plan = capture()
  let cloned = false

  const code = await main(['--clone'], {
    ...plan.io,
    resolveConfig: () => clonePlanConfig(false),
    clonePlugin: () => {
      cloned = true
      return { root: '/tmp/cloned', cloned: true, ref: 'main' }
    },
  })

  assert.equal(code, 0)
  assert.match(
    plan.stdout.join('\n'),
    /plugin:\s+clone git@example\.invalid:plugin\.git @ main -> \/tmp\/plugin/u,
  )
  assert.equal(cloned, false)
})

test('clones before executing and passes the root to the runner', async () => {
  const run = capture()
  let clonedWith = null
  let received = null

  const code = await main(['--execute', '--clone'], {
    ...run.io,
    resolveConfig: () => clonePlanConfig(true),
    clonePlugin: (clone) => {
      clonedWith = clone
      return { root: '/tmp/cloned', cloned: true, ref: clone.ref }
    },
    runMatrix: async (config) => {
      received = config
      return { reportPath: '/tmp/report.md' }
    },
  })

  assert.equal(code, 0)
  assert.deepEqual(clonedWith, {
    url: 'git@example.invalid:plugin.git',
    ref: 'main',
    destination: '/tmp/plugin',
  })
  assert.equal(received.pluginRoot, '/tmp/cloned')
  assert.equal(received.pluginSource, 'clone')
})

test('reports a clone failure before the matrix starts', async () => {
  const failure = capture()
  let called = false

  const code = await main(['--execute', '--clone'], {
    ...failure.io,
    resolveConfig: () => clonePlanConfig(true),
    clonePlugin: () => {
      throw new Error('network down')
    },
    runMatrix: async () => {
      called = true
      return { reportPath: '/tmp/report.md' }
    },
  })

  assert.equal(code, 1)
  assert.match(failure.stderr.join('\n'), /network down/u)
  assert.equal(called, false)
})
