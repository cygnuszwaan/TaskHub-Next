/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {setGlobalOptions} = require("firebase-functions/v2");
const {defineString} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {GoogleGenAI, Type} = require("@google/genai");
const {google} = require("googleapis");
const {localDate, utcOffset, formatLocalNow, startOfLocalDay} = require("./time");
const {AGENT_MARKER, deleteCalendarEvent, deleteTaskEvents, findAgentEvents, eventIdsForTasks, appBusyWindows, eventWindow, getBusyWindows, getForeignBusyWindows, mergeBusyWindows} = require("./calendar");
const {validateSchedule, matchLockedEvents} = require("./schedule");
const {applyDirectUpdate, completeInList, mergeTaskChanges, applyScheduleResults} = require("./tasks");
const {annotateDue} = require("./due");
const {makeTaskStore, makeSettingsStore} = require("./store");
const {DEFAULTS} = require("./settings");
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
// Runtime settings (location, time zone, auto-run schedule) in `settings/app`; see settings.js.
const {getSettings: readSettings, updateSettings: writeSettings} = makeSettingsStore(db);

const MODEL_NAME = "gemini-3.5-flash-lite";

// The owner's time zone for every date calculation. Fixed at the default until the settings are read at runtime.
const TIME_ZONE = DEFAULTS.timeZone;

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
            description: "ISO 8601 start date time in NZ local time with its UTC offset, e.g. 2026-10-22T09:00:00+13:00",
          },
          endISO: {
            type: Type.STRING,
            description: "ISO 8601 end date time in NZ local time with its UTC offset, e.g. 2026-10-22T09:45:00+13:00",
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

// Helper: Fetch Weather
async function getWeatherWhangaparaoa() {
  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=-36.63&longitude=174.78&current_weather=true";
    const res = await fetch(url);
    const data = await res.json();
    const weather = data.current_weather;
    const weatherCodes = {
      0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
      45: "Foggy", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
      80: "Rain showers", 95: "Thunderstorm",
    };
    const codeDesc = weatherCodes[weather.weathercode] || "Variable conditions";
    return `${codeDesc}, ${weather.temperature}°C`;
  } catch (err) {
    return "Weather data currently unavailable";
  }
}

// Ask Gemini for slots for the given tasks. Returns the raw scheduledTasks list (unvalidated).
async function requestSchedule(tasks, busySlots, now, sevenDaysLater) {
  const weatherInfo = await getWeatherWhangaparaoa();
  const nowString = formatLocalNow(TIME_ZONE, now);
  const nzOffset = utcOffset(TIME_ZONE, now);
  const today = localDate(TIME_ZONE, now);

  const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
  const prompt = `
    You are an AI calendar scheduler in Whangaparāoa, New Zealand.
    Current Time: ${nowString} (${TIME_ZONE}, UTC offset ${nzOffset})
    Whangaparāoa Weather: ${weatherInfo}
    
    Existing Busy Calendar Windows, covering the owner's personal appointments, already-booked task time and tasks the owner has pinned to a time (DO NOT OVERLAP WITH THESE):
    ${JSON.stringify(busySlots, null, 2)}
    
    Today (NZ): ${today}
    Active Task Queue To Schedule, ordered most urgent first. "overdue" is true when dueDate is before today; "daysUntilDue" is negative when overdue and null when the task has no due date:
    ${JSON.stringify(annotateDue(tasks, today), null, 2)}
    
    Rules:
    1. Schedule uncompleted tasks across the next 7 days in open gaps between 8:00 AM and 7:00 PM New Zealand local time. Each timed slot must start after the current time, fit entirely within one day's 8:00 AM-7:00 PM window, and must not overlap a busy window or another slot.
    2. Schedule each task at most once. Place overdue tasks first, in the earliest open gaps, then tasks with the nearest due dates. Where possible, place a task with a dueDate on or before that date; a task that cannot fit before its due date goes in the earliest gap left. Tasks without a dueDate fill the remaining gaps by priority.
    3. Set transparency: "opaque" for focus tasks (blocks busy); "transparent" for quick chores/reminders.
    4. Avoid scheduling Outdoor tasks if weather is rainy.
    5. Write every startISO/endISO in New Zealand local time using the UTC offset that applies on that date (currently ${nzOffset}; it changes if the date falls after a daylight saving change).
    6. Return the non-conflicting schedule matching the JSON schema.
  `;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: scheduleSchema,
    },
  });
  return JSON.parse(response.text).scheduledTasks || [];
}

