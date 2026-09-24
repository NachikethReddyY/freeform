import {
	DurableObjectSqliteSyncWrapper,
	type SessionStateSnapshot,
	SQLiteSyncStorage,
	TLSocketRoom,
} from '@tldraw/sync-core'
import {
	createTLSchema,
	GeoShapeGeoStyle,
	// defaultBindingSchemas,
	defaultShapeSchemas,
	TLRecord,
} from '@tldraw/tlschema'
import { DurableObject } from 'cloudflare:workers'
import { AutoRouter, error, IRequest } from 'itty-router'
import { PageIdSchema } from '../shared/diagram'
import { DiagramProposalQueue, DiagramRequestError, diagramErrorResponse } from './diagramProposals'

// add custom shapes and bindings here if needed:
// The client registers this custom geo through GeoShapeUtil.configure; the sync schema needs the same value.
GeoShapeGeoStyle.addValues('freeform-rounded-rectangle' as Parameters<typeof GeoShapeGeoStyle.addValues>[0])
const schema = createTLSchema({
	shapes: { ...defaultShapeSchemas },
	// bindings: { ...defaultBindingSchemas },
})

interface SocketAttachment {
	sessionId: string
	snapshot: SessionStateSnapshot | null
}

function getAttachment(ws: WebSocket): SocketAttachment | null {
	const attachment = ws.deserializeAttachment() as SocketAttachment | null
	return attachment?.sessionId ? attachment : null
}

function extractRecordText(value: unknown, depth = 0): string {
	if (!value || typeof value !== 'object' || depth > 12) return ''
	if (Array.isArray(value)) return value.slice(0, 200).map((item) => extractRecordText(item, depth + 1)).join(' ').slice(0, 1000)
	const record = value as Record<string, unknown>
	if (typeof record.text === 'string') return record.text.slice(0, 1000)
	return extractRecordText(record.richText ?? record.content, depth + 1)
}

