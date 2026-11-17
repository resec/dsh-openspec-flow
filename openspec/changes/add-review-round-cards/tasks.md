# Tasks

## 1. Dependency, contract test and install probe

- [x] 1.1 Add `@deepseek-ai/dsh-session` at `0.2.2-rc.2` to `package.json`, update `package-lock.json`, replace the "Node built-ins only" rule in `AGENTS.md` with "Node built-ins plus the pinned DSH session package", and update the `index.js` module comment, `docs/upgrading-dsh-runtime.md` and `docs/installing-bundles.md`; verify with `npm ls @deepseek-ai/dsh-session` and a grep for the old rule and the old dependency list.
- [x] 1.2 Write the repository contract test `test/review-cards-probe.test.mjs`: write a review-card record through a fake Host Session, assert no tool result carries the card payload or a card-specific field while `action: "report"` still returns the stored report, assert the projection reads the record, and build a second copy of `@deepseek-ai/dsh-session` under a fixture so a mismatched copy makes the writer fail; verify with `node --test test/review-cards-probe.test.mjs`.
- [x] 1.3 Add `scripts/probe-session.mjs`: import the package from the installed plugin path and the Host path, compare the resolved paths, create a Session through the Host copy, write a record through the plugin copy, and assert the record is absent from the model-visible transcript; verify by running it against the local DSH install and by forcing a copied module path to fail.
- [x] 1.4 Add a package check that the declared DSH session version equals `engines.dsh`; verify by running the test with a mismatched fixture and seeing it fail.
- [x] 1.5 Add a source-import check that every runtime import in `index.js`, `reviewer.js` and `lib/` is a Node built-in, a relative module or `@deepseek-ai/dsh-session`; verify by adding a fixture import of another DSH package and seeing the check fail.

## 2. Remove the round cap

- [x] 2.1 Remove `maxRounds` from `lib/review/config.js` defaults, normalization and `settingsFor`; accept a legacy field and drop it from the normalized output; update `test/config.test.mjs`; verify with `node --test test/config.test.mjs`.
- [x] 2.2 Remove `maxRounds` from `lib/review/policy.js` builders, migrations and readers; legacy policies are read without it; update policy tests; verify with the review-policy test file.
- [x] 2.3 Remove `maxRounds` from the recorded limits, the resume cap check, the `extend` implementation and the tool parameter schema in `lib/tools/review.js`; `extend` accepts only `minutes`; verify with `node --test test/review-unit.test.mjs test/review-draft.test.mjs test/review-apply.test.mjs`.
- [x] 2.4 Remove the `maxRounds` bound from `lib/review/settings.js` and the page field, default and lock summary from `client.js`; update `locale`; verify with `node --test test/review-settings.test.mjs test/review-client.test.mjs`.
- [x] 2.5 Update the round-cap expectations in `test/review-wait.test.mjs`, `test/review-serial.test.mjs` and `test/integration.test.mjs`; verify with `node --test` on those files.
- [x] 2.6 Extend `test/review-doc.test.mjs` so a documented `maxRounds` key or a round-cap default fails, in addition to the live-default check; verify by temporarily adding the stale row and seeing the test fail.

## 3. Card data and events

- [x] 3.1 Create `lib/review/cards.js`: build review and resolution payloads from the record, report and waiver, normalize every value to lossless JSON, tolerate a missing report, and expose the write helper with a review-lock-safe marker check; verify with focused unit tests.
- [x] 3.2 Add `test/review-cards.test.mjs`: review card fields, resolution card fields, plan-change waiver, missing report, legacy record without the marker, duplicate write refusal; verify with `node --test test/review-cards.test.mjs`.
- [x] 3.3 Write cards at `self-report`, `resume` (only a newly opened round whose closed round had a report and disposed findings), the ready disposal (including a waived finding), reviewer `submit`, changer `wait` (latest submitted round), and changer `report` (latest submitted round only, marker-checked); add the `cards` marker to the draft and apply records; verify with `node --test test/review-draft.test.mjs test/review-apply.test.mjs test/review-reviewer.test.mjs`.
- [x] 3.4 Cover the independent flow: reviewer `submit` writes only the reviewer card, `wait` writes the main card, `report` does not duplicate, and `report` with an older round writes no card; verify with a focused test.
- [x] 3.5 Cover the self-review flow: `self-report` plus a disposal and `resume` produce the review and resolution cards; a passing round without disposal produces only the review card; verify with a focused test.
- [x] 3.6 A failed card write logs a warning and leaves the stored report and findings unchanged; verify with a unit test that injects a throwing writer.

