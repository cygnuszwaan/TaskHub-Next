/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {setGlobalOptions} = require("firebase-functions/v2");
const {defineString} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {GoogleGenAI, Type} = require("@google/genai");
const {google} = require("googleapis");
const {localDate, startOfLocalDay} = require("./time");
const {AGENT_MARKER, deleteCalendarEvent, deleteTaskEvents, findAgentEvents, eventIdsForTasks, appBusyWindows, eventWindow, getBusyWindows, getForeignBusyWindows, mergeBusyWindows} = require("./calendar");
const {repairSchedule, parseScheduleResponse, buildFixedSlots, matchLockedEvents} = require("./schedule");
const {applyDirectUpdate, completeInList, mergeTaskChanges, applyScheduleResults} = require("./tasks");
const {makeTaskStore, makeProjectStore, makeSettingsStore} = require("./store");
const {UNAVAILABLE, weatherUrl, describeWeather, parseForecast, forecastKey} = require("./weather");
const {computeFingerprint, hasEndedSlot, shouldSkipRun} = require("./fingerprint");
const {buildSchedulePrompt, buildTaskPrompt} = require("./prompts");
const {SUMMARY_MAX_ROWS, clampLimit, serializeCompleted, summaryWindowStart, summarizeCompleted} = require("./completed");
const {makeOwnerOnly} = require("./auth");
const {randomUUID} = require("crypto");

admin.initializeApp();
// Every function runs in Sydney, next to the Firestore database (australia-southeast1).
setGlobalOptions({region: "australia-southeast1"});

const db = admin.firestore();
// Active tasks: one document per task in `tasks/{id}`. updateTaskList(mutate) is a transactional read-modify-write
// of the whole list (see store.js); readTaskList() is a plain read.
const {updateTaskList, getTasks: readTaskList} = makeTaskStore(db);
// Projects that tasks can belong to, in `projects/{id}`; see projects.js and store.js.
const {getProjects: readProjects, createProject, renameProject, deleteProject} = makeProjectStore(db);
// Runtime settings (location, time zone, auto-run schedule) in `settings/app`; see settings.js.
const {getSettings: readSettings, updateSettings: writeSettings, claimAutoRun, setRunFingerprint} = makeSettingsStore(db);

const MODEL_NAME = "gemini-3.5-flash-lite";
// Each Gemini scheduling request is cut off after this long; a run makes at most SCHEDULE_ATTEMPTS of them.
const GEMINI_TIMEOUT_MS = 60 * 1000;
const SCHEDULE_ATTEMPTS = 3;


// Target Google Calendar for all scheduling (set in functions/.env)
const CALENDAR_ID = defineString("USER_CALENDAR_ID");
// Owner's personal calendar. Read-only: used for free/busy, never written to (set in functions/.env)
const PERSONAL_CALENDAR_ID = defineString("USER_PERSONAL_CALENDAR_ID");

// The owner's Google account, the only one allowed to call the HTTP endpoints (set in functions/.env)
const OWNER_EMAIL = defineString("OWNER_EMAIL");
// Browser origins allowed to call the endpoints: the Hosting site
const ALLOWED_ORIGINS = ["https://taskhub-next.web.app", "https://taskhub-next.firebaseapp.com"];
const ownerOnly = makeOwnerOnly((token) => admin.auth().verifyIdToken(token), () => OWNER_EMAIL.value());

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
            description: "Concise contextual tags like Outdoor, Indoor, Shopping, Mentally Focused, Physical, etc.",
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
          projectId: {
            type: Type.STRING,
            description: "Id of an existing project the input puts the task in, copied exactly from the project list; omit otherwise",
          },
          projectOrder: {
            type: Type.INTEGER,
            description: "Position (from 1) in the project's sequence when the input gives one; omit otherwise",
          },
          order: {
            type: Type.INTEGER,
            description: "Rank (from 1) this task should hold in the full list",
          },
        },
        required: ["title", "priority", "estimatedMinutes", "tags", "order"],
      },
    },
  },
  required: ["tasks"],
};

