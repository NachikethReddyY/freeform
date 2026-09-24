# FreeForm feature checklist

This checklist combines the requested whiteboard changes with the wider product ideas from the project brief. A checked item has implementation evidence and a focused verification result. An unchecked item is not complete or still needs browser-level proof. “Future” items are ideas, not promises about scope or schedule.

The local whiteboard now includes bounded Mermaid and Excalidraw diagram interchange, connected-node creation, five editable starters, personal blocks, native board/image file actions, and frame-based presenting with an explicit slide organizer. These are focused slices of the broader ideas below, not complete parity with Excalidraw or the brief.

## Core whiteboard and local project

- [x] Serve the personal whiteboard locally without an account or hosted backend; the container returned its Vite page at loopback `:5174`.
- [x] Verify board records and uploaded PNGs persist in local SQLite-backed Durable Object and R2 emulation across a host dev-server restart. The integrated test room reloaded with its shapes and 16×16 PNG still visible.
- [x] Verify the same data survives Docker container restart; an isolated Compose room retained two canvas shapes and its 82-byte PNG on `.wrangler/docker-restart-smoke` at loopback `:5175`.
- [x] Pin the tldraw package family to a matching exact version and install Excalifont.
- [x] Run the development app in pnpm or optional Docker Compose, bound to loopback; keep `.wrangler/state` persistent.
- [x] Document local backup and restore steps; configure Docker's dependency volume and BuildKit package cache. Restore has not been exercised against user data.
- [x] Provide a local MCP server with `read_board`, `propose_diagram`, and `list_proposals`; its protocol/API smoke test passes 10 checks without model calls.
- [x] Add the local board dashboard, create, inline rename, name-only search, collections, per-card and bulk moves, and recoverable Trash. Browser proof covers create/open/back, search/select, collection creation/filtering/rename, card move, a two-board bulk move, Copy link, collection-rename cancel, delete to Trash, restore/open with the title intact, and hard reload without the reported Hook crash; 19 board tests pass. The original crash cause is not identified.
- [x] Store bounded board preview thumbnails in origin-local IndexedDB for opened boards; hook and model tests pass. Previews update in the integrated dashboard. Old or never-opened boards show the FreeForm icon until opened.
- [x] Implement and mount a keyboard-searchable command palette backed by tldraw's native tools/actions; three focused tests pass, and integrated browser testing confirmed Cmd/Ctrl+K, search, Enter selection, and native shortcut labels.
- [x] Verify the integrated palette opens from the button and keyboard, filters “Zoom to fit”, and runs it; the board camera changed to fit both synthetic frames.
- [ ] Verify two-client collaboration in the browser; drawing, uploaded asset, browser reload, host server restart, and isolated Compose container restart are proven.
- [x] Browser checks cover the updated 720px toolbar without header overlap, a 1016px selected-shape card without overlap, a compact 4×3-plus-rainbow color palette, and rounded rectangle SVG export/reload.
- [ ] Finish final editor chrome and typography proof across remaining states and widths. Rectangle label S→XL and reload passed; a selected-shape browser pass covered width, dash, rounded edge, shape picker, opacity, Duplicate/Delete icons, Text S→XL, bold and More. Independent geometry Stroke/Background preset, custom, transparent, hard-reload, SVG and PNG checks passed. Bold is heavier in editor/SVG with PNG/thumbnail proof pending. The dashboard passed 720px and card-menu checks; some theme/mobile states remain open.
- [ ] Verify every advertised keyboard shortcut and the final responsive layout in the browser.
- [x] Add the user-supplied FreeForm SVG logo and point the HTML favicon at it.
- [ ] Verify the logo and favicon visually in the integrated browser layout.

## Canvas tools and editing

