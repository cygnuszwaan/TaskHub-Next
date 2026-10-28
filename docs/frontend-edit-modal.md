# Frontend: edit modals

The queued task's edit modal (`#editModal`, "Edit Task Details") and the completed task's form (`#completedEditModal`, "Edit Completed Task", opened from History). Task cards, the timer, adding, completing and Undo are in frontend-tasks.md; offline behaviour is in offline.md and offline-edits.md.

## Layout

- Both modals scroll inside themselves (`max-height: 90vh`, `overscroll-behavior: contain`) and lock the page behind them (`body.modal-open`) while open.
- The top level holds, in order: the title (an input in the queued modal, read-only text in the completed form), a read-only job number line ("Job number 123", `jobNumberText`, hidden for a task with none), Description, Tags, the Project select, the contact buttons row and the Navigate row.
- Below it are three collapsible sections, one style for both modals (`details.form-section`, a `summary` with a ▸ that turns when open). `closeFormSections` closes every section of a modal each time it opens; only the completed form opens any itself, and only while the saved copy is on screen or the entry is an unsent completion: `completedSectionsToOpen` opens each section that holds a control still enabled (`COMPLETED_CONTROL_SECTIONS` names the section of each control; offline that is all three).

| Section | Queued modal | Completed form |
|---|---|---|
| Scheduling (`#editScheduling`, `#ceScheduling`) | Task number with its Top button, Priority, Est. minutes, Due date with its Clear button, Repeats | Priority, Time spent (minutes), Completed date and time |
| Contact details (`#editContact`, `#ceContact`) | Phone, Email, Link, Location | the same |
| Audit trail (`#editAudit`, `#ceAudit`) | Travel (km), Materials, Photos, Comments | the same, Materials as a textarea, then the 📄 Download job sheet button (the queued modal has none) |

- Photos and Comments are added at once, not on Save. The queued modal then has the timer and Snooze row and Complete, Delete, Cancel and Save; the completed form has Delete, Reopen, Cancel and Save.
- A validation warning first opens the section holding the field at fault (`warnInSection`, which calls `openFormSection` and then `askAlert`): a bad material cost or travel distance opens Audit trail, a bad email or link Contact details. In the completed form `completedChanges` names that section in the `section` of its error (a bad time spent or completion date opens Scheduling) and Save and Reopen show it the same way.

## Fields

- Task number (`#editNumber`, with a Top button that types 1): sends `queueNumber` only when changed (`queueNumberChange`, clamped to the list length).
- Due date: its Clear button empties it; saving then stores an empty `dueDate`. Repeats (frequency, plus an interval when it repeats) is saved as `recurrence`, null for "Does not repeat".
- Project select and Order number field (disabled and emptied without a project; empty means unordered) are saved as `projectId` and `projectOrder`, but only once `getProjects` has answered, so a failed load never strips a task's project; a project the page does not know stays selectable as "Unknown project". Once `getProjects` has answered, the queued modal's select ends with "＋ New project…" (`NEW_PROJECT`), which shows a name field (`#editNewProject`) and keeps the Order number field enabled; Save then sends the name as `newProject` (an empty name is a warning alert, nothing is sent) and the server creates the project in the same commit as the edit (a 400 for an unusable or taken name saves nothing), the response's `projects` replacing the page's list.
- Description (`#editDescription`, `#ceDescription`, up to 2000 characters): saved as `description`, empty removes it.
- Travel (km) (`#editTravel`, `#ceTravel`): a number box, empty for none (`parseTravelText`, `travelBoxText`), sent as `travelKm`, null clearing it.
- Phone and Email (`#editPhone`, `#editEmail`, `#cePhone`, `#ceEmail`, one line each): `parseEmailText`, a bad email is a warning alert; sent as `phone` and `email`, an empty box removing it. An empty box inherits its client's: the placeholder then reads "From client: 021 555 1234" (`effectiveContact`, `contactPlaceholder`).
- Link (`#editUrl`, `#ceUrl`, one line, up to 500 characters): `parseUrlText`, a bad link is a warning alert (`INVALID_URL`); sent as `url`, an empty box removing it. An empty box inherits the project's link, else its client's: the placeholder then reads "From project: https://…" or "From client: https://…" (`effectiveUrl`, `urlPlaceholder`).
- Materials, queued modal: a checklist (a checkbox, an editable text, an optional Cost box (an amount with at most two decimals, `parseCostText`; empty for none) and a remove button per row, plus an add field with its own cost box; the add card's list works the same way), saved as `materials` (null when empty; a cost that is not an amount is an alert, `invalidMaterialCost`, and nothing is sent).
- The Snooze button saves the edits, then opens the snooze dialog. Beside it sits one timer button, "▶️ Start" or "⏸️ Pause", with the task's tracked time next to it (`formatElapsed`, "7:05" or "1:02:09", ticking every second while the timer runs and the modal is open).

## Contact buttons and Navigate

- Under the Project field both modals show a row of Call, Text and Email buttons (`#editContactActions`, `#ceContactActions`, `refreshContact`, `contactLinks`: links `tel:`, `sms:` and `mailto:` with the task's title and job number as the subject, `phoneHref`, `smsHref`, `emailHref`) for the task's effective phone and email (its own when typed, else those of its project's client, each decided on its own). A button shows only when there is a detail for it, the row is hidden when there is none, and it follows the typed boxes and the chosen project.
- When the project's client has `useWhatsApp`, one "💬 WhatsApp" button (a `https://wa.me/<number>` link opening in a new window, `whatsappHref`, `whatsappNumber`: digits only, a leading + or 00 taken as written, a leading 0 replaced by `WHATSAPP_COUNTRY_CODE` 64) replaces Call and Text, whichever of the task and the client the number came from (`effectiveContact`'s `whatsApp`).
- Below it, the Navigate row (`#editNavigateActions`, `#ceNavigateActions`, `refreshNavigateRow`) holds Navigate and a "🔗 Link" button (`#editLink`, `#ceLink`: a `target="_blank"` link, so it opens in the device's default browser, for the link in force: the typed box, else the project's, else its client's). Each shows only while it has something to open, the row is hidden when neither has, and it follows the typed boxes and the chosen project.

## Comments

- The Comments group (`#editComments`, `#editCommentText`, `#editCommentAdd`; code under "Comments panel" in the page, shared with the History form by prefix `edit` or `ce` through `COMMENT_PANELS`): the timeline oldest first (`commentTimeline`: time on the owner's clock, the text, a delete control each) above a box and an Add button.
- Like photos, a comment is added at once through `addComment`, not on Save, and the task list it returns replaces the page's (`setTasks`); delete asks first (`deleteCommentPrompt`) and calls `deleteComment`. The id is made by `newRequestId` and kept for the same text (`commentIdFor`, `pendingComment`), so a retry after a lost reply cannot add twice. Text still in the box when Save, Snooze or Complete is pressed is added first (`postComment`; if that fails the action stops and the modal stays open).
- With no connection, or behind changes already waiting, an added or deleted comment is held and shown at once, an added one marked "Waiting to send" (offline-edits.md). Saving the form or choosing a Snooze date with no connection holds the change for later (offline-edits.md); materials, the project, its order number and the task number need a connection.
