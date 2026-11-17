import test from 'node:test'
import assert from 'node:assert/strict'
import { startMockProvider } from '../scripts/lab/mock/provider.mjs'

test('the mock answers non-streamed and streamed requests', async () => {
  const mock = await startMockProvider({ script: () => 'lab mock reply' })
  try {
    const normal = await fetch(`${mock.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'lab-mock', stream: false, messages: [] }),
    })
    const normalBody = await normal.json()
    assert.equal(normalBody.choices[0].message.content, 'lab mock reply')

    const streamed = await fetch(`${mock.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'lab-mock', stream: true, messages: [] }),
    })
    const text = await streamed.text()
    assert.match(text, /chat\.completion\.chunk/)
    assert.match(text, /lab mock reply/)
    assert.match(text, /\[DONE\]/)
  } finally {
    await mock.close()
  }
})
