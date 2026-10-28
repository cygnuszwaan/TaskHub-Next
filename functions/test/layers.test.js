/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

// The Back button helpers sit in public/index.html's pure-helpers block; load them the way the page does.
const html = fs.readFileSync(path.join(__dirname, "..", "..", "public", "index.html"), "utf8");
const start = html.indexOf("// <pure-helpers>");
const end = html.indexOf("// </pure-helpers>");
const block = html.slice(start, end);
const {createLayerStack, layerStateOf, layerDepthOf, layerHistoryStep, layerPopStep} = new Function(`${block}
  return {createLayerStack, layerStateOf, layerDepthOf, layerHistoryStep, layerPopStep};`)();

// A browser history in miniature: pushState drops the entries ahead, and go() lands later (as a task, in order with the timers),
// out of range it does nothing and fires no popstate. `back()` and `forward()` are the owner's Back and Forward, which the page
// does not count as its own go() calls.
function makeBrowser(states = [null], index = 0) {
  const tasks = []; // 0 ms timers and history traversals, in the order they were queued
  const slow = []; // timers of a second or more
  let nextId = 1;
  const browser = {
    entries: states.map((state) => ({state})),
    index,
    pushes: 0,
    goes: 0,
    locks: [],
    stack: null,
    get depth() {
      return layerDepthOf(this.entries[this.index].state);
    },
    traverse(delta) {
      tasks.push({id: 0, fn: () => {
        const to = browser.index + delta;
        if (to < 0 || to >= browser.entries.length) return;
        browser.index = to;
        browser.stack.popped(browser.entries[to].state);
      }});
    },
    back() {
      this.traverse(-1);
    },
    forward() {
      this.traverse(1);
    },
    history: {
      get state() {
        return browser.entries[browser.index].state;
      },
      pushState(state) {
        browser.entries.splice(browser.index + 1);
        browser.entries.push({state});
        browser.index++;
        browser.pushes++;
      },
      go(delta) {
        browser.goes++;
        browser.traverse(delta);
      },
    },
    env: {
      setTimer(fn, ms) {
        const id = nextId++;
        (ms >= 1000 ? slow : tasks).push({id, fn});
        return id;
      },
      clearTimer(id) {
        for (const list of [tasks, slow]) {
          const at = list.findIndex((t) => t.id === id);
          if (at >= 0) list.splice(at, 1);
        }
      },
      lock(locked) {
        browser.locks.push(locked);
      },
    },
    step() {
      const task = tasks.shift();
      if (task) task.fn();
      return !!task;
    },
    flush() {
      let n = 0;
      while (browser.step()) assert.ok(++n < 100, "settles");
    },
    expire() {
      for (const task of slow.splice(0)) task.fn();
    },
  };
  browser.env.history = browser.history;
  return browser;
}
function makeStack(browser) {
  browser.stack = createLayerStack(browser.env);
  return browser.stack;
}
// A layer whose Back closes it, as the page's modals do; `closed` records the ids in the order Back reached them.
function closingLayer(stack, closed, id) {
  stack.open(id, () => {
    closed.push(id);
    stack.close(id);
  });
}

