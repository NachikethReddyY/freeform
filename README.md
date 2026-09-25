# FreeForm

FreeForm is a personal whiteboard that runs on this computer. It uses tldraw, a local Cloudflare Workers runtime, SQLite-backed Durable Objects for board state, and a locally simulated R2 bucket for uploaded assets. No Cloudflare account, hosted database, or AI provider is needed for the whiteboard.

See [the feature checklist](./docs/FEATURE_CHECKLIST.md) for shipped capabilities, verification state, and the broader requested backlog.
See [feature provenance](./docs/FEATURE_PROVENANCE.md) for sibling-project references and source lineage.
See [the feature map](./docs/feature-map.md) for a source-backed comparison with the idea brief and Excalidraw.
See [the bug log](./bug.md) for the requested issue checklist and its observed verification state.
See [the screenshot progress report](./docs/PROGRESS.html) for a visual review of sampled browser results and open limits.

## Run with pnpm

Requirements: Node.js 24 and pnpm 12.5.1. From this directory:

```sh
pnpm install
pnpm dev
```

Open <http://localhost:5173>. Vite runs the UI and the Worker through the Cloudflare Vite plugin, bound to loopback. Local Cloudflare bindings are emulated with workerd/Miniflare; they do not connect to a Cloudflare account. `pnpm-lock.yaml` pins the resolved dependency graph; after the first install use `pnpm install --frozen-lockfile` to reproduce it.

On first run, create the local owner's password; returning sessions sign in before opening boards. The dashboard at `/` keeps board and collection metadata in the owner's SQLite-backed Durable Object, with a browser cache that retains the list when catalog sync is unavailable. It migrates the existing `my-local-room-id` without changing the room URL, reconciles older browser indexes, and registers rooms opened directly by URL. Create boards, rename them inline, search board names, organize them into collections, move them from card actions, or move several at once with Select. Delete moves a board into recoverable Trash; the room's canvas and uploaded media remain saved, and Restore returns it to the dashboard. A second browser can hydrate the catalog after signing in to the same local workspace; a conflict-aware sync preserves board IDs and Trash records. Room drawings live in separate local Durable Object SQLite storage, uploaded image/video objects in local R2 emulation, and preview thumbnails in browser IndexedDB. Personal diagram blocks remain browser-local. Keep `.wrangler/state` and, for thumbnails and personal blocks, the browser profile. Isolated catalog/restart persistence has been verified; restore has not been exercised against user data. Do not delete `.wrangler/state` as a troubleshooting step unless you intend to erase local boards, catalog metadata and uploads.

## Use FreeForm

