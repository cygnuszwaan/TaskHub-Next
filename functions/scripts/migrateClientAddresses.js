/* eslint-disable max-len */
/* eslint-disable require-jsdoc */

// One-off: the Clients form no longer has an Address field (a client's location is its address). This gives every client that has a
// stored address and no location of its own that address as its location text, and removes the old `address` key from every client.
// A client that already has a location keeps it, and its removed address is listed so it can be kept by hand. Safe to run again.
//
//   cd functions
//   gcloud auth application-default login          (once, as an account that can edit the taskhub-next database)
//   npm run migrate-client-addresses                (dry run: prints the plan, writes nothing)
//   npm run migrate-client-addresses -- --apply     (does it)
//
// It only ever talks to the taskhub-next project.
const admin = require("firebase-admin");
const {planAddressMigration} = require("../addressMigration");

const PROJECT_ID = "taskhub-next";
const BATCH_SIZE = 400;

async function run({db, apply = false, log = console.log}) {
  const clients = (await db.collection("clients").get()).docs.map((d) => ({...d.data(), id: d.id}));
  const plan = planAddressMigration(clients);
  log(`Clients: ${clients.length}, with an address key: ${plan.changes.length}`);
  if (plan.changes.length === 0) {
    log("Nothing to migrate.");
    return {migrated: 0};
  }
  for (const c of plan.changes) log(`  ${c.name}: ${c.location ? `location becomes "${c.location.name}"` : c.address ? "keeps its own location" : "no address, key removed"}`);
  for (const c of plan.dropped) log(`  NOTE ${c.name} had its own location, so this address is dropped: ${c.address}`);
  if (!apply) {
    log("Dry run only. Add --apply to write.");
    return {migrated: 0};
  }
  for (let i = 0; i < plan.changes.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const c of plan.changes.slice(i, i + BATCH_SIZE)) {
      batch.update(db.collection("clients").doc(c.id), {address: admin.firestore.FieldValue.delete(), ...(c.location ? {location: c.location} : {})});
    }
    await batch.commit();
  }
  log(`Migrated ${plan.changes.length}. Run the dry run again to confirm nothing is left.`);
  return {migrated: plan.changes.length};
}

if (require.main === module) {
  admin.initializeApp({projectId: PROJECT_ID});
  console.log(`Project: ${PROJECT_ID}`);
  run({db: admin.firestore(), apply: process.argv.includes("--apply")}).catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

module.exports = {run};
