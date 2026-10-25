/* eslint-disable max-len */
/* eslint-disable require-jsdoc */

// One-off: gives a job number to every queued task and completed task that has none, oldest first, carrying on from the
// counter in `settings/jobCounter`. Safe to run again: anything already numbered is left alone.
//
//   cd functions
//   gcloud auth application-default login          (once, as an account that can edit the taskhub-next database)
//   npm run backfill-job-numbers                    (dry run: prints the plan, writes nothing)
//   npm run backfill-job-numbers -- --apply         (does it)
//
// It only ever talks to the taskhub-next project. The counter is moved forward first, in a transaction that fails if
// another number was issued since the plan was made (just run it again); the numbers are then written in batches.
const admin = require("firebase-admin");
const {planBackfill} = require("../backfill");

const PROJECT_ID = "taskhub-next";
const COUNTER_DOC = "settings/jobCounter";
const BATCH_SIZE = 400;
const FIELDS = ["addedAt", "completedAt", "order", "jobNumber", "title"];

async function run({db, apply = false, log = console.log}) {
  const read = async (name) => (await db.collection(name).select(...FIELDS).get()).docs.map((d) => ({...d.data(), id: d.id}));
  const counterSnap = await db.doc(COUNTER_DOC).get();
  const last = counterSnap.exists && Number.isSafeInteger(counterSnap.data().last) ? counterSnap.data().last : 0;
  const tasks = await read("tasks");
  const completed = await read("completed_tasks");
  const plan = planBackfill({tasks, completed, last});
  log(`Queued tasks: ${tasks.length}, completed tasks: ${completed.length}, already numbered: ${plan.alreadyNumbered}, counter: ${last}`);
  if (plan.error) throw new Error(plan.error);
  if (plan.assignments.length === 0) {
    log("Nothing to number.");
    return {numbered: 0};
  }
  const titles = new Map([...tasks.map((t) => [`tasks/${t.id}`, t.title]), ...completed.map((t) => [`completed_tasks/${t.id}`, t.title])]);
  const show = (a) => `  ${String(a.jobNumber).padStart(6)}  ${a.collection === "tasks" ? "queued   " : "completed"}  ${titles.get(`${a.collection}/${a.id}`) || ""}`;
  log(`Would number ${plan.assignments.length} (${plan.assignments[0].jobNumber} to ${plan.last}); the counter would become ${plan.last}. First and last:`);
  plan.assignments.slice(0, 5).forEach((a) => log(show(a)));
  if (plan.assignments.length > 10) log("  ...");
  plan.assignments.slice(-5).forEach((a) => log(show(a)));
  if (!apply) {
    log("Dry run only. Add --apply to write.");
    return {numbered: 0};
  }

  // Reserve the whole block first, so a task added meanwhile can never be given one of these numbers
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(db.doc(COUNTER_DOC));
    const now = snap.exists && Number.isSafeInteger(snap.data().last) ? snap.data().last : 0;
    if (now !== last) throw new Error(`The job counter moved from ${last} to ${now} while planning; run it again`);
    tx.set(db.doc(COUNTER_DOC), {last: plan.last});
  });
  log(`Counter set to ${plan.last}.`);
  let done = 0;
  for (let i = 0; i < plan.assignments.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const a of plan.assignments.slice(i, i + BATCH_SIZE)) batch.update(db.collection(a.collection).doc(a.id), {jobNumber: a.jobNumber});
    await batch.commit();
    done += Math.min(BATCH_SIZE, plan.assignments.length - i);
    log(`Numbered ${done} of ${plan.assignments.length}`);
  }
  log("Done. Run the dry run again to confirm nothing is left.");
  return {numbered: done};
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
