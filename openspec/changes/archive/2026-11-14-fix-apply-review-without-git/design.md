# Design: apply review without git

## Context

See `proposal.md` for the motivation. `buildPolicy` already receives `gitEnabled` and records it as `policy.git.enabled`, but the apply section still copies `settings.reviews.apply.enabled`. `openspec_archive`'s gate already returns early when the project has no git, so the tool-level wait does not exist; the wait comes from the archive skill, which checks apply status first, and from `lib/policy.js` and `docs/review.md`, which state the gate without the no-git exception. `openspec_review` apply status throws instead of answering, so the skill has no structured signal to branch on.

## Goals

- Lock apply review disabled in a policy created without git, without changing the settings schema or rejecting the change.
- Make apply status answer with `policy`, `enabled` and `available` so an agent can distinguish "no policy yet", "cannot run", "disabled" and "not ready".
- Keep the archive tool's existing no-git skip and cover it with a regression test.
- Align the archive/apply skills, the flow rule, README and `docs/review.md` with the tool behavior.

## Non-Goals

- Changing behavior for a git repository with no commits; it still needs a commit before apply review.
- Changing draft review availability without git.
- Migrating existing policy files or deleting review records.
- Changing apply `start` refusal, report validation, readiness, or the archive gate logic.
- Changing the review configuration page.

## Decisions

### Lock apply review off when the policy is built without git

`buildPolicy` is the single place that turns settings into a per-change policy. Forcing `reviews.apply.enabled` to false there covers both `openspec_new_change` and the first draft review of a legacy change without touching the settings file. `git.enabled: false` remains the recorded reason, and the apply section keeps its other locked fields so the record shape is unchanged.

Alternative: reject change creation when apply review is enabled and the project has no git. That blocks the only usable review flow and contradicts the requested "ignore the option" behavior. The user can still create and plan the change; only the apply review is unavailable.

### `policy`, `enabled` and `available` are separate axes

`policy` is true when the locked policy carries an apply section; a policy file with only a draft section therefore reports false. `enabled` reflects that section and is false without it. `available` is false when `isGitRepository` is false; unavailable takes precedence over an unset policy. The archive skill checks `available`, then `policy`, then `enabled`, then `ready`; each state names a different next action. The apply skill starts the review when `policy` is false and `available` is true, because the first start locks a policy or migrates a draft-only one.

Alternative: collapse these states into one `enabled` boolean. A policy-less legacy change and a policy that disables apply review would then look identical; a status-first apply skill could skip the first-start lock the main spec requires. Alternative: derive `enabled` from the current settings. A later settings edit would then change how an existing change reports, violating the policy lock and disagreeing with `openspec_archive`, which reads the policy.

### Status returns a projection; start still refuses

`status` is a query: it must answer even when the answer is "not available". `start` is a command: asking to run an impossible review remains an error, so the existing actionable failure stays. The status projection sets `ready: false` and a reason per state: missing git names `openspec_archive` and takes precedence over an unset policy; an existing apply section that disables apply review names `openspec_archive`; a missing policy or apply section says the first start locks or migrates one and names `openspec_review` with `action: "start"`.

Alternative: keep the status error and have the archive skill treat that error text as "continue". Error-text branching is brittle and cannot be validated by the tool contract; the explicit booleans are testable and reachable by any client.

### Keep the archive gate as it is

The gate already returns before reading the policy or record when the project has no git. Changing it would be redundant. A regression test creates a policy with `reviews.apply.enabled: true` in a no-git project and asserts archive proceeds, which locks the behavior against a future refactor.

Alternative: check git availability only after reading the policy, or fail closed when the policy is missing. Both would reintroduce the wait this change removes.

### No migration of existing policies

Policies are immutable. A policy created before this fix may still say apply review is enabled in a no-git project; status reports `policy: true`, `enabled: true`, `available: false`, and the archive gate handles it. Rewriting policy files during a read would break immutability and touch records outside a review action.

### Skills branch on the status fields

The archive skill stops only when `policy`, `enabled` and `available` are true and `ready` is false; it continues for unavailable, no-policy and disabled states, stating which. The apply skill starts the review when `policy` is false and the project has git, and skips only when the project has no git or a locked policy disables it. This removes the need for an agent to infer availability from an error or to run git itself.

## Risks / Trade-offs

- **A no-git project archives without apply review** → Intended: the review object cannot exist. Draft review remains the gate for planning.
- **Legacy policies still show apply enabled in their file** → Status reports `policy: true`, `enabled: true`, `available: false`; the settings page already marks the project as having no git, and the archive gate uses `available`. No migration is worth breaking policy immutability.
- **An agent ignores the new fields and still waits** → The spec, the flow rule and both skills name `policy`/`enabled`/`available`; the tool tests lock the status shape.
- **A policy-less legacy change or a draft-only policy could be mistaken for a disabled review** → `policy: false` covers both; the apply skill starts the review so the first start locks or migrates a policy, and the archive skill continues because the gate does not wait for one.

## Migration Plan

1. New policies in a no-git project lock apply review disabled; existing policy files are untouched.
2. Existing no-git policies with apply review enabled report `policy: true`, `enabled: true`, `available: false` and archive without waiting.
3. Policy-less legacy changes and policies with only a draft section report `policy: false`; their first apply start locks or migrates the apply section.
4. Rollback reverts the code and text; no stored shape changes, so records remain readable.

## Open Questions

None.