// Each whiteboard room is hosted in a Durable Object with WebSocket Hibernation.
// https://developers.cloudflare.com/durable-objects/
//
// There's only ever one durable object instance per room. Room state is
// persisted automatically to SQLite via ctx.storage. When all clients are
// idle, the DO hibernates (freeing memory) while WebSocket connections
// stay alive at the Cloudflare layer.
export class TldrawDurableObject extends DurableObject {
	private room: TLSocketRoom<TLRecord, void> | null = null
	/** Map sessionId → ws so onSessionSnapshot can serialize to the right socket. */
	private readonly sessionIdToWs = new Map<string, WebSocket>()

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		// Respond to ping messages at the platform level without waking the DO.
		// The TLSyncClient sends {"type":"ping"} every 5s; without this, each
		// ping would wake the DO from hibernation.
		this.ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}')
		)
	}

	private getOrCreateRoom(): TLSocketRoom<TLRecord, void> {
		if (!this.room) {
			const sql = new DurableObjectSqliteSyncWrapper(this.ctx.storage)
			const storage = new SQLiteSyncStorage<TLRecord>({ sql })

			this.room = new TLSocketRoom<TLRecord, void>({
				schema,
				storage,
				// Disable idle timeout since Cloudflare handles keep-alive via auto-response.
				// Without this, sessions would be pruned after 20s of no "real" messages
				// even though the client is still connected and being auto-ponged.
				clientTimeout: Infinity,
				onSessionSnapshot: (sessionId, snapshot) => {
					const ws = this.sessionIdToWs.get(sessionId)
					if (ws) ws.serializeAttachment({ sessionId, snapshot })
				},
			})

			// Resume any sessions that survived hibernation
			for (const ws of this.ctx.getWebSockets()) {
				const attachment = getAttachment(ws)
				if (!attachment?.snapshot) continue
				this.room.handleSocketResume({
					sessionId: attachment.sessionId,
					socket: ws,
					snapshot: attachment.snapshot,
				})
			}
		}
		return this.room
	}

	private readonly router = AutoRouter({ catch: (e) => error(e) })
		.get('/api/connect/:roomId', (request) => this.handleConnect(request))
		.get('/api/rooms/:roomId/board', (request) => this.readBoard(request))
		.all('/api/rooms/:roomId/proposals', (request) => this.proposals().handle(request))
		.all('/api/rooms/:roomId/proposals/:id', (request) => this.proposals().handle(request, request.params.id))
		.all('/api/rooms/:roomId/proposals/:id/:action', (request) => this.proposals().handle(request, request.params.id, request.params.action))

	private proposals(): DiagramProposalQueue {
		return new DiagramProposalQueue(this.ctx.storage, () => this.getOrCreateRoom().getCurrentSnapshot().documents.map(({ state }) => state))
	}

	private readBoard(request: IRequest): Response {
		try {
			const url = new URL(request.url)
			const limit = Number(url.searchParams.get('limit') ?? 100)
			if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new DiagramRequestError(400, 'limit must be an integer from 1 to 200')
			const pageId = url.searchParams.has('pageId') ? PageIdSchema.parse(url.searchParams.get('pageId')) : undefined
			const records = this.getOrCreateRoom().getCurrentSnapshot().documents.map(({ state }) => state)
			const pages = records.filter((record) => record.typeName === 'page').map((record) => schema.types.page.validate(record)).filter((record) => record.typeName === 'page')
			const shapes = records.filter((record) => record.typeName === 'shape').map((record) => schema.types.shape.validate(record)).filter((record) => record.typeName === 'shape')
			const parents = new Map<string, string>(shapes.map((shape) => [shape.id, shape.parentId]))
			const containingPage = (parentId: string): string => {
				const visited = new Set<string>()
				while (parents.has(parentId) && !visited.has(parentId)) {
					visited.add(parentId)
					parentId = parents.get(parentId)!
				}
				return parentId
			}
			const visible = shapes.filter((shape) => !pageId || containingPage(shape.parentId) === pageId)
			return Response.json({
				roomId: request.params.roomId,
				pages: pages.slice(0, 100).map(({ id, name }) => ({ id, name: name.slice(0, 200) })),
				shapes: visible.slice(0, limit).map((shape) => ({
					id: shape.id, type: shape.type, parentId: shape.parentId,
					x: shape.x, y: shape.y, rotation: shape.rotation, locked: shape.isLocked,
					// Text is bounded and assets/URLs are omitted from model-facing summaries.
					text: extractRecordText(shape.props).slice(0, 1000),
					...('w' in shape.props && typeof shape.props.w === 'number' ? { w: shape.props.w } : {}),
					...('h' in shape.props && typeof shape.props.h === 'number' ? { h: shape.props.h } : {}),
					...('color' in shape.props && typeof shape.props.color === 'string' ? { color: shape.props.color } : {}),
				})),
				totalShapes: visible.length,
				truncated: visible.length > limit,
			}, { headers: { 'Cache-Control': 'no-store' } })
		} catch (cause) { return diagramErrorResponse(cause) }
	}

	// Entry point for all requests to the Durable Object
	fetch(request: Request): Response | Promise<Response> {
		return this.router.fetch(request)
	}

	// Handle new WebSocket connection requests
	async handleConnect(request: IRequest) {
		const sessionId = request.query.sessionId as string
		if (!sessionId) return error(400, 'Missing sessionId')

		// Create the websocket pair for the client
		const { 0: clientWebSocket, 1: serverWebSocket } = new WebSocketPair()
		// Use hibernation API instead of serverWebSocket.accept()
		this.ctx.acceptWebSocket(serverWebSocket)

		// Store sessionId in attachment immediately so we can identify this socket
		// after hibernation, before the connect handshake completes.
		const attachment: SocketAttachment = { sessionId, snapshot: null }
		serverWebSocket.serializeAttachment(attachment)

		// Connect to the room. The first webSocketMessage from the client will
		// complete the handshake and trigger debounced snapshot storage.
		this.getOrCreateRoom().handleSocketConnect({ sessionId, socket: serverWebSocket })

		return new Response(null, { status: 101, webSocket: clientWebSocket })
	}

	// --- WebSocket Hibernation API handlers ---

	override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const attachment = getAttachment(ws)
		if (!attachment) return

		this.sessionIdToWs.set(attachment.sessionId, ws)
		this.getOrCreateRoom().handleSocketMessage(attachment.sessionId, message)
	}

	override async webSocketClose(ws: WebSocket) {
		this.handleWebSocketEnd(ws, 'handleSocketClose')
	}

	override async webSocketError(ws: WebSocket) {
		this.handleWebSocketEnd(ws, 'handleSocketError')
	}

	private handleWebSocketEnd(ws: WebSocket, method: 'handleSocketClose' | 'handleSocketError') {
		const attachment = getAttachment(ws)
		if (!attachment) return

		this.sessionIdToWs.delete(attachment.sessionId)

		const room = this.getOrCreateRoom()

		// If the DO was hibernating, this session was never re-added to the room
		// (ctx.getWebSockets() doesn't include the disconnecting socket). Resume it
		// briefly so the room can broadcast presence removal to other clients.
		if (attachment.snapshot && !room.getSessionSnapshot(attachment.sessionId)) {
			room.handleSocketResume({
				sessionId: attachment.sessionId,
				socket: ws,
				snapshot: attachment.snapshot,
			})
		}

		room[method](attachment.sessionId)
	}
}
