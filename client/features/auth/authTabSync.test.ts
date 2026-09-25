import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAuthTabSync } from './authTabSync'

test('signing out in one tab gates another tab, and focus rechecks a missed event', async () => {
	const focus = new EventTarget()
	const channelName = `freeform-auth-test-${crypto.randomUUID()}`
	let gated = 0
	let rechecked = 0
	let delivered!: () => void
	const received = new Promise<void>((resolve) => { delivered = resolve })
	const first = createAuthTabSync(() => {}, () => {}, { channelName, focusTarget: null })
	const second = createAuthTabSync(() => { gated++; delivered() }, () => { rechecked++ }, { channelName, focusTarget: focus })
	try {
		first.broadcastSignOut()
		await received
		assert.equal(gated, 1)
		focus.dispatchEvent(new Event('focus'))
		assert.equal(rechecked, 1)
	} finally {
		first.close()
		second.close()
	}
	focus.dispatchEvent(new Event('focus'))
	assert.equal(rechecked, 1)
})
