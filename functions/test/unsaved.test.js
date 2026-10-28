/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

// The unsaved-changes helpers and the choice dialog's view sit in public/index.html's pure-helpers block; load them the way the page does.
const html = fs.readFileSync(path.join(__dirname, "..", "..", "public", "index.html"), "utf8");
const start = html.indexOf("// <pure-helpers>");
const end = html.indexOf("// </pure-helpers>");
assert.ok(start > 0 && end > start, "pure-helpers markers not found in public/index.html");
const {
  confirmView, controlValues, formState, formChanged, commentPending, queuedFormDirty, completedFormDirty, unsavedAction, UNSAVED_PROMPT, UNSAVED_CHOICES,
} = new Function(`${html.slice(start, end)}
  return {confirmView, controlValues, formState, formChanged, commentPending, queuedFormDirty, completedFormDirty, unsavedAction, UNSAVED_PROMPT, UNSAVED_CHOICES};`)();

const text = (id, value) => ({id, type: "text", value});
const box = (id, checked) => ({id, type: "checkbox", value: "on", checked});

describe("controlValues", () => {
  it("keys each control by its id, or by its place when it has none", () => {
    assert.deepEqual(controlValues([text("a", "x"), text("", "y"), text(undefined, "z")]), [["a", "x"], ["#1", "y"], ["#2", "z"]]);
  });

  it("reads a checkbox or radio as whether it is checked, and everything else as text", () => {
    assert.deepEqual(controlValues([box("c", true), {id: "r", type: "radio", value: "on", checked: false}, {id: "n", type: "number", value: 15}, text("e", null)]),
        [["c", true], ["r", false], ["n", "15"], ["e", ""]]);
  });

  it("leaves out a file input and anything that is not a control", () => {
    assert.deepEqual(controlValues([{id: "f", type: "file", value: "C:\\a.jpg"}, null, "x", text("a", "1")]), [["a", "1"]]);
  });

  it("takes anything but a list for no controls", () => {
    for (const bad of [undefined, null, "x", 5, {}]) assert.deepEqual(controlValues(bad), []);
  });
});

describe("formChanged", () => {
  const controls = [text("title", "Mow"), text("minutes", "15"), box("done", false)];

  it("is false for the same controls and extras", () => {
    assert.equal(formChanged(formState(controls, {a: 1}), formState([...controls], {a: 1})), false);
  });

  it("is true when a control's text changes", () => {
    const after = [text("title", "Mow lawn"), text("minutes", "15"), box("done", false)];
    assert.equal(formChanged(formState(controls, null), formState(after, null)), true);
  });

  it("is true when a checkbox flips", () => {
    const after = [text("title", "Mow"), text("minutes", "15"), box("done", true)];
    assert.equal(formChanged(formState(controls, null), formState(after, null)), true);
  });

  it("is true when a control is added or goes", () => {
    assert.equal(formChanged(formState(controls, null), formState([...controls, text("", "new")], null)), true);
    assert.equal(formChanged(formState(controls, null), formState(controls.slice(1), null)), true);
  });

  it("is true when a control swaps places with another of the same value", () => {
    assert.equal(formChanged(formState([text("a", "1"), text("b", "1")], null), formState([text("b", "1"), text("a", "1")], null)), true);
  });

  it("is true when the extras change, whether the materials or the picked location", () => {
    const materials = [{id: "m1", text: "Paint", checked: false}];
    const before = formState(controls, {materials, location: null});
    assert.equal(formChanged(before, formState(controls, {materials: [{...materials[0], checked: true}], location: null})), true);
    assert.equal(formChanged(before, formState(controls, {materials: [{...materials[0], cost: 12.5}], location: null})), true);
    assert.equal(formChanged(before, formState(controls, {materials: [], location: null})), true);
    assert.equal(formChanged(before, formState(controls, {materials, location: {name: "Home", latitude: 1, longitude: 2}})), true);
  });

  it("is false when the extras are unchanged copies", () => {
    const materials = [{id: "m1", text: "Paint", checked: false, cost: 3}];
    assert.equal(formChanged(formState(controls, {materials, location: null}), formState(controls, {materials: materials.map((m) => ({...m})), location: null})), false);
  });

  it("tells nothing apart without a baseline", () => {
    assert.equal(formChanged(null, formState(controls, null)), false);
    assert.equal(formChanged(formState(controls, null), undefined), false);
  });

  it("treats missing extras as none", () => {
    assert.equal(formChanged(formState(controls), formState(controls, undefined)), false);
    assert.equal(formChanged(formState(controls), formState(controls, null)), false);
  });
});

