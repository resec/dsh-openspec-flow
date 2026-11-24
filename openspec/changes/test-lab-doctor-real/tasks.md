# Tasks

## 1. Call the real doctor checks

- [x] 1.1 Test `checkBrowser` with an empty temporary browser root and with an installed `chrome-headless-shell`, asserting the failure detail and the executable path.
- [x] 1.2 Test `checkBrowserLibraries` with a temporary `ldd` on `PATH` and `platform` `linux`, asserting the missing library, the install command, the resolved case and the non-Linux skip.
- [x] 1.3 Test `checkDisk` with a temporary directory and with a path that does not exist, asserting the measured free space and the informational detail.
- [x] 1.4 Test `checkCache` with an empty temporary cache root and with a verified entry, asserting the will-install and cached details.

## 2. Stop injecting the result under test

- [x] 2.1 Route the missing-cache, missing-browser, missing-pnpm and missing-CJK-font doctor cases through the real functions via `runDoctor`, and keep the `formatDoctor` assertions.
- [x] 2.2 Rename the `browserPresent` case to the behavior the function implements and keep the function.
- [x] 2.3 Replace the `profiles` tautology in `test/lab-env.test.mjs` with a real `createRun` containment check and the `experiments` tautology in `test/lab-discovery.test.mjs` with an exact traversal result.

## 3. Verify

- [x] 3.1 Run `node --test test/lab-doctor.test.mjs test/lab-web-helpers.test.mjs test/lab-env.test.mjs test/lab-discovery.test.mjs`: 23 pass, 0 fail.
- [x] 3.2 Reword the `checkBrowser` message to `no Playwright chromium under` and confirm `test/lab-doctor.test.mjs` fails two cases, then restore the file.
- [x] 3.3 Invert `checkDisk`'s free-space comparison and confirm `checkDisk measures free space under a real directory` fails, then restore the file.
- [x] 3.4 Run `/tmp/b3/gates.sh test-lab-doctor-real`: strict validation, `openspec:check`, the requirement-length gate, generated skills, `check:pr` and `npm run verify` pass.
