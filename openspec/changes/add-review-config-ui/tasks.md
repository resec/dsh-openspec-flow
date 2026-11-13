# Tasks

## 1. Reviewer model config

- [x] 1.1 Add `reviewerModel` to draft and apply config normalization with `source`, provider, model and reasoningEffort; verify defaults, explicit values and invalid shapes.
- [x] 1.2 Resolve `inherit` during policy creation and write the concrete model; verify resolution success and fail-closed failure.
- [x] 1.3 Migrate a policy without `reviewerModel` on first review start; verify it is written once and not changed afterwards.
- [x] 1.4 Pass the locked model as `agentOptions` and validate provider/model/effort before activation; verify each refusal path.

## 2. Host RPC channel

- [x] 2.1 Put the channel path, endpoint names and error envelope in `lib/client/channel.js`; verify both halves import the one constant.
- [x] 2.2 Add `reviewModels.providers`, `models` and `efforts`; verify the returned catalog against a fake LLM service.
- [x] 2.3 Add `reviewSettings.get` and `update`; verify update validates the complete candidate through the schema and the catalog and rejects invalid reviewers, limits and models.
- [x] 2.4 Add `reviewPolicies.list` with only review sections; verify reports and findings are not returned.
- [x] 2.5 Derive the project list from the live agents' working directories and report git per project; verify a non-OpenSpec directory is left out.
- [x] 2.6 Cache the model catalog for 60 seconds and verify a failed lookup returns an error without dropping the old values.
- [x] 2.7 Register the channel as one prefix route on `webServer` fenced by `connection.admit`; verify an unauthenticated request is refused and the route unregisters with the plugin.

## 3. Client page

- [x] 3.1 Add `client.js` registering `plugins.row.config` for `dsh-openspec-flow#openspec-flow`; verify the slot registers in a client test runtime.
- [x] 3.2 Build the draft and apply forms: switches, reviewers 0/1, maxRounds, waitMinutes, inherit, provider/model/effort cascade.
- [x] 3.3 Wire save to `reviewSettings.update` and show rejection reasons; verify a successful save and a rejected save.
- [x] 3.4 Show locked-policy summaries per project and the non-git apply-unavailable state.

## 4. Packaging

- [x] 4.1 Add the `./client` export and the `dsh.client` manifest; verify the loader bundle registers the page in a test runtime.
- [x] 4.2 Add `client.js` to `files`; verify a packed file list includes it.
- [x] 4.3 Update README with the page, channel, model fields and lock behavior; verify the documented keys match the code.

## 5. Verification

- [x] 5.1 Add integration tests for policy lock, inherit failure, explicit model activation, catalog rejection and channel save rejection.
- [x] 5.2 Verify the page in the running Web GUI and report the result; if browser control is unavailable, report the visual check as unverified.
- [x] 5.3 Run validate strict, npm test and coverage:check on Node 24; verify all pass.
