# FreeForm bug log

Updated 2026-09-25. Scope: this repository. Features and future ideas are tracked in [TODO.md](TODO.md). Earlier reproductions and evidence below are retained even when a newer narrow check passes.

**Status rule:** a checked issue has a focused observed fix within the stated scope. An unchecked issue is still observed, has a code change awaiting browser proof, or needs a regression check. “Not reproduced after reload” does not identify the original cause. Old screenshots/fixtures do not prove a newer shell.

## Current status

| Area | Status | Evidence sample | Confidence / limit |
| --- | --- | --- | --- |
| Bold text | Editor/SVG/selected PNG/thumbnail pass | One synthetic regular/bold phrase showed heavier bold in the editor, downloaded selection PNG and saved text-only card after reload | Other fonts and larger boards need proof |
| Latest editor layout | Named states pass | 1280px prior check; 1016px selected-card, 720px toolbar, More, existing-shape reopen, action icons, compact card and tool-lock browser checks | Remaining mobile/theme combinations remain open |
| Dashboard hook crash | Fresh workflow matrix passes; cause unresolved | Zen create/open/search/select/rename/move/delete/restore/collection rename/reload transitions without recurrence; 20 board tests | Original failing hook/cause not identified |
| Dashboard actions/previews | Named flows pass | Rename, collection move/filter, no-match search, Trash/restore/open, text-only/shape/fallback preview; two-board bulk move, Copy link, collection-rename cancel, and 720px selected/menu layout | Larger library and multi-browser behavior unverified |
| Diagram insertion/retry | Fixed in focused proof | Actual tldraw fixture and local API; placement, bindings, early ack, retry, undo/page guards | No live model call; latest shell not covered by fixture |
| Custom colors | Fixed within supported types | Live picker/Text-tool flow, second client, reload; geometry Stroke/Background preset, custom, transparent, reload, SVG and PNG checks | Notes/frames/highlights/media and label colors remain outside the implementation |
| New diagram controls | Named flows pass | Connected-node browser insertion; one starter and personal-block save/reload/reinsert | Five starters have focused native-shape tests; browser proof is narrower than all templates/directions |
| Slides | Named flows pass | Reorder, undo, reload, fullscreen/Escape, rename cancel | No speaker notes, transitions or live audience sharing |
| Board files | Browser matrix passes | Native `.json`/`.tldr` new-room imports, two pages, embedded PNG, reload, page/selection PNG/SVG, opacity and draw-font SVG | Scale is fixed to 1; external linked media and other font families remain unverified |
| Excalidraw interchange | Bounded fixture passes | Three elements ready, one image skipped, imported board reload, parsed three-element/one-binding export | Unsupported elements/styles remain reported omissions, not full parity |
| Board deep links | Fixed in focused proof | Direct HTTP GET/HEAD board route now 200 HTML; disposable-board browser hard reload retained title/canvas/tools | Unknown API/MCP/assets/mutations stay 404 in the checked matrix |

## Issues and follow-ups

### B13 — Board deep-link refresh returns HTTP 404

- [x] **Serve the app shell for board routes and browser-verify a hard reload.**
- **Reproduce:** a direct GET for an existing `/board-…` route and for a disposable board route returned `404 Not found`, while `/` returned 200 on the local dev server. Zen showed a blank page on direct navigation.
- **Result:** the worker delegates single-segment GET/HEAD browser routes to its ASSETS binding. A direct board URL returned 200 HTML and a disposable Zen board survived a hard reload with title, canvas and tools visible. A logo request returned 200 SVG; unknown API/MCP paths, missing PNG and POST to a board returned 404. Browser proof (local evidence: deep-link-reload-zen.png).
- **Owner:** Sol/root.

### B01 — Bold Excalifont has no visible weight change