describe("the Back button and open overlays", () => {
  describe("helpers", () => {
    it("records the depth in a history entry's state and reads 0 from any other state", () => {
      assert.deepEqual(layerStateOf(2), {taskhubLayers: 2});
      assert.equal(layerDepthOf(layerStateOf(2)), 2);
      for (const state of [null, undefined, {}, "x", 7, {taskhubLayers: 0}, {taskhubLayers: -1}, {taskhubLayers: 1.5}, {taskhubLayers: "2"}]) assert.equal(layerDepthOf(state), 0, JSON.stringify(state));
    });
    it("pushes or goes back by the difference between the layers and the history, never both", () => {
      assert.deepEqual(layerHistoryStep(2, 0), {push: 2, back: 0});
      assert.deepEqual(layerHistoryStep(1, 3), {push: 0, back: 2});
      assert.deepEqual(layerHistoryStep(2, 2), {push: 0, back: 0});
      assert.deepEqual(layerHistoryStep(0, 0), {push: 0, back: 0});
    });
    it("takes a landing on the depth the page's own go() was heading for as its own, anything else as Back", () => {
      assert.deepEqual(layerPopStep(1, 0, 0), {ours: true, dismiss: 0});
      assert.deepEqual(layerPopStep(1, 0, null), {ours: false, dismiss: 1});
      assert.deepEqual(layerPopStep(3, 1, 2), {ours: false, dismiss: 2});
      assert.deepEqual(layerPopStep(0, 1, null), {ours: false, dismiss: 0}, "a forward entry closes nothing");
      assert.deepEqual(layerPopStep(1, 2, null), {ours: false, dismiss: 0});
    });
  });

  describe("layer stack", () => {
    it("adds one history entry a tick after a layer opens and closes the layer when Back takes it", () => {
      const b = makeBrowser();
      const stack = makeStack(b);
      const closed = [];
      closingLayer(stack, closed, "edit");
      assert.equal(b.pushes, 0, "the history changes a tick later");
      b.flush();
      assert.equal(b.pushes, 1);
      assert.equal(b.depth, 1);
      b.back();
      b.flush();
      assert.deepEqual(closed, ["edit"]);
      assert.deepEqual(stack.ids(), []);
      assert.equal(b.depth, 0);
      assert.equal(b.index, 0, "back on the page's own entry, which is where the app would then be left");
      assert.equal(b.goes, 0, "the page made no go() of its own");
      assert.equal(b.pushes, 1, "and nothing was pushed back");
    });
    it("takes its entry away when a layer is closed from code, without treating that as a Back press", () => {
      const b = makeBrowser();
      const stack = makeStack(b);
      const closed = [];
      closingLayer(stack, closed, "edit");
      b.flush();
      stack.close("edit");
      b.flush();
      assert.equal(b.depth, 0);
      assert.equal(b.goes, 1);
      assert.deepEqual(closed, [], "its Back was not run");
      assert.deepEqual(stack.ids(), []);
    });
    it("reaches the topmost layer first and the next one on the next Back", () => {
      const b = makeBrowser();
      const stack = makeStack(b);
      const closed = [];
      closingLayer(stack, closed, "edit");
      b.flush();
      closingLayer(stack, closed, "photo");
      b.flush();
      assert.equal(b.depth, 2);
      b.back();
      b.flush();
      assert.deepEqual(closed, ["photo"]);
      assert.deepEqual(stack.ids(), ["edit"]);
      b.back();
      b.flush();
      assert.deepEqual(closed, ["photo", "edit"]);
      assert.equal(b.depth, 0);
    });
    it("closes every layer a jump back over several entries took away, top first", () => {
      const b = makeBrowser();
      const stack = makeStack(b);
      const closed = [];
      closingLayer(stack, closed, "edit");
      b.flush();
      closingLayer(stack, closed, "confirm");
      b.flush();
      b.traverse(-2);
      b.flush();
      assert.deepEqual(closed, ["confirm", "edit"]);
      assert.equal(b.depth, 0);
    });
    it("keeps the history in step when a layer under another is closed from code", () => {
      const b = makeBrowser();
      const stack = makeStack(b);
      const closed = [];
      closingLayer(stack, closed, "edit");
      b.flush();
      closingLayer(stack, closed, "photo");
      b.flush();
      stack.close("edit");
      b.flush();
      assert.deepEqual(stack.ids(), ["photo"]);
      assert.equal(b.depth, 1);
      b.back();
      b.flush();
      assert.deepEqual(closed, ["photo"], "Back reaches the layer still open");
      assert.equal(b.depth, 0);
    });
    it("changes nothing when one overlay is closed and another opened at once", () => {
      const b = makeBrowser();
      const stack = makeStack(b);
      closingLayer(stack, [], "confirm");
      b.flush();
      stack.close("confirm");
      closingLayer(stack, [], "confirm"); // one question replacing another
      b.flush();
      assert.equal(b.pushes, 1);
      assert.equal(b.goes, 0);
      assert.equal(b.depth, 1);
    });
    it("does not take its own go() for a Back press when another overlay opens before it lands", () => {
      const b = makeBrowser();
      const stack = makeStack(b);
      const closed = [];
      closingLayer(stack, closed, "edit");
      b.flush();
      stack.close("edit"); // a save closes the form
      b.step(); // the tick runs and the page goes back
      assert.equal(b.goes, 1);
      closingLayer(stack, closed, "snooze"); // the snooze dialog opens before that lands
      b.flush();
      assert.deepEqual(stack.ids(), ["snooze"], "still open");
      assert.deepEqual(closed, []);
      assert.equal(b.depth, 1, "with an entry of its own");
      b.back();
      b.flush();
      assert.deepEqual(closed, ["snooze"]);
      assert.equal(b.depth, 0);
    });
    it("puts the entry back for a layer that stays open, and Back reaches it again", () => {
      const b = makeBrowser();
      const stack = makeStack(b);
      let asked = 0;
      stack.open("proposal", () => {
        asked++; // busy: it will not close
      });
      b.flush();
      b.back();
      b.flush();
      assert.equal(asked, 1);
      assert.deepEqual(stack.ids(), ["proposal"]);
      assert.equal(b.depth, 1, "the entry is back");
      b.back();
      b.flush();
      assert.equal(asked, 2);
      assert.equal(b.depth, 1);
    });
    it("lets a layer that refuses first and closes later go on as normal", () => {
      const b = makeBrowser();
      const stack = makeStack(b);
      let busy = true;
      stack.open("proposal", () => {
        if (!busy) stack.close("proposal");
      });
      b.flush();
      b.back();
      b.flush();
      busy = false;
      b.back();
      b.flush();
      assert.deepEqual(stack.ids(), []);
      assert.equal(b.depth, 0);
      assert.equal(b.index, 0);
    });
    it("goes back over a forward entry when no layer is open", () => {
      const b = makeBrowser();
      const stack = makeStack(b);
      closingLayer(stack, [], "edit");
      b.flush();
      b.back();
      b.flush();
      assert.equal(b.depth, 0);
      b.forward();
      b.flush();
      assert.equal(b.depth, 0, "sent back to the page's own entry");
      assert.deepEqual(stack.ids(), []);
    });
    it("goes back to the page's own entry on a reload that kept an old entry's state", () => {
      const b = makeBrowser([null, layerStateOf(1), layerStateOf(2)], 2);
      makeStack(b);
      b.flush();
      assert.equal(b.depth, 0);
      assert.equal(b.goes, 1);
      assert.equal(b.pushes, 0);
    });
    it("gives up on a go() that never lands instead of trying for ever", () => {
      const b = makeBrowser([layerStateOf(1)], 0); // nothing before it to go back to
      makeStack(b);
      b.flush();
      assert.equal(b.goes, 1);
      b.expire();
      b.flush();
      assert.equal(b.goes, 1, "no second try");
    });
    it("locks the page while any layer is open", () => {
      const b = makeBrowser();
      const stack = makeStack(b);
      stack.open("edit", () => {});
      stack.open("photo", () => {});
      stack.close("photo");
      assert.deepEqual(b.locks, [true, true, true], "still locked with the edit form open behind");
      stack.close("edit");
      assert.equal(b.locks[b.locks.length - 1], false);
      stack.close("edit"); // closing what is not open changes nothing
      assert.equal(b.locks[b.locks.length - 1], false);
    });
    it("replaces the Back action of a layer opened again while it is still open, and counts it once", () => {
      const b = makeBrowser();
      const stack = makeStack(b);
      const calls = [];
      stack.open("edit", () => calls.push("first"));
      stack.open("edit", () => {
        calls.push("second");
        stack.close("edit");
      });
      b.flush();
      assert.deepEqual(stack.ids(), ["edit"]);
      assert.equal(b.depth, 1);
      b.back();
      b.flush();
      assert.deepEqual(calls, ["second"]);
    });
  });

  describe("the page", () => {
    const overlays = [
      ["editModal", "backFromEditModal"],
      ["completedEditModal", "backFromCompletedEditor"],
      ["photoModal", "closePhotoViewer"],
      ["snoozeModal", "closeSnoozeModal"],
      ["batchModal", "closeBatchModal"],
      ["proposalModal", "closeProposalModal"],
    ];
    it("shows and hides every overlay as a layer, never by its display alone", () => {
      for (const [id, close] of overlays) {
        assert.ok(html.includes(`showLayer("${id}", ${close})`), `${id} is shown with its close as Back`);
        assert.ok(html.includes(`hideLayer("${id}")`), `${id} is hidden as a layer`);
      }
      assert.match(html, /showLayer\("confirmModal", \(\) => settleConfirm\(false\)\)/);
      assert.match(html, /hideLayer\("confirmModal"\)/);
      for (const id of [...overlays.map(([name]) => name), "confirmModal"]) {
        assert.doesNotMatch(html, new RegExp(`getElementById\\("${id}"\\)\\.style\\.display = "(flex|none)"`), `${id}'s display is set only by showLayer and hideLayer`);
      }
      assert.doesNotMatch(html, /classList\.(add|remove)\("modal-open"\)/, "the stack alone locks the page");
    });
    it("reads the browser's popstate through the stack and locks the page from it", () => {
      assert.match(html, /createLayerStack\(\{\s*history,/);
      assert.match(html, /window\.addEventListener\("popstate", e => layerStack\.popped\(e\.state\)\)/);
      assert.match(html, /lock: \(locked\) => document\.body\.classList\.toggle\("modal-open", locked\)/);
    });
    it("lets the proposal dialog refuse to close while busy, which keeps its history entry", () => {
      const fn = html.slice(html.indexOf("function closeProposalModal"), html.indexOf("function closeProposalOnOverlay"));
      assert.ok(fn.indexOf("if (proposalBusy) return;") < fn.indexOf("hideLayer(\"proposalModal\")"));
    });
  });
});
