import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AuthenticatedWorkspace, beginSessionRecheck, completeSessionRecheck } from './authGateState'

const signedIn = { kind: 'signed-in' as const, ownerId: 'owner-one' }

test('focus recheck retains a signed-in workspace until the same owner is verified', () => {
	const checking = beginSessionRecheck(signedIn)
	assert.deepEqual(checking, { ...signedIn, verifying: true })
	const markup = renderToStaticMarkup(<AuthenticatedWorkspace checking><span>Slide 2</span></AuthenticatedWorkspace>)
	assert.match(markup, /Slide 2/, 'the presenter remains mounted during the recheck')
	assert.match(markup, /inert=""/, 'the retained board cannot be used while credentials are checked')
	assert.match(markup, /visibility:hidden/, 'cached board content is hidden while credentials are checked')
	assert.match(markup, /Opening FreeForm/)
	assert.deepEqual(completeSessionRecheck(checking, { authenticated: true, setupRequired: false, owner: { id: 'owner-one' } }), signedIn)
})

test('an invalid or different owner session does not retain the old workspace', () => {
	const checking = beginSessionRecheck(signedIn)
	assert.deepEqual(completeSessionRecheck(checking, { authenticated: false, setupRequired: false, owner: null }), { kind: 'signed-out' })
	assert.deepEqual(completeSessionRecheck(checking, { authenticated: true, setupRequired: false, owner: { id: 'owner-two' } }), { kind: 'signed-in', ownerId: 'owner-two' })
})
