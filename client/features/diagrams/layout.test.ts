import assert from 'node:assert/strict'
import test from 'node:test'
import { MessagePort } from 'node:worker_threads'
import {
	Box, Editor, createBindingId, createShapeId, createTLStore,
	defaultAddFontsFromNode, defaultBindingUtils, defaultShapeTools, defaultShapeUtils, defaultTools,
	tipTapDefaultExtensions, toRichText,
	type TLShapeId,
} from 'tldraw'
import { canLayoutSelectedDiagram, layoutSelectedDiagram } from './layout'

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
	constructor() {
		super({
			shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils,
			tools: [...defaultTools, ...defaultShapeTools],
			store: createTLStore({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils }),
			getContainer: () => new TestElement(documentRef) as unknown as HTMLElement,
			initialState: 'select',
			textOptions: { tipTapConfig: { extensions: tipTapDefaultExtensions }, addFontsFromNode: defaultAddFontsFromNode },
		})
		this.textMeasure.measureText = () => ({ x: 0, y: 0, w: 0, h: 0, scrollWidth: 0 })
		this.textMeasure.measureHtml = () => ({ x: 0, y: 0, w: 0, h: 0, scrollWidth: 0 })
		this.textMeasure.measureTextSpans = () => []
		this.updateViewportScreenBounds(new Box(0, 0, 1080, 720))
	}
}

function node(editor: TestEditor, label: string, x: number, y: number, w = 160, h = 100) {
	const id = createShapeId()
	editor.createShape({ id, type: 'geo', x, y, props: { geo: 'rectangle', w, h, richText: toRichText(label) } })
	return id
}

function connect(editor: TestEditor, source: TLShapeId, target: TLShapeId) {
	const id = createShapeId()
	const sourceBounds = editor.getShapePageBounds(source)!
	const targetBounds = editor.getShapePageBounds(target)!
	editor.createShape({ id, type: 'arrow', x: sourceBounds.center.x, y: sourceBounds.center.y,
		props: { start: { x: 0, y: 0 }, end: {
			x: targetBounds.center.x - sourceBounds.center.x,
			y: targetBounds.center.y - sourceBounds.center.y,
		}, richText: toRichText('edge label') } })
	const bindingIds = [createBindingId(), createBindingId()]
	editor.createBindings([
		{ id: bindingIds[0], type: 'arrow', fromId: id, toId: source,
			props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' } },
		{ id: bindingIds[1], type: 'arrow', fromId: id, toId: target,
			props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' } },
	])
	return { id, bindingIds }
}

test('arranges a branch left to right without overlap, keeping labels and live arrow bindings', () => {
	const editor = new TestEditor()
	try {
		const root = node(editor, 'Start', 200, 300, 180, 100)
		const lower = node(editor, 'Lower', 30, 20, 150, 100)
		const upper = node(editor, 'Upper', 40, 400, 210, 120)
		const first = connect(editor, root, lower)
		const second = connect(editor, root, upper)
		const before = new Map([root, lower, upper].map((id) => [id, editor.getShape(id)!]))
		const bindingsBefore = [...first.bindingIds, ...second.bindingIds].map((id) => editor.getBinding(id))
		const arrowLabelsBefore = [first.id, second.id].map((id) => (editor.getShape(id) as any).props.richText)
		editor.select(root, lower, upper, first.id, second.id)
		assert.equal(canLayoutSelectedDiagram(editor), true)
		assert.equal(layoutSelectedDiagram(editor), true)
		const rootBounds = editor.getShapePageBounds(root)!
		const lowerBounds = editor.getShapePageBounds(lower)!
		const upperBounds = editor.getShapePageBounds(upper)!
		assert.ok(lowerBounds.x >= rootBounds.maxX + 128)
		assert.ok(upperBounds.x >= rootBounds.maxX + 128)
		assert.equal(lowerBounds.x, upperBounds.x)
		assert.ok(lowerBounds.maxY + 32 <= upperBounds.y || upperBounds.maxY + 32 <= lowerBounds.y)
		for (const id of [root, lower, upper]) {
			assert.deepEqual((editor.getShape(id) as any).props, before.get(id)!.props, 'node geometry and label props stay intact')
		}
		assert.deepEqual([...first.bindingIds, ...second.bindingIds].map((id) => editor.getBinding(id)), bindingsBefore)
		assert.deepEqual([first.id, second.id].map((id) => (editor.getShape(id) as any).props.richText), arrowLabelsBefore)
		assert.deepEqual(new Set(editor.getSelectedShapeIds()), new Set([root, lower, upper, first.id, second.id]))
		const after = new Map([root, lower, upper].map((id) => [id, editor.getShape(id)!]))
		editor.undo()
		for (const [id, shape] of before) assert.deepEqual(editor.getShape(id), shape, 'one undo restores every node')
		editor.redo()
		for (const [id, shape] of after) assert.deepEqual(editor.getShape(id), shape, 'one redo reapplies the layout')
	} finally { editor.dispose() }
})

test('a chain is layered in dependency order and repeated layout does not add history', () => {
	const editor = new TestEditor()
	try {
		const a = node(editor, 'A', 500, 500)
		const b = node(editor, 'B', 100, 100)
		const c = node(editor, 'C', -200, -100)
		connect(editor, a, b)
		connect(editor, b, c)
		editor.select(a, b, c)
		assert.equal(layoutSelectedDiagram(editor), true)
		const boxes = [a, b, c].map((id) => editor.getShapePageBounds(id)!)
		assert.ok(boxes[0].maxX < boxes[1].x && boxes[1].maxX < boxes[2].x)
		assert.equal(layoutSelectedDiagram(editor), false, 'same arrangement is a no-op')
	} finally { editor.dispose() }
})

test('a cycle has finite, deterministic positions', () => {
	const editor = new TestEditor()
	try {
		const a = node(editor, 'A', 300, 10)
		const b = node(editor, 'B', 10, 300)
		connect(editor, a, b)
		connect(editor, b, a)
		editor.select(b, a)
		assert.equal(layoutSelectedDiagram(editor), true)
		const positions = [a, b].map((id) => ({ x: editor.getShape(id)!.x, y: editor.getShape(id)!.y }))
		assert.ok(positions.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)))
		assert.equal(new Set(positions.map(({ x, y }) => `${x}:${y}`)).size, 2)
	} finally { editor.dispose() }
})

