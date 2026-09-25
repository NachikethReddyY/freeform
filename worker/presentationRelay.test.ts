import assert from 'node:assert/strict'
import test from 'node:test'
import {
	parsePresentationConnection,
	parsePresentationMessage,
	presentationSessionTag,
	type PresentationRelayAttachment,
} from './presentationRelay'

const origin = 'http://localhost:5173'
const request = (path: string, role: string, headers: Record<string, string> = {}) => new Request(`${origin}${path}?role=${role}`, {
	headers: { origin, upgrade: 'websocket', ...headers },
})

test('relay requires same-origin WebSocket and a scoped opaque presentation session', () => {
	const route = '/api/presentation/board-one/5f89d055-4a83-4b70-92a9-14b62b16fd47'
	assert.deepEqual(parsePresentationConnection(request(route, 'host'), 'board-one', '5f89d055-4a83-4b70-92a9-14b62b16fd47'), { role: 'host', sessionId: '5f89d055-4a83-4b70-92a9-14b62b16fd47' })
	assert.deepEqual(parsePresentationConnection(new Request(`ws://localhost:5173${route}?role=remote`, { headers: { origin, upgrade: 'websocket' } }), 'board-one', '5f89d055-4a83-4b70-92a9-14b62b16fd47'), { role: 'remote', sessionId: '5f89d055-4a83-4b70-92a9-14b62b16fd47' })
	assert.equal(presentationSessionTag('5f89d055-4a83-4b70-92a9-14b62b16fd47'), 'presentation:5f89d055-4a83-4b70-92a9-14b62b16fd47')
	for (const invalid of [
		request(route, 'remote', { origin: 'https://evil.example' }),
		request(route, 'remote', { origin: '' }),
		request(route, 'remote', { upgrade: 'h2c' }),
		request(route, 'other'),
		request('/api/presentation/board-one/short', 'remote'),
	]) assert.throws(() => parsePresentationConnection(invalid, 'board-one', new URL(invalid.url).pathname.split('/').at(-1) ?? ''))
})

test('relay forwards only minimal bounded state and valid control messages', () => {
	const sessionId = '5f89d055-4a83-4b70-92a9-14b62b16fd47'
	const host: PresentationRelayAttachment = { kind: 'presentation', sessionId, role: 'host' }
	const remote: PresentationRelayAttachment = { kind: 'presentation', sessionId, role: 'remote' }
	const state = { kind: 'state', sessionId, state: { presenting: true, index: 1, count: 2, title: 'Private slide title', laserActive: true } }
	const wire = (message: unknown) => JSON.stringify({ id: 'message-1234', message })
	assert.deepEqual(parsePresentationMessage(wire(state), host), { id: 'message-1234', message: { ...state, state: { ...state.state, title: '' } } })
	assert.deepEqual(parsePresentationMessage(wire({ kind: 'command', sessionId, action: 'laser-move', x: .3, y: .7 }), remote), { id: 'message-1234', message: { kind: 'command', sessionId, action: 'laser-move', x: .3, y: .7 } })
	assert.deepEqual(parsePresentationMessage(wire({ kind: 'hello', sessionId }), remote), { id: 'message-1234', message: { kind: 'hello', sessionId } })
	for (const invalid of [
		wire({ kind: 'state', sessionId, state: state.state }),
		wire({ kind: 'command', sessionId: 'other', action: 'exit' }),
		wire({ kind: 'command', sessionId, action: 'laser-move', x: 2, y: .5 }),
		wire({ kind: 'command', sessionId, action: 'next', leakedBoard: {} }),
		'x'.repeat(2049),
	]) assert.equal(parsePresentationMessage(invalid, remote), null)
	assert.equal(parsePresentationMessage(wire({ kind: 'command', sessionId, action: 'next' }), host), null)
})
