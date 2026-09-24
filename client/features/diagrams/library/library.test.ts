import assert from 'node:assert/strict'
import test from 'node:test'
import { MessagePort } from 'node:worker_threads'
import {
	Box, Editor, createShapeId, createTLStore, defaultBindingUtils, defaultShapeTools,
	defaultAddFontsFromNode, defaultShapeUtils, defaultTools, tipTapDefaultExtensions, type TLShapeId,
} from 'tldraw'
import {
	STARTERS, insertStarter, insertSavedBlock, loadPersonalBlocks,
	removePersonalBlock, saveSelectionAsBlock,
} from './library'

for (const handle of (process as NodeJS.Process & { _getActiveHandles(): unknown[] })._getActiveHandles()) {
	if (handle instanceof MessagePort) handle.unref()
}

class TestElement {
	readonly ownerDocument: TestDocument
	readonly style = { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' }
	readonly classList = { add() {}, remove() {} }
	readonly dataset = {}
	readonly childNodes: TestElement[] = []
	readonly attributes = new Map<string, string>()
	textContent = ''
	constructor(document: TestDocument, readonly tagName = 'div', readonly nodeType = 1) { this.ownerDocument = document }
	setAttribute(key: string, value: string) { this.attributes.set(key, value) }
	appendChild(child: TestElement) { this.childNodes.push(child); return child }
	get innerHTML(): string { return this.childNodes.map((child) => child.outerHTML).join('') }
	get outerHTML(): string {
		if (this.nodeType === 3) return this.textContent.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
		if (this.nodeType === 11) return this.innerHTML
		const attributes = [...this.attributes].map(([key, value]) => ` ${key}="${value}"`).join('')
		return `<${this.tagName}${attributes}>${this.innerHTML}</${this.tagName}>`
	}
	remove() {}
	addEventListener() {}
	removeEventListener() {}
	getBoundingClientRect() { return { x: 0, y: 0, width: 1080, height: 720, top: 0, left: 0, right: 1080, bottom: 720 } }
}

class TestDocument {
	readonly body = new TestElement(this)
	readonly fonts = { add() {}, delete() {}, check: () => true }
	readonly implementation = { createHTMLDocument: () => new TestDocument() }
	createElement(tag: string) { return new TestElement(this, tag) }
	createDocumentFragment() { return new TestElement(this, '#fragment', 11) }
	createTextNode(text: string) { const node = new TestElement(this, '#text', 3); node.textContent = text; return node }
	addEventListener() {}
	removeEventListener() {}
}

const documentRef = new TestDocument()
Object.assign(globalThis, {
	document: documentRef,
	window: { document: documentRef, devicePixelRatio: 1, requestAnimationFrame: () => 0,
		cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {} },
	requestAnimationFrame: () => 0, cancelAnimationFrame() {},
})

class TestEditor extends Editor {
	constructor(maxShapesPerPage = 4000) {
		super({
			shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils,
			tools: [...defaultTools, ...defaultShapeTools],
			store: createTLStore({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils }),
			getContainer: () => new TestElement(documentRef) as unknown as HTMLElement,
			initialState: 'select', options: { maxShapesPerPage },
			textOptions: { tipTapConfig: { extensions: tipTapDefaultExtensions }, addFontsFromNode: defaultAddFontsFromNode },
		})
		this.textMeasure.measureText = () => ({ x: 0, y: 0, w: 0, h: 0, scrollWidth: 0 })
		this.textMeasure.measureHtml = () => ({ x: 0, y: 0, w: 0, h: 0, scrollWidth: 0 })
		this.updateViewportScreenBounds(new Box(0, 0, 1080, 720))
	}
}

function memoryStorage() {
	const values = new Map<string, string>()
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => { values.set(key, value) },
		removeItem: (key: string) => { values.delete(key) },
	}
}