// Core Scheduling Engine Logic. Nothing on the calendar is touched until Gemini's
// slots have been validated; a failure before that point leaves existing events as they are.
// The personal calendar is only ever read.
// With `taskIds`, only those tasks are offered to Gemini and have their events replaced; every other app
// event stays and counts as busy, and the other tasks' schedule fields are left alone.
async function runScheduleEngine({taskIds} = {}) {
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

  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // 1. Read-only lookups. Any failure aborts before an event is touched.
  const personalBusy = await getBusyWindows(calendar, personalCalendarId, now.toISOString(), sevenDaysLater.toISOString(), TIME_ZONE);

  // A task is locked while its app-tagged event sits on the personal calendar and hasn't ended.
  // Locks are recomputed every run, so a lock is released once its event has passed.
  const personalAgentEvents = (await findAgentEvents(calendar, personalCalendarId, now.toISOString()))
      .filter((ev) => ev.status !== "cancelled" && eventWindow(ev, TIME_ZONE));
  const lockedEvents = matchLockedEvents(personalAgentEvents, currentTasks); // task id -> personal-calendar event
  const lockedWindows = [...lockedEvents.values()].map((ev) => eventWindow(ev, TIME_ZONE));
  const lockedEventIds = new Set([...lockedEvents.values()].map((ev) => ev.id));
  const toSchedule = inScope.filter((t) => !lockedEvents.has(t.id));

  // Old agent-calendar events to replace: stored ids of the tasks being scheduled, plus the marked events from
  // today that belong to them. A full run also takes every other marked event from today (orphans).
  const agentEvents = await findAgentEvents(calendar, calendarId, startOfLocalDay(TIME_ZONE).toISOString());
  const oldEventIds = new Set(toSchedule.map((t) => t.googleCalendarEventId).filter(Boolean));
  const replaceable = subset ? eventIdsForTasks(agentEvents, new Set(toSchedule.map((t) => t.id))) : agentEvents.map((ev) => ev.id);
  replaceable.forEach((id) => oldEventIds.add(id));
  lockedEventIds.forEach((id) => oldEventIds.delete(id));

  // 2. Agent-calendar busy time excludes the app's own events, which are replaced by this run.
  // Locked windows count as busy even if the personal event is marked free.
  const agentBusy = await getForeignBusyWindows(calendar, calendarId, now.toISOString(), sevenDaysLater.toISOString(), TIME_ZONE, oldEventIds);
  // In a subset run the app events that stay put block their time, whatever their transparency.
  const keptAppBusy = subset ? appBusyWindows(agentEvents, TIME_ZONE, oldEventIds) : [];
  const busySlots = mergeBusyWindows([...personalBusy, ...lockedWindows, ...agentBusy, ...keptAppBusy]);

  // 3. Ask Gemini for slots for the unlocked tasks, then validate before touching the calendar
  let scheduledList = [];
  let slots = [];
  if (toSchedule.length > 0) {
    scheduledList = await requestSchedule(toSchedule, busySlots, now, sevenDaysLater);
    if (scheduledList.length === 0) {
      throw new Error("Gemini returned no slots; existing events were kept.");
    }
    const result = validateSchedule({items: scheduledList, tasks: toSchedule, busy: busySlots, now, horizon: sevenDaysLater, timeZone: TIME_ZONE});
    if (result.errors.length > 0) {
      console.warn("Schedule validation failed:", result.errors);
      throw new Error(`Gemini's schedule was rejected and existing events were kept: ${result.errors.slice(0, 5).join("; ")}`);
    }
    slots = result.slots;
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

  return {
    success: true,
    scheduledCount: slots.length,
    lockedCount: lockedEvents.size,
    schedule: scheduledList,
  };
}

// 1. Scheduled Function: Runs Every Evening at 8:00 PM NZ time
exports.autoScheduleDaily = onSchedule({
  schedule: "0 20 * * *",
  timeZone: TIME_ZONE,
  secrets: [
    "GEMINI_API_KEY",
    {name: "GOOGLE_CALENDAR_CREDENTIALS", version: "latest"},
  ],
}, async (event) => {
  console.log("Starting daily 8:00 PM automated schedule update...");
  try {
    const result = await runScheduleEngine();
    console.log("Daily schedule completed:", JSON.stringify(result));
  } catch (err) {
    console.error("Daily schedule failed:", err);
  }
});

// 2. HTTP Endpoint: Manual / On-Demand "Plan My Week" Trigger
exports.generateWeeklySchedule = onRequest({
  secrets: [
    "GEMINI_API_KEY",
    {name: "GOOGLE_CALENDAR_CREDENTIALS", version: "latest"},
  ],
  cors: ALLOWED_ORIGINS,
  timeoutSeconds: 120,
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
  timeoutSeconds: 120,
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

    const currentTasks = await readTaskList();
    // The model sees only the fields it may change, plus the id and rank
    const visibleTasks = currentTasks.map(({id, title, priority, dueDate, estimatedMinutes, tags, recurrence, order}) => ({id, title, priority, dueDate, estimatedMinutes, tags, recurrence, order}));

    const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
    const today = localDate(TIME_ZONE);

    const prompt = `
      You are an expert task queue organizer. Today's date is: ${today}.
      
      Current Task List (for context; do not return tasks you leave unchanged):
      ${JSON.stringify(visibleTasks, null, 2)}
      
      New Input: "${userInput}"
      
      Parse the input into tasks, inferring priority, estimatedMinutes and tags.
      Return ONLY the tasks that are new or that the input changes.
      For a change to an existing task, return it with that task's id and its complete updated fields.
      For a new task, leave id empty.
      Set order to the rank (from 1) the task should hold in the full list.
      If the input says a task repeats (for example "every Monday", "monthly", "every 2 weeks"), set recurrence
      to the frequency and interval, and set dueDate to its first occurrence. Leave recurrence out for tasks that do not repeat
      and for existing tasks whose repetition the input does not mention. To stop an existing task repeating, return frequency NONE.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: changeSchema,
      },
    });

    const changes = JSON.parse(response.text).tasks || [];

    // Merge into the list as it is now, not as it was when the model was asked
    const result = await updateTaskList((tasks) => {
      const merged = mergeTaskChanges(tasks, changes, randomUUID);
      const changed = merged.added + merged.updated > 0;
      return {...merged, tasks: changed ? merged.tasks : null, current: changed ? merged.tasks : tasks};
    });

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

    // Archive, removal and the next occurrence of a recurring task commit together; calendar cleanup follows once they have
    const result = await updateTaskList((tasks, tx) => {
      const done = completeInList(tasks, taskId, localDate(TIME_ZONE), randomUUID);
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
// summary of the last 8 NZ weeks of completions. The summary is computed from its own query, so it does not
// depend on the limit; `truncated` is true if the window held more rows than were read.
exports.getCompletedTasks = onRequest({cors: ALLOWED_ORIGINS}, ownerOnly(async (req, res) => {
  try {
    const archive = db.collection("completed_tasks");
    const now = new Date();
    const [listSnap, windowSnap] = await Promise.all([
      archive.orderBy("completedAt", "desc").limit(clampLimit(req.query.limit)).get(),
      archive.where("completedAt", ">=", summaryWindowStart(TIME_ZONE, now)).orderBy("completedAt", "desc").limit(SUMMARY_MAX_ROWS).get(),
    ]);
    const summary = {...summarizeCompleted(windowSnap.docs.map((d) => d.data()), TIME_ZONE, now), truncated: windowSnap.size >= SUMMARY_MAX_ROWS};
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

    const result = await updateTaskList((tasks) => {
      if (action === "DELETE") {
        const removedTask = tasks.find((t) => t.id === taskId);
        if (!removedTask) return {current: tasks};
        const remaining = tasks.filter((t) => t.id !== taskId);
        return {tasks: remaining, current: remaining, removedTask};
      }
      if (action === "UPDATE" && tasks.some((t) => t.id === taskId)) {
        const next = tasks.map((t) => (t.id === taskId ? applyDirectUpdate(t, updatedFields) : t));
        return {tasks: next, current: next};
      }
      return {current: tasks};
    });
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
