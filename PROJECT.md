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
| `docs/frontend-tasks.md` | task cards, gestures, edit modals, timer, adding tasks, completing, deleting, Undo, Snooze |
| `docs/frontend-queue.md` | the Queue page, Active task box, search, sort, Multi-Select, Reorder, Tags and Projects |
| `docs/frontend-history.md` | History, Stats, project hours, job sheets, completed entries and their photos |
| `docs/frontend-materials.md` | the Materials page and the Miscellaneous list |
| `docs/frontend-settings.md` | the Settings page and its cards, Update now, the time zone |
| `docs/offline.md` | the add queue, saved lists, the action queue, held completions, Undo offline |
| `docs/offline-edits.md` | held edits of tasks and History entries, Reopen and comments offline |
| `docs/stretch-goals.md` | unplanned ideas: archive scale, GST on invoices, a public multi-user version |

A change usually touches several rows: a new endpoint touches an `endpoints-*.md`, `backend-modules.md` and the page file that calls it, and a changed stored field touches `data-model.md` as well.

## Roadmap

Each step fits in one turn. Do them in order unless told otherwise. Each step adds tests for any new pure logic.

1. Edit modals, top level and Scheduling. Both edit modals share one collapsible section style (the `.extra-fields` details generalised), every section closed each time a modal opens. Description leaves Extra fields and joins the top level, which holds Title, the job number line, Description, Tags (on its own line once Task number leaves), Project with Order number, and the button rows (Call/Text/WhatsApp and Email, then Navigate and Link). A new Scheduling section holds, in the queued modal, Task number with its Top button, Priority, Est. minutes, Due date with its Clear button and Repeats, and in the completed form Priority, Time spent and the Completed date and time. Update `frontend-tasks.md`.
2. Edit modals, Contact details and Audit trail. A Contact details section holds Phone, Email, Link and Location; an Audit trail section holds Travel, Materials, Photos and Comments, plus the job sheet download in the completed form (the queued modal has none). Extra fields is removed. A validation alert (bad email, link, travel or material cost) first opens the section holding the field at fault, and the offline completed form opens the sections that hold editable fields. Update `frontend-tasks.md`, `frontend-history.md` and `offline.md`.
3. Add card sections. The add card's manual fields use the same layout as the edit modal (Description, Tags, Project and the Scheduling, Contact details and Audit trail sections, every section closed each time the "Enter the details myself" box is ticked), with Materials, Travel and the rest where the modal has them. Update the "Adding tasks" paragraph of `frontend-tasks.md`.

Unplanned ideas are in `stretch-goals.md`.

## Open questions

- Should Navigate follow the device's default maps app (the Navigate button)? A `geo:` link on Android or an Apple Maps link on iOS opens whatever app the device prefers, but shows the place rather than starting directions; the Google Maps link starts directions and opens in the app where it is installed. The plan uses the Google Maps link; change it if default-app behaviour matters more.
- Is the project suggestion reliable? A large multi-step job once skipped the dialog and was added as plain tasks, then worked after the prompt was reworded to say that stages the input lists itself still count (a model run-to-run difference is not ruled out). If a multi-stage job is added with no dialog, run `npm run logs` in `functions/` and find the line `No project suggestion (…)`: its reason says which check dropped it (the model returned no `projectProposal`, the name is unusable, too few or too many steps, the name matches an existing project, or the input names an existing project). "The model returned no projectProposal" means the prompt (`PROPOSAL_INSTRUCTIONS` in `prompts.js`) needs tuning; any other reason points at that check in `checkProposal`. No such line means the add did not reach the suggestion code (a free-text add with `allowProposal`), so check the request. Remove this question once it has held up over normal use.
- Does Google sign-in work in the installed Android window? The popup is tried first and the redirect fallback is in place, both untested there. If redirect sign-in fails on `taskhub-next.web.app`, set `authDomain` to the page's own host (that host's `/__/auth/handler` must then be an authorized redirect URI of the OAuth client).
- Public multi-user version: lock detection (an event moved to the personal calendar pins its task) lists events on the personal calendar, which a busy-time-only scope cannot do. Drop pinning in the public build, or request a broader read scope and accept a heavier review?
