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

Goal: the Queue and History tabs share one layout (search, Tags, Project, Select) and keep only their own features.

1. Stats to Settings. Move the Stats card out of History into a Stats card on the Settings page (same markup, collapsed on every load, hidden while there are no completions or the load failed). Settings reads the summary itself when the tab opens, through `getCompletedTasks` with a small `limit`, so History no longer fills or hides the card. Docs: `frontend-history.md`, `frontend-settings.md`.
2. History layout and the "All" label. Order History as the search box, the Tags section, the Project section, then the list (the Select row of step 5 goes between the Project section and the list). Rename "Any project" to "All" everywhere History shows it (the picker's top row, the field's text, the count line). Docs: `frontend-history.md`.
3. Queue Projects field and modal. Replace the Queue's Projects section (field, Add button, list `#projectFilterBar`) with a `.picker-field` button like History's, showing "All" or the chosen project, that opens the picker modal (`openPicker`, a new kind): a search field with an Add button beside it (the same Add as today, `newProjectName`), an All row first, one row per project with its task count and client at the right, no extra Add row. A row tap chooses the project and closes the modal. Add creates the project, chooses it and leaves the modal open with the field emptied and the whole list showing. The chosen project's actions stay under the field for this step. Tests for any new pure logic. Docs: `frontend-queue.md`, `frontend-shell.md`.
4. Manage section in the Projects modal. Move the chosen project's actions (Rename, Delete, Client, Location, Link, Save as template) into a collapsible "Manage" section in the modal, collapsed on every open, headed by the project's name, shown only while a project is chosen (not for All), so a project just added with Add can be set up at once. The fixed-markup boxes (`#projectNewClient`, `#projectLocation`, `#projectUrl`) keep their redraw rules; the client picker opens over the modal and returns to it; Delete closes the modal. Docs: `frontend-queue.md`, `frontend-shell.md`.
5. Start from template in the Projects modal. Move the Start from template block (`#templateBlock`: template select, name field, Start, Rename template, Delete template) into the modal as a second collapsible section below Manage, shown with All chosen as well as with a project, with `loadProjectTemplates`, `startedText` and the confirmations unchanged; Start closes the modal. Docs: `frontend-queue.md`, `frontend-shell.md`.
6. History Multi-Select, Reopen and Delete. Add a Select row to History in the Queue's form (`#historySelectModeBtn`, a sticky `#historyBatchBar` with the count, All shown, None, Reopen, Delete, Project): completed cards stop opening the form and a tap toggles them with the blue outline alone, the selection surviving search, tag, project and page changes (`toggledSelection`, `pruneSelection`, `batchCountText`, kept shared with the Queue). Reopen and Delete act on every selected entry, shown or not, one confirmation for the batch, one call per entry in list order (`reopenCompletedTask`, held offline as a single Reopen is; `deleteCompletedTask`, which needs a connection and says so), a failed entry staying selected. The Project button is shown disabled until step 7. Docs: `frontend-history.md`, `offline-edits.md`.
7. History Project action (online). Wire the Project button to the picker modal (None first, no Add row, as the completed form's Project field, titled "Add 3 tasks to a project") and one `updateCompletedTask` call per selected entry with `projectId`, in list order, a failed entry staying selected; Multi-Select and the selection stay on after a success and the History lists reload. Docs: `frontend-history.md`, `frontend-shell.md`.
8. Hold a History project change offline. Add `projectId` to `ENTRY_EDIT_FIELDS`, so a project change on an entry, from the batch bar or the form's Project field, is held as an EDIT and sent in order (`title` the project's name; None reads "Take 2 tasks out of their project"), shown at once in the History list, the project filter and the hours (a project change drops the entry's `projectOrder`, as `applyCompletedEdit` does), with the waiting chip; an entry still waiting to be sent as a completion is handled as the entry form handles it (read `offline-edits.md` first). Tests keep the page's copy of the rule equal to the server's. Docs: `offline-edits.md`, `frontend-history.md`.

Unplanned ideas are in `stretch-goals.md`.

## Open questions

- Should History search still find text in materials, descriptions and comments? The search no longer reads them, as asked, and no filter replaces those three. A prefix word (for example `~`) or a Notes filter could keep them searchable.
- Should a tap outside a dirty form, or its Cancel button, also ask Save, Discard or Keep editing? Only Back asks; a tap outside discards silently, as Cancel does. Asking on a tap outside is a small addition, Cancel is already an explicit discard.
- Should the completed form's Project field gain an Add row for a new project, and a Client field? It needs `updateCompletedTask` to accept `newProject` and a client, a server change of its own; the picker leaves it out.
- Should Navigate follow the device's default maps app (the Navigate button)? A `geo:` link on Android or an Apple Maps link on iOS opens whatever app the device prefers, but shows the place rather than starting directions; the Google Maps link starts directions and opens in the app where it is installed. The plan uses the Google Maps link; change it if default-app behaviour matters more.
- Is the project suggestion reliable? A large multi-step job once skipped the dialog and was added as plain tasks, then worked after the prompt was reworded to say that stages the input lists itself still count (a model run-to-run difference is not ruled out). If a multi-stage job is added with no dialog, run `npm run logs` in `functions/` and find the line `No project suggestion (…)`: its reason says which check dropped it (the model returned no `projectProposal`, the name is unusable, too few or too many steps, the name matches an existing project, or the input names an existing project). "The model returned no projectProposal" means the prompt (`PROPOSAL_INSTRUCTIONS` in `prompts.js`) needs tuning; any other reason points at that check in `checkProposal`. No such line means the add did not reach the suggestion code (a free-text add with `allowProposal`), so check the request. Remove this question once it has held up over normal use.
- Does Google sign-in work in the installed Android window? The popup is tried first and the redirect fallback is in place, both untested there. If redirect sign-in fails on `taskhub-next.web.app`, set `authDomain` to the page's own host (that host's `/__/auth/handler` must then be an authorized redirect URI of the OAuth client).
- Public multi-user version: lock detection (an event moved to the personal calendar pins its task) lists events on the personal calendar, which a busy-time-only scope cannot do. Drop pinning in the public build, or request a broader read scope and accept a heavier review?
