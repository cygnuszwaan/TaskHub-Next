# Frontend: page shell

The one-page app's shell: installable app and sharing, dark mode, service worker, API calls, sign-in, tabs and the page's own dialogs.

## PWA, manifest and sharing

- Frontend: one page, `public/index.html`, vanilla HTML/CSS/JS, no build step, installable as a standalone Android app (PWA): `public/manifest.webmanifest` (standalone, no `theme_color`, dark `background_color`, start `/`), `public/icons/` (192, 512, maskable 512 and the Apple touch icon, a white tick on blue) and `public/sw.js`, registered by the page. The manifest's `share_target` (GET to `/` with `title`, `text` and `url`; Hosting's rewrite serves the page, so the worker needs no route) makes TaskHub appear in Android's share sheet once the app is (re)installed: at load `captureShare` keeps `sharedText` (the text, else the title, plus the link unless the text holds it, one line, at most 2000 characters) in `sessionStorage` (`taskhub-share`, so a redirect sign-in keeps it) and cleans the address; after sign-in `applyPendingShare` opens the Queue tab and puts it in the add field for the owner to review, adding nothing.

## Dark mode

- The page follows the device's light or dark setting until the owner uses the Dark mode checkbox (an Appearance card under the settings card on the Settings page, outside the saved form): it applies at once and is kept in `localStorage` (`taskhub-theme`, "light" or "dark", per device, never sent to the server). A saved choice sets `data-theme` on `<html>` (an inline script in the head does it before the first paint; `applyTheme` handles the rest), which overrides the device query; with none saved the checkbox shows the device's state and follows it when it changes. Every colour is a CSS variable on `:root` with its dark value in two identical blocks, under `@media (prefers-color-scheme: dark)` for `:root:not([data-theme="light"])` and for `:root[data-theme="dark"]`; `color-scheme` lets the browser draw dark form controls, and two `theme-color` metas (`data-scheme` light and dark) colour the browser UI, their `media` rewritten by `applyTheme` to match a choice (Android paints an installed app's bottom navigation bar from the manifest, which cannot follow the device's scheme, so the manifest has a dark `background_color` and no `theme_color`: the navigation bar and install splash are dark in both modes and the status bar follows the metas). A new colour needs a variable with a dark value in both blocks; `darkmode.test.js` fails on a hex colour outside the variable blocks and on blocks that differ.

## Service worker

- The worker caches only the shell files in its `SHELL` list (`/index.html` and the manifest and two icons), same-origin GETs only, network first with the cache as the offline fallback; it never touches the functions, Firebase Auth's `/__/` pages or any other origin, so task data is never cached; it also shows push messages and handles taps on them (see Push notifications in infrastructure.md). Bump `CACHE` in `sw.js` when `SHELL` changes.

## Page code, API calls and escaping

- Calls the functions over HTTPS; the functions base URL, SDK URL, optional Web Push key, Places API key and Places region live in one `CONFIG` block at the top of the script. `apiFetch` throws the server's error text on any non-OK response, so a failed call never replaces the task list. All task-derived text goes through `esc()` before `innerHTML`; list and filter clicks use event delegation on `data-` attributes.

## Sign-in

- The page is gated behind Google sign-in (Firebase Auth, JS SDK 12.18.0 from gstatic via dynamic `import()`, web config from Hosting's `/__/firebase/init.json`); sign-in uses `signInWithPopup` and, when that fails with a code in `REDIRECT_SIGN_IN_CODES` (`needsRedirectSignIn`: popup blocked or unsupported here), `signInWithRedirect`, whose result `getRedirectResult` completes on the next load (a failure shows on the sign-in screen through `noteGate`); `apiFetch` adds the ID token to every call, and a 401 or 403 signs out and returns to the sign-in screen (the page has no Sign out button).

## Tabs

- A pinned header holds only four tabs at the top of the page, flush with its top edge (the body has no top margin, so the header looks the same scrolled or not; no title, no Sign out button), Queue, Materials (with the count of materials to get), History and Settings, sized to their text at 13px so they fit one row; each tab is a page and only one shows at a time (`showTab`, `normalizeTab`; Queue first, and an unknown name falls back to it; the tab ids are `queue`, `materials`, `history` and `settings`).

## Overlays and the Back button

- Every modal and dialog (`#editModal`, `#completedEditModal`, `#photoModal`, `#snoozeModal`, `#batchModal`, `#proposalModal`, `#confirmModal`) is a layer: it is shown with `showLayer(id, onBack)` and hidden with `hideLayer(id)`, never by setting its `display` or `body.modal-open` directly. `layerStack` (`createLayerStack`, in the page's pure-helpers block) keeps the list of open layers, locks the page (`body.modal-open`) while any is open and keeps the browser history one entry deeper per open layer, so Android's Back button or gesture takes an entry away instead of minimising the app. With no layer open Back leaves the app as usual.
- `onBack` is what Back does to that layer, the same close as its Cancel button (`closeEditModal`, `closeCompletedEditor`, `closePhotoViewer`, `closeSnoozeModal`, `closeBatchModal`, `closeProposalModal`; a question or alert answers as dismissed, `settleConfirm(false)`). Back reaches only the topmost layer, so a dialog over a form closes alone and the form keeps what was typed. A close that refuses (`closeProposalModal` while busy) leaves the layer open and the entry is put back.
- The history entries are anonymous counters, each with the state `{ taskhubLayers: depth }` (`layerStateOf`, `layerDepthOf`): the page's own entry has none. History changes are made one timer tick after the layers change (`layerHistoryStep`), so closing one overlay and opening another at once changes nothing, and a `popstate` that lands on the depth the page's own `history.go()` was heading for is not taken as Back (`layerPopStep`); a `go()` that has not landed after a second is given up. A forward entry with no layer open, or a reload that kept an old entry's state, is gone back over at once. Android hides the keyboard on the first Back before the page is told, so Back may take two presses while typing.

## Dialogs: questions

- Every "are you sure" question uses the page's own dialog, never the browser's `confirm()`: `askConfirm(text, {tone, confirmLabel})` (`#confirmModal`, a layer above every other modal, z-index 1100) resolves true on the confirm button and false on Cancel, a tap outside the card, Escape or a newer question. `confirmView` (pure) takes the first paragraph of the prompt text as the title and later paragraphs as detail (a paragraph starting with a bullet is shown as a list), so every prompt helper separates its question from its detail with a blank line. `tone` is `danger`, `warning`, `success`, `info`, `edit`, `save` or `error` and sets the icon and the confirm button's colour; `danger` and `warning` open with Cancel focused. The owner's text is set as text, never markup. The swipe handler awaits the answer while the card stays pulled aside.

## Dialogs: names

- Asking for a name (rename project, save as template, rename template) uses the same dialog with a text field, never the browser's `prompt()`: `askInput(text, {tone, confirmLabel, value, placeholder, maxLength})` resolves with the trimmed text (null on any way of cancelling), starts with the text selected, limits it to 100 characters unless told otherwise and keeps the confirm button off while the field is blank; Enter in the field confirms.

## Dialogs: messages

- Messages use the same dialog with one button, never the browser's `alert()`: `askAlert(text, {tone, confirmLabel})` resolves with nothing once dismissed (the button, a tap outside the card or Escape), has no Cancel and no text field and opens with its button focused; a value the owner must fix is a `warning` alert (a validation message), a failed call an `error` alert whose title is what failed and whose detail is the server's error text (`failureText(what, err)`). An alert never cancels another dialog: it waits until the one in front is closed, and several alerts show one after another (`alertQueue`, `pumpAlerts`); code that goes on to focus the field a message is about awaits it first.
