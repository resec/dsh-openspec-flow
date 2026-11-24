import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../index.js'
import { createFakeContext } from './fake-context.mjs'
import { createInprocSpawner } from './inproc-cli.mjs'
import { CHANGE, PROBE_ROOT } from './review-fixtures.mjs'

/**
 * Build a spec shaped like the fake context's spawn input.
 * @param overrides - fields to replace.
 * @returns the spawn spec.
 */
function spec(overrides = {}) {
  return {
    argv: ['node', 'openspec', 'status', 'one', '--json'],
    cwd: process.cwd(),
    env: {},
    signal: undefined,
    ...overrides,
  }
}

/**
 * Build a spawner over a fake CLI module.
 * @param runCli - the fake command entry.
 * @param options - window overrides for a fast test.
 * @returns the spawner.
 */
function spawner(runCli, options = {}) {
  return createInprocSpawner({
    load: () => Promise.resolve({ runCli }),
    quietMs: 10,
    noOutputGraceMs: 40,
    deadlineMs: 1_000,
    ...options,
  })
}

test('serializes calls and keeps their outputs apart', async () => {
  const events = []
  const runCli = (argv) => {
    events.push(`start:${argv[3]}`)
    console.log(`out:${argv[3]}`)
    events.push(`end:${argv[3]}`)
  }
  const instance = spawner(runCli)
  const first = instance.spawn(spec({ argv: ['node', 'cli', 'status', 'one', '--json'] }))
  const second = instance.spawn(spec({ argv: ['node', 'cli', 'status', 'two', '--json'] }))
  const [firstDone, secondDone] = await Promise.all([first.done, second.done])
  assert.equal(firstDone.exitCode, 0)
  assert.equal(secondDone.exitCode, 0)
  assert.deepEqual(events, ['start:one', 'end:one', 'start:two', 'end:two'])
  assert.match(first.collected.stdout.readFrom(0).text, /out:one/)
  assert.match(second.collected.stdout.readFrom(0).text, /out:two/)
  assert.doesNotMatch(first.collected.stdout.readFrom(0).text, /out:two/)
})

test('waits for an awaitable command action after output starts', async () => {
  let runCliCalls = 0
  const instance = createInprocSpawner({
    load: () => Promise.resolve({
      runCli: () => {
        runCliCalls += 1
        console.log('runCli')
      },
      program: {
        async parseAsync() {
          console.log('first')
          await new Promise((resolve) => setTimeout(resolve, 60))
          console.log('second')
        },
      },
    }),
    quietMs: 5,
    noOutputGraceMs: 5,
    deadlineMs: 1_000,
  })
  const handle = instance.spawn(spec())
  const result = await handle.done
  assert.equal(result.exitCode, 0)
  assert.equal(runCliCalls, 0)
  assert.equal(handle.collected.stdout.readFrom(0).text, 'first\nsecond\n')
})

test('reports the deadline when an awaitable command never settles', async () => {
  const originalLog = console.log
  const beforeExitCode = process.exitCode
  const beforeCwd = process.cwd()
  const instance = createInprocSpawner({
    load: () => Promise.resolve({
      runCli: () => {
        throw new Error('the fallback must not run')
      },
      program: {
        parseAsync() {
          return new Promise(() => {})
        },
      },
    }),
    deadlineMs: 50,
  })
  const started = Date.now()
  const handle = instance.spawn(spec())
  const result = await handle.done
  const elapsed = Date.now() - started
  assert.equal(result.exitCode, 124)
  assert.ok(elapsed >= 40, `expected the deadline, got ${elapsed} ms`)
  assert.ok(elapsed < 500, `expected a bounded wait, got ${elapsed} ms`)
  assert.equal(console.log, originalLog)
  assert.equal(process.exitCode, beforeExitCode)
  assert.equal(process.cwd(), beforeCwd)
})

test('keeps an explicit exit code when an awaitable call reaches the deadline', async () => {
  const instance = createInprocSpawner({
    load: () => Promise.resolve({
      runCli: () => {
        throw new Error('the fallback must not run')
      },
      program: {
        parseAsync() {
          process.exit(7)
          return new Promise(() => {})
        },
      },
    }),
    deadlineMs: 50,
  })
  const result = await instance.spawn(spec()).done
  assert.equal(result.exitCode, 7)
})

