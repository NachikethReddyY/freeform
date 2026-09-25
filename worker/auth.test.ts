import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	AuthError,
	OwnerAuthService,
	assertLocalAuthRequest,
	getSessionCookie,
	parseSessionCookie,
	type AuthKv,
	type AuthStore,
} from './auth'

class MemoryStore implements AuthStore {
	private readonly values = new Map<string, unknown>()
	async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined }
	async put(key: string, value: unknown): Promise<void> { this.values.set(key, value) }
	async delete(key: string): Promise<boolean> { return this.values.delete(key) }
	async list<T>(prefix: string): Promise<Map<string, T>> { return new Map([...this.values].filter(([key]) => key.startsWith(prefix)) as [string, T][]) }
	async transaction<T>(fn: (store: AuthKv) => Promise<T>): Promise<T> { return fn(this) }
}

function request(path: string, method = 'GET', origin = 'http://localhost:5173'): Request {
	return new Request(`http://localhost:5173${path}`, { method, headers: { origin } })
}

test('first owner explicitly claims local legacy boards and receives a revocable opaque session', async () => {
	const auth = new OwnerAuthService(new MemoryStore())
	assert.deepEqual(await auth.me(), { authenticated: false, setupRequired: true, owner: null })
	await assert.rejects(() => auth.register('correct horse battery staple', false), (e: unknown) => e instanceof AuthError && e.status === 400)
	const registered = await auth.register('correct horse battery staple', true, 1_000)
	assert.match(registered.token, /^[0-9a-f]{64}$/)
	assert.deepEqual(await auth.me(registered.token, 1_001), { authenticated: true, setupRequired: false, owner: { id: 'local-owner' } })
	const hash = await auth.sessionHash(registered.token)
	assert.equal(await auth.verifySessionHash(hash, 1_001), true)
	await assert.rejects(() => auth.register('a different password 123', true), (e: unknown) => e instanceof AuthError && e.status === 409)
	await auth.logout(registered.token)
	assert.deepEqual(await auth.me(registered.token, 1_002), { authenticated: false, setupRequired: false, owner: null })
	assert.equal(await auth.verifySessionHash(hash, 1_002), false)
	const loggedIn = await auth.login('correct horse battery staple', 1_003)
	assert.notEqual(loggedIn.token, registered.token)
	assert.equal((await auth.me(loggedIn.token, 1_004)).authenticated, true)
})

test('login rejects wrong passwords and rate limits repeated guesses', async () => {
	const auth = new OwnerAuthService(new MemoryStore())
	await auth.register('correct horse battery staple', true, 1_000)
	for (let index = 0; index < 5; index++) {
		await assert.rejects(() => auth.login('wrong password', 2_000 + index), (e: unknown) => e instanceof AuthError && e.status === 401)
	}
	await assert.rejects(() => auth.login('correct horse battery staple', 2_010), (e: unknown) => e instanceof AuthError && e.status === 429)
	const result = await auth.login('correct horse battery staple', 1_000_000)
	assert.ok(result.token)
})

test('session cookie is HttpOnly, Strict and cleared on logout', () => {
	const token = 'a'.repeat(64)
	const cookie = getSessionCookie(token, 'http://localhost:5173')
	assert.match(cookie, /HttpOnly/)
	assert.match(cookie, /SameSite=Strict/)
	assert.doesNotMatch(cookie, /Secure/)
	assert.match(getSessionCookie(token, 'https://localhost'), /Secure/)
	assert.equal(parseSessionCookie(`other=x; freeform_session=${token}; third=y`), token)
	assert.equal(parseSessionCookie('freeform_session=invalid'), null)
	assert.match(getSessionCookie(null, 'http://localhost:5173'), /Max-Age=0/)
})

test('auth accepts only same-origin loopback requests and protects unsafe mutations', () => {
	assert.doesNotThrow(() => assertLocalAuthRequest(request('/api/me')))
	assert.doesNotThrow(() => assertLocalAuthRequest(request('/api/login', 'POST')))
	assert.throws(() => assertLocalAuthRequest(request('/api/login', 'POST', 'https://evil.example')), (e: unknown) => e instanceof AuthError && e.status === 403)
	assert.throws(() => assertLocalAuthRequest(new Request('https://example.com/api/me')), (e: unknown) => e instanceof AuthError && e.status === 403)
	assert.throws(() => assertLocalAuthRequest(new Request('http://localhost:5173/api/login', { method: 'POST' })), (e: unknown) => e instanceof AuthError && e.status === 403)
})

test('MCP tokens reveal their secret once, authenticate only while listed, and revoke by id', async () => {
	const auth = new OwnerAuthService(new MemoryStore())
	const now = Date.now()
	const registered = await auth.register('correct horse battery staple', true, now)
	const created = await auth.createMcpToken(registered.token, now + 1)
	assert.match(created.token, /^ffm_[0-9a-f]{64}$/)
	assert.deepEqual(await auth.listMcpTokens(registered.token), { tokens: [{ id: created.id, createdAt: now + 1 }] })
	assert.equal(await auth.verifyMcpToken(created.token), true)
	assert.equal(await auth.verifyMcpToken('ffm_' + '0'.repeat(64)), false)
	assert.deepEqual(await auth.revokeMcpToken(registered.token, created.id), { revoked: true })
	assert.equal(await auth.verifyMcpToken(created.token), false)
})

test('MCP token creation requires the owner session and has a fixed maximum', async () => {
	const auth = new OwnerAuthService(new MemoryStore())
	const { token } = await auth.register('correct horse battery staple', true)
	await assert.rejects(() => auth.createMcpToken(null), (e: unknown) => e instanceof AuthError && e.status === 401)
	for (let index = 0; index < 8; index++) await auth.createMcpToken(token, 2_000 + index)
	await assert.rejects(() => auth.createMcpToken(token), (e: unknown) => e instanceof AuthError && e.status === 429)
})