- [ ] Make common drawing, selection, text, note, shape, arrow, eraser, pan, zoom, undo/redo, grouping, locking, alignment, and layer actions discoverable by shortcut.
- [ ] Add a shortcut reference and verify each advertised shortcut against the focused action.
- [ ] Add dedicated keyboard shortcuts for every common action; the palette currently displays shortcuts from the native registry where available.
- [x] Add compact board-content search for native text/geo/note/arrow labels across pages; browser proof covers no match, clear/Escape, ArrowUp/Down active results, Enter selecting/centering a result, and jumping to a match on another page. Results are capped at 100 visible items; five focused search tests pass.
- [ ] Add reusable styles, comments, and version history; the app already has native page navigation.
- [ ] Add a property inspector for selected shapes with color, font, size, fill, stroke, alignment, and position controls.
- [ ] Add sticky-note clustering, voting, timers, cursors/presence controls, workshop templates, and facilitation tools.
- [x] Parse a bounded Mermaid flowchart subset into validated diagram data; focused Mermaid, native-shape, and proposal unit tests pass (11 tests).
- [x] Fetch an uploaded PNG twice and verify identical bytes, ETag, and immutable cache headers; the local runtime reports a simulated cache hit, not edge-cache proof.
- [x] Import a bounded Mermaid flowchart in the user interface and verify it becomes editable native shapes.
- [x] Add contextual four-direction connected-node creation with native arrow bindings; a disposable-board browser check covers insertion and focused tests cover directions and placement.
- [x] Add five editable native starters: flowchart, mind map, ERD, sequence, and architecture. Focused tests cover all five; a browser check covers starter insertion.
- [ ] Extend the starters into dedicated mind/concept map, decision tree, org chart, journey, sitemap, process, UML, sequence, state-machine, ER/database, network/cloud/C4, BPMN, dependency/lineage, threat, circuit, logic, math, biology, and chemistry editors. Starters are layouts, not specialist semantics.

## AI, agents, tools, and MCP

- [x] Let a connected Codex or Pi assistant read bounded board summaries and stage a validated diagram proposal through local MCP tools.
- [x] Keep proposal queue state separate from the canvas document; MCP smoke verifies reads do not mutate canvas data and malformed/cross-origin/oversized requests are rejected.
- [x] Review and accept a queued diagram proposal in the FreeForm browser UI; its editable native shapes and arrow binding sync to the room.
- [ ] Verify reposition, retry, and dismiss controls for queued proposals.
- [ ] Add model/provider configuration, local-model support, prompt history, cost/context inspection, and safe tool permissions. No provider is configured now.
- [ ] Add AI-assisted sketch-to-diagram, natural-language-to-workflow, diagram-to-code, code-to-diagram, and screenshot-to-UI workflows.
- [ ] Add agent graph authoring, planning, delegation, memory/context views, tool-call traces, replay, evaluation, and debugging.
- [ ] Add visual MCP server/tool discovery and controls for connected agent harnesses.
- [ ] Build LLM/RAG/document/OCR/image/audio/data-processing pipelines, evaluation graphs, model routing, and fine-tuning workflows.

## Presentation and storyboard

- [x] Define top-level canvas frames as slides. Explicit order is stored on the page; frames without an order use top-to-bottom then left-to-right spatial fallback and stable ID tie-breaks.
- [x] Implement present/exit controls, `Alt+Shift+P` start, arrow/PageUp/PageDown navigation, fit-to-frame camera movement, and fullscreen request with unsupported/rejected-browser fallback.
- [x] Keep shape records unchanged, hide/restore selection, and restore camera and the prior read-only setting on exit or component disposal. Seven focused tests pass.
- [x] Verify frame ordering, navigation, present controls, and camera fit in the browser using a synthetic two-frame room.
- [x] Verify `Alt+Shift+P` starts presenting from the focused canvas, frame navigation and browser fullscreen work, and Escape exits fullscreen and restores the board in the integrated browser.
- [x] Add a compact Slides organizer with preview, jump, rename, and reorder. Browser proof covers reorder/undo/reload, fullscreen/Escape, and rename cancel.
- [ ] Add speaker notes, transitions, and collaborative presenting.

## Import, export, and publishing

- [x] Add native PNG/SVG export for the current page or selection; browser proof covers selected PNG and SVG downloads. The panel uses a background for page export and transparent selection export.
- [x] Verify page and selection PNG/SVG downloads, opaque page and transparent selection backgrounds, and SVG draw-font embedding on a disposable board. Scale remains fixed to 1; other media/font families are not covered by this sample.
- [x] Add native board JSON export and import into a separate room. Browser proof covers `.json` download, new-board import/reload, and invalid import without source mutation; focused tests cover pages, bindings, and an embedded image asset.
- [x] Verify `.tldr` picker acceptance, a two-page native round trip, and an embedded PNG asset in new rooms after reload. External linked media still needs its source URL when the SDK cannot embed it.
- [x] Add bounded Excalidraw v2 import/export for supported shapes, text, straight connectors, and bindings, with converted/skipped/approximated reporting. Browser fixture: three ready, one image skipped, new-board import/reload, parsed three-element/one-binding export.
- [ ] Export slide sequences as PDF and PPTX; support presenter notes and accessible text.
- [ ] Add remaining import formats and editable conversions where supported; native media upload, bounded Mermaid, native JSON, and a basic Excalidraw subset already exist. PDF and other structured diagram families are not implemented.
- [ ] Add print layouts, copy-as-image, and shareable presentation mode.
- [ ] Keep hosting and public deployment out of the current local-only scope.

