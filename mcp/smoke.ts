import assert from 'node:assert/strict'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { DiagramSchema } from '../shared/diagram'
import { loadAgentToken, localBaseUrl, requestBoardApi } from './api'
import { connectWboard } from './client'

const roomId = `mcp-smoke-${Date.now()}`
const base = localBaseUrl()
const authorization = { Authorization: `Bearer ${await loadAgentToken()}` }
const client = await connectWboard()
let proposalId: string | undefined
let sqlProposalId: string | undefined
let openApiProposalId: string | undefined
const call = async (name: string, args: Record<string, unknown>) => {
	const response = CallToolResultSchema.parse(await client.callTool({ name, arguments: args }))
	assert.equal(response.isError, undefined, JSON.stringify(response.content))
	assert.ok(response.structuredContent)
	return response.structuredContent
}

try {
	const { tools } = await client.listTools()
	assert.deepEqual(tools.map((tool) => tool.name).sort(), ['list_proposals', 'propose_diagram', 'propose_openapi_map', 'propose_sql_erd', 'read_board'])
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
	const sqlCreated = await call('propose_sql_erd', {
		roomId,
		sql: 'CREATE TABLE users (id UUID PRIMARY KEY); CREATE TABLE orders (id INT PRIMARY KEY, user_id UUID REFERENCES users(id));',
	})
	const sqlProposal = z.object({ id: z.string(), diagram: DiagramSchema }).parse(sqlCreated.proposal)
	sqlProposalId = sqlProposal.id
	assert.equal(sqlProposal.diagram.edges.length, 1)
	const openApiCreated = await call('propose_openapi_map', {
		roomId,
		openapi: JSON.stringify({ openapi: '3.1.0', info: { title: 'Smoke API', version: '1' }, paths: { '/orders': { get: { summary: 'List orders' } } } }),
	})
	const openApiProposal = z.object({ id: z.string(), diagram: DiagramSchema }).parse(openApiCreated.proposal)
	openApiProposalId = openApiProposal.id
	assert.equal(openApiProposal.diagram.nodes.length, 3)
	assert.equal(openApiProposal.diagram.edges.length, 2)
	const pending = await call('list_proposals', { roomId })
	assert.ok(Array.isArray(pending.proposals))
	assert.equal(pending.proposals.length, 3)
	const after = await call('read_board', { roomId })
	assert.deepEqual(after, before, 'A proposal must not modify the board')
	const invalid = CallToolResultSchema.parse(await client.callTool({ name: 'propose_diagram', arguments: { roomId, diagram: { title: 'Bad', nodes: [] } } }))
	assert.equal(invalid.isError, true)
	const invalidSql = CallToolResultSchema.parse(await client.callTool({ name: 'propose_sql_erd', arguments: { roomId, sql: 'DROP TABLE users;' } }))
	assert.equal(invalidSql.isError, true)
	const invalidOpenApi = CallToolResultSchema.parse(await client.callTool({ name: 'propose_openapi_map', arguments: { roomId, openapi: '{"openapi":"2.0"}' } }))
	assert.equal(invalidOpenApi.isError, true)
	assert.equal(((await call('list_proposals', { roomId })).proposals as unknown[]).length, 3, 'Invalid source must not queue a proposal')
	const crossOrigin = await fetch(new URL(`/api/rooms/${roomId}/board`, base), { headers: { ...authorization, Origin: 'https://example.invalid' } })
	assert.equal(crossOrigin.status, 403)
	const oversized = await fetch(new URL(`/api/rooms/${roomId}/proposals`, base), { method: 'POST', headers: { ...authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(65_536) }) })
	assert.equal(oversized.status, 413)
	const premature = await fetch(new URL(`/api/rooms/${roomId}/proposals/${proposalId}/applied`, base), { method: 'POST', headers: { ...authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ claimId: 'smoke-no-claim' }) })
	assert.equal(premature.status, 409)
	assert.deepEqual(await call('read_board', { roomId }), before, 'Rejected acknowledgement must not mutate board records')
	await requestBoardApi(`/api/rooms/${roomId}/proposals/${proposalId}`, { method: 'DELETE' })
	await requestBoardApi(`/api/rooms/${roomId}/proposals/${sqlProposalId}`, { method: 'DELETE' })
	await requestBoardApi(`/api/rooms/${roomId}/proposals/${openApiProposalId}`, { method: 'DELETE' })
	const completed = await call('list_proposals', { roomId })
	assert.deepEqual(completed.proposals, [])
	console.log(JSON.stringify({ passed: true, checks: ['MCP initialize', 'tool discovery', 'board read', 'diagram proposal queued', 'SQL ERD proposal queued', 'OpenAPI map proposal queued', 'board unchanged before acceptance', 'invalid diagram, SQL and OpenAPI rejected', 'cross-origin rejected', 'oversized body rejected', 'premature acknowledgement rejected', 'proposals dismissed without board mutation'], roomId, modelCalls: 0 }))
} finally {
	if (proposalId) await requestBoardApi(`/api/rooms/${roomId}/proposals/${proposalId}`, { method: 'DELETE' }).catch(() => undefined)
	if (sqlProposalId) await requestBoardApi(`/api/rooms/${roomId}/proposals/${sqlProposalId}`, { method: 'DELETE' }).catch(() => undefined)
	if (openApiProposalId) await requestBoardApi(`/api/rooms/${roomId}/proposals/${openApiProposalId}`, { method: 'DELETE' }).catch(() => undefined)
	await client.close()
}
