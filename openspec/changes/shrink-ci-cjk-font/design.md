# Design

## Context

See `proposal.md` - Why. The evidence from CI run `44451946620` (lab job `135317768542`):

- `install CJK font` started at 03:31:06 and completed at 03:51:01: 19m55s of a 22m30s job.
- `apt-get update` fetched 3.5 MB in 1s; the only package installed was `fonts-noto-cjk`, a 61.2 MB archive.
- The runner reported `Fetched 61.2 MB in 19min 34s (52.1 kB/s)` from `us-east-2.ec2.archive.ubuntu.com`.
- The later `playwright install --with-deps chromium` fetched 21.9 MB in 1m51s and installed `fonts-wqy-zenhei` (7.9 MB) among its dependencies.
- The doctor only requires `fc-list :lang=zh` to return a font (`scripts/lab/core/doctor.mjs`), and `fonts-wqy-zenhei` satisfies it.

## Goals / Non-Goals

**Goals:**

- Cut the font download from 61.2 MB to a package small enough that the download no longer dominates the job.
- Keep the workflow test and the doctor's correction aligned with the package CI installs.

**Non-Goals:**

- Removing the explicit font step or relying on Playwright's dependency list, which changes with the Playwright version.
- Changing the doctor's font check, the lab scenarios or the report schema.
- Changing `docs/lab.md` or `CONTRIBUTING.md`, which name no package.

## Decisions

**Decision 1: keep an explicit font step and install `fonts-wqy-zenhei`.**

The step stays explicit because `playwright install --with-deps` is a third-party dependency list that can change without this repository noticing; relying on it would make the doctor fail silently on a Playwright upgrade. `fonts-wqy-zenhei` is 7.9 MB in the same Ubuntu archive and provides full CJK coverage. Alternative considered: delete the step and rely on Playwright's `fonts-wqy-zenhei`; rejected for the coupling above. Alternative considered: `fonts-noto-cjk-extra`; rejected because it adds archive data without changing the check. Alternative considered: `fonts-wqy-microhei`, which is smaller; rejected because its `zh` coverage was not verified for this runner while the Playwright dependency already installs `fonts-wqy-zenhei`, so the archive is known to carry it.

**Decision 2: assert the package the workflow installs.**

`test/ci-workflow.test.mjs` currently asserts the literal `fonts-noto-cjk`; it changes to `fonts-wqy-zenhei`. The test's purpose is to keep the lab job's prerequisites in place, so it should fail when the package changes without the test, the same way the pnpm pin test works.

**Decision 3: name the same package in the doctor's correction.**

`checkCjkFont` returns three failure details: `fc-list is unavailable (...)` at line 174, `fc-list :lang=zh failed` at line 177, and `no CJK font found; install Noto Sans CJK or set FONTCONFIG_FILE` at line 180. Only line 180 reports a missing font; lines 174 and 177 report a broken or failing `fc-list`, and their generic `install ... a CJK font` advice stays. The change edits line 180 to name `fonts-wqy-zenhei` and keeps the `FONTCONFIG_FILE` override. The `lab-harness` requirement only asks the message to name a font package or the override, so no `lab-harness` delta is needed.

## Risks / Trade-offs

- [The Ubuntu archive may not carry `fonts-wqy-zenhei` under a future release] → The workflow test and the doctor message both name it, so a missing package fails visibly at the apt step; this run's Ubuntu 26.04 archive carries it.
- [A 7.9 MB download is still slow on a degraded runner] → It is bounded and roughly eight times smaller; the job's timeout margin grows from about 7 minutes to about 26 minutes.
- [The doctor's message text is asserted loosely] → `test/lab-doctor.test.mjs` gains a stub `fc-list` that exits zero with empty output, so the empty-output branch that carries the package name is asserted directly; the existing `fc-list`-unavailable test keeps its loose alternation.
- [The runtime outcome is observed only after push] → The change's goal is met when the next `main` run shows the font step no longer dominating the job; the Workflow follow-up records that duration instead of treating the repository checks as proof of the timing.

## Migration Plan

Revert the single commit. No stored data, configuration or runtime surface is involved.

## Open Questions

None.
