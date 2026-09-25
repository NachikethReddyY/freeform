import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AuthRequestError, getSession, login, logout, register, validateSetup } from './authClient'

function response(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('a returning owner is recognized after refresh without sending a password', async () => {
	const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
	const fetcher: typeof fetch = async (input, init) => {
		calls.push({ input, init })
		return response(200, { authenticated: true, setupRequired: false, owner: { id: 'local-owner' } })
	}

	assert.deepEqual(await getSession(fetcher), { authenticated: true, setupRequired: false, owner: { id: 'local-owner' } })
	assert.equal(calls.length, 1)
	assert.equal(calls[0]?.input, '/api/me')
	assert.equal(calls[0]?.init?.credentials, 'same-origin')
	assert.equal(calls[0]?.init?.cache, 'no-store')
	assert.equal(calls[0]?.init?.body, undefined)
})

test('setup requires an explicit board claim and matching 12-character passwords', () => {
	assert.equal(validateSetup('long enough password', 'long enough password', false), 'Confirm that this account will keep the existing local boards.')
	assert.equal(validateSetup('short', 'short', true), 'Use at least 12 characters for your password.')
	assert.equal(validateSetup('long enough password', 'different password', true), 'Passwords do not match.')
	assert.equal(validateSetup('long enough password', 'long enough password', true), null)
})

test('setup sends a board claim, and logout never clears local board storage', async () => {
	const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
	const fetcher: typeof fetch = async (input, init) => {
		calls.push({ input, init })
		return response(200, input === '/api/logout'
			? { authenticated: false, setupRequired: false, owner: null }
			: { authenticated: true, setupRequired: false, owner: { id: 'local-owner' } })
	}

	await register('long enough password', fetcher)
	await logout(fetcher)
	assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
		password: 'long enough password',
		claimExistingBoards: true,
	})
	assert.equal(calls[1]?.input, '/api/logout')
	assert.equal(calls[1]?.init?.credentials, 'same-origin')
})

test('wrong password leaves the owner signed out with the server message', async () => {
	const fetcher: typeof fetch = async () => response(401, { error: 'Invalid password' })
	await assert.rejects(() => login('wrong password', fetcher), (error: unknown) => {
		assert.ok(error instanceof AuthRequestError)
		assert.equal(error.status, 401)
		assert.equal(error.message, 'Invalid password')
		return true
	})
})
