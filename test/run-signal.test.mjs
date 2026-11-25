import assert from 'node:assert/strict'
import test from 'node:test'
import { finishRun, signalRunChild, spawnRunChild, stopRunChild } from '../scripts/run-signal.mjs'

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
  const grandchildPid = await new Promise((resolve, reject) => {
    let buffer = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      const match = buffer.match(/^(\d+)\n/)
      if (match !== null) resolve(Number(match[1]))
    })
    child.once('exit', () => reject(new Error('the child exited before reporting its grandchild')))
  })
  t.after(() => kill(grandchildPid))
  assert.equal(alive(grandchildPid), true, 'the grandchild is running before the stop')
  await stopRunChild(child)
  await waitUntil(() => !alive(grandchildPid) && !alive(child.pid))
  assert.equal(alive(grandchildPid), false, 'the grandchild died with the group')
  assert.equal(alive(child.pid), false, 'the child died with the group')
})

test('stopRunChild escalates past a descendant that ignores SIGTERM', async (t) => {
  const child = spawnRunChild(
    process.execPath,
    ['-e', childCode("process.on('SIGTERM', () => {})\nsetTimeout(() => {}, 60000)")],
    { stdio: 'ignore' },
  )
  t.after(() => kill(child.pid))
  await new Promise((resolve) => setTimeout(resolve, 80))
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
