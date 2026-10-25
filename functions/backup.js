/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// The weekly Firestore backup: names, retention and the run itself, with Google's clients injected so it can be
// tested. Pure apart from what `runBackup` is given to call.

const BACKUP_ROOT = "backups";
// How many backups are kept in the bucket, the newest included.
const KEEP_BACKUPS = 4;

const STAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/;
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;

// The bucket name from the BACKUP_BUCKET param: trimmed, a `gs://` prefix and trailing slashes tolerated. "" when
// it is empty or not a valid bucket name.
function normalizeBucketName(value) {
  if (typeof value !== "string") return "";
  const name = value.trim().replace(/^gs:\/\//, "").replace(/\/+$/, "");
  return BUCKET_PATTERN.test(name) ? name : "";
}

// A sortable, path-safe name for a backup made at `now`: "2026-10-25T14-03-00Z" (UTC).
function backupStamp(now) {
  return now.toISOString().slice(0, 19).replace(/:/g, "-") + "Z";
}

// The folder of a backup inside the bucket, without a trailing slash.
function backupFolder(stamp) {
  return `${BACKUP_ROOT}/${stamp}`;
}

// The `outputUriPrefix` the Firestore export is given.
function outputUriPrefix(bucket, stamp) {
  return `gs://${bucket}/${backupFolder(stamp)}`;
}

// The database resource name the admin API wants.
function databaseName(projectId) {
  return `projects/${projectId}/databases/(default)`;
}

// The stamps among bucket folder names such as "backups/2026-10-25T14-03-00Z/", oldest first. Any other
// name is ignored, so retention can never touch something that is not one of ours.
function backupStamps(prefixes) {
  const stamps = new Set();
  for (const p of Array.isArray(prefixes) ? prefixes : []) {
    if (typeof p !== "string" || !p.startsWith(`${BACKUP_ROOT}/`)) continue;
    const stamp = p.slice(BACKUP_ROOT.length + 1).replace(/\/+$/, "");
    if (STAMP_PATTERN.test(stamp)) stamps.add(stamp);
  }
  return [...stamps].sort();
}

// The stamps to delete so that only the newest `keep` remain (at least 1 is always kept).
function stampsToDelete(prefixes, keep = KEEP_BACKUPS) {
  const stamps = backupStamps(prefixes);
  const n = Math.max(1, Number.isInteger(keep) ? keep : KEEP_BACKUPS);
  return stamps.length > n ? stamps.slice(0, stamps.length - n) : [];
}

// Starts an export of the whole database (photos included) and then removes the backups beyond the newest
// `keep`. It does not wait for the export to finish: Firestore runs it as a long operation.
//   bucket:          the bucket name, already normalized; "" skips the run with an error result
//   projectId:       the Firebase project
//   now:             Date
//   exportDocuments: async ({name, outputUriPrefix, collectionIds}) => void, starts the export
//   listFolders:     async () => ["backups/<stamp>/", ...], the folders under `backups/` in the bucket
//   deleteFolder:    async (folder) => void, deletes everything under that folder (given without a trailing slash)
// A failed export throws and nothing is deleted. A failed delete is reported in `deleteErrors` and does not fail
// the run, since the new backup was already started.
async function runBackup({bucket, projectId, now, exportDocuments, listFolders, deleteFolder, keep = KEEP_BACKUPS}) {
  if (!bucket) return {error: "BACKUP_BUCKET is not set to a valid bucket name"};
  if (!projectId) return {error: "The project id is unknown"};
  const stamp = backupStamp(now);
  await exportDocuments({name: databaseName(projectId), outputUriPrefix: outputUriPrefix(bucket, stamp), collectionIds: []});
  const deleted = [];
  const deleteErrors = [];
  let existing = [];
  try {
    existing = await listFolders();
  } catch (err) {
    deleteErrors.push(`list: ${err.message}`);
  }
  for (const old of stampsToDelete([...existing, `${backupFolder(stamp)}/`], keep)) {
    try {
      await deleteFolder(backupFolder(old));
      deleted.push(old);
    } catch (err) {
      deleteErrors.push(`${old}: ${err.message}`);
    }
  }
  return {stamp, outputUriPrefix: outputUriPrefix(bucket, stamp), deleted, deleteErrors};
}

module.exports = {BACKUP_ROOT, KEEP_BACKUPS, normalizeBucketName, backupStamp, backupFolder, outputUriPrefix, databaseName, backupStamps, stampsToDelete, runBackup};
