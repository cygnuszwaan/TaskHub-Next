/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {KEEP_BACKUPS, normalizeBucketName, backupStamp, backupFolder, outputUriPrefix, databaseName, backupStamps, stampsToDelete, runBackup} = require("../backup");

const folder = (stamp) => `backups/${stamp}/`;
const S = ["2026-10-04T14-00-00Z", "2026-10-11T14-00-00Z", "2026-10-18T14-00-00Z", "2026-10-25T14-00-00Z", "2026-11-01T14-00-00Z"];

describe("backup.js names", () => {
  it("normalizes a bucket name, tolerating gs:// and slashes", () => {
    assert.equal(normalizeBucketName("taskhub-next-backups"), "taskhub-next-backups");
    assert.equal(normalizeBucketName("  gs://taskhub-next-backups/ "), "taskhub-next-backups");
    for (const bad of ["", "  ", "A_B", "a", "-abc", "abc-", "has space", "a/b", null, undefined, 5]) assert.equal(normalizeBucketName(bad), "");
  });
  it("stamps a time in UTC, sortable and path-safe", () => {
    assert.equal(backupStamp(new Date("2026-10-25T14:03:09.999Z")), "2026-10-25T14-03-09Z");
    assert.ok(backupStamp(new Date("2026-10-25T14:03:09Z")) < backupStamp(new Date("2026-11-01T01:00:00Z")));
  });
  it("builds the folder, the export prefix and the database name", () => {
    assert.equal(backupFolder(S[0]), `backups/${S[0]}`);
    assert.equal(outputUriPrefix("bkt", S[0]), `gs://bkt/backups/${S[0]}`);
    assert.equal(databaseName("taskhub-next"), "projects/taskhub-next/databases/(default)");
  });
});

describe("backup.js retention", () => {
  it("lists the stamps of backup folders oldest first and ignores everything else", () => {
    const out = backupStamps([folder(S[2]), folder(S[0]), "backups/notes/", "other/2026-10-04T14-00-00Z/", "backups/2026-10-04T14-00-00Z", 7, null, folder(S[0])]);
    assert.deepEqual(out, [S[0], S[2]]);
    assert.deepEqual(backupStamps(undefined), []);
  });
  it("deletes only the oldest beyond the number kept", () => {
    assert.deepEqual(stampsToDelete(S.map(folder), 4), [S[0]]);
    assert.deepEqual(stampsToDelete(S.map(folder), 2), [S[0], S[1], S[2]]);
    assert.deepEqual(stampsToDelete(S.slice(0, 4).map(folder), 4), []);
    assert.equal(KEEP_BACKUPS, 4);
  });
  it("always keeps at least one and falls back to the default for an unusable number", () => {
    assert.deepEqual(stampsToDelete(S.slice(0, 3).map(folder), 0), [S[0], S[1]]);
    assert.deepEqual(stampsToDelete(S.map(folder), "x"), [S[0]]);
  });
  it("never selects a folder that is not one of ours", () => {
    assert.deepEqual(stampsToDelete(["backups/keep-me/", "backups/", ...S.map(folder)], 1), S.slice(0, 4));
  });
});

describe("backup.js runBackup", () => {
  const now = new Date("2026-11-01T14:00:00Z");
  function deps(over) {
    const calls = {exports: [], deletes: []};
    return {calls, args: {
      bucket: "bkt", projectId: "taskhub-next", now, keep: 4,
      exportDocuments: async (req) => calls.exports.push(req),
      listFolders: async () => S.slice(0, 4).map(folder),
      deleteFolder: async (f) => calls.deletes.push(f),
      ...over,
    }};
  }
  it("starts a whole-database export and prunes to the newest few, counting the new one", async () => {
    const {calls, args} = deps();
    const out = await runBackup(args);
    assert.deepEqual(calls.exports, [{name: "projects/taskhub-next/databases/(default)", outputUriPrefix: `gs://bkt/backups/${S[4]}`, collectionIds: []}]);
    assert.deepEqual(calls.deletes, [`backups/${S[0]}`]);
    assert.equal(out.stamp, S[4]);
    assert.deepEqual(out.deleted, [S[0]]);
    assert.deepEqual(out.deleteErrors, []);
  });
  it("deletes nothing while there are few backups", async () => {
    const {calls, args} = deps({listFolders: async () => []});
    await runBackup(args);
    assert.equal(calls.exports.length, 1);
    assert.deepEqual(calls.deletes, []);
  });
  it("skips with an error and does nothing for a missing bucket or project", async () => {
    for (const over of [{bucket: ""}, {projectId: ""}]) {
      const {calls, args} = deps(over);
      const out = await runBackup(args);
      assert.ok(out.error);
      assert.equal(calls.exports.length, 0);
    }
  });
  it("deletes nothing when the export fails to start", async () => {
    const {calls, args} = deps({exportDocuments: async () => {
      throw new Error("denied");
    }});
    await assert.rejects(runBackup(args), /denied/);
    assert.deepEqual(calls.deletes, []);
  });
  it("reports a failed delete or listing without failing the run", async () => {
    const failing = deps({deleteFolder: async () => {
      throw new Error("nope");
    }});
    const out = await runBackup(failing.args);
    assert.equal(failing.calls.exports.length, 1);
    assert.deepEqual(out.deleted, []);
    assert.match(out.deleteErrors[0], /nope/);
    const noList = deps({listFolders: async () => {
      throw new Error("no list");
    }});
    const out2 = await runBackup(noList.args);
    assert.match(out2.deleteErrors[0], /no list/);
    assert.equal(noList.calls.exports.length, 1);
  });
});
