/**
 * A small structural stand-in for the Host context.
 *
 * It implements only the members the plugin reads: `tools.register`,
 * `subprocess.spawn`, `workingDirectory.ensure`, `get('skills')`, `effect`,
 * and `logger.warn`. The subprocess half wraps Node's own `spawn` while
 * honoring the collected-output contract.
 */

import { spawn } from 'node:child_process'

/**
 * Build a fake context and the registries it fills.
 * @param {object} options - `cwd` and an optional `skills` flag.
 * @returns `{ ctx, tools, skills }`.
 */
export function createFakeContext({ cwd, skills: withSkills = true }) {
  const tools = new Map()
  const skills = []
  const stats = { spawns: 0 }

  const collected = (getText) => ({
    readFrom() {
      const text = getText()
      return { text, nextOffset: Buffer.byteLength(text), lossy: false }
    },
  })

  const ctx = {
    logger: {
      warn() {},
      info() {},
    },
    workingDirectory: {
      defaultDirectory: cwd,
      async ensure() {
        return cwd
      },
    },
    subprocess: {
      spawn(spec) {
        stats.spawns += 1
        const child = spawn(spec.argv[0], spec.argv.slice(1), {
          cwd: spec.cwd,
          env: { ...process.env, ...spec.env },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''
        child.stdout.setEncoding('utf8')
        child.stderr.setEncoding('utf8')
        child.stdout.on('data', (chunk) => {
          stdout += chunk
        })
        child.stderr.on('data', (chunk) => {
          stderr += chunk
        })
        const done = new Promise((resolve, reject) => {
          child.on('error', reject)
          child.on('close', (exitCode, signal) => resolve({ exitCode, signal }))
        })
        const onAbort = () => {
          child.kill('SIGTERM')
        }
        if (spec.signal !== undefined) {
          if (spec.signal.aborted) onAbort()
          else spec.signal.addEventListener('abort', onAbort, { once: true })
        }
        return {
          stdin: undefined,
          stdout: child.stdout,
          stderr: child.stderr,
          control: undefined,
          collected: {
            stdout: collected(() => stdout),
            stderr: collected(() => stderr),
          },
          done,
          terminate() {
            child.kill('SIGTERM')
          },
          waitForExit() {
            return done.then(() => true)
          },
        }
      },
    },
    tools: {
      register(definition) {
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
    },
    get(name) {
      if (name === 'skills' && withSkills) {
        return {
          register(definition) {
            skills.push(definition)
            return () => {}
          },
        }
      }
      return undefined
    },
    effect(fn) {
      return fn()
    },
  }

  return { ctx, tools, skills, stats }
}
