# Tasks

## 1. Name the file after its kind

- [x] 1.1 Add the kind to the card file name and to the marker.
- [x] 1.2 Update the existing path and marker assertions.

## 2. Keep the old name readable

- [x] 2.1 Confirm the reader selects by the session-key prefix, so the earlier name still loads.
- [x] 2.2 Add a test that delivers a card written under the earlier name.

## 3. Guard the coexistence

- [x] 3.1 Add a test that writes a draft and an apply card for one session and round and returns both.

## 4. Document and verify

- [x] 4.1 State the new layout and the readable earlier name in `docs/review.md`.
- [x] 4.2 Run `openspec validate fix-card-file-kind --strict`, `npm test`, `npm run openspec:check` and `npm run layout:check`.
- [x] 4.3 Run `npm run verify` on Node 24.22.2: the `verify` job on `dad5853` passed with suite 1207/1207 and coverage 98.59% lines / 93.59% branches / 99.19% functions, so the gate reported no violation. A local run of the same command on the same commit stops at the one pre-existing `push-landed` fixture failure (git 2.50 refuses to delete the current branch of the bare fixture; fixed by a separate change) and never reaches the gate, so it carries no coverage verdict.

## 5. Apply review follow-up

- [x] 5.1 A marker written before the kind existed still matches, so a recorded card is not written twice.
- [x] 5.2 The write test asserts the literal file name, not only the shared path helper.
- [x] 5.3 `docs/review.md` names the kind in the marker and the earlier kind-less match; `docs/upgrading-dsh-runtime.md` shows the kind-bearing layout.