- [x] **Fix and visually verify within the Excalifont sample.**
- **Reproduce:** create regular Excalifont text, duplicate it, apply Bold, and compare the two at the same font size/zoom. Reload, then compare native SVG and PNG/thumbnail output.
- **Observed:** regular and bold font aliases resolved to the same `Excalifont-Regular.woff2`; the bold mark did not visibly increase weight.
- **Current state:** local alias/export loading is fixed. Browser before/after screenshots show a heavier bold span in the editor; an exported SVG retains the text-shadow workaround. A selected-shape PNG downloaded from a synthetic `Regular Bold` phrase shows the second word visibly heavier while retaining the Excalifont glyph family. The text-only dashboard thumbnail now shows both words with distinct weight after reload.
- **New evidence:** app-only `bold-render-app.png`, selected export `bold-export-selection.png`, and fixed card `text-preview-fixed.png` from the 2026-09-25 Helium run.
- **Required proof:** regular/bold comparison in the live editor and after reload, plus SVG and PNG/preview. Preserve glyph shape and other text styles.
- **Owner:** Sol/root. Font loading evidence only (local evidence: default-result.json).

### B14 — Text-only board thumbnail loses visible text

- [x] **Render a legible dashboard preview for a text-only board and verify after reload.**
- **Reproduce:** create a board with a single Large text shape reading `Regular Bold`, format only the second word Bold, return to the dashboard and hard reload.
- **Cause and fix:** tldraw produced a valid 255.5×81.16 PNG, but the storage validator rejected fractional dimensions and retained a stale 48×81 blank preview. Preview capture now waits for fonts before measuring, and storage accepts finite fractional dimensions within its size limits.
- **Proof:** 20 board tests and production build pass. A hard-reloaded Helium dashboard visibly shows the `Regular Bold` card thumbnail and the pre-existing geometry-heavy previews (local evidence: `text-preview-fixed.png`).
- **Owner:** Sol/root.

### B03 — Dashboard hook-order runtime crash

- [ ] **Identify the original cause or close with a reproducible regression test.**
- **Reproduce from the report:** load the dashboard during the board-card/preview update; a React hook-order error blocked rendering. The exact prior hook transition was not retained.
- **Current state:** all `BoardPreviewCard` hooks and `BoardDashboard` hooks are unconditional before returns. Fresh Zen reload, create/open/back, and dashboard rendering succeeded without recurrence.
- **Evidence:** Luna's integrated browser report and a further Zen matrix across create/open/search/select/rename/move/delete/restore/collection rename/reload transitions; 20 board tests and production build pass. The first inspection already contained the refactored hook structure, so no exact source-level cause is claimed. Current dashboard (local evidence: dashboard-regression-zen.png).
- **Required proof:** preserve the stack and state transition if this recurs. Recheck empty/populated/filtered/Trash transitions and preview arrival in a fresh session.
- **Owner:** Luna/root.

### B04 — Top controls/toolbar overlap at 1016px

- [x] **Verify the named 1016px selected-card and 720px toolbar layouts.**
- **Reproduce:** use a 1016px-wide viewport with the top Menu/dashboard/title/Page controls, toolbar, and contextual card visible.
- **Observed:** the earlier toolbar/header arrangement overlapped at this width.
- **Current state:** current browser checks show a selected rectangle card at 1016×924 with no overlap, and a 720×947 toolbar with Select/Hand/Draw/Arrow/Text/Rectangle/More reachable without covering the header. 1016px (local evidence: selected-rectangle-1016.png), 720px (local evidence: selected-rectangle-720.png).
- **Limit:** these are the checked widths/states, not every mobile size or toolbar/menu state. B05/B06/B08/B09 retain their separate visual/action requirements.
- **Owner:** Sol/root.

### B05 — Tool lock remains outside the toolbar pill

- [x] **Place and verify the lock inside the toolbar.**
- **Reproduce:** open the board and inspect the top tool-lock control beside the drawing toolbar.
- **Current state:** with Rectangle selected, the existing toolbar CSS contains the native lock in the pill at desktop and 720×947; the header stays clear. Clicking the lock changes its icon, and Q toggles it. At 720px, a drag with lock off returned to Select, while a drag with lock on kept Rectangle selected. App-only evidence: `tool-lock-desktop-app.jpg`, `tool-lock-720-app.jpg`.
- **Limit:** these are the checked widths and Rectangle tool state. DevTools logged a passive-event `preventDefault` error during simulated drags, though drawing and lock behavior remained usable; this needs separate triage.
- **Owner:** Sol/root.

### B06 — More chevron points the wrong way when closed

