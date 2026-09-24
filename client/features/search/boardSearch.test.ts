import assert from 'node:assert/strict'
import test from 'node:test'
import type { Editor, TLPageId, TLShape, TLShapeId } from 'tldraw'
import { findBoardText, jumpToBoardSearchResult, nextSearchResultIndex } from './searchIndex'

const richText = (value: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] })

function fixture() {
	const pageOne = 'page:first' as TLPageId
	const pageTwo = 'page:second' as TLPageId
	const shapes = [
		{ id: 'shape:text', parentId: pageOne, type: 'text', props: { richText: richText('Sketch rectangle') } },
		{ id: 'shape:geo', parentId: pageOne, type: 'geo', props: { richText: richText('Customer intake'), geo: 'rectangle' } },
		{ id: 'shape:note', parentId: pageTwo, type: 'note', props: { richText: richText('Customer interview') } },
		{ id: 'shape:arrow', parentId: pageTwo, type: 'arrow', props: { richText: richText('Customer approves') } },
		{ id: 'shape:frame', parentId: pageTwo, type: 'frame', props: { name: 'Customer journey' } },
	] as unknown as TLShape[]
	const byId = new Map(shapes.map((shape) => [shape.id, shape]))
	const calls: string[] = []
	let currentPageId = pageOne
	let selectedId: TLShapeId | undefined
	const editor = {
		getPages: () => [{ id: pageOne, name: 'Discovery' }, { id: pageTwo, name: 'Delivery' }],
		getPageShapeIds: (id: TLPageId) => new Set(shapes.filter((shape) => shape.parentId === id).map((shape) => shape.id)),
		getShape: (id: TLShapeId) => byId.get(id),
		getCurrentPageId: () => currentPageId,
		setCurrentPage: (id: TLPageId) => { currentPageId = id; calls.push(`page:${id}`) },
		setCurrentTool: (id: string) => { calls.push(`tool:${id}`) },
		select: (id: TLShapeId) => { selectedId = id; calls.push(`select:${id}`) },
		getShapePageBounds: (id: TLShapeId) => id === 'shape:note' ? { x: 100, y: 200, w: 180, h: 120 } : { x: 0, y: 0, w: 100, h: 40 },
		zoomToBounds: () => { calls.push('zoom') },
		getTextOptions: () => ({}),
	} as unknown as Editor
	return { editor, calls, byId, pageTwo, selected: () => selectedId }
}

test('searches labels on text, geo, note and arrow across pages, excluding unrelated shapes', () => {
	const { editor } = fixture()
	const results = findBoardText(editor, 'CUSTOMER')
	assert.deepEqual(results.map((hit) => [hit.kind, hit.pageName]), [
		['geo', 'Discovery'], ['note', 'Delivery'], ['arrow', 'Delivery'],
	])
	assert.ok(results.every((hit) => hit.snippet.toLowerCase().includes('customer')))
	assert.equal(findBoardText(editor, 'journey').length, 0, 'frame names are not board text labels')
	assert.equal(findBoardText(editor, '  ').length, 0)
})

test('uses a context snippet for long multiline text and caps results', () => {
	const { editor, byId } = fixture()
	const shape = byId.get('shape:text' as TLShapeId)!
	byId.set(shape.id, { ...shape, props: { ...shape.props, richText: richText(`${'Earlier notes '.repeat(14)} target phrase ${'later notes '.repeat(14)}`) } } as TLShape)
	const hit = findBoardText(editor, 'target phrase')[0]
	assert.ok(hit.snippet.includes('target phrase'))
	assert.ok(hit.snippet.length <= 100)
	assert.equal(findBoardText(editor, 'customer', 1).length, 1)
})

test('navigates to a hit without modifying document shapes', () => {
	const { editor, calls, byId, pageTwo, selected } = fixture()
	const before = JSON.stringify([...byId.values()])
	const hit = findBoardText(editor, 'interview')[0]
	assert.equal(jumpToBoardSearchResult(editor, hit), true)
	assert.equal(editor.getCurrentPageId(), pageTwo)
	assert.equal(selected(), hit.shapeId)
	assert.deepEqual(calls, [`page:${pageTwo}`, 'tool:select', `select:${hit.shapeId}`, 'zoom'])
	assert.equal(JSON.stringify([...byId.values()]), before)
})

test('a stale or removed result does not switch page', () => {
	const { editor, calls, byId } = fixture()
	const hit = findBoardText(editor, 'interview')[0]
	byId.delete(hit.shapeId)
	assert.equal(jumpToBoardSearchResult(editor, hit), false)
	assert.deepEqual(calls, [])
})

test('keyboard result navigation wraps and stays empty when there are no results', () => {
	assert.equal(nextSearchResultIndex(0, 3, 'down'), 1)
	assert.equal(nextSearchResultIndex(2, 3, 'down'), 0)
	assert.equal(nextSearchResultIndex(0, 3, 'up'), 2)
	assert.equal(nextSearchResultIndex(1, 3, 'up'), 0)
	assert.equal(nextSearchResultIndex(0, 0, 'down'), -1)
	assert.equal(nextSearchResultIndex(0, 0, 'up'), -1)
})
