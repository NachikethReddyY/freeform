# Freeform tasks

## Geist Sans Docker dependency repair — 2026-09-25

- [x] Reinstall locked dependencies into the existing Compose `node_modules` volume without touching board data. Both Geist Sans CSS files are present in the repaired volume.
- [x] Verify Geist Sans CSS exists in the container and FreeForm loads without the Vite CSS overlay on an isolated local port. Helium rendered the board at `127.0.0.1:5175`; the stylesheet returned HTTP 200. The missing presentation-relay import was resolved and the host production build now passes; a fresh container build was not rerun.

## Presentation and app chrome follow-up — 2026-09-25

- [ ] Present frame contents as isolated, borderless slides with expanded white space; animate navigation based on frame positions and add compact, hideable icon controls and a laser pointer.
- [ ] Fix first-slide blank state; add a dark slide theme, right-aligned controls, a small fading laser pointer, and a scoped same-origin presentation remote. Verify each in Safari.
- [ ] Make the presentation dark theme seamless across the expanded slide, without darker frame-sized patches or exposed corners.
- [x] Make the presenter remote connect across Safari and Helium windows. An isolated two-frame workspace showed Connected in Safari; Previous/Next and laser toggle changed the Helium presenter and remote, and ending presentation returned the remote to Waiting.
- [ ] Make a short laser trail visible during pointer movement and remote gestures; replace the harsh red active state and clarify the presentation and remote icons.
- [x] Add first-run local owner setup, password sign-in, sign-out, and session protection for board APIs. Isolated registration/login/dashboard/asset/socket checks passed; a Helium two-tab sign-out immediately gated the other open board. The live workspace remains unregistered so its owner chooses the password and claims existing boards.
- [x] Preserve the local MCP agent workflow under the account gate: create/revoke a scoped owner token, attach it in the MCP client, and prove unauthorized access is denied while authenticated proposals still require browser review. Isolated UI and MCP smoke checks passed.
- [x] Give the tldraw production-license notice enough width at the bottom right to remain readable, visible, and clickable without overlap. The final Helium footer crop shows the full notice clear of the help mark; the button remains in accessibility controls.
- [ ] Add an independent stroke-width picker to the selected-shape style panel; make Size visibly change selected shape text without also changing the stroke width. Verify on the supplied geo/circle case.
- [ ] Add an icon-led slide organizer flow for creating, ordering, renaming, and starting framed slides while preserving board data and undo.
- [ ] Refine the dashboard layout from the supplied homepage reference: quick search/collections in the rail, clear start action and usable recent-board previews.
- [ ] Use Geist for application menus, panels, and dashboard chrome while retaining handwritten canvas text.
- [ ] Remove Excalidraw export from Files while preserving native `.tldr` round trips, image export, and Excalidraw import; align current-feature docs.
- [ ] Reject SQL constraints that the ERD importer cannot represent; propagate AI Stop cancellation to the upstream provider.
- [ ] Browser-check presentation, dashboard, Files and connector labels in one Safari work tab at desktop and narrow width; do not use Zen. Update screenshots/report, run focused checks and build, then commit, push and publish the authorized HTML report.

## Ideas brief: agent and development workflows — 2026-09-25

- [x] Append the smart diagramming and developer canvas priorities as section 45 of the sibling `docs/ideas.md`, keeping the original 44-theme brief intact. Updated locally outside this Git repository; no commit is claimed.
- [x] Map the sibling `docs/ideas.md` to delivered, partial, and selected next features in `docs/feature-map.md`, with explicit evidence limits; the 749 ideas are not claimed complete.
- [x] Add in-app AI chat with Ollama loopback/OpenAI-compatible endpoint and model choice; validated Draw results require preview and explicit Add. Endpoint/model settings are tab-session data and API keys stay in tab memory, outside board records and Git. A local mock-provider browser pass covered Load models, Ask, Draw, Add of three native shapes, and reload; real Ollama/LM Studio inference remains unverified.
- [x] Extend local MCP with SQL ERD and OpenAPI endpoint-map proposals, preserving browser review before board mutation. The smoke path makes zero model calls.
- [x] Add bounded SQL `CREATE TABLE` and OpenAPI 3.x JSON imports that preview editable native shapes and report unsupported input. Four recognized diagram paste previews passed a Safari browser check.
- [x] Add recognized Mermaid, SQL, OpenAPI and arrow-chain paste previews; ordinary text and native file/image paste retain their native route. Focused paste checks passed 9/9.
- [x] Verify the corrected **Download FreeForm board** `.tldr` action with a fresh browser export/import round trip. The menu had no Mermaid action; `Untitled board.tldr` downloaded with native MIME and three shape records, imported into a new room, and retained the three labeled shapes after hard navigation/reload. The earlier Mermaid download prototype was superseded and removed.
- [ ] Fix imported diagram arrows that appear detached from their nodes or cross node labels; verify the corrected SQL/OpenAPI or pasted diagram in the browser after reload. See B15 in `bug.md`.
- [x] Audit storage locations: catalog and personal blocks in browser localStorage, rooms in Durable Object SQLite, assets in R2 emulation, thumbnails in browser IndexedDB. Document the split in README and feature map.
- [ ] Design and implement a central local database and migration, if that remains the product decision. It has not been achieved; existing boards must remain accessible.
- [ ] Verify each new user flow in the browser at desktop and a constrained viewport, capture evaluated screenshots, run focused tests and build, update `bug.md` and feature documentation.
- [x] Commit and push code checkpoint `7aad872` and report checkpoint `194e862`; update the authorized seven-image HTML report. A further 65 editor/import/paste/AI tests passed with Node's test-runner force-exit flag, bringing the focused check total to 174. Postplan v9 records that final result; remaining visual checks stay open above.