- [x] **Verify down when closed and up when open.**
- **Reproduce:** inspect More with its menu closed, open it, then close it again.
- **Result:** current disposable-board browser check opened and closed More; the closed chevron is down in the saved style screenshot and the menu dismissed normally. The open state was observed in the same interaction.
- **Proof:** style screenshot (local evidence: style-controls-app-only.png).
- **Owner:** Sol/root.

### B07 — Contextual card reopening was inconsistent

- [x] **Verify selecting an existing shape reopens it.**
- **Reproduce:** hide the style card, return to Select, then select an existing geo shape.
- **Result:** after deselecting and reselecting an existing rectangle on a disposable board, its compact style card reopened with the shape controls. The Rectangle-tool path remains separately verified (F03).
- **Proof:** style screenshot (local evidence: style-controls-app-only.png).
- **Owner:** Sol/root.

### B08 — Contextual card density, duplicate labels, and selection styling

- [x] **Verify the newest card compaction in dark mode.**
- [x] **Remove the extra Shape heading without removing the shape controls.**
- [x] **Compact the Shape controls to match the annotated reference at the checked desktop size.**
- **Reported problems:** redundant close X, duplicate Shape heading, excess vertical space, misaligned swatches, and overly large/unclear active color or size styling.
- **Reproduce:** inspect Rectangle and Text cards in light and dark modes; select a preset, a custom color, and a size.
- **Current state:** a disposable-board desktop pass showed the compact 4×3 palette, aligned Fill/Stroke/Size rows, no close X or duplicate Shape heading, and a retained Shape picker row. Light mode and narrower text-card combinations remain unverified.
- **Proof:** style screenshot (local evidence: style-controls-app-only.png).
- **Owner:** Sol/root.

### B09 — Final header/utility controls differ from the requested layout

- [ ] **Verify all final control placements and actions.**
- [x] **Match the annotated Duplicate/Delete icon buttons and verify both native actions and accessible names.**
- **Reported problems/requests:** remove editor FreeForm branding, Home text, graph icon, visible Commands/Copy/Shortcuts buttons; use Menu/grid/title/Page; show duplicate/delete as icons; keep Present beside bottom zoom.
- **Current state:** top controls at 1280px and Present's icon implementation have focused proof. In the latest disposable-board style pass, Duplicate added a second ellipse, Delete removed only that selected duplicate, and icon buttons retained accessible names. The complete final header arrangement remains unchecked.
- **Required proof:** current shell screenshot plus action checks. Preserve dashboard branding, keyboard palette access, and native presentation.
- **Owner:** Sol/root.

### B10 — Dashboard card metadata styling and narrow layout need final checks

- [x] **Verify grey metadata patches are removed.**
- [x] **Verify dashboard layout at desktop and 720px.**
- **Reproduce:** open the dashboard with a real preview, a fallback card, collections, and card menus.
- **Current state:** desktop proof covers full-height sidebar, sidebar logo, content-header search, Select icon, bottom-right ellipsis, the 22px fallback, and real previews without grey metadata patches. At 720px, collections wrap into a compact top strip, search/count/Select fit, and two cards remain visible without overlap. The card menu originally opened above the card and over the heading/search; it now anchors to the ellipsis, opens below at 720×947/desktop and flips above at 720×590. Clean 720px layout (local evidence: dashboard-card-clean-720.png), desktop cards with two synthetic previews (local evidence: dashboard-multiple-preview-wide.jpg), menu below (local evidence: dashboard-720-menu-fixed.png), short-height flip (local evidence: dashboard-720-short-menu.png). The current card CSS already uses transparent metadata surfaces, so no component change was needed.
- **Owner:** Luna/root.

### Acceptance gaps that are not established defects

- [x] Bulk Select/move, Copy link, and collection rename cancel with Escape passed on synthetic boards in Zen at desktop and 720px; two moved boards remain recoverable in Trash.
- [ ] Two populated room URLs need direct switching/reload isolation proof in the integrated app.
- [ ] General two-way draw/move/upload collaboration needs proof beyond the verified two-client custom-color path.
- [ ] All advertised shortcuts need focused checks. A sampled Board Files matrix now covers `.tldr` picker acceptance, two pages, an embedded PNG, page/selection PNG/SVG, opacity and draw-font SVG; external linked media and other fonts remain open.
- [ ] Blank-text click-away cleanup beyond the verified Escape path remains unverified.
- [ ] An edit followed by immediate dashboard navigation may leave the last thumbnail until the board is reopened; the capture is debounced. Confirm desired behavior before calling this a data-loss defect.

