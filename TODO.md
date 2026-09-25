# Freeform tasks

## Postplan partial-feature completion — 2026-09-25

- [x] Expose tldraw's existing Focus mode in Cmd/Ctrl+K and hide FreeForm's extra floating controls while it is active. Safari selected Focus mode, saw the editor and FreeForm chrome hide, then exited and saw board controls restored; the palette suite passes 9/9. AI panel draft retention across Focus mode was not separately tested.
- [x] Expose the SDK minimap from the board zoom controls. In Safari it was closed by default; the toggle opened a native overview of two frames, clicking the left frame moved the visible canvas from Slide 2 to Slide 1 and changed the camera URL, and Close removed the popup and returned the toggle to off. Larger boards and narrow viewports remain untested.
- [x] Add a compact current-page Layers panel without changing board records. Safari opened a four-row hierarchy, selected Slide 1 and centered its frame; three focused hierarchy/selection tests and the build pass. Nested selection, large boards and narrow layouts remain unverified.
- [x] Keep the presenter stage mounted across a same-owner auth focus recheck when a remote tab is opened. The editor and AI panel stay within the hidden/inert auth wrapper, and remote commands are ignored until recheck finishes. Safari confirmed the AI panel still opens and, in a clean two-tab pass, the remote connected, Next advanced both views to 2/2, and the presenter stage remained 2/2 on return. Auth tests pass 8/8, presentation tests 27/27 and the build passes; the pending-command guard has source review rather than direct browser proof. Touchpad/transition proof is tracked below.
- [x] Accept a copied safe HTTP URL as a reviewed native card when the clipboard supplies matching `text/plain` and `text/uri-list`, while leaving files, rich content and mismatched URLs with native paste. The focused regression failed before the fix; paste tests now pass 24/24. This clipboard variant has not been browser-tested.
- [x] Complete the selected-diagram Arrange choices with bounded Radial and Compact modes, preserving editable native nodes, bindings, labels, undo and a visible browser result. On a disposable five-node Safari flow, Cmd+K Radial and Compact moved native nodes, kept bound arrows attached, and fit them below the toolbar. Compact Yes/No captions initially crowded; the lane gap increased from 40 to 72 and a fresh visual pass showed separate labels. A failed-first camera-fit regression now passes when a no-op arrangement brings nodes back into view. The layout subset passes 17/17 and the broader diagram suite 57/57.
- [ ] AI chat and Draw: exercise a real local or configured provider, improve cancellation/errors, and verify reviewed native insertion. Mock-provider Ask/Draw/Add has browser proof; a focused regression preserves a newer unsent draft. Stop now aborts the upstream call and cancels its response body, including the post-headers race (13 gateway tests). Actual inference remains unverified.
- [ ] Editor and style: audit unverified theme/mobile/style combinations and fix concrete visible failures.
- [ ] Geist app chrome: audit menus, panels, and narrow layouts; correct remaining handwritten chrome.
- [ ] Slides and presentation: finish transition animation and remote touchpad proof. Presentation starts in a tab-filling stage with an explicit browser-fullscreen control. The auth focus recheck now preserves a same-owner mounted board while hidden and inert, then unmasks it after validation; invalid or different-owner sessions unmount it. In a clean two-tab Safari pass, the remote showed Connected, Next advanced to 2/2 and the returning presenter still showed slide 2/2. Auth tests pass 8/8, presentation tests 27/27 and the build passes. Touchpad movement and transition appearance remain unverified.
- [ ] Smart connectors: improve node-port creation/routing as supported by native bindings; verify label and movement behavior. Four bound directions work in the palette and one Safari direction accepts immediate typing; port dragging and obstacle routing are still absent.
- [x] Diagram mode and auto-layout: add useful directions and test undo, bindings, frames, and viewport fit. Horizontal/vertical/tree/radial/compact operate on eligible native selections; focused tests cover bindings, undo, frame backdrop, fit, cycles, shared-descendant rejection, and camera fit when geometry is unchanged. Safari exercised tree plus radial/compact on a five-node graph.
- [x] Custom technical nodes: make practical editable developer nodes/templates while retaining native records. Six editable native geo presets (API/database/service/queue/function/cloud) appear in Diagrams and Cmd/Ctrl+K, with focused tests. Typed fields and live integrations remain outside this slice.
- [x] Mermaid to/from canvas: provide bounded editable import and a separate canvas-to-Mermaid text export without changing native `.tldr` board export. Selected native nodes/bound arrows export parseable Mermaid with omission counts in focused tests; `.tldr` remains the full board file.
- [x] Universal paste: add safe JSON, Markdown, code, and URL handling while preserving native file/image/text paste. Bounded plain-text proposals require Add/Cancel, focused tests cover each kind and native preservation, and Safari inserted/reloaded a Markdown card. Code/JSON/URL browser passes remain open.
- [x] Command palette and keyboard-first diagrams: expose new diagram operations and check keyboard selection/creation. Create node/technical nodes, four Connect directions, and five Arrange modes have focused tests; Safari verified immediate Connect label typing and tree/radial/compact Arrange.
- [ ] URL cards and live architecture: a safe HTTP URL can become a reviewed native link card, but tailored GitHub/docs/YouTube presentation and localhost service/route status remain absent.
- [ ] AI chat with model selection: verify real provider/model path and distinguish local subscription limits from implemented behavior.
- [x] Local-first storage: implement the feasible owner catalog migration while preserving existing board IDs and Trash. The authenticated SQLite-backed catalog merges older browser indexes, hydrates new browser caches, and survived isolated Worker restart tests. Room data, assets, thumbnails and personal blocks remain split; a single all-data database is still open below.
- [x] Multiplayer: prove two-client drawing, moving, and upload persistence on an isolated local room. Two SDK/WebSocket clients exchanged create/move/delete and a PNG asset; authorization and restart persistence checks passed. Browser cursors and cross-device behavior remain unverified.
- [x] Reconcile the prior partial rows against source and direct evidence, update `bug.md`, feature map and screenshot HTML, run relevant checks/build, commit/push focused slices to `main`, and update/verify Postplan. Postplan v15 is live as version 12 with an exact raw-HTML match; checkpoint `428404d` reached `origin/main`. Newer AI cancellation, title-width, Radial/Compact and presentation follow-ups are separate local work and are not claimed pushed here.

