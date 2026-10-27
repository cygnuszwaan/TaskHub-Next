/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_PHONE_LENGTH, MAX_EMAIL_LENGTH, MAX_URL_LENGTH, normalizePhone, normalizeEmail, normalizeUrl} = require("../contact");
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

describe("normalizeUrl", () => {
  it("keeps an http or https link as typed, trimmed", () => {
    assert.equal(normalizeUrl("  https://Example.com/a?b=1#c "), "https://Example.com/a?b=1#c");
    assert.equal(normalizeUrl("http://example.co.nz"), "http://example.co.nz");
  });
  it("puts https:// in front of a link with no scheme, a host with a port included", () => {
    assert.equal(normalizeUrl("example.com/menu"), "https://example.com/menu");
    assert.equal(normalizeUrl("localhost:3000"), "https://localhost:3000");
    assert.equal(normalizeUrl("example.com:8080/x"), "https://example.com:8080/x");
  });
  it("treats null and blank text as none, and anything unusable as undefined", () => {
    for (const v of [null, "", "   "]) assert.equal(normalizeUrl(v), null, String(v));
    for (const v of [undefined, 5, {}, [], true]) assert.equal(normalizeUrl(v), undefined, String(v));
  });
  it("rejects any other scheme, a missing host and text with spaces", () => {
    for (const v of ["javascript:alert(1)", "JavaScript:1", "data:text/html,hi", "mailto:mo@example.com", "tel:5551234", "sms:5551234", "ftp://example.com", "file:///etc/passwd", "https://", "https:// example.com", "example .com", "two words"]) {
      assert.equal(normalizeUrl(v), undefined, v);
    }
  });
  it("accepts a stored link of at most 500 characters, counting any https:// put in front", () => {
    const fits = `https://example.com/${"a".repeat(MAX_URL_LENGTH - 20)}`;
    assert.equal(fits.length, MAX_URL_LENGTH);
    assert.equal(normalizeUrl(fits), fits);
    assert.equal(normalizeUrl(`${fits}a`), undefined);
    assert.equal(normalizeUrl(`example.com/${"a".repeat(MAX_URL_LENGTH - 12)}`), undefined);
  });
});

describe("url on a task", () => {
  const withUrl = () => ({...base(), url: "https://example.com/menu"});
  it("is set, changed and removed by a direct update", () => {
    assert.equal(applyDirectUpdate(base(), {url: " example.com/menu "}).url, "https://example.com/menu");
    assert.equal(applyDirectUpdate(withUrl(), {url: "http://other.com"}).url, "http://other.com");
    for (const v of [null, "", "  "]) assert.equal("url" in applyDirectUpdate(withUrl(), {url: v}), false, String(v));
  });
  it("is left as it was by an unusable value or when not sent", () => {
    assert.equal(applyDirectUpdate(withUrl(), {url: 5}).url, "https://example.com/menu");
    assert.equal(applyDirectUpdate(withUrl(), {url: "javascript:alert(1)"}).url, "https://example.com/menu");
    assert.equal(applyDirectUpdate(withUrl(), {title: "Fit tap again"}).url, "https://example.com/menu");
  });
  it("is set on a new task only by a manual entry that is allowed to", () => {
    const change = manualTaskChange({title: "Fit tap", url: "example.com/menu"});
    assert.equal(change.url, "example.com/menu");
    assert.equal(mergeTaskChanges([], [change], makeId, [], {contact: true}).tasks[0].url, "https://example.com/menu");
    assert.equal("url" in mergeTaskChanges([], [change], makeId).tasks[0], false);
    assert.equal("url" in mergeTaskChanges([], [{title: "x", url: "javascript:alert(1)"}], makeId, [], {contact: true}).tasks[0], false);
  });
  it("is never changed on an existing task by a merge", () => {
    const merged = mergeTaskChanges([withUrl()], [{id: "t1", title: "Fit tap", url: "https://elsewhere.com"}], makeId, [], {contact: true});
    assert.equal(merged.tasks[0].url, "https://example.com/menu");
  });
  it("goes to the next occurrence of a repeating task", () => {
    const task = {...withUrl(), dueDate: "2026-10-20", recurrence: {frequency: "WEEKLY", interval: 1}};
    assert.equal(completeInList([task], "t1", "2026-10-22", makeId).spawned.url, "https://example.com/menu");
    assert.equal("url" in completeInList([{...task, url: undefined}], "t1", "2026-10-22", makeId).spawned, false);
  });
});

describe("url on a completed task", () => {
  const row = {title: "Fit tap", priority: "LOW", estimatedMinutes: 30, url: "https://example.com/menu", completedAt: new Date("2026-10-20T01:00:00Z")};
  const opts = {projectIds: [], timeZone: "Pacific/Auckland", now: new Date("2026-10-24T02:00:00Z")};
  it("is corrected", () => {
    assert.deepEqual(applyCompletedEdit(row, {url: " new.example.com "}, opts), {set: {url: "https://new.example.com"}, remove: []});
  });
  it("is removed by null or empty text when the row has one, else there is nothing to change", () => {
    for (const v of [null, ""]) assert.deepEqual(applyCompletedEdit(row, {url: v}, opts), {set: {}, remove: ["url"]}, String(v));
    const bare = {...row};
    delete bare.url;
    assert.deepEqual(applyCompletedEdit(bare, {url: null}, opts), {error: "Nothing to change"});
  });
  it("rejects an unusable value", () => {
    assert.match(applyCompletedEdit(row, {url: 5}, opts).error, /Link/);
    assert.match(applyCompletedEdit(row, {url: "javascript:alert(1)"}, opts).error, /Link/);
  });
  it("comes back with a reopened task", () => {
    assert.equal(reopenTask([], {...row, id: "x"}, {projectIds: [], makeId}).task.url, "https://example.com/menu");
  });
  it("is carried by a template made from completed tasks, but not by a project template step", () => {
    assert.equal(buildTemplates([row])[0].url, "https://example.com/menu");
    const bare = {...row};
    delete bare.url;
    assert.equal("url" in buildTemplates([bare])[0], false);
    assert.equal("url" in stepFromTask({...base(), url: "https://example.com/menu"}), false);
  });
});
