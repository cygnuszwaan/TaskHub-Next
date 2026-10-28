# TaskHub Next

An AI-enhanced to-do list that turns free-text input into structured tasks and schedules them onto Google Calendar. Single user. Location and time zone are runtime settings, defaulting to Whangaparāoa, NZ (Pacific/Auckland).

## Maintaining this document

This file is the entry point to the project's documentation: the rules for working on it, the essentials, a map of `docs/` and the roadmap. The detail lives in `docs/`, one topic per file, so a session reads only what its work touches. Together they are a snapshot of the project's present state and intended direction, not a log.

- Read this file at the start of every working session, then only the `docs/` files the map below names for the work at hand, and always the ones for an area you will change. Treat them as the source of truth, but verify against the code when the two disagree, and fix whichever is wrong. When unsure where something is, `grep -ril <word> docs/` before reading whole files.
- Update the `docs/` file that describes a change, and this file's roadmap, in the same turn as any change that affects what they say (architecture, endpoints, config, data model, roadmap).
- Edit in place. Replace outdated statements; never leave a stale line with a correction beside it.
- No history. No "previously", "now fixed", "changed from", dates of changes or changelog entries. When a roadmap step is finished, delete it and update the files that describe the new reality.
- Keep it short. Prefer one line to a paragraph, and a table to prose where content is tabular. Don't add narrative, rationale essays or duplicated information; each fact lives in one file.
- Keep each `docs/` file under about 16 KB and this file under about 16 KB. When one grows past that, split it by topic and update the map; a new topic gets a new file and a map row. Refer to another file by its name (`offline.md`), never by "above" or "below".
- Keep the roadmap ordered, with the next step first. Every step must be completable in a single turn; split any that aren't.
- Record only what's true now or planned. Unresolved questions go in Open questions and are removed once answered.

## Delivering changes

- End every turn that changes files by supplying a git patch of those changes, documentation updates (`PROJECT.md` and `docs/`) included. Make it with `git format-patch` so it applies with `git am` from the repo root, with a short imperative commit message.
- Verify the patch applies cleanly to the previous state before delivering it.
- The patch contains only changed files: no `node_modules`, `__MACOSX` or unchanged files.
- Lint before delivering. The deploy's predeploy step runs `npm run lint` in `functions/` and a single error stops the whole deploy, so run it, with `npm test`, before every patch and deliver nothing until it reports no errors. One test failure is accepted: "keeps the key and region in CONFIG, off by default" in `frontend.test.js` fails while `CONFIG.placesApiKey` holds the owner's real key; any other failure still blocks delivery. It covers `functions/test/` as well as the source files. If `functions/node_modules` is missing, `npm install --no-save --no-package-lock` there installs ESLint and the rest without touching `package.json` or the lockfile. Fix what it reports with `npx eslint --fix <file>` and run the tests again.
- Write new JavaScript in `functions/` to the lint rules from the start (`.eslintrc.js`: `eslint:recommended` and the Google style). The ones that keep failing: strings in double quotes, never single (a string that contains double quotes is a template literal or has them escaped; in tests this is mostly HTML and regex text); parentheses around an arrow function's parameter, `(m) => m[1]`, never `m => m[1]`; two-space indent, semicolons, trailing commas in multi-line literals and calls. Long lines are fine: the files open with `/* eslint-disable max-len */` and `/* eslint-disable require-jsdoc */`, so a new file starts with them too. `public/index.html` is not linted and keeps its own style.

## Essentials

- Firebase project `taskhub-next`. Hosting serves `public/`. Functions are v2 on Node 24, all in australia-southeast1 (set once with `setGlobalOptions` in `index.js`), as is Firestore.
- Firestore rules: deny-all. Every read and write goes through the functions via the Admin SDK, which bypasses rules.
- A separate app, a kids' chore tracker, lives in its own Firebase project (`screen-time-chore-tracker`). Never deploy to it from this repo; always target `taskhub-next` explicitly (`--project taskhub-next`).
- Every HTTP endpoint requires `Authorization: Bearer <Firebase ID token>` for the verified Google account in `OWNER_EMAIL` (`ownerOnly`): 401 for a missing or invalid token, 403 for any other account or when `OWNER_EMAIL` is empty. Revocation takes effect when the current token expires (up to an hour). CORS allows only `https://taskhub-next.web.app` and `https://taskhub-next.firebaseapp.com` (`ALLOWED_ORIGINS`), so localhost is rejected. `autoScheduleDaily` is not HTTP and is unaffected.