test('releases the queue when an awaitable command is aborted', async () => {
  const originalLog = console.log
  const beforeExitCode = process.exitCode
  const beforeCwd = process.cwd()
  const controller = new AbortController()
  let started
  const parseStarted = new Promise((resolve) => {
    started = resolve
  })
  let calls = 0
  const instance = createInprocSpawner({
    load: () => Promise.resolve({
      runCli: () => {
        throw new Error('the fallback must not run')
      },
      program: {
        parseAsync() {
          calls += 1
          if (calls === 1) {
            started()
            return new Promise(() => {})
          }
          console.log('next')
          return Promise.resolve()
        },
      },
    }),
    deadlineMs: 10_000,
  })
  const first = instance.spawn(spec({ signal: controller.signal }))
  await parseStarted
  controller.abort()
  await assert.rejects(first.done, /aborted/)
  const second = instance.spawn(spec())
  const result = await second.done
  assert.equal(result.exitCode, 0)
  assert.equal(second.collected.stdout.readFrom(0).text, 'next\n')
  assert.equal(console.log, originalLog)
  assert.equal(process.exitCode, beforeExitCode)
  assert.equal(process.cwd(), beforeCwd)
})

test('terminate ends an awaitable command with exit code 143', async () => {
  let started
  const parseStarted = new Promise((resolve) => {
    started = resolve
  })
  let calls = 0
  const instance = createInprocSpawner({
    load: () => Promise.resolve({
      runCli: () => {
        throw new Error('the fallback must not run')
      },
      program: {
        parseAsync() {
          calls += 1
          if (calls === 1) {
            started()
            return new Promise(() => {})
          }
          console.log('next')
          return Promise.resolve()
        },
      },
    }),
    deadlineMs: 10_000,
  })
  const first = instance.spawn(spec())
  await parseStarted
  first.terminate()
  const result = await first.done
  assert.equal(result.exitCode, 143)
  const second = instance.spawn(spec())
  const secondResult = await second.done
  assert.equal(secondResult.exitCode, 0)
  assert.equal(second.collected.stdout.readFrom(0).text, 'next\n')
})

test('falls back to runCli when no awaitable entry is exposed', async () => {
  let calls = 0
  const instance = spawner((argv) => {
    calls += 1
    assert.equal(argv[3], 'one')
  }, { quietMs: 5 })
  const handle = instance.spawn(spec())
  const result = await handle.done
  assert.equal(result.exitCode, 0)
  assert.equal(calls, 1)
})

test('reports an explicit process.exit code from an awaitable command', async () => {
  const instance = createInprocSpawner({
    load: () => Promise.resolve({
      runCli: () => {
        throw new Error('the fallback must not run')
      },
      program: {
        parseAsync() {
          process.exit(9)
        },
      },
    }),
    deadlineMs: 1_000,
  })
  const result = await instance.spawn(spec()).done
  assert.equal(result.exitCode, 9)
})

test('reports a process.exitCode assignment from an awaitable command', async () => {
  const before = process.exitCode
  const instance = createInprocSpawner({
    load: () => Promise.resolve({
      runCli: () => {
        throw new Error('the fallback must not run')
      },
      program: {
        parseAsync() {
          console.log('validation failed')
          process.exitCode = 3
        },
      },
    }),
    deadlineMs: 1_000,
  })
  const handle = instance.spawn(spec())
  const result = await handle.done
  assert.equal(result.exitCode, 3)
  assert.equal(process.exitCode, before)
})

test('captures stdout and stderr separately', async () => {
  const instance = spawner(() => {
    console.log('out')
    console.error('err')
  })
  const handle = instance.spawn(spec())
  await handle.done
  assert.equal(handle.collected.stdout.readFrom(0).text, 'out\n')
  assert.equal(handle.collected.stderr.readFrom(0).text, 'err\n')
})

test('reports an explicit process.exit code and keeps the test process alive', async () => {
  const instance = spawner(() => {
    process.exit(7)
  })
  const handle = instance.spawn(spec())
  const result = await handle.done
  assert.equal(result.exitCode, 7)
  assert.equal(result.signal, null)
})

test('reports a process.exitCode assignment and restores the process code', async () => {
  const before = process.exitCode
  const instance = spawner(() => {
    console.log('validation failed')
    process.exitCode = 3
  })
  const handle = instance.spawn(spec())
  const result = await handle.done
  assert.equal(result.exitCode, 3)
  assert.equal(process.exitCode, before)
})

