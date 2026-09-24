import type { SessionStateSnapshot } from '@tldraw/sync-core'

export interface SocketAttachment {
	sessionId: string
	snapshot: SessionStateSnapshot | null
}

interface RecoverableSocket {
	deserializeAttachment(): unknown
	close(code?: number, reason?: string): void
}

export function getSocketAttachment(socket: RecoverableSocket): SocketAttachment | null {
	const attachment = socket.deserializeAttachment() as SocketAttachment | null
	return attachment?.sessionId ? attachment : null
}

export function saveConnectedSession(
	socket: { serializeAttachment(attachment: SocketAttachment): void },
	sessionId: string,
	getSnapshot: () => SessionStateSnapshot | null,
): boolean {
	const snapshot = getSnapshot()
	if (!snapshot) return false
	socket.serializeAttachment({ sessionId, snapshot })
	return true
}

export function endCurrentSocketSession<TSocket extends RecoverableSocket>(
	socket: TSocket,
	currentSockets: Map<string, TSocket>,
	endSession: (sessionId: string) => void,
): void {
	const attachment = getSocketAttachment(socket)
	if (!attachment) return
	const current = currentSockets.get(attachment.sessionId)
	if (current && current !== socket) return
	currentSockets.delete(attachment.sessionId)
	endSession(attachment.sessionId)
}

/**
 * A socket accepted by an older Durable Object instance without a saved session
 * cannot be resumed. Close it so the client reconnects and replays local edits.
 * Sockets accepted in this instance are still waiting for their first handshake.
 */
export function recoverSocketSessions<TSocket extends RecoverableSocket>(
	sockets: Iterable<TSocket>,
	newlyAccepted: WeakSet<TSocket>,
	resume: (socket: TSocket, attachment: SocketAttachment & { snapshot: SessionStateSnapshot }) => void,
): void {
	for (const socket of sockets) {
		const attachment = getSocketAttachment(socket)
		if (attachment?.snapshot) {
			resume(socket, { sessionId: attachment.sessionId, snapshot: attachment.snapshot })
		} else if (!newlyAccepted.has(socket)) {
			socket.close(1012, 'Session state unavailable')
		}
	}
}
