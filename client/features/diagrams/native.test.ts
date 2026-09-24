import assert from 'node:assert/strict'
import test from 'node:test'
import { DiagramSchema } from '../../../shared/diagram'
import { createNativeDiagram, diagramBounds, nonOverlappingOffset } from './native'
import { PageRecordType } from '@tldraw/tlschema'

const diagram = DiagramSchema.parse({
	title: 'Example',
	nodes: [{ id: 'a', kind: 'rectangle', label: 'A', x: 0, y: 0 }, { id: 'b', kind: 'diamond', label: 'B', x: 300, y: 0 }],
	edges: [{ id: 'ab', from: 'a', to: 'b', label: 'next' }],
})

test('native notes and preview bounds use square width-based sizing', () => {
	const notes = DiagramSchema.parse({ title: 'Note', nodes: [{ id: 'note', kind: 'note', label: 'Idea', x: 20, y: 30, w: 120, h: 80 }] })
	const result = createNativeDiagram(notes, 'note-sizing', PageRecordType.createId('one'))
	assert.equal(result.shapes[0].type, 'note')
	assert.equal(result.shapes[0].props?.scale, 0.6)
	assert.deepEqual(diagramBounds(notes), { x: 20, y: 30, w: 120, h: 120 })
})

test('conversion uses stable distinct IDs and two correct arrow bindings', () => {
	const pageId = PageRecordType.createId('one')
	const first = createNativeDiagram(diagram, 'proposal-one', pageId, { x: 100, y: 200 })
	const repeated = createNativeDiagram(diagram, 'proposal-one', pageId, { x: 100, y: 200 })
	const another = createNativeDiagram(diagram, 'proposal-two', pageId, { x: 100, y: 200 })
	assert.deepEqual(first, repeated)
	assert.equal(first.shapes.length, 3)
	assert.equal(first.bindings.length, 2)
	assert.notEqual(first.shapes[0].id, another.shapes[0].id)
	assert.equal(first.shapes[0].x, 100)
	assert.equal(first.shapes[0].y, 200)
	assert.ok(first.shapes.every((shape) => shape.parentId === 'page:one'))
	assert.equal(first.bindings[0].fromId, first.shapes[2].id)
	assert.equal(first.bindings[0].toId, first.shapes[0].id)
	assert.equal(first.bindings[1].toId, first.shapes[1].id)
})

test('overlapping diagrams move past existing rectangle and text bounds', () => {
	const rectangle = { x: 0, y: 0, w: 400, h: 200 }
	const text = { x: 350, y: 100, w: 450, h: 80 }
	const bounds = { x: 100, y: 50, w: 500, h: 200 }
	const offset = nonOverlappingOffset(bounds, [rectangle, text])
	assert.equal(bounds.x + offset.x, text.x + text.w + 80)
	assert.equal(bounds.y + offset.y, bounds.y)
	assert.deepEqual(rectangle, { x: 0, y: 0, w: 400, h: 200 })
})

test('placement preserves clear source coordinates and the requested gap', () => {
	const diagramBounds = { x: -100, y: -200, w: 200, h: 200 }
	assert.deepEqual(nonOverlappingOffset(diagramBounds, []), { x: 0, y: 0 })
	assert.deepEqual(nonOverlappingOffset(diagramBounds, [{ x: 500, y: 500, w: 300, h: 300 }]), { x: 0, y: 0 })
	assert.deepEqual(nonOverlappingOffset({ x: 80, y: 0, w: 100, h: 100 }, [{ x: -100, y: 0, w: 100, h: 100 }]), { x: 0, y: 0 })
	assert.deepEqual(nonOverlappingOffset({ x: 79, y: 0, w: 100, h: 100 }, [{ x: -100, y: 0, w: 100, h: 100 }]), { x: 1, y: 0 })
})
