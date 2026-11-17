import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { callReviewEndpoint, exchangeCookie, parseStartupUrl } from '../scripts/lab/drivers/http.mjs'

test('the web startup URL is extracted from the CLI line', () => {
  assert.equal(parseStartupUrl('dsh web: http://127.0.0.1:1234/?token=abc'), 'http://127.0.0.1:1234/?token=abc')
  assert.equal(parseStartupUrl('no url here'), undefined)
})

test('the startup token is exchanged and the channel envelope is accepted', async () => {
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/?token=')) {
      response.writeHead(303, { location: './', 'set-cookie': 'lab-auth=v1; Path=/; HttpOnly' })
      response.end()
      return
    }
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      const envelope = JSON.parse(body)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: envelope.method } }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  try {
    const session = await exchangeCookie(`http://127.0.0.1:${port}/?token=abc`)
    assert.equal(session.status, 303)
    assert.match(session.cookie, /lab-auth=v1/)
    const response = await callReviewEndpoint({
      base: session.base,
      cookie: session.cookie,
      endpoint: 'reviewCards/get',
      payload: { sessionId: 's', turn: 1 },
    })
    assert.equal(response.status, 200)
    assert.equal(response.body.result.ok, true)
    assert.equal(response.body.result.value, 'reviewCards/get')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