test('unavailable selections do not mutate the board', () => {
	const editor = new TestEditor()
	try {
		const a = node(editor, 'A', 100, 100)
		const b = node(editor, 'B', 400, 100)
		editor.select(a, b)
		const before = editor.getCurrentPageShapes()
		assert.equal(canLayoutSelectedDiagram(editor), false, 'no selected-to-selected bound arrows')
		assert.equal(layoutSelectedDiagram(editor), false)
		connect(editor, a, b)
		editor.updateInstanceState({ isReadonly: true })
		assert.equal(layoutSelectedDiagram(editor), false)
		editor.updateInstanceState({ isReadonly: false })
		editor.updateShape({ id: a, type: 'geo', isLocked: true })
		assert.equal(layoutSelectedDiagram(editor), false)
		editor.updateShape({ id: a, type: 'geo', isLocked: false })
		editor.setCurrentTool('draw')
		assert.equal(layoutSelectedDiagram(editor), false)
		editor.setCurrentTool('select')
		assert.deepEqual(editor.getShape(a)?.props, before.find((shape) => shape.id === a)?.props)
		assert.deepEqual(editor.getShape(b)?.props, before.find((shape) => shape.id === b)?.props)
	} finally { editor.dispose() }
})

test('authored diagrams with small message anchors are not offered flow layout', () => {
	const editor = new TestEditor()
	try {
		const participant = node(editor, 'Client', 0, 0, 160, 66)
		const anchor = node(editor, '', 80, 130, 24, 24)
		connect(editor, participant, anchor)
		editor.select(participant, anchor)
		const before = [editor.getShape(participant), editor.getShape(anchor)]
		assert.equal(canLayoutSelectedDiagram(editor), false)
		assert.equal(layoutSelectedDiagram(editor), false)
		assert.deepEqual([editor.getShape(participant), editor.getShape(anchor)], before)
	} finally { editor.dispose() }
})

test('arranging selected nodes keeps clear of unrelated shapes and fits the result in view', () => {
	const editor = new TestEditor()
	try {
		const a = node(editor, 'A', 400, 200)
		const b = node(editor, 'B', 900, 200)
		const other = node(editor, 'Unrelated', 720, 200)
		connect(editor, a, b)
		editor.select(a, b)
		const untouched = editor.getShape(other)
		assert.equal(layoutSelectedDiagram(editor), true)
		const otherBounds = editor.getShapePageBounds(other)!
		for (const id of [a, b]) {
			const bounds = editor.getShapePageBounds(id)!
			assert.ok(bounds.x >= otherBounds.maxX + 24 || bounds.maxX + 24 <= otherBounds.x
				|| bounds.y >= otherBounds.maxY + 24 || bounds.maxY + 24 <= otherBounds.y,
				'no arranged node should touch the unrelated shape')
			const viewport = editor.getViewportPageBounds()
			assert.ok(bounds.x >= viewport.x && bounds.maxX <= viewport.maxX,
				'arranged node should remain horizontally visible')
		}
		assert.deepEqual(editor.getShape(other), untouched)
	} finally { editor.dispose() }
})

test('an unselected frame is a diagram backdrop, not an obstacle that moves its nodes outside', () => {
	const editor = new TestEditor()
	try {
		const a = node(editor, 'A', 200, 200)
		const b = node(editor, 'B', 500, 300)
		connect(editor, a, b)
		const frame = createShapeId()
		editor.createShape({ id: frame, type: 'frame', x: 100, y: 100, props: { w: 1000, h: 600 } })
		const frameBefore = editor.getShape(frame)
		editor.select(a, b)
		assert.equal(layoutSelectedDiagram(editor), true)
		const frameBounds = editor.getShapePageBounds(frame)!
		for (const id of [a, b]) {
			const bounds = editor.getShapePageBounds(id)!
			assert.ok(bounds.y >= frameBounds.y && bounds.maxY <= frameBounds.maxY,
				'arranged nodes should stay inside their visual frame')
		}
		assert.deepEqual(editor.getShape(frame), frameBefore)
	} finally { editor.dispose() }
})

test('a longer arrangement fits all selected nodes into the viewport', () => {
	const editor = new TestEditor()
	try {
		const ids = Array.from({ length: 5 }, (_, index) => node(editor, String(index), 100 + index * 180, 150))
		for (let index = 0; index < ids.length - 1; index++) connect(editor, ids[index], ids[index + 1])
		editor.select(...ids)
		assert.equal(layoutSelectedDiagram(editor), true)
		const viewport = editor.getViewportPageBounds()
		const panelEdge = viewport.x + 256 / editor.getZoomLevel()
		for (const id of ids) {
			const bounds = editor.getShapePageBounds(id)!
			assert.ok(bounds.x >= panelEdge && bounds.maxX <= viewport.maxX,
				'arranged node should remain visible beside the 256px style panel')
		}
	} finally { editor.dispose() }
})
