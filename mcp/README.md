# Local whiteboard tools

Start the app with `pnpm dev`. The default API origin is `http://localhost:5173`.
Set `WBOARD_URL` to a different **HTTP loopback origin** when necessary. Remote
hosts, redirects, URL credentials, and cross-origin browser requests are rejected.

The tools are `read_board`, `propose_diagram`, `propose_sql_erd`,
`propose_openapi_map`, and `list_proposals`.
Get the room ID from the board URL: `http://localhost:5173/my-board` means
`roomId: "my-board"`. The connected Codex or Pi session supplies the reasoning;
these tools make no model calls or require provider credentials. Board access
does require a separate FreeForm agent token.

## Agent access

Sign in to FreeForm, open **Agent access** on the dashboard, and create a token.
Copy it when shown: the full token is displayed only once. Store it in
`~/.auth/freeform-mcp-token` as a single line. Create the directory and file
with private permissions, for example:

```sh
umask 077
mkdir -p ~/.auth
${EDITOR:-vi} ~/.auth/freeform-mcp-token
chmod 600 ~/.auth/freeform-mcp-token
```

Paste the token in the editor, then save and close it. The MCP server reads this
file automatically. An explicitly set `WBOARD_TOKEN` environment variable takes
precedence over the file. Do not put a token in project files, MCP config,
command arguments, or shell history. The Pi client passes `WBOARD_TOKEN` to its
MCP child process; both Pi and Codex can use the private file instead.

To remove an agent's access, revoke that token under **Agent access**. Existing
MCP sessions will receive an authorization error on their next board request.
Replace a revoked token in the private file or environment with a newly issued
token. A browser login cookie does not grant access to MCP tools.

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
`wboard_read_board`, `wboard_propose_diagram`, `wboard_propose_sql_erd`,
`wboard_propose_openapi_map`, and `wboard_list_proposals`.

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

## Turn SQL schema into an ER diagram

Ask the agent to use `propose_sql_erd` with the board room ID and pasted SQL:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  total DECIMAL(10, 2)
);
```

This creates a **reviewable proposal** with one editable native rectangle per
table and a bound arrow for the foreign key. The tool never executes SQL, opens
a database, or changes the board before acceptance. It accepts up to 32 KiB
and 80 tables. Supported SQL is a bounded `CREATE TABLE` subset: common column
types, inline or table-level primary keys, inline `REFERENCES`, table-level
`FOREIGN KEY`, quoted identifiers, comments, and composite keys. Include the
referenced tables in the same input. `ALTER TABLE`, indexes, check constraints,
self-referencing keys, table options and non-table statements return an error
instead of silently producing an incomplete ER diagram.

## Turn OpenAPI JSON into an endpoint map

Ask the agent to use `propose_openapi_map` with the board room ID and a pasted
OpenAPI 3.x JSON document:

```json
{
  "openapi": "3.1.0",
  "info": { "title": "Shop API", "version": "1.0.0" },
  "paths": {
    "/orders": {
      "get": { "tags": ["Orders"], "summary": "List orders" },
      "post": { "tags": ["Orders"], "summary": "Create order" }
    }
  }
}
```

The proposal contains editable API, resource, and operation nodes connected
with bound arrows. Review it in the browser before adding it to the board.
This tool reads at most 1 MiB of JSON and makes no request to endpoints named
in the document. YAML, OpenAPI 2, unresolved path references, and maps that
would exceed 80 nodes or 120 arrows are rejected with an error. Body schemas,
authentication and callbacks are not represented in this endpoint map.

## Verification

```sh
pnpm exec tsx --test mcp/api.test.ts mcp/client.test.ts
pnpm test:mcp
pnpm exec tsx --test shared/sqlDiagram.test.ts
pnpm exec tsx --test client/features/diagrams/importers/openapi.test.ts
pnpm exec tsx --test worker/diagramProposals.test.ts
pnpm exec tsc -p mcp/tsconfig.json
```

The smoke test uses a synthetic room, checks actual SDK initialization and
tools, queues native, SQL ERD and OpenAPI proposals, confirms unchanged canvas
state, checks invalid input and cross-origin rejection, rejects premature
acknowledgement, then removes its proposals. It makes zero model calls.

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
