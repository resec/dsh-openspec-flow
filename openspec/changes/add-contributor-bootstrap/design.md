# Design: add-contributor-bootstrap

## Context

See `proposal.md` for motivation. The repository currently assumes the installed plugin for planning, review and apply; its development entrypoints require Node 24; the pre-push hook runs OpenSpec validation, the lab and verification. The pinned CLI is `@fission-ai/openspec` 2.0.0 and the runtime baseline is Node major 24 with `engines.node >=24.9.0`.

Two constraints shape the design:

- An external contributor cannot be assumed to have DSH, a DSH profile, the plugin, a model provider, a specific GitHub account or write access to `main`.
- Review records are local files under `openspec/.review/` and are not carried by a pull request. The maintainer therefore owns draft and apply review for external contributions.

## Goals / Non-Goals

Goals:

- A macOS and Linux bootstrap that resolves a qualifying Node runtime without changing host state.
- A CLI-only change workflow that works with no plugin tooling.
- Ubuntu CI that gates every pull request with verification and the lab.
- Guards that keep generated OpenSpec skills out of the repository while allowing local installation.
- A contribution contract that produces reviewable evidence instead of relying on implicit setup.

Non-Goals:

- Installing or configuring DSH, the plugin or a model provider for contributors.
- Running a macOS CI job.
- Replacing the maintainer's review, archive or publishing responsibilities.
- Changing plugin runtime behavior, tool schemas or the review protocol.

## Decisions

### Bootstrap uses a POSIX shell entrypoint and a Node module

`scripts/bootstrap.sh` resolves or downloads Node, then executes `scripts/bootstrap.mjs` with that runtime. The shell part is limited to what must work before a qualifying Node exists: platform and architecture detection, host candidate discovery, reading the baseline version from `coverage.baseline.json`, download, checksum verification and extraction. All remaining steps run as testable Node code. A `--print-node-version` mode exposes the resolved baseline version so a suite test can compare the shell's source with `coverage.baseline.json` instead of trusting a literal.

Alternative considered: one Node script. It cannot run before Node exists, which defeats the purpose on a fresh macOS host. Alternative: one shell script. It would make checksum parsing, step planning and option handling hard to test with the repository's existing Node test setup.

### Node resolution is host-first and bound to the recorded baseline

Resolution order:

1. `node` on `PATH`.
2. Common global locations for Homebrew, nvm, fnm, volta and asdf, read as directories only.
3. A download into `.cache/toolchain/` from `nodejs.org`, verified against `SHASUMS256.txt`.

The selected host runtime must be Node major 24 and satisfy `engines.node`; the highest qualifying 24.x wins. The fallback version is read at runtime from `coverage.baseline.json` (`node.version`) rather than written as a literal, and must also satisfy the runtime baseline in `project-invariants`. CI derives its `setup-node` version from the same file. A host runtime is never modified, and the fallback is activated only in the current shell through `scripts/activate.sh`.

Alternative considered: always download into the clone. That wastes bandwidth on hosts that already have a qualifying runtime and makes the common path slower. Alternative: always use a version manager. The repository's test entrypoints deliberately never invoke one; bootstrap is the only place allowed to inspect version-manager directories, and only by reading. `AGENTS.md` is scoped in the same change: test and coverage entrypoints keep the PATH-only rule, and bootstrap is named as that single read-only exception.

### Browser and lab prerequisites are explicit

Chromium installs with `PLAYWRIGHT_BROWSERS_PATH` pointed at `.cache/lab/pw-browsers`, so the doctor finds it there and the browser never lands in the host cache. Bootstrap runs the doctor before any test. It does not install host system packages: when the doctor reports a missing CJK font, bootstrap exits nonzero with the doctor's correction-oriented message and does not claim full mode passed. macOS skips the font check; a Linux contributor either installs the font or provides `FONTCONFIG_FILE` for a clone-local configuration.

Alternative considered: install a distribution font package from bootstrap. That needs privilege escalation and mutates host state, which the host-state requirement forbids. Alternative: bundle a font. That adds a large binary and its license to a repository that does not otherwise ship fonts.

### CI has two Ubuntu jobs and no macOS job

- `verify` runs checkout, Node from `coverage.baseline.json`, `npm ci`, the change and generated-skill checks, `npm run openspec:check` and `npm run verify`.
- `lab` runs `npm ci`, setup-node from the baseline, `PLAYWRIGHT_BROWSERS_PATH=.cache/lab/pw-browsers npx playwright install --with-deps chromium`, the distribution CJK font package, the lab caches, `npm run lab -- doctor` and `npm run test:lab -- --mock-only`, with the same browser path in the job environment.

The lab job is separate so a slow lab failure does not hide a fast verification failure, and the two jobs can run in parallel. Caches cover `.cache/lab/pw-browsers` and `.cache/lab/dsh`; the DSH cache key follows `engines.dsh`, the browser cache key follows the Playwright dependency. The workflow uses `permissions: contents: read`, `pull_request` rather than `pull_request_target`, and `fetch-depth: 0` so the change and skill checks can diff against the base SHA.

Alternative considered: one job. It reduces duplicate `npm ci` setup but serializes roughly ten minutes of lab work behind verification. Alternative: run the lab only for lab-related paths. The requirement says every pull request; a path filter would need a maintained allowlist and would silently miss configuration-only changes.

### Change and generated-skill checks are shared Node scripts

`scripts/check-pr-change.mjs` reads the diff from a base SHA and:

