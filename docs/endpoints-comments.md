# Comments endpoints

Comments are timestamped entries on a queued task or a completed entry: a record of updates. Pure rules are in `functions/comments.js`; the endpoints are in `functions/index.js`.

- A comment is `{id, at, text}`. `id` is made by the page (8 to 64 letters, digits, `-` and `_`), `at` is the epoch milliseconds when it was written (never the timer's), `text` is one entry, trimmed and at most 2000 characters, line breaks kept. A task and its archive row hold them as `comments`, an array in the order written (a comment written earlier that arrives later is placed by `at`); the key is absent when there are none, and at most 200 are held. A comment is added or deleted, never edited. Only these endpoints change `comments`: `updateTaskDirect`, `updateCompletedTask`, the manual add form and the model never read or write it, and a `comments` value that is not a list reads as none.
- A task keeps its comments when completed (they go to the archive row) and when reopened (they come back). The next occurrence of a repeating task, a copy of a completed task and a project template step start with none. `undoRemove` restores the task with the comments the archive row holds at that moment, so ones added to the entry after the completion are kept.

| Endpoint | Behaviour | Index? |
|---|---|---|
| `addComment` | Body `{taskId \| archiveId, id, text, at?}`: exactly one of the two ids (a queued task or a completed entry). `at` goes through `resolveActionTime` (missing counts as now; clamped to now when ahead; 400 when more than 14 days old). A comment whose `id` is already there adds nothing and the reply says `duplicate: true`, so a send repeated after a lost reply is harmless. 400 with the reason for a bad id, blank text, an unusable time or a task already holding 200 comments; 404 for an unknown task or entry. Responds `{success, comments, serverTime}` (the item's comments as they now are), plus `tasks` (the list) for a queued task. A task's change is a transaction on the task list, an entry's a transaction on its archive row | No |
| `deleteComment` | Body `{taskId \| archiveId, id}`, `id` the comment's id. Removes it; when it is not there nothing changes and `removed` is false (a repeat is harmless, so this is 200, not 404). 404 for an unknown task or entry. Same reply as `addComment`, with `removed` instead of `duplicate` | No |

## Where comments show

- Job sheet: each entry's `comments` (`[{when, text}]`, oldest first, `when` on the owner's clock) are drawn under its description, headed COMMENTS.
- CSV export: the last column, "Comments", one line per comment as `2026-10-27 14:05 text` (owner's clock; the text's line breaks become spaces), empty for none. The JSON export carries `comments` as stored.
- Page: see `docs/frontend-tasks.md` (edit modal, card line) and `docs/frontend-history.md` (History form and entries).

## Moving older data

The release that added comments no longer reads a text `comments` as a description. Run `npm run migrate-comments-to-description` (see README) before deploying it: the first comment added to an item still holding an old text `comments` would replace it.
