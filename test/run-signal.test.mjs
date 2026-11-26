import assert from 'node:assert/strict'
import test from 'node:test'
import {
  finishRun,
  runChildSpawnOptions,
  signalRunChild,
  spawnRunChild,
  stopRunChild,
  usesProcessGroup,
} from '../scripts/run-signal.mjs'

/** Marker carried by every child this file starts, so a leftover is visible. */
const PROBE = 'run-signal-probe'

/** Build a child script that carries the probe marker in its command line. */
function childCode(body) {
  return `// ${PROBE}\n${body}`
}

/** Report whether a pid still exists. */
function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Kill a pid without failing when it is already gone. */
function kill(pid) {
  if (pid === undefined) return
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // Already gone.
  }
}

/** Poll until a predicate holds or the bound expires. */
async function waitUntil(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/** Resolve when the child has exited. */
function exited(child) {
  return new Promise((resolve) => child.once('exit', resolve))
}

/**
 * Resolve with the first complete stdout line a child writes that `matches`.
 *
 * The promise settles once, and the listener is removed when the line
 * arrives. The missing-line verdict waits for the child's `close`, which
 * follows its stdio streams, so a final chunk written just before the exit is
 * still scanned. A child that closes first rejects with `label`, so a caller
 * waiting for a readiness line reports which line never arrived.
 *
 * @param child - the child whose stdout carries the line.
 * @param label - the line's name in the rejection message.
 * @param matches - predicate over one complete line, without its newline.
 * @returns the matching line.
 */
function readLine(child, label, matches) {
  return new Promise((resolve, reject) => {
    let buffer = ''
    let settled = false
    const settle = () => {
      settled = true
      child.stdout.off('data', onData)
      child.off('close', onClose)
    }
    const scan = () => {
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (matches(line)) return line
        newline = buffer.indexOf('\n')
      }
      return undefined
    }
    const onData = (chunk) => {
      if (settled) return
      buffer += chunk
      const line = scan()
      if (line === undefined) return
      settle()
      resolve(line)
    }
    const onClose = () => {
      if (settled) return
      const line = scan()
      settle()
      if (line === undefined) reject(new Error(`the child exited before it wrote ${label}`))
      else resolve(line)
    }
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', onData)
    child.once('close', onClose)
  })
}

test('spawnRunChild starts the leader of its own process group', async (t) => {
  const child = spawnRunChild(process.execPath, ['-e', childCode('setTimeout(() => {}, 60000)')], {
    stdio: 'ignore',
  })
  t.after(() => kill(child.pid))
  assert.equal(process.kill(-child.pid, 0), true, 'the child leads a signalable group')
  await stopRunChild(child)
  await waitUntil(() => !alive(child.pid))
  assert.equal(alive(child.pid), false, 'the group is gone after the stop')
})

test('stopRunChild kills a grandchild in the same group', async (t) => {
  const child = spawnRunChild(
    process.execPath,
    [
      '-e',
      childCode(
        "const { spawn } = require('node:child_process')\n" +
          "const grandchild = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000) // " +
          PROBE +
          "'], { stdio: 'ignore' })\n" +
          "process.stdout.write(`${grandchild.pid}\\n`)\n" +
          'setTimeout(() => {}, 60000)',
      ),
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  )
  const grandchildPid = Number(
    await readLine(child, 'the grandchild pid', (line) => /^\d+$/.test(line)),
  )
  t.after(() => kill(grandchildPid))
  assert.equal(alive(grandchildPid), true, 'the grandchild is running before the stop')
  await stopRunChild(child)
  await waitUntil(() => !alive(grandchildPid) && !alive(child.pid))
  assert.equal(alive(grandchildPid), false, 'the grandchild died with the group')
  assert.equal(alive(child.pid), false, 'the child died with the group')
})

test('readLine rejects when the child exits before the line', async () => {
  const child = spawnRunChild(process.execPath, ['-e', childCode('')], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  await assert.rejects(
    readLine(child, 'the readiness line', (line) => line === 'ready'),
    /the child exited before it wrote the readiness line/,
  )
})

test('readLine reports a line written just before the child exits', async () => {
  const child = spawnRunChild(
    process.execPath,
    ['-e', childCode("process.stdout.write('last line\\n')")],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  )
  assert.equal(
    await readLine(child, 'the last line', (line) => line === 'last line'),
    'last line',
  )
})

test('stopRunChild escalates past a descendant that ignores SIGTERM', async (t) => {
  const child = spawnRunChild(
    process.execPath,
    [
      '-e',
      childCode(
        "process.on('SIGTERM', () => {})\n" +
          "process.stdout.write('ready\\n')\n" +
          'setTimeout(() => {}, 60000)',
      ),
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  )
  t.after(() => kill(child.pid))
  await readLine(child, 'the SIGTERM readiness line', (line) => line === 'ready')
  signalRunChild(child, 'SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(alive(child.pid), true, 'the child survives the ignored SIGTERM')
  await stopRunChild(child)
  await waitUntil(() => !alive(child.pid))
  assert.equal(alive(child.pid), false, 'the SIGKILL reaches the ignoring child')
})

test('stopRunChild tolerates a group that is already gone', async () => {
  const child = spawnRunChild(process.execPath, ['-e', childCode('')], { stdio: 'ignore' })
  await exited(child)
  await stopRunChild(child)
  await stopRunChild(undefined)
  assert.equal(alive(child.pid), false)
})

test('finishRun stops before it removes the root', async () => {
  const order = []
  await finishRun(
    { pid: -1 },
    () => order.push('finish'),
    async () => order.push('stop'),
  )
  assert.deepEqual(order, ['stop', 'finish'])
})

test('finishRun without a child only removes the root', async () => {
  const order = []
  let stopped = false
  await finishRun(
    undefined,
    () => order.push('finish'),
    async () => {
      stopped = true
      order.push('stop')
    },
  )
  assert.equal(stopped, false, 'no child means no stop step')
  assert.deepEqual(order, ['finish'])
})

test('finishRun still removes the root when the stop fails', async () => {
  const order = []
  await assert.rejects(
    finishRun(
      { pid: -1 },
      () => order.push('finish'),
      async () => {
        throw new Error('stop failed')
      },
    ),
    /stop failed/,
  )
  assert.deepEqual(order, ['finish'], 'the cleanup ran despite the stop failure')
})

test('stopRunChild tolerates a child that never spawned', async () => {
  await stopRunChild({ pid: undefined })
  await stopRunChild(undefined)
})

test('a platform without process groups signals the direct child only', async () => {
  assert.equal(usesProcessGroup('linux'), true)
  assert.equal(usesProcessGroup('darwin'), true)
  assert.equal(usesProcessGroup('win32'), false)
  assert.deepEqual(runChildSpawnOptions({ cwd: '/repo' }, 'win32'), { cwd: '/repo' })
  assert.equal(runChildSpawnOptions({ cwd: '/repo' }, 'linux').detached, true)

  const signals = []
  const fake = {
    pid: 999999,
    kill(signal) {
      signals.push(signal)
      return true
    },
  }
  assert.equal(signalRunChild(fake, 'SIGTERM', 'win32'), true)
  await stopRunChild(fake, 'win32')
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL'], 'the direct child received both signals')
})