test('rejects an aborted call', async () => {
  const controller = new AbortController()
  const instance = spawner(() => {
    console.log('slow')
  }, { quietMs: 1_000 })
  const handle = instance.spawn(spec({ signal: controller.signal }))
  controller.abort()
  await assert.rejects(handle.done, /aborted/)
})

test('rejects a call whose signal was already aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const instance = spawner(() => {
    console.log('never')
  })
  const handle = instance.spawn(spec({ signal: controller.signal }))
  await assert.rejects(handle.done, /aborted/)
})

test('completes after the quiet window', async () => {
  const instance = spawner(() => {
    console.log('done')
  }, { quietMs: 40 })
  const started = Date.now()
  const handle = instance.spawn(spec())
  await handle.done
  const elapsed = Date.now() - started
  assert.ok(elapsed >= 35, `expected the quiet window, got ${elapsed} ms`)
  assert.ok(elapsed < 500, `expected a bounded wait, got ${elapsed} ms`)
})

test('completes a silent command after the no-output grace', async () => {
  const instance = spawner(() => {}, { noOutputGraceMs: 50 })
  const started = Date.now()
  const handle = instance.spawn(spec())
  const result = await handle.done
  const elapsed = Date.now() - started
  assert.equal(result.exitCode, 0)
  assert.ok(elapsed >= 45, `expected the grace window, got ${elapsed} ms`)
})

test('loads the CLI once across calls', async () => {
  let loads = 0
  const instance = createInprocSpawner({
    load: () => {
      loads += 1
      return Promise.resolve({ runCli: () => console.log('x') })
    },
    quietMs: 5,
    noOutputGraceMs: 20,
    deadlineMs: 1_000,
  })
  await instance.spawn(spec()).done
  await instance.spawn(spec()).done
  assert.equal(loads, 1)
})

test('reuses the pinned program for awaited real CLI calls', async () => {
  const module = await import('@fission-ai/openspec')
  assert.equal(typeof module.program?.parseAsync, 'function')
  const root = mkdtempSync(join(tmpdir(), 'inproc-real-'))
  cpSync(PROBE_ROOT, join(root, 'openspec'), { recursive: true })
  try {
    const instance = createInprocSpawner({
      load: () => Promise.resolve({
        program: module.program,
        runCli: () => {
          throw new Error('the polling fallback must not run')
        },
      }),
    })
    const first = instance.spawn(spec({
      argv: ['node', 'openspec', 'list', '--json'],
      cwd: root,
    }))
    const second = instance.spawn(spec({
      argv: ['node', 'openspec', 'status', '--change', CHANGE, '--json'],
      cwd: root,
    }))
    const [firstResult, secondResult] = await Promise.all([first.done, second.done])
    assert.equal(firstResult.exitCode, 0)
    assert.equal(secondResult.exitCode, 0)
    const firstText = first.collected.stdout.readFrom(0).text
    const secondText = second.collected.stdout.readFrom(0).text
    const listed = JSON.parse(firstText)
    const status = JSON.parse(secondText)
    assert.equal(listed.changes[0].name, CHANGE)
    assert.equal(status.changeName, CHANGE)
    assert.doesNotMatch(firstText, /"changeName"/)
    assert.doesNotMatch(secondText, /"changes"/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the fake context runs CLI calls in-process by default', async () => {
  const root = mkdtempSync(join(tmpdir(), 'inproc-context-'))
  cpSync(PROBE_ROOT, join(root, 'openspec'), { recursive: true })
  try {
    const fake = createFakeContext({ cwd: root })
    apply(fake.ctx, { timeoutMs: 30_000 })
    const tool = fake.tools.get('openspec_inspect')
    assert.ok(tool, 'openspec_inspect is registered')
    await tool.execute({ action: 'status', change: 'add-dark-mode' }, {
      agent: { id: 'inproc-context' },
      signal: new AbortController().signal,
    })
    assert.ok(fake.stats.inprocCalls > 0, 'the CLI call ran in-process')
    assert.equal(fake.stats.childProcesses, 0)
    assert.equal(fake.stats.spawns, fake.stats.inprocCalls)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a failing setup rejects the call and keeps the queue alive', async () => {
  const instance = spawner(() => {
    console.log('x')
  })
  const bad = instance.spawn(spec({ cwd: join(process.cwd(), 'inproc-no-such-directory') }))
  await assert.rejects(bad.done)
  const good = instance.spawn(spec())
  await good.done
  assert.equal(good.collected.stdout.readFrom(0).text, 'x\n')
})
