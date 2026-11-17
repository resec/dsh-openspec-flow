/**
 * End-to-end smoke scenario: install the tarball, answer a headless task with
 * the mock model, open the Web GUI and keep a screenshot.
 */

import { join } from 'node:path'
import { defineScenario, expectCompleted } from '../../scripts/lab/index.mjs'

export default defineScenario({
  name: 'install-smoke',
  model: 'mock',
  async run(lab) {
    const run = await lab.headless.run({ prompt: 'Reply with one short sentence.' })
    expectCompleted(run)
    if (!run.events.some((event) => event.type === 'text' || event.type === 'final')) {
      throw new Error('the headless run produced no model output event')
    }

    lab.fixture.openSpecChange({ change: 'demo' })
    const web = await lab.web.open()
    await web.dismissOnboarding()
    const title = await web.page.title()
    if (!title.includes('DeepSeek Harness')) throw new Error(`unexpected page title: ${title}`)
    await web.chooseWorkspace(lab.run.project)
    await web.send('hello')
    await web.expectText('Mock reply from the isolated lab.')
    const endpoint = await lab.http.call('reviewPolicies/list')
    if (endpoint.body?.result?.ok !== true) throw new Error('the review channel did not answer')
    await web.screenshot(join(lab.run.artifacts, 'install-smoke.png'))
  },
})