## Library, templates, assets, and spatial workspace

- [x] Add five diagram starters and browser-local personal blocks saved from a selection; browser proof covers save/reload/reinsert, while focused tests cover bindings and all starters.
- [ ] Expand the small personal library with broader reusable icons, groups, templates, cross-browser sync, and an Excalidraw-compatible library format.
- [ ] Add moodboards, image/screenshot annotation, PDF research boards, creative asset boards, and video storyboards.
- [ ] Add file/document cards, bookmarks, project folders, tagging, and a spatial file organizer.
- [ ] Add lesson, workshop, retrospective, meeting, planning, research, and product-discovery templates. A small architecture starter exists in the Diagrams panel.
- [ ] Add reusable diagram components and design-system tokens, component maps, and typography/color libraries.

## Future product ideas from the brief

### Software, code, and development

- [ ] Codebase atlas: repository, file/import/function/type/call/dependency graphs; React component and route trees; coverage, test, ownership, dead-code, and circular-dependency maps.
- [ ] Visual Git/GitHub workspace: branches, commits, diffs, PR/issue relations, merge conflicts, release and contributor graphs, and review boards.
- [ ] API and database workbench: REST/GraphQL/OpenAPI maps, request testing, webhooks, auth flows, ERDs, schema editing, query plans, migrations, indexes, and data lineage.
- [ ] Spatial IDE/devbox: editable code, terminals, browser previews, databases, local processes, ports, Docker services, tests, logs, and docs arranged on one canvas.
- [ ] DevOps and cloud maps: CI/CD, Docker Compose, Kubernetes, Terraform, serverless, Cloudflare, AWS, Azure, GCP, environments, and deployments.
- [ ] Debugging and observability: stack traces, requests, traces, logs, metrics, incidents, root-cause timelines, service dependencies, health, and SLOs.
- [ ] Defensive security tools: threat models, trust boundaries, identity/permissions, IAM, network segmentation, vulnerabilities, SBOM, and remediation maps.

### Data, science, education, and research

- [ ] Analytics/data workspace: SQL, dashboards, metrics trees, funnels, cohorts, ETL, catalogs, and lineage.
- [ ] ML workspace: datasets, feature pipelines, experiment comparison, neural-network diagrams, training/evaluation, model lineage, and deployment.
- [ ] Research canvas: papers, citations, PDFs, annotations, claims/evidence provenance, hypotheses, experiments, and literature reviews.
- [ ] Teaching and simulation tools for algorithms, data structures, networking, operating systems, math, physics, circuits, biology, chemistry, and classroom collaboration.

### Planning, operations, and creative work

- [ ] Project/product planning: kanban, roadmaps, dependencies, sprints, milestones, capacity, feedback, opportunity trees, and decision logs.
- [ ] Business operations: process/SOP design, onboarding, approvals, CRM, sales, support escalation, service blueprints, responsibility maps, and supply chains.
- [ ] Personal knowledge/productivity: spatial notes, wiki, second brain, Zettelkasten, study plans, goals, habits, tasks, bookmarks, calendar, and timelines.
- [ ] UX and creation: wireframes, UI prototypes, design systems, accessibility reviews, responsive planning, writing/story maps, animation, and video production.
- [ ] Spatial planning: room/office/classroom/exhibition layouts, seating, warehouse/store plans, campus maps, travel itineraries, and event logistics.
- [ ] Hardware and homelab: circuits, IoT, robotics, network topology, server racks, storage, backups, containers, VMs, and live service health.
- [ ] Experiments and simulations: packets, queues, traffic, distributed systems, transactions, caching, algorithms, physics, logic gates, and cellular automata.
- [ ] Spatial interfaces for browsing, search, email, RSS, GitHub, Postman, cloud consoles, AI chats, terminals, and the developer workspace.
