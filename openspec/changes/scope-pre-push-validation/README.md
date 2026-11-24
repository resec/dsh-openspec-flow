# scope-pre-push-validation

Split pre-push OpenSpec validation by push target: main-only pushes validate main specs and archived tasks, reject complete or task-less active changes, and ignore in-progress changes; other refs keep full validation.
