import assert from 'node:assert/strict'
import test from 'node:test'
import type { SessionStateSnapshot } from '@tldraw/sync-core'
import { endCurrentSocketSession, getSocketAttachment, recoverSocketSessions, saveConnectedSession, type SocketAttachment } from './socketRecovery'

function socket(attachment: SocketAttachment | null) {
	return {
		attachment,
		closed: false,
		deserializeAttachment() { return this.attachment },
		close(code?: number, reason?: string) {
			assert.equal(code, 1012)
			assert.equal(reason, 'Session state unavailable')
			this.closed = true
		},
	}
}

test('recovers saved sessions and reconnects orphaned sockets without closing fresh handshakes', () => {
	const snapshot = { serializedSchema: { schemaVersion: 2, sequences: {} } } as SessionStateSnapshot
	const saved = socket({ sessionId: 'saved', snapshot })
	const presentation = socket({ kind: 'presentation', sessionId: 'remote', role: 'remote' } as unknown as SocketAttachment)
	const orphan = socket({ sessionId: 'orphan', snapshot: null })
	const fresh = socket({ sessionId: 'fresh', snapshot: null })
	const accepted = new WeakSet([fresh])
	const resumed: string[] = []

	recoverSocketSessions([saved, orphan, fresh, presentation], accepted, (_socket, attachment) => {
		resumed.push(attachment.sessionId)
		assert.equal(attachment.snapshot, snapshot)
	})

	assert.deepEqual(resumed, ['saved'])
	assert.equal(saved.closed, false)
	assert.equal(orphan.closed, true, 'an orphan must trigger client replay instead of remaining silently editable')
	assert.equal(fresh.closed, false, 'the first handshake has no snapshot yet')
	assert.equal(presentation.closed, false, 'the room recovery path must leave presentation sockets alone')
	assert.equal(getSocketAttachment(orphan)?.sessionId, 'orphan')
})

test('saves a resumable attachment as soon as the handshake completes', () => {
	const snapshot = { serializedSchema: { schemaVersion: 2, sequences: {} } } as SessionStateSnapshot
	const attachable = {
		attachment: { sessionId: 'active', snapshot: null } as SocketAttachment,
		serializeAttachment(value: SocketAttachment) { this.attachment = value },
	}
	const first = saveConnectedSession(attachable, 'active', () => null)
	assert.equal(first, false, 'a partial handshake must stay pending')
	assert.equal(attachable.attachment?.snapshot, null)

	const complete = saveConnectedSession(attachable, 'active', () => snapshot)
	assert.equal(complete, true)
	assert.deepEqual(attachable.attachment, { sessionId: 'active', snapshot })
})

test('persists the owner session hash across WebSocket hibernation', () => {
	const snapshot = { serializedSchema: { schemaVersion: 2, sequences: {} } } as SessionStateSnapshot
	const attachable = {
		attachment: { sessionId: 'active', snapshot: null, ownerSessionHash: 'a'.repeat(64) } as SocketAttachment,
		serializeAttachment(value: SocketAttachment) { this.attachment = value },
	}
	assert.equal(saveConnectedSession(attachable, 'active', () => snapshot, 'a'.repeat(64)), true)
	assert.equal(attachable.attachment.ownerSessionHash, 'a'.repeat(64))
})

test('a late close from a replaced socket cannot end the current session', () => {
	const oldSocket = socket({ sessionId: 'shared-tab', snapshot: null })
	const newSocket = socket({ sessionId: 'shared-tab', snapshot: null })
	const current = new Map([['shared-tab', newSocket]])
	const ended: string[] = []

	endCurrentSocketSession(oldSocket, current, (sessionId) => ended.push(sessionId))
	assert.equal(ended.length, 0)
	assert.equal(current.get('shared-tab'), newSocket)

	endCurrentSocketSession(newSocket, current, (sessionId) => ended.push(sessionId))
	assert.deepEqual(ended, ['shared-tab'])
	assert.equal(current.has('shared-tab'), false)

	// The closing socket may be excluded from getWebSockets() after hibernation.
	endCurrentSocketSession(oldSocket, current, (sessionId) => ended.push(sessionId))
	assert.deepEqual(ended, ['shared-tab', 'shared-tab'])
})