## Partial-feature finish and blue interface — 2026-09-25

- [x] Fix imported arrow labels and verify connector attachment/readability in a visible browser after reload. Safari API stack → Arrange → move Service → hard reload kept three bindings attached and labels clear; a fresh Safari API-stack capture showed the shorter Query/Job captions and wider HTTP gap clear of strokes and arrowheads.
- [ ] Finish the reported presentation first-slide, theme, laser, remote and control-layout issues; verify in a visible browser. Helium captured light and dark first slides; Safari checked a nonblank first slide, Next/Previous, and a direct fading blue laser trail. Scoped remote navigation/toggle passed earlier; remote touchpad and transition appearance still need trustworthy visual proof.
- [x] Replace purple application chrome with blue in dashboard, authentication and presentation surfaces while preserving neutral canvas content. Safari visually checked account and dashboard blue; editor selection and presentation CSS use blue; color swatches remain drawing choices.
- [x] Audit the ideas sent in chat against implemented code and browser behavior; update the feature map and HTML with explicit implemented, partial and absent statuses. The 22-row chat inventory distinguishes bounded native flows from absent specialist features.
- [x] Review the tldraw license notice request against license terms; keep the app compliant and document the legitimate removal path. The SDK license forbids removing notices or tampering with enforcement; a valid license key is the supported route.
- [x] Run relevant focused checks, production build and browser visual review; capture app screenshots, update issue log/report, commit and push each completed slice to main, then publish and verify the authorized Postplan HTML. The starter/binding/palette checks passed 15/15, presentation checks 25/25, TypeScript and production build passed, and Safari checked the updated API-stack labels. The 12-image report reached Postplan v10 with public HTTP 200 and a byte-identical raw HTML hash. Fullscreen presentation appearance remains open above.

## Geist Sans Docker dependency repair — 2026-09-25

- [x] Reinstall locked dependencies into the existing Compose `node_modules` volume without touching board data. Both Geist Sans CSS files are present in the repaired volume.
- [x] Verify Geist Sans CSS exists in the container and FreeForm loads without the Vite CSS overlay on an isolated local port. Helium rendered the board at `127.0.0.1:5175`; the stylesheet returned HTTP 200. The missing presentation-relay import was resolved and the host production build now passes; a fresh container build was not rerun.

## Presentation and app chrome follow-up — 2026-09-25