describe("commentPending", () => {
  it("is true for text and false for nothing or only spaces", () => {
    assert.equal(commentPending("Called the client"), true);
    assert.equal(commentPending("  hi  "), true);
    assert.equal(commentPending(""), false);
    assert.equal(commentPending(" \n\t "), false);
    assert.equal(commentPending(undefined), false);
  });
});

describe("queuedFormDirty", () => {
  const controls = [text("title", "Mow")];
  const before = formState(controls, null);

  it("is false for an untouched form with an empty comment box", () => {
    assert.equal(queuedFormDirty(before, formState(controls, null), ""), false);
    assert.equal(queuedFormDirty(before, formState(controls, null), "   "), false);
  });

  it("is true when a control changed or a comment is typed", () => {
    assert.equal(queuedFormDirty(before, formState([text("title", "Rake")], null), ""), true);
    assert.equal(queuedFormDirty(before, formState(controls, null), "Remember the gate"), true);
  });

  it("is false when a changed form is changed back", () => {
    assert.equal(queuedFormDirty(before, formState([text("title", "Rake")], null), ""), true);
    assert.equal(queuedFormDirty(before, formState([text("title", "Mow")], null), ""), false);
  });

  it("is false with no baseline and an empty box", () => {
    assert.equal(queuedFormDirty(null, formState(controls, null), ""), false);
  });
});

describe("completedFormDirty", () => {
  it("is false when there is nothing to send and no comment text", () => {
    assert.equal(completedFormDirty({fields: {}}, ""), false);
    assert.equal(completedFormDirty({fields: {}}, "  "), false);
  });

  it("is true when a field would be sent", () => {
    assert.equal(completedFormDirty({fields: {priority: "HIGH"}}, ""), true);
  });

  it("is true for a value that cannot be saved", () => {
    assert.equal(completedFormDirty({error: "Enter the time spent as a number.", section: "ceScheduling"}, ""), true);
  });

  it("is true for comment text alone", () => {
    assert.equal(completedFormDirty({fields: {}}, "Paid in cash"), true);
  });

  it("is false for a missing result with no comment text", () => {
    assert.equal(completedFormDirty(undefined, ""), false);
    assert.equal(completedFormDirty(null, ""), false);
  });
});

describe("unsavedAction", () => {
  it("passes Save and Discard through", () => {
    assert.equal(unsavedAction("save"), "save");
    assert.equal(unsavedAction("discard"), "discard");
  });

  it("keeps editing for Keep editing and for every way of dismissing the dialog", () => {
    for (const answer of ["keep", null, undefined, false, true, "", "SAVE", "other"]) assert.equal(unsavedAction(answer), "keep");
  });
});

describe("the unsaved-changes prompt", () => {
  it("shows Save, Discard and Keep editing, with Keep editing focused", () => {
    const view = confirmView(UNSAVED_PROMPT, {tone: "save", choices: UNSAVED_CHOICES});
    assert.deepEqual(view.choices.map((c) => c.id), ["save", "discard", "keep"]);
    assert.deepEqual(view.choices.map((c) => c.label), ["Save", "Discard", "Keep editing"]);
    assert.deepEqual(view.choices.map((c) => c.kind), ["primary", "danger", "plain"]);
    assert.equal(view.focusChoice, 2);
    assert.equal(view.title, "Save your changes?");
    assert.equal(view.detail.length, 1);
  });
});