## Documentation map

| File | Read it when you work on |
|---|---|
| `docs/infrastructure.md` | Firebase setup, deploy, backups, push notifications, address autocomplete, secrets, auth, config, Gemini, Calendar and weather services |
| `docs/data-model.md` | Firestore collections, runtime settings, the Task shape |
| `docs/scheduling-engine.md` | `runScheduleEngine`, the planner's steps, locks, the quota guard, the cron |
| `docs/backend-modules.md` | what each file in `functions/` holds; how the code is tested |
| `docs/endpoints-tasks.md` | `getTasks`, `addOrUpdateTask`, `updateTaskDirect`, `batchUpdateTasks`, `toggleTimer`, `undoRemove`, `completeTask`; task-list transactions |
| `docs/endpoints-history.md` | completed tasks, reopen, photos, templates, job sheets, CSV and JSON exports |
| `docs/endpoints-comments.md` | task and entry comments: the data, `addComment`, `deleteComment`, job sheet and CSV |
| `docs/endpoints-admin.md` | scheduling runs, settings, notifications, duplicates, projects, clients, project templates, the Miscellaneous list |
| `docs/frontend-shell.md` | the PWA and sharing, dark mode, service worker, API calls, sign-in, tabs, the page's dialogs |
| `docs/frontend-tasks.md` | task cards, gestures, timer, adding tasks, completing, deleting, Undo, Snooze |
| `docs/frontend-edit-modal.md` | the queued edit modal and the completed task form: sections, fields, contact and Navigate buttons, comments |
| `docs/frontend-queue.md` | the Queue page, Active task box, search, sort, Multi-Select, Reorder, Tags and Projects |
| `docs/frontend-history.md` | History, Stats, project hours, job sheets, completed entries and their photos |
| `docs/frontend-materials.md` | the Materials page and the Miscellaneous list |
| `docs/frontend-settings.md` | the Settings page and its cards, Update now, the time zone |
| `docs/offline.md` | the add queue, saved lists, the action queue, held completions, Undo offline |
| `docs/offline-edits.md` | held edits of tasks and History entries, Reopen and comments offline |
| `docs/stretch-goals.md` | unplanned ideas: archive scale, GST on invoices, a public multi-user version |

A change usually touches several rows: a new endpoint touches an `endpoints-*.md`, `backend-modules.md` and the page file that calls it, and a changed stored field touches `data-model.md` as well.

## Roadmap

Each step fits in one turn, adds tests for any new pure logic and updates the `docs/` files it names. Steps 1 and 2 are independent; step 4 needs step 3.

1. **Task number on the add card, Bottom buttons, full-width row** (`frontend-tasks.md`, `frontend-edit-modal.md`, `endpoints-tasks.md`).
   - Add card: a Task number box at the top of the Scheduling section (manual fields only), with Top (types 1) and Bottom (types the list length + 1) buttons. Empty keeps today's behaviour (the end of the list); the free-text add is unchanged.
   - Server: `manualTaskChange` passes a `queueNumber` (a whole number; unusable ignored) on as the change's `order`, which `mergeTaskChanges` already places and clamps; `startNow` still starts that task. A held offline add carries the number and the server clamps it when sent.
   - Edit modal: a Bottom button beside Top (types `allTasks.length`). Drop the row's `max-width: 200px` so the box and both buttons fill the row (`.field-with-btn > input { flex: 1 }`).
   - Tests: manual body with and without `queueNumber` (`manualTaskBody`, `manualTaskChange`), placement at 1, middle and past the end.
