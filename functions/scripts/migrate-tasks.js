/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// One-off: copy the tasks in app_state/todo_doc into the tasks/{id} collection. The old document is not touched.
//
//   node scripts/migrate-tasks.js            dry run: prints what would be written
//   node scripts/migrate-tasks.js --apply    writes the tasks
//   node scripts/migrate-tasks.js --apply --force   also when the tasks collection already has documents
//
// Needs Application Default Credentials for the taskhub-next project (gcloud auth application-default login).
const admin = require("firebase-admin");
const {COLLECTION, planMigration} = require("../store");

const PROJECT_ID = "taskhub-next";

async function main() {
  const apply = process.argv.includes("--apply");
  const force = process.argv.includes("--force");

  admin.initializeApp({projectId: PROJECT_ID});
  const db = admin.firestore();

  const oldSnap = await db.collection("app_state").doc("todo_doc").get();
  const oldTasks = oldSnap.exists ? oldSnap.data().tasks || [] : [];
  const existing = await db.collection(COLLECTION).listDocuments();

  const plan = planMigration(oldTasks, existing.map((d) => d.id), {force});
  if (plan.error) throw new Error(plan.error);

  console.log(`${plan.tasks.length} task(s) in app_state/todo_doc, ${existing.length} already in ${COLLECTION} (project ${PROJECT_ID}).`);
  if (!apply) {
    for (const t of plan.tasks) console.log(`  would write ${COLLECTION}/${t.id}  ${t.title}`);
    console.log("Dry run only. Re-run with --apply to write.");
    return;
  }

  // A batch holds at most 500 writes
  for (let i = 0; i < plan.tasks.length; i += 400) {
    const batch = db.batch();
    for (const t of plan.tasks.slice(i, i + 400)) batch.set(db.collection(COLLECTION).doc(t.id), t);
    await batch.commit();
  }
  console.log(`Wrote ${plan.tasks.length} task(s) to ${COLLECTION}.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
