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

## Delivering changes

- End every turn that changes files by supplying a git patch of those changes, `PROJECT.md` updates included. Make it with `git format-patch` so it applies with `git am` from the repo root, with a short imperative commit message.
- Verify the patch applies cleanly to the previous state before delivering it.
- The patch contains only changed files: no `node_modules`, `__MACOSX` or unchanged files.

## Stack

- Firebase project `taskhub-next`. Hosting serves `public/`. Functions are v2 on Node 24, region us-central1. Firestore is in australia-southeast1.
- Calendar access uses service account `task-calendar-agent@gen-lang-client-0299359787.iam.gserviceaccount.com` (it lives in Google Cloud project `gen-lang-client-0299359787`, not `taskhub-next`). It has edit access to the agent calendar (`USER_CALENDAR_ID`) and "Make changes and see all event details" on the owner's personal calendar. The engine must only ever read the personal calendar, never write to it.
- Firestore rules: deny-all. Every read and write goes through the functions via the Admin SDK, which bypasses rules.
- A separate app, a kids' chore tracker, lives in its own Firebase project (`screen-time-chore-tracker`). Never deploy to it from this repo; always target `taskhub-next` explicitly (`--project taskhub-next`).
- Frontend: one file, `public/index.html`, vanilla HTML/CSS/JS, no build step. Calls the functions over HTTPS via hardcoded URLs. All task-derived text goes through `esc()` before `innerHTML`; list and filter clicks use event delegation on `data-` attributes.
- Backend: `functions/index.js` (endpoints and engine), `functions/calendar.js` (event listing, cleanup and busy-window helpers), `functions/schedule.js` (pure validation of Gemini's slots) and `functions/time.js` (NZ date/offset helpers). Gemini (`@google/genai`, model constant `MODEL_NAME`) for parsing, scheduling and coaching. Google Calendar via the `googleapis` service-account JWT. Weather from Open-Meteo.
- Secrets: `GEMINI_API_KEY`, `GOOGLE_CALENDAR_CREDENTIALS` (service-account JSON; bound to every function that touches Calendar, including `completeTask` and `updateTaskDirect`).
- Config (Firebase params read from `functions/.env` at deploy): `USER_CALENDAR_ID` (the agent calendar that tasks are scheduled onto) and `USER_PERSONAL_CALENDAR_ID` (the owner's personal calendar, read-only, used for free/busy).

## Data model

- `app_state/todo_doc`: `{tasks: Task[], updatedAt}`. The whole active list is one array in one document.
- `completed_tasks/{auto-id}`: a copy of the Task plus `completedAt`. Write-only archive for future analytics.
- Task: `id`, `title`, `priority` (HIGH/MEDIUM/LOW), `dueDate` (YYYY-MM-DD or empty), `estimatedMinutes`, `tags[]`, `status` (PENDING/COMPLETED), `googleCalendarEventId`, `scheduledStart`/`scheduledEnd` (set only while scheduled; ISO 8601 with NZ offset, or YYYY-MM-DD with an exclusive end date for all-day), `locked` (true only while the owner has pinned the task by moving its event to the personal calendar), `order` (rank from 1).

## Endpoints

| Function | Purpose | AI |
|---|---|---|
| `getTasks` | Read the active list | No |
| `addOrUpdateTask` | Free text in; Gemini returns the full updated list, which replaces the stored one | Yes |
| `updateTaskDirect` | UPDATE or DELETE one task by id; DELETE also removes its calendar events | No |
| `completeTask` | Archive to `completed_tasks`, remove from the list, remove its calendar events | No |
| `getWhatToDoNow` | Recommend one task from time, energy, weather and the list | Yes |
| `generateWeeklySchedule` | Manual "Plan My Week" | Yes |
| `autoScheduleDaily` | Cron at 20:00 NZ; runs the same engine | Yes |

All HTTP endpoints are unauthenticated with `cors: true`.

Deleting or completing a task removes its calendar events by stored `googleCalendarEventId` and by the `taskId` private extended property on the event, so a task whose stored id was lost still gets cleaned up.

## Scheduling engine (`runScheduleEngine`)

Nothing on the calendar changes until Gemini's slots pass validation. The personal calendar is only ever read.

1. Load tasks. Read the personal calendar's free/busy for the next 7 days.
2. Lock detection: list the events ending after now on the personal calendar that carry the marker "Generated by AI Task Agent", and match each to a task (`matchLockedEvents`: stored `googleCalendarEventId`, then the `taskId` private extended property, then title). A matched task is locked: it is not offered to Gemini, its old events are not deleted, and its event window counts as busy even if the event is marked free. Locks are recomputed on every run, so a lock is released once its event has ended. If either read in this step fails, abort.
3. List the agent calendar's existing app events (stored ids of unlocked tasks plus every event carrying the marker, from the start of today NZ). Collect agent-calendar busy time from opaque events that are not the app's own (events list, not free/busy, so the app's old events don't block rescheduling). Merge it with the personal and locked windows (overlaps combined) and pass Gemini only those time windows, never event titles.
4. Prompt Gemini (`requestSchedule`) with the current NZ time and its real UTC offset (+12:00 or +13:00 depending on daylight saving), weather, the merged busy windows and the unlocked tasks. Rules: 8:00–19:00 NZ local time, opaque for focus tasks and transparent for quick chores, no outdoor tasks in rain, each task at most once. Skipped when every task is locked.
5. Validate (`validateSchedule`). Any failure, or an empty result, aborts and keeps the old events. Timed slots need an ISO time with offset, a start in the future, an end within 7 days, one NZ day inside 8:00–19:00, no overlap with busy windows or each other. All-day slots (always transparent) need a date from today to the horizon date and skip overlap checks. Each task id must be an unlocked task and appear once.
6. Insert the new events on the agent calendar (all-day events use an exclusive end date). If an insert fails, delete the ones already created and abort.
7. Delete the old events (agent calendar only; already-missing ones are ignored), then save the list. Each scheduled task gets `googleCalendarEventId`, `scheduledStart` and `scheduledEnd`. Each locked task gets `locked: true`, the personal event's id and its actual start and end. Other tasks have all four fields cleared.

The cron and the manual trigger both use `USER_CALENDAR_ID`; neither the frontend nor the request chooses the calendar. All writes go to that calendar only. Busy time marked "free" (transparent) on either calendar does not count as busy, except locked windows. Deleting or completing a locked task never touches its event on the personal calendar.

## Roadmap

Each step fits in one turn. Do them in order unless told otherwise.

1. **Schedule visibility in the app.** Show each task's scheduled date and time and a locked indicator in the task list (read-only; moving the event between calendars is the lock control).
2. **Safe task ingestion.** Make `addOrUpdateTask` ask the model for only the new or changed tasks, then merge server-side so existing ids, order, `googleCalendarEventId`, `scheduledStart`/`scheduledEnd` and `locked` are preserved. Wrap the read-modify-write in a Firestore transaction. Apply the same transaction to the other write endpoints.
3. **Endpoint auth.** Restrict access to the owner (Firebase Auth with an allowlisted account, or a shared-secret header as a minimum). Tighten CORS to the Hosting origin.
4. **Repo hygiene.** Add ESLint config so the predeploy lint passes, plus `.firebaserc`, `.gitignore`, and a short README with deploy and secret-setup commands. Move the function URLs in the frontend to a single config block.

## Backlog (unordered, not yet planned)

- Use `dueDate` in scheduling priority and surface overdue tasks in the UI.
- Recurring tasks.
- Completed-task view and simple analytics from `completed_tasks`.
- Configurable location and timezone instead of hardcoded Whangaparāoa.
- Tests for the merge and validation logic. `functions/time.js` is pure and ready to test.
- Move tasks from a single array document to a subcollection (one document per task).
- Reschedule a single task rather than the whole week.

## Open questions

- Does the real repo already contain an ESLint config and `.firebaserc`? Neither was in the archive.
- Should the Gemini calls stay, or should some or all of them move to Claude models?
- Does Google Calendar keep an event's id and `taskId` tag when the owner moves it to the personal calendar? Lock matching falls back to the title if not, which fails if the owner renames the event.
