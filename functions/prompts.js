/* eslint-disable max-len */
/* eslint-disable require-jsdoc */

// Place and project names are typed by the owner; keep one to a single line before it goes into a prompt.
function oneLine(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

// Added to the task prompt when the model may suggest a project. Worded conservatively: a wrong suggestion costs the owner a
// dialog, a missed one costs nothing.
const PROPOSAL_INSTRUCTIONS = `
      Project suggestion: if the whole input is ONE goal that takes at least three sequential stages (for example "renovate the
      bathroom" or "plan and run my daughter's birthday party"), also return projectProposal: a short project name and
      3 to 12 steps in the order they are done, each with a title, priority, estimatedMinutes and tags. This applies just as much
      when the input lists the stages itself ("strip the walls, tile, then paint"): those stages are the steps.
      When the input gives useful detail for a step (measurements, materials, grades, spacings, rules, warnings), also give that
      step a comments field: short plain-text lines, at most 2000 characters, kept to what the input says, with no citation markers
      such as [1, 2]. Leave comments out of a step the input says nothing specific about.
      Still return the tasks as you normally would, reading the input as a single task or as the tasks it names.
      Never suggest a project for a single errand, for a list of unrelated errands, for a repeating task, for a change to
      existing tasks, or when the input already names or uses one of the Existing Projects. Leave projectProposal out when it is
      not clearly one multi-stage goal.`;

// The prompt that turns free text into new or changed tasks. Pure: no I/O.
//   tasks:    the stored task list (the model sees only the fields it may change, plus id, rank and project)
//   projects: [{id, name}], the stored projects; the model may only use these ids
//   input:    the text the owner typed
//   today:    the current local date, YYYY-MM-DD
//   proposals: true to also let the model suggest a new project (see below); left out of the prompt otherwise
function buildTaskPrompt({tasks, projects, input, today, proposals = false}) {
  const visibleTasks = tasks.map(({id, title, priority, dueDate, estimatedMinutes, tags, recurrence, projectId, projectOrder, order}) => ({id, title, priority, dueDate, estimatedMinutes, tags, recurrence, projectId, projectOrder, order}));
  const visibleProjects = projects.map((p) => ({id: p.id, name: oneLine(p.name)}));

  return `
      You are an expert task queue organizer. Today's date is: ${today}.
      
      Current Task List (for context; do not return tasks you leave unchanged):
      ${JSON.stringify(visibleTasks, null, 2)}
      
      Existing Projects (the only projects a task can belong to):
      ${JSON.stringify(visibleProjects, null, 2)}
      
      New Input: "${input}"
      
      Parse the input into tasks, inferring priority, estimatedMinutes and tags.
      Return ONLY the tasks that are new or that the input changes.
      For a change to an existing task, return it with that task's id and its complete updated fields.
      For a new task, leave id empty.
      Set order to the rank (from 1) the task should hold in the full list.
      If the input says a task repeats (for example "every Monday", "monthly", "every 2 weeks"), set recurrence
      to the frequency and interval, and set dueDate to its first occurrence. Leave recurrence out for tasks that do not repeat
      and for existing tasks whose repetition the input does not mention. To stop an existing task repeating, return frequency NONE.
      If the input says a task belongs to one of the Existing Projects, set projectId to that project's id, copied exactly from the list.
      Never invent a project or an id: if the input names a project that is not listed, leave projectId out.
      If the input gives the task's place in the project's sequence (for example "first", "step 2"), set projectOrder to a whole number from 1; tasks that can be done in any order share a number.
      Leave projectId and projectOrder out for tasks the input does not place in a project, and for existing tasks whose project the input does not mention.
      You cannot create, rename or delete projects, or take a task out of one.${proposals ? PROPOSAL_INSTRUCTIONS : ""}
    `;
}

// The prompt that suggests tags for a task the owner entered by hand without any. Pure: no I/O.
//   title:     the task's title
//   knownTags: tags already used on the list, so the model reuses the owner's vocabulary
// The model sees only the title, never the task's comments or materials.
function buildTagPrompt({title, knownTags = []}) {
  const known = [...new Set(knownTags.map(oneLine).filter(Boolean))].slice(0, 50);
  return `
      You label to-do tasks with concise contextual tags such as Outdoor, Garden (for gardening), Indoor, Shopping, Mentally Focused, Physical.
      Tags already in use (prefer these when they fit): ${JSON.stringify(known)}
      
      Task title: "${oneLine(title)}"
      
      Return 1 to 3 tags for this task. Return ONLY the tags.
    `;
}

module.exports = {buildTaskPrompt, buildTagPrompt};