- The drawing toolbar sits across the top; the contextual **Style** card controls stroke, independent geometry background color, fill, stroke width/style, size, opacity, layer order, and sharp or rounded rectangle edges. Select one rectangle to show four **Connect** arrows; each adds an editable rectangle with a bound arrow in that direction.
- Press **Cmd/Ctrl+K** to search native tools and actions. The palette also creates editable diagram nodes (including API, database, service, queue, function and cloud), connects a selected node in four directions, and arranges eligible selections horizontally, vertically or as a tree. The compact palette shows shortcuts supplied by tldraw. Edge-drag node pickers and obstacle-aware routing are not implemented.
- Open **Search board** at the top right to find text and shape, note, or arrow labels across every page; choosing a result switches pages, selects it, and centers the view.
- Open **Diagrams** for eight editable starters: flowchart, mind map, entity relationship, sequence, architecture, API stack, data model, and request flow. The technical-node controls add six editable native shapes, and a selection can be copied as bounded Mermaid flowchart text with an omission report. Save a selection as a personal block, or paste Mermaid flowchart, `CREATE TABLE` SQL, or OpenAPI 3.x JSON into **Import diagram code**. Preview the result before **Add to board** creates editable native shapes. Unsupported input shows an error instead of silently dropping parts. Mermaid text interchange is separate from native `.tldr` board export.
- Use **AI chat** at the lower right to choose Ollama on loopback or an OpenAI-compatible endpoint (loopback HTTP or public HTTPS), load or enter a model, and **Ask** or **Draw**. Draw shows a validated diagram preview; **Add to board** is a separate action. **Include current page in request** is off by default and sends a bounded summary only when selected. Endpoint and model settings stay in this browser tab's session storage; an API key stays in tab memory and is not saved in the board. A local mock-provider browser pass covered model loading, Ask, Draw, Add, and reload. Actual Ollama/LM Studio inference has not been verified.
- Pasting a recognized Mermaid flowchart, SQL schema, OpenAPI JSON, or short arrow chain on the canvas opens a diagram preview. Plain-text Markdown, fenced code, structured JSON and a safe HTTP URL open a reviewable card preview with Add/Cancel and the original source; accepted cards are editable native shapes. On-canvas Markdown uses readable headings and paragraphs with visible list markers, while inline emphasis is shown in the preview and preserved in source metadata. Ordinary text, rich/native tldraw content, and files/images retain their native paste path. Card detection is bounded to 8,000 characters and 240 lines; it does not fetch URLs or run pasted code.
- Use **Frame** (`F`) to make slides. Open **Slides** to preview, rename, jump to, and reorder frames. Select **Present** or press **Alt+Shift+P**; use arrow/Page keys to move and **Escape** to exit. Slide order lives in the board document. The stage expands frame content, supports light/dark backgrounds and a local presentation remote, and has a short fading laser trail. A light and a dark first slide have saved Helium screenshots; live laser and transition appearance still need direct visual proof.
- Open **Board files** in the top-right corner to download the whole board as native FreeForm/tldraw `.tldr`, import a native `.json` or `.tldr` board into a **new room**, download the current page or selection as PNG/SVG, or import a supported subset of `.excalidraw` version 2 diagrams. Excalidraw import shows converted/skipped counts before creating a new board. The Files panel has no Excalidraw export action. The native tldraw menu remains available for media upload and its own export actions.

Board files accept at most 25 MB of JSON and at most 10 MB per embedded media asset. Native JSON includes pages, shapes, bindings, and assets; external media links still need their original URL when the SDK cannot embed them. Excalidraw import supports basic shapes, text, straight connectors, and bindings, but skips frames, images, freehand, nested content, and curved or multi-point connectors. Some styles are approximated; inspect the import report before relying on a conversion. Details are in [Board files](./client/features/portability/README.md) and [Excalidraw interchange](./client/features/portability/excalidraw/README.md).

Useful commands:

```sh
pnpm build
pnpm install --frozen-lockfile
pnpm test:diagrams
pnpm test:boards
pnpm test:presentation
pnpm test:palette
pnpm exec tsx --test --test-force-exit client/features/diagrams/connectedNode.test.ts client/features/diagrams/library/library.test.ts client/features/portability/nativeBoard.test.ts client/features/portability/excalidraw/interchange.test.ts
```

## Optional Docker Compose

The direct pnpm workflow does not need Docker. To run the same development app in a container, start Docker Desktop or OrbStack, then run:

```sh
mkdir -p .wrangler/state
LOCAL_UID="$(id -u)" LOCAL_GID="$(id -g)" docker compose up --build
```

Open <http://127.0.0.1:5173>. Compose binds the port only on loopback. It mounts source for live reload, keeps installed dependencies in a Docker volume, and mounts `.wrangler/state` from this folder so board and asset data remains on the host. The image build uses BuildKit's pnpm store cache. Stop the container with `Ctrl-C` or `docker compose down`; both leave `.wrangler/state` intact. Do not run host and container servers at once with the same state folder. For an isolated container test, set `FREEFORM_PORT` and `FREEFORM_STATE_DIR`, for example `FREEFORM_PORT=5175 FREEFORM_STATE_DIR=./.wrangler/docker-smoke`.

