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

Each step fits in one turn, adds tests for any new pure logic and updates the `docs/` files it names. The steps are independent unless one says it needs an earlier step.

The UI unification pass makes every Project and Client selector look and behave like the Queue's Projects filter (a search field above a compact bordered list of `.project-item` rows, `.project-list`) and gives Link fields the look of the other fields. Steps 1 to 3 run in order: step 1 builds the shared selector, steps 2 and 3 reuse it.

1. **Shared selector, Settings Clients card and Link fields.**
   - Link fields: `input[type="url"]` is missing from the base field rule (`input[type="text"], … select`), so Link boxes fall back to the browser's square, bevelled default and a narrower width. Add `url` to that rule (and check the `.input-row` and `.form-group` width rules reach it) so Link looks like Phone and Email in the New Task form (`#manualUrl`), the Edit Task form (`#editUrl`), the completed form (`#ceUrl`), the Edit Project row (`#projectUrlInput`) and every Client form block (`${prefix}Url`: the Settings card's, the add card's, the edit modal's and the Projects section's). No change to parsing, saving or placeholders.
   - Shared selector: one function that draws the search field, the list and its empty and no-match lines from the same markup and CSS the Queue filter uses, parameterised by kind (project or client), the chosen id, an optional leading row (All, None), an optional Add row and a pick callback. It reuses `pickerRows` (most used first, `PICKER_MAX_ROWS`, "Keep typing to narrow") for forms and the Queue's `filterProjects` ordering for the Queue; keyboard use (ArrowUp, ArrowDown, Enter) and the combobox, listbox and option roles carry over from the picker modal. The Queue's Projects filter is rewired onto it with no visible change.
   - Settings Clients card: the list uses the selector's rows (name only; location, phone, email, rate and WhatsApp stay out of the list). Tapping a row opens the Clients form for that client (`fillClientForm(client)`) and marks the row; the Edit and Delete buttons leave the rows. The form gains a Delete client button, shown only while editing an existing client (`editingClientId` set), that asks `deleteClientPrompt` as before, then closes the form. Save client and Cancel are unchanged, and `clientSummary` goes if nothing else uses it.
   - Tests for any new pure logic (row building, the delete button's visibility rule); update `frontend-settings.md`, `frontend-queue.md` and `frontend-shell.md`.

2. **Project and Client fields in the three task forms.**
   - Replace the Project field's button and toggle (`#manualProjectField`, `#editProjectField`, `#ceProjectField`, `#editProjectToggle`) with the shared selector inline: a None row first, the projects below, the chosen row marked, an Add row in the New Task and Edit Task forms only (the completed form still has none, because `updateCompletedTask` cannot create a project). Choosing None clears the project and the Order number as Remove from project does now. The hidden inputs (`#editProject`, `#editNewProject`), `setProjectField`, `projectFieldView`, `projectFieldLocked` and everything that reads the ids stay as they are, so saving, offline holding and `refreshContact` are untouched; the selector stays disabled until `getProjects` has answered. Keep the Order number below it, shown only while a project is chosen.
   - Do the same for the Client field under a new project (`#manualClientField`, `#editClientField`, `#editClientToggle`, `#editClientChoice`): the inline selector for clients with None, the clients and an Add row, still feeding `newProjectClientId` and `newClient`.
   - The Projects section's per-project Client select (`clientPickerHtml`, `data-action=client`) becomes the same client selector, still posting `SET_CLIENT` at once and still opening the client form for "＋ New client…" (now the Add row).
   - With no caller left, remove `#pickerModal`, `openPicker`, `PICKER_KINDS`' modal-only parts, `closePicker` and its layer entry; keep `pickerRows`. The Multi-Select Project dialog (`#batchProject`) is outside this pass.
   - Update `frontend-edit-modal.md`, `frontend-tasks.md`, `frontend-queue.md` and `frontend-shell.md` (the picker section becomes the selector section, the layer list loses `#pickerModal`); adjust the tests that name the modal.

3. **History Project hours selector.** Replace the native `<select id="historyProject">` with the shared project selector: search field, list of projects with hours, the chosen project marked, "No projects match the search." when none do. It keeps the current rules (the project with the newest week first, the choice kept across reloads, only current projects) and swaps `selectHistoryProject` to the pick callback; the total, weeks and job-sheet buttons below are unchanged. The list must not push the totals out of view on a phone: cap it at the same row count as the picker (`PICKER_MAX_ROWS`) with the same "Keep typing to narrow" line. Update `frontend-history.md` and `frontend-shell.md`; add a final consistency sweep by `grep` for any remaining `picker-field`, `<select>` on a project or client, and `type="url"` outside the shared rule.

Unplanned ideas are in `stretch-goals.md`.

## Open questions

- Should a tap outside a dirty form, or its Cancel button, also ask Save, Discard or Keep editing? Only Back asks; a tap outside discards silently, as Cancel does. Asking on a tap outside is a small addition, Cancel is already an explicit discard.
- Should the completed form's Project field gain an Add row for a new project, and a Client field? It needs `updateCompletedTask` to accept `newProject` and a client, a server change of its own; the picker leaves it out.
- Should the Multi-Select Project dialog (`#batchProject`) use the shared selector too? It has the same scaling problem and the selector is reusable, a small step.
- Should Navigate follow the device's default maps app (the Navigate button)? A `geo:` link on Android or an Apple Maps link on iOS opens whatever app the device prefers, but shows the place rather than starting directions; the Google Maps link starts directions and opens in the app where it is installed. The plan uses the Google Maps link; change it if default-app behaviour matters more.
- Is the project suggestion reliable? A large multi-step job once skipped the dialog and was added as plain tasks, then worked after the prompt was reworded to say that stages the input lists itself still count (a model run-to-run difference is not ruled out). If a multi-stage job is added with no dialog, run `npm run logs` in `functions/` and find the line `No project suggestion (…)`: its reason says which check dropped it (the model returned no `projectProposal`, the name is unusable, too few or too many steps, the name matches an existing project, or the input names an existing project). "The model returned no projectProposal" means the prompt (`PROPOSAL_INSTRUCTIONS` in `prompts.js`) needs tuning; any other reason points at that check in `checkProposal`. No such line means the add did not reach the suggestion code (a free-text add with `allowProposal`), so check the request. Remove this question once it has held up over normal use.
- Does Google sign-in work in the installed Android window? The popup is tried first and the redirect fallback is in place, both untested there. If redirect sign-in fails on `taskhub-next.web.app`, set `authDomain` to the page's own host (that host's `/__/auth/handler` must then be an authorized redirect URI of the OAuth client).
- Public multi-user version: lock detection (an event moved to the personal calendar pins its task) lists events on the personal calendar, which a busy-time-only scope cannot do. Drop pinning in the public build, or request a broader read scope and accept a heavier review?