- [ ] Present frame contents as isolated, borderless slides with expanded white space; animate navigation based on frame positions and add compact, hideable icon controls and a laser pointer.
- [ ] Fix first-slide blank state; add a dark slide theme, right-aligned controls, a small fading laser pointer, and a scoped same-origin presentation remote. Verify each in Safari.
- [x] Make the presentation dark theme seamless across the expanded slide, without darker frame-sized patches or exposed corners. An isolated Helium dark first-slide capture shows content and the expanded dark stage without a visible frame-sized patch.
- [x] Make the presenter remote connect across Safari and Helium windows. An isolated two-frame workspace showed Connected in Safari; Previous/Next and laser toggle changed the Helium presenter and remote, and ending presentation returned the remote to Waiting.
- [ ] Finish remote laser gestures and icon acceptance. Safari directly drew a short fading blue trail and the stage passed the slow-motion regression; remote touchpad movement and icon clarity still need a visible pass.
- [x] Add first-run local owner setup, password sign-in, sign-out, and session protection for board APIs. Isolated registration/login/dashboard/asset/socket checks passed; a Helium two-tab sign-out immediately gated the other open board. The live workspace remains unregistered so its owner chooses the password and claims existing boards.
- [x] Preserve the local MCP agent workflow under the account gate: create/revoke a scoped owner token, attach it in the MCP client, and prove unauthorized access is denied while authenticated proposals still require browser review. Isolated UI and MCP smoke checks passed.
- [x] Give the tldraw production-license notice enough width at the bottom right to remain readable, visible, and clickable without overlap. The final Helium footer crop shows the full notice clear of the help mark; the button remains in accessibility controls.
- [x] Add an independent stroke-width picker to the selected-shape style panel; make Size visibly change selected shape text while a separately chosen stroke width stays fixed. Safari checked this on selected rectangle and ellipse shapes and switched sharp/rounded rectangle edges. Other theme/mobile combinations remain open above.
- [ ] Add an icon-led slide organizer flow for creating, ordering, renaming, and starting framed slides while preserving board data and undo.
- [ ] Refine the dashboard layout from the supplied homepage reference: quick search/collections in the rail, clear start action and usable recent-board previews.
- [ ] Use Geist for application menus, panels, and dashboard chrome while retaining handwritten canvas text.
- [x] Remove Excalidraw export from Files while preserving native `.tldr` round trips, image export, and Excalidraw import. A native three-shape `.tldr` browser round trip passed; Files now documents native board export as primary.
- [x] Reject SQL constraints that the ERD importer cannot represent. The parser now reports unsupported referential actions, UNIQUE/CHECK/unsupported primary-key clauses and non-primary foreign targets instead of silently converting them; declared composite primary-key order is retained. Focused SQL tests pass 11/11. AI Stop also aborts upstream and cancels an in-progress response body in 13 gateway tests; live-provider Stop remains unverified.
- [ ] Browser-check presentation, dashboard, Files and connector labels in one Safari work tab at desktop and narrow width; do not use Zen. Update screenshots/report, run focused checks and build, then commit, push and publish the authorized HTML report.

## Ideas brief: agent and development workflows — 2026-09-25

- [x] Append the smart diagramming and developer canvas priorities as section 45 of the sibling `docs/ideas.md`, keeping the original 44-theme brief intact. Updated locally outside this Git repository; no commit is claimed.
- [x] Map the sibling `docs/ideas.md` to delivered, partial, and selected next features in `docs/feature-map.md`, with explicit evidence limits; the 749 ideas are not claimed complete.
- [x] Add in-app AI chat with Ollama loopback/OpenAI-compatible endpoint and model choice; validated Draw results require preview and explicit Add. Endpoint/model settings are tab-session data and API keys stay in tab memory, outside board records and Git. A local mock-provider browser pass covered Load models, Ask, Draw, Add of three native shapes, and reload; real Ollama/LM Studio inference remains unverified.
- [x] Extend local MCP with SQL ERD and OpenAPI endpoint-map proposals, preserving browser review before board mutation. The smoke path makes zero model calls.
- [x] Add bounded SQL `CREATE TABLE` and OpenAPI 3.x JSON imports that preview editable native shapes and report unsupported input. Four recognized diagram paste previews passed a Safari browser check.
- [x] Add recognized Mermaid, SQL, OpenAPI and arrow-chain paste previews; ordinary text and native file/image paste retain their native route. Focused paste checks passed 9/9.
- [x] Verify the corrected **Download FreeForm board** `.tldr` action with a fresh browser export/import round trip. The menu had no Mermaid action; `Untitled board.tldr` downloaded with native MIME and three shape records, imported into a new room, and retained the three labeled shapes after hard navigation/reload. The earlier Mermaid download prototype was superseded and removed.
- [x] Fix imported diagram arrows that appear detached from their nodes or cross node labels; verify a corrected API-stack starter in Safari after node movement and reload. A fresh capture shows shorter Query/Job labels clear of strokes; broader SQL/OpenAPI cases remain unverified. See B15 in `bug.md`.
- [x] Audit storage locations and document the current split: catalog/collections now sync to authenticated owner SQLite with a browser cache; personal blocks remain browser-local, rooms use separate Durable Object SQLite, assets R2 emulation, and thumbnails IndexedDB. Documented in README and feature map.
- [ ] Design and implement a single local database for room documents, assets, previews and personal blocks if that remains the product decision. The board/collection catalog now syncs to the owner Durable Object with a browser fallback, but the other stores remain split and the full migration has not been achieved.
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
