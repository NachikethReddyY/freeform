/** Same-browser BroadcastChannel fallback plus a same-origin worker relay for other browsers. */
const BOARD_ID = /^[a-zA-Z0-9_-]{1,128}$/
const SESSION_ID = /^[a-zA-Z0-9_-]{8,128}$/

export interface PresentationRemoteState {
	presenting: boolean
	index: number
	count: number
	title: string
	laserActive: boolean
}

export type PresentationRemoteCommand =
	| { action: 'previous' | 'next' | 'exit' | 'laser-toggle' | 'laser-clear' }
	| { action: 'laser-move' | 'laser-pulse'; x: number; y: number }

export type PresentationRemoteMessage =
	| { kind: 'hello'; sessionId: string }
	| { kind: 'state'; sessionId: string; state: PresentationRemoteState }
	| ({ kind: 'command'; sessionId: string; messageId?: string } & PresentationRemoteCommand)

export interface PresentationRemoteChannel {
	onmessage: ((event: MessageEvent<PresentationRemoteMessage>) => void) | null
	postMessage(message: PresentationRemoteMessage): void
	close(): void
}

export type PresentationRemoteChannelFactory = (name: string) => PresentationRemoteChannel

export interface PresentationRemoteSocket {
	readyState: number
	onopen: ((event: Event) => void) | null
	onmessage: ((event: MessageEvent<string>) => void) | null
	onclose: ((event: CloseEvent) => void) | null
	onerror: ((event: Event) => void) | null
	send(message: string): void
	close(): void
}

export type PresentationRemoteSocketFactory = (url: string) => PresentationRemoteSocket

const defaultChannelFactory: PresentationRemoteChannelFactory = (name) => new BroadcastChannel(name)
const defaultSocketFactory: PresentationRemoteSocketFactory | null = typeof WebSocket === 'undefined' ? null : (url) => new WebSocket(url)

