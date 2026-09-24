import assert from 'node:assert/strict'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { localBaseUrl, requestBoardApi } from './api'
import { connectWboard } from './client'

const roomId = `mcp-smoke-${Date.now()}`
const base = localBaseUrl()
const client = await connectWboard()
let proposalId: string | undefined
const call = async (name: string, args: Record<string, unknown>) => {
	const response = CallToolResultSchema.parse(await client.callTool({ name, arguments: args }))
	assert.equal(response.isError, undefined, JSON.stringify(response.content))
	assert.ok(response.structuredContent)
	return response.structuredContent
}

try {
	const { tools } = await client.listTools()
	assert.deepEqual(tools.map((tool) => tool.name).sort(), ['list_proposals', 'propose_diagram', 'read_board'])
	const before = await call('read_board', { roomId })
	const created = await call('propose_diagram', {
		roomId,
		diagram: {
			title: 'MCP smoke fixture',
			nodes: [
				{ id: 'browser', kind: 'rectangle', label: 'Browser', x: 0, y: 0 },
				{ id: 'api', kind: 'rectangle', label: 'Local API', x: 260, y: 0, color: 'blue' },
			],
			edges: [{ id: 'request', from: 'browser', to: 'api' }],
		},
	})
	assert.ok(created.proposal && typeof created.proposal === 'object' && 'id' in created.proposal)
	proposalId = String(created.proposal.id)
	const pending = await call('list_proposals', { roomId })
	assert.ok(Array.isArray(pending.proposals))
	assert.equal(pending.proposals.length, 1)
	const after = await call('read_board', { roomId })
	assert.deepEqual(after, before, 'A proposal must not modify the board')
	const invalid = CallToolResultSchema.parse(await client.callTool({ name: 'propose_diagram', arguments: { roomId, diagram: { title: 'Bad', nodes: [] } } }))
	assert.equal(invalid.isError, true)
	const crossOrigin = await fetch(new URL(`/api/rooms/${roomId}/board`, base), { headers: { Origin: 'https://example.invalid' } })
	assert.equal(crossOrigin.status, 403)
	const oversized = await fetch(new URL(`/api/rooms/${roomId}/proposals`, base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(65_536) }) })
	assert.equal(oversized.status, 413)
	const premature = await fetch(new URL(`/api/rooms/${roomId}/proposals/${proposalId}/applied`, base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claimId: 'smoke-no-claim' }) })
	assert.equal(premature.status, 409)
	assert.deepEqual(await call('read_board', { roomId }), before, 'Rejected acknowledgement must not mutate board records')
	await requestBoardApi(`/api/rooms/${roomId}/proposals/${proposalId}`, { method: 'DELETE' })
	const completed = await call('list_proposals', { roomId })
	assert.deepEqual(completed.proposals, [])
	console.log(JSON.stringify({ passed: true, checks: ['MCP initialize', 'tool discovery', 'board read', 'diagram proposal queued', 'board unchanged before acceptance', 'invalid diagram rejected', 'cross-origin rejected', 'oversized body rejected', 'premature acknowledgement rejected', 'proposal dismissed without board mutation'], roomId, modelCalls: 0 }))
} finally {
	if (proposalId) await requestBoardApi(`/api/rooms/${roomId}/proposals/${proposalId}`, { method: 'DELETE' }).catch(() => undefined)
	await client.close()
}
