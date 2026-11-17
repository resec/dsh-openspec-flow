# Proposal: Add review round cards

## Why

Every review round today ends with model-written prose: the changer reads the full report (5–20 KB), restates findings, disposition and residue in its own words, and the reviewer writes a separate summary. The same facts are repeated, the two sides disagree in wording, and each round pays for both the full report input and the prose output. The plugin already owns every fact, so it should present the round itself.

Two related gaps block that: the plugin may not import any `@deepseek-ai/*` package, so it cannot write a plugin record (the only report channel that never enters model history); and draft/apply reviews still carry a `maxRounds` cap that needs a user-approved `extend`, which the user has asked to remove.

## What Changes

- **New plugin record** `plugin:openspec-flow/review-card`: written at the review point (report submitted) and the resolution point (findings disposed, `resume` entered or next step ready). It carries the full report body, recorded finding states, the plan-change waiver and round metadata; it never enters the model-visible surface.
- **New Host session projection** `openspecReviewCards`: folds each card record by turn. A self-review round writes a review card and, when it disposes findings, a resolution card; an independent round writes a reviewer-session review card, a main-session review card from `wait` or `report`, and a resolution card from the changer.
- **New client card**: `conversation.chat.turnTail` renders the current turn's cards after the answer, selecting `byTurn[current turn]` from the slot's turn number. Collapsed by default with the title, round, verdict, finding counts and next action; clicking expands the report verdict and summary, every finding field, verifications, dispositions, residual risks, out-of-scope entries and the plan-change waiver. No truncation and no pagination; the expanded body scrolls. Labels are fixed Chinese strings; report text stays verbatim.
- **Main-session review card**: for an independent reviewer, the changer's `wait` (ready, latest submitted round) writes the review card into the main session and marks it; `report` writes the latest submitted round's card only when the marker is absent. Reviewer `submit` writes the reviewer-session card. A self-review writes its review card on `self-report` and its resolution card on `resume` or the ready disposal.
- **Model behavior**: the plugin instructs the model through the shipped skills, the reviewer brief and the policy text to write only one short note for information the report cannot express and the user must know, and not to restate findings, evidence, risks, scope or notes. The reviewer brief instructs the reviewer to write no summary after submitting.
- **Round caps removed**: `reviews.draft.maxRounds` and `reviews.apply.maxRounds` disappear from settings, policy, records and the configuration page; `openspec_review` no longer accepts `maxRounds` on `extend`. `extend` remains for the wait deadline and takes only `minutes`. Legacy records and policies that still carry `maxRounds` keep the field but it is ignored.
- **BREAKING** (packaging): the plugin declares `@deepseek-ai/dsh-session` at the pinned DSH version and may import it at runtime; the "Node built-ins only" rule in `AGENTS.md` is replaced by "Node built-ins plus the pinned DSH session package". An isolated, self-provided DSH install probe verifies module identity and model invisibility; the development host is never used.
- **BREAKING** (configuration): `maxRounds` is no longer a review setting. A settings file that still carries it loads with the field ignored, and the next save drops it.
- Update `docs/review.md`, `README.md`, `docs/upgrading-dsh-runtime.md`, `docs/installing-bundles.md`, the packaged skills, the policy text, the record layout and the documentation tests.

## Capabilities

### New Capabilities

- `review-cards`: the review-card record, the Host projection, the `turnTail` rendering, the card write points, the model reporting rules and the legacy degrade behavior.

### Modified Capabilities

- `change-review`: remove the round cap from review entry, remove `maxRounds` from `extend` and from the recorded limits, keep the wait extension.
- `tool-surface`: `openspec_review` no longer accepts `maxRounds`; no output field is added for the card.
- `review-configuration`: the configuration page and Host bounds drop `maxRounds`; a legacy section that still carries it is accepted and saved without it.
- `review-documentation`: the review document and README describe cards, the removed round cap, the new dependency and the model reporting rule.
- `skill-adaptation`: propose and apply skills state the card reporting rule; the reviewer brief tells the reviewer not to write a summary.
- `project-invariants`: add the pinned DSH session dependency and the install-time single-instance requirement.

## Verification boundary

The development host profile, configuration and sessions SHALL NOT be modified for verification. The agent verifies only the repository tests. Two checks are the user's self-verification boundaries, run in a self-provided, isolated, clean DSH, and are not `tasks.md` steps: the isolated-DSH install probe (one `dsh-session` module for plugin and Host, probe record absent from the model-visible transcript) and the Web GUI card inspection (collapsed, expanded full report, waiver, two self-review cards, main-session card, reviewer-session card, cardless turn, refresh). The push follows a confirmed boundary.

## Impact

- **Dependencies**: `package.json` gains `@deepseek-ai/dsh-session` at `0.2.2-rc.2`; `package-lock.json` updates; bundle install must resolve it; the isolated-DSH probe is the release boundary.
- **Package version**: `package.json` moves to `0.8.0`; `package-lock.json` is regenerated so its root version follows; `docs/upgrading-openspec-cli.md` records the new plugin baseline; every packaged skill's `metadata.generatedBy` follows, and the tarball path and bundle metadata use the new version.
- **Host code**: `index.js` registers the card projection through the optional `sessionProjections` service, wrapped so a failed registration only logs; `reviewer.js` stays unchanged on the inject list; new `lib/review/cards.js` and `lib/review/card-projection.js`; `lib/tools/review.js` writes cards at `self-report`, `wait`, `report`, `resume`, `dispose` and `waive`; `reviewer-tool.js` writes on `submit`.
- **Round caps**: `lib/review/config.js`, `policy.js`, `settings.js`, `lib/tools/review.js`, `client.js`, `locale/*.json`.
- **Client**: `client.js` gains the `turnTail` card, collapse state, full-report rendering and fixed Chinese labels; the configuration page loses the `maxRounds` field.
- **Records**: review records gain a `cards` marker and drop `limits.maxRounds`; old records stay readable.
- **Probe**: `scripts/probe-session.mjs` imports the installed plugin's and the Host's `@deepseek-ai/dsh-session`, compares module paths, writes a probe record through a Host-created Session, and asserts the record is absent from the model-visible transcript. The live run against a Host-created Session is the user's isolated-DSH boundary; the repository test covers the contract against the fake Host.
- **Docs and tests**: `docs/review.md`, `README.md`, `docs/upgrading-dsh-runtime.md`, `docs/installing-bundles.md`, `docs/upgrading-openspec-cli.md`, `AGENTS.md`, `index.js` comments, packaged skills, `lib/policy.js`, `lib/review/brief.js`, and the affected tests (`config`, `settings`, `client`, `draft`, `apply`, `wait`, `serial`, `unit`, `doc`, `integration`, `cards`, `cards-projection`, `cards-probe`).
