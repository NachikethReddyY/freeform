import assert from 'node:assert/strict'
import test from 'node:test'
import {
	connectPresentationRemote,
	createPresentationRemoteHost,
	getPresentationRemoteUrl,
	normalizeRemotePoint,
	type PresentationRemoteChannel,
	type PresentationRemoteMessage,
	type PresentationRemoteSocket,
	type PresentationRemoteState,
} from './presentationRemote'

class FakeChannel implements PresentationRemoteChannel {
	static channels = new Map<string, Set<FakeChannel>>()
	onmessage: ((event: MessageEvent<PresentationRemoteMessage>) => void) | null = null
	closed = false
	constructor(readonly name: string) {
		const channels = FakeChannel.channels.get(name) ?? new Set<FakeChannel>()
		channels.add(this)
		FakeChannel.channels.set(name, channels)
	}
	postMessage(data: PresentationRemoteMessage) {
		for (const other of FakeChannel.channels.get(this.name) ?? []) {
			if (other !== this && !other.closed) other.onmessage?.({ data } as MessageEvent<PresentationRemoteMessage>)
		}
	}
	close() {
		this.closed = true
		const channels = FakeChannel.channels.get(this.name)
		channels?.delete(this)
		if (channels?.size === 0) FakeChannel.channels.delete(this.name)
	}
}

const channelFactory = (name: string) => new FakeChannel(name)

test('remote targets one board and one presentation session, validates commands, and closes cleanly', () => {
	const received: string[] = []
	let state = { presenting: true, index: 0, count: 2, title: 'Opening', laserActive: false }
	const host = createPresentationRemoteHost({
		roomId: 'board-one',
		sessionId: 'session-one',
		channelFactory,
		getState: () => state,
		onCommand: (command) => received.push(command.action),
	})
	const states: Array<typeof state> = []
	const remote = connectPresentationRemote({
		roomId: 'board-one', sessionId: 'session-one', channelFactory,
		onState: (next) => states.push(next),
	})
	assert.deepEqual(states, [state], 'hello receives presenter state')
	remote.send({ action: 'next' })
	remote.send({ action: 'laser-move', x: 0.75, y: 0.25 })
	remote.send({ action: 'laser-pulse', x: 0.75, y: 0.25 })
	assert.deepEqual(received, ['next', 'laser-move', 'laser-pulse'])

	const wrongBoard = connectPresentationRemote({ roomId: 'board-two', sessionId: 'session-one', channelFactory, onState: () => {} })
	const wrongSession = connectPresentationRemote({ roomId: 'board-one', sessionId: 'session-two', channelFactory, onState: () => {} })
	wrongBoard.send({ action: 'previous' })
	wrongSession.send({ action: 'exit' })
	assert.deepEqual(received, ['next', 'laser-move', 'laser-pulse'])

	const malicious = new FakeChannel(host.channelName)
	malicious.postMessage({ kind: 'command', sessionId: 'wrong', action: 'exit' })
	malicious.postMessage({ kind: 'command', sessionId: 'session-one', action: 'laser-move', x: 4, y: 0.2 })
	malicious.postMessage({ kind: 'command', sessionId: 'session-one', action: 'next', x: 0.2 } as PresentationRemoteMessage)
	assert.deepEqual(received, ['next', 'laser-move', 'laser-pulse'], 'invalid payloads do not reach presenter')

	state = { ...state, index: 1, title: 'Closing', laserActive: true }
	host.publishState()
	assert.deepEqual(states.at(-1), state)
	host.dispose()
	assert.equal(states.at(-1)?.presenting, false, 'remote learns the show ended')
	remote.send({ action: 'next' })
	assert.deepEqual(received, ['next', 'laser-move', 'laser-pulse'])
	remote.dispose()
	wrongBoard.dispose()
	wrongSession.dispose()
	malicious.close()
	assert.equal(FakeChannel.channels.size, 0)
})

