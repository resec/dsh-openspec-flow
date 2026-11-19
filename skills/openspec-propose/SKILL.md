---
name: openspec-propose
description: Propose a new OpenSpec change with the openspec_* tools, creating the change, reading each artifact instruction, writing proposal, specs, design and tasks, then validating. Use when the user wants to plan a change.
whenToUse: The user wants a new OpenSpec change created end to end and the planning artifacts ready for review.
metadata:
  generatedBy: dsh-openspec-flow@0.9.0
  upstream: openspec@2.0.0
---

# Propose a change with the plugin tools

Use the `openspec_*` tools for every step. If a core tool is unavailable, report it and stop. `openspec_init` is a management tool: when it is unavailable, ask the user to run `/opsx-admin` and continue after it appears.

## Before creating

- Confirm the request. If the goal is ambiguous, ask before proposing.
- If the project is not set up (`openspec_inspect` with `action: "list"` returns `setup: false`), ask whether to run `/opsx-admin init`, target a store, or skip OpenSpec.
- Read the existing specs the change may touch, before proposing its scope:
  1. `openspec_inspect` with `action: "list"` and `specs: true` for the capability inventory.
  2. `openspec_inspect` with `action: "show"`, `type: "spec"` and `noScenarios: true` for a filtered overview of each candidate capability.
  3. `openspec_inspect` with `action: "show"` and `type: "spec"` for each capability the overview shows is relevant; this read includes its scenarios.
  Name the capability and requirement each conclusion rests on. If the change contradicts an existing requirement, surface the conflict and ask instead of deciding it silently.
- State the kebab-case change name, the artifacts it will produce, and the existing specs the change touches, then wait for the user's confirmation.

## Create

Every `openspec_inspect` result with `action: "instructions"` may carry `context` and `rules` from `openspec/config.yaml`; apply them to the artifact you write.

1. Call `openspec_new_change` with the confirmed name, and a description or goal when the user gave one.
2. Call `openspec_inspect` with `action: "instructions"` for `proposal`. Read the instruction and write `proposal.md` at the returned `outputPath`, following the template.
3. Call `openspec_inspect` with `action: "instructions"` for `specs`. Write one delta spec per capability listed in the proposal, using `## Purpose` for a new capability and `## ADDED` / `## MODIFIED` / `## REMOVED` / `## RENAMED Requirements` for the deltas.
4. Call `openspec_inspect` with `action: "instructions"` for `design`. Write `design.md` only when the change crosses modules, adds a dependency, changes data, or needs a technical decision.
5. Call `openspec_inspect` with `action: "instructions"` for `tasks`. Write `tasks.md` with numbered checkbox tasks grouped by `## 1. ...` headings.
6. Call `openspec_inspect` with `action: "validate"` for the change. Fix findings and re-validate.

## Draft review

Run the draft review before presenting the proposal. The draft object is the change artifacts and the user's intent, not a commit or a git tree; do not require a commit. Several changes may hold draft reviews at the same time; this review belongs to one change and does not wait for another.

1. Call `openspec_review` with `action: "start"`, `review: "draft"`, the change name and an `intent` that states the user's goal and acceptance conditions. `start` is the first round only.
2. Read the returned `brief`. Check coherence, the user's goal, conflicts with the main specs, artifact form, feasibility and scope.
3. When the change uses `reviewers: 0`, call `openspec_review` with `action: "self-report"` and `review: "draft"`, plus one report: `verdict`, `summary`, `findings`, `verifications`, `outOfScope` and `residualRisks`. Use the report format in the brief. When it uses `reviewers: 1`, call `action: "wait"` with `review: "draft"`; when it returns `waiting`, end the turn and continue after the wakeup (the reviewer submit or the wait deadline); do not submit a self-report.
4. If the result is not ready, fix the findings. When at least one finding needs a disposition, dispose them in a single `openspec_review` call with `action: "dispose"` and `review: "draft"`, or a finding `action: "waive"` and `review: "draft"`, plus `dispositions` (each entry carries its `id`, `status` and fields); one finding may use the single `id` form. Only then call `openspec_review` with `action: "resume"` and `review: "draft"` to open the next round. When the only blocker is the requirement-length gate and no finding needs a disposition, edit the artifacts and call `action: "resume"` with `review: "draft"`; do not call `dispose`. Do not pass an `intent` and do not call `start` again. `start` and `resume` reject `dispositions`. Do not present the proposal while a blocker is open.
5. If a finding is fixed, verify it in a later round; if it is waived, record the user's approval and the waiver text.

## Review report

Each round is reported by the plugin card: in the reviewer session for an independent review, and in the changer session for a self review. An independent review does not show a review card in the changer session; `report` still returns the stored report. Do not restate findings, evidence, risks, scope or disposition notes. Write one short note only for information the report cannot express and the user must know, such as a trade-off, an authorization need or the next step. Do not count rounds; continue until the review is ready.

## Then stop

- Present the proposal, specs, design and tasks, the validation result and the draft review status.
- Do not start implementation. Apply begins only when the user asks.
