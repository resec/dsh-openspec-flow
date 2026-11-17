# Tasks

## 1. Card files and the no-dependency boundary

- [ ] 1.1 Remove the `@deepseek-ai/dsh-session` entry from `package.json` and `package-lock.json`, delete `scripts/probe-session.mjs` and `test/review-cards-probe.test.mjs`, rewrite the `AGENTS.md` plugin-constraint bullet to the built-ins-only rule, and remove the Session-event writer, `lib/review/card-projection.js` and the optional `sessionProjections` registration. Move the surviving runtime import and manifest checks into a new `test/runtime-boundary.test.mjs`; replace the dependency assertion with an absence assertion. Verify `package.json` declares no `@deepseek-ai/*` dependency and the new boundary test passes.
- [ ] 1.2 Add atomic card-file writes under `openspec/.review/<store>#<change>/cards/`, using a hashed session key, `writeJsonAtomic`, the review lock, the review-record `cards` marker and a logged failure; verify with the card unit tests.
- [ ] 1.3 Test the payload builder and file layout: the full report, the plan-change waiver, a missing report, a legacy record without the marker, a duplicate write and a corrupt file; verify with the card unit tests.
- [ ] 1.4 Keep the runtime import and manifest checks in `test/runtime-boundary.test.mjs`: only Node built-ins and relative modules; no `@deepseek-ai/*` dependency; verify by injecting a fixture DSH import and seeing the check fail.

## 2. Remove the round cap

- [x] 2.1 Remove `maxRounds` from `lib/review/config.js` defaults, normalization and `settingsFor`; accept a legacy field and drop it from the normalized output; update `test/config.test.mjs`; verify with `node --test test/config.test.mjs`.
- [x] 2.2 Remove `maxRounds` from `lib/review/policy.js` builders, migrations and readers; legacy policies are read without it; update policy tests; verify with the review-policy test file.
- [x] 2.3 Remove `maxRounds` from the recorded limits, the resume cap check, the `extend` implementation and the tool parameter schema in `lib/tools/review.js`; `extend` accepts only `minutes`; verify with `node --test test/review-unit.test.mjs test/review-draft.test.mjs test/review-apply.test.mjs`.
- [x] 2.4 Remove the `maxRounds` bound from `lib/review/settings.js` and the page field, default and lock summary from `client.js`; update `locale`; verify with `node --test test/review-settings.test.mjs test/review-client.test.mjs`.
- [x] 2.5 Update the round-cap expectations in `test/review-wait.test.mjs`, `test/review-serial.test.mjs` and `test/integration.test.mjs`; verify with `node --test` on those files.
- [x] 2.6 Extend `test/review-doc.test.mjs` so a documented `maxRounds` key or a round-cap default fails; verify by temporarily adding the stale row and seeing the test fail.

## 3. Card payload and write points

- [ ] 3.1 Build review and resolution payloads from the record, report and waiver with lossless JSON and a missing report tolerated; keep the marker-based deduplication; verify with the card unit tests.
- [ ] 3.2 Cover the payload fields, the plan-change waiver, a missing report, a legacy record without the marker and duplicate write refusal; verify with the card unit tests.
- [ ] 3.3 Write card files at `self-report`, `resume` (only a newly opened round whose closed round had a report and disposed findings), the ready disposal (including a waived finding), reviewer `submit`, changer `wait` (latest submitted round), and changer `report` (latest submitted round only, marker-checked); add the `cards` marker; verify with the review tool tests.
- [ ] 3.4 Cover the independent flow: reviewer `submit` writes only the reviewer card, `wait` writes the main card, `report` does not duplicate, and `report` with an older round writes no card; verify with a focused test.
- [ ] 3.5 Cover the self-review flow: `self-report` plus a disposal and `resume` produce the review and resolution cards; a passing round without disposal produces only the review card; verify with a focused test.
- [ ] 3.6 A failed card write logs a warning and leaves the stored report and findings unchanged; verify with a unit test that injects a failing writer.
- [ ] 3.7 Extend the review tool-result test to assert that no review result carries a card payload or a card-specific field while `report` and `own-report` still return the stored report; verify with the review unit test.