### B14 — Opening a board in Trash showed its raw ID as the editor title

- [x] **Restore before opening a trashed board and clear stale selection when entering Trash.**
- **Reproduce:** soft-delete a disposable titled board, open Trash, then activate its card. The editor previously resolved the missing active-board catalog entry to the raw `board-…` ID.
- **Result:** the card announces “Restore and open board …”, restores the board before navigation, and stays on Trash if restore fails. The titled editor opened, its collection association was preserved, and Trash count decreased in a Zen browser check. Entering Trash now exits bulk Select so no hidden selection persists when returning to All boards.
- **Proof:** three focused model tests and Trash browser screenshot (local evidence: dashboard-trash-zen.png). The original hook crash did not recur in this workflow; its source cause remains B03.
- **Owner:** Sol/root.

### B11 — Rectangle Size does not change its internal text size

- [x] **Verify the requested label-size behavior in a selected rectangle and after reload.**
- **Reproduce:** select a geo rectangle containing text and change Size in the contextual card; compare its internal text.
- **Observed:** the internal text size does not follow that control as the user expects.
- **Current state:** S→XL visibly enlarged the label inside a selected rectangle in a disposable board, and XL remained after reload. S (local evidence: geo-label-small-dark.png), XL (local evidence: geo-label-xl-dark.png). The control also increases the rectangle stroke as tldraw normally does.
- **Limit:** connected-rectangle binding preservation during this change was not independently browser-checked.
- **Owner:** Sol/Luna/root.

### B12 — Requested stroke, sloppiness, and edge controls are incomplete

- [x] **Provide and verify Stroke color separately from Background color for geometry shapes, including selected-state feedback.**
- [x] **Provide and verify independent stroke width in a selected rectangle.**
- [x] **Provide and verify Stroke style as its own control.**
- [ ] **Provide and verify the requested sloppiness behavior.**
- [x] **Provide and verify the rounded rectangle edge option, including SVG and reload.**
- [ ] **Verify switching a selected rounded rectangle back to sharp in the browser.**
- **Reproduce:** compare the current shape card with the user's latest reference and try to set each property independently.
- **Requested reference groups:** Stroke, Background, Stroke width, Stroke style, Sloppiness, and Edges. Stroke width must not substitute for the label-size behavior tracked in B11.
- **Current state:** a rounded-rectangle definition and Edges control are mounted; browser proof covers rounded SVG export and reload. A further disposable-board pass showed thin stroke visibly thinner, dashed/dotted stroke and selected-state feedback, Artist→Cartoonist sloppiness selection, rounded edge visibly rounded, opacity 100→50→100, and shape picker rectangle→ellipse. Independent geometry Stroke/Background controls kept blue stroke while coral→amber→custom green fill changed; transparent removed only the fill. Hard reload preserved both colors and the rounded edge; SVG contained both HEX values and selected PNG sampled the custom fill's RGB bytes. Patterned fill stayed selected when the background changed on an existing shape and a newly drawn shape, and remained selected after reload. Prior boards' linked custom fills retain their look when recolored. Sloppiness geometric difference was not independently measured while dotted stroke was active; other shape types and theme/mobile combinations remain open.
- **Required proof:** each selected option visibly changes supported shapes; selection/resize, persistence, and native export remain consistent.
- **Owner:** Sol/Luna/root.

## New feature browser proof (25 September)

