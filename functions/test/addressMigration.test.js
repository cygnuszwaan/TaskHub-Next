/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {addressAsLine, planAddressMigration} = require("../addressMigration");
const {run} = require("../scripts/migrateClientAddresses");

describe("addressMigration.js", () => {
  describe("addressAsLine", () => {
    it("joins the lines with commas and cuts to the 200-character location limit", () => {
      assert.equal(addressAsLine("1 Beach Rd\n  Orewa \r\n\nAuckland"), "1 Beach Rd, Orewa, Auckland");
      assert.equal(addressAsLine("x".repeat(250)).length, 200);
      for (const none of ["", " \n ", null, undefined, 5]) assert.equal(addressAsLine(none), "");
    });
  });
  describe("planAddressMigration", () => {
    it("turns the address of a client without a location into its location text", () => {
      const plan = planAddressMigration([{id: "c1", name: "Smith", address: "1 Beach Rd\nOrewa"}]);
      assert.deepEqual(plan.changes, [{id: "c1", name: "Smith", address: "1 Beach Rd, Orewa", location: {name: "1 Beach Rd, Orewa"}}]);
      assert.deepEqual(plan.dropped, []);
    });
    it("keeps an existing location and reports the address it drops", () => {
      const plan = planAddressMigration([{id: "c1", name: "Smith", address: "PO Box 5\nAuckland", location: {name: "12 Beach Road", latitude: -36.5, longitude: 174.6}}]);
      assert.deepEqual(plan.changes, [{id: "c1", name: "Smith", address: "PO Box 5, Auckland", location: null}]);
      assert.deepEqual(plan.dropped, [{id: "c1", name: "Smith", address: "PO Box 5, Auckland"}]);
    });
    it("only removes an empty address key, and leaves clients without the key alone", () => {
      const plan = planAddressMigration([{id: "c1", name: "A", address: ""}, {id: "c2", name: "B"}, {id: "c3", name: "C", address: "  "}, null, "x"]);
      assert.deepEqual(plan.changes.map((c) => [c.id, c.location]), [["c1", null], ["c3", null]]);
      assert.deepEqual(plan.dropped, []);
    });
    it("plans nothing for a missing list", () => {
      for (const none of [undefined, null, "x", []]) assert.deepEqual(planAddressMigration(none), {changes: [], dropped: []});
    });
  });
  describe("the script", () => {
    function fakeDb(docs) {
      const updates = [];
      const db = {
        collection: () => ({
          get: async () => ({docs: Object.entries(docs).map(([id, data]) => ({id, data: () => data}))}),
          doc: (id) => ({id}),
        }),
        batch: () => {
          const ops = [];
          return {update: (ref, data) => ops.push([ref.id, data]), commit: async () => updates.push(...ops)};
        },
      };
      return {db, updates};
    }
    it("writes nothing on a dry run", async () => {
      const {db, updates} = fakeDb({c1: {name: "Smith", address: "1 Beach Rd"}});
      const lines = [];
      assert.deepEqual(await run({db, log: (l) => lines.push(l)}), {migrated: 0});
      assert.deepEqual(updates, []);
      assert.ok(lines.some((l) => /Dry run only/.test(l)));
      assert.ok(lines.some((l) => /location becomes "1 Beach Rd"/.test(l)));
    });
    it("with --apply sets the location where there was none and removes every address key", async () => {
      const {db, updates} = fakeDb({c1: {name: "Smith", address: "1 Beach Rd"}, c2: {name: "Jo", address: "PO Box", location: {name: "Here"}}, c3: {name: "Bob"}});
      assert.deepEqual(await run({db, apply: true, log: () => {}}), {migrated: 2});
      assert.deepEqual(updates.map(([id]) => id), ["c1", "c2"]);
      assert.deepEqual(updates[0][1].location, {name: "1 Beach Rd"});
      assert.ok("address" in updates[0][1] && "address" in updates[1][1], "the address key is deleted on both");
      assert.equal("location" in updates[1][1], false, "an existing location is not touched");
    });
    it("says so when there is nothing to do", async () => {
      const {db, updates} = fakeDb({c1: {name: "Smith"}});
      const lines = [];
      assert.deepEqual(await run({db, apply: true, log: (l) => lines.push(l)}), {migrated: 0});
      assert.deepEqual(updates, []);
      assert.ok(lines.includes("Nothing to migrate."));
    });
  });
});
