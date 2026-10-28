/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_NAME_LENGTH, MAX_PHONE_LENGTH, MAX_EMAIL_LENGTH, normalizeClientFields, sortClients, addClient, updateClient, removeClientFromProjects, resolveProjectClient, setProjectClient, clientLines, clientHourlyRate} = require("../clients");

const list = [{id: "c1", name: "Smith Family", phone: "", email: ""}, {id: "c2", name: "acme Ltd", phone: "", email: ""}];

describe("clients.js", () => {
  describe("normalizeClientFields", () => {
    it("cleans every field and fills the optional ones with empty text", () => {
      assert.deepEqual(normalizeClientFields({name: "  Jo \n Smith ", phone: " 021  000 000 ", email: " jo@example.co.nz "}),
          {client: {name: "Jo Smith", phone: "021 000 000", email: "jo@example.co.nz"}});
      assert.deepEqual(normalizeClientFields({name: "Jo", phone: null}), {client: {name: "Jo", phone: "", email: ""}});
    });
    it("no longer has an address: one sent by an old page is ignored, not stored or rejected", () => {
      assert.deepEqual(normalizeClientFields({name: "Jo", address: "1 Beach Rd"}), {client: {name: "Jo", phone: "", email: ""}});
      assert.deepEqual(normalizeClientFields({name: "Jo", address: 5}), {client: {name: "Jo", phone: "", email: ""}});
    });
    it("keeps an hourly rate rounded to cents and leaves the key out for none", () => {
      assert.equal(normalizeClientFields({name: "Jo", hourlyRate: 95}).client.hourlyRate, 95);
      assert.equal(normalizeClientFields({name: "Jo", hourlyRate: "72.456"}).client.hourlyRate, 72.46);
      for (const hourlyRate of [undefined, null, "", "  "]) assert.equal("hourlyRate" in normalizeClientFields({name: "Jo", hourlyRate}).client, false, String(hourlyRate));
    });
    it("keeps 0 as a real rate, so unpaid work can override the global rate", () => {
      for (const hourlyRate of [0, "0", "0.00", " 0 "]) assert.equal(normalizeClientFields({name: "Jo", hourlyRate}).client.hourlyRate, 0, String(hourlyRate));
    });
    it("rejects an unusable hourly rate", () => {
      for (const hourlyRate of [-1, "abc", "1e3", 10000.01, NaN, true, {}, []]) assert.match(normalizeClientFields({name: "Jo", hourlyRate}).error, /hourlyRate must be an amount from 0 to/, String(hourlyRate));
    });
    it("keeps useWhatsApp only when true and leaves the key out otherwise", () => {
      assert.equal(normalizeClientFields({name: "Jo", useWhatsApp: true}).client.useWhatsApp, true);
      for (const useWhatsApp of [undefined, null, false]) assert.equal("useWhatsApp" in normalizeClientFields({name: "Jo", useWhatsApp}).client, false, String(useWhatsApp));
      for (const useWhatsApp of ["yes", 1, 0, "", {}, []]) assert.match(normalizeClientFields({name: "Jo", useWhatsApp}).error, /useWhatsApp must be true or false/, String(useWhatsApp));
    });
    it("keeps a normalized location and leaves the key out for none", () => {
      assert.deepEqual(normalizeClientFields({name: "Jo", location: {name: " 1  Beach Rd ", latitude: -36.63, longitude: 174.78}}).client.location, {name: "1 Beach Rd", latitude: -36.63, longitude: 174.78});
      assert.deepEqual(normalizeClientFields({name: "Jo", location: {name: "Smith's yard"}}).client.location, {name: "Smith's yard"});
      for (const location of [undefined, null, "", {name: ""}]) assert.equal("location" in normalizeClientFields({name: "Jo", location}).client, false, JSON.stringify(location));
    });
    it("keeps a normalized url and leaves the key out for none", () => {
      assert.equal(normalizeClientFields({name: "Jo", url: " example.com/jo "}).client.url, "https://example.com/jo");
      assert.equal(normalizeClientFields({name: "Jo", url: "http://example.com"}).client.url, "http://example.com");
      for (const url of [undefined, null, "", "   "]) assert.equal("url" in normalizeClientFields({name: "Jo", url}).client, false, JSON.stringify(url));
    });
    it("rejects an unusable url", () => {
      for (const url of [5, [], {}, true, "javascript:alert(1)", "mailto:jo@x.nz", "two words", `https://example.com/${"a".repeat(500)}`]) {
        assert.match(normalizeClientFields({name: "Jo", url}).error, /^url must be an http or https address/, JSON.stringify(url));
      }
    });
    it("rejects an unusable location", () => {
      for (const location of ["Beach Rd", 5, [], {name: "A", latitude: 1}, {name: "A", latitude: 99, longitude: 0}, {name: "x".repeat(201)}, {latitude: 1, longitude: 2}]) {
        assert.match(normalizeClientFields({name: "Jo", location}).error, /location must be a name/, JSON.stringify(location));
      }
    });
    it("needs an object with a name", () => {
      for (const v of [undefined, null, "x", [], 5]) assert.match(normalizeClientFields(v).error, /must be an object/);
      for (const name of [undefined, null, "", "   "]) assert.match(normalizeClientFields({name}).error, /name must be a non-empty string/);
      assert.match(normalizeClientFields({name: 7}).error, /name must be text/);
    });
    it("rejects a field of the wrong type or length and an email that is not one", () => {
      assert.match(normalizeClientFields({name: "a".repeat(MAX_NAME_LENGTH + 1)}).error, /name must be at most 100/);
      assert.equal(normalizeClientFields({name: "a".repeat(MAX_NAME_LENGTH)}).client.name.length, MAX_NAME_LENGTH);
      assert.match(normalizeClientFields({name: "a", phone: "1".repeat(MAX_PHONE_LENGTH + 1)}).error, /phone must be at most 40/);
      assert.match(normalizeClientFields({name: "a", phone: 5}).error, /phone must be text/);
      assert.match(normalizeClientFields({name: "a", email: "e".repeat(MAX_EMAIL_LENGTH) + "@x.nz"}).error, /email must be at most 100/);
      for (const email of ["nope", "a@b", "a b@c.nz", "@c.nz"]) assert.match(normalizeClientFields({name: "a", email}).error, /not a valid address/, email);
    });
  });

  describe("sortClients", () => {
    it("orders by name ignoring case, then id, without changing the input", () => {
      assert.deepEqual(sortClients(list).map((c) => c.id), ["c2", "c1"]);
      assert.deepEqual(list.map((c) => c.id), ["c1", "c2"]);
    });
  });

  describe("addClient", () => {
    it("adds a sorted client with a new id", () => {
      const r = addClient(list, {name: "  Bob "}, () => "c3");
      assert.deepEqual(r.client, {id: "c3", name: "Bob", phone: "", email: ""});
      assert.deepEqual(r.clients.map((c) => c.id), ["c2", "c3", "c1"]);
    });
    it("rejects a taken name ignoring case and an unusable client", () => {
      assert.match(addClient(list, {name: "SMITH family"}, () => "x").error, /already exists/);
      assert.match(addClient(list, {name: ""}, () => "x").error, /non-empty/);
    });
  });

  describe("updateClient", () => {
    it("replaces the fields and keeps the id", () => {
      const r = updateClient(list, "c1", {name: "Smith", phone: "021"});
      assert.deepEqual(r.client, {id: "c1", name: "Smith", phone: "021", email: ""});
      assert.equal(r.clients.length, 2);
    });
    it("sets, changes and clears the hourly rate (an update replaces the fields)", () => {
      const withRate = updateClient(list, "c1", {name: "Smith Family", hourlyRate: 90});
      assert.equal(withRate.client.hourlyRate, 90);
      assert.equal(updateClient(withRate.clients, "c1", {name: "Smith Family", hourlyRate: 100}).client.hourlyRate, 100);
      assert.equal("hourlyRate" in updateClient(withRate.clients, "c1", {name: "Smith Family"}).client, false);
      assert.match(updateClient(list, "c1", {name: "Smith Family", hourlyRate: -3}).error, /hourlyRate/);
      assert.equal(updateClient(withRate.clients, "c1", {name: "Smith Family", hourlyRate: 0}).client.hourlyRate, 0);
    });
    it("sets and clears useWhatsApp (an update replaces the fields)", () => {
      const on = updateClient(list, "c1", {name: "Smith Family", useWhatsApp: true});
      assert.equal(on.client.useWhatsApp, true);
      assert.equal("useWhatsApp" in updateClient(on.clients, "c1", {name: "Smith Family", useWhatsApp: false}).client, false);
      assert.equal("useWhatsApp" in updateClient(on.clients, "c1", {name: "Smith Family"}).client, false);
    });
    it("sets, changes and clears the url (an update replaces the fields)", () => {
      const linked = updateClient(list, "c1", {name: "Smith Family", url: "smith.example.com"});
      assert.equal(linked.client.url, "https://smith.example.com");
      assert.equal(updateClient(linked.clients, "c1", {name: "Smith Family", url: "http://other.example.com"}).client.url, "http://other.example.com");
      assert.equal("url" in updateClient(linked.clients, "c1", {name: "Smith Family", url: null}).client, false);
      assert.equal("url" in updateClient(linked.clients, "c1", {name: "Smith Family"}).client, false);
      assert.match(updateClient(list, "c1", {name: "Smith Family", url: "ftp://x.com"}).error, /url/);
      assert.equal(addClient(list, {name: "New Co", url: "newco.example.com"}, () => "c9").client.url, "https://newco.example.com");
    });
    it("sets, changes and clears the location (an update replaces the fields)", () => {
      const placed = updateClient(list, "c1", {name: "Smith Family", location: {name: "1 Beach Rd", latitude: -36.6, longitude: 174.7}});
      assert.deepEqual(placed.client.location, {name: "1 Beach Rd", latitude: -36.6, longitude: 174.7});
      assert.deepEqual(updateClient(placed.clients, "c1", {name: "Smith Family", location: {name: "2 Hill St"}}).client.location, {name: "2 Hill St"});
      assert.equal("location" in updateClient(placed.clients, "c1", {name: "Smith Family", location: null}).client, false);
      assert.equal("location" in updateClient(placed.clients, "c1", {name: "Smith Family"}).client, false);
      assert.match(updateClient(list, "c1", {name: "Smith Family", location: {name: "A", longitude: 1}}).error, /location/);
    });
    it("lets a client keep its own name, in other letters", () => {
      assert.equal(updateClient(list, "c1", {name: "SMITH FAMILY"}).client.name, "SMITH FAMILY");
    });
    it("reports an unknown id, a taken name and an unusable client", () => {
      assert.deepEqual(updateClient(list, "zzz", {name: "x"}), {notFound: true});
      assert.match(updateClient(list, "c1", {name: "ACME ltd"}).error, /already exists/);
      assert.match(updateClient(list, "c1", {name: " "}).error, /non-empty/);
    });
  });

  describe("project links", () => {
    const projects = [{id: "p1", name: "A", clientId: "c1"}, {id: "p2", name: "B"}, {id: "p3", name: "C", clientId: "c2"}];
    it("removeClientFromProjects clears only that client, returning the others as the same objects", () => {
      const out = removeClientFromProjects(projects, "c1");
      assert.deepEqual(out[0], {id: "p1", name: "A"});
      assert.equal(out[1], projects[1]);
      assert.equal(out[2], projects[2]);
      assert.equal(projects[0].clientId, "c1");
    });
    it("setProjectClient sets, changes and clears the client", () => {
      assert.equal(setProjectClient(projects, list, "p2", "c1").project.clientId, "c1");
      assert.equal(setProjectClient(projects, list, "p1", "c2").project.clientId, "c2");
      for (const v of [null, "", undefined]) assert.equal("clientId" in setProjectClient(projects, list, "p1", v).project, false);
      assert.equal(projects[1].clientId, undefined);
    });
    it("setProjectClient reports an unknown project or client", () => {
      assert.deepEqual(setProjectClient(projects, list, "zzz", "c1"), {notFound: true});
      assert.deepEqual(setProjectClient(projects, list, "p1", "zzz"), {error: "Client not found"});
      assert.deepEqual(setProjectClient(projects, list, "p1", 7), {error: "Client not found"});
    });
    it("setProjectClient with newClient creates the client, gives it to the project and wins over clientId", () => {
      const r = setProjectClient(projects, list, "p2", "c1", {name: " Jo  Bloggs ", phone: "021"}, () => "c9");
      assert.deepEqual(r.client, {id: "c9", name: "Jo Bloggs", phone: "021", email: ""});
      assert.equal(r.project.clientId, "c9");
      assert.deepEqual(r.clients.map((x) => x.id), ["c2", "c9", "c1"]);
      assert.equal(r.projects.find((p) => p.id === "p2").clientId, "c9");
      assert.equal(list.length, 2);
      assert.equal(projects[1].clientId, undefined);
    });
    it("setProjectClient treats a null newClient as absent and reports a bad or taken newClient", () => {
      assert.equal(setProjectClient(projects, list, "p2", "c1", null, () => "x").project.clientId, "c1");
      assert.equal("clients" in setProjectClient(projects, list, "p2", "c1", undefined, () => "x"), false);
      assert.match(setProjectClient(projects, list, "p2", "c1", {name: "SMITH family"}, () => "x").error, /already exists/);
      assert.match(setProjectClient(projects, list, "p2", "c1", {name: "x", email: "bad"}, () => "x").error, /not a valid/);
      assert.match(setProjectClient(projects, list, "p2", null, "text", () => "x").error, /must be an object/);
      assert.deepEqual(setProjectClient(projects, list, "zzz", null, {name: "New"}, () => "x"), {notFound: true});
    });
  });

  describe("resolveProjectClient", () => {
    const makeId = () => "c9";
    it("means no client for a missing, null or empty choice", () => {
      for (const choice of [undefined, {}, {clientId: null}, {clientId: ""}, {newClient: null}]) {
        assert.deepEqual(resolveProjectClient(list, choice, makeId), {clients: list, client: null, clientId: null, created: false});
      }
    });
    it("finds a stored client by id", () => {
      const r = resolveProjectClient(list, {clientId: "c2"}, makeId);
      assert.deepEqual([r.client, r.clientId, r.created, r.clients], [list[1], "c2", false, list]);
    });
    it("refuses an id that is not stored or not text", () => {
      for (const clientId of ["zzz", 7, {}, true]) assert.deepEqual(resolveProjectClient(list, {clientId}, makeId), {error: "Client not found"});
    });
    it("creates a new client with every field the form takes, and it wins over an id", () => {
      const fields = {name: "Jo Bloggs", phone: "021", email: "jo@x.nz", hourlyRate: "55", useWhatsApp: true, location: {name: "Orewa", latitude: -36.6, longitude: 174.7}, url: "jo.example.nz"};
      const r = resolveProjectClient(list, {clientId: "c1", newClient: fields}, makeId);
      assert.equal(r.created, true);
      assert.equal(r.clientId, "c9");
      assert.deepEqual(r.client, {id: "c9", name: "Jo Bloggs", phone: "021", email: "jo@x.nz", hourlyRate: 55, useWhatsApp: true, location: {name: "Orewa", latitude: -36.6, longitude: 174.7}, url: "https://jo.example.nz"});
      assert.deepEqual(r.clients.map((x) => x.id), ["c2", "c9", "c1"]);
      assert.equal(list.length, 2);
    });
    it("refuses a taken name and an unusable field, ignoring a valid id", () => {
      assert.match(resolveProjectClient(list, {clientId: "c1", newClient: {name: "ACME ltd"}}, makeId).error, /already exists/);
      assert.match(resolveProjectClient(list, {newClient: {name: ""}}, makeId).error, /non-empty/);
      assert.match(resolveProjectClient(list, {newClient: {name: "x", hourlyRate: "lots"}}, makeId).error, /hourlyRate/);
      assert.match(resolveProjectClient(list, {newClient: {name: "x", useWhatsApp: "yes"}}, makeId).error, /useWhatsApp/);
      assert.match(resolveProjectClient(list, {newClient: [1]}, makeId).error, /must be an object/);
    });
  });

  describe("clientHourlyRate", () => {
    it("uses the client's rate, else the fallback", () => {
      assert.equal(clientHourlyRate({hourlyRate: 95}, 85), 95);
      assert.equal(clientHourlyRate({hourlyRate: 0}, 85), 0);
      assert.equal(clientHourlyRate({name: "Jo"}, 85), 85);
      assert.equal(clientHourlyRate(null, 85), 85);
      assert.equal(clientHourlyRate(undefined, null), null);
      assert.equal(clientHourlyRate({name: "Jo"}, null), null);
    });
    it("ignores an unusable stored rate", () => {
      for (const hourlyRate of [-5, "95", NaN, null]) assert.equal(clientHourlyRate({hourlyRate}, 85), 85, String(hourlyRate));
    });
  });

  describe("clientLines", () => {
    it("lists the name, location text, phone and email that exist", () => {
      assert.deepEqual(clientLines({name: "Jo", location: {name: "12 Beach Road, Orewa, Auckland 0931", latitude: -36.58, longitude: 174.69}, phone: "021", email: "jo@x.nz"}), ["Jo", "12 Beach Road, Orewa, Auckland 0931", "021", "jo@x.nz"]);
      assert.deepEqual(clientLines({name: "Jo", phone: "", email: ""}), ["Jo"]);
      assert.deepEqual(clientLines({name: "Jo", location: {name: "Smith's yard"}}), ["Jo", "Smith's yard"], "a label without a position prints too");
    });
    it("does not print an old stored address", () => {
      assert.deepEqual(clientLines({name: "Jo", address: "1 Beach Rd"}), ["Jo"]);
    });
    it("is empty for no client", () => {
      for (const v of [null, undefined, "x"]) assert.deepEqual(clientLines(v), []);
    });
  });
});
