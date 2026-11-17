/**
 * A local OpenAI-compatible mock model.
 *
 * It answers both streamed and non-streamed Chat Completions requests so a
 * scenario never needs a real model, network or credential.
 */

import { appendFileSync } from 'node:fs'
import { createServer } from 'node:http'

/** Default reply used by smoke scenarios. */
export const DEFAULT_MOCK_TEXT = 'Mock reply from the isolated lab.'

/**
 * Start the mock server on an OS-assigned loopback port.
 * @param options - reply script and optional log path.
 * @returns a handle with url, port, log and close.
 */
export async function startMockProvider({ script = () => DEFAULT_MOCK_TEXT, log } = {}) {
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      let parsed = {}
      try {
        parsed = JSON.parse(body || '{}')
      } catch {
        response.writeHead(400, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: { message: 'body is not JSON' } }))
        return
      }
      const reply = script(parsed)
      const text = typeof reply === 'string' ? reply : String(reply?.content ?? DEFAULT_MOCK_TEXT)
      const id = 'lab-mock-completion'
      const created = Math.floor(Date.now() / 1000)
      if (log !== undefined) {
        appendFileSync(log, `${new Date().toISOString()} ${request.method} ${request.url} stream=${parsed.stream === true}\n`)
      }
      if (parsed.stream === true) {
        response.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        })
        const chunk = (delta, finish) => `data: ${JSON.stringify({
          id,
          object: 'chat.completion.chunk',
          created,
          model: parsed.model ?? 'lab-mock',
          choices: [{ index: 0, delta, finish_reason: finish }],
        })}\n\n`
        response.write(chunk({ role: 'assistant', content: '' }, null))
        response.write(chunk({ content: text }, null))
        response.write(chunk({}, 'stop'))
        response.write('data: [DONE]\n\n')
        response.end()
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        id,
        object: 'chat.completion',
        created,
        model: parsed.model ?? 'lab-mock',
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }))
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    log,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}