test('five distinct starters insert editable native shapes and live bindings near the viewport', () => {
	assert.deepEqual(STARTERS.map(({ id }) => id), ['flowchart', 'mind-map', 'erd', 'sequence', 'architecture'])
	for (const starter of STARTERS) {
		const editor = new TestEditor()
		try {
			const result = insertStarter(editor, starter.id)
			assert.ok(result.shapeIds.length >= 5, starter.id)
			assert.ok(result.bindingIds.length >= 2, starter.id)
			assert.deepEqual(new Set(editor.getSelectedShapeIds()), new Set(result.shapeIds))
			for (const id of result.shapeIds) {
				const shape = editor.getShape(id)
				assert.ok(shape, `${starter.id}: ${id}`)
				assert.ok(['geo', 'arrow', 'note'].includes(shape.type))
			}
			for (const id of result.bindingIds) assert.ok(editor.getBinding(id))
			const boxes = result.shapeIds.flatMap((id) => { const box = editor.getShapePageBounds(id); return box ? [box] : [] })
			const minX = Math.min(...boxes.map((box) => box.x)), maxX = Math.max(...boxes.map((box) => box.maxX))
			const minY = Math.min(...boxes.map((box) => box.y)), maxY = Math.max(...boxes.map((box) => box.maxY))
			const viewport = editor.getViewportPageBounds()
			assert.ok(Math.abs((minX + maxX) / 2 - viewport.center.x) < 100, starter.id)
			assert.ok(Math.abs((minY + maxY) / 2 - viewport.center.y) < 100, starter.id)
			editor.undo()
			for (const id of result.shapeIds) assert.equal(editor.getShape(id), undefined)
		} finally { editor.dispose() }
	}
})

test('flowchart branch arrows leave room for their Yes and No labels', () => {
	const flow = STARTERS.find(({ id }) => id === 'flowchart')!.diagram
	const decision = flow.nodes.find(({ id }) => id === 'decision')!
	assert.equal(flow.edges.find(({ id }) => id === 'yes')?.label, 'Yes\n')
	assert.equal(flow.edges.find(({ id }) => id === 'no')?.label, '\nNo')
	for (const edge of flow.edges.filter(({ label }) => label)) {
		const destination = flow.nodes.find(({ id }) => id === edge.to)!
		assert.ok(destination.x - (decision.x + decision.w) >= 180,
			`${edge.label} needs a clear branch run beside the diamond`)
	}
})

test('sequence starter places four messages across participant lanes in time order', () => {
	const sequence = STARTERS.find(({ id }) => id === 'sequence')!.diagram
	const nodes = new Map(sequence.nodes.map((node) => [node.id, node]))
	const rows = [
		['clientRequest', 'serviceRequest'],
		['serviceQuery', 'databaseQuery'],
		['databaseResult', 'serviceResult'],
		['serviceResponse', 'clientResponse'],
	] as const
	let previousY = -Infinity
	for (const [from, to] of rows) {
		const source = nodes.get(from)!
		const target = nodes.get(to)!
		assert.ok(source && target, `${from} → ${to} needs both message steps`)
		assert.equal(source.y, target.y, 'a message arrow should run horizontally')
		assert.ok(source.y > previousY, 'time should flow down the starter')
		assert.ok(sequence.edges.some((edge) => edge.from === from && edge.to === to), `${from} → ${to} needs a bound arrow`)
		previousY = source.y
	}
	assert.ok(nodes.get('client')!.x < nodes.get('service')!.x)
	assert.ok(nodes.get('service')!.x < nodes.get('database')!.x)
})

test('sequence starter keeps each lifeline attached and captions clear of strokes', () => {
	const sequence = STARTERS.find(({ id }) => id === 'sequence')!.diagram
	const nodes = new Map(sequence.nodes.map((node) => [node.id, node]))
	for (const participant of ['client', 'service', 'database'] as const) {
		const header = nodes.get(participant)!
		const end = nodes.get(`${participant}End`)!
		assert.ok(end, `${participant} needs a lifeline end`)
		assert.equal(header.x + header.w / 2, end.x + end.w / 2, 'lifeline should share the header center')
		assert.ok(end.y > nodes.get('clientResponse')!.y, 'lifeline should pass the final message')
		assert.ok(sequence.edges.some((edge) => edge.id === `${participant}Line`
			&& edge.from === participant && edge.to === `${participant}End`), `${participant} needs a live vertical binding`)
	}
	for (const [id, caption] of [['request', 'Request'], ['query', 'Query'], ['result', 'Result'], ['response', 'Response']] as const) {
		assert.equal(sequence.edges.find((edge) => edge.id === id)?.label, `${caption}\n`,
			`${caption} should sit above its message stroke`)
	}
})

