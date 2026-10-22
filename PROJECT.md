# AI Task Agent

An AI-enhanced to-do list that turns free-text input into structured tasks and schedules them onto Google Calendar. Single user, based in Whangaparāoa, NZ (Pacific/Auckland).

## Maintaining this document

This file is a snapshot of the project's present state and intended direction. It is not a log.

- Read it at the start of every working session. Treat it as the source of truth, but verify against the code when the two disagree, and fix whichever is wrong.
- Update it in the same turn as any change that affects what it says (architecture, endpoints, config, data model, roadmap).
- Edit in place. Replace outdated statements; never leave a stale line with a correction beside it.
- No history. No "previously", "now fixed", "changed from", dates of changes or changelog entries. When a roadmap step is finished, delete it and update the sections that describe the new reality.
- Keep it short. Prefer one line to a paragraph, and a table to prose where content is tabular. Don't add narrative, rationale essays or duplicated information.
- Keep the roadmap ordered, with the next step first. Every step must be completable in a single turn; split any that aren't.
- Record only what's true now or planned. Unresolved questions go in Open questions and are removed once answered.

## Stack

- Firebase project `taskhub-next`. Hosting serves `public/`. Functions are v2 on Node 24, region us-central1. Firestore is in australia-southeast1.
- Frontend: one file, `public/index.html`, vanilla HTML/CSS/JS, no build step. Calls the functions over HTTPS via hardcoded URLs.
- Backend: `functions/index.js`, a single file. Gemini (`@google/genai`, model constant `MODEL_NAME`) for parsing, scheduling and coaching. Google Calendar via the `googleapis` service-account JWT. Weather from Open-Meteo.
- Secrets: `GEMINI_API_KEY`, `GOOGLE_CALENDAR_CREDENTIALS` (service-account JSON).
- Config: `USER_CALENDAR_ID` (the target calendar for all scheduling), a Firebase param read from `functions/.env` at deploy.

## Data model

- `app_state/todo_doc`: `{tasks: Task[], updatedAt}`. The whole active list is one array in one document.
- `completed_tasks/{auto-id}`: a copy of the Task plus `completedAt`. Write-only archive for future analytics.
- Task: `id`, `title`, `priority` (HIGH/MEDIUM/LOW), `dueDate` (YYYY-MM-DD or empty), `estimatedMinutes`, `tags[]`, `status` (PENDING/COMPLETED), `googleCalendarEventId`, `order` (rank from 1).

## Endpoints

| Function | Purpose | AI |
|---|---|---|
| `getTasks` | Read the active list | No |
| `addOrUpdateTask` | Free text in; Gemini returns the full updated list, which replaces the stored one | Yes |
| `updateTaskDirect` | UPDATE or DELETE one task by id | No |
| `completeTask` | Archive to `completed_tasks`, remove from the list | No |
| `getWhatToDoNow` | Recommend one task from time, energy, weather and the list | Yes |
| `generateWeeklySchedule` | Manual "Plan My Week" | Yes |
| `autoScheduleDaily` | Cron at 20:00 NZ; runs the same engine | Yes |

All HTTP endpoints are unauthenticated with `cors: true`.

## Scheduling engine (`runScheduleEngine`)

1. Load tasks. Delete the Calendar event of every task that has `googleCalendarEventId`.
2. Query free/busy for the next 7 days on the `USER_CALENDAR_ID` calendar.
3. Prompt Gemini with the current time, weather, busy windows and tasks. Rules: 8:00–19:00 NZ, opaque for focus tasks and transparent for quick chores, no outdoor tasks in rain.
4. Insert one event per returned item, store the new event id on the task, save the list.

The cron and the manual trigger both use `USER_CALENDAR_ID`; neither the frontend nor the request chooses the calendar. The service account must have edit access to that calendar.

## Roadmap

Each step fits in one turn. Do them in order unless told otherwise.

1. **Calendar event lifecycle.** Add a delete-event helper. Call it from `completeTask` and the DELETE branch of `updateTaskDirect` so no orphaned events remain.
2. **Deny-all Firestore rules.** Replace the open rule (it expires 2026-11-20) with `allow read, write: if false`. All access goes through the Admin SDK. Deploy with `firebase deploy --only firestore:rules`.
3. **Frontend escaping.** Escape task text in rendered HTML and replace inline `onclick="...('${id}')"` string interpolation with event delegation and `data-` attributes.
4. **NZ-correct time handling.** Compute "today" in Pacific/Auckland, and derive the UTC offset for the prompt with `Intl` instead of the hardcoded `+13:00`.
5. **Safe scheduling.** Ask Gemini first, validate its slots (parse, within hours, no overlap with busy windows or each other), then delete the old events and insert the new ones. Fix all-day events to use an exclusive end date. Keep the old events if generation or validation fails.
6. **Safe task ingestion.** Make `addOrUpdateTask` ask the model for only the new or changed tasks, then merge server-side so existing ids, order and `googleCalendarEventId` are preserved. Wrap the read-modify-write in a Firestore transaction. Apply the same transaction to the other write endpoints.
7. **Endpoint auth.** Restrict access to the owner (Firebase Auth with an allowlisted account, or a shared-secret header as a minimum). Tighten CORS to the Hosting origin.
8. **Repo hygiene.** Add ESLint config so the predeploy lint passes, plus `.firebaserc`, `.gitignore`, and a short README with deploy and secret-setup commands. Move the function URLs in the frontend to a single config block.

## Backlog (unordered, not yet planned)

- Use `dueDate` in scheduling priority and surface overdue tasks in the UI.
- Recurring tasks.
- Completed-task view and simple analytics from `completed_tasks`.
- Configurable location and timezone instead of hardcoded Whangaparāoa.
- Tests for the merge, validation and time helpers.
- Move tasks from a single array document to a subcollection (one document per task).
- Reschedule a single task rather than the whole week.

## Open questions

- Does the real repo already contain an ESLint config and `.firebaserc`? Neither was in the archive.
- Should the Gemini calls stay, or should some or all of them move to Claude models?
