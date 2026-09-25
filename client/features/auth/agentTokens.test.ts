import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAgentToken, listAgentTokens, revokeAgentToken } from './agentTokens'

test('agent token secret is returned only by create, never by list or revoke', async () => {
	const calls: Array<{ path: RequestInfo | URL; init?: RequestInit }> = []
	const fetcher: typeof fetch = async (path, init) => {
		calls.push({ path, init })
		if (init?.method === 'POST') return new Response(JSON.stringify({ id: 'token-1', token: 'secret-once', createdAt: 1 }), { status: 201 })
		if (init?.method === 'DELETE') return new Response(JSON.stringify({ revoked: true }), { status: 200 })
		return new Response(JSON.stringify({ tokens: [{ id: 'token-1', createdAt: 1 }] }), { status: 200 })
	}

	assert.deepEqual(await listAgentTokens(fetcher), [{ id: 'token-1', createdAt: 1 }])
	assert.deepEqual(await createAgentToken(fetcher), { id: 'token-1', token: 'secret-once', createdAt: 1 })
	await revokeAgentToken('token-1', fetcher)
	assert.equal(calls[0]?.init?.credentials, 'same-origin')
	assert.equal(calls[1]?.init?.method, 'POST')
	assert.equal(calls[2]?.init?.method, 'DELETE')
	assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), { id: 'token-1' })
})