- **Connected nodes:** the contextual four-direction Connect control added a native rectangle and bound arrow in a disposable board. Source: `client/features/diagrams/connectedNode.ts` and `connectedNodeControls.tsx`; panel (local evidence: connected-node-panel.png). Focused tests cover placement and binding; this log does not claim every direction was clicked in the browser.
- **Slides:** the panel previewed and reordered frames; undo and reload retained expected order, and fullscreen/Escape and rename cancel were checked. Source: `client/features/presentation/slideOrganizer.tsx`; panel (local evidence: slides-panel.png).
- **Board files:** native `.json` download/import created a separate board that survived reload; selected PNG and SVG downloads worked; invalid import did not mutate the source board. Source: `client/features/portability/BoardFiles.tsx`; export (local evidence: board-files-exported.png), import (local evidence: board-files-imported.png), invalid file (local evidence: board-files-invalid-import.png).
- **Board Files matrix:** a disposable `.tldr` import accepted a two-page native snapshot; page 1 rectangle and draw-font text and page 2 ellipse survived reload. An uploaded orange PNG exported as embedded `data:image/png`, imported into another room and survived reload with two pages, four shapes and one asset. Page and selection PNG/SVG downloaded; page PNG was opaque, selection PNG transparent, and page SVG embedded the draw font. Panel (local evidence: board-files-matrix-panel.png), second page (local evidence: board-files-matrix-import-page2.png), media after reload (local evidence: board-files-matrix-import-media-reload.png). External media URLs, other fonts and larger files were not exercised.
- **Excalidraw v2 interchange:** fixture preview reported three supported elements ready and one image skipped; creating the new board produced an editable rectangle, ellipse and bound arrow that survived reload. Export downloaded parseable `.excalidraw` JSON with three elements and one binding. Source: `client/features/portability/excalidraw/`; browser result (local evidence: excalidraw-import-export.png). This is a bounded adapter, not full-format fidelity.
- **Diagram library:** a starter inserted editable native shapes; saving a selection as a personal block, reload, and reinsertion worked. Source: `client/features/diagrams/library/`; reinserted block (local evidence: diagram-library-reinsert.png). Personal blocks live in browser-local storage.
- **Compact palette and edges:** the 4×3-plus-rainbow palette and rounded rectangle were browser-checked, including rounded SVG and reload. Rounded after reload (local evidence: rounded-palette-reload-zen.png). Bold weight has an editor/SVG workaround with PNG/thumbnail proof pending (B01); rectangle label Size is now browser-verified (B11).
- **Selected style actions:** on a disposable board, reopening a selected rectangle, thin/dashed/dotted stroke, rounded edge, shape picker, opacity, Duplicate/Delete icons, Text S→XL, bold after Escape, and More dismissal passed browser checks. A contextual AX mismatch after rectangle→ellipse was fixed: Connect buttons now say “Add connected node [direction]” instead of “rectangle”. App-only screenshot (local evidence: style-controls-app-only.png).
- **Independent geometry color:** a compact Background palette was added below Stroke. Preset, native custom picker, transparent, selected feedback, reload, SVG and PNG were checked on a disposable rounded rectangle. A focused review caught pattern fill being reset and legacy color swatches not reflecting visible fill; both were corrected. Patterned fill remained selected when changing an existing shape's background and when choosing the next rectangle's background, including after reload. The app-only selected-state screenshot is `independent-colors-app.jpg`; `custom-background-reload-app.jpg` shows the custom fill after reload. Additional pattern proof is `pattern-background-preserved.jpg` and `pattern-next-shape-full.jpg`. Ten focused color cases pass. Background choices apply to geometry shapes; arrow, draw and text backgrounds remain outside this slice.
- **Keyboard board search:** ArrowUp/Down now move the accessible active result and Enter selects/centers after the key event completes. A disposable Helium board also covered Clear, Escape and no-results; five focused search tests pass. App-only screenshot: `search-keyboard-active.jpg`.
- **Dashboard bulk and 720px:** Zen selected two synthetic boards, moved both to a test collection, copied a board link, and cancelled collection rename with Escape. The 720px selection controls stayed visible without overlap. App-only screenshot: `dashboard-bulk-720.jpg`. The test boards were moved to recoverable Trash.

## Fixed with focused evidence

### B02 — Opening Shortcuts blanked the canvas

