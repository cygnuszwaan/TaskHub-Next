/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_NAME_LENGTH, MAX_ADDRESS_LENGTH, MAX_PHONE_LENGTH, MAX_EMAIL_LENGTH, normalizeClientFields, sortClients, addClient, updateClient, removeClientFromProjects, setProjectClient, clientLines, clientHourlyRate} = require("../clients");

const list = [{id: "c1", name: "Smith Family", address: "1 Beach Rd", phone: "", email: ""}, {id: "c2", name: "acme Ltd", address: "", phone: "", email: ""}];

describe("clients.js", () => {
  describe("normalizeClientFields", () => {
    it("cleans every field and fills the optional ones with empty text", () => {
      assert.deepEqual(normalizeClientFields({name: "  Jo \n Smith ", address: " 1 Beach Rd \r\n\r\n  Whangaparāoa  0930 ", phone: " 021  000 000 ", email: " jo@example.co.nz "}),
          {client: {name: "Jo Smith", address: "1 Beach Rd\nWhangaparāoa 0930", phone: "021 000 000", email: "jo@example.co.nz"}});
      assert.deepEqual(normalizeClientFields({name: "Jo", address: null}), {client: {name: "Jo", address: "", phone: "", email: ""}});
    });
    it("keeps an hourly rate rounded to cents and leaves the key out for none", () => {
      assert.equal(normalizeClientFields({name: "Jo", hourlyRate: 95}).client.hourlyRate, 95);
      assert.equal(normalizeClientFields({name: "Jo", hourlyRate: "72.456"}).client.hourlyRate, 72.46);
      for (const hourlyRate of [undefined, null, "", "  ", 0, "0"]) assert.equal("hourlyRate" in normalizeClientFields({name: "Jo", hourlyRate}).client, false, String(hourlyRate));
    });
    it("rejects an unusable hourly rate", () => {
      for (const hourlyRate of [-1, "abc", "1e3", 10000.01, NaN, true, {}, []]) assert.match(normalizeClientFields({name: "Jo", hourlyRate}).error, /hourlyRate must be an amount/, String(hourlyRate));
    });
    it("needs an object with a name", () => {
      for (const v of [undefined, null, "x", [], 5]) assert.match(normalizeClientFields(v).error, /must be an object/);
      for (const name of [undefined, null, "", "   "]) assert.match(normalizeClientFields({name}).error, /name must be a non-empty string/);
      assert.match(normalizeClientFields({name: 7}).error, /name must be text/);
    });
    it("rejects a field of the wrong type or length and an email that is not one", () => {
      assert.match(normalizeClientFields({name: "a".repeat(MAX_NAME_LENGTH + 1)}).error, /name must be at most 100/);
      assert.equal(normalizeClientFields({name: "a".repeat(MAX_NAME_LENGTH)}).client.name.length, MAX_NAME_LENGTH);
      assert.match(normalizeClientFields({name: "a", address: "x".repeat(MAX_ADDRESS_LENGTH + 1)}).error, /address must be at most 300/);
      assert.match(normalizeClientFields({name: "a", address: 5}).error, /address must be text/);
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
      assert.deepEqual(r.client, {id: "c3", name: "Bob", address: "", phone: "", email: ""});
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
      assert.deepEqual(r.client, {id: "c1", name: "Smith", address: "", phone: "021", email: ""});
      assert.equal(r.clients.length, 2);
    });
    it("sets, changes and clears the hourly rate (an update replaces the fields)", () => {
      const withRate = updateClient(list, "c1", {name: "Smith Family", hourlyRate: 90});
      assert.equal(withRate.client.hourlyRate, 90);
      assert.equal(updateClient(withRate.clients, "c1", {name: "Smith Family", hourlyRate: 100}).client.hourlyRate, 100);
      assert.equal("hourlyRate" in updateClient(withRate.clients, "c1", {name: "Smith Family"}).client, false);
      assert.match(updateClient(list, "c1", {name: "Smith Family", hourlyRate: -3}).error, /hourlyRate/);
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
  });

  describe("clientHourlyRate", () => {
    it("uses the client's rate, else the fallback", () => {
      assert.equal(clientHourlyRate({hourlyRate: 95}, 85), 95);
      assert.equal(clientHourlyRate({name: "Jo"}, 85), 85);
      assert.equal(clientHourlyRate(null, 85), 85);
      assert.equal(clientHourlyRate(undefined, null), null);
      assert.equal(clientHourlyRate({name: "Jo"}, null), null);
    });
    it("ignores an unusable stored rate", () => {
      for (const hourlyRate of [0, -5, "95", NaN, null]) assert.equal(clientHourlyRate({hourlyRate}, 85), 85, String(hourlyRate));
    });
  });

  describe("clientLines", () => {
    it("lists the name, address lines, phone and email that exist", () => {
      assert.deepEqual(clientLines({name: "Jo", address: "1 Beach Rd\nAuckland", phone: "021", email: "jo@x.nz"}), ["Jo", "1 Beach Rd", "Auckland", "021", "jo@x.nz"]);
      assert.deepEqual(clientLines({name: "Jo", address: "", phone: "", email: ""}), ["Jo"]);
    });
    it("is empty for no client", () => {
      for (const v of [null, undefined, "x"]) assert.deepEqual(clientLines(v), []);
    });
  });
});
