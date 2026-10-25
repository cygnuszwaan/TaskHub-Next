/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {setGlobalOptions} = require("firebase-functions/v2");
const {defineString} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {GoogleGenAI, Type} = require("@google/genai");
const {calendar: createCalendarClient} = require("@googleapis/calendar");
const {JWT} = require("google-auth-library");
const {localDate, startOfLocalDay, localDayStart, addDays} = require("./time");
const {AGENT_MARKER, deleteCalendarEvent, deleteTaskEvents, findAgentEvents, eventIdsForTasks, appBusyWindows, eventWindow, getBusyWindows, getForeignBusyWindows, mergeBusyWindows} = require("./calendar");
const {repairSchedule, buildFixedSlots, matchLockedEvents} = require("./schedule");
const {planSchedule} = require("./planner");
const {lunchWindows, padWindows} = require("./breaks");
const {setTimerInList, pauseTimer} = require("./timer");
const {withoutProjectFields, needsTagFill, cleanTags, newTaskIds, applyDirectUpdate, moveToQueueNumber, completeInList, removalRecord, isUndoable, undoInList, manualTaskChange, mergeTaskChanges, applyScheduleResults} = require("./tasks");
const {withNewProject, normalizeProjectName} = require("./projects");
const {findDuplicateTasks} = require("./duplicates");
const {PROJECTS_COLLECTION, makeTaskStore, makeProjectStore, makeClientStore, makeTemplateStore, makeSettingsStore} = require("./store");
const {startFromTemplate} = require("./projectTemplates");
const {UNAVAILABLE, weatherUrl, parseForecast, forecastKey, weatherWindow} = require("./weather");
const {computeFingerprint, hasEndedSlot, shouldSkipRun} = require("./fingerprint");
const {buildTaskPrompt, buildTagPrompt} = require("./prompts");
const {checkProposal, acceptProposalInList, applyChanges} = require("./proposal");
const {MAX_TEMPLATES, buildTemplates} = require("./templates");
const {heldTaskIds} = require("./materials");
const {SUMMARY_MAX_ROWS, PROJECT_MAX_ROWS, clampLimit, serializeCompleted, summaryWindowStart, summarizeCompleted, summarizeProjectHours} = require("./completed");
const {isArchiveId, applyCompletedEdit} = require("./completedEdit");
const {reopenTask} = require("./reopen");
const {normalizePhoto, photoOwner, canAddPhoto, serializePhoto, sortPhotos} = require("./photos");
const {EXPORT_MAX_ROWS, buildExport} = require("./export");
const {CSV_MAX_ROWS, parseCsvRequest, buildCompletedCsv} = require("./csvExport");
const {parseJobSheetRequest, buildJobSheet, sheetArchiveIds, gatherPhotos, withPhotos} = require("./jobsheet");
const {renderJobSheetPdf} = require("./jobsheetPdf");
const {makeOwnerOnly} = require("./auth");
const {dayWindowMinutes} = require("./settings");
const {lastIssued} = require("./jobNumber");
const {randomUUID} = require("crypto");
const {v1: firestoreV1} = require("@google-cloud/firestore");
const {BACKUP_ROOT, normalizeBucketName, runBackup} = require("./backup");
const {normalizePushToken, sendToTokens, testPayload, publicSettings} = require("./push");

admin.initializeApp();
// Every function runs in Sydney, next to the Firestore database (australia-southeast1).
setGlobalOptions({region: "australia-southeast1"});

const db = admin.firestore();
// Active tasks: one document per task in `tasks/{id}`. updateTaskList(mutate) is a transactional read-modify-write
// of the whole list (see store.js); readTaskList() is a plain read.
const {updateTaskList, getTasks: readTaskList} = makeTaskStore(db);
// The last task deleted or completed, for undoRemove: one document, replaced by each removal
const LAST_REMOVED_REF = db.doc("settings/lastRemoved");
// Photos of tasks, one document each in `completed_photos/{auto-id}` {archiveId | taskId, data, bytes, addedAt}; see photos.js.
const PHOTOS = db.collection("completed_photos");
// Projects that tasks can belong to, in `projects/{id}`; see projects.js and store.js.
const {getProjects: readProjects, createProject, renameProject, setProjectClient, deleteProject} = makeProjectStore(db);
// Clients that projects can belong to, in `clients/{id}`; see clients.js and store.js.
const {getClients: readClients, createClient, updateClient, deleteClient} = makeClientStore(db);
// Project templates (a project's steps saved for reuse), in `project_templates/{id}`; see projectTemplates.js and store.js.
const {getTemplates: readTemplates, saveTemplate, renameTemplate, deleteTemplate} = makeTemplateStore(db);
// Runtime settings (location, time zone, auto-run schedule) in `settings/app`; see settings.js.
const {getSettings: readSettings, updateSettings: writeSettings, claimAutoRun, setRunFingerprint, addDeviceToken, removeDeviceTokens} = makeSettingsStore(db);

const MODEL_NAME = "gemini-3.5-flash-lite";

// Target Google Calendar for all scheduling (set in functions/.env)
const CALENDAR_ID = defineString("USER_CALENDAR_ID");
// Owner's personal calendar. Read-only: used for free/busy, never written to (set in functions/.env)
const PERSONAL_CALENDAR_ID = defineString("USER_PERSONAL_CALENDAR_ID");

// Cloud Storage bucket the weekly backup is written to (set in functions/.env; empty skips the backup)
const BACKUP_BUCKET = defineString("BACKUP_BUCKET", {default: ""});

// The owner's Google account, the only one allowed to call the HTTP endpoints (set in functions/.env)
const OWNER_EMAIL = defineString("OWNER_EMAIL");
// Browser origins allowed to call the endpoints: the Hosting site
const ALLOWED_ORIGINS = ["https://taskhub-next.web.app", "https://taskhub-next.firebaseapp.com"];
const ownerOnly = makeOwnerOnly((token) => admin.auth().verifyIdToken(token), () => OWNER_EMAIL.value());

// JSON Schema for the tags the model suggests for a task entered by hand
const tagSchema = {
  type: Type.OBJECT,
  properties: {tags: {type: Type.ARRAY, items: {type: Type.STRING}}},
  required: ["tags"],
};

// JSON Schema for the new or changed tasks the model returns on ingestion
const changeSchema = {
  type: Type.OBJECT,
  properties: {
    tasks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: {
            type: Type.STRING,
            description: "Id of the existing task being changed; empty for a new task",
          },
          title: {type: Type.STRING},
          priority: {
            type: Type.STRING,
            enum: ["HIGH", "MEDIUM", "LOW"],
          },
          dueDate: {
            type: Type.STRING,
            description: "YYYY-MM-DD or empty",
          },
          estimatedMinutes: {
            type: Type.INTEGER,
            description: "Inferred time in minutes to complete task",
          },
          tags: {
            type: Type.ARRAY,
            items: {type: Type.STRING},
            description: "Concise contextual tags like Outdoor, Garden (for gardening), Indoor, Shopping, Mentally Focused, Physical, etc.",
          },
          recurrence: {
            type: Type.OBJECT,
            description: "How often the task repeats. Omit to leave an existing task's recurrence unchanged; frequency NONE makes it stop repeating",
            properties: {
              frequency: {type: Type.STRING, enum: ["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]},
              interval: {type: Type.INTEGER, description: "Repeat every this many days, weeks, months or years (1 or more)"},
            },
            required: ["frequency", "interval"],
          },
          order: {
            type: Type.INTEGER,
            description: "For a new task, the rank (from 1) it should hold in the full list; for an existing task, its current rank",
          },
        },
        required: ["title", "priority", "estimatedMinutes", "tags", "order"],
      },
    },
  },
  required: ["tasks"],
};