- [x] **Native dialog route verified after the sizing fix.**
- **Old reproduction:** native Help → Keyboard shortcuts produced a white canvas; the accessibility tree contained a dialog, but Escape did not restore the view.
- **Diagnosis/fix:** modal body positioning exposed the absolutely positioned room wrapper's zero-height containing block. The wrapper is now fixed to the viewport; the custom override/button was also removed.
- **Result:** root opened native Help → Keyboard shortcuts, observed the dialog, and used Escape to restore the canvas. This verifies the native route still available from the menu.
- **Limit:** this is modal sizing proof, not an exhaustive keyboard-shortcut or narrow-layout check.

### F01 — Custom color unavailable before creating a shape

- [x] **Fixed for native geo, text, arrow, line, and draw.**
- **Old reproduction:** activate Text with no selection; the custom swatch was disabled.
- **Fix/result:** choose a HEX color, then create a supported shape; the session drawing default applies. A live Text-tool click/type produced the chosen computed color, another client received it, and a hard reload retained it.
- **Regression coverage:** tool-locked repeated rectangles; native preset clears the default; imports, duplicates, and remote shapes keep their own color.
- **Evidence:** default proof (local evidence: default-result.json). Created colors persist; the selected default itself is session-local.

### F02 — Custom color UI was a permanent HEX/Apply row

- [x] **Replaced by the final multicolor palette swatch.**
- **Old reproduction:** the style card always showed a separate HEX field and Apply action.
- **Result:** the final swatch opens a compact picker; chosen color/active state visible; Enter commits, Escape closes, invalid HEX does not mutate the board, native preset clears the override, undo restores it.
- **Evidence:** live picker proof (local evidence: swatch-result.json). The native input change path was exercised; the operating-system color dialog itself was not automated.

### F03 — Style card did not reopen when selecting Rectangle

- [x] **Rectangle-tool path verified.**
- **Reproduce/check:** close the style card, choose Rectangle, inspect the reopened card.
- **Result:** root IAB observed the card return.
- **Limit:** existing-shape selection is tracked separately as B07.

### F04 — Contextual card ignored tool/theme and hid Fill behind another popup

- [x] **Named contextual/theme/Fill paths verified.**
- **Checks:** activate Text in light mode; activate Rectangle in dark mode; inspect Fill choices.
- **Result:** root observed the relevant light/dark cards and all six Fill choices directly.
- **Limit:** final spacing, selection indicators, and removal of duplicate headings remain B08.

### F05 — Empty text remained after abandoning entry

- [x] **Escape cleanup verified.**
- **Check:** create an empty Text edit, type nothing, press Escape.
- **Result:** root observed native cleanup remove the empty text.
- **Limit:** click-away, whitespace-only input, and every editing exit path were not claimed as tested.

### F06 — Top Menu/dashboard/title/Page overlapped at desktop width

- [x] **1280px case verified.**
- **Result:** root IAB observed Menu/grid/title/Page without overlap.
- **Limit:** B04 now records named 1016px and 720px passes; other widths and later toolbar states still need their own checks.

### F07 — New diagrams covered existing board content

- [x] **Fixed in the native-editor placement fixture.**
- **Old reproduction:** insert a Mermaid/proposed diagram into a page containing a rectangle and text; source coordinates placed it over them.
- **Result:** insertion moves clear of existing bounds with an 80px gap and zooms to inserted content. Existing shapes and server proposal coordinates remain unchanged.
- **Regression:** retry preserves stable IDs, positions, bindings, and a camera subsequently moved by the user.
- **Evidence:** placement result (local evidence: result.json), screenshot (local evidence: clear-insertion.png).

### F08 — Proposal acknowledgement could race native canvas sync

- [x] **Fixed and interruption/retry verified.**
- **Old failure:** queue acknowledgement could finish before the corresponding shape records/bindings were durable.
- **Result:** early acknowledgement returns `409 awaiting_sync`; a competing claim returns 409; the browser retries within bounds. Stable shape IDs prevent duplicate insertion after an acknowledgement interruption.
- **Checks:** preview has no canvas mutation; accepted native shapes/bindings reload, undo/redo, attach to moved nodes; page guards and dismiss preserve the wrong/unchosen page.
- **Evidence:** proposal browser proof (local evidence: browser-result.json).

### F09 — Local board API failed with “Invalid URL: [object Request]”

