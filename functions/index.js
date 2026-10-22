/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineString} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {GoogleGenAI, Type} = require("@google/genai");
const {google} = require("googleapis");
const {TIME_ZONE, getNZDate, getNZOffset, formatNZNow, getNZStartOfDay} = require("./time");
const {AGENT_MARKER, deleteCalendarEvent, deleteTaskEvents, findAgentEventIds, getBusyWindows, getForeignBusyWindows, mergeBusyWindows} = require("./calendar");
const {validateSchedule} = require("./schedule");

admin.initializeApp();
const db = admin.firestore();

const MODEL_NAME = "gemini-3.5-flash-lite";

// Target Google Calendar for all scheduling (set in functions/.env)
const CALENDAR_ID = defineString("USER_CALENDAR_ID");
// Owner's personal calendar. Read-only: used for free/busy, never written to (set in functions/.env)
const PERSONAL_CALENDAR_ID = defineString("USER_PERSONAL_CALENDAR_ID");

// JSON Schema for Task State
const taskSchema = {
  type: Type.OBJECT,
  properties: {
    tasks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: {type: Type.STRING},
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
          status: {
            type: Type.STRING,
            enum: ["PENDING", "COMPLETED"],
          },
          googleCalendarEventId: {
            type: Type.STRING,
            description: "ID of associated Google Calendar event if scheduled",
          },
          order: {
            type: Type.INTEGER,
            description: "Numeric rank starting at 1",
          },
          scheduledStart: {
            type: Type.STRING,
            description: "Scheduled start (ISO 8601, or YYYY-MM-DD for all-day) if scheduled; copy unchanged",
          },
          scheduledEnd: {
            type: Type.STRING,
            description: "Scheduled end (ISO 8601, or exclusive YYYY-MM-DD for all-day) if scheduled; copy unchanged",
          },
        },
        required: [
          "id",
          "title",
          "priority",
          "estimatedMinutes",
          "tags",
          "status",
          "order",
        ],
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

// Core Scheduling Engine Logic. Nothing on the calendar is touched until Gemini's
// slots have been validated; a failure before that point leaves existing events as they are.
async function runScheduleEngine() {
  const docRef = db.collection("app_state").doc("todo_doc");
  const docSnap = await docRef.get();
  const currentTasks = docSnap.exists ? docSnap.data().tasks || [] : [];

  if (currentTasks.length === 0) {
    return {success: true, scheduledCount: 0, message: "No active tasks."};
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

  // 1. Read-only lookups: personal busy time, plus the app's existing events on the agent calendar
  const personalBusy = await getBusyWindows(calendar, personalCalendarId, now.toISOString(), sevenDaysLater.toISOString(), TIME_ZONE);
  const oldEventIds = new Set(currentTasks.map((t) => t.googleCalendarEventId).filter(Boolean));
  (await findAgentEventIds(calendar, calendarId, getNZStartOfDay().toISOString())).forEach((id) => oldEventIds.add(id));

  // 2. Agent-calendar busy time excludes the app's own events, which are replaced by this run
  const agentBusy = await getForeignBusyWindows(calendar, calendarId, now.toISOString(), sevenDaysLater.toISOString(), oldEventIds);
  const busySlots = mergeBusyWindows([...personalBusy, ...agentBusy]);
  const weatherInfo = await getWeatherWhangaparaoa();
  const nowString = formatNZNow(now);
  const nzOffset = getNZOffset(now);

  const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
  const prompt = `
    You are an AI calendar scheduler in Whangaparāoa, New Zealand.
    Current Time: ${nowString} (${TIME_ZONE}, UTC offset ${nzOffset})
    Whangaparāoa Weather: ${weatherInfo}
    
    Existing Busy Calendar Windows, covering the owner's personal appointments and already-booked task time (DO NOT OVERLAP WITH THESE):
    ${JSON.stringify(busySlots, null, 2)}
    
    Active Task Queue To Schedule:
    ${JSON.stringify(currentTasks, null, 2)}
    
    Rules:
    1. Schedule uncompleted tasks across the next 7 days in open gaps between 8:00 AM and 7:00 PM New Zealand local time. Each timed slot must start after the current time, fit entirely within one day's 8:00 AM-7:00 PM window, and must not overlap a busy window or another slot.
    2. Schedule each task at most once.
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

  const scheduleData = JSON.parse(response.text);
  const scheduledList = scheduleData.scheduledTasks || [];

  // 3. Validate before touching the calendar
  if (scheduledList.length === 0) {
    throw new Error("Gemini returned no slots; existing events were kept.");
  }
  const {slots, errors} = validateSchedule({items: scheduledList, tasks: currentTasks, busy: busySlots, now, horizon: sevenDaysLater});
  if (errors.length > 0) {
    console.warn("Schedule validation failed:", errors);
    throw new Error(`Gemini's schedule was rejected and existing events were kept: ${errors.slice(0, 5).join("; ")}`);
  }

  // 4. Insert the new events first; if any insert fails, remove the ones already created and keep the old schedule
  const created = [];
  try {
    for (const slot of slots) {
      const task = currentTasks.find((t) => t.id === slot.taskId);
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

  // 5. Remove the old events, then record the new schedule on the tasks
  for (const id of oldEventIds) {
    await deleteCalendarEvent(calendar, calendarId, id);
  }

  const bySlot = new Map(created.map((c) => [c.slot.taskId, c]));
  const updatedTasks = currentTasks.map((task) => {
    const next = {...task};
    delete next.googleCalendarEventId;
    delete next.scheduledStart;
    delete next.scheduledEnd;
    const hit = bySlot.get(task.id);
    if (hit) {
      next.googleCalendarEventId = hit.eventId;
      next.scheduledStart = hit.slot.allDay ? hit.slot.date : hit.slot.item.startISO;
      next.scheduledEnd = hit.slot.allDay ? hit.slot.endDate : hit.slot.item.endISO;
    }
    return next;
  });

  await docRef.set({
    tasks: updatedTasks,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    scheduledCount: slots.length,
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
  cors: true,
  timeoutSeconds: 120,
}, async (req, res) => {
  try {
    const result = await runScheduleEngine();
    res.status(200).send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
});

// 3. Endpoint: Add / Ingest Task
exports.addOrUpdateTask = onRequest({
  secrets: ["GEMINI_API_KEY"], cors: true, timeoutSeconds: 120,
}, async (req, res) => {
  try {
    const userInput = req.body.input;
    if (!userInput) return res.status(400).send({error: "Missing input"});

    const docRef = db.collection("app_state").doc("todo_doc");
    const docSnap = await docRef.get();
    const currentTasks = docSnap.exists ? docSnap.data().tasks || [] : [];

    const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
    const today = getNZDate();

    const prompt = `
      You are an expert task queue organizer. Today's date is: ${today}.
      
      Current Task List:
      ${JSON.stringify(currentTasks, null, 2)}
      
      New Input: "${userInput}"
      
      Parse input into task, infer priority, estimatedMinutes, and tags. Return full updated array.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: taskSchema,
      },
    });

    const updatedData = JSON.parse(response.text);

    await docRef.set({
      tasks: updatedData.tasks,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).send({success: true, tasks: updatedData.tasks});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
});

// 4. Endpoint: Archive Completed Tasks (Zero Token Cost Solution)
exports.completeTask = onRequest({
  secrets: [{name: "GOOGLE_CALENDAR_CREDENTIALS", version: "latest"}],
  cors: true,
}, async (req, res) => {
  try {
    const {taskId} = req.body;
    if (!taskId) return res.status(400).send({error: "Missing taskId"});

    const docRef = db.collection("app_state").doc("todo_doc");
    const docSnap = await docRef.get();
    let tasks = docSnap.exists ? docSnap.data().tasks || [] : [];

    const completedTask = tasks.find((t) => t.id === taskId);
    if (completedTask) {
      // Archive to dedicated completed_tasks collection for analytics
      await db.collection("completed_tasks").add({
        ...completedTask,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Remove from active tasks
      tasks = tasks.filter((t) => t.id !== taskId);
      await removeTaskCalendarEvent(completedTask);

      await docRef.set({
        tasks,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    res.status(200).send({success: true, tasks});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
});

// 5. Endpoint: "What Should I Do Now?"
exports.getWhatToDoNow = onRequest({
  secrets: ["GEMINI_API_KEY"], cors: true, timeoutSeconds: 120,
}, async (req, res) => {
  try {
    const {timeAvailable, energyLevel} = req.body || {};
    const docRef = db.collection("app_state").doc("todo_doc");
    const docSnap = await docRef.get();
    const currentTasks = docSnap.exists ? docSnap.data().tasks || [] : [];

    if (currentTasks.length === 0) {
      return res.status(200).send({recommendation: "Your task list is empty! Take a break."});
    }

    const weatherInfo = await getWeatherWhangaparaoa();
    const now = formatNZNow();

    const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
    const prompt = `
      You are an AI productivity coach in Whangaparāoa, NZ.
      Context: ${now} | Weather: ${weatherInfo} | Time: ${timeAvailable || "Unlimited"}m | Energy: ${energyLevel || "Any"}
      Tasks: ${JSON.stringify(currentTasks, null, 2)}
      Recommend the single best task for right now. 2 sentences.
    `;

    const response = await ai.models.generateContent({model: MODEL_NAME, contents: prompt});
    res.status(200).send({recommendation: response.text});
  } catch (err) {
    console.error(err);
    res.status(500).send({error: err.message});
  }
});

// 6. Endpoint: Read Tasks
exports.getTasks = onRequest({cors: true}, async (req, res) => {
  try {
    const docRef = db.collection("app_state").doc("todo_doc");
    const docSnap = await docRef.get();
    const tasks = docSnap.exists ? docSnap.data().tasks || [] : [];
    res.status(200).send({success: true, tasks});
  } catch (err) {
    res.status(500).send({error: err.message});
  }
});

// 7. Endpoint: Direct Update / Delete
exports.updateTaskDirect = onRequest({
  secrets: [{name: "GOOGLE_CALENDAR_CREDENTIALS", version: "latest"}],
  cors: true,
}, async (req, res) => {
  try {
    const {taskId, action, updatedFields} = req.body;
    const docRef = db.collection("app_state").doc("todo_doc");
    const docSnap = await docRef.get();
    let tasks = docSnap.exists ? docSnap.data().tasks || [] : [];

    if (action === "DELETE") {
      await removeTaskCalendarEvent(tasks.find((t) => t.id === taskId));
      tasks = tasks.filter((t) => t.id !== taskId);
    } else if (action === "UPDATE") {
      tasks = tasks.map((t) => (t.id === taskId ? {...t, ...updatedFields} : t));
    }

    await docRef.set({
      tasks,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).send({success: true, tasks});
  } catch (err) {
    res.status(500).send({error: err.message});
  }
});
