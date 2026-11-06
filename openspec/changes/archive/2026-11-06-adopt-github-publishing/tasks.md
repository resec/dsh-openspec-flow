# Tasks

## 1. Remote and upstream

- [x] 1.1 Set `origin` to `git@github.com:resec/dsh-openspec-flow.git` and verify `git remote get-url origin` prints that URL
- [x] 1.2 Push `main` with `git push -u origin main` and verify `git rev-parse --abbrev-ref main@{upstream}` prints `origin/main`

## 2. Documentation

- [x] 2.1 Add a repository publishing section to `README.md` that states the remote, the `main` branch, and the archive-commit-push order, then verify the section renders the exact remote URL
- [x] 2.2 Add the commit-and-push convention to `AGENTS.md` and verify it matches the `development-workflow` spec requirements

## 3. Verification

- [x] 3.1 Run `openspec validate adopt-github-publishing` and `node --test test/`, and confirm both pass

## Workflow follow-up

- Archive `adopt-github-publishing` after every task is checked and validation passes.
- Commit the archive, the documentation updates, and the merged specs in one commit, then push it to `origin/main`.
