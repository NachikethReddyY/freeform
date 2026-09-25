import assert from 'node:assert/strict'
import test from 'node:test'
import { MessagePort } from 'node:worker_threads'
import {
	Box, Editor, createShapeId, createTLStore,
	defaultAddFontsFromNode, defaultBindingUtils, defaultShapeTools, defaultShapeUtils, defaultTools,
	tipTapDefaultExtensions, toRichText,
	type TLParentId, type TLShapeId,
} from 'tldraw'
import { buildLayerTree, layerLabel, selectLayer } from './layersModel'

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
		const attrs = [...this.attributes].map(([key, value]) => ` ${key}="${value}"`).join('')
		return `<${this.tagName}${attrs}>${this.innerHTML}</${this.tagName}>`
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
	createTextNode(value: string) { const node = new TestElement(this, '#text', 3); node.textContent = value; return node }
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

function rectangle(editor: TestEditor, label: string, parentId: TLParentId = editor.getCurrentPageId(), extra: { opacity?: number; meta?: Record<string, string> } = {}): TLShapeId {
	const id = createShapeId()
	editor.createShape({ id, type: 'geo', parentId, x: 100, y: 100, opacity: extra.opacity,
		meta: extra.meta, props: { geo: 'rectangle', w: 180, h: 100, richText: toRichText(label) } })
	return id
}

test('builds current-page hierarchy front to back and omits invisible diagram anchors', () => {
	const editor = new TestEditor()
	try {
		const back = rectangle(editor, 'Back')
		const frame = createShapeId()
		editor.createShape({ id: frame, type: 'frame', x: 300, y: 100, props: { name: 'Design', w: 350, h: 300 } })
		const child = rectangle(editor, 'Inside frame', frame)
		const nested = rectangle(editor, 'Inside group', frame)
		const nested2 = rectangle(editor, 'Second group item', frame)
		const group = createShapeId()
		editor.groupShapes([nested, nested2], { groupId: group, select: false })
		const anchor = createShapeId()
		editor.createShape({ id: anchor, type: 'geo', x: 20, y: 20, opacity: 0,
			meta: { diagramProposal: 'sample' }, props: { geo: 'ellipse', w: 24, h: 24, richText: toRichText('') } })
		const front = rectangle(editor, 'Front')

		const tree = buildLayerTree(editor)
		assert.deepEqual(tree.map((row) => row.id), [front, frame, back])
		assert.deepEqual(tree[1].children.map((row) => row.id), [group, child])
		assert.deepEqual(tree[1].children[0].children.map((row) => row.id), [nested2, nested])
		assert.equal(tree[1].label, 'Design')
		assert.equal(tree[1].children[0].label, 'Group')
		assert.equal(selectLayer(editor, nested), true, 'nested group shapes remain navigable')
		assert.deepEqual(editor.getSelectedShapeIds(), [nested])
		editor.sendToBack([front])
		assert.deepEqual(buildLayerTree(editor).map((row) => row.id), [frame, back, front], 'reordering updates the panel order')
		const secondPage = editor.createPage({ name: 'Second' }).getPages().find((page) => page.name === 'Second')!
		editor.setCurrentPage(secondPage.id)
		assert.deepEqual(buildLayerTree(editor), [], 'the panel reads only the active page')
	} finally { editor.dispose() }
})

test('labels rich text, note, arrow and empty geometry without leaking IDs or huge text', () => {
	const editor = new TestEditor()
	try {
		const geo = rectangle(editor, '  Client request\nmore detail  ')
		const blank = rectangle(editor, '')
		const note = createShapeId()
		editor.createShape({ id: note, type: 'note', x: 400, y: 100, props: { richText: toRichText('Remember this') } })
		const arrow = createShapeId()
		editor.createShape({ id: arrow, type: 'arrow', x: 100, y: 300,
			props: { start: { x: 0, y: 0 }, end: { x: 120, y: 0 }, richText: toRichText('Request') } })
		assert.equal(layerLabel(editor, editor.getShape(geo)!), 'Client request')
		assert.equal(layerLabel(editor, editor.getShape(blank)!), 'Rectangle')
		assert.equal(layerLabel(editor, editor.getShape(note)!), 'Remember this')
		assert.equal(layerLabel(editor, editor.getShape(arrow)!), 'Request')
		const long = rectangle(editor, 'A'.repeat(120))
		assert.ok(layerLabel(editor, editor.getShape(long)!).length <= 64)
	} finally { editor.dispose() }
})

test('selecting a row uses native selection and centers camera without changing document', () => {
	const editor = new TestEditor()
	try {
		const id = rectangle(editor, 'Focus')
		const shape = editor.getShape(id)!
		const before = JSON.stringify(editor.getCurrentPageShapes())
		assert.equal(selectLayer(editor, id), true)
		assert.deepEqual(editor.getSelectedShapeIds(), [id])
		assert.deepEqual(editor.getViewportPageBounds().center.toJson(), editor.getShapePageBounds(id)!.center.toJson())
		assert.equal(JSON.stringify(editor.getCurrentPageShapes()), before)
		assert.deepEqual(editor.getShape(id), shape)
		assert.equal(selectLayer(editor, createShapeId()), false)
	} finally { editor.dispose() }
})
