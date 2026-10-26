/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_PHONE_LENGTH, MAX_EMAIL_LENGTH, normalizePhone, normalizeEmail} = require("../contact");
const {applyDirectUpdate, completeInList, mergeTaskChanges, manualTaskChange} = require("../tasks");
const {applyCompletedEdit} = require("../completedEdit");
const {reopenTask} = require("../reopen");
const {buildTemplates} = require("../templates");
const {stepFromTask} = require("../projectTemplates");

let n = 0;
const makeId = () => `new${++n}`;
const base = () => ({id: "t1", title: "Fit tap", priority: "MEDIUM", dueDate: "", estimatedMinutes: 60, tags: [], status: "PENDING", order: 1});
const withContact = () => ({...base(), phone: "021 555 1234", email: "mo@example.com"});

describe("contact.js", () => {
  it("keeps a phone number as one line, whitespace collapsed", () => {
    assert.equal(normalizePhone("  021   555 1234 "), "021 555 1234");
    assert.equal(normalizePhone("+64 9 555 1234"), "+64 9 555 1234");
    assert.equal(normalizePhone("x".repeat(MAX_PHONE_LENGTH)), "x".repeat(MAX_PHONE_LENGTH));
  });
  it("treats null and blank text as none, and anything unusable as undefined", () => {
    for (const f of [normalizePhone, normalizeEmail]) {
      for (const v of [null, "", "   "]) assert.equal(f(v), null, String(v));
      for (const v of [undefined, 5, {}, [], true]) assert.equal(f(v), undefined, String(v));
    }
    assert.equal(normalizePhone("1".repeat(MAX_PHONE_LENGTH + 1)), undefined);
  });
  it("accepts an address-shaped email only, within the length limit", () => {
    assert.equal(normalizeEmail(" Mo@Example.com "), "Mo@Example.com");
    for (const v of ["mo", "mo@", "@example.com", "mo@example", "mo @example.com"]) assert.equal(normalizeEmail(v), undefined, v);
    assert.equal(normalizeEmail(`${"a".repeat(MAX_EMAIL_LENGTH)}@x.com`), undefined);
  });
});

describe("phone and email on a task", () => {
  it("are set, changed and removed by a direct update", () => {
    const t = applyDirectUpdate(base(), {phone: " 021 555 1234 ", email: "mo@example.com"});
    assert.equal(t.phone, "021 555 1234");
    assert.equal(t.email, "mo@example.com");
    for (const v of [null, "", "  "]) {
      const cleared = applyDirectUpdate(withContact(), {phone: v, email: v});
      assert.equal("phone" in cleared, false, String(v));
      assert.equal("email" in cleared, false, String(v));
    }
  });
  it("are left as they were by an unusable value or when not sent", () => {
    const t = applyDirectUpdate(withContact(), {phone: 5, email: "not an address"});
    assert.equal(t.phone, "021 555 1234");
    assert.equal(t.email, "mo@example.com");
    const u = applyDirectUpdate(withContact(), {title: "Fit tap again"});
    assert.equal(u.phone, "021 555 1234");
    assert.equal(u.email, "mo@example.com");
  });
  it("are set on a new task only by a manual entry that is allowed to", () => {
    const change = manualTaskChange({title: "Fit tap", phone: "021 555 1234", email: "mo@example.com"});
    assert.equal(change.phone, "021 555 1234");
    const task = mergeTaskChanges([], [change], makeId, [], {contact: true}).tasks[0];
    assert.equal(task.phone, "021 555 1234");
    assert.equal(task.email, "mo@example.com");
    const plain = mergeTaskChanges([], [change], makeId).tasks[0];
    assert.equal("phone" in plain, false);
    assert.equal("email" in plain, false);
    const bad = mergeTaskChanges([], [{title: "x", phone: 7, email: "nope"}], makeId, [], {contact: true}).tasks[0];
    assert.equal("phone" in bad, false);
    assert.equal("email" in bad, false);
  });
  it("are never changed on an existing task by a merge", () => {
    const merged = mergeTaskChanges([withContact()], [{id: "t1", title: "Fit tap", phone: "000", email: "x@y.com"}], makeId, [], {contact: true});
    assert.equal(merged.tasks[0].phone, "021 555 1234");
    assert.equal(merged.tasks[0].email, "mo@example.com");
  });
  it("go to the next occurrence of a repeating task", () => {
    const task = {...withContact(), dueDate: "2026-10-20", recurrence: {frequency: "WEEKLY", interval: 1}};
    const spawned = completeInList([task], "t1", "2026-10-22", makeId).spawned;
    assert.equal(spawned.phone, "021 555 1234");
    assert.equal(spawned.email, "mo@example.com");
    const bare = completeInList([{...task, phone: undefined, email: undefined}], "t1", "2026-10-22", makeId).spawned;
    assert.equal("phone" in bare, false);
    assert.equal("email" in bare, false);
  });
});

describe("phone and email on a completed task", () => {
  const row = {title: "Fit tap", priority: "LOW", estimatedMinutes: 30, phone: "021 555 1234", email: "mo@example.com", completedAt: new Date("2026-10-20T01:00:00Z")};
  const opts = {projectIds: [], timeZone: "Pacific/Auckland", now: new Date("2026-10-24T02:00:00Z")};
  it("are corrected", () => {
    assert.deepEqual(applyCompletedEdit(row, {phone: " 09 555 0000 ", email: "new@example.com"}, opts), {set: {phone: "09 555 0000", email: "new@example.com"}, remove: []});
  });
  it("are removed by null or empty text when the row has them, else there is nothing to change", () => {
    for (const v of [null, ""]) assert.deepEqual(applyCompletedEdit(row, {phone: v, email: v}, opts), {set: {}, remove: ["phone", "email"]}, String(v));
    const bare = {...row};
    delete bare.phone;
    delete bare.email;
    assert.deepEqual(applyCompletedEdit(bare, {phone: null, email: null}, opts), {error: "Nothing to change"});
  });
  it("reject an unusable value", () => {
    assert.match(applyCompletedEdit(row, {phone: 5}, opts).error, /Phone/);
    assert.match(applyCompletedEdit(row, {email: "nope"}, opts).error, /Email/);
  });
  it("come back with a reopened task", () => {
    const task = reopenTask([], {...row, id: "x"}, {projectIds: [], makeId}).task;
    assert.equal(task.phone, "021 555 1234");
    assert.equal(task.email, "mo@example.com");
  });
  it("are carried by a template made from completed tasks, but not by a project template step", () => {
    const t = buildTemplates([row])[0];
    assert.equal(t.phone, "021 555 1234");
    assert.equal(t.email, "mo@example.com");
    const bare = {...row};
    delete bare.phone;
    delete bare.email;
    assert.equal("phone" in buildTemplates([bare])[0], false);
    assert.equal("phone" in stepFromTask(withContact()), false);
    assert.equal("email" in stepFromTask(withContact()), false);
  });
});