- [x] **Fixed and verified through API/harness reads.**
- **Old reproduction:** GET the local board summary through the Durable Object router.
- **Cause/result:** request URL parsing treated a Request object as the URL; corrected handling permits bounded `read_board`.
- **Evidence:** MCP API smoke and both harnesses (local evidence: result.json); 10 checks, zero model calls.

### F10 — Font export/thumbnail capture fell back instead of using local Excalifont

- [x] **Local font resolution/export fixed.**
- **Old failure:** font-family/asset alias mismatches prevented the native exporter from consistently using the local draw font.
- **Result:** local draw-font references align; regular and styled text can export using the local WOFF2. Preview capture observed no external font request.
- **Evidence:** preview capture (local evidence: result.json), regular/bold export loading (local evidence: default-result.json).
- **Limit:** visible bold weight remains B01; loading the same regular file under a bold alias alone does not fix it.

### F11 — Preview captures duplicated or stale work could overwrite newer/blank state

- [x] **Debounce/lifecycle race fixed in the focused fixture.**
- **Checks:** six edits in one burst, blank board, undo, page switch, delayed old write, unmount.
- **Result:** one capture for the burst; blank clears; undo regenerates; old writes rejected; other room unaffected; unmount stops export and revokes object URLs.
- **Evidence:** two-room preview result (local evidence: result.json).
- **Limit:** an immediate route departure before debounce may intentionally retain an older thumbnail.

### F12 — Dashboard lacked the requested real/fallback preview and action flows

- [x] **Named desktop flows verified.**
- **Result:** Zen showed a real captured preview and small centered fallback; name search returned the no-match state; collection creation/filtering, per-card move, rename, confirmed Delete → Trash → Restore all worked.
- **Layout result:** wide desktop showed full-height sidebar, sidebar logo/name, content-header search, Select icon, and bottom-right ellipsis.
- **Evidence:** Luna's fresh-browser report; 15 board tests and build pass.
- **Limits:** B03 retains the original hook crash investigation; B10 and the acceptance gaps retain missing visual/action proof. A working search means board-name search only.

## Known limitations, not fixed bugs

- **Browser-local catalog:** board names, collections, recency, and Trash live in the browser origin. Room content lives separately in local server storage; clearing browser storage can remove catalog metadata without deleting the room.
- **Local thumbnails:** previews live in IndexedDB and are not shared across browsers/devices. Never-opened/blank boards use a fallback. Capture skips unsupported remote assets/fonts and retains the last usable image.
- **Custom colors:** supported native geo/arrow/text/draw/line shapes use synced metadata; notes/frames/highlights/media and independent geo/arrow label colors are not covered. Session drawing defaults reset on editor reload.
- **Mermaid:** bounded flowcharts only; no sequence grammar, subgraphs, styles, links, HTML/Markdown labels, or arbitrary renderer imports. Rounded syntax normalizes to a native rectangle.
- **Board files:** native JSON import creates a new room and accepts up to 25 MB; embedded image/video data is limited to 10 MB per asset. Linked media still requires its original URL if the SDK could not embed it. The named browser pass covered `.json`, selected PNG and SVG, not every page/selection and media combination.
- **Excalidraw:** version 2 import/export handles only supported basic shapes/text/straight connectors and reports skipped or approximated content. Frames, images, freehand, nested and curved/multi-point content are not transferred. The checked fixture included one skipped image.
- **Personal blocks:** saved blocks use browser-local storage and do not sync as library records to other browsers.
- **AI:** harness-as-client tool transport works; no direct model provider, model credential, in-app chat, or real-model acceptance run is included.
- **License CTA:** tldraw's existing license UI remains. A public production license/hosting decision is outside this local release.
- **Local persistence/cache:** host/container restart and local asset headers are proven on synthetic data; full backup restore and real edge-cache behavior are not.
- **Scope:** the 749 list ideas in the brief are far from feature parity. This bug log makes no hosting, publication, commit, or deployment claim.

## Evidence upkeep

- Keep the original report and reproduction when moving an issue from open to fixed.
- Mark only the checked viewport, input path, browser, and export format as verified.
- Update [TODO.md](TODO.md) when scope changes; do not silently turn a missing feature into a completed one or erase superseded requests.