2. **Clear for the add card's due date, open sections for a copied task** (`frontend-tasks.md`).
   - A Clear button beside `#manualDue` in the same row layout as the edit modal's, sharing `clearEditDueDate`'s approach.
   - A pure `sectionsToOpen(values)`, like `completedSectionsToOpen`: `useTemplate` opens Contact details when Phone, Email, Link or Location has a value and Audit trail when Travel or Materials has one. Scheduling opens only for a Repeats value, since priority and estimate always have one. Tapping a past task still closes everything else.
   - Tests for `sectionsToOpen`.
3. **Inline new client, server** (`endpoints-tasks.md`, `endpoints-admin.md`, `data-model.md`, `backend-modules.md`).
   - `updateTaskList` gets `withClients` (reads `clients`, passes `{clients}`), so a client is checked at commit time.
   - A new project can carry a client: `newProjectClientId` (a stored client, else 400 `Client not found`) or `newClient` (a name, created in the same commit by `addClient`; 400 for an unusable or taken name; it wins over `newProjectClientId`). Accepted by `addOrUpdateTask` (`manual.newProject`) and `updateTaskDirect` (UPDATE `newProject`) by extending `addProject`/`withNewProject`; the project is stored with `clientId`. Responses then also hold `client` and `clients`.
   - `updateProject` `SET_CLIENT` also accepts `newClient`.
   - Nothing is saved on any 400. Tests for each path and for the nothing-saved cases.
4. **Inline new client, page** (`frontend-tasks.md`, `frontend-edit-modal.md`, `frontend-queue.md`, `offline.md`).
   - Under `#manualNewProject` and `#editNewProject`, a Client select (No client, the clients, "＋ New client…") shown only while "＋ New project…" is chosen and `clientsLoaded`; "＋ New client…" shows a name box. Add and Save send `newProjectClientId` or `newClient`, an empty client name is a warning alert, and the responses' `clients` replace `allClients`.
   - The Projects section's client picker (`clientPickerHtml`) gets the same "＋ New client…" choice (sending `SET_CLIENT` with `newClient`) and shows even when there are no clients yet.
   - `queuedBody` keeps the whole `manual` body, so a held add already carries `newProject` and will carry the client fields the same way; `offline.md` lists a new project from the add card as online-only, which the code does not enforce. Settle which is right (a held add with a taken client name fails as a FAILED card on replay) and correct whichever is wrong. The edit modal and Multi-Select do refuse offline (`serverOnlyEditChanges`, `holdBatch`).
   - Tests for the body builders.

Unplanned ideas are in `stretch-goals.md`.

## Open questions

- Should Navigate follow the device's default maps app (the Navigate button)? A `geo:` link on Android or an Apple Maps link on iOS opens whatever app the device prefers, but shows the place rather than starting directions; the Google Maps link starts directions and opens in the app where it is installed. The plan uses the Google Maps link; change it if default-app behaviour matters more.
- Is the project suggestion reliable? A large multi-step job once skipped the dialog and was added as plain tasks, then worked after the prompt was reworded to say that stages the input lists itself still count (a model run-to-run difference is not ruled out). If a multi-stage job is added with no dialog, run `npm run logs` in `functions/` and find the line `No project suggestion (…)`: its reason says which check dropped it (the model returned no `projectProposal`, the name is unusable, too few or too many steps, the name matches an existing project, or the input names an existing project). "The model returned no projectProposal" means the prompt (`PROPOSAL_INSTRUCTIONS` in `prompts.js`) needs tuning; any other reason points at that check in `checkProposal`. No such line means the add did not reach the suggestion code (a free-text add with `allowProposal`), so check the request. Remove this question once it has held up over normal use.
- Does Google sign-in work in the installed Android window? The popup is tried first and the redirect fallback is in place, both untested there. If redirect sign-in fails on `taskhub-next.web.app`, set `authDomain` to the page's own host (that host's `/__/auth/handler` must then be an authorized redirect URI of the OAuth client).
- Public multi-user version: lock detection (an event moved to the personal calendar pins its task) lists events on the personal calendar, which a busy-time-only scope cannot do. Drop pinning in the public build, or request a broader read scope and accept a heavier review?
