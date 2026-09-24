import assert from 'node:assert/strict'
import test from 'node:test'
import { DiagramSchema, diagramShapeKey } from '../shared/diagram'
import { assertDiagramStored, claimProposal, createProposal, finishProposal, pruneProposals, type StoredProposal } from './diagramProposals'

const diagram = {
	title: 'Request flow',
	nodes: [
		{ id: 'browser', kind: 'rectangle', label: 'Browser', x: 0, y: 0, w: 160, h: 80, color: 'blue' },
		{ id: 'server', kind: 'rectangle', label: 'Server', x: 260, y: 0, w: 160, h: 80, color: 'black' },
	],
	edges: [{ id: 'request', from: 'browser', to: 'server', label: 'request' }],
}

test('only bounded diagrams with valid unique endpoints pass validation', () => {
	assert.equal(DiagramSchema.safeParse(diagram).success, true)
	assert.equal(DiagramSchema.safeParse({ ...diagram, nodes: [...diagram.nodes, diagram.nodes[0]] }).success, false)
	assert.equal(DiagramSchema.safeParse({ ...diagram, edges: [{ id: 'bad', from: 'browser', to: 'missing' }] }).success, false)
	assert.equal(DiagramSchema.safeParse({ ...diagram, nodes: [{ ...diagram.nodes[0], x: Infinity }] }).success, false)
	assert.equal(DiagramSchema.safeParse({ ...diagram, execute: 'anything' }).success, false)
	assert.equal(DiagramSchema.safeParse({ ...diagram, nodes: Array.from({ length: 81 }, (_, i) => ({ ...diagram.nodes[0], id: `n${i}` })) }).success, false)
})

test('a proposal stays separate until one browser claims it; expired leases retry safely', () => {
	const state: StoredProposal[] = []
	const proposal = createProposal(state, DiagramSchema.parse(diagram), 1_000, 'test-proposal')
	assert.equal(state.length, 1)
	assert.equal(proposal.status, 'pending')
	claimProposal(state, proposal.id, 'browser-one', 2_000)
	assert.throws(() => claimProposal(state, proposal.id, 'browser-two', 2_001), /already being applied/)
	assert.equal(claimProposal(state, proposal.id, 'browser-one', 2_002).id, proposal.id)
	assert.throws(() => finishProposal(state, proposal.id, 'browser-two'), /claim does not match/)
	claimProposal(state, proposal.id, 'browser-two', 63_000)
	finishProposal(state, proposal.id, 'browser-two')
	assert.equal(state.length, 0)
})

test('the queue rejects overflow and expires stale proposals', () => {
	const state: StoredProposal[] = []
	const parsed = DiagramSchema.parse(diagram)
	for (let i = 0; i < 20; i++) createProposal(state, parsed, 1_000, `p${i}`)
	assert.throws(() => createProposal(state, parsed, 1_000, 'overflow'), /20 pending/)
	assert.equal(pruneProposals(state, 1_000 + 24 * 60 * 60 * 1_000).length, 0)
})

test('acknowledgement waits for all native shapes and bindings on the target page', () => {
	const state: StoredProposal[] = []
	const proposal = createProposal(state, DiagramSchema.parse(diagram), 1_000, 'receipt', 'page:one')
	const shape = (id: string, kind: 'node' | 'edge') => ({ id: `shape:${diagramShapeKey(proposal.id, id, kind)}`, typeName: 'shape', parentId: 'page:one', meta: { diagramProposal: proposal.id } })
	const nodeA = shape('browser', 'node'), nodeB = shape('server', 'node'), arrow = shape('request', 'edge')
	const records = [{ id: 'page:one', typeName: 'page' }, nodeA, nodeB, arrow, ...(['start', 'end'] as const).map((terminal) => ({
		id: `binding:diagram-${proposal.id}-request-${terminal}`, typeName: 'binding', fromId: arrow.id, toId: terminal === 'start' ? nodeA.id : nodeB.id,
	}))]
	assert.throws(() => assertDiagramStored(proposal, []), /Waiting for/)
	assert.throws(() => assertDiagramStored(proposal, records.slice(0, -1)), /Waiting for/)
	assert.throws(() => assertDiagramStored(proposal, records.map((record) => record.id === nodeA.id ? { ...record, parentId: 'page:other' } : record)), /Waiting for/)
	assert.doesNotThrow(() => assertDiagramStored(proposal, records))
})
