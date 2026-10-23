/* eslint-disable max-len */
/* eslint-disable require-jsdoc */

// Place and project names are typed by the owner; keep one to a single line before it goes into a prompt.
function oneLine(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

// The prompt that turns free text into new or changed tasks. Pure: no I/O.
//   tasks:    the stored task list (the model sees only the fields it may change, plus id, rank and project)
//   projects: [{id, name}], the stored projects; the model may only use these ids
//   input:    the text the owner typed
//   today:    the current local date, YYYY-MM-DD
function buildTaskPrompt({tasks, projects, input, today}) {
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
      You cannot create, rename or delete projects, or take a task out of one.
    `;
}

module.exports = {buildTaskPrompt};