## Optional MCP tools

The local MCP server lets a connected Codex or Pi session read the current board and stage a native diagram, SQL ERD, or OpenAPI endpoint-map proposal for review. MCP tools do not call a model or require provider credentials; the connected assistant supplies the reasoning. These proposals do not edit the board until accepted in the browser. Start the app with `pnpm dev`, then follow the project setup and verification in [mcp/README.md](./mcp/README.md). Run `pnpm test:mcp` for the local protocol smoke check. This MCP path is separate from the optional in-app AI chat.

## tldraw license

The loopback development setup needs no license key. A production deployment needs a valid tldraw license key. The hobby license is intended for non-commercial projects and requires the “made with tldraw” watermark; the SDK has no supported switch to hide it. See [tldraw's license key guidance](https://tldraw.dev/sdk-features/license-key) and [hobby license terms](https://tldraw.dev/get-a-license/hobby). FreeForm is configured for local development only; deployment is out of scope.

The internal Worker name `wmul-local` and its Durable Object class/bucket namespace are intentionally retained so existing local `.wrangler/state` records continue to resolve. The npm package and user-facing app are named FreeForm.

After changing dependencies while using Compose, rebuild and recreate its dependency volume:

```sh
docker compose down -v
LOCAL_UID="$(id -u)" LOCAL_GID="$(id -g)" docker compose up --build
```

`-v` removes the Compose `node_modules` volume. The board data is a host folder mount and is not removed by that command. The container runs with your host user and group IDs so files under `.wrangler/state` stay writable by your account.

## Back up and restore local boards

Stop the pnpm dev server or run `docker compose down` before copying state, so SQLite files are not changing during the backup. This copies the local owner account/catalog, room Durable Objects, and R2 emulator data; the runtime cache can be rebuilt and is not part of the backup. Back up the browser profile separately if you also need thumbnails, personal blocks, or a still-pending local catalog change.

Create a compressed backup:

```sh
mkdir -p .local-backups
tar -czf ".local-backups/freeform-state-$(date +%Y%m%d-%H%M%S).tar.gz" -C .wrangler state
```

To restore, stop the server, keep the current state as a safety copy, then extract a chosen archive from the project root:

```sh
mkdir -p .wrangler
if [ -d .wrangler/state ]; then
  mv .wrangler/state ".wrangler/state.before-restore-$(date +%Y%m%d-%H%M%S)"
fi
tar -xzf .local-backups/freeform-state-YYYYMMDD-HHMMSS.tar.gz -C .wrangler
```

Replace the archive filename with the backup you want. Restart the server and sign in as the restored local owner. The server catalog should repopulate a fresh browser cache; directly opened room URLs retain their original IDs.

## Local limits

- This setup is for one person's computer. It has local owner password sign-in and session-protected board APIs, but is still intended for loopback use rather than internet deployment.
- The existing asset handler uses the Workers Cache API for repeated asset reads. Locally, that is a runtime cache simulation, not Cloudflare's global edge cache; cached entries may be rebuilt after a restart.
- Pasting a web URL may make the bookmark preview Worker fetch that URL. Excalifont is loaded from the installed package; the MCP tools make no model calls, and a connected assistant can use them to prepare a diagram proposal. AI chat requires a separately running model service or a configured compatible endpoint; real Ollama/LM Studio inference remains unverified.
- There is no single database for all FreeForm data. Board and collection metadata now sync to the local owner's SQLite-backed Durable Object, with browser `localStorage` as a fallback cache; personal blocks still use browser storage, room documents use other Durable Object SQLite stores, uploaded assets use local R2 emulation, and preview thumbnails use browser IndexedDB. A server-state backup captures saved catalog/room/assets, but not thumbnails, personal blocks, or an unsynced browser change.
- `wrangler.toml` contains only local bindings and no public route. Deployment has not been configured.
