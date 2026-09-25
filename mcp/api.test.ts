import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createBoardApiRequester, loadAgentToken, localBaseUrl } from './api'

const token = `ffm_${'a'.repeat(64)}`
const local = localBaseUrl('http://127.0.0.1:5173')

test('agent token prefers the environment and reads only a private regular file', async (context) => {
	const directory = await mkdtemp(join(tmpdir(), 'freeform-mcp-'))
	context.after(() => rm(directory, { recursive: true, force: true }))
	const file = join(directory, 'token')
	await writeFile(file, `ffm_${'b'.repeat(64)}\n`, { mode: 0o600 })
	assert.equal(await loadAgentToken({ environment: { WBOARD_TOKEN: token }, tokenFile: file }), token)
	assert.equal(await loadAgentToken({ environment: {}, tokenFile: file }), `ffm_${'b'.repeat(64)}`)
	assert.equal((await readFile(file, 'utf8')).trim(), `ffm_${'b'.repeat(64)}`)
	await chmod(file, 0o644)
	await assert.rejects(loadAgentToken({ environment: {}, tokenFile: file }), /chmod 600/)
	const link = join(directory, 'linked-token')
	await symlink(file, link)
	await assert.rejects(loadAgentToken({ environment: {}, tokenFile: link }), /regular file/)
	await assert.rejects(loadAgentToken({ environment: { WBOARD_TOKEN: 'not-a-token' }, tokenFile: file }), /WBOARD_TOKEN/)
	await assert.rejects(loadAgentToken({ environment: {}, tokenFile: join(directory, 'missing') }), /agent token/i)
})

test('every board request carries the bearer token without changing its payload', async () => {
	const seen: Array<{ url: string; init: RequestInit }> = []
	const requester = createBoardApiRequester({
		loadToken: async () => token,
		fetcher: async (url, init) => {
			seen.push({ url: String(url), init: init ?? {} })
			return Response.json({ ok: true })
		},
	})
	await requester('/api/rooms/example/board', {}, local)
	await requester('/api/rooms/example/proposals', { method: 'POST', headers: { 'X-Test': 'value', Authorization: 'Bearer wrong' }, body: '{"diagram":{}}' }, local)
	assert.equal(seen.length, 2)
	for (const request of seen) {
		const headers = new Headers(request.init.headers)
		assert.equal(headers.get('Authorization'), `Bearer ${token}`)
		assert.equal(headers.get('Content-Type'), 'application/json')
		assert.equal(request.init.redirect, 'error')
	}
	assert.equal(seen[1].init.body, '{"diagram":{}}')
	assert.equal(new Headers(seen[1].init.headers).get('X-Test'), 'value')
})

test('missing or rejected tokens fail clearly without a request or secret in the error', async () => {
	let called = false
	const missing = createBoardApiRequester({
		loadToken: async () => { throw new Error('Create a FreeForm agent token first') },
		fetcher: async () => { called = true; return Response.json({ ok: true }) },
	})
	await assert.rejects(missing('/api/rooms/example/board', {}, local), /Create a FreeForm agent token first/)
	assert.equal(called, false)
	const rejected = createBoardApiRequester({
		loadToken: async () => token,
		fetcher: async () => Response.json({ error: 'Sign in to access this board' }, { status: 401 }),
	})
	await assert.rejects(rejected('/api/rooms/example/board', {}, local), (error: unknown) => {
		assert.match(String(error), /agent token.*rejected or revoked/i)
		assert.ok(!String(error).includes(token))
		return true
	})
})

test('board requester rejects a normalized path outside the protected room API', async () => {
	const requester = createBoardApiRequester({
		loadToken: async () => token,
		fetcher: async () => { throw new Error('Unexpected network request') },
	})
	await assert.rejects(requester('/api/rooms/../../api/me', {}, local), /room routes/)
	await assert.rejects(requester('/api/rooms/example/board#fragment', {}, local), /room routes/)
	await assert.rejects(requester('/api/rooms/example/board', {}, new URL('https://example.com')), /loopback origin/)
})
