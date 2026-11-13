# Add the review configuration page

## Why

Review behavior is locked per change, but the only way to set the template is the profile patch. Reviewers, round limits and the reviewer model cannot be inspected or edited from the Web UI, and the reviewer model still inherits the changer implicitly instead of being a visible, locked choice.

## What Changes

- Add `reviews.draft.reviewerModel` and `reviews.apply.reviewerModel`, each with `source: "inherit" | "explicit"` plus `provider`, `model` and `reasoningEffort`.
- Resolve `inherit` to a concrete model when the change policy is locked; fail closed when no model can be resolved.
- Pass the locked model as `agentOptions` to the reviewer activation.
- Add a Host RPC channel for model discovery, settings reads/writes and locked-policy summaries.
- Add a Client half and a `plugins.row.config` page for both reviews: switches, reviewers (0/1), rounds, wait minutes, model and reasoning effort, inherit display, and locked-policy summary.
- Keep the existing hand-written Standard Schema; the page writes through `configEditor` and the Host validates before saving.
- Serve the Client half as a hand-written loader bundle declared under `dsh.client`, so the package keeps no build step and no new dependency.

## Capabilities

### New Capabilities

- `review-configuration`: the review settings page, its Host Remote, model discovery, validation and save behavior.

### Modified Capabilities

- `change-review`: the locked reviewer model and its use in the reviewer activation.

## Impact

- `index.js` and `lib/review/config.js`: reviewer model settings and validation.
- `lib/review/policy.js`: resolved model in the policy, plus migration for older policies.
- `lib/tools/review.js`: `agentOptions` on reviewer activation.
- `lib/review/settings.js` (new): the Host RPC channel and its model catalog cache.
- `lib/client/channel.js` (new): the endpoint names and error envelope both halves share.
- `client.js` (new): the configuration page bundle.
- `package.json`: the `./client` export, the `dsh.client` manifest and the packaged files.
- Tests: Host Remote, model resolution, policy locking, page save validation.