test('remote touchpad coordinates are normalized and clamped', () => {
	const bounds = { left: 20, top: 30, width: 200, height: 100 }
	assert.deepEqual(normalizeRemotePoint(120, 80, bounds), { x: 0.5, y: 0.5 })
	assert.deepEqual(normalizeRemotePoint(-20, 230, bounds), { x: 0, y: 1 })
	assert.deepEqual(normalizeRemotePoint(50, 50, { ...bounds, width: 0 }), { x: 0, y: 0 })
})

test('remote URL uses the current board route and a session token without canvas query state', () => {
	assert.equal(
		getPresentationRemoteUrl('http://localhost:5173/my-board?d=v42.2.3.page#canvas', 'session-one'),
		'http://localhost:5173/my-board?presentationRemote=session-one',
	)
})

class FakeRelaySocket implements PresentationRemoteSocket {
	static sockets = new Set<FakeRelaySocket>()
	readyState = 1
	onopen: ((event: Event) => void) | null = null
	onmessage: ((event: MessageEvent<string>) => void) | null = null
	onclose: ((event: CloseEvent) => void) | null = null
	onerror: ((event: Event) => void) | null = null
	constructor(readonly url: string) {
		FakeRelaySocket.sockets.add(this)
		queueMicrotask(() => this.onopen?.(new Event('open')))
	}
	send(data: string) {
		const source = new URL(this.url)
		for (const peer of FakeRelaySocket.sockets) {
			const target = new URL(peer.url)
			if (peer === this || peer.readyState !== 1 || source.pathname !== target.pathname
				|| source.searchParams.get('role') === target.searchParams.get('role')) continue
			queueMicrotask(() => peer.onmessage?.({ data } as MessageEvent<string>))
		}
	}
	close() { this.readyState = 3; FakeRelaySocket.sockets.delete(this) }
}

test('worker relay reaches a remote in another browser profile without duplicating local actions', async () => {
	const received: string[] = []
	const safariChannel = (name: string) => new FakeChannel(`${name}:safari`)
	const heliumChannel = (name: string) => new FakeChannel(`${name}:helium`)
	const socketFactory = (url: string) => new FakeRelaySocket(url)
	const host = createPresentationRemoteHost({ roomId: 'board-one', sessionId: '5f89d055-4a83-4b70-92a9-14b62b16fd47', channelFactory: safariChannel, socketFactory,
		getState: () => ({ presenting: true, index: 0, count: 2, title: 'Private slide title', laserActive: false }),
		onCommand: (command) => received.push(command.action),
	})
	const states: PresentationRemoteState[] = []
	const remote = connectPresentationRemote({ roomId: 'board-one', sessionId: host.sessionId, channelFactory: heliumChannel, socketFactory,
		onState: (state) => states.push(state),
	})
	await new Promise((resolve) => setTimeout(resolve, 0))
	assert.equal(states.at(-1)?.presenting, true)
	assert.equal(states.at(-1)?.title, '', 'slide title stays out of the server relay')
	remote.send({ action: 'next' })
	await new Promise((resolve) => setTimeout(resolve, 0))
	assert.deepEqual(received, ['next'])
	remote.dispose()
	host.dispose()
	assert.equal(FakeRelaySocket.sockets.size, 0)
	assert.equal(FakeChannel.channels.size, 0)
})

test('same-browser fallback and worker relay deliver each command once', async () => {
	const received: string[] = []
	const socketFactory = (url: string) => new FakeRelaySocket(url)
	const sessionId = '5f89d055-4a83-4b70-92a9-14b62b16fd48'
	const host = createPresentationRemoteHost({ roomId: 'board-one', sessionId, channelFactory, socketFactory,
		getState: () => ({ presenting: true, index: 0, count: 2, title: 'Slide', laserActive: false }),
		onCommand: (command) => received.push(command.action),
	})
	const remote = connectPresentationRemote({ roomId: 'board-one', sessionId, channelFactory, socketFactory, onState: () => {} })
	await new Promise((resolve) => setTimeout(resolve, 0))
	remote.send({ action: 'next' })
	await new Promise((resolve) => setTimeout(resolve, 0))
	assert.deepEqual(received, ['next'])
	remote.dispose()
	host.dispose()
	assert.equal(FakeRelaySocket.sockets.size, 0)
	assert.equal(FakeChannel.channels.size, 0)
})
