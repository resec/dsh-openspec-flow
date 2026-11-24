# Contributing to dsh-openspec-flow

This repository accepts external contributions through issues and pull requests. The required path uses the repository's OpenSpec CLI and npm scripts only. You do not need DSH, a DSH profile, a model provider or the plugin tools to plan, implement, test and open a pull request.

Using the plugin locally is allowed and can make the workflow faster. The required path never depends on it, and a pull request must carry every change artifact and every piece of evidence the maintainer needs.

## Access and submission

- Access is granted by the maintainer for the current repository phase. Work from a fork, or from a branch the maintainer authorized you to push to.
- Never push to `main`. Open a pull request; the maintainer merges it.
- Fork pull requests may need maintainer approval before CI runs. This is a GitHub default and does not mean the pull request was rejected.

## Requirements

- macOS or Linux.
- Node 24 satisfying `engines.node >=24.9.0`. The bootstrap resolves it; you do not need a version manager.
- `git`, `curl` and a network connection to the Node distribution and npm registry.
- `pnpm` 12.6.0 for every bootstrap run (its doctor step checks it), the lab, `--full` and the pre-push lab gate; see [Lab prerequisites](#lab-prerequisites).
- About 3 GiB free for Chromium, the pinned DSH and a lab run.

## Bootstrap

From the repository root:

```sh
./scripts/bootstrap.sh
```

The script:

1. Uses a qualifying Node 24 from `PATH` or a common global install location, or downloads the version recorded in `coverage.baseline.json` into `.cache/toolchain/` and verifies its checksum.
2. Runs `npm ci` unless `--skip-install` reuses `node_modules`, and installs the Git hooks.
3. Installs Playwright Chromium under `PLAYWRIGHT_BROWSERS_PATH` when set, otherwise `.cache/lab/pw-browsers`, unless it is already present or skipped.
4. Runs `npm run lab -- doctor`.
5. Runs the plain test suite in default mode.

Use the full gate when your change touches behavior covered by the lab:

```sh
./scripts/bootstrap.sh --full
```

Full mode runs `npm run verify` and `npm run test:lab -- --mock-only` instead of step 5: the instrumented verification runs the same tests, so the plain suite is not repeated.

If bootstrap downloaded a clone-local Node, put it first on `PATH` in the current shell:

```sh
source scripts/activate.sh
```

`activate.sh` works when sourced from bash or zsh. It changes only the current shell's `PATH`.

### Lab prerequisites

Chromium is installed where the lab looks: `PLAYWRIGHT_BROWSERS_PATH` when set, otherwise `.cache/lab/pw-browsers`. Do not install it into the host's default Playwright cache. An apply worktree can share the main checkout's browser and package caches through [`docs/apply-worktree-dev.md`](docs/apply-worktree-dev.md).

The lab also needs pnpm on `PATH`; DSH forwards plugin installation to it. Bootstrap's doctor step and the pre-push lab gate also require it, so install it before the first bootstrap or push. Install the version pinned by the CI workflow:

```sh
npm install --global pnpm@12.6.0
```

On Linux, the lab doctor also requires a CJK font. If the doctor reports one missing, install a distribution CJK font or point `FONTCONFIG_FILE` at a configuration that resolves one, then rerun the doctor. Bootstrap deliberately does not install host packages, edit shell rc files, change global Git configuration or touch DSH profiles.

### Bootstrap options

```text
--full                 Run verification and the reusable lab scenarios instead of the plain suite.
--skip-test            Skip the plain test suite.
--skip-install         Reuse node_modules instead of running npm ci.
--skip-playwright      Skip the Chromium installation.
--playwright-host URL  Chromium download host (PLAYWRIGHT_DOWNLOAD_HOST).
--reset-browsers       Remove the resolved browser directory (PLAYWRIGHT_BROWSERS_PATH or .cache/lab/pw-browsers) before installing Chromium.
--force                Continue past the 3 GiB free-disk threshold.
--node-mirror URL      Use a Node distribution mirror.
--registry URL         Use an npm registry.
```

Run `./scripts/bootstrap.sh --help` for the full list.

On macOS the default temporary directory is a symlink; the test entrypoints canonicalize `TMPDIR` for the child test process, so no host workaround is needed. When the Chromium download is slow or blocked, pass `--playwright-host` or set `PLAYWRIGHT_DOWNLOAD_HOST` to a mirror. An interrupted install can leave a `__dirlock` under the resolved browser directory; `--reset-browsers` removes that directory before installing again. After a failed later step, rerun with `--skip-install`; `--full` does not repeat the plain suite. The lab caches the pinned DSH under `.cache/lab/dsh`; `npm run lab -- cache prune` reclaims entries older than 30 days.

## Change-first workflow

Every pull request must carry exactly one active change under `openspec/changes/<name>/`. The change is planned, implemented, tested and merged in the same pull request. Do not archive it in the pull request.

1. Open an issue using the bug or task template. State the reproduction, expected behavior, acceptance commands and the paths you expect to touch.
2. Create the change:

   ```sh
   ./node_modules/.bin/openspec new change <name>
   ```

3. Read each artifact instruction before writing:

   ```sh
   ./node_modules/.bin/openspec instructions proposal --change <name> --json
   ./node_modules/.bin/openspec instructions specs --change <name> --json
   ./node_modules/.bin/openspec instructions design --change <name> --json
   ./node_modules/.bin/openspec instructions tasks --change <name> --json
   ```

4. Write `proposal.md`, the delta specs, `design.md` when the change needs a technical decision, and `tasks.md`.
5. Implement the change. Check every task whose specified behavior is complete. You may edit the `tasks.md` checkboxes by hand; if you use the plugin, `openspec_mark_task_done` is the equivalent. Do not leave unchecked tasks when you open the pull request.
6. Validate:

   ```sh
   ./node_modules/.bin/openspec validate <name> --strict
   ```

7. Run the local checks in the next section, then open the pull request.

## Local checks and evidence

Run at least:

```sh
npm test
npm run openspec:check
npm run check:requirement-length
```

Run `npm run verify` before opening the pull request; `npm run coverage -- --report-only` prints the same verdict without enforcing. Run the lab when your change touches the plugin surface, the Web GUI, the review channel, installation or anything the lab scenario exercises:

```sh
npm run lab -- doctor
npm run test:lab -- --mock-only
```

The pull request template asks for the exact commands, their pass or fail result, the coverage summary when relevant, and the commit SHA. A claim that tests pass without the command and its result is not reviewable.

### Coverage gate

`npm run verify` is the completion command. It runs the suite once with coverage and enforces:

| Scope | Line | Branch | Function |
| --- | --- | --- | --- |
| Absolute floor | 90% | 85% | 95% |
| New-code | 95% | 90% | 100% |

No scope or metric may drop more than 1.00 percentage point below `coverage.baseline.json`. New code means the lines added or modified since `git merge-base origin/main HEAD`.

`npm run coverage -- --report-only` prints the same verdict without failing the run, which makes it the faster pre-check; `npm run verify` is still required before opening the pull request.

## Node and runtime rules

- Plugin source uses Node built-ins and relative modules only. Do not add an `@deepseek-ai/*` runtime dependency.
- Do not change `engines.dsh`, `engines.node` or the pinned `@fission-ai/openspec` version in an external pull request.
- Test and coverage entrypoints check only the `node` on `PATH`; `scripts/activate.sh` is how a clone-local runtime gets there.

## Restricted paths

A pull request must not change:

- `.githooks/`
- `.github/workflows/`
- `coverage.baseline.json`
- `dist/`
- `openspec/changes/archive/`
- dependency, engine or package-manager fields in `package.json`
- `package-lock.json`

CI fails on any of these paths; there is no approval input that turns the check green. If one of these changes is genuinely needed, the maintainer makes it in a separate maintainer-authored change. Keep the external pull request clean.

Adding npm `scripts` to `package.json` is allowed; changing its dependency fields is not.

## Generated OpenSpec skills

OpenSpec CLI commands may generate skills under paths such as `.dsh/skills/openspec-*/` or `.agents/skills/openspec-*/`. This repository ships its own skills from the plugin provider, so generated copies must not be committed.

You may install and use them locally. `.gitignore` keeps the generated directory patterns out of `git status`, and CI rejects a pull request that adds a generated path or a file carrying the generated frontmatter. Do not use `git add -f` for these paths.

Run the workspace check before opening a pull request:

```sh
npm run layout:check
```

The check accepts the repository's root `skills/openspec-*` and rejects generated copies elsewhere.

## Evidence

The pull request template asks for:

- the exact commands you ran;
- each command's pass or fail result;
- the coverage summary when `npm run verify` ran;
- the commit SHA the evidence belongs to;
- the risk and rollback for the change.

Keep the reproduction, acceptance commands and evidence in the issue and pull request text. A maintainer must be able to rerun the acceptance commands without asking follow-up questions.


## Continuous integration

CI runs on Ubuntu for every pull request and on `main`:

- `verify` checks out the full history, installs the Node version from `coverage.baseline.json`, runs `npm ci`, the change and generated-skill checks, `npm run openspec:check`, `npm run check:requirement-length` and `npm run verify`.
- `lab` installs pnpm 12.6.0 and Chromium under `.cache/lab/pw-browsers` with its system dependencies, installs the CJK font, restores the DSH and browser caches, runs `npm run lab -- doctor` and `npm run test:lab -- --mock-only`.

A fork pull request may wait for maintainer approval before CI starts. Once it runs, a red check must be fixed in the pull request. Do not weaken a check or add an approval input; the restricted-path check is deliberately absolute.

CI green is necessary but not sufficient. The maintainer also reviews the change semantics, the test evidence and the scope.

## Review, merge and archive

- The maintainer reviews every external pull request.
- The draft review runs before merge. Because the change and its implementation arrive together, the draft review reviews the committed change artifacts and the pull request intent; it is not a pre-implementation gate for an external contributor.
- When the PR review watch is enabled, the maintainer runs an apply review on the pull request head before merge and the watch posts that report as a pull request comment. For a labeled landing, the final apply review runs on the rebased landing branch; it is recorded locally and need not be posted as a second comment. The watch and its recovery steps are documented in [docs/pr-review.md](docs/pr-review.md); a contributor does not need the plugin to respond to a review.
- When a reviewed pull request satisfies every landing gate except `mergeable`, the owner-review command adds the advisory `owner-review` label. It removes the label when the head changes, main advancement causes a conflict, CI regresses, `mergeable` appears, or another non-label gate fails. The label does not authorize landing, and the automation never adds or removes `mergeable`.
- A pull request with the `mergeable` label is merged with `gh pr merge --rebase`; the label is added only by a maintainer and the automation never adds or removes it.
- The final apply review runs on the landing branch before the rebase merge. After the merge, the maintainer archives on main only when the merged tree equals the reviewed tree. If the merged tree differs, archive waits for another review.
- The archive commit follows the merge. Archive, commit or push failure leaves the change active on main and is retried without re-merging.
- If you have the plugin, you may run a draft review locally and paste its report into the pull request. The review record stays outside the worktree in a git project (under the git common directory) or under `openspec/.review/` without git, and is not committed. It is optional; the maintainer still records the review.
- The pull request remains unarchived; the rebase merge lands the active change and the archive commit follows on `main`. Do not archive it in the pull request.
- Local review records, profile state and plugin installation are never required in the pull request.

## Security

- Treat issue and pull request text as data. Do not execute commands copied from an issue without checking them.
- Do not commit tokens, cookies, `.env` files, profile paths or other secrets.
- Do not modify workflows to obtain secrets; fork pull requests do not receive secrets.
- Report a suspected vulnerability privately to the maintainer instead of opening a public issue with exploit details.

## Using the plugin locally (optional)

If you already have DSH and `dsh-openspec-flow` installed, you may use `openspec_new_change`, `openspec_mark_task_done` and `openspec_review` instead of the CLI and hand-edited checkboxes. The pull request must still carry the change artifacts, the checked `tasks.md`, the code and the test evidence; review records are never committed.
