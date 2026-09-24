import assert from 'node:assert/strict'
import test from 'node:test'
import { handleUnknownRequest } from './navigation'

function request(path: string, method = 'GET') {
	return new Request(`https://freeform.example${path}`, { method })
}

test('single-segment board navigation falls through to the SPA asset handler', async () => {
	const calls: string[] = []
	const assets = { fetch: async (url: string) => {
		calls.push(new URL(url).pathname)
		return new Response('<!doctype html><title>FreeForm</title>', { headers: { 'content-type': 'text/html' } })
	} }
	for (const method of ['GET', 'HEAD']) {
		const result = await handleUnknownRequest(request('/board-123?d=v1', method), assets)
		assert.equal(result.status, 200)
		assert.match(result.headers.get('content-type') ?? '', /text\/html/)
	}
	assert.deepEqual(calls, ['/board-123', '/board-123'])
})

test('unknown API, nested, asset, and mutation routes remain 404', async () => {
	let calls = 0
	const assets = { fetch: async () => { calls++; return new Response('unexpected') } }
	for (const [path, method] of [
		['/api', 'GET'],
		['/api/missing', 'GET'],
		['/mcp', 'GET'],
		['/mcp/missing', 'GET'],
		['/board%2F123', 'GET'],
		['/missing.png', 'GET'],
		['/nested/board', 'GET'],
		['/board-123', 'POST'],
	] as const) {
		const result = await handleUnknownRequest(request(path, method), assets)
		assert.equal(result.status, 404, `${method} ${path}`)
	}
	assert.equal(calls, 0)
})
