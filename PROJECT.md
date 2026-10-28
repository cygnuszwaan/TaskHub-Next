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

1. **Client field with inline new client.** Under a new project on the add card (`#manualClientChoice`) and the queued modal (`#editClientChoice`), the Client `<select>` becomes the same field and toggle ("Add to client", "Remove from client") over the picker modal's client kind (`openPicker("client", …)`; `pickerRows` and `PICKER_KINDS` already handle it), with the same hidden-input contract (empty, a client id or `NEW_CLIENT`). Add in the modal takes the typed text as a new client's name: the field then shows "New client: Name" and the rest of the client form appears in `${prefix}ClientFormMount`, its own Name row hidden and filled from that name, so `readClientForm`, `newClientWarning` and `newProjectClientPick` stay as they are; Remove empties and hides the form. It still shows only under "New project" and once `clientsLoaded`. Updates `frontend-tasks.md` and `frontend-edit-modal.md`.
2. **Clients card search and Add.** The Clients card gets the Projects section's field: above `#clientList`, an `.input-row.project-add` holding a text input (`#newClientName`, 100 characters, placeholder "Search clients or projects, or type a new client name", with an `aria-label`) and an Add button (`#addClientBtn`), wired like `newProjectName`: typing redraws the list (`renderClients`) and Enter adds. The list narrows live with `filterClients(clients, projects, query)`, a pure function beside `filterProjects`: every word of the query must appear, ignoring case, in `clientSearchText(client, projects)`, which joins the client's name, location name, phone, email and the names of its projects; a blank query keeps every client; both are tested. "No clients match the search." shows when none do, "No clients yet." stays for an empty list, and the edit form is unaffected by what the search hides. Add (`addClient`) takes the trimmed text as a new client's name and sends `updateClient` CREATE through `saveClientRequest` with `clientFormBody({ name })` (the server needs only a name, so no server change): an empty field does nothing, a taken name shows the server's error in `#clientsStatus`, and a success empties the field so the whole list shows again. With Add creating clients, the Clients form (`#clientFormMount` and the Save and Cancel row) shows only while a client is being edited and is hidden on load: `fillClientForm(null)` hides it, `fillClientForm(client)` shows it, and the Save button always reads "Save client". The form's fields and the `client` prefix are otherwise unchanged. Colours are existing variables only (`darkmode.test.js`). Updates `frontend-settings.md`.

Unplanned ideas are in `stretch-goals.md`.

## Open questions

- Should a tap outside a dirty form, or its Cancel button, also ask Save, Discard or Keep editing? Only Back asks; a tap outside discards silently, as Cancel does. Asking on a tap outside is a small addition, Cancel is already an explicit discard.
- Should the completed form's Project field gain an Add row for a new project, and a Client field? It needs `updateCompletedTask` to accept `newProject` and a client, a server change of its own; the picker leaves it out.
- Should the Multi-Select Project dialog (`#batchProject`) and the Projects section's per-project Client select (`data-action=client`) use the picker modal too? They have the same scaling problem and the modal is reusable, each a small step after roadmap step 1.
- Should Add on the Clients card open the new client's form straight away for its details (location, phone, rate; roadmap step 2)? The plan adds the name only, as the Projects field does, and the owner taps Edit for the rest. Opening the form at once saves that tap but differs from the Projects field.
- Should Navigate follow the device's default maps app (the Navigate button)? A `geo:` link on Android or an Apple Maps link on iOS opens whatever app the device prefers, but shows the place rather than starting directions; the Google Maps link starts directions and opens in the app where it is installed. The plan uses the Google Maps link; change it if default-app behaviour matters more.
- Is the project suggestion reliable? A large multi-step job once skipped the dialog and was added as plain tasks, then worked after the prompt was reworded to say that stages the input lists itself still count (a model run-to-run difference is not ruled out). If a multi-stage job is added with no dialog, run `npm run logs` in `functions/` and find the line `No project suggestion (…)`: its reason says which check dropped it (the model returned no `projectProposal`, the name is unusable, too few or too many steps, the name matches an existing project, or the input names an existing project). "The model returned no projectProposal" means the prompt (`PROPOSAL_INSTRUCTIONS` in `prompts.js`) needs tuning; any other reason points at that check in `checkProposal`. No such line means the add did not reach the suggestion code (a free-text add with `allowProposal`), so check the request. Remove this question once it has held up over normal use.
- Does Google sign-in work in the installed Android window? The popup is tried first and the redirect fallback is in place, both untested there. If redirect sign-in fails on `taskhub-next.web.app`, set `authDomain` to the page's own host (that host's `/__/auth/handler` must then be an authorized redirect URI of the OAuth client).
- Public multi-user version: lock detection (an event moved to the personal calendar pins its task) lists events on the personal calendar, which a busy-time-only scope cannot do. Drop pinning in the public build, or request a broader read scope and accept a heavier review?