## 4. Review endpoint and turn binding

- [ ] 4.1 Add `reviewCards/get` to `lib/client/channel.js` and dispatch it from `lib/review/settings.js`; verify the endpoint contract test.
- [ ] 4.2 Resolve the session's project from the Host agents/working-directory services, scan `openspec/.review/*/cards/*.json` and select the files for that session; verify with temporary review directories.
- [ ] 4.3 Bind unclaimed cards written within the requested turn to that turn, persist the binding, return cards already bound to that turn, and maintain the per-session delivery watermark; verify with the endpoint test.
- [ ] 4.4 Test bound-card refresh, unclaimed binding, watermark fallback, a corrupt card file and an endpoint failure; verify with the endpoint test.

## 5. Client query and card rendering

- [ ] 5.1 Confirm the session-id source against the installed client-slots contract (the `inject` callback, as `dsh-client-ui-action-cards` uses it); fall back to the `turn` payload's session id if the callback has none, and stop for a user-approved spec change if neither exists. Then register the entry with `inject: (sessionId) => ({ sessionId })`, query `reviewCards/get` with the turn number and start time when available, store the returned cards and render nothing while loading or on failure; verify with the client test.
- [ ] 5.2 Render the collapsed summary and the expanded report verdict and summary, every finding field, verification evidence, disposition notes, risks, scope and waiver in a scroll container, with fixed Chinese labels and no truncation or pagination; verify with the client test.
- [ ] 5.3 Test the request payload, selection of returned cards, a cardless turn, an endpoint failure and multiple cards in one turn; verify with the client test.
- [ ] 5.4 Check the hand-written bundle loads under the client test loader and exposes the new registration; verify with the client test.

## 6. Model behavior, documentation and version

- [ ] 6.1 Update `skills/openspec-propose/SKILL.md` and `skills/openspec-apply-change/SKILL.md`: cards carry the report, one short note only for report-external information, no restatement, no round-cap language; extend `test/skills.test.mjs` so a skill mentioning a round cap or `maxRounds` fails; verify with `node --test test/skills.test.mjs`.
- [ ] 6.2 Update `lib/review/brief.js` so the reviewer is instructed to write no summary after submitting, and update `lib/policy.js` with the short-note rule; verify with the policy and draft tests.
- [ ] 6.3 Update `docs/review.md`, `README.md`, `docs/upgrading-dsh-runtime.md` and `docs/installing-bundles.md`: the card files and layout, `reviewCards/get`, turn binding and refresh, turnTail, collapse, fixed Chinese labels, full report, waiver, write points, model rule, removed round cap, record `cards` marker, no-truncation, no session event, no DSH dependency and the verification boundary. Remove the old event/projection/probe/dependency assertions from `test/review-doc.test.mjs` and add the new card-file, endpoint, record-layout and boundary assertions; verify with the doc test.
- [ ] 6.4 Bump `package.json` to `0.9.0`, regenerate `package-lock.json` so its root version follows, update the plugin version in `docs/upgrading-openspec-cli.md`, update every packaged skill's `metadata.generatedBy`, and update the change README; verify with the skill tests and `npm run bundle:pack`'s version path.

## 7. Verification and release

- [ ] 7.1 Run `openspec_inspect` with `action: "validate"` and `strict: true` for the change; verify zero warnings.
- [ ] 7.2 Run `npm run verify` on Node 24; verify the coverage gate passes.
- [ ] 7.3 Run `npm run openspec:check`; verify every active change and main spec passes.
- [ ] 7.4 Start the apply review, fix every blocker, archive the change, and commit the archive. Do not push.
- [ ] 7.5 Build the release tarball from the final reviewed commit with `npm run bundle:pack -- --force` and verify its metadata names 0.9.0. Do not install it into the development host profile. In the isolated, self-contained DSH, run the automated card-file, endpoint, turn-binding and render-data checks; do not push.
