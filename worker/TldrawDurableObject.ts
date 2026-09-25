import {
	DurableObjectSqliteSyncWrapper,
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
import { isPresentationAttachment, parsePresentationConnection, parsePresentationMessage, presentationSessionTag } from './presentationRelay'
import { endCurrentSocketSession, getSocketAttachment, recoverSocketSessions, saveConnectedSession, type SocketAttachment } from './socketRecovery'
import { hashSessionToken, parseSessionCookie } from './auth'

// add custom shapes and bindings here if needed:
// The client registers this custom geo through GeoShapeUtil.configure; the sync schema needs the same value.
GeoShapeGeoStyle.addValues('freeform-rounded-rectangle' as Parameters<typeof GeoShapeGeoStyle.addValues>[0])
const schema = createTLSchema({
	shapes: { ...defaultShapeSchemas },
	// bindings: { ...defaultBindingSchemas },
})

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
	/** Sockets accepted by this instance have not completed their first handshake yet. */
	private readonly newlyAccepted = new WeakSet<WebSocket>()

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
					if (ws) ws.serializeAttachment({ sessionId, snapshot, ownerSessionHash: getSocketAttachment(ws)?.ownerSessionHash })
				},
			})

			// Resume any sessions that survived hibernation
			recoverSocketSessions(this.ctx.getWebSockets().filter((socket) => !isPresentationAttachment(socket.deserializeAttachment())), this.newlyAccepted, (ws, attachment) => {
				this.room!.handleSocketResume({
					sessionId: attachment.sessionId,
					socket: ws,
					snapshot: attachment.snapshot,
				})
				this.sessionIdToWs.set(attachment.sessionId, ws)
			})
		}
		return this.room
	}

	private readonly router = AutoRouter({ catch: (e) => error(e) })
		.get('/api/connect/:roomId', (request) => this.handleConnect(request))
		.get('/api/presentation/:roomId/:sessionId', (request) => this.handlePresentationConnect(request))
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

	private async handlePresentationConnect(request: IRequest): Promise<Response> {
		let connection: ReturnType<typeof parsePresentationConnection>
		try { connection = parsePresentationConnection(request, request.params.roomId, request.params.sessionId) }
		catch { return Response.json({ error: 'Invalid presentation connection' }, { status: 403, headers: { 'Cache-Control': 'no-store' } }) }
		const tag = presentationSessionTag(connection.sessionId)
		const peers = this.ctx.getWebSockets(tag).filter((socket) => isPresentationAttachment(socket.deserializeAttachment()))
		if (connection.role === 'host' && peers.some((socket) => {
			const attachment = socket.deserializeAttachment()
			return isPresentationAttachment(attachment) && attachment.role === 'host'
		})) return Response.json({ error: 'Presentation already active' }, { status: 409 })
		if (connection.role === 'remote' && peers.filter((socket) => {
			const attachment = socket.deserializeAttachment()
			return isPresentationAttachment(attachment) && attachment.role === 'remote'
		}).length >= 8) return Response.json({ error: 'Too many remotes' }, { status: 429 })
		const session = parseSessionCookie(request.headers.get('cookie'))
		const ownerSessionHash = session && connection.role === 'host' ? await hashSessionToken(session) : undefined
		if (connection.role === 'host' && !await this.hasLiveOwnerSession(ownerSessionHash)) return Response.json({ error: 'Sign in to present' }, { status: 401 })
		const { 0: clientSocket, 1: serverSocket } = new WebSocketPair()
		this.ctx.acceptWebSocket(serverSocket, [tag])
		serverSocket.serializeAttachment({ kind: 'presentation', ...connection, ...(ownerSessionHash ? { ownerSessionHash } : {}) })
		return new Response(null, { status: 101, webSocket: clientSocket })
	}

	private async hasLiveOwnerSession(hash: string | undefined): Promise<boolean> {
		if (!hash) return false
		const auth = this.env.AUTH_DURABLE_OBJECT.get(this.env.AUTH_DURABLE_OBJECT.idFromName('local-owner'))
		const response = await auth.fetch('http://auth.local/internal/session-hash', { headers: { 'x-freeform-session-hash': hash } })
		return response.ok
	}

	// Handle new WebSocket connection requests
	async handleConnect(request: IRequest) {
		const sessionId = request.query.sessionId as string
		if (!sessionId) return error(400, 'Missing sessionId')
		const ownerSession = parseSessionCookie(request.headers.get('cookie'))
		if (!ownerSession) return error(401, 'Sign in to sync this board')
		const ownerSessionHash = await hashSessionToken(ownerSession)
		if (!await this.hasLiveOwnerSession(ownerSessionHash)) return error(401, 'Sign in to sync this board')

		// Create the websocket pair for the client
		const { 0: clientWebSocket, 1: serverWebSocket } = new WebSocketPair()
		// Use hibernation API instead of serverWebSocket.accept()
		this.ctx.acceptWebSocket(serverWebSocket)
		this.newlyAccepted.add(serverWebSocket)

		// Store sessionId in attachment immediately so we can identify this socket
		// after hibernation, before the connect handshake completes.
		const attachment: SocketAttachment = { sessionId, snapshot: null, ownerSessionHash }
		serverWebSocket.serializeAttachment(attachment)

		// Connect to the room. The first webSocketMessage from the client will
		// complete the handshake and persist a resumable session attachment.
		this.getOrCreateRoom().handleSocketConnect({ sessionId, socket: serverWebSocket })
		// The browser tab reuses sessionId after reload. Route events only from
		// the newest socket; an old socket may close after this connect succeeds.
		this.sessionIdToWs.set(sessionId, serverWebSocket)

		return new Response(null, { status: 101, webSocket: clientWebSocket })
	}

	// --- WebSocket Hibernation API handlers ---

	override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const presentation = ws.deserializeAttachment()
		if (isPresentationAttachment(presentation)) {
			if (presentation.role === 'host' && !await this.hasLiveOwnerSession(presentation.ownerSessionHash)) {
				ws.close(1008, 'Owner session expired')
				return
			}
			const packet = parsePresentationMessage(message, presentation)
			if (!packet) return
			const toRole = presentation.role === 'host' ? 'remote' : 'host'
			const payload = JSON.stringify(packet)
			for (const peer of this.ctx.getWebSockets(presentationSessionTag(presentation.sessionId))) {
				if (peer === ws) continue
				const target = peer.deserializeAttachment()
				if (!isPresentationAttachment(target) || target.sessionId !== presentation.sessionId || target.role !== toRole) continue
				if (target.role === 'host' && !await this.hasLiveOwnerSession(target.ownerSessionHash)) {
					peer.close(1008, 'Owner session expired')
					continue
				}
				try { peer.send(payload) } catch { /* A closed peer will be pruned by the runtime. */ }
			}
			return
		}
		const attachment = getSocketAttachment(ws)
		if (!attachment) return
		if (!await this.hasLiveOwnerSession(attachment.ownerSessionHash)) {
			ws.close(1008, 'Owner session expired')
			return
		}

		const room = this.getOrCreateRoom()
		if (this.sessionIdToWs.get(attachment.sessionId) !== ws) return
		room.handleSocketMessage(attachment.sessionId, message)
		// The SDK's onSessionSnapshot waits 5 seconds. Workerd may hibernate or
		// restart before then, leaving an accepted socket with no session to resume.
		if (!attachment.snapshot && saveConnectedSession(ws, attachment.sessionId, () => room.getSessionSnapshot(attachment.sessionId), attachment.ownerSessionHash)) {
			this.newlyAccepted.delete(ws)
		}
	}

	override async webSocketClose(ws: WebSocket) {
		this.handleWebSocketEnd(ws, 'handleSocketClose')
	}

	override async webSocketError(ws: WebSocket) {
		this.handleWebSocketEnd(ws, 'handleSocketError')
	}

	private handleWebSocketEnd(ws: WebSocket, method: 'handleSocketClose' | 'handleSocketError') {
		const presentation = ws.deserializeAttachment()
		if (isPresentationAttachment(presentation)) {
			if (presentation.role === 'host') {
				const offline = JSON.stringify({ id: crypto.randomUUID(), message: { kind: 'state', sessionId: presentation.sessionId, state: { presenting: false, index: 0, count: 0, title: '', laserActive: false } } })
				for (const peer of this.ctx.getWebSockets(presentationSessionTag(presentation.sessionId))) {
					const target = peer.deserializeAttachment()
					if (!isPresentationAttachment(target) || target.role !== 'remote') continue
					try { peer.send(offline) } catch { /* A closed peer will be pruned by the runtime. */ }
				}
			}
			return
		}
		const attachment = getSocketAttachment(ws)
		if (!attachment) return

		const room = this.getOrCreateRoom()
		endCurrentSocketSession(ws, this.sessionIdToWs, (sessionId) => {
			// The closing socket is excluded from getWebSockets() after hibernation.
			// Resume only its own session, and never replace a newer socket with the
			// same tab ID before processing this close.
			if (attachment.snapshot && !room.getSessionSnapshot(sessionId)) {
				room.handleSocketResume({ sessionId, socket: ws, snapshot: attachment.snapshot })
			}
			room[method](sessionId)
		})
	}
}
