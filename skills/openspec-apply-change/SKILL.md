---
name: openspec-apply-change
description: Implement tasks from an OpenSpec change with the openspec_* tools. Use when the user wants to start, continue, or finish implementation.
whenToUse: The user wants to implement, continue, or finish an OpenSpec change in a project that has the dsh-openspec-flow plugin.
metadata:
  generatedBy: dsh-openspec-flow@0.9.0
  upstream: openspec@2.0.0
---

# Apply a change with the plugin tools

Use the `openspec_*` tools for every step. If a core tool is unavailable, report it and stop. `openspec_init` is a management tool: when it is unavailable, ask the user to run `/opsx-admin` and continue after it appears.

## Start

1. Call `openspec_inspect` with `action: "list"`. If `setup` is false, stop and report that the directory is not an OpenSpec project; do not run `openspec_init` unless the user asks, and ask the user to run `/opsx-admin init` when it is needed.
2. If no change is named, infer it from context. If several exist, ask.
3. Call `openspec_inspect` with `action: "status"` for the change. If `isPlanningComplete` is false or artifacts are missing, finish planning first; do not start apply.
4. Call `openspec_apply_next` once. Every `contextFiles` path is relative to `root.path`; join them with that absolute root before reading. Read every listed file before editing. Treat `instruction` as the current guidance, and follow `context` and `guidance` when those fields are present. If `state` is `blocked`, stop and report the instruction and `missingArtifacts`.
5. When the change lives in a store, pass the same `store` on every call.

## Loop

- Work through the pending tasks in order; keep each change scoped to its task.
- Verify the checkbox's whole paragraph at `next.sourcePath` and `next.line` still matches `next.description`; a task that wraps onto following lines reads as one paragraph, and `sourcePath` is relative to `root.path`, so resolve it against that root first. If it moved, call `openspec_apply_next` once to resync.
- Mark finished tasks with `openspec_mark_task_done`, passing every id finished since the last call in `taskIds`; include `next.sourcePath` and `next.line` when the batch starts at `next`.
- Continue with the `next` returned by that call. Do not re-run `openspec_apply_next` between tasks.
- If a result entry is `already-done`, that task needed no change; continue with the returned `next`.
- If `state` is `all_done`, leave the loop.

Mark a task only when its specified behavior is fully implemented, not when it is partially done, deferred, or covered by a narrowed interpretation.

## Pause

Ask before continuing when a task is unclear, the implementation reveals a design issue, the work needs scope beyond the spec and tasks, or a check fails repeatedly.

## Seal and plan changes

- In a git worktree apply the plugin seals the draft on the change's apply branch at the first apply and keeps it off main; the change directory and the plugin-written `openspec/.gitignore` stay uncommitted, and apply refuses genuine dirt outside them and other changes' directories. In a project with the worktree disabled, the first `openspec_apply_next` requires a committed-`HEAD` seal: commit the change directory and that ignore file; other `openspec/changes/` paths may appear in `HEAD`, but stage only those two. A commit that changes anything else, or artifacts that changed after the draft review, is refused.
- In a git project the apply runs in a plugin-created worktree. `openspec_apply_next` returns `worktree.path` relative to `root.path`, moves the session there, and keeps `root.path` as the main worktree; use the session directory for implementation writes, not the main worktree. `openspec_mark_task_done`, `openspec_inspect` `action: "validate"` and apply review use the worktree; `list`, `status`, `show`, `instructions` and `context` stay main reads. Different changes have independent change locks and may apply concurrently; the same change is serialized by its change lock. Inspect worktree state and locks with `openspec_inspect` action="worktree" and recover a dead lock with `openspec_apply_worktree` action="recover".
- The draft review can be resumed until apply starts. After apply started, a plan change needs the user's written approval, recorded with `openspec_review` (`action: "waive"`, `scope: "plan-change"`, `files`; not `dispositions`) before you edit. `files` are recorded relative to the change directory (for example `["proposal.md","tasks.md"]`); absolute and project-relative forms under the change directory are also accepted, and a path that escapes the change directory or names another change is refused. Apply review reviews the changed planning artifacts.

## Apply review

After the loop reaches `all_done`, and before reporting completion:

1. Commit every changed file for this round. The apply review object is the committed git tree, so an uncommitted working tree is not reviewable.
2. Call `openspec_review` with `action: "status"`, `review: "apply"` and the change name. When the change has an apply worktree, pass `worktree` returned by `openspec_apply_next` to the apply review start/resume so the reviewer reads the implementation tree. When `available` is false, say the project has no git repository and skip the review. When `policy` is true and `enabled` is false, say the review is disabled and skip it. Otherwise call `action: "start"` with `review: "apply"` for the first round and read the returned brief and generated diff; with `policy: false`, the start first locks or migrates the policy. A later round uses `action: "resume"` with `review: "apply"` and no intent. When the start reports that the locked policy disables apply review, say the review is disabled and continue without it. When land refuses a worktree behind main, rebase and retest, then resume the apply review: it opens an extra round (`roundToken` `E1`, `E2`) that does not consume a normal round number; submit and dispose its findings like any round, and land only after that extra round is ready.
3. When the change uses `reviewers: 0`, call `openspec_review` with `action: "self-report"` and `review: "apply"`, plus one report. When it uses `reviewers: 1`, call `openspec_review` with `action: "wait"` and `review: "apply"`; when it returns `waiting`, end the turn and continue after the wakeup (the reviewer submit or the wait deadline); do not submit a self-report. Fix every blocker, then dispose the findings in a single `openspec_review` call with `action: "dispose"` and `review: "apply"`, or a finding `action: "waive"` and `review: "apply"`, plus `dispositions`; one finding may use the single `id` form, and only then call `action: "resume"` with `review: "apply"` for another round until the review is ready. `start` and `resume` reject `dispositions`.

## Review report

Each round is reported by the plugin card: in the reviewer session for an independent review, and in the changer session for a self review. An independent review does not show a review card in the changer session; `report` still returns the stored report. Do not restate findings, evidence, risks, scope or disposition notes. Write one short note only for information the report cannot express and the user must know, such as a trade-off, an authorization need, a wait timeout or the next step. Do not count rounds; continue until the review is ready.

## Finish

- Call `openspec_inspect` with `action: "validate"` for the change.
- Report the completed count, the remaining tasks, every validation issue and the apply review status. A plugin-created worktree change is finished by `openspec_apply_worktree action=land` with `approvedBy: "user"` only after the user explicitly asks; `openspec_archive` refuses it. Report the land and archive commits and the cleanup outcome from the land result; land removes the worktree and local branch and keeps the archived state and manifest, and a failed cleanup is retried by calling land again.
- Archiving belongs to `openspec-archive-change`; use it only when the user asks.
