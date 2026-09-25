import assert from 'node:assert/strict'
import { test } from 'node:test'
import { wboardChildEnvironment } from './client'

test('SDK child environment forwards an explicit agent token and the local origin', () => {
	const environment = wboardChildEnvironment({ PATH: '/usr/bin' }, 'http://localhost:5173', { WBOARD_TOKEN: 'example' })
	assert.deepEqual(environment, { PATH: '/usr/bin', WBOARD_URL: 'http://localhost:5173', WBOARD_TOKEN: 'example' })
	assert.deepEqual(wboardChildEnvironment({ PATH: '/usr/bin' }, 'http://localhost:5173', {}), { PATH: '/usr/bin', WBOARD_URL: 'http://localhost:5173' })
})
