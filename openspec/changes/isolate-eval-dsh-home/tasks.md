# Tasks

## 1. Lazy home paths

- [x] 1.1 Replace the `DSH_HOME`/`SESSIONS_ROOT` constants in `eval/lib/paths.mjs` with `dshHome()` and `sessionsRoot()` functions, update `eval/lib/session.mjs`, and verify `npm run test:eval` passes with an environment override.
- [x] 1.2 Add a test that changes `DSH_HOME` between calls and observes both functions follow it, and verify no module-load constant keeps the old value.

## 2. Private home and profile

- [x] 2.1 Implement `eval/lib/dsh-home.mjs` to create the marked `DSH_HOME` and `DSH_AGENTS_HOME`, generate the headless profile with the plugin link and patch, copy credentials with mode `0600`, and remove both roots safely, and verify `node --test eval/test/eval-home.test.mjs` covers creation, missing credentials, marker refusal and cleanup.
- [x] 2.2 Verify a generated home boots the profile by running `DSH_HOME=<temp> DSH_AGENTS_HOME=<temp> dsh --profile headless --dump-config` and checking the plugin row and model config.

## 3. Matrix integration

- [x] 3.1 Add `home`, `agentsHome`, `sourceHome` and `keepHome` configuration plus `eval:clean`, create the home at the start of `runMatrix`, set both environment variables, and remove them in `finally`, and verify matrix tests with injected home helpers still pass.
- [x] 3.2 Verify `npm run eval:dry` reports the private home paths without creating them, and that an executable matrix leaves no `eval/.dsh-home` or `eval/.agents-home` after a fake-runner pass.

## 4. Documentation and final validation

- [x] 4.1 Update `eval/README.md` and `.gitignore` for the private home, credentials handling, cleanup and the empty agents root, and verify the documented commands match `package.json` and the CLI.
- [x] 4.2 Run `openspec_validate isolate-eval-dsh-home` and `npm run test:all`, and verify both pass.