// JSON Schema for Calendar Scheduler
const scheduleSchema = {
  type: Type.OBJECT,
  properties: {
    scheduledTasks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          taskId: {type: Type.STRING},
          title: {type: Type.STRING},
          startISO: {
            type: Type.STRING,
            description: "ISO 8601 start date time in the owner's local time with its UTC offset, e.g. 2026-10-22T09:00:00+13:00",
          },
          endISO: {
            type: Type.STRING,
            description: "ISO 8601 end date time in the owner's local time with its UTC offset, e.g. 2026-10-22T09:45:00+13:00",
          },
          transparency: {
            type: Type.STRING,
            enum: ["opaque", "transparent"],
            description: "'opaque' for Busy time blocks; 'transparent' for Available/Reminders",
          },
          isAllDay: {
            type: Type.BOOLEAN,
            description: "true if this is a general all-day reminder or flexible task",
          },
          reasoning: {type: Type.STRING, description: "Brief justification for this time slot"},
        },
        required: ["taskId", "title", "startISO", "endISO", "transparency", "isAllDay"],
      },
    },
  },
  required: ["scheduledTasks"],
};

// Helper: Authenticated Google Calendar Client
async function getCalendarClient() {
  const credentialsRaw = process.env.GOOGLE_CALENDAR_CREDENTIALS;
  if (!credentialsRaw) {
    throw new Error("Missing GOOGLE_CALENDAR_CREDENTIALS secret environment variable");
  }

  const serviceAccountJson = JSON.parse(credentialsRaw);
  const formattedPrivateKey = serviceAccountJson.private_key.replace(/\\n/g, "\n");

  const jwtClient = new google.auth.JWT({
    email: serviceAccountJson.client_email,
    key: formattedPrivateKey,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  await jwtClient.authorize();
  return google.calendar({version: "v3", auth: jwtClient});
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

// Helper: Fetch the weather at a location ({latitude, longitude}) as {text, forecast, key}: the current conditions as one
// line for the prompt, the daily forecast for the first days (empty when unavailable) and the coarse summary for the
// run fingerprint. A failed request gives the unavailable text, no forecast and the unavailable key.
async function getWeather(location, timeZone) {
  try {
    const res = await fetch(weatherUrl(location, timeZone));
    if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
    const data = await res.json();
    const forecast = parseForecast(data);
    return {text: describeWeather(data.current_weather), forecast, key: forecastKey(forecast, data.current_weather)};
  } catch (err) {
    console.warn("Weather unavailable:", err.message);
    return {text: UNAVAILABLE, forecast: [], key: UNAVAILABLE};
  }
}

// One Gemini request for slots. Returns the raw scheduledTasks list (unvalidated). Throws a readable Error when the
// request fails, is cut off or is not usable JSON. Each request is bounded so a stuck call cannot run the whole
// function into its own timeout (which the browser sees as a bare 500).
// `weather` is the one-line current conditions and `forecast` the daily forecast; `settings` supplies the location name and the time zone for the prompt.
async function requestSchedule(tasks, busySlots, now, settings, weather, {projects, fixed, allTasks, feedback, forecast}) {
  const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
  const prompt = buildSchedulePrompt({tasks, busySlots, now, weather, settings, projects, fixed, allTasks, feedback, forecast});

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: scheduleSchema,
      maxOutputTokens: 16384,
      httpOptions: {timeout: GEMINI_TIMEOUT_MS},
    },
  });
  const candidate = (response.candidates || [])[0] || {};
  if (candidate.finishReason === "MAX_TOKENS") throw new Error("Gemini's answer was cut off");
  return parseScheduleResponse(response.text);
}

