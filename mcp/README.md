# Local whiteboard tools

Start the app with `pnpm dev`. The default API origin is `http://localhost:5173`.
Set `WBOARD_URL` to a different **HTTP loopback origin** when necessary. Remote
hosts, redirects, URL credentials, and cross-origin browser requests are rejected.

The three tools are `read_board`, `propose_diagram`, and `list_proposals`.
Get the room ID from the board URL: `http://localhost:5173/my-board` means
`roomId: "my-board"`. Tools do not require provider credentials or make model
calls. The connected Codex or Pi session supplies the reasoning.

## Codex

From this project:

```sh
pnpm exec tsx mcp/codex.ts
```

The launcher supplies this project's MCP configuration to the installed Codex
CLI without editing global settings. In Codex, `/mcp` lists the connection.
Project `.codex/config.toml` also configures trusted interactive sessions.
The installed Codex 0.156.1 `mcp get` subcommand did not load the project file;
the launcher works for that command too:

```sh
pnpm exec tsx mcp/codex.ts mcp get wboard --json
```

## Pi

Pi 0.84.4 has no built-in MCP transport. The project extension at
`.pi/extensions/wboard.ts` connects to the same stdio server and exposes
`wboard_read_board`, `wboard_propose_diagram`, and `wboard_list_proposals`.

```sh
pi -e .pi/extensions/wboard.ts
```

The extension is also discovered automatically in a trusted project.
`/wboard-check my-board` checks tool discovery and board reading without calling
a model. Project extension loading follows Pi's normal project-trust settings.

## Ask the harness to draw

For example:

> Read my-board, then propose a browser → API → database diagram in empty space.

The harness queues a proposal and returns the board URL. Review it in the
browser, then accept or dismiss it. Existing shapes are never changed by these
tools. A proposal expires after 24 hours. There can be 20 queued proposals per
room, each with at most 80 nodes, 120 edges, and a 64 KiB request body.

## Verification

```sh
pnpm test:mcp
pnpm exec tsx --test worker/diagramProposals.test.ts
pnpm exec tsc -p mcp/tsconfig.json
```

The smoke test uses a synthetic room, checks actual SDK initialization and
tools, queues a diagram, confirms unchanged canvas state, checks invalid input
and cross-origin rejection, rejects premature acknowledgement, then removes
its proposal. It makes zero model calls.

## Browser API

All endpoints are rooted at `/api/rooms/:roomId` and return JSON with
`Cache-Control: no-store`.

| Request | Contract |
| --- | --- |
| `GET /board?limit=100&pageId=page:...` | Bounded pages and shape summaries; limit 1–200; `pageId` optional |
| `GET /proposals` | `{ proposals: DiagramProposal[] }` |
| `POST /proposals` | `{ diagram, pageId? }` → HTTP 201 `{ proposal }` |
| `DELETE /proposals/:id` | Dismiss an unclaimed proposal |
| `POST /proposals/:id/claim` | `{ claimId }` → `{ proposal, claimId }`; exclusive 60-second lease |
| `POST /proposals/:id/applied` | `{ claimId }` → `{ applied: true }`; HTTP 409 `code: "awaiting_sync"` until all native shapes and bindings reach the room |

The queue is stored separately from the room document. Apply accepted content
through the active editor, with stable IDs from `diagramShapeKey`, in one history
step. A failed or interrupted acceptance leaves a proposal retriable after its
lease expires. Do not acknowledge a proposal until shape creation succeeds.
The browser retries a pending save for up to six seconds. A later retry reuses
the proposal's stable IDs, so an interrupted acknowledgement does not duplicate
the insertion. Notes use native square sizing and grow to fit their text.

The browser also imports a bounded Mermaid flowchart subset: LR/RL/TD/TB/BT,
plain labels, rectangles, circles, diamonds, `-->` edges and `-->|label|` labels.
Rounded-node syntax is normalized to a native rectangle. Subgraphs, styling,
links, sequence diagrams and other Mermaid families are rejected explicitly.

References: installed MCP SDK 1.29.0 README and types, installed Pi 0.84.4
extension documentation, and [official Codex MCP documentation](https://developers.openai.com/codex/mcp).
