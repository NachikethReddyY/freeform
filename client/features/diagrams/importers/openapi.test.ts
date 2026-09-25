import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DiagramSchema } from '../../../../shared/diagram'
import { parseOpenApiJson } from './openapi'

const spec = {
	openapi: '3.1.0',
	info: { title: 'Shop API', version: '1.0.0' },
	paths: {
		'/users': {
			get: { tags: ['Accounts'], summary: 'List users' },
			post: { tags: ['Accounts'], summary: 'Create user' },
		},
		'/orders/{id}': {
			get: { summary: 'Get order' },
		},
	},
}

test('OpenAPI operations become editable API, resource, and endpoint nodes', () => {
	const diagram = parseOpenApiJson(JSON.stringify(spec))
	assert.equal(diagram.title, 'Shop API')
	assert.equal(diagram.nodes.length, 6)
	assert.equal(diagram.edges.length, 5)
	assert.ok(diagram.nodes.some((node) => node.label === 'Accounts'))
	assert.ok(diagram.nodes.some((node) => node.label === 'orders'))
	assert.ok(diagram.nodes.some((node) => node.label === 'GET /users\nList users'))
	assert.ok(diagram.nodes.some((node) => node.label === 'POST /users\nCreate user'))
	assert.ok(diagram.nodes.some((node) => node.label === 'GET /orders/{id}\nGet order'))
	assert.deepEqual(DiagramSchema.parse(diagram), diagram)
	const ids = new Set(diagram.nodes.map((node) => node.id))
	assert.ok(diagram.edges.every((edge) => ids.has(edge.from) && ids.has(edge.to)))
})

test('OpenAPI JSON code blocks and tags with special characters work as plain text', () => {
	const tagged = { ...spec, paths: { '/ping': { get: { tags: ['Auth & IAM'], summary: '<healthy>' } } } }
	const diagram = parseOpenApiJson(`\`\`\`json\n${JSON.stringify(tagged)}\n\`\`\``)
	assert.ok(diagram.nodes.some((node) => node.label === 'Auth & IAM'))
	assert.ok(diagram.nodes.some((node) => node.label === 'GET /ping\n<healthy>'))
})

test('empty summaries use operation IDs when present and otherwise keep method and path', () => {
	const source = { ...spec, paths: { '/ping': { get: { summary: '  ', operationId: 'checkHealth' }, head: { summary: '' } } } }
	const diagram = parseOpenApiJson(JSON.stringify(source))
	assert.ok(diagram.nodes.some((node) => node.label === 'GET /ping\ncheckHealth'))
	assert.ok(diagram.nodes.some((node) => node.label === 'HEAD /ping'))
})

test('rejects invalid JSON and unsupported API documents explicitly', () => {
	assert.throws(() => parseOpenApiJson('{'), /valid JSON/i)
	assert.throws(() => parseOpenApiJson('{}'), /OpenAPI 3/i)
	assert.throws(() => parseOpenApiJson(JSON.stringify({ ...spec, openapi: '2.0' })), /OpenAPI 3/i)
	assert.throws(() => parseOpenApiJson(JSON.stringify({ ...spec, paths: {} })), /at least one operation/i)
	assert.throws(() => parseOpenApiJson(JSON.stringify({ ...spec, paths: { '/users': { $ref: '#/components/pathItems/Users' } } })), /reference/i)
})

test('rejects invalid path items and operations instead of silently omitting them', () => {
	assert.throws(() => parseOpenApiJson(JSON.stringify({ ...spec, paths: { users: { get: {} } } })), /start with \/|path/i)
	assert.throws(() => parseOpenApiJson(JSON.stringify({ ...spec, paths: { '/users': { get: null } } })), /GET \/users/i)
	assert.throws(() => parseOpenApiJson(JSON.stringify({ ...spec, paths: { '/users': null } })), /path item/i)
	assert.throws(() => parseOpenApiJson(JSON.stringify({ ...spec, paths: { '/users': { GET: {} } } })), /unsupported.*GET/i)
	assert.throws(() => parseOpenApiJson(JSON.stringify({ ...spec, paths: { '/users': { connect: {} } } })), /unsupported.*connect/i)
})

test('rejects overlarge input and diagrams before insertion', () => {
	const compact = { ...spec, components: { schemas: { filler: { description: 'x'.repeat(100_000) } } } }
	assert.equal(parseOpenApiJson(JSON.stringify(compact)).nodes.length, 6)
	assert.throws(() => parseOpenApiJson(' '.repeat(1_048_577)), /1 MiB/i)
	const paths = Object.fromEntries(Array.from({ length: 79 }, (_, index) => [`/thing-${index}`, { get: {} }]))
	assert.throws(() => parseOpenApiJson(JSON.stringify({ ...spec, paths })), /80 nodes/i)
})