## Stroke and edge control proof — 2026-09-25

- [x] Verify Rounded → Sharp on a selected rectangle in the visible editor. Zen Page 6 showed the corners switch from rounded to square and the Sharp state selected; screenshots are saved locally.
- [x] Verify Solid Cartoonist has a visibly rougher outline and that the selected state and geometry persist after hard reload.
- [x] Resolve Sloppiness with Dashed/Dotted rectangle strokes: Cartoonist now changes the outline while preserving the dash pattern. The selected-state screenshot, dotted hard reload and native dotted SVG export passed.
- [x] Extend the same behavior to dashed/dotted native straight lines and preserve Sharp corners in the rough rectangle renderer. The visible line bends stayed selectable at two points after hard reload; the selected Sharp dotted rectangle and native SVG export retained square corners and the dot pattern. Focused stroke tests pass 10/10.
- [x] Update the issue log and eight-image HTML report, run focused checks, commit/push `f7aaad4`, then verify Postplan version 7. Public URL returned HTTP 200 and the raw HTML SHA-256 matched the 506,863-byte local file.

## Sequence move regression — 2026-09-25

- [x] Keep every invisible binding anchor in the inserted Sequence selection so dragging the diagram moves the anchors and visible nodes together. A focused movement assertion covers all 21 native shapes.
- [x] Hide the selected anchor indicators in the FreeForm geo renderer while preserving native binding, selection, and editing behavior. The live selected screenshot has no blue guide circles.
- [x] Verify a desktop drag and hard reload in Zen; the three lifelines stayed vertical and all four message endpoints remained attached. Saved selected, clean, and reloaded screenshots; the seven-image HTML rendered in Safari. Diagram tests pass 41/41 and the build passes.
- [x] Commit and push follow-up checkpoint `4d68dbd`; Postplan version 6 returned HTTP 200 and its raw HTML SHA-256 matched the local seven-image file.

## Faster connected-node labeling — 2026-09-25

- [x] Enter tldraw's native rich-text editing state after a contextual Connect action creates a bound node. Focused tests cover delayed editor mount, canceled editing, guards and one-step undo; the combined diagram suite passes 41/41.
- [x] Browser-check immediate focus and typing, Escape, native binding, room sync and hard reload. On a disposable Zen page, Connect right focused the new text field; typing `Review` needed no second click. The bound Idea → Review nodes survived reload and reached the room API. App-only proof: `.evidence/ui-review/connected-label-panel-app.jpg`.
- [x] Commit/push checkpoint `52d1d9a` and update the Postplan HTML with six saved screenshots. A seventh movement screenshot and follow-up checkpoint are tracked above.

## Sequence screenshot polish — 2026-09-25

- [x] Remove the visible circular binding anchors and dangling lifeline arrowheads while preserving native bindings. Keep the 11 invisible anchors in the initial selection for whole-diagram movement, and hide their indicators in the renderer. Focused diagram tests pass 41/41.
- [x] Verify the polished Sequence survives reload. A visible Zen page saved 21 native shapes to the room API and restored its three dashed lifelines and four messages after hard reload; app-only proof: `.evidence/ui-review/sequence-zen-reload-app.jpg`.
- [x] Commit/push checkpoint `52d1d9a` and update the Postplan HTML with the initial Sequence screenshot. The movement fix and seventh screenshot are tracked above.

## New-page save recovery — 2026-09-25

- [x] Verify visible-browser room sync: Zen saved a new page and its 21 Sequence shapes to the room API, then restored both after hard reload. Safari's automated tab was hidden with zero animation frames and left tldraw writes queued; F15 records this test limitation.
- [x] Harden hibernated WebSocket session recovery and replaced-socket cleanup; three focused socket tests and the build pass.

## Diagram editing and selection proof — 2026-09-25

- [x] Test empty and whitespace-only standalone Text edits via click-away in the integrated editor; native cleanup removed both, with only the pre-existing text selected by Select All.
- [x] Test rectangle double-click text editing and selection in the integrated editor; its built-in label remained part of a single selected rectangle and the contextual card reopened.
- [x] Add a compact auto-layout action for selected native diagram nodes. The Flowchart browser pass showed wider branch clearance, native bound arrows and labels, a one-step undo, and persistence after reload; focused tests cover graph order, cycles, no-op and unavailable selections.
- [x] Make the Sequence starter read chronologically across Client, Service and Database lanes with three native bound lifelines and four bound message arrows. Browser insertion/reload passed; Arrange is hidden for its small-anchor authored layout, which the generic flow action would otherwise destroy.
- [x] Keep selected Arrange nodes clear of unrelated shapes, treat an unselected frame as a backdrop, and fit a long result beside the style panel. Focused tests cover collisions, frame containment and viewport fit; a Helium Arrange pass showed every selected node clear of the 256px panel with its native arrows still attached. Collision with an unrelated shape was not browser-tested.
- [ ] Measure Arrange on a large board. The code discovers arrows from selected node bindings and traverses the connected selection once; a large-board benchmark and browser interaction remain unverified.
- [x] Re-evaluate captured screenshots and add representative proof to the final HTML; rerun focused checks, commit/push a checkpoint, and update the authorized Postplan report. Five embedded images passed Safari visual review; remote HTML matched the local file byte-for-byte at Postplan version 4, and GitHub main matched the pushed checkpoint.

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