## 4. Projection

- [x] 4.1 Create `lib/review/card-projection.js`: state with `currentTurn` and `byTurn`, record folding, the `{ byTurn }` wire view, custom shape checks; verify with a projection unit test.
- [x] 4.2 Register the projection once from the main `index.js` through the optional `ctx.get('sessionProjections')` service inside a try/catch, leaving `reviewer.js` inject unchanged; a throwing registrar logs and the review tools still register; verify with a test that injects a throwing service.
- [x] 4.3 Test turn grouping, two cards in one turn, a malformed payload and a card outside any turn; verify with the projection test file.

## 5. Client card

- [x] 5.1 Add the `conversation.chat.turnTail` registration and component to `client.js`: per-card collapse state, collapsed summary, expanded report verdict and summary, full report fields, disposition notes, risks, scope and waiver, scroll container, no truncation and no pagination; verify with the client test.
- [x] 5.2 Use fixed Chinese label constants for the card, independent of the page locale; keep the configuration page dictionaries unchanged; verify with `node --test test/review-client.test.mjs`.
- [x] 5.3 Test selection by `byTurn[turn.turn]`, empty state on a cardless current turn even when an older turn has a card, multiple cards, collapse toggling, the report summary and verdict rendering, and the waiver section; verify with `node --test test/review-client.test.mjs`.
- [x] 5.4 Check the hand-written bundle loads under the client test loader and exposes the new registration; verify with the client test.

## 6. Model behavior and documentation

- [x] 6.1 Update `skills/openspec-propose/SKILL.md` and `skills/openspec-apply-change/SKILL.md`: cards carry the report, one short note only for report-external information, no restatement, no round-cap language; extend `test/skills.test.mjs` so a skill mentioning a round cap or `maxRounds` fails; verify with `node --test test/skills.test.mjs`.
- [x] 6.2 Update `lib/review/brief.js` so the reviewer is instructed to write no summary after submitting, and update `lib/policy.js` with the short-note rule; verify with `node --test test/policy.test.mjs test/review-draft.test.mjs`.
- [x] 6.3 Update `docs/review.md`, `README.md`, `docs/upgrading-dsh-runtime.md` and `docs/installing-bundles.md`: card record, projection, turnTail, collapse, fixed Chinese labels, full report, plan-change waiver, write points, model rule, removed round cap, dependency, record `cards` marker, no-truncation rule and the not-model-visible statement; extend `test/review-doc.test.mjs` to check the absence of `maxRounds`/round-cap text, the card marker field, the write-point set, the no-truncation rule and the not-model-visible statement; verify with `node --test test/review-doc.test.mjs`.
- [x] 6.4 Bump `package.json` to `0.8.0`, regenerate `package-lock.json` so its root version follows, update the plugin version in `docs/upgrading-openspec-cli.md`, update every packaged skill's `metadata.generatedBy`, and update any description that names the review surface; verify with the skill tests and `npm run bundle:pack`'s version path.

## 7. Verification and release

- [x] 7.1 Run `openspec_inspect` with `action: "validate"` and `strict: true` for the change; verify zero warnings.
- [x] 7.2 Run `npm run test:affected -- <changed paths>` during implementation and `npm run verify` on Node 24 at the end; verify the coverage gate passes.
- [x] 7.3 Run `npm run openspec:check`; verify every active change and main spec passes.
- [ ] 7.4 Pack the bundle, install the tarball, restart the session, run `scripts/probe-session.mjs` against the installed plugin and Host, and verify in the Web GUI: collapsed card, expanded report summary and full report, waiver section, two self-review cards, main-session review card, reviewer-session card, cardless turn, refresh recovery.
- [ ] 7.5 Start the apply review, fix every blocker, archive the change, commit the archive and push to `origin/main`; verify the push succeeds.
