# Freeform tasks

## Diagram editing and selection proof — 2026-09-25

- [x] Test empty and whitespace-only standalone Text edits via click-away in the integrated editor; native cleanup removed both, with only the pre-existing text selected by Select All.
- [x] Test rectangle double-click text editing and selection in the integrated editor; its built-in label remained part of a single selected rectangle and the contextual card reopened.
- [x] Add a compact auto-layout action for selected native diagram nodes. The Flowchart browser pass showed wider branch clearance, native bound arrows and labels, a one-step undo, and persistence after reload; focused tests cover graph order, cycles, no-op and unavailable selections.
- [x] Make the Sequence starter read chronologically across Client, Service and Database lanes with three native bound lifelines and four bound message arrows. Browser insertion/reload passed; Arrange is hidden for its small-anchor authored layout, which the generic flow action would otherwise destroy.
- [x] Keep selected Arrange nodes clear of unrelated shapes, treat an unselected frame as a backdrop, and fit a long result beside the style panel. Focused tests cover collisions, frame containment and viewport fit; a Helium Arrange pass showed every selected node clear of the 256px panel with its native arrows still attached. Collision with an unrelated shape was not browser-tested.
- [ ] Measure Arrange on a large board. The code discovers arrows from selected node bindings and traverses the connected selection once; a large-board benchmark and browser interaction remain unverified.
- [ ] Re-evaluate captured screenshots and add representative proof to the final HTML; rerun focused checks, commit/push a checkpoint, and update the authorized Postplan report.

## Visual follow-up — 2026-09-25

- [x] Verify native tool-lock position and Q behavior on a lockable tool at desktop and 720px; current CSS places it inside the pill and browser proof passed for Rectangle.
- [x] Show geometry-only Background controls only when a geometry tool or geometry selection can use them; Arrow hides it and Rectangle shows it in Helium at 720px.
- [x] Review dashboard card metadata backgrounds, preview balance, and ellipsis position against the annotated screenshot; transparent metadata and lower-right menu passed desktop and 720px checks.
- [x] Verify heavier Excalifont bold in selected PNG and dashboard thumbnail without substituting another font family; text-only preview capture now waits for fonts and stores fractional dimensions. Browser proof passed after hard reload.
- [x] Save app-only proof screenshots, refresh the issue log and six-image HTML report, and publish Postplan v3 after the focused browser and build checks passed.
- [x] Commit and push the matching source checkpoint, then verify the remote head.

## Follow-up UX verification — 2026-09-25

- [x] Add keyboard navigation and an active result state to board-content search; ArrowUp/Down, Enter selection/centering, Escape, Clear and no-results passed on a disposable board. Five focused search tests pass.
- [x] Verify dashboard bulk Select → move, Copy link and collection rename cancel in Zen; a two-board move and 720px selected layout passed without source changes. Trash restore behavior remains covered by the prior matrix.
- [x] Provide compact independent Stroke and Background choices for geometry shapes; preset/custom/transparent states, reload, and SVG/PNG output passed on a disposable board. Pattern fill stayed selected on an existing shape and a future drawn shape after choosing a background, and remained after reload. Ten focused color cases pass. Other shape types and mobile/theme combinations remain open.
- [x] Rerun focused checks, update the issue log and five-screenshot HTML report, and publish the authorized GitHub/Postplan checkpoints. The 36-case combined suite, board/diagram/slide/palette suites, MCP smoke and production build pass; Postplan v2 rendered with the new evidence.

## Diagramming and editor UX expansion — 2026-09-24

- [x] Review the idea brief, existing Excalidraw source, installed tldraw SDK, and license boundaries; publish an honest feature map.
- [ ] Finish compact editor chrome and style controls; 720px toolbar, 1016px selected card, compact color picker, rounded rectangle SVG/reload, S→XL rectangle label growth and independent geometry Stroke/Background color have browser proof. A selected-shape pass covers width, dash, sloppiness selection, rounded edge, picker, opacity, icon actions, text size, bold, More and panel reopening. Excalifont bold PNG/thumbnail output passed; some mobile/theme combinations remain open.
- [x] Add four-direction connected-node creation with native bound arrows; focused tests cover the directions and a disposable-board browser check proves insertion.
- [x] Add an explicit slide organizer with native frame order; browser proof covers reorder, undo, reload, fullscreen/Escape, and rename cancel.
- [x] Add native JSON export/import into a new room; browser proof covers `.json` download, new-board import/reload, and invalid import without source mutation.
- [x] Verify `.tldr` picker acceptance and multi-page/embedded-asset native round trips in the browser; a two-page text/shape board and embedded PNG survived new-room imports and reload.
- [x] Add image download; selected PNG and SVG export have disposable-board browser proof.
- [x] Verify current-page PNG/SVG and selection PNG/SVG combinations in the browser; page exports were opaque, selections transparent, and the page SVG embedded the draw font. The imported PNG remained after reload.
- [x] Add five editable diagram starters and personal blocks; browser proof covers starter insertion and save/reload/reinsert.
- [x] Add bounded `.excalidraw` v2 interchange with conversion/omission reports; browser proof covers fixture preview (three ready, one image skipped), new-board import/reload, and a parsed export with three elements and one binding. No Excalidraw source was copied.
- [x] Run the integrated build and focused feature suites: boards 19/19, diagrams 26/26, slides 14/14, palette 3/3, combined portability/style/search/routing 25/25, and MCP smoke 10 protocol checks. Dashboard/style browser reviews resolved the observed trashed-board title and contextual Connect-label regressions; remaining gaps are tracked below and in `bug.md`.
- [x] Capture and evaluate disposable-board/dashboard screenshots at desktop, 720px and a 390px report viewport; the latest HTML embeds six safe app/export screenshots.
- [x] Commit safe checkpoints, push the authorized GitHub remote, publish a sanitized HTML progress report with four embedded screenshots to Postplan, and verify both external destinations. The public report is https://tjs0vhq7es5c.postplan.dev.
- [x] Add compact board-content search across pages with result jump/focus; focused tests and a disposable two-page browser pass covered match/no-match, clear/Escape, cross-page selection and camera centering.
- [x] Resolve screenshot review findings: starter branch labels now clear connectors, slide thumbnails/active row are legible, and the 720px dashboard has clean browser proof.
- [x] Anchor dashboard card overflow menu to its ellipsis at 720px and desktop; clean browser screenshots cover normal and short-height placement.
- [x] Check dashboard create/open/search/select/rename/move/delete/restore/collection rename/reload transitions in Zen without the reported Hook crash; restore before opening a Trash card so its title and collection remain intact, and exit Select when entering Trash.
- [x] Fix board deep-link HTTP 404 on hard navigation/reload while preserving API, MCP, and asset routes; direct GET/HEAD return HTML 200, protected routes retain expected responses, and a disposable board survived a Zen hard reload.

## Excalidraw-style arrow curve — 2026-09-24

- [x] Add a control-point curve to native arrows while keeping native endpoint and binding behavior.
- [x] Render the curve and arrowhead in the editor and SVG export; preserve styles and labels.
- [x] Verify control-point dragging, reload persistence, and focused type/tests in the browser.

## Excalidraw style panel and straight arrowhead — 2026-09-24

- [x] Match straight arrowheads to the curved Excalidraw-style open head.
- [x] Add stroke width, stroke style, and sloppiness controls for lines and rectangles; arrow type for arrows.
- [x] Verify the new controls and both arrowheads on the live canvas, then run focused checks.
