import assert from 'node:assert/strict'
import test from 'node:test'
import { MessagePort } from 'node:worker_threads'
import { Box, Editor, createTLStore, defaultBindingUtils, defaultShapeTools, defaultShapeUtils, defaultTools, createShapeId, getTipTapDefaultExtensions } from 'tldraw'
import { PageRecordType } from '@tldraw/tlschema'
import { exportExcalidrawPage, parseExcalidrawBoard } from './interchange'
import { convertExcalidrawToNativeJson } from './nativeFile'
import { parseNativeBoard } from '../nativeBoard'

for (const handle of (process as NodeJS.Process & { _getActiveHandles(): unknown[] })._getActiveHandles()) {
	if (handle instanceof MessagePort) handle.unref()
}

class TestElement {
	readonly ownerDocument: TestDocument
	readonly style = { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' }
	readonly classList = { add() {}, remove() {} }
	readonly dataset = {}
	constructor(document: TestDocument) { this.ownerDocument = document }
	setAttribute() {}
	appendChild(child: TestElement) { return child }
	remove() {}
	addEventListener() {}
	removeEventListener() {}
	getBoundingClientRect() { return { x: 0, y: 0, width: 1080, height: 720, top: 0, left: 0, right: 1080, bottom: 720 } }
}
class TestDocument {
	readonly body = new TestElement(this)
	readonly fonts = { add() {}, delete() {}, check: () => true }
	createElement() { return new TestElement(this) }
	addEventListener() {}
	removeEventListener() {}
}
const documentRef = new TestDocument()
Object.assign(globalThis, {
	document: documentRef,
	window: { document: documentRef, devicePixelRatio: 1, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {} },
	requestAnimationFrame: () => 0,
	cancelAnimationFrame() {},
})

class TestEditor extends Editor {
	constructor() {
		super({
			shapeUtils: defaultShapeUtils,
			bindingUtils: defaultBindingUtils,
			tools: [...defaultTools, ...defaultShapeTools],
			store: createTLStore({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils }),
			getContainer: () => new TestElement(documentRef) as unknown as HTMLElement,
			initialState: 'select',
			textOptions: { tipTapConfig: { extensions: getTipTapDefaultExtensions() } },
		})
		this.textMeasure.measureText = () => ({ x: 0, y: 0, w: 0, h: 0, scrollWidth: 0 })
		this.textMeasure.measureHtml = () => ({ x: 0, y: 0, w: 0, h: 0, scrollWidth: 0 })
		this.updateViewportScreenBounds(new Box(0, 0, 1080, 720))
	}
}

const base = { angle: 0, strokeColor: '#112233', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 0, opacity: 70, isDeleted: false, groupIds: [], frameId: null, boundElements: [] }
const geo = (id: string, type: string, x: number) => ({ ...base, id, type, x, y: 40, width: 100, height: 60 })
const textElement = (id: string, text: string, containerId: string | null = null) => ({ ...base, id, type: 'text', x: 0, y: 0, width: 80, height: 28, text, originalText: text, fontSize: 20, fontFamily: 5, textAlign: 'center', verticalAlign: 'middle', containerId, autoResize: false, lineHeight: 1.25 })
const file = (elements: unknown[]) => JSON.stringify({ type: 'excalidraw', version: 2, source: 'test', elements, appState: {}, files: {} })

test('imports common geometry, bound labels, straight connectors and binding anchors as detached native records', () => {
	const source = file([
		{ ...geo('a', 'rectangle', 20), backgroundColor: '#112233', boundElements: [{ type: 'text', id: 'label-a' }] },
		{ ...geo('b', 'ellipse', 270) },
		{ ...geo('c', 'diamond', 520) },
		{ ...textElement('label-a', 'Start', 'a'), x: 30, y: 50 },
		{ ...textElement('free', 'Standalone'), x: 30, y: 220 },
		{ ...base, id: 'arrow', type: 'arrow', x: 120, y: 70, width: 150, height: 0, points: [[0, 0], [150, 0]], startBinding: { elementId: 'a', fixedPoint: [1, 0.5], mode: 'orbit' }, endBinding: { elementId: 'b', fixedPoint: [0, 0.5], mode: 'orbit' }, startArrowhead: null, endArrowhead: 'arrow', elbowed: false },
		{ ...base, id: 'line', type: 'line', x: 20, y: 330, width: 120, height: 0, points: [[0, 0], [120, 0]], startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null, polygon: false },
	])
	const result = parseExcalidrawBoard(source, PageRecordType.createId('new'))
	assert.equal(result.report.convertedElements, 7)
	assert.equal(result.report.skippedElements, 0)
	assert.equal(result.shapes.length, 6)
	assert.equal(result.bindings.length, 2)
	const a = result.shapes.find((shape) => shape.meta?.excalidrawId === 'a')
	assert.equal(a?.type, 'geo')
	assert.equal(a?.x, 20)
	assert.equal(a?.opacity, 0.7)
	assert.equal(a?.props?.richText && JSON.stringify(a.props.richText).includes('Start'), true)
	const arrow = result.shapes.find((shape) => shape.meta?.excalidrawId === 'arrow')
	assert.equal(arrow?.type, 'arrow')
	assert.deepEqual(result.bindings.map((binding) => binding.props?.normalizedAnchor), [{ x: 1, y: 0.5 }, { x: 0, y: 0.5 }])
})

test('invalid files reject, while unsupported elements and broken bindings are reported', () => {
	assert.throws(() => parseExcalidrawBoard('{', PageRecordType.createId('new')), /valid Excalidraw/i)
	assert.throws(() => parseExcalidrawBoard(JSON.stringify({ type: 'other', elements: [] }), PageRecordType.createId('new')), /valid Excalidraw/i)
	const result = parseExcalidrawBoard(file([
		42,
		{ ...geo('image', 'image', 10), strokeColor: undefined },
		{ ...geo('a', 'rectangle', 10) },
		{ ...base, id: 'arrow', type: 'arrow', x: 100, y: 70, width: 80, height: 0, points: [[0, 0], [80, 0]], startBinding: { elementId: 'missing', fixedPoint: [1, 0.5], mode: 'orbit' }, endBinding: null, startArrowhead: null, endArrowhead: 'arrow', elbowed: false },
	]), PageRecordType.createId('new'))
	assert.equal(result.report.skippedElements, 2)
	assert.equal(result.report.skippedByType.image, 1)
	assert.equal(result.report.skippedByType.invalid, 1)
	assert.equal(result.report.styleLosses['stroke color'], undefined)
	assert.equal(result.bindings.length, 0)
	assert.ok(result.report.warnings.some((warning) => warning.includes('missing')))
})

test('bound straight lines use no-head native arrows and export back as bound lines', () => {
	const imported = parseExcalidrawBoard(file([
		geo('box', 'rectangle', 20),
		{ ...base, id: 'wire', type: 'line', x: 120, y: 70, width: 120, height: 0, points: [[0, 0], [120, 0]], startBinding: { elementId: 'box', fixedPoint: [1, 0.5], mode: 'orbit' }, endBinding: null, startArrowhead: null, endArrowhead: null, polygon: false },
	]), PageRecordType.createId('new'))
	assert.equal(imported.bindings.length, 1)
	const wire = imported.shapes.find((shape) => shape.meta?.excalidrawId === 'wire')
	assert.equal(wire?.type, 'arrow')
	assert.equal(wire?.meta?.excalidrawType, 'line')
	const editor = new TestEditor()
	try {
		const idMap = new Map(imported.shapes.map((shape) => [shape.id, createShapeId()]))
		editor.createShapes(imported.shapes.map((shape) => ({ ...shape, id: idMap.get(shape.id)!, parentId: editor.getCurrentPageId() })))
		editor.createBindings(imported.bindings.map((binding) => ({ ...binding, id: undefined, fromId: idMap.get(binding.fromId)!, toId: idMap.get(binding.toId)! })))
		const exported = exportExcalidrawPage(editor)
		const output = JSON.parse(exported.json) as { elements: Array<Record<string, unknown>> }
		const line = output.elements.find((element) => element.type === 'line')
		assert.ok(line)
		assert.equal((line.startBinding as { elementId: string }).elementId, idMap.get(imported.shapes.find((shape) => shape.meta?.excalidrawId === 'box')!.id))
	} finally { editor.dispose() }
})

test('exports only the current page and round trips supported geometry and bindings', () => {
	const editor = new TestEditor()
	try {
		const a = createShapeId('a'), b = createShapeId('b'), arrow = createShapeId('arrow')
		editor.createShape({ id: a, type: 'geo', x: 20, y: 40, opacity: 0.7, props: { geo: 'rectangle', w: 100, h: 60 }, meta: { freeformColor: { version: 1, hex: '#112233', base: 'black' } } })
		editor.createShape({ id: b, type: 'geo', x: 270, y: 40, props: { geo: 'ellipse', w: 100, h: 60 } })
		editor.createShape({ id: arrow, type: 'arrow', x: 120, y: 70, props: { start: { x: 0, y: 0 }, end: { x: 150, y: 0 } } })
		editor.createBinding({ type: 'arrow', fromId: arrow, toId: a, props: { terminal: 'start', normalizedAnchor: { x: 1, y: 0.5 }, isExact: false, isPrecise: true, snap: 'none' } })
		editor.createBinding({ type: 'arrow', fromId: arrow, toId: b, props: { terminal: 'end', normalizedAnchor: { x: 0, y: 0.5 }, isExact: false, isPrecise: true, snap: 'none' } })
		const before = editor.store.getStoreSnapshot()
		const result = exportExcalidrawPage(editor)
		assert.deepEqual(editor.store.getStoreSnapshot(), before)
		const output = JSON.parse(result.json) as { type: string; version: number; elements: Array<Record<string, unknown>> }
		assert.equal(output.type, 'excalidraw')
		assert.equal(output.version, 2)
		assert.equal(result.report.skippedElements, 0)
		assert.equal(output.elements.find((element) => element.id === a)?.strokeColor, '#112233')
		assert.equal(output.elements.filter((element) => element.type === 'arrow').length, 1)
		const parsed = parseExcalidrawBoard(result.json, PageRecordType.createId('imported'))
		assert.equal(parsed.shapes.length, 3)
		assert.equal(parsed.bindings.length, 2)
		assert.equal(parsed.report.skippedElements, 0)
	} finally { editor.dispose() }
})

test('detached native conversion is accepted by the safe import parser and leaves the live source unchanged', async () => {
	const source = new TestEditor()
	try {
		source.createShape({ id: createShapeId('existing'), type: 'geo', x: 800, y: 500, props: { geo: 'diamond', w: 80, h: 80 } })
		const before = source.store.getStoreSnapshot()
		const converted = await convertExcalidrawToNativeJson(file([
			geo('a', 'rectangle', 20), geo('b', 'ellipse', 270),
			{ ...base, id: 'arrow', type: 'arrow', x: 120, y: 70, width: 150, height: 0, points: [[0, 0], [150, 0]], startBinding: { elementId: 'a', fixedPoint: [1, 0.5], mode: 'orbit' }, endBinding: { elementId: 'b', fixedPoint: [0, 0.5], mode: 'orbit' }, startArrowhead: null, endArrowhead: 'arrow', elbowed: false },
		]))
		const parsed = parseNativeBoard(source, converted.json)
		assert.equal(parsed.shapeCount, 3)
		assert.equal(Object.values(parsed.snapshot.store).filter((record) => record.typeName === 'binding').length, 2)
		const nativeArrow = Object.values(parsed.snapshot.store).find((record) => record.typeName === 'shape' && record.type === 'arrow')
		assert.ok(nativeArrow && nativeArrow.typeName === 'shape' && nativeArrow.type === 'arrow')
		assert.equal(nativeArrow.x, 120)
		assert.equal(nativeArrow.y, 70)
		assert.deepEqual(nativeArrow.props.start, { x: 0, y: 0 })
		assert.deepEqual(nativeArrow.props.end, { x: 150, y: 0 })
		assert.equal(converted.report.convertedElements, 3)
		assert.deepEqual(source.store.getStoreSnapshot(), before)
	} finally { source.dispose() }
})
