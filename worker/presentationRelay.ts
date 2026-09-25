/** The presentation relay shares only slide position and pointer controls, never canvas records. */
const ROOM_ID = /^[a-zA-Z0-9_-]{1,128}$/
const SESSION_ID = /^[a-zA-Z0-9_-]{24,128}$/
const MESSAGE_ID = /^[a-zA-Z0-9_-]{8,128}$/
const ACTIONS = ['previous', 'next', 'exit', 'laser-toggle', 'laser-clear']

export interface PresentationRelayAttachment {
	kind: 'presentation'
	sessionId: string
	role: 'host' | 'remote'
	ownerSessionHash?: string
}

export interface PresentationRelayWire {
	id: string
	message: { kind: string; sessionId: string; [key: string]: unknown }
}

export function presentationSessionTag(sessionId: string) {
	return `presentation:${sessionId}`
}

export function isPresentationAttachment(value: unknown): value is PresentationRelayAttachment {
	return isRecord(value) && value.kind === 'presentation' && typeof value.sessionId === 'string'
		&& SESSION_ID.test(value.sessionId) && (value.role === 'host' || value.role === 'remote')
}

export function parsePresentationConnection(request: Request, roomId: string, sessionId: string): Pick<PresentationRelayAttachment, 'role' | 'sessionId'> {
	const url = new URL(request.url)
	const role = url.searchParams.get('role')
	// Upgrade requests can arrive with either http(s) or ws(s) in Request.url.
	const expectedOrigin = `${url.protocol === 'wss:' ? 'https:' : url.protocol === 'ws:' ? 'http:' : url.protocol}//${url.host}`
	if (!ROOM_ID.test(roomId) || !SESSION_ID.test(sessionId) || url.searchParams.size !== 1
		|| (role !== 'host' && role !== 'remote') || request.headers.get('upgrade')?.toLowerCase() !== 'websocket'
		|| request.headers.get('origin') !== expectedOrigin) throw new Error('Invalid presentation connection')
	return { role, sessionId }
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function keys(value: Record<string, unknown>, expected: string[]) {
	return Object.keys(value).length === expected.length && expected.every((key) => key in value)
}

function point(value: unknown) {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

export function parsePresentationMessage(raw: string | ArrayBuffer, sender: PresentationRelayAttachment): PresentationRelayWire | null {
	if (typeof raw !== 'string' || raw.length > 2048) return null
	let value: unknown
	try { value = JSON.parse(raw) } catch { return null }
	if (!isRecord(value) || !keys(value, ['id', 'message']) || typeof value.id !== 'string' || !MESSAGE_ID.test(value.id)) return null
	const message = value.message
	if (!isRecord(message) || message.sessionId !== sender.sessionId) return null
	if (message.kind === 'hello' && sender.role === 'remote' && keys(message, ['kind', 'sessionId'])) return { id: value.id, message: { kind: 'hello', sessionId: sender.sessionId } }
	if (message.kind === 'state' && sender.role === 'host' && keys(message, ['kind', 'sessionId', 'state'])) {
		const state = message.state
		if (!isRecord(state) || !keys(state, ['presenting', 'index', 'count', 'title', 'laserActive'])
			|| typeof state.presenting !== 'boolean' || !Number.isSafeInteger(state.index) || !Number.isSafeInteger(state.count)
			|| (state.index as number) < 0 || (state.count as number) < 0 || (state.count as number) > 10000
			|| typeof state.title !== 'string' || state.title.length > 256 || typeof state.laserActive !== 'boolean') return null
		return { id: value.id, message: { kind: 'state', sessionId: sender.sessionId, state: { ...state, title: '' } } }
	}
	if (message.kind === 'command' && sender.role === 'remote') {
		if ((message.action === 'laser-move' || message.action === 'laser-pulse')
			&& keys(message, ['kind', 'sessionId', 'action', 'x', 'y']) && point(message.x) && point(message.y)) {
			return { id: value.id, message: { kind: 'command', sessionId: sender.sessionId, action: message.action, x: message.x, y: message.y } }
		}
		if (ACTIONS.includes(String(message.action)) && keys(message, ['kind', 'sessionId', 'action'])) {
			return { id: value.id, message: { kind: 'command', sessionId: sender.sessionId, action: message.action } }
		}
	}
	return null
}
