# Tasks

## 1. Guide

- [x] 1.1 Write the decision and compatibility-gate sections of `docs/upgrading-dsh-runtime.md`; verify every DSH module and symbol they cite exists in the installed runtime, and every command matches `dsh --help` or `dsh plugin --help`.
- [x] 1.2 Write the DSH coupling inventory; verify each `file:line` entry resolves to the stated construct with `grep -n`.
- [x] 1.3 Write the ordered edits, test matrix, release and rollback sections; verify each referenced path exists and each `npm` or `dsh` command matches a package script, the CLI help, or a documented subcommand.
- [x] 1.4 Write the acceptance checklist and sources; verify each local path exists, each URL resolves, and the pin named in this guide matches `package.json` and the baseline in `docs/upgrading-openspec-cli.md`.
- [x] 1.5 Link the guide from the version-compatibility section of `README.md` and replace the inline four-step procedure; verify the link target exists and the section still states the exact pins and the skip-bundle behavior.

## 2. Verification

- [x] 2.1 Validate the change with `openspec_inspect` using `action: "validate"`, `change: "add-dsh-upgrade-guide"` and `strict: true`; verify it reports valid.
- [x] 2.2 Run `npm test` on Node 24; verify the exit code is zero.
- [x] 2.3 Run `npm run coverage:check` on Node 24; verify the exit code is zero.

## Workflow follow-up

- Archive the change only when the user asks.
- After archiving, commit the archive, the guide, the README change and the merged spec in one commit, then push to `origin/main`.