// Ask Gemini for a schedule and make it usable, up to SCHEDULE_ATTEMPTS requests. A request that fails (overload,
// timeout, malformed JSON) is retried after a short pause; an answer with no usable slot is retried once more with
// the problems listed. Slots that break a rule are dropped rather than failing the run (see repairSchedule), so one
// bad slot no longer costs the whole schedule. Returns {slots, items, dropped}, or throws when no attempt gives a slot.
async function requestValidSchedule(toSchedule, busySlots, now, settings, weather, context, validation) {
  let feedback = [];
  let lastProblem = "Gemini returned no slots";
  for (let attempt = 1; attempt <= SCHEDULE_ATTEMPTS; attempt++) {
    let items;
    try {
      items = await requestSchedule(toSchedule, busySlots, now, settings, weather, {...context, feedback});
    } catch (err) {
      console.warn(`Gemini scheduling request ${attempt} failed:`, err.message);
      lastProblem = `Gemini request failed: ${err.message}`;
      if (attempt < SCHEDULE_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      continue;
    }
    const repaired = repairSchedule({items, tasks: toSchedule, ...validation});
    if (repaired.dropped.length > 0) console.warn("Schedule slots dropped:", JSON.stringify(repaired.dropped));
    if (repaired.errors.length > 0) {
      console.warn("Schedule validation failed after repair:", repaired.errors);
      lastProblem = `the schedule was rejected: ${repaired.errors.slice(0, 5).join("; ")}`;
      feedback = repaired.errors.slice(0, 5);
      continue;
    }
    if (repaired.slots.length > 0) return {slots: repaired.slots, items, dropped: repaired.dropped};
    lastProblem = items.length === 0 ?
      "Gemini returned no slots" :
      `none of Gemini's slots were usable: ${repaired.dropped.slice(0, 5).map((d) => `task ${d.taskId}: ${d.reason}`).join("; ")}`;
    feedback = items.length === 0 ?
      ["You returned no slots. Schedule as many tasks as fit, in the open gaps."] :
      repaired.dropped.slice(0, 5).map((d) => `task ${d.taskId}: ${d.reason}`);
  }
  throw new Error(`${lastProblem}; existing events were kept.`);
}

// Core Scheduling Engine Logic. Nothing on the calendar is touched until Gemini's
// slots have been validated; a failure before that point leaves existing events as they are.
// The personal calendar is only ever read.
// With `taskIds`, only those tasks are offered to Gemini and have their events replaced; every other app
// event stays and counts as busy, and the other tasks' schedule fields are left alone.
// With `skipIfUnchanged` (automatic runs), a full run whose fingerprint equals the last successful full run's is
// skipped before Gemini is called; see fingerprint.js. A full run that succeeds records its fingerprint.
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
  const toSchedule = inScope.filter((t) => !lockedEvents.has(t.id));

  // Old agent-calendar events to replace: stored ids of the tasks being scheduled, plus the marked events from
  // today that belong to them. A full run also takes every other marked event from today (orphans).
  const agentEvents = await findAgentEvents(calendar, calendarId, startOfLocalDay(timeZone).toISOString());
  const oldEventIds = new Set(toSchedule.map((t) => t.googleCalendarEventId).filter(Boolean));
  const replaceable = subset ? eventIdsForTasks(agentEvents, new Set(toSchedule.map((t) => t.id))) : agentEvents.map((ev) => ev.id);
  replaceable.forEach((id) => oldEventIds.add(id));
  lockedEventIds.forEach((id) => oldEventIds.delete(id));

  // 2. Agent-calendar busy time excludes the app's own events, which are replaced by this run.
  // Locked windows count as busy even if the personal event is marked free.
  const agentBusy = await getForeignBusyWindows(calendar, calendarId, now.toISOString(), horizon.toISOString(), timeZone, oldEventIds);
  // In a subset run the app events that stay put block their time, whatever their transparency.
  const keptAppBusy = subset ? appBusyWindows(agentEvents, timeZone, oldEventIds) : [];
  const busySlots = mergeBusyWindows([...personalBusy, ...lockedWindows, ...agentBusy, ...keptAppBusy]);

  // 3. Ask Gemini for slots for the unlocked tasks, then validate before touching the calendar
  let scheduledList = [];
  let slots = [];
  let unscheduled = []; // tasks Gemini tried to place but whose slots were dropped, [{taskId, reason}]
  let fingerprint = null;
  if (toSchedule.length > 0) {
    const weather = await getWeather(settings.location, timeZone);
    if (!subset) {
      fingerprint = computeFingerprint({tasks: toSchedule, busySlots, weatherKey: weather.key, settings, now, horizon});
      if (shouldSkipRun({skipIfUnchanged, fingerprint, lastRunFingerprint: settings.lastRunFingerprint, endedSlot: hasEndedSlot(toSchedule, timeZone, now)})) {
        return {success: true, skipped: true, scheduledCount: 0, lockedCount: lockedEvents.size, message: "Nothing changed since the last run; existing events were kept."};
      }
    }
    // Project members outside this run (locked, or already scheduled in a subset run) that the order rule respects
    const lockedByTask = new Map([...lockedEvents].map(([id, ev]) => [id, eventWindow(ev, timeZone)]));
    const fixed = buildFixedSlots({tasks: currentTasks, inScopeIds: subset ? new Set(inScope.map((t) => t.id)) : null, lockedWindows: lockedByTask, timeZone});
    const projects = await readProjects();
    console.log(`Scheduling ${toSchedule.length} tasks over ${settings.scheduleDays} days (${busySlots.length} busy windows, to ${horizon.toISOString()})`);
    const validation = {busy: busySlots, now, horizon, timeZone, allTasks: currentTasks, fixed};
    const result = await requestValidSchedule(toSchedule, busySlots, now, settings, weather.text, {projects, fixed, allTasks: currentTasks, forecast: weather.forecast}, validation);
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
// 8:00-19:00 local window) and claims it atomically, so a duplicate tick cannot start a second run. The claim
// records the attempt even if the run then fails, which keeps a failing run from retrying on every tick.
exports.autoScheduleDaily = onSchedule({
  schedule: "*/15 * * * *",
  timeoutSeconds: 300,
  secrets: [
    "GEMINI_API_KEY",
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

// 2. HTTP Endpoint: Manual / On-Demand full run (the "Update now" button)
exports.generateWeeklySchedule = onRequest({
  secrets: [
    "GEMINI_API_KEY",
    {name: "GOOGLE_CALENDAR_CREDENTIALS", version: "latest"},
  ],
  cors: ALLOWED_ORIGINS,
  timeoutSeconds: 300,
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
    "GEMINI_API_KEY",
    {name: "GOOGLE_CALENDAR_CREDENTIALS", version: "latest"},
  ],
  cors: ALLOWED_ORIGINS,
  timeoutSeconds: 300,
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
    res.status(200).send({...result, tasks: await readTaskList()});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 3. Endpoint: Add / Ingest Task. The model returns only new or changed tasks; they are merged into the
// stored list inside a transaction, so everything else on the list is preserved.
exports.addOrUpdateTask = onRequest({
  secrets: ["GEMINI_API_KEY"], cors: ALLOWED_ORIGINS, timeoutSeconds: 120,
}, ownerOnly(async (req, res) => {
  try {
    const userInput = req.body.input;
    if (!userInput) return res.status(400).send({error: "Missing input"});

    const [currentTasks, {timeZone}, projects] = await Promise.all([readTaskList(), readSettings(), readProjects()]);

    const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
    const prompt = buildTaskPrompt({tasks: currentTasks, projects, input: userInput, today: localDate(timeZone)});

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: changeSchema,
      },
    });

    const changes = JSON.parse(response.text).tasks || [];

    // Merge into the list as it is now, not as it was when the model was asked. The projects are read in the same
    // transaction, so a task only joins a project that still exists at commit time.
    const result = await updateTaskList((tasks, tx, {projects: stored}) => {
      const merged = mergeTaskChanges(tasks, changes, randomUUID, stored.map((p) => p.id));
      const changed = merged.added + merged.updated > 0;
      return {...merged, tasks: changed ? merged.tasks : null, current: changed ? merged.tasks : tasks};
    }, {withProjects: true});

    res.status(200).send({
      success: true,
      tasks: result.current,
      added: result.added,
      updated: result.updated,
      skipped: result.skipped,
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
    // Archive, removal and the next occurrence of a recurring task commit together; calendar cleanup follows once they have
    const result = await updateTaskList((tasks, tx) => {
      const done = completeInList(tasks, taskId, today, randomUUID);
      if (!done) return {current: tasks};
      tx.create(db.collection("completed_tasks").doc(), {
        ...done.completedTask,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return {tasks: done.tasks, current: done.tasks, completedTask: done.completedTask, spawned: done.spawned};
    });
    await removeTaskCalendarEvent(result.completedTask);

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
// Recently completed tasks from the archive, newest first (optional ?limit=, default 50, at most 200), plus a
// summary of the last 8 local weeks of completions. The summary is computed from its own query, so it does not
// depend on the limit; `truncated` is true if the window held more rows than were read.
exports.getCompletedTasks = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const archive = db.collection("completed_tasks");
    const {timeZone} = await readSettings();
    const now = new Date();
    const [listSnap, windowSnap] = await Promise.all([
      archive.orderBy("completedAt", "desc").limit(clampLimit(req.query.limit)).get(),
      archive.where("completedAt", ">=", summaryWindowStart(timeZone, now)).orderBy("completedAt", "desc").limit(SUMMARY_MAX_ROWS).get(),
    ]);
    const summary = {...summarizeCompleted(windowSnap.docs.map((d) => d.data()), timeZone, now), truncated: windowSnap.size >= SUMMARY_MAX_ROWS};
    res.status(200).send({success: true, tasks: serializeCompleted(listSnap.docs.map((d) => d.data())), summary});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 7. Endpoint: Direct Update / Delete
exports.updateTaskDirect = onRequest({
  secrets: [{name: "GOOGLE_CALENDAR_CREDENTIALS", version: "latest"}],
  cors: ALLOWED_ORIGINS,
}, ownerOnly(async (req, res) => {
  try {
    const {taskId, action, updatedFields} = req.body;

    // The project list is read in the same transaction, so a task can only join a project that exists at commit time
    const result = await updateTaskList((tasks, tx, {projects}) => {
      if (action === "DELETE") {
        const removedTask = tasks.find((t) => t.id === taskId);
        if (!removedTask) return {current: tasks};
        const remaining = tasks.filter((t) => t.id !== taskId);
        return {tasks: remaining, current: remaining, removedTask};
      }
      if (action === "UPDATE" && tasks.some((t) => t.id === taskId)) {
        const next = tasks.map((t) => (t.id === taskId ? applyDirectUpdate(t, updatedFields, projects.map((p) => p.id)) : t));
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

// 8. Endpoint: Read Settings
// Location, time zone, auto-run schedule and the run state; defaults fill anything not yet saved.
exports.getSettings = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    res.status(200).send({success: true, settings: await readSettings()});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));

// 9. Endpoint: Update Settings
// Body: {settings: {location?, timeZone?, schedule?}}, any subset of the editable fields. 400 with the reason
// when a field is invalid (nothing is saved); run state cannot be set.
exports.updateSettings = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const result = await writeSettings(req.body && req.body.settings);
    if (result.error) return res.status(400).send({error: result.error});
    res.status(200).send({success: true, settings: result.settings});
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
// Body: {action: "CREATE", name} | {action: "UPDATE", projectId, name} (rename) | {action: "DELETE", projectId}.
// 400 with the reason for an unusable or taken name or an unknown action, 404 for an unknown projectId. DELETE also
// takes its member tasks out of the project (the tasks stay) and returns the updated `tasks`. No calendar changes.
exports.updateProject = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const {action, projectId, name} = req.body || {};
    let result;
    if (action === "CREATE") result = await createProject(name, randomUUID);
    else if (action === "UPDATE") result = await renameProject(projectId, name);
    else if (action === "DELETE") result = await deleteProject(projectId);
    else return res.status(400).send({error: "action must be CREATE, UPDATE or DELETE"});
    if (result.notFound) return res.status(404).send({error: "Project not found"});
    if (result.error) return res.status(400).send({error: result.error});
    res.status(200).send({success: true, ...result});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
}));