function assertIds(roomId: string, sessionId: string) {
	if (!BOARD_ID.test(roomId) || !SESSION_ID.test(sessionId)) throw new Error('Invalid presentation remote link')
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasKeys(value: Record<string, unknown>, keys: readonly string[]) {
	return Object.keys(value).length === keys.length && keys.every((key) => key in value)
}

function isPosition(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function isCommand(value: unknown, sessionId: string): value is Extract<PresentationRemoteMessage, { kind: 'command' }> {
	if (!isRecord(value) || value.kind !== 'command' || value.sessionId !== sessionId) return false
	const id = value.messageId
	if (id !== undefined && (typeof id !== 'string' || !SESSION_ID.test(id))) return false
	const expected = id === undefined ? ['kind', 'sessionId', 'action'] : ['kind', 'sessionId', 'action', 'messageId']
	if (value.action === 'laser-move' || value.action === 'laser-pulse') {
		return hasKeys(value, [...expected, 'x', 'y']) && isPosition(value.x) && isPosition(value.y)
	}
	return hasKeys(value, expected)
		&& ['previous', 'next', 'exit', 'laser-toggle', 'laser-clear'].includes(String(value.action))
}

function isState(value: unknown, sessionId: string): value is Extract<PresentationRemoteMessage, { kind: 'state' }> {
	if (!isRecord(value) || value.kind !== 'state' || value.sessionId !== sessionId || !hasKeys(value, ['kind', 'sessionId', 'state'])) return false
	const state = value.state
	return isRecord(state) && hasKeys(state, ['presenting', 'index', 'count', 'title', 'laserActive'])
		&& typeof state.presenting === 'boolean' && Number.isSafeInteger(state.index) && Number.isSafeInteger(state.count)
		&& (state.index as number) >= 0 && (state.count as number) >= 0
		&& typeof state.title === 'string' && state.title.length <= 256 && typeof state.laserActive === 'boolean'
}

function relaySocket(
	roomId: string,
	sessionId: string,
	role: 'host' | 'remote',
	onMessage: (message: unknown, id: string) => void,
	onOpen: () => void,
	socketFactory: PresentationRemoteSocketFactory | null,
) {
	if (!socketFactory) return null
	let disposed = false
	let socket: PresentationRemoteSocket | null = null
	let retryTimer: ReturnType<typeof setTimeout> | null = null
	let retryDelay = 1000
	const open = () => {
		if (disposed) return
		const base = new URL(typeof location === 'undefined' ? 'http://localhost:5173' : location.origin)
		base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
		base.pathname = `/api/presentation/${encodeURIComponent(roomId)}/${encodeURIComponent(sessionId)}`
		base.search = `?role=${role}`
		try { socket = socketFactory(base.toString()) }
		catch { scheduleRetry(); return }
		const current = socket
		current.onopen = () => { retryDelay = 1000; onOpen() }
		current.onmessage = (event) => {
			if (typeof event.data !== 'string' || event.data.length > 2048) return
			let data: unknown
			try { data = JSON.parse(event.data) } catch { return }
			if (isRecord(data) && typeof data.id === 'string' && SESSION_ID.test(data.id)) onMessage(data.message, data.id)
		}
		current.onclose = () => { if (socket === current) socket = null; scheduleRetry() }
		current.onerror = () => current.close()
	}
	const scheduleRetry = () => {
		if (disposed || retryTimer) return
		retryTimer = setTimeout(() => { retryTimer = null; open() }, retryDelay)
		retryDelay = Math.min(8000, retryDelay * 2)
	}
	open()
	return {
		send(message: PresentationRemoteMessage, id = crypto.randomUUID()) {
			if (socket?.readyState === 1) socket.send(JSON.stringify({ id, message }))
		},
		dispose() {
			disposed = true
			if (retryTimer) clearTimeout(retryTimer)
			if (socket) {
				socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
				socket.close()
				socket = null
			}
		},
	}
}

export function createPresentationRemoteHost({
	roomId, sessionId = crypto.randomUUID(), onCommand, getState, channelFactory = defaultChannelFactory, socketFactory,
}: {
	roomId: string
	sessionId?: string
	onCommand(command: PresentationRemoteCommand): void
	getState(): PresentationRemoteState
	channelFactory?: PresentationRemoteChannelFactory
	socketFactory?: PresentationRemoteSocketFactory | null
}) {
	assertIds(roomId, sessionId)
	const channelName = `freeform:presentation-remote:${roomId}:${sessionId}`
	const channel = channelFactory(channelName)
	let disposed = false
	let relay: ReturnType<typeof relaySocket> = null
	const seenCommands = new Set<string>()
	const publishState = () => {
		if (disposed) return
		const message: PresentationRemoteMessage = { kind: 'state', sessionId, state: getState() }
		channel.postMessage(message)
		relay?.send({ ...message, state: { ...message.state, title: '' } })
	}
	const receive = (data: unknown) => {
		if (disposed || !isRecord(data) || data.sessionId !== sessionId) return
		if (data.kind === 'hello' && hasKeys(data, ['kind', 'sessionId'])) publishState()
		else if (isCommand(data, sessionId)) {
			if (data.messageId) {
				if (seenCommands.has(data.messageId)) return
				seenCommands.add(data.messageId)
				if (seenCommands.size > 256) seenCommands.delete(seenCommands.values().next().value!)
			}
			const { kind: _kind, sessionId: _sessionId, messageId: _messageId, ...command } = data
			void _kind; void _sessionId; void _messageId
			onCommand(command)
		}
	}
	channel.onmessage = ({ data }) => receive(data)
	relay = relaySocket(roomId, sessionId, 'host', (message, id) => {
		if (isRecord(message) && message.kind === 'command') receive({ ...message, messageId: id })
		else receive(message)
	}, publishState, socketFactory === undefined ? channelFactory === defaultChannelFactory ? defaultSocketFactory : null : socketFactory)
	return {
		sessionId,
		channelName,
		publishState,
		dispose() {
			if (disposed) return
			channel.postMessage({ kind: 'state', sessionId, state: { presenting: false, index: 0, count: 0, title: '', laserActive: false } })
			disposed = true
			channel.onmessage = null
			channel.close()
			relay?.dispose()
		},
	}
}

export function connectPresentationRemote({
	roomId, sessionId, onState, channelFactory = defaultChannelFactory, socketFactory,
}: {
	roomId: string
	sessionId: string
	onState(state: PresentationRemoteState): void
	channelFactory?: PresentationRemoteChannelFactory
	socketFactory?: PresentationRemoteSocketFactory | null
}) {
	assertIds(roomId, sessionId)
	const channel = channelFactory(`freeform:presentation-remote:${roomId}:${sessionId}`)
	let disposed = false
	let relay: ReturnType<typeof relaySocket> = null
	const receive = (data: unknown) => {
		if (!disposed && isState(data, sessionId)) onState(data.state)
	}
	channel.onmessage = ({ data }) => receive(data)
	relay = relaySocket(roomId, sessionId, 'remote', (message) => receive(message), () => {
		relay?.send({ kind: 'hello', sessionId })
	}, socketFactory === undefined ? channelFactory === defaultChannelFactory ? defaultSocketFactory : null : socketFactory)
	channel.postMessage({ kind: 'hello', sessionId })
	return {
		send(command: PresentationRemoteCommand) {
			if (disposed) return
			const messageId = crypto.randomUUID()
			channel.postMessage({ kind: 'command', sessionId, messageId, ...command })
			relay?.send({ kind: 'command', sessionId, ...command }, messageId)
		},
		requestState() {
			if (!disposed) {
				const message: PresentationRemoteMessage = { kind: 'hello', sessionId }
				channel.postMessage(message)
				relay?.send(message)
			}
		},
		dispose() {
			if (disposed) return
			disposed = true
			channel.onmessage = null
			channel.close()
			relay?.dispose()
		},
	}
}

export function getPresentationRemoteUrl(href: string, sessionId: string) {
	if (!SESSION_ID.test(sessionId)) throw new Error('Invalid presentation remote session')
	const url = new URL(href)
	url.search = ''
	url.hash = ''
	url.searchParams.set('presentationRemote', sessionId)
	return url.toString()
}

export function normalizeRemotePoint(clientX: number, clientY: number, bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>) {
	if (bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 }
	const clamp = (value: number) => Math.min(1, Math.max(0, value))
	return {
		x: clamp((clientX - bounds.left) / bounds.width),
		y: clamp((clientY - bounds.top) / bounds.height),
	}
}