describe("confirmView choices", () => {
  const choices = [{id: "a", label: "A"}, {id: "b", label: " B "}];

  it("has none for an ordinary question, an alert or a text field", () => {
    assert.equal(confirmView("Sure?").choices, null);
    assert.equal(confirmView("Sure?", {tone: "danger"}).choices, null);
    assert.equal(confirmView("Sure?", {choices, alert: true}).choices, null);
    assert.equal(confirmView("Sure?", {choices, input: true}).choices, null);
  });

  it("normalizes the entries: trimmed labels, a kind of primary, danger or plain, no focus unless asked", () => {
    const view = confirmView("Pick", {choices: [{id: "a", label: "A", kind: "primary"}, {id: "b", label: " B ", kind: "danger"}, {id: "c", label: "C", kind: "weird", focus: true}]});
    assert.deepEqual(view.choices, [
      {id: "a", label: "A", kind: "primary", focus: false},
      {id: "b", label: "B", kind: "danger", focus: false},
      {id: "c", label: "C", kind: "plain", focus: true},
    ]);
    assert.equal(view.focusChoice, 2);
  });

  it("focuses the first choice when none asks, and the first that asks otherwise", () => {
    assert.equal(confirmView("Pick", {choices}).focusChoice, 0);
    assert.equal(confirmView("Pick", {choices: [{id: "a", label: "A", focus: true}, {id: "b", label: "B", focus: true}]}).focusChoice, 0);
  });

  it("drops entries with no text id or label, and repeated ids", () => {
    const view = confirmView("Pick", {choices: [{id: "a", label: "A"}, {id: "", label: "Empty id"}, {id: 5, label: "Number id"}, {id: "b", label: "   "}, {id: "a", label: "Again"}, null, "x", {id: "c", label: "C"}]});
    assert.deepEqual(view.choices.map((c) => c.id), ["a", "c"]);
  });

  it("needs at least two entries and takes at most four", () => {
    assert.equal(confirmView("Pick", {choices: [{id: "a", label: "A"}]}).choices, null);
    assert.equal(confirmView("Pick", {choices: []}).choices, null);
    assert.equal(confirmView("Pick", {choices: "ab"}).choices, null);
    assert.equal(confirmView("Pick", {choices: ["a", "b", "c", "d", "e"].map((id) => ({id, label: id}))}).choices, null);
    assert.equal(confirmView("Pick", {choices: ["a", "b", "c", "d"].map((id) => ({id, label: id}))}).choices.length, 4);
  });

  it("does not focus Cancel when it shows choices, whatever the tone", () => {
    assert.equal(confirmView("Pick", {tone: "danger", choices}).focusCancel, false);
    assert.equal(confirmView("Pick", {tone: "danger"}).focusCancel, true);
  });
});

describe("the page's wiring", () => {
  it("passes the unsaved-changes handlers to showLayer for both forms", () => {
    assert.ok(html.includes("showLayer(\"editModal\", backFromEditModal)"));
    assert.ok(html.includes("showLayer(\"completedEditModal\", backFromCompletedEditor)"));
    assert.ok(!html.includes("showLayer(\"editModal\", closeEditModal)"));
    assert.ok(!html.includes("showLayer(\"completedEditModal\", closeCompletedEditor)"));
  });

  it("keeps Cancel and a tap outside as plain closes", () => {
    assert.ok(html.includes("<button class=\"btn-secondary\" onclick=\"closeEditModal()\">Cancel</button>"));
    assert.ok(html.includes("<button class=\"btn-secondary\" onclick=\"closeCompletedEditor()\">Cancel</button>"));
  });

  it("takes the queued form's baseline once the open function has filled it, before the form is shown", () => {
    const open = html.slice(html.indexOf("function openEditModal"), html.indexOf("function backFromEditModal"));
    const baseline = open.indexOf("editFormBaseline = readEditFormState()");
    assert.ok(baseline > 0);
    assert.ok(baseline > open.indexOf("\"editDescription\").value"), "the last field is filled first");
    assert.ok(baseline < open.indexOf("showLayer(\"editModal\""));
  });
});
