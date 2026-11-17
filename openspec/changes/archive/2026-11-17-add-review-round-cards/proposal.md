# Proposal: Add review round cards

## Why

Every review round today ends with model-written prose: the changer reads the full report (5–20 KB), restates findings, disposition and residue in its own words, and the reviewer writes a separate summary. The same facts are repeated, the two sides disagree in wording, and each round pays for both the full report input and the prose output. The plugin already owns every fact, so it should present the round itself.

Two delivery attempts failed and shaped the final design. A formal plugin record needs `@deepseek-ai/dsh-session`; an isolated-DSH tarball install gives the plugin and the Host separate copies, and the profile copy cannot resolve its dependencies. A public `session.append` custom event needs no package, but the pinned DSH persistence read path refuses unknown events without the `ignorable` marker, so it could make a session unreadable after restart. The cards are therefore stored as files under the change's review directory and rendered by the client through the existing review channel: no session event, no session-log risk, and no DSH dependency.

## What Changes

- **Card files**: at the review point (report submitted) and the resolution point (findings disposed, `resume` entered or next step ready) the Host writes `cards/<sessionKey>-<phase>-<round>.json` (with a short SHA-256 session key) under the change's review directory. The file carries the complete payload: report body, recorded findings, plan-change waiver, object binding, counts, next action and readiness reasons. File writes are atomic and logged on failure; no Session event is appended.
- **Review endpoint** `reviewCards/get`: given a session id, turn number and, when the slot provides it, the turn start time (otherwise the per-session watermark), the Host returns the cards already bound to that turn and binds unclaimed cards written within that turn to it. The binding persists, so a refresh returns the same cards; a card bound to another turn is not reused.
- **New client card**: `conversation.chat.turnTail` queries `reviewCards/get` for the current session and turn, then renders the returned cards. Collapsed by default with the title, round, verdict, finding counts and next action; clicking expands the report verdict and summary, every finding field, verifications, dispositions, residual risks, out-of-scope entries and the plan-change waiver. No truncation and no pagination; the expanded body scrolls. Labels are fixed Chinese strings; report text stays verbatim. A failed query or an empty result renders nothing.
- **Main-session review card**: for an independent reviewer, the changer's `wait` (ready, latest submitted round) writes the main-session card file and marks it; `report` writes the latest submitted round's card only when the marker is absent. Reviewer `submit` writes the reviewer-session card. A self-review writes its review card on `self-report` and its resolution card on `resume` or the ready disposal.
- **Model behavior**: the plugin instructs the model through the shipped skills, the reviewer brief and the policy text to write only one short note for information the report cannot express and the user must know, and not to restate findings, evidence, risks, scope or notes. The reviewer brief instructs the reviewer to write no summary after submitting.
- **Round caps removed**: `reviews.draft.maxRounds` and `reviews.apply.maxRounds` disappear from settings, policy, records and the configuration page; `openspec_review` no longer accepts `maxRounds` on `extend`. `extend` remains for the wait deadline and takes only `minutes`. Legacy records and policies that still carry `maxRounds` keep the field but it is ignored.
- **BREAKING** (configuration): `maxRounds` is no longer a review setting. A settings file that still carries it loads with the field ignored, and the next save drops it.
- **No runtime dependency**: the plugin removes the existing `@deepseek-ai/dsh-session` dependency and its lockfile entry, restores the built-ins-only rule in `AGENTS.md`, deletes the probe script/test and declares no `@deepseek-ai/*` package. The card needs no Host module sharing and no Session event.
- Update `docs/review.md`, `README.md`, `docs/upgrading-dsh-runtime.md`, `docs/installing-bundles.md`, the packaged skills, the policy text, the record layout and the documentation tests.
- **Package version**: `package.json` moves to `0.9.0` because the undelivered 0.8.0 build already exists under `dist/`; the lockfile, every packaged skill's `metadata.generatedBy` and `docs/upgrading-openspec-cli.md` follow.

## Capabilities

### New Capabilities

- `review-cards`: the card file layout, the review endpoint and turn binding, the client query and rendering, the write points, the model reporting rules and the degrade behavior.

### Modified Capabilities

- `change-review`: remove the round cap from review entry, remove `maxRounds` from `extend` and from the recorded limits, keep the wait extension.
- `tool-surface`: `openspec_review` no longer accepts `maxRounds`; no output field is added for the card.
- `review-configuration`: the configuration page and Host bounds drop `maxRounds`; a legacy section that still carries it is accepted and saved without it.
- `review-documentation`: the review document and README describe the card files, the endpoint, the removed round cap and the model reporting rule.
- `skill-adaptation`: propose and apply skills state the card reporting rule; the reviewer brief tells the reviewer not to write a summary.
- `project-invariants`: state that runtime imports stay built-in, no DSH package is declared, and the card is a file rather than a Session event.

## Verification boundary

The development host profile, configuration and sessions SHALL NOT be modified for verification. The agent SHALL prepare a self-contained, isolated, clean DSH under a temporary home and run the card-file, endpoint, turn-binding and render-data checks that can be automated there. Only a check that cannot be automated in that DSH, such as a visual Web GUI review, may remain the user's self-verification boundary; it SHALL NOT be written as a `tasks.md` step. The push follows a confirmed boundary.

## Impact

- **Dependency removal**: `package.json` and `package-lock.json` drop `@deepseek-ai/dsh-session`; `AGENTS.md` returns to the built-ins-only rule; `scripts/probe-session.mjs` and `test/review-cards-probe.test.mjs` are deleted.
- **Card storage**: `lib/review/cards.js` gains atomic file writes under `cards/` and the `<reviewDir>/card-delivery.json` watermark; the `cards` marker stays in the review record; no Session event and no DSH import.
- **Host channel**: `lib/client/channel.js` and `lib/review/settings.js` gain `reviewCards/get`; the endpoint reads card files, binds unclaimed cards to the requesting turn, and persists the binding. It runs under the review lock and never mutates review state.
- **Client**: `client.js` registers `conversation.chat.turnTail`, queries the endpoint with the session id and turn, and renders the cards; the configuration page loses the `maxRounds` field.
- **Round caps**: `lib/review/config.js`, `policy.js`, `settings.js`, `lib/tools/review.js`, `client.js`, `locale/*.json`.
- **Records**: review records gain a `cards` marker and drop `limits.maxRounds`; `cards/` files are added under the review root; old records stay readable.
- **Package version**: `0.9.0` in `package.json`, the lockfile, `docs/upgrading-openspec-cli.md` and every packaged skill's `metadata.generatedBy`.
- **Docs and tests**: `docs/review.md`, `README.md`, `docs/upgrading-dsh-runtime.md`, `docs/installing-bundles.md`, `AGENTS.md`, `index.js` comments, packaged skills, `lib/policy.js`, `lib/review/brief.js`, and the affected tests (`config`, `settings`, `client`, `draft`, `apply`, `wait`, `serial`, `unit`, `doc`, `integration`, `runtime-boundary`, `cards`, `cards-endpoint`, `cards-client`).
