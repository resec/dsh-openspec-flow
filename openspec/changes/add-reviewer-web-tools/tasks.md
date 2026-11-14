# Tasks

## 1. Reviewer preset

- [x] 1.1 Add the `tool-web` child between `tool-fs-search` and `reviewer` inside the `openspec-reviewer` preset in `cordis.patch.yml`, with `search: true`, `fetch: true` and `searchTimeoutMs: 60000`. Verify: `sed -n '/preset-openspec-reviewer/,/id: reviewer/p' cordis.patch.yml` shows the entry under the preset and no provider key.
- [x] 1.2 Add the preset web test to `test/review.test.mjs`: the `tool-web` block carries both switches and the search budget, the patch contains no web service or provider entry, and no provider selection key. Verify: Node 24 runs `node --test test/review.test.mjs` with exit code 0.

## 2. Specification and documentation

- [x] 2.1 Update the reviewer-mode paragraph in `docs/review.md`: the preset composes `web_search` and `web_fetch` and chooses no provider; `web_search` and `web_fetch` follow the providers selected for search and fetch respectively, so one tool can be withheld while the other stays available; the selected provider decides target reachability, the shipped anonymous HTTP provider reaches loopback, private-network and cloud-metadata addresses, and isolation needs another provider or a `tools/pre-execute` policy; the persona is `complete: true`, so tool guidance does not render and only each web result's untrusted-content notice remains; a Host without the `web` service cannot compose the reviewer. Verify: `for p in "不选择 provider" "为 search 与 fetch 选择" "云元数据" "Host 未提供"; do sed -n '/## reviewer 模式/,/## 策略锁定/p' docs/review.md | grep -Fq "$p" || exit 1; done` exits 0.
- [x] 2.2 Update the review section in `README.md` with the provider-neutral sentence, per-operation provider selection, the Host `web` prerequisite and the destination warning. Verify: `for p in "不指定 provider" "为 search 与 fetch 选择" "不限制目标地址" "Host 未提供"; do sed -n '/## 评审/,/## CLI 对照/p' README.md | grep -Fq "$p" || exit 1; done` exits 0.
- [x] 2.3 Validate the change and the main specs. Verify: `openspec_inspect` with `action: "validate"` and `strict: true` reports no findings.

## 3. Integration verification

- [x] 3.1 Run the full test suite on Node 24. Verify: `npm test` exits 0.
- [x] 3.2 Run the coverage gate on Node 24. Verify: `npm run coverage:check` exits 0.
- [x] 3.3 Run the contract and spec checks. Verify: `npm run contract:check` and `npm run openspec:check` both exit 0.
- [x] 3.4 Live verification after the plugin bundle is reloaded or DSH restarts: start a reviewer for a new change (or `replace` an existing reviewer) with a provider that is ready for the reviewer's model route, and confirm at least one `web_search` or `web_fetch` call appears in the reviewer session log. Verify: the reviewer activates and the log shows the call; if no provider can be readied, mark this task blocked or waive it — a run without a web call does not satisfy it.

## Workflow follow-up

- Commit the implementation, then start the apply review and drive it to ready.
- Archive only when the user asks; then commit the archive and merged specs and push to `origin/main`.