// JSON Schema for the project the model may suggest for an input (only asked for when the request allows proposals)
const proposalSchema = {
  type: Type.OBJECT,
  description: "A project to suggest, only when the whole input is one goal with at least three sequential stages; omit otherwise",
  properties: {
    name: {type: Type.STRING, description: "Short project name"},
    steps: {
      type: Type.ARRAY,
      description: "3 to 12 steps in the order they are done",
      items: {
        type: Type.OBJECT,
        properties: {
          title: {type: Type.STRING},
          priority: {type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"]},
          estimatedMinutes: {type: Type.INTEGER},
          tags: {type: Type.ARRAY, items: {type: Type.STRING}},
          comments: {type: Type.STRING, description: "The useful detail the input gives for this step (measurements, materials, rules, warnings), as short plain-text lines; omit when the input has nothing specific for the step"},
        },
        required: ["title", "priority", "estimatedMinutes", "tags"],
      },
    },
  },
  required: ["name", "steps"],
};

// Helper: Authenticated Google Calendar Client
async function getCalendarClient() {
  const credentialsRaw = process.env.GOOGLE_CALENDAR_CREDENTIALS;
  if (!credentialsRaw) {
    throw new Error("Missing GOOGLE_CALENDAR_CREDENTIALS secret environment variable");
  }

  const serviceAccountJson = JSON.parse(credentialsRaw);
  const formattedPrivateKey = serviceAccountJson.private_key.replace(/\\n/g, "\n");

  const jwtClient = new JWT({
    email: serviceAccountJson.client_email,
    key: formattedPrivateKey,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  await jwtClient.authorize();
  return createCalendarClient({version: "v3", auth: jwtClient});
}

// Helper: Remove every calendar event belonging to a task
async function removeTaskCalendarEvent(task) {
  if (!task) return;
  try {
    const calendar = await getCalendarClient();
    await deleteTaskEvents(calendar, CALENDAR_ID.value(), task);
  } catch (err) {
    console.warn(`Calendar cleanup failed for task ${task.id}:`, err.message);
  }
}

// Helper: Fetch the weather at a location ({latitude, longitude}) as {forecast, key}: the current conditions as one
// line for the prompt, the daily forecast for the first days (empty when unavailable) and the coarse summary for the
// run fingerprint. A failed request gives the unavailable text, no forecast and the unavailable key.
async function getWeather(location, timeZone) {
  try {
    const res = await fetch(weatherUrl(location, timeZone));
    if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
    const data = await res.json();
    const forecast = parseForecast(data);
    return {forecast, key: forecastKey(forecast, data.current_weather)};
  } catch (err) {
    console.warn("Weather unavailable:", err.message);
    return {forecast: [], key: UNAVAILABLE};
  }
}

// Place the tasks with the deterministic planner and check the result against the slot rules (repairSchedule).
// Returns {slots, items, dropped}. An empty result is a real one (nothing fits), so it is not an error; slots that fail
// validation would be a planner bug, so those stop the run with the calendar untouched.
function planValidSchedule(toSchedule, validation, scheduleOrder = "URGENCY") {
  const plan = planSchedule({tasks: toSchedule, ...validation, scheduleOrder});
  const repaired = repairSchedule({items: plan.items, tasks: toSchedule, ...validation});
  if (repaired.dropped.length > 0 || repaired.errors.length > 0) {
    console.error("Planner output failed validation:", JSON.stringify({dropped: repaired.dropped, errors: repaired.errors}));
    throw new Error(`The planner produced an invalid schedule (${[...repaired.errors, ...repaired.dropped.map((d) => `task ${d.taskId}: ${d.reason}`)].slice(0, 5).join("; ")}); existing events were kept.`);
  }
  return {slots: repaired.slots, items: plan.items, dropped: plan.unplaced};
}

// Core Scheduling Engine Logic. Nothing on the calendar is touched until the slots
// have been validated; a failure before that point leaves existing events as they are.
// The personal calendar is only ever read.
// With `taskIds`, only those tasks are offered to the planner and have their events replaced; every other app
// event stays and counts as busy, and the other tasks' schedule fields are left alone.
// With `skipIfUnchanged` (automatic runs), a full run whose fingerprint equals the last successful full run's is
// skipped before the planner runs; see fingerprint.js. A full run that succeeds records its fingerprint.
async function runScheduleEngine({taskIds, skipIfUnchanged = false} = {}) {
  const subset = Array.isArray(taskIds) ? new Set(taskIds) : null;
  const currentTasks = await readTaskList();
  // Tasks this run is responsible for; the rest are neither rescheduled nor have their schedule fields rewritten
  const inScope = subset ? currentTasks.filter((t) => subset.has(t.id)) : currentTasks;

  if (currentTasks.length === 0) {
    return {success: true, scheduledCount: 0, message: "No active tasks."};
  }
  if (inScope.length === 0) {
    return {success: true, scheduledCount: 0, message: "None of the requested tasks exist."};
  }

  const calendar = await getCalendarClient();
  const calendarId = CALENDAR_ID.value();
  if (!calendarId) {
    throw new Error("Missing USER_CALENDAR_ID config (set it in functions/.env)");
  }
  const personalCalendarId = PERSONAL_CALENDAR_ID.value();
  if (!personalCalendarId) {
    throw new Error("Missing USER_PERSONAL_CALENDAR_ID config (set it in functions/.env)");
  }

  const settings = await readSettings();
  const timeZone = settings.timeZone;
  const now = new Date();
  const horizon = new Date(now.getTime() + settings.scheduleDays * 24 * 60 * 60 * 1000);

  // 1. Read-only lookups. Any failure aborts before an event is touched.
  const personalBusy = await getBusyWindows(calendar, personalCalendarId, now.toISOString(), horizon.toISOString(), timeZone);

  // A task is locked while its app-tagged event sits on the personal calendar and hasn't ended.
  // Locks are recomputed every run, so a lock is released once its event has passed.
  const personalAgentEvents = (await findAgentEvents(calendar, personalCalendarId, now.toISOString()))
      .filter((ev) => ev.status !== "cancelled" && eventWindow(ev, timeZone));
  const lockedEvents = matchLockedEvents(personalAgentEvents, currentTasks); // task id -> personal-calendar event
  const lockedWindows = [...lockedEvents.values()].map((ev) => eventWindow(ev, timeZone));
  const lockedEventIds = new Set([...lockedEvents.values()].map((ev) => ev.id));
  // Tasks waiting on materials (and the later tiers of their projects) are not scheduled: they are left out of
  // the request, and their old events are replaced like any other, so they end up unscheduled.
  const replacing = inScope.filter((t) => !lockedEvents.has(t.id));
  const heldIds = heldTaskIds(currentTasks, new Set(lockedEvents.keys()));
  const toSchedule = replacing.filter((t) => !heldIds.has(t.id));
  const heldCount = replacing.length - toSchedule.length;

  // Old agent-calendar events to replace: stored ids of the tasks being replaced, plus the marked events from
  // today that belong to them. A full run also takes every other marked event from today (orphans).
  const agentEvents = await findAgentEvents(calendar, calendarId, startOfLocalDay(timeZone).toISOString());
  const oldEventIds = new Set(replacing.map((t) => t.googleCalendarEventId).filter(Boolean));
  const replaceable = subset ? eventIdsForTasks(agentEvents, new Set(replacing.map((t) => t.id))) : agentEvents.map((ev) => ev.id);
  replaceable.forEach((id) => oldEventIds.add(id));
  lockedEventIds.forEach((id) => oldEventIds.delete(id));

  // 2. Agent-calendar busy time excludes the app's own events, which are replaced by this run.
  // Locked windows count as busy even if the personal event is marked free.
  const agentBusy = await getForeignBusyWindows(calendar, calendarId, now.toISOString(), horizon.toISOString(), timeZone, oldEventIds);
  // In a subset run the app events that stay put block their time, whatever their transparency.
  const keptAppBusy = subset ? appBusyWindows(agentEvents, timeZone, oldEventIds) : [];
  // Gap between tasks: every calendar event (personal or agent calendar), every pinned task and, in a subset run, every
  // other scheduled task keeps that distance from the tasks this run places (those get theirs from the planner among
  // themselves). The lunch break is busy time on every day and is not padded.
  const gap = settings.gapMinutes;
  const paddedBusy = padWindows([...personalBusy, ...lockedWindows, ...keptAppBusy, ...agentBusy], gap);
  const lunchBusy = lunchWindows({lunch: settings.lunch, timeZone, now, horizon});
  const busySlots = mergeBusyWindows([...paddedBusy, ...lunchBusy]);
  const {dayStartMin, dayEndMin} = dayWindowMinutes(settings);

  // 3. Get slots for the unlocked tasks from the planner, then validate before touching the calendar
  let scheduledList = [];
  let slots = [];
  let unscheduled = []; // tasks that got no slot with the reason, [{taskId, reason}]
  let fingerprint = null;
  if (toSchedule.length > 0) {
    const weather = await getWeather(settings.location, timeZone);
    if (!subset) {
      fingerprint = computeFingerprint({tasks: toSchedule, busySlots, weatherKey: weather.key, settings, now, horizon});
      if (shouldSkipRun({skipIfUnchanged, fingerprint, lastRunFingerprint: settings.lastRunFingerprint, endedSlot: hasEndedSlot(toSchedule, timeZone, now)})) {
        return {success: true, skipped: true, scheduledCount: 0, lockedCount: lockedEvents.size, heldCount, message: "Nothing changed since the last run; existing events were kept."};
      }
    }
    // Project members outside this run (locked, or already scheduled in a subset run) that the order rule respects
    const lockedByTask = new Map([...lockedEvents].map(([id, ev]) => [id, eventWindow(ev, timeZone)]));
    const fixed = buildFixedSlots({tasks: currentTasks, inScopeIds: subset ? new Set(inScope.map((t) => t.id)) : null, lockedWindows: lockedByTask, timeZone});
    console.log(`Scheduling ${toSchedule.length} tasks over ${settings.scheduleDays} days (${busySlots.length} busy windows, gap ${gap} min, day ${settings.day.start}-${settings.day.end}, lunch ${settings.lunch.enabled ? "on" : "off"}, to ${horizon.toISOString()})`);
    // Outdoor and Garden tasks stay inside the forecast window and off rainy days (enforced by the slot validation)
    const weatherRules = weatherWindow({today: localDate(timeZone, now), forecast: weather.forecast, current: weather.key});
    const validation = {busy: busySlots, now, horizon, timeZone, weather: weatherRules, allTasks: currentTasks, fixed, gapMinutes: gap, dayStartMin, dayEndMin};
    const result = planValidSchedule(toSchedule, validation, settings.scheduleOrder);
    scheduledList = result.items;
    slots = result.slots;
    unscheduled = result.dropped;
  }

  // 4. Insert the new events first; if any insert fails, remove the ones already created and keep the old schedule
  const created = [];
  try {
    for (const slot of slots) {
      const task = toSchedule.find((t) => t.id === slot.taskId);
      const eventResource = {
        summary: task.title,
        description: `${AGENT_MARKER}. ${slot.item.reasoning || ""}`,
        extendedProperties: {private: {taskId: task.id}},
      };
      if (slot.allDay) {
        eventResource.start = {date: slot.date};
        eventResource.end = {date: slot.endDate}; // Calendar's all-day end date is exclusive
        eventResource.transparency = "transparent";
      } else {
        eventResource.start = {dateTime: slot.item.startISO};
        eventResource.end = {dateTime: slot.item.endISO};
        eventResource.transparency = slot.item.transparency === "transparent" ? "transparent" : "opaque";
      }
      const createdEvent = await calendar.events.insert({calendarId, requestBody: eventResource});
      created.push({slot, eventId: createdEvent.data.id});
    }
  } catch (err) {
    for (const {eventId} of created) {
      await deleteCalendarEvent(calendar, calendarId, eventId);
    }
    throw new Error(`Inserting events failed; existing events were kept: ${err.message}`);
  }

  // 5. Remove the old events (agent calendar only), then record the new schedule on the tasks
  for (const id of oldEventIds) {
    await deleteCalendarEvent(calendar, calendarId, id);
  }

  // Record the schedule on the list as it is now: tasks edited, added or removed while the engine ran are kept as they are
  const scheduled = new Map(created.map((c) => [c.slot.taskId, {
    eventId: c.eventId,
    start: c.slot.allDay ? c.slot.date : c.slot.item.startISO,
    end: c.slot.allDay ? c.slot.endDate : c.slot.item.endISO,
  }]));
  const {orphanEventIds} = await updateTaskList((tasks) => applyScheduleResults({
    tasks,
    knownIds: new Set(inScope.map((t) => t.id)),
    locked: lockedEvents,
    scheduled,
    createdEvents: created.map((c) => ({taskId: c.slot.taskId, eventId: c.eventId})),
  }));
  // Events created for a task that was deleted or completed during the run
  for (const id of orphanEventIds) {
    await deleteCalendarEvent(calendar, calendarId, id);
  }

  // Remember what this schedule was built from. A failure to save it only means the next automatic run goes ahead.
  if (fingerprint) {
    try {
      await setRunFingerprint(fingerprint);
    } catch (err) {
      console.warn("Could not record the run fingerprint:", err.message);
    }
  }

  return {
    success: true,
    scheduledCount: slots.length,
    lockedCount: lockedEvents.size,
    heldCount,
    scheduleDays: settings.scheduleDays,
    lastScheduledDate: slots.length ? slots.map((s) => (s.allDay ? s.date : localDate(timeZone, new Date(s.endMs)))).sort().pop() : null,
    unscheduledCount: toSchedule.length - slots.length,
    dropped: unscheduled,
    schedule: scheduledList,
  };
}

// 1. Scheduled Function: dispatcher for the automatic schedule update
// Ticks every 15 minutes (the Cloud Scheduler cron is fixed at deploy; 15 minutes is the finest interval offered).
// Each tick asks the runtime settings whether a run is due (daily at a set local time, or every N minutes in the
// 8:00-20:00 local window) and claims it atomically, so a duplicate tick cannot start a second run. The claim
// records the attempt even if the run then fails, which keeps a failing run from retrying on every tick.
exports.autoScheduleDaily = onSchedule({
  schedule: "*/15 * * * *",
  timeoutSeconds: 120,
  memory: "512MiB",
  secrets: [
    {name: "GOOGLE_CALENDAR_CREDENTIALS", version: "latest"},
  ],
}, async (event) => {
  try {
    const {due} = await claimAutoRun();
    if (!due) return;
    console.log("Starting automated schedule update...");
    const result = await runScheduleEngine({skipIfUnchanged: true});
    console.log("Automated schedule completed:", JSON.stringify(result));
  } catch (err) {
    console.error("Automated schedule failed:", err);
  }
});

// Weekly backup: Sunday 03:00 Auckland time, a Firestore export of the whole database (photos included) into
// `backups/<stamp>/` in BACKUP_BUCKET, keeping the newest few (see backup.js). The export runs as a long operation
// that Firestore finishes on its own, so this only starts it.
exports.weeklyBackup = onSchedule({
  schedule: "0 3 * * 0",
  timeZone: "Pacific/Auckland",
  timeoutSeconds: 120,
}, async () => {
  const bucket = normalizeBucketName(BACKUP_BUCKET.value());
  try {
    const store = bucket ? admin.storage().bucket(bucket) : null;
    const adminClient = bucket ? new firestoreV1.FirestoreAdminClient() : null;
    const result = await runBackup({
      bucket,
      projectId: process.env.GCLOUD_PROJECT || admin.app().options.projectId,
      now: new Date(),
      exportDocuments: (request) => adminClient.exportDocuments(request),
      listFolders: async () => {
        const [, , apiResponse] = await store.getFiles({prefix: `${BACKUP_ROOT}/`, delimiter: "/", autoPaginate: false});
        return (apiResponse && apiResponse.prefixes) || [];
      },
      deleteFolder: (folder) => store.deleteFiles({prefix: `${folder}/`}),
    });
    if (result.error) console.error("Weekly backup skipped:", result.error);
    else console.log("Weekly backup started:", JSON.stringify(result));
  } catch (err) {
    console.error("Weekly backup failed:", err);
  }
});

// 2. HTTP Endpoint: Manual / On-Demand full run (the "Update now" button)
exports.generateWeeklySchedule = onRequest({
  secrets: [
    {name: "GOOGLE_CALENDAR_CREDENTIALS", version: "latest"},
  ],
  cors: ALLOWED_ORIGINS,
  timeoutSeconds: 120,
  memory: "512MiB",
}, ownerOnly(async (req, res) => {
  try {
    const result = await runScheduleEngine();
    res.status(200).send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// Reschedule one task: replace just its calendar event, leaving every other task's event in place.
exports.rescheduleTask = onRequest({
  secrets: [
    {name: "GOOGLE_CALENDAR_CREDENTIALS", version: "latest"},
  ],
  cors: ALLOWED_ORIGINS,
  timeoutSeconds: 120,
  memory: "512MiB",
}, ownerOnly(async (req, res) => {
  try {
    const {taskId} = req.body || {};
    if (!taskId || typeof taskId !== "string") return res.status(400).send({error: "Missing taskId"});
    if (!(await readTaskList()).some((t) => t.id === taskId)) return res.status(404).send({error: "Task not found"});

    const result = await runScheduleEngine({taskIds: [taskId]});
    // A task pinned to the personal calendar is never moved by the app
    if (result.scheduledCount === 0 && result.lockedCount > 0) {
      return res.status(409).send({error: "This task is pinned to your personal calendar, so it was left where it is."});
    }
    // A task with unchecked materials (or behind one in its project) is never placed
    if (result.scheduledCount === 0 && result.heldCount > 0) {
      return res.status(409).send({error: "This task is waiting on materials (its own, or an earlier step in its project), so it was not scheduled."});
    }
    res.status(200).send({...result, tasks: await readTaskList()});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 3. Endpoint: Add / Ingest Task. The model returns only new or changed tasks; they are merged into the
// stored list inside a transaction, so everything else on the list is preserved. With a `manual` body ({title,
// priority?, dueDate?, estimatedMinutes?, tags?, recurrence?, projectId?, projectOrder?, materials?, comments?}) no model is
// called to parse it: the fields are used as entered (validated like the model's) and the task is added at the end of the
// list. The one exception is a manual entry with no tags, for which the model is asked for tags only (a failure leaves
// the task untagged). `startNow: true` starts the timer of
// the first task the request adds, which also makes it the active task. A free-text body with `allowProposal: true` lets the
// model suggest a project (see proposal.js): when it does, nothing is committed and the response is
// {success, needsChoice: true, proposal: {name, steps}, singleChanges} (the model's ordinary changes). The owner's choice
// comes back without the model: `acceptProposal: {name, steps}` creates the project and its steps (each with `projectId`
// and `projectOrder` 1..n) in one transaction, re-validated against the projects stored then, and responds with `project`
// and `projects` as well; `apply: {changes}` merges the declined suggestion's `singleChanges` like any model output.
// The model's own changes never carry a project or an order number (withoutProjectFields): that is the only way a
// task joins a project here, apart from a manual entry.
exports.addOrUpdateTask = onRequest({
  secrets: ["GEMINI_API_KEY"], cors: ALLOWED_ORIGINS, timeoutSeconds: 120,
}, ownerOnly(async (req, res) => {
  try {
    const body = req.body || {};
    // The owner accepted a suggested project: it is checked again and committed with its steps, no model call
    if (body.acceptProposal !== undefined) {
      const accepted = await updateTaskList((tasks, tx, {projects: stored, jobCounter}) => {
        const done = acceptProposalInList(tasks, stored, body.acceptProposal, randomUUID, new Date().toISOString(), jobCounter);
        if (done.error) return {error: done.error, current: tasks};
        let list = done.tasks;
        if (body.startNow === true) {
          const [firstNew] = newTaskIds(tasks, list);
          if (firstNew) list = setTimerInList(list, firstNew, "START", Date.now()).tasks;
        }
        tx.set(db.collection(PROJECTS_COLLECTION).doc(done.project.id), done.project);
        return {tasks: list, current: list, project: done.project, projects: done.projects, added: done.added, jobCounter: done.jobCounter};
      }, {withProjects: true, withJobCounter: true});
      if (accepted.error) return res.status(400).send({error: accepted.error});
      return res.status(200).send({success: true, tasks: accepted.current, added: accepted.added, updated: 0, skipped: 0, project: accepted.project, projects: accepted.projects});
    }
    let changes;
    if (body.apply !== undefined) {
      // The owner declined a suggested project: its single-task changes are merged as the model's output would be
      changes = applyChanges(body.apply);
      if (!changes) return res.status(400).send({error: "apply needs a changes list of at most 100 task changes"});
      changes = withoutProjectFields(changes);
    } else if (body.manual !== undefined) {
      const change = manualTaskChange(body.manual);
      if (!change) return res.status(400).send({error: "A manual entry needs a title"});
      changes = [change];
      // A project to create together with the task: refused up front when the name is unusable (a taken name is found in the commit)
      if (body.manual.newProject !== undefined && normalizeProjectName(body.manual.newProject).error) {
        return res.status(400).send({error: normalizeProjectName(body.manual.newProject).error.replace("name", "newProject")});
      }
      if (needsTagFill(change)) {
        try {
          const currentTasks = await readTaskList();
          const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
          const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: buildTagPrompt({title: change.title, knownTags: currentTasks.flatMap((t) => t.tags || [])}),
            config: {responseMimeType: "application/json", responseSchema: tagSchema},
          });
          const tags = cleanTags(JSON.parse(response.text).tags);
          if (tags.length > 0) change.tags = tags;
        } catch (err) {
          console.warn("Tag suggestion failed; adding the task without tags:", err.message);
        }
      }
    } else {
      const userInput = body.input;
      if (!userInput) return res.status(400).send({error: "Missing input"});

      const [currentTasks, {timeZone}, projects] = await Promise.all([readTaskList(), readSettings(), readProjects()]);

      const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
      // A project suggestion is only asked for when the caller says it can answer one (`allowProposal`)
      const allowProposal = body.allowProposal === true;
      const prompt = buildTaskPrompt({tasks: currentTasks, projects, input: userInput, today: localDate(timeZone), proposals: allowProposal});

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: allowProposal ? {...changeSchema, properties: {...changeSchema.properties, projectProposal: proposalSchema}} : changeSchema,
        },
      });

      const parsed = JSON.parse(response.text);
      // The model never places a task in a project; only an accepted suggestion (or a manual entry) does
      changes = withoutProjectFields(parsed.tasks);
      // A valid suggestion commits nothing: the owner chooses between the project and the single task(s) first
      const verdict = allowProposal ? checkProposal(parsed.projectProposal, {input: userInput, projects}) : {};
      if (allowProposal && !verdict.proposal) console.log(`No project suggestion (${verdict.reason}); the model returned ${changes.length} task change(s).`);
      const proposal = verdict.proposal || null;
      if (proposal) return res.status(200).send({success: true, needsChoice: true, proposal, singleChanges: changes});
    }

    // Merge into the list as it is now, not as it was when the model was asked. The projects are read in the same
    // transaction, so a task only joins a project that still exists at commit time.
    const result = await updateTaskList((tasks, tx, {projects: stored, jobCounter}) => {
      // A manual entry's new project is created in the same commit as the task, so nothing is left behind if the add fails
      let entry = changes;
      let created = null;
      if (body.manual !== undefined && body.manual.newProject !== undefined) {
        created = withNewProject(stored, changes, body.manual.newProject, randomUUID);
        if (created.error) return {error: created.error, current: tasks};
        entry = created.changes;
        stored = created.projects;
      }
      const merged = mergeTaskChanges(tasks, entry, randomUUID, stored.map((p) => p.id), {materials: body.manual !== undefined, comments: body.manual !== undefined, history: body.manual !== undefined, now: new Date().toISOString(), jobCounter});
      const changed = merged.added + merged.updated > 0;
      let list = merged.tasks;
      if (body.startNow === true) {
        const [firstNew] = newTaskIds(tasks, list);
        if (firstNew) list = setTimerInList(list, firstNew, "START", Date.now()).tasks;
      }
      if (created && changed) tx.set(db.collection(PROJECTS_COLLECTION).doc(created.project.id), created.project);
      return {...merged, tasks: changed ? list : null, current: changed ? list : tasks, project: changed && created ? created.project : null, projects: changed && created ? created.projects : null};
    }, {withProjects: true, withJobCounter: true});
    if (result.error) return res.status(400).send({error: result.error});
    // A request that adds this many tasks at once is unusual: leave a trace of how it came about
    if (result.added > 3) console.warn(`addOrUpdateTask added ${result.added} tasks (${body.manual !== undefined ? "manual" : body.apply !== undefined ? "apply" : "free text"}, ${changes.length} change(s), ${result.updated} updated, ${result.skipped} skipped)`);

    res.status(200).send({
      success: true,
      tasks: result.current,
      added: result.added,
      updated: result.updated,
      skipped: result.skipped,
      ...(result.project ? {project: result.project, projects: result.projects} : {}),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 4. Endpoint: Archive Completed Tasks (Zero Token Cost Solution)
exports.completeTask = onRequest({
  secrets: [{name: "GOOGLE_CALENDAR_CREDENTIALS", version: "latest"}],
  cors: ALLOWED_ORIGINS,
}, ownerOnly(async (req, res) => {
  try {
    const {taskId} = req.body;
    if (!taskId) return res.status(400).send({error: "Missing taskId"});

    // The transaction function may run more than once, so the owner's local date is worked out before it
    const today = localDate((await readSettings()).timeZone);
    // The task's photos move to its archive row in the same commit (read here: the transaction callback is synchronous)
    const photoRefs = (await PHOTOS.where("taskId", "==", taskId).get()).docs.map((d) => d.ref);
    // Archive, removal and the next occurrence of a recurring task commit together; calendar cleanup follows once they have
    const result = await updateTaskList((tasks, tx, {jobCounter}) => {
      const done = completeInList(tasks, taskId, today, randomUUID, new Date().toISOString(), jobCounter);
      if (!done) return {current: tasks};
      const archiveRef = db.collection("completed_tasks").doc();
      tx.create(archiveRef, {
        ...done.completedTask,
        ...done.history,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      for (const ref of photoRefs) tx.update(ref, {archiveId: archiveRef.id, taskId: admin.firestore.FieldValue.delete()});
      // Kept for undoRemove, in the same commit
      tx.set(LAST_REMOVED_REF, removalRecord("COMPLETE", done.completedTask, archiveRef.id, done.spawned, Date.now()));
      return {tasks: done.tasks, current: done.tasks, completedTask: done.completedTask, spawned: done.spawned, archiveId: archiveRef.id, jobCounter: done.jobCounter};
    }, {withJobCounter: true});
    await removeTaskCalendarEvent(result.completedTask);
    // A photo added while the task was being completed is moved too
    if (result.completedTask && result.archiveId) {
      try {
        const left = await PHOTOS.where("taskId", "==", taskId).get();
        await Promise.all(left.docs.map((d) => d.ref.update({archiveId: result.archiveId, taskId: admin.firestore.FieldValue.delete()})));
      } catch (err) {
        console.warn("Could not sweep photos after completion", err);
      }
    }

    res.status(200).send({success: true, tasks: result.current, spawned: result.spawned || null});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 5. Endpoint: Read Tasks
exports.getTasks = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const tasks = await readTaskList();
    res.status(200).send({success: true, tasks});
  } catch (err) {
    res.status(500).send({error: err.message});
  }
}));

// 6. Endpoint: Read Completed Tasks
// Recently completed tasks from the archive, newest first (optional ?limit=, default 50, at most 1000; the page asks for 1000 and searches and pages through them itself, and `listTruncated` is true when the list reached its limit, so older entries exist), plus a
// summary of the last 8 local weeks of completions. The summary is computed from its own query, so it does not
// depend on the limit; `truncated` is true if the window held more rows than were read. `projectHours` is the hours of each
// current project per Monday-to-Sunday week over all time (see summarizeProjectHours), from one query per project of at most
// PROJECT_MAX_ROWS rows; `projectHoursTruncated` is true if any project had more.
exports.getCompletedTasks = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const archive = db.collection("completed_tasks");
    const {timeZone} = await readSettings();
    const now = new Date();
    const limit = clampLimit(req.query.limit);
    const [listSnap, windowSnap, projects] = await Promise.all([
      archive.orderBy("completedAt", "desc").limit(limit).get(),
      archive.where("completedAt", ">=", summaryWindowStart(timeZone, now)).orderBy("completedAt", "desc").limit(SUMMARY_MAX_ROWS).get(),
      readProjects(),
    ]);
    const summary = {...summarizeCompleted(windowSnap.docs.map((d) => d.data()), timeZone, now, undefined, projects), truncated: windowSnap.size >= SUMMARY_MAX_ROWS};
    const projectSnaps = await Promise.all(projects.map((p) => archive.where("projectId", "==", p.id)
        .select("projectId", "completedAt", "trackedSeconds", "estimatedMinutes").limit(PROJECT_MAX_ROWS).get()));
    const projectHours = summarizeProjectHours(projectSnaps.flatMap((snap) => snap.docs.map((d) => d.data())), projects, timeZone);
    res.status(200).send({
      success: true,
      tasks: serializeCompleted(listSnap.docs.map((d) => ({...d.data(), archiveId: d.id}))),
      listTruncated: listSnap.size >= limit,
      summary,
      projectHours,
      projectHoursTruncated: projectSnaps.some((snap) => snap.size >= PROJECT_MAX_ROWS),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 6b. Endpoint: Completed tasks as templates for a new task
// One entry per distinct title (ignoring case) from the newest SUMMARY_MAX_ROWS (1000) archive rows, newest first, see buildTemplates.
// The page searches the list itself as the owner types. Read-only.
exports.getCompletedTemplates = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const snap = await db.collection("completed_tasks").orderBy("completedAt", "desc").limit(SUMMARY_MAX_ROWS).get();
    const templates = buildTemplates(serializeCompleted(snap.docs.map((d) => d.data())), MAX_TEMPLATES);
    res.status(200).send({success: true, templates});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 6c. Endpoint: Correct or remove a completed task
// updateCompletedTask: body {id, updatedFields}, `id` the `archiveId` getCompletedTasks gives each entry. The editable fields
// are priority, estimatedMinutes, trackedSeconds, tags, materials (a plain list of texts), comments, projectId and the completion time (completedDate and completedTime
// together, in the owner's zone); see applyCompletedEdit. Responds {success, task} with the entry as it now is; 400 with the
// reason for an unusable value, 404 for an unknown id. deleteCompletedTask: body {id}, removes the entry for good.
// Both change the archive row only, which Stats and Project hours are computed from: the job history already carried by
// the live next occurrence of a repeating task, and by later archive rows, is not rewritten.
exports.updateCompletedTask = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const {id, updatedFields} = req.body || {};
    if (!isArchiveId(id)) return res.status(400).send({error: "Missing id"});
    const ref = db.collection("completed_tasks").doc(id);
    const [snap, {timeZone}, projects] = await Promise.all([ref.get(), readSettings(), readProjects()]);
    if (!snap.exists) return res.status(404).send({error: "Completed task not found"});
    const edit = applyCompletedEdit(snap.data(), updatedFields, {projectIds: projects.map((p) => p.id), timeZone, now: new Date()});
    if (edit.error) return res.status(400).send({error: edit.error});
    const changes = {...edit.set};
    if (changes.completedAt) changes.completedAt = admin.firestore.Timestamp.fromDate(changes.completedAt);
    for (const field of edit.remove) changes[field] = admin.firestore.FieldValue.delete();
    await ref.update(changes);
    const fresh = await ref.get();
    res.status(200).send({success: true, task: serializeCompleted([{...fresh.data(), archiveId: id}])[0]});
  } catch (err) {
    console.error(err);
    res.status(err.code === 5 ? 404 : 500).send({error: err.code === 5 ? "Completed task not found" : err.message});
  }
}));

// Endpoint: Reopen a completed task. Body {id}, the archive id. The entry leaves `completed_tasks` and its task returns to the end
// of the queue with the time it accrued, its photos following it (see reopen.js for what comes back and what does not).
// 400 with the reason for an unusable id or an entry without a title, 404 for an unknown id. Responds {success, tasks, task}.
// No calendar change: the next schedule run books it.
exports.reopenCompletedTask = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const {id} = req.body || {};
    if (!isArchiveId(id)) return res.status(400).send({error: "Missing id"});
    const archiveRef = db.collection("completed_tasks").doc(id);
    // The row and its photos are read before the transaction (its callback is synchronous); a photo added in between is moved after the commit
    const [snap, photoSnap] = await Promise.all([archiveRef.get(), PHOTOS.where("archiveId", "==", id).get()]);
    if (!snap.exists) return res.status(404).send({error: "Completed task not found"});
    const row = snap.data();
    const result = await updateTaskList((tasks, tx, {projects: stored}) => {
      const done = reopenTask(tasks, row, {projectIds: stored.map((p) => p.id), makeId: randomUUID});
      if (done.error) return {error: done.error, current: tasks};
      tx.delete(archiveRef);
      for (const doc of photoSnap.docs) tx.update(doc.ref, {taskId: done.task.id, archiveId: admin.firestore.FieldValue.delete()});
      return {tasks: done.tasks, current: done.tasks, task: done.task};
    }, {withProjects: true});
    if (result.error) return res.status(400).send({error: result.error});
    try {
      const left = await PHOTOS.where("archiveId", "==", id).get();
      await Promise.all(left.docs.map((d) => d.ref.update({taskId: result.task.id, archiveId: admin.firestore.FieldValue.delete()})));
    } catch (err) {
      console.warn("Could not sweep photos after reopening", err);
    }
    res.status(200).send({success: true, tasks: result.current, task: result.task});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));
exports.deleteCompletedTask = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const {id} = req.body || {};
    if (!isArchiveId(id)) return res.status(400).send({error: "Missing id"});
    const ref = db.collection("completed_tasks").doc(id);
    const found = await db.runTransaction(async (tx) => {
      const [row, photos] = await Promise.all([tx.get(ref), tx.get(PHOTOS.where("archiveId", "==", id))]);
      if (!row.exists) return false;
      tx.delete(ref);
      for (const photo of photos.docs) tx.delete(photo.ref);
      return true;
    });
    if (!found) return res.status(404).send({error: "Completed task not found"});
    res.status(200).send({success: true});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 6b. Endpoints: photos on tasks (see photos.js)
// addCompletedPhoto: body {archiveId | taskId, image}, `image` a base64 JPEG of at most about 300 KB, `archiveId` a completed
// task and `taskId` one still in the queue; at most 3 photos per task. Responds {success, photo: {id, bytes, addedAt}}; 400
// with the reason for an unusable image or a full task, 404 for an unknown archive row or task. getCompletedPhotos: body
// {archiveId | taskId}; responds {photos: [{id, data, bytes, addedAt}]}, oldest first, `data` the base64 JPEG.
// deleteCompletedPhoto: body {id}, the photo's id; deletes it for good, 404 for an unknown id.
// A photo of a queued task moves to the archive row when the task is completed (completeTask), is deleted with the task
// (updateTaskDirect DELETE), and moves back if the completion is undone (undoRemove).
exports.addCompletedPhoto = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const {image} = req.body || {};
    const owner = photoOwner(req.body);
    if (owner.error) return res.status(400).send({error: owner.error});
    const photo = normalizePhoto(image);
    if (photo.error) return res.status(400).send({error: photo.error});
    // A queued task is looked up in the task list just before the transaction; one completed in between is re-keyed by completeTask's sweep
    if (owner.field === "taskId" && !(await readTaskList()).some((t) => t.id === owner.id)) {
      return res.status(404).send({error: "Task not found"});
    }
    const archiveRef = owner.field === "archiveId" ? db.collection("completed_tasks").doc(owner.id) : null;
    const result = await db.runTransaction(async (tx) => {
      const [row, existing] = await Promise.all([archiveRef ? tx.get(archiveRef) : null, tx.get(PHOTOS.where(owner.field, "==", owner.id))]);
      if (row && !row.exists) return {notFound: true};
      if (!canAddPhoto(existing.size)) return {full: true};
      const ref = PHOTOS.doc();
      const doc = {[owner.field]: owner.id, data: photo.data, bytes: photo.bytes, addedAt: admin.firestore.Timestamp.now()};
      tx.set(ref, doc);
      return {id: ref.id, doc};
    });
    if (result.notFound) return res.status(404).send({error: "Completed task not found"});
    if (result.full) return res.status(400).send({error: "This task already has the most photos (3)"});
    const saved = serializePhoto(result.id, result.doc);
    res.status(200).send({success: true, photo: {id: saved.id, bytes: saved.bytes, addedAt: saved.addedAt}});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

exports.getCompletedPhotos = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const owner = photoOwner(req.body);
    if (owner.error) return res.status(400).send({error: owner.error});
    const snap = await PHOTOS.where(owner.field, "==", owner.id).get();
    res.status(200).send({photos: sortPhotos(snap.docs.map((d) => serializePhoto(d.id, d.data())))});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

exports.deleteCompletedPhoto = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const {id} = req.body || {};
    if (!isArchiveId(id)) return res.status(400).send({error: "Missing id"});
    const ref = PHOTOS.doc(id);
    if (!(await ref.get()).exists) return res.status(404).send({error: "Photo not found"});
    await ref.delete();
    res.status(200).send({success: true});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 7. Endpoint: Direct Update / Delete
// An UPDATE's `snoozedUntil` (a YYYY-MM-DD date; null or "" removes it) keeps the task off the schedule before that day.
exports.updateTaskDirect = onRequest({
  secrets: [{name: "GOOGLE_CALENDAR_CREDENTIALS", version: "latest"}],
  cors: ALLOWED_ORIGINS,
}, ownerOnly(async (req, res) => {
  try {
    const {taskId, action, updatedFields} = req.body;
    // A deleted task's photos go with it (read here: the transaction callback is synchronous)
    const photoRefs = action === "DELETE" && taskId ? (await PHOTOS.where("taskId", "==", taskId).get()).docs.map((d) => d.ref) : [];

    // The project list is read in the same transaction, so a task can only join a project that exists at commit time
    const result = await updateTaskList((tasks, tx, {projects}) => {
      if (action === "DELETE") {
        const removedTask = tasks.find((t) => t.id === taskId);
        if (!removedTask) return {current: tasks};
        const remaining = tasks.filter((t) => t.id !== taskId);
        tx.set(LAST_REMOVED_REF, removalRecord("DELETE", pauseTimer(removedTask, Date.now()), null, null, Date.now())); // kept for undoRemove
        for (const ref of photoRefs) tx.delete(ref);
        return {tasks: remaining, current: remaining, removedTask};
      }
      if (action === "UPDATE" && tasks.some((t) => t.id === taskId)) {
        let next = tasks.map((t) => (t.id === taskId ? applyDirectUpdate(t, updatedFields, projects.map((p) => p.id)) : t));
        // `queueNumber` moves the task to that place in the queue, the others closing up around it
        const moved = updatedFields && Number.isInteger(updatedFields.queueNumber) ? moveToQueueNumber(next, taskId, updatedFields.queueNumber) : null;
        if (moved) next = moved;
        return {tasks: next, current: next};
      }
      return {current: tasks};
    }, {withProjects: true});
    // Calendar cleanup follows the commit; a locked task's personal-calendar event is never touched
    await removeTaskCalendarEvent(result.removedTask);

    res.status(200).send({success: true, tasks: result.current});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 6c. Endpoint: remove duplicate tasks from the queue (see duplicates.js)
// Body {dryRun?: true}. With `dryRun` nothing is changed and the response is {success, duplicates: [{id, title, dueDate}], tasks};
// without it the most recently added copies are deleted (with their photos and calendar events; there is no undo) and the
// response is {success, removed: n, tasks}.
exports.removeDuplicateTasks = onRequest({
  secrets: [{name: "GOOGLE_CALENDAR_CREDENTIALS", version: "latest"}],
  cors: ALLOWED_ORIGINS,
}, ownerOnly(async (req, res) => {
  try {
    const dryRun = (req.body || {}).dryRun === true;
    const result = await updateTaskList((tasks) => {
      const duplicates = findDuplicateTasks(tasks);
      if (dryRun || duplicates.length === 0) return {current: tasks, duplicates};
      const gone = new Set(duplicates.map((t) => t.id));
      const remaining = tasks.filter((t) => !gone.has(t.id));
      return {tasks: remaining, current: remaining, duplicates};
    });
    if (!dryRun) {
      for (const task of result.duplicates) await removeTaskCalendarEvent(task);
      try {
        for (const task of result.duplicates) {
          const photos = await PHOTOS.where("taskId", "==", task.id).get();
          await Promise.all(photos.docs.map((d) => d.ref.delete()));
        }
      } catch (err) {
        console.warn("Could not delete the photos of removed duplicates", err);
      }
      console.log(`Removed ${result.duplicates.length} duplicate task(s)`);
    }
    res.status(200).send({
      success: true,
      ...(dryRun ? {duplicates: result.duplicates.map((t) => ({id: t.id, title: t.title, dueDate: t.dueDate || ""}))} : {removed: result.duplicates.length}),
      tasks: result.current,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 7a. Endpoint: Start, pause or abort a task's timer
// Body {taskId, action: "START"|"PAUSE"|"ABORT", capSeconds?}. The server's clock is used. `capSeconds` (a whole number >= 0, PAUSE only)
// counts at most that much of the running stretch, for a timer left running by mistake (400 when it is not a whole number >= 0). Starting also pauses any other running timer
// (one runs at a time). Starting a running timer or pausing a paused one changes nothing. ABORT stops the task's timer
// and erases its tracked time, first-started time and active mark, returning it to the plain queue as if never timed. 400 for an unusable action, 404
// for an unknown task. Responds {success, tasks}.
exports.toggleTimer = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const {taskId, action, capSeconds} = req.body || {};
    const verb = typeof action === "string" ? action.trim().toUpperCase() : "";
    if (verb !== "START" && verb !== "PAUSE" && verb !== "ABORT") return res.status(400).send({error: "action must be START, PAUSE or ABORT"});
    if (capSeconds !== undefined && capSeconds !== null && !(Number.isInteger(capSeconds) && capSeconds >= 0)) return res.status(400).send({error: "capSeconds must be a whole number of seconds, 0 or more"});
    const result = await updateTaskList((tasks) => {
      const done = setTimerInList(tasks, taskId, verb, Date.now(), {capSeconds: capSeconds === null ? undefined : capSeconds});
      if (!done) return {current: tasks, unknown: true};
      return {tasks: done.tasks, current: done.tasks};
    });
    if (result.unknown) return res.status(404).send({error: "Task not found"});
    res.status(200).send({success: true, tasks: result.current});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 7b. Endpoint: Undo the last delete or completion
// No body. Puts the task most recently deleted or completed back on the list (taking off the next occurrence a
// completion created, and deleting its archive entry), if that was within 10 minutes and it is not already back.
// Only the last removal is kept, so it undoes one step. Responds {success, tasks, kind}; 404 when there is nothing
// to undo. The task's calendar event stays deleted: the next schedule run books it again.
exports.undoRemove = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const snap = await LAST_REMOVED_REF.get();
    const record = snap.exists ? snap.data() : null;
    if (!isUndoable(record, Date.now())) return res.status(404).send({error: "Nothing to undo"});
    // The archive row's photos go back to the task. They are read before the transaction (its callback is synchronous) and
    // any added in between are moved after the commit.
    const backToTask = (ref) => ref.update({taskId: record.task.id, archiveId: admin.firestore.FieldValue.delete()});
    const photoRefs = record.archiveId ? (await PHOTOS.where("archiveId", "==", record.archiveId).get()).docs.map((d) => d.ref) : [];
    const result = await updateTaskList((tasks, tx) => {
      const undone = undoInList(tasks, record);
      tx.delete(LAST_REMOVED_REF);
      if (!undone) return {current: tasks};
      if (record.archiveId) {
        tx.delete(db.collection("completed_tasks").doc(record.archiveId));
        for (const ref of photoRefs) tx.update(ref, {taskId: record.task.id, archiveId: admin.firestore.FieldValue.delete()});
      }
      return {tasks: undone.tasks, current: undone.tasks, restored: true};
    });
    if (result.restored && record.archiveId) {
      try {
        const left = await PHOTOS.where("archiveId", "==", record.archiveId).get();
        await Promise.all(left.docs.map((d) => backToTask(d.ref)));
      } catch (err) {
        console.warn("Could not move photos back after undo", err);
      }
    }
    res.status(200).send({success: true, tasks: result.current, kind: record.kind, restored: Boolean(result.restored)});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 7c. Endpoint: Export everything
// No body. Responds with one pretty-printed JSON document (see export.js): the active tasks, the projects, the clients, the
// settings and the newest EXPORT_MAX_ROWS rows of the completed archive. Read-only; the collections are read one after
// another without a shared snapshot, which is fine for a single user's backup.
exports.exportData = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const [tasks, projects, clients, projectTemplates, settings, counterSnap, archiveSnap] = await Promise.all([
      readTaskList(),
      readProjects(),
      readClients(),
      readTemplates(),
      readSettings(),
      db.doc("settings/jobCounter").get(),
      db.collection("completed_tasks").orderBy("completedAt", "desc").limit(EXPORT_MAX_ROWS).get(),
    ]);
    const payload = buildExport({tasks, projects, clients, projectTemplates, settings: publicSettings(settings), completed: archiveSnap.docs.map((d) => d.data()), now: new Date(), jobCounter: lastIssued(counterSnap.exists ? counterSnap.data() : undefined)});
    res.status(200).type("application/json").send(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 7c. Endpoint: Completed work as a spreadsheet (CSV)
// Body {from?, to?}: local dates YYYY-MM-DD in the configured zone, both inclusive, either one empty for no limit. Responds with the
// CSV itself (text/csv, UTF-8 with a byte order mark), one line per completed task in the range, oldest first (see buildCompletedCsv).
// 400 for an unusable date or an upside-down range, and for a range holding more than CSV_MAX_ROWS tasks (so a file is never silently
// cut). Read-only; the range is on `completedAt`, so it needs no index.
exports.exportCompletedCsv = onRequest({cors: ALLOWED_ORIGINS, timeoutSeconds: 60, memory: "512MiB"}, ownerOnly(async (req, res) => {
  try {
    const range = parseCsvRequest(req.body);
    if (range.error) return res.status(400).send({error: range.error});
    const [{timeZone}, projects, clients] = await Promise.all([readSettings(), readProjects(), readClients()]);
    let query = db.collection("completed_tasks");
    if (range.from) query = query.where("completedAt", ">=", localDayStart(timeZone, range.from));
    if (range.to) query = query.where("completedAt", "<", localDayStart(timeZone, addDays(range.to, 1)));
    const snap = await query.orderBy("completedAt", "asc").limit(CSV_MAX_ROWS + 1).get();
    if (snap.size > CSV_MAX_ROWS) return res.status(400).send({error: `That range holds more than ${CSV_MAX_ROWS} completed tasks; choose a shorter one`});
    const csv = buildCompletedCsv({rows: snap.docs.map((d) => d.data()), projects, clients, timeZone});
    res.status(200).type("text/csv; charset=utf-8").set("Cache-Control", "no-store").send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 7d. Endpoint: Job sheet (PDF)
// Body {archiveId} (one completed task, the `archiveId` getCompletedTasks gives each entry), {projectId} (a project to date) or
// {projectId, weekStart} (its Monday-to-Sunday week; any date in the week names it); see parseJobSheetRequest. Responds
// with the PDF itself (application/pdf): every time and date on the owner's clock, the tracked time (or estimate), comments, tags and
// materials (with costs) and photos (at most JOB_SHEET_MAX_PHOTOS a sheet) of each completed task, and for a project the hours as the Stats page figures them (see buildJobSheet,
// renderJobSheetPdf), plus labour at the hourly rate, materials cost and a total when a rate or any cost is set (see invoice.js). 400 for an unusable body, 404 for an unknown task or project. Read-only. A project's rows are
// read the way the Stats hours are (at most PROJECT_MAX_ROWS), and a sheet lists at most its newest JOB_SHEET_MAX_ENTRIES.
exports.getJobSheet = onRequest({cors: ALLOWED_ORIGINS, timeoutSeconds: 60, memory: "512MiB"}, ownerOnly(async (req, res) => {
  try {
    const request = parseJobSheetRequest(req.body);
    if (request.error) return res.status(400).send({error: request.error});
    const archive = db.collection("completed_tasks");
    const [{timeZone, jobSheet}, projects, clients] = await Promise.all([readSettings(), readProjects(), readClients()]);
    let rows;
    let project;
    if (request.type === "TASK") {
      const snap = await archive.doc(request.archiveId).get();
      if (!snap.exists) return res.status(404).send({error: "Completed task not found"});
      rows = [{...snap.data(), archiveId: snap.id}];
      project = projects.find((p) => p.id === rows[0].projectId) || null;
    } else {
      project = projects.find((p) => p.id === request.projectId);
      if (!project) return res.status(404).send({error: "Project not found"});
      const snap = await archive.where("projectId", "==", project.id).limit(PROJECT_MAX_ROWS).get();
      rows = snap.docs.map((d) => ({...d.data(), archiveId: d.id}));
    }
    const sheet = buildJobSheet({request, rows, project, client: project ? clients.find((c) => c.id === project.clientId) || null : null, timeZone, now: new Date(), contractorInfo: jobSheet.contractorInfo, hourlyRate: jobSheet.hourlyRate});
    // Each listed task's photos go in the PDF, at most JOB_SHEET_MAX_PHOTOS in all (see gatherPhotos)
    const {byId, omitted} = await gatherPhotos(sheetArchiveIds(sheet), {
      fetchChunk: async (ids) => (await PHOTOS.where("archiveId", "in", ids).get()).docs.map((d) => ({archiveId: d.get("archiveId"), ...serializePhoto(d.id, d.data())})),
      countChunk: async (ids) => (await PHOTOS.where("archiveId", "in", ids).count().get()).data().count,
    });
    const pdf = await renderJobSheetPdf(withPhotos(sheet, byId, omitted));
    res.status(200).type("application/pdf").set("Cache-Control", "no-store").send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 8. Endpoint: Read Settings
// Location, time zone, auto-run schedule and the run state; defaults fill anything not yet saved.
exports.getSettings = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    res.status(200).send({success: true, settings: publicSettings(await readSettings())});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 9. Endpoint: Update Settings
// Body: {settings: {location?, timeZone?, scheduleDays?, gapMinutes?, timerWarnHours?, scheduleOrder?, day?, lunch?, schedule?, jobSheet?}}, any subset of the editable fields. 400 with the reason
// when a field is invalid (nothing is saved); run state cannot be set.
exports.updateSettings = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const result = await writeSettings(req.body && req.body.settings);
    if (result.error) return res.status(400).send({error: result.error});
    res.status(200).send({success: true, settings: publicSettings(result.settings)});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 9b. Endpoint: Register or drop a device for push notifications
// Body: {action: "REGISTER"|"UNREGISTER", token}, the token being the Firebase Cloud Messaging registration token the page got for
// this device. At most 5 devices are kept (the oldest goes). 400 for another action or an unusable token. Responds {success, devices}.
exports.updatePushToken = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const {action, token} = req.body || {};
    let result;
    if (action === "REGISTER") result = await addDeviceToken(token);
    else if (action === "UNREGISTER") result = await removeDeviceTokens([normalizePushToken(token)]);
    else return res.status(400).send({error: "action must be REGISTER or UNREGISTER"});
    if (result.error) return res.status(400).send({error: result.error});
    res.status(200).send({success: true, devices: result.tokens.length});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 9c. Endpoint: Send a test notification
// No body. Sends one message to every registered device and drops the devices the push service reports as gone. 400 when no device
// is registered; 502 with the error codes when nothing was delivered. Responds {success, sent, failed, removed, devices}.
exports.sendTestNotification = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const {pushTokens} = await readSettings();
    if (!pushTokens.length) return res.status(400).send({error: "No device is registered for notifications"});
    const summary = await sendToTokens(admin.messaging(), pushTokens, testPayload());
    let devices = pushTokens.length;
    if (summary.dead.length) devices = (await removeDeviceTokens(summary.dead)).tokens.length;
    if (!summary.sent) return res.status(502).send({error: `No notification was delivered (${summary.errors.join(", ")})`});
    res.status(200).send({success: true, sent: summary.sent, failed: summary.failed, removed: summary.dead.length, devices});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 10. Endpoint: Read Projects
exports.getProjects = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    res.status(200).send({success: true, projects: await readProjects()});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 11. Endpoint: Create / Rename / Delete a Project
// Body: {action: "CREATE", name} | {action: "UPDATE", projectId, name} (rename) | {action: "SET_CLIENT", projectId, clientId} (null or "" takes the client off; 400 for an unknown client) | {action: "DELETE", projectId}.
// 400 with the reason for an unusable or taken name or an unknown action, 404 for an unknown projectId. DELETE also
// takes its member tasks out of the project (the tasks stay) and returns the updated `tasks`. No calendar changes.
exports.updateProject = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const {action, projectId, name} = req.body || {};
    let result;
    if (action === "CREATE") result = await createProject(name, randomUUID);
    else if (action === "UPDATE") result = await renameProject(projectId, name);
    else if (action === "SET_CLIENT") result = await setProjectClient(projectId, req.body.clientId);
    else if (action === "DELETE") result = await deleteProject(projectId);
    else return res.status(400).send({error: "action must be CREATE, UPDATE, SET_CLIENT or DELETE"});
    if (result.notFound) return res.status(404).send({error: "Project not found"});
    if (result.error) return res.status(400).send({error: result.error});
    res.status(200).send({success: true, ...result});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 12. Endpoint: Read Clients
exports.getClients = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    res.status(200).send({success: true, clients: await readClients()});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 13. Endpoint: Create / Update / Delete a Client
// Body: {action: "CREATE", client: {name, address?, phone?, email?}} | {action: "UPDATE", clientId, client} (replaces the fields) | {action: "DELETE", clientId}.
// 400 with the reason for an unusable field or a taken name (ignoring case) or an unknown action, 404 for an unknown clientId. DELETE takes the
// client off its projects (they stay) and returns the updated `projects`. No calendar changes.
exports.updateClient = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const {action, clientId, client} = req.body || {};
    let result;
    if (action === "CREATE") result = await createClient(client, randomUUID);
    else if (action === "UPDATE") result = await updateClient(clientId, client);
    else if (action === "DELETE") result = await deleteClient(clientId);
    else return res.status(400).send({error: "action must be CREATE, UPDATE or DELETE"});
    if (result.notFound) return res.status(404).send({error: "Client not found"});
    if (result.error) return res.status(400).send({error: result.error});
    res.status(200).send({success: true, ...result});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 14. Endpoint: Read Project Templates
exports.getProjectTemplates = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    res.status(200).send({success: true, templates: await readTemplates()});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 15. Endpoint: Save / Rename / Delete / Start from a Project Template
// Body: {action: "SAVE", projectId, name?} (stores the project's queued tasks as steps; no name means the project's name) |
// {action: "RENAME", templateId, name} | {action: "DELETE", templateId} |
// {action: "START", templateId, name, startNow?} (creates the project `name` and one new task per step, each with the next job
// number, in one transaction; `startNow: true` starts the first task's timer). 400 with the reason for an unusable or taken name,
// a project with no tasks or an unknown action, 404 for an unknown projectId or templateId. SAVE, RENAME and DELETE respond with
// `templates`; START with `tasks`, `added`, `project` and `projects`. No calendar changes.
exports.updateProjectTemplate = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const {action, projectId, templateId, name} = req.body || {};
    let result;
    if (action === "SAVE") result = await saveTemplate(projectId, name, randomUUID);
    else if (action === "RENAME") result = await renameTemplate(templateId, name);
    else if (action === "DELETE") result = await deleteTemplate(templateId);
    else if (action === "START") {
      const template = (await readTemplates()).find((t) => t.id === templateId);
      if (!template) return res.status(404).send({error: "Template not found"});
      const started = await updateTaskList((tasks, tx, {projects: stored, jobCounter}) => {
        const done = startFromTemplate(tasks, stored, template, name, randomUUID, new Date().toISOString(), jobCounter);
        if (done.error) return {error: done.error, current: tasks};
        let list = done.tasks;
        if (req.body.startNow === true) {
          const [firstNew] = newTaskIds(tasks, list);
          if (firstNew) list = setTimerInList(list, firstNew, "START", Date.now()).tasks;
        }
        tx.set(db.collection(PROJECTS_COLLECTION).doc(done.project.id), done.project);
        return {tasks: list, current: list, project: done.project, projects: done.projects, added: done.added, jobCounter: done.jobCounter};
      }, {withProjects: true, withJobCounter: true});
      if (started.error) return res.status(400).send({error: started.error});
      return res.status(200).send({success: true, tasks: started.current, added: started.added, project: started.project, projects: started.projects});
    } else return res.status(400).send({error: "action must be SAVE, RENAME, DELETE or START"});
    if (result.notFound) return res.status(404).send({error: action === "SAVE" ? "Project not found" : "Template not found"});
    if (result.error) return res.status(400).send({error: result.error});
    res.status(200).send({success: true, ...result});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));
