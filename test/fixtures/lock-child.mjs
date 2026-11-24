/**
 * Child-process worker for the cross-process worktree lock tests.
 *
 * Usage: node test/fixtures/lock-child.mjs <command> <json-options>
 *
 * Every command prints one JSON line before it blocks, so the parent can read
 * the child pid, token or worktree path while the child still holds its lock.
 * A `releaseFile` option makes the child wait until the parent creates that
 * file, which keeps the overlap deterministic instead of timing based.
 */

import { existsSync, writeFileSync } from 'node:fs'
import { acquireLock, lockPath, releaseLock } from '../../lib/worktree/lock.js'
import { createOrReuseApplyWorktree } from '../../lib/worktree/create.js'
import { gitCommonDir } from '../../lib/review/store.js'

const [command, raw] = process.argv.slice(2)
const options = JSON.parse(raw ?? '{}')

/** Print one JSON line for the parent. */
function announce(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

/** Wait until the parent creates the release file. */
async function waitForRelease() {
  for (;;) {
    if (existsSync(options.releaseFile)) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

/** The Host stand-in: record the move and hold it when asked. */
const context = {
  workingDirectory: {
    async set(agent, path) {
      if (options.holdFile !== undefined) {
        writeFileSync(options.holdFile, `${String(process.pid)}\n`)
        await waitForRelease()
      }
      return path
    },
  },
}

const commands = {
  /** Hold the change lock, report the owner, then release after the signal. */
  async 'acquire-change'() {
    const handle = await acquireLock(options.commonDir, 'change', {
      change: options.change,
      timeoutMs: 60_000,
    })
    announce({ path: handle.path, pid: handle.owner.pid, token: handle.owner.token })
    await waitForRelease()
    announce({ released: releaseLock(handle).released })
  },
  /** Create or reuse a worktree, optionally blocking inside the session move. */
  async 'create-worktree'() {
    announce({ pid: process.pid })
    const state = await createOrReuseApplyWorktree(context, {
      mainRoot: options.mainRoot,
      store: options.store ?? null,
      change: options.change,
      sealCommit: options.sealCommit,
      agent: { id: `child-${String(process.pid)}` },
      signal: new AbortController().signal,
    })
    announce({ pid: process.pid, worktree: state.worktree, state })
    releaseLock({
      path: lockPath(gitCommonDir(options.mainRoot), 'change', options),
      scope: 'change',
      commonDir: gitCommonDir(options.mainRoot),
      owner: { token: state.lockToken },
    })
  },
}

const run = commands[command]
if (run === undefined) {
  process.stderr.write(`unknown command '${String(command)}'\n`)
  process.exit(2)
}
await run()
