/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {INBOX_SCOPE, MAX_ENTRIES, MAX_INPUT_LENGTH, findList, requestIdFor, inboxEntries} = require("../voiceInbox");
const {normalizeRequestId} = require("../addRequests");
const {oauthSecret, parseOAuthSecret, makeOAuthClient, makeTasksApi} = require("../googleTasks");

describe("voiceInbox.js", () => {
  it("asks for the Tasks scope only", () => {
    assert.equal(INBOX_SCOPE, "https://www.googleapis.com/auth/tasks");
  });

  describe("findList", () => {
    const lists = [{id: "l1", title: "My Tasks"}, {id: "l2", title: "TaskHub"}, {id: "l3", title: "taskhub"}];
    it("finds a list by title, ignoring case and spacing, the first when several match", () => {
      assert.equal(findList(lists, "TaskHub"), "l2");
      assert.equal(findList(lists, "  my   tasks "), "l1");
      assert.equal(findList(lists, "TASKHUB"), "l2");
    });
    it("is null for no match, an empty title and anything that is not a list of lists", () => {
      assert.equal(findList(lists, "Groceries"), null);
      assert.equal(findList(lists, ""), null);
      assert.equal(findList(lists, undefined), null);
      assert.equal(findList(undefined, "TaskHub"), null);
      assert.equal(findList([null, {id: "x"}, {title: "TaskHub"}, {id: "", title: "TaskHub"}], "TaskHub"), null);
    });
  });

  describe("requestIdFor", () => {
    it("makes a request id the add endpoint accepts, the same one each time for an item", () => {
      for (const id of ["MTIzNDU2Nzg5MDEy", "a", "ab+/=", "x".repeat(200), "é-ü"]) {
        const requestId = requestIdFor(id);
        assert.equal(normalizeRequestId(requestId), requestId, id);
        assert.equal(requestIdFor(id), requestId);
      }
      assert.equal(requestIdFor("MTIzNDU2Nzg5MDEy"), "gt-MTIzNDU2Nzg5MDEy");
    });
    it("is null without an id", () => {
      for (const id of [undefined, null, "", 5, {}]) assert.equal(requestIdFor(id), null);
    });
  });

  describe("inboxEntries", () => {
    const item = (extra = {}) => ({id: "item0001", title: "Buy fence palings", status: "needsAction", ...extra});
    it("turns an open item into its text, a request id and the item's id", () => {
      assert.deepEqual(inboxEntries([item()]), [{taskId: "item0001", requestId: "gt-item0001", input: "Buy fence palings"}]);
    });
    it("tidies the title's spacing and puts notes on a line of their own", () => {
      const [entry] = inboxEntries([item({title: "  Buy   fence\npalings ", notes: "  20 pieces, 1.8 m\nH3.2  "})]);
      assert.equal(entry.input, "Buy fence palings\n20 pieces, 1.8 m\nH3.2");
    });
    it("skips completed, deleted and hidden items, items with no title or id, and anything that is not an item", () => {
      const list = [item({status: "completed"}), item({deleted: true}), item({hidden: true}), item({title: "   "}), item({title: 5}), item({id: ""}), {title: "No id"}, null, "text", item({id: "kept0001"})];
      assert.deepEqual(inboxEntries(list).map((e) => e.taskId), ["kept0001"]);
      assert.deepEqual(inboxEntries(undefined), []);
    });
    it("keeps the order given and takes at most MAX_ENTRIES", () => {
      const many = Array.from({length: MAX_ENTRIES + 5}, (_, i) => item({id: `item${String(i).padStart(4, "0")}`, title: `Task ${i}`}));
      const entries = inboxEntries(many);
      assert.equal(entries.length, MAX_ENTRIES);
      assert.equal(entries[0].input, "Task 0");
      assert.equal(entries[MAX_ENTRIES - 1].input, `Task ${MAX_ENTRIES - 1}`);
    });
    it("cuts an item's text to MAX_INPUT_LENGTH", () => {
      assert.equal(inboxEntries([item({notes: "n".repeat(MAX_INPUT_LENGTH * 2)})])[0].input.length, MAX_INPUT_LENGTH);
    });
    it("does not modify the items", () => {
      const list = [item({title: "  A  "})];
      inboxEntries(list);
      assert.equal(list[0].title, "  A  ");
    });
  });
});

describe("googleTasks.js", () => {
  describe("the OAuth secret", () => {
    it("round-trips the client and the refresh token", () => {
      const raw = oauthSecret({clientId: "id", clientSecret: "secret", refreshToken: "refresh"});
      assert.deepEqual(parseOAuthSecret(raw), {clientId: "id", clientSecret: "secret", refreshToken: "refresh"});
    });
    it("says what is wrong with one that cannot be used", () => {
      assert.throws(() => parseOAuthSecret("not json"), /not valid JSON/);
      assert.throws(() => parseOAuthSecret("null"), /no client_id/);
      assert.throws(() => parseOAuthSecret(JSON.stringify({client_id: "a", client_secret: "b"})), /no refresh_token/);
      assert.throws(() => parseOAuthSecret(JSON.stringify({client_id: "a", client_secret: "", refresh_token: "c"})), /no client_secret/);
    });
    it("builds a client holding the refresh token", async () => {
      const client = makeOAuthClient(oauthSecret({clientId: "id", clientSecret: "secret", refreshToken: "refresh"}));
      assert.equal(client.credentials.refresh_token, "refresh");
    });
  });

  describe("makeTasksApi", () => {
    function fakeClient(pages) {
      const calls = [];
      return {
        calls,
        request: async (opts) => {
          calls.push(opts);
          const page = pages.shift();
          return {data: page};
        },
      };
    }
    it("lists every page of task lists", async () => {
      const client = fakeClient([{items: [{id: "l1", title: "A"}], nextPageToken: "next"}, {items: [{id: "l2", title: "B"}]}]);
      const lists = await makeTasksApi(client).lists();
      assert.deepEqual(lists.map((l) => l.id), ["l1", "l2"]);
      assert.equal(client.calls[0].url, "https://tasks.googleapis.com/tasks/v1/users/@me/lists");
      assert.equal(client.calls[1].params.pageToken, "next");
    });
    it("lists the open items of a list, never the completed or hidden ones, over every page", async () => {
      const client = fakeClient([{items: [{id: "t1"}], nextPageToken: "n"}, {}]);
      const items = await makeTasksApi(client).items("list/1");
      assert.deepEqual(items, [{id: "t1"}]);
      assert.equal(client.calls[0].url, "https://tasks.googleapis.com/tasks/v1/lists/list%2F1/tasks");
      assert.equal(client.calls[0].params.showCompleted, false);
      assert.equal(client.calls[0].params.showHidden, false);
    });
    it("completes an item with a PATCH", async () => {
      const client = fakeClient([{}]);
      await makeTasksApi(client).complete("l1", "t 1");
      assert.equal(client.calls[0].method, "PATCH");
      assert.equal(client.calls[0].url, "https://tasks.googleapis.com/tasks/v1/lists/l1/tasks/t%201");
      assert.deepEqual(client.calls[0].data, {status: "completed"});
    });
    it("lets a failed call through, so the caller can leave the item for the next pull", async () => {
      const client = {request: async () => {
        throw new Error("invalid_grant");
      }};
      await assert.rejects(() => makeTasksApi(client).lists(), /invalid_grant/);
    });
  });
});