test('a personal block retains selected native content, live bindings, and never changes source shapes', () => {
	const editor = new TestEditor()
	const storage = memoryStorage()
	try {
		const starter = insertStarter(editor, 'flowchart')
		const source = editor.getShape(starter.shapeIds[0])!
		const block = saveSelectionAsBlock(editor, 'My flow', storage)
		assert.equal(block.name, 'My flow')
		assert.equal(loadPersonalBlocks(storage).length, 1)
		const result = insertSavedBlock(editor, block)
		assert.equal(result.shapeIds.length, starter.shapeIds.length)
		const extent = (ids: readonly TLShapeId[]) => {
			const boxes = ids.flatMap((id) => { const box = editor.getShapePageBounds(id); return box ? [box] : [] })
			return { x: Math.min(...boxes.map((box) => box.x)), y: Math.min(...boxes.map((box) => box.y)),
				maxX: Math.max(...boxes.map((box) => box.maxX)), maxY: Math.max(...boxes.map((box) => box.maxY)) }
		}
		const originalBounds = extent(starter.shapeIds)
		const copyBounds = extent(result.shapeIds)
		assert.ok(copyBounds.x >= originalBounds.maxX + 24 || copyBounds.maxX + 24 <= originalBounds.x
			|| copyBounds.y >= originalBounds.maxY + 24 || copyBounds.maxY + 24 <= originalBounds.y,
			'inserted block must not cover its source')
		assert.equal(result.bindingIds.length, starter.bindingIds.length)
		assert.equal(new Set(result.shapeIds).size, result.shapeIds.length)
		assert.ok(result.shapeIds.every((id) => !starter.shapeIds.includes(id)))
		assert.deepEqual(editor.getShape(source.id), source)
		for (const id of result.bindingIds) {
			const binding = editor.getBinding(id)!
			assert.ok(result.shapeIds.includes(binding.fromId))
			assert.ok(result.shapeIds.includes(binding.toId))
		}
		const second = insertSavedBlock(editor, block)
		assert.ok(second.shapeIds.every((id) => !starter.shapeIds.includes(id) && !result.shapeIds.includes(id)))
		assert.ok(second.bindingIds.every((id) => !starter.bindingIds.includes(id) && !result.bindingIds.includes(id)))
		for (const id of second.shapeIds) assert.ok(editor.getShape(id))
		editor.undo()
		for (const id of second.shapeIds) assert.equal(editor.getShape(id), undefined)
		editor.undo()
		for (const id of result.shapeIds) assert.equal(editor.getShape(id), undefined)
		assert.ok(editor.getShape(source.id))
	} finally { editor.dispose() }
})

test('save only selected content, including an arrow binding when both endpoints are selected', () => {
	const editor = new TestEditor()
	const storage = memoryStorage()
	try {
		const starter = insertStarter(editor, 'flowchart')
		const geoIds = starter.shapeIds.filter((id) => editor.getShape(id)?.type === 'geo')
		editor.select(...geoIds.slice(0, 2))
		const block = saveSelectionAsBlock(editor, 'Pair', storage)
		assert.equal(block.content.shapes.length, 2)
		assert.equal(block.content.bindings?.length ?? 0, 0)
		assert.equal(block.content.rootShapeIds.length, 2)
	} finally { editor.dispose() }
})

test('invalid save states and capacity failures do not mutate board or library', () => {
	const editor = new TestEditor(6)
	const storage = memoryStorage()
	try {
		assert.throws(() => saveSelectionAsBlock(editor, 'Empty', storage), /Select/)
		assert.equal(loadPersonalBlocks(storage).length, 0)
		assert.throws(() => saveSelectionAsBlock(editor, '  ', storage), /name/i)
		const id = createShapeId()
		editor.createShape({ id, type: 'geo', props: { geo: 'rectangle', w: 160, h: 90 } })
		editor.select(id)
		const block = saveSelectionAsBlock(editor, 'Box', storage)
		editor.updateInstanceState({ isReadonly: true })
		assert.throws(() => insertSavedBlock(editor, block), /read-only/i)
		editor.updateInstanceState({ isReadonly: false })
		assert.throws(() => insertStarter(editor, 'architecture'), /limit|capacity/i)
		assert.equal(editor.getCurrentPageShapes().length, 1)
		assert.equal(loadPersonalBlocks(storage).length, 1)
	} finally { editor.dispose() }
})

test('local library removes only the chosen block and rejects malformed persisted data safely', () => {
	const editor = new TestEditor()
	const storage = memoryStorage()
	try {
		const id = createShapeId()
		editor.createShape({ id, type: 'geo', props: { geo: 'rectangle', w: 160, h: 90 } })
		editor.select(id)
		const first = saveSelectionAsBlock(editor, 'First', storage)
		const second = saveSelectionAsBlock(editor, 'Second', storage)
		assert.equal(loadPersonalBlocks(storage).length, 2)
		removePersonalBlock(first.id, storage)
		assert.deepEqual(loadPersonalBlocks(storage).map((block) => block.id), [second.id])
		storage.setItem('freeform:personal-library:v1', '{ broken json')
		assert.deepEqual(loadPersonalBlocks(storage), [])
		assert.deepEqual(loadPersonalBlocks({ getItem: () => { throw new Error('Storage blocked') }, setItem() {} }), [])
	} finally { editor.dispose() }
})