- requires at least one active change path, excluding `openspec/changes/archive/`;
- rejects any unchecked task in the touched change's `tasks.md`;
- rejects restricted paths.

`scripts/check-generated-skills.mjs` rejects two classes:

- a generated skill path matching `/skills/openspec-[^/]+/` outside the repository's root `skills/`;
- a file whose leading frontmatter carries the generated markers: `name: openspec-`, `allowed-tools:` and `author: openspec` or `compatibility: Requires openspec CLI.`.

Both scripts expose pure predicates so tests do not need a repository or network. The root `skills/openspec-*` are explicitly allowed; they use `whenToUse` and `generatedBy: dsh-openspec-flow@<version>` instead of the CLI's generated frontmatter. The checks are also available as `npm run layout:check` for local feedback, but CI is the hard gate.

Alternative considered: shell `grep` over `git diff`. It is shorter but not testable across path and content cases, and the frontmatter rule needs more than one line.

### Generated skills are ignored by a fixed directory pattern

`.gitignore` uses:

```
**/skills/openspec-*/
!/skills/openspec-*/
**/skills/.openspec-target
**/commands/opsx/
**/commands/openspec/
```

The negation keeps the repository's own root skills. The exact behavior must be checked with `git check-ignore -v` for both a root skill and a tool-directory skill. The `commands/` patterns cover the legacy command surface; OpenSpec 2.0 installs skills only, but older local installations may leave commands.

Local installation remains allowed because ignored files are not staged and not part of a pull request. Only `git add -f` or a renamed copy reaches CI, where the path and content checks catch it.

### External review happens before merge, not before implementation

The `development-workflow` review gate is modified so:

- maintainer-authored changes review the plan before implementation;
- external contributions receive the draft review before merge, and the apply review before archive.

The maintainer's first `openspec_review action=start review=draft` writes the policy for a CLI-created change through `ensurePolicy`; no contributor-side policy file is needed. Review records stay under `openspec/.review/` and are never committed. The pull request remains self-contained: change artifacts, tasks, code and tests.

Alternative considered: require contributors to run the plugin review before opening the PR. That reintroduces the DSH dependency the CLI-only path is meant to remove. Alternative: skip review for external PRs. That removes the repository's quality gate and conflicts with `development-workflow`.

### Evidence and scope live in templates, not in prose

Issue templates ask for reproduction, acceptance commands, allowed and forbidden paths. The pull request template asks for the change name, linked issue, root cause, evidence, risk and rollback, plus an optional GitHub handle, agent name, model and session. Templates are English and are the primary place contributors learn what CI cannot check, such as semantic plan quality.

`CODEOWNERS` requests maintainer review for `.github/`, `.githooks/` and `coverage.baseline.json`. The CI restricted-path check is absolute: it has no approval input, so a maintainer who needs a restricted change makes it in a separate maintainer-authored change. CODEOWNERS alone would not stop a merge on a repository plan that does not require code-owner review.

## Risks / Trade-offs

- macOS has no CI job, so bootstrap's macOS path is unverified by automation. Mitigation: keep the shell POSIX, run `sh -n`, and have the first external contributor run `./scripts/bootstrap.sh --full` as an acceptance step.
- The lab job adds several minutes to every pull request. Mitigation: cache the DSH and browser directories, separate the job, and keep `verify` independent.
- The generated-skill content markers are tied to the CLI's frontmatter. Mitigation: anchor on `allowed-tools` plus `author: openspec`, keep the root-skill exception explicit, and update the check when the CLI changes.
- Every pull request needs a change, including documentation fixes. Mitigation: issue and PR templates show a minimal change; the cost is accepted to keep one reviewable unit.
- Fork pull requests need maintainer approval before their workflow runs. Mitigation: document it in `CONTRIBUTING.md`; same-repository branches run without that extra step.
- `npm ci` executes dependency install scripts. Mitigation: restricted-path checks block dependency and workflow changes, the workflow has read-only permissions and no secrets, and fork runs require approval.
- External contributors may use different GitHub identities, so audit relies on PR metadata rather than a single account. Mitigation: optional handle/agent/model/session fields and GitHub's own authorship record.
- The bootstrap download depends on `nodejs.org` and npm registry access. Mitigation: checksum verification, `--node-mirror` and `--registry` overrides, and proxy inheritance.
- The host-state promise is easy to break silently. Mitigation: task 7.4 snapshots shell and global Git configuration, checks `git status --porcelain` after a full run, and greps both bootstrap scripts for `openspec init` and `openspec update`.
- The maintainer handoff on a CLI-created change is asserted by the design rather than exercised. Mitigation: task 7.5 creates a scratch CLI change, starts a draft review, and confirms the policy write.
- The fallback download path is not exercised by a host Node run. Mitigation: unit tests cover asset and checksum planning, and task 7.6 runs the download path without a qualifying host runtime.
- The baseline Node version can drift from the bootstrap fallback or CI. Mitigation: `bootstrap-lib` reads `coverage.baseline.json` at runtime, CI derives setup-node from the same file, and a pin test fails when either diverges.

## Migration Plan

No runtime migration. Add the new files, update `.gitignore` and the two pointers, and enable the workflow. Rollback is removing the added files and reverting `.gitignore` and the two documentation pointers; no data or dependency changes are involved.

## Open Questions

None that change the specs or task breakdown. Exact CI cache keys and runner versions are implementation details fixed during apply.
