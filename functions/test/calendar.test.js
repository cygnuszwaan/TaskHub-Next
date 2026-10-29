/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it, beforeEach, afterEach, mock} = require("node:test");
const assert = require("node:assert/strict");

const NZ = "Pacific/Auckland";
const {AGENT_MARKER, eventDescription, deleteCalendarEvent, deleteTaskEvents, eventIdsForTasks, appBusyWindows, eventWindow, getBusyWindows, getForeignBusyWindows, mergeBusyWindows} = require("../calendar");

// Minimal stand-in for the googleapis calendar client
function fakeCalendar({events = [], freebusy, deleteError} = {}) {
  const calls = {list: [], delete: [], freebusy: []};
  return {
    calls,
    events: {
      list: async (params) => {
        calls.list.push(params);
        return {data: {items: events}};
      },
      delete: async (params) => {
        calls.delete.push(params);
        if (deleteError) throw deleteError;
      },
    },
    freebusy: {
      query: async (params) => {
        calls.freebusy.push(params);
        if (freebusy instanceof Error) throw freebusy;
        return {data: freebusy};
      },
    },
  };
}

describe("calendar.js", () => {
  beforeEach(() => mock.method(console, "warn", () => {}));
  afterEach(() => mock.restoreAll());

  describe("eventWindow", () => {
    it("returns timed events' start and end as given", () => {
      const ev = {start: {dateTime: "2026-10-22T09:00:00+13:00"}, end: {dateTime: "2026-10-22T10:00:00+13:00"}};
      assert.deepEqual(eventWindow(ev, NZ), {start: "2026-10-22T09:00:00+13:00", end: "2026-10-22T10:00:00+13:00"});
    });
    it("spans local midnight to local midnight for all-day events (exclusive end)", () => {
      const ev = {start: {date: "2026-10-22"}, end: {date: "2026-10-24"}};
      assert.deepEqual(eventWindow(ev, NZ), {start: "2026-10-21T11:00:00.000Z", end: "2026-10-23T11:00:00.000Z"});
    });
    it("handles an all-day event on a daylight-saving changeover", () => {
      const ev = {start: {date: "2026-09-27"}, end: {date: "2026-09-28"}};
      assert.deepEqual(eventWindow(ev, NZ), {start: "2026-09-26T12:00:00.000Z", end: "2026-09-27T11:00:00.000Z"});
    });
    it("spans local midnight to local midnight in the given zone", () => {
      const ev = {start: {date: "2026-10-22"}, end: {date: "2026-10-23"}};
      assert.deepEqual(eventWindow(ev, "America/Los_Angeles"), {start: "2026-10-22T07:00:00.000Z", end: "2026-10-23T07:00:00.000Z"});
      assert.deepEqual(eventWindow(ev, "Asia/Kolkata"), {start: "2026-10-21T18:30:00.000Z", end: "2026-10-22T18:30:00.000Z"});
    });
    it("returns null when the times are missing or incomplete", () => {
      assert.equal(eventWindow({}, NZ), null);
      assert.equal(eventWindow({start: {dateTime: "2026-10-22T09:00:00+13:00"}}, NZ), null);
      assert.equal(eventWindow({start: {date: "2026-10-22"}, end: {dateTime: "2026-10-22T10:00:00+13:00"}}, NZ), null);
    });
  });

  describe("mergeBusyWindows", () => {
    const w = (start, end) => ({start, end});

    it("returns an empty list for no windows", () => {
      assert.deepEqual(mergeBusyWindows([]), []);
    });
    it("sorts windows by start", () => {
      const out = mergeBusyWindows([w("2026-10-22T14:00:00Z", "2026-10-22T15:00:00Z"), w("2026-10-22T09:00:00Z", "2026-10-22T10:00:00Z")]);
      assert.deepEqual(out.map((x) => x.start), ["2026-10-22T09:00:00Z", "2026-10-22T14:00:00Z"]);
    });
    it("merges overlapping windows and keeps the bounding strings", () => {
      const out = mergeBusyWindows([w("2026-10-22T09:00:00Z", "2026-10-22T10:30:00Z"), w("2026-10-22T10:00:00Z", "2026-10-22T11:00:00Z")]);
      assert.deepEqual(out, [w("2026-10-22T09:00:00Z", "2026-10-22T11:00:00Z")]);
    });
    it("merges windows that touch", () => {
      const out = mergeBusyWindows([w("2026-10-22T09:00:00Z", "2026-10-22T10:00:00Z"), w("2026-10-22T10:00:00Z", "2026-10-22T11:00:00Z")]);
      assert.equal(out.length, 1);
    });
    it("absorbs a window nested inside another", () => {
      const out = mergeBusyWindows([w("2026-10-22T09:00:00Z", "2026-10-22T12:00:00Z"), w("2026-10-22T10:00:00Z", "2026-10-22T11:00:00Z")]);
      assert.deepEqual(out, [w("2026-10-22T09:00:00Z", "2026-10-22T12:00:00Z")]);
    });
    it("keeps separate windows apart", () => {
      const out = mergeBusyWindows([w("2026-10-22T09:00:00Z", "2026-10-22T10:00:00Z"), w("2026-10-22T10:00:01Z", "2026-10-22T11:00:00Z")]);
      assert.equal(out.length, 2);
    });
    it("merges windows written with different offsets by their real instants", () => {
      const out = mergeBusyWindows([w("2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00"), w("2026-10-21T20:30:00Z", "2026-10-21T21:30:00Z")]);
      assert.equal(out.length, 1);
      assert.equal(out[0].start, "2026-10-22T09:00:00+13:00");
      assert.equal(out[0].end, "2026-10-21T21:30:00Z");
    });
    it("drops unparseable, empty and reversed windows", () => {
      const out = mergeBusyWindows([w("garbage", "2026-10-22T10:00:00Z"), w("2026-10-22T10:00:00Z", "2026-10-22T10:00:00Z"), w("2026-10-22T11:00:00Z", "2026-10-22T10:00:00Z")]);
      assert.deepEqual(out, []);
    });
    it("returns only start and end and does not mutate its input", () => {
      const input = [w("2026-10-22T09:00:00Z", "2026-10-22T10:00:00Z"), w("2026-10-22T09:30:00Z", "2026-10-22T11:00:00Z")];
      const snapshot = JSON.stringify(input);
      const out = mergeBusyWindows(input);
      assert.deepEqual(Object.keys(out[0]), ["start", "end"]);
      assert.equal(JSON.stringify(input), snapshot);
    });
  });

  describe("getBusyWindows", () => {
    it("returns the busy windows for the calendar and queries with the given range", async () => {
      const busy = [{start: "2026-10-22T09:00:00Z", end: "2026-10-22T10:00:00Z"}];
      const cal = fakeCalendar({freebusy: {calendars: {"me@example.com": {busy}}}});
      assert.deepEqual(await getBusyWindows(cal, "me@example.com", "T1", "T2", "Pacific/Auckland"), busy);
      assert.deepEqual(cal.calls.freebusy[0].requestBody, {timeMin: "T1", timeMax: "T2", timeZone: "Pacific/Auckland", items: [{id: "me@example.com"}]});
    });
    it("returns an empty list when the calendar is free", async () => {
      const cal = fakeCalendar({freebusy: {calendars: {"c": {}}}});
      assert.deepEqual(await getBusyWindows(cal, "c", "T1", "T2", "UTC"), []);
    });
    it("accepts Google's canonical id when it differs from the requested one", async () => {
      const cal = fakeCalendar({freebusy: {calendars: {"canonical@example.com": {busy: [{start: "a", end: "b"}]}}}});
      assert.equal((await getBusyWindows(cal, "alias", "T1", "T2", "UTC")).length, 1);
    });
    it("throws rather than schedule blind when there is no data for the calendar", async () => {
      await assert.rejects(getBusyWindows(fakeCalendar({freebusy: {calendars: {}}}), "c", "T1", "T2", "UTC"), /no data for calendar c/);
      await assert.rejects(getBusyWindows(fakeCalendar({freebusy: {}}), "c", "T1", "T2", "UTC"), /no data/);
      await assert.rejects(getBusyWindows(fakeCalendar({freebusy: {calendars: {a: {}, b: {}}}}), "c", "T1", "T2", "UTC"), /no data/);
    });
    it("throws when Google reports an error for the calendar", async () => {
      const cal = fakeCalendar({freebusy: {calendars: {c: {errors: [{reason: "notFound"}], busy: []}}}});
      await assert.rejects(getBusyWindows(cal, "c", "T1", "T2", "UTC"), /notFound/);
    });
    it("propagates API failures", async () => {
      await assert.rejects(getBusyWindows(fakeCalendar({freebusy: new Error("boom")}), "c", "T1", "T2", "UTC"), /boom/);
    });
  });

  describe("getForeignBusyWindows", () => {
    const timed = (id, extra) => ({id, start: {dateTime: "2026-10-22T09:00:00+13:00"}, end: {dateTime: "2026-10-22T10:00:00+13:00"}, ...extra});

    it("includes opaque events that are not the app's", async () => {
      const cal = fakeCalendar({events: [timed("e1")]});
      assert.deepEqual(await getForeignBusyWindows(cal, "c", "T1", "T2", NZ), [{start: "2026-10-22T09:00:00+13:00", end: "2026-10-22T10:00:00+13:00"}]);
    });
    it("skips cancelled, transparent, marked and excluded events", async () => {
      const cal = fakeCalendar({events: [
        timed("cancelled", {status: "cancelled"}),
        timed("free", {transparency: "transparent"}),
        timed("mine", {description: `${AGENT_MARKER}. reasoning`}),
        timed("excluded"),
        timed("keep"),
      ]});
      const out = await getForeignBusyWindows(cal, "c", "T1", "T2", NZ, new Set(["excluded"]));
      assert.equal(out.length, 1);
    });
    it("skips events without usable times and includes all-day events", async () => {
      const cal = fakeCalendar({events: [{id: "none"}, {id: "allday", start: {date: "2026-10-22"}, end: {date: "2026-10-23"}}]});
      assert.deepEqual(await getForeignBusyWindows(cal, "c", "T1", "T2", NZ), [{start: "2026-10-21T11:00:00.000Z", end: "2026-10-22T11:00:00.000Z"}]);
    });
    it("lists events with single events expanded over the given range", async () => {
      const cal = fakeCalendar();
      await getForeignBusyWindows(cal, "c", "T1", "T2", NZ);
      assert.equal(cal.calls.list[0].singleEvents, true);
      assert.equal(cal.calls.list[0].timeMin, "T1");
      assert.equal(cal.calls.list[0].timeMax, "T2");
    });
  });

  describe("eventIdsForTasks", () => {
    const tagged = (id, taskId) => ({id, extendedProperties: {private: {taskId}}});

    it("returns the ids of events tagged with one of the tasks", () => {
      const events = [tagged("e1", "a"), tagged("e2", "b"), tagged("e3", "a"), tagged("e4", "c")];
      assert.deepEqual(eventIdsForTasks(events, new Set(["a", "c"])), ["e1", "e3", "e4"]);
    });
    it("ignores events with no tag, no extended properties or no id", () => {
      const events = [{id: "plain"}, {id: "noprivate", extendedProperties: {}}, {extendedProperties: {private: {taskId: "a"}}}];
      assert.deepEqual(eventIdsForTasks(events, new Set(["a"])), []);
    });
    it("returns nothing for no tasks", () => {
      assert.deepEqual(eventIdsForTasks([tagged("e1", "a")], new Set()), []);
    });
  });

  describe("appBusyWindows", () => {
    const timed = (id, extra) => ({id, start: {dateTime: "2026-10-22T09:00:00+13:00"}, end: {dateTime: "2026-10-22T10:00:00+13:00"}, ...extra});

    it("returns the windows of the app's events, transparent ones included", () => {
      const out = appBusyWindows([timed("e1"), timed("e2", {transparency: "transparent"})], NZ);
      assert.equal(out.length, 2);
      assert.deepEqual(out[0], {start: "2026-10-22T09:00:00+13:00", end: "2026-10-22T10:00:00+13:00"});
    });
    it("skips cancelled and excluded events and ones without usable times", () => {
      const events = [timed("cancelled", {status: "cancelled"}), timed("replaced"), {id: "none"}, timed("keep")];
      assert.equal(appBusyWindows(events, NZ, new Set(["replaced"])).length, 1);
    });
    it("includes all-day events", () => {
      const out = appBusyWindows([{id: "d", start: {date: "2026-10-22"}, end: {date: "2026-10-23"}}], NZ);
      assert.deepEqual(out, [{start: "2026-10-21T11:00:00.000Z", end: "2026-10-22T11:00:00.000Z"}]);
    });
    it("places all-day events in the given zone", () => {
      const out = appBusyWindows([{id: "d", start: {date: "2026-10-22"}, end: {date: "2026-10-23"}}], "America/Los_Angeles");
      assert.deepEqual(out, [{start: "2026-10-22T07:00:00.000Z", end: "2026-10-23T07:00:00.000Z"}]);
    });
    it("returns an empty list for no events", () => {
      assert.deepEqual(appBusyWindows([], NZ), []);
    });
  });

  describe("deleteCalendarEvent", () => {
    it("deletes the event", async () => {
      const cal = fakeCalendar();
      await deleteCalendarEvent(cal, "c", "e1");
      assert.deepEqual(cal.calls.delete, [{calendarId: "c", eventId: "e1"}]);
    });
    it("does nothing without an id", async () => {
      const cal = fakeCalendar();
      await deleteCalendarEvent(cal, "c", "");
      assert.equal(cal.calls.delete.length, 0);
    });
    it("never throws, and stays quiet when the event is already gone", async () => {
      await deleteCalendarEvent(fakeCalendar({deleteError: Object.assign(new Error("gone"), {code: 404})}), "c", "e1");
      await deleteCalendarEvent(fakeCalendar({deleteError: Object.assign(new Error("gone"), {status: 410})}), "c", "e1");
      assert.equal(console.warn.mock.callCount(), 0);
    });
    it("warns about other failures without throwing", async () => {
      await deleteCalendarEvent(fakeCalendar({deleteError: Object.assign(new Error("denied"), {code: 403})}), "c", "e1");
      assert.equal(console.warn.mock.callCount(), 1);
    });
  });

  describe("deleteTaskEvents", () => {
    it("deletes the stored event and any event tagged with the task id, once each", async () => {
      const cal = fakeCalendar({events: [{id: "e1"}, {id: "e2"}]});
      await deleteTaskEvents(cal, "c", {id: "t1", googleCalendarEventId: "e1"});
      assert.equal(cal.calls.list[0].privateExtendedProperty, "taskId=t1");
      assert.deepEqual(cal.calls.delete.map((d) => d.eventId).sort(), ["e1", "e2"]);
    });
    it("still deletes the stored event when the lookup fails", async () => {
      const cal = fakeCalendar({events: []});
      cal.events.list = async () => {
        throw new Error("lookup failed");
      };
      await deleteTaskEvents(cal, "c", {id: "t1", googleCalendarEventId: "e1"});
      assert.deepEqual(cal.calls.delete.map((d) => d.eventId), ["e1"]);
    });
    it("does nothing for a missing task", async () => {
      const cal = fakeCalendar();
      await deleteTaskEvents(cal, "c", undefined);
      assert.equal(cal.calls.delete.length + cal.calls.list.length, 0);
    });
  });
});

describe("eventDescription", () => {
  it("is the task's description followed by the marker", () => {
    const text = eventDescription({description: "  Strip the walls.\nWear a mask.  "}, "Earliest open gap.");
    assert.equal(text, `Strip the walls.\nWear a mask.\n\n${AGENT_MARKER}.`);
  });
  it("is the marker and the reasoning for a task with no description", () => {
    for (const task of [{}, {description: ""}, {description: "   "}, {description: 5}, null]) {
      assert.equal(eventDescription(task, "Earliest open gap."), `${AGENT_MARKER}. Earliest open gap.`);
    }
    assert.equal(eventDescription({}, undefined), `${AGENT_MARKER}. `);
  });
  it("always holds the marker, so cleanup still finds the event", () => {
    assert.equal(eventDescription({description: "x".repeat(2000)}, "r").includes(AGENT_MARKER), true);
  });
});
