/* eslint-disable max-len */
/* eslint-disable require-jsdoc */

// One-off: a task's free-text `comments` field is now called `description`. This moves the stored text on every queued task, completed
// task and project template step to `description` and removes the old key. A document that already has a different description keeps it,
// and the old text is listed so it can be kept by hand. Safe to run again.
//
//   cd functions
//   gcloud auth application-default login          (once, as an account that can edit the taskhub-next database)
//   npm run migrate-comments-to-description         (dry run: prints the plan, writes nothing)
//   npm run migrate-comments-to-description -- --apply   (does it)
//
// It only ever talks to the taskhub-next project.
const admin = require("firebase-admin");
const {planDescriptionMigration} = require("../descriptionMigration");

const PROJECT_ID = "taskhub-next";
const BATCH_SIZE = 400;
const FIELDS = ["title", "name", "comments", "description", "steps"];

async function run({db, apply = false, log = console.log}) {
  const read = async (name) => (await db.collection(name).select(...FIELDS).get()).docs.map((d) => ({...d.data(), id: d.id}));
  const tasks = await read("tasks");
  const completed = await read("completed_tasks");
  const templates = await read("project_templates");
  const plan = planDescriptionMigration({tasks, completed, templates});
  log(`Queued tasks: ${tasks.length}, completed tasks: ${completed.length}, project templates: ${templates.length}, to change: ${plan.changes.length}`);
  if (plan.changes.length === 0) {
    log("Nothing to migrate.");
    return {migrated: 0};
  }
  const count = (collection) => plan.changes.filter((c) => c.collection === collection).length;
  log(`  tasks ${count("tasks")}, completed_tasks ${count("completed_tasks")}, project_templates ${count("project_templates")}`);
  for (const c of plan.changes.slice(0, 5)) log(`  ${c.collection}/${c.id}  ${c.label}`);
  if (plan.changes.length > 5) log("  ...");
  for (const d of plan.dropped) log(`  NOTE ${d.collection}/${d.id} (${d.label}) already had a description, so these comments are dropped: ${d.comments}`);
  if (!apply) {
    log("Dry run only. Add --apply to write.");
    return {migrated: 0};
  }
  let done = 0;
  for (let i = 0; i < plan.changes.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const c of plan.changes.slice(i, i + BATCH_SIZE)) {
      const remove = Object.fromEntries(c.remove.map((key) => [key, admin.firestore.FieldValue.delete()]));
      batch.update(db.collection(c.collection).doc(c.id), {...(c.set || {}), ...remove});
    }
    await batch.commit();
    done += Math.min(BATCH_SIZE, plan.changes.length - i);
    log(`Migrated ${done} of ${plan.changes.length}`);
  }
  log("Done. Run the dry run again to confirm nothing is left.");
  return {migrated: done};
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
