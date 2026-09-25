import assert from 'node:assert/strict'
import test from 'node:test'
import { MessagePort } from 'node:worker_threads'
import { Children, createElement, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
	Box, Editor, Group2d, Rectangle2d, createTLStore, defaultAddFontsFromNode,
	defaultBindingUtils, defaultShapeTools, defaultShapeUtils, defaultTools,
	getArrowInfo, getSnapshot, loadSnapshot, tipTapDefaultExtensions,
	type TLArrowShape,
} from 'tldraw'
import { DiagramSchema } from '../../../shared/diagram'
import { FreeformArrowShapeUtil } from '../../editor/excalidrawShapes/FreeformArrowShapeUtil'
import { applyNativeDiagram, createNativeDiagram } from './native'

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
		return `<${this.tagName}>${this.innerHTML}</${this.tagName}>`
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

const shapeUtils = defaultShapeUtils.map((util) => util.type === 'arrow' ? FreeformArrowShapeUtil : util)
class TestEditor extends Editor {
	constructor() {
		super({
			shapeUtils, bindingUtils: defaultBindingUtils,
			tools: [...defaultTools, ...defaultShapeTools],
			store: createTLStore({ shapeUtils, bindingUtils: defaultBindingUtils }),
			getContainer: () => new TestElement(documentRef) as unknown as HTMLElement,
			initialState: 'select',
			textOptions: { tipTapConfig: { extensions: tipTapDefaultExtensions }, addFontsFromNode: defaultAddFontsFromNode },
		})
		this.textMeasure.measureText = () => ({ x: 0, y: 0, w: 72, h: 22, scrollWidth: 72 })
		this.textMeasure.measureHtml = () => ({ x: 0, y: 0, w: 72, h: 22, scrollWidth: 72 })
		this.textMeasure.measureTextSpans = () => []
		this.updateViewportScreenBounds(new Box(0, 0, 1080, 720))
	}
}

const diagram = DiagramSchema.parse({
	title: 'Request flow',
	nodes: [
		{ id: 'client', kind: 'rectangle', label: 'Client', x: 0, y: 0, w: 180, h: 90 },
		{ id: 'service', kind: 'rectangle', label: 'Service', x: 440, y: 0, w: 180, h: 90 },
	],
	edges: [{ id: 'request', from: 'client', to: 'service', label: 'Request' }],
})

function geometry(editor: TestEditor, ids: string[]) {
	const [sourceId, targetId, arrowId] = ids
	const arrow = editor.getShape(arrowId as TLArrowShape['id']) as TLArrowShape
	const source = editor.getShapePageBounds(sourceId as TLArrowShape['id'])!
	const target = editor.getShapePageBounds(targetId as TLArrowShape['id'])!
	const info = getArrowInfo(editor, arrow)!
	const transform = editor.getShapePageTransform(arrow.id)!
	const start = transform.applyToPoint(info.start.point)
	const end = transform.applyToPoint(info.end.point)
	const label = (editor.getShapeGeometry(arrow) as Group2d).children[1]
	assert.ok(label instanceof Rectangle2d)
	const labelCenter = transform.applyToPoint(label.bounds.center)
	return { arrow, source, target, start, end, labelCenter }
}

test('imported native arrow stays bound, clears both node labels, and survives a document round trip', () => {
	const editor = new TestEditor()
	const restored = new TestEditor()
	try {
		const ids = createNativeDiagram(diagram, 'native-connector-proof', editor.getCurrentPageId()).shapes.map((shape) => shape.id!)
		applyNativeDiagram(editor, diagram, 'native-connector-proof', editor.getCurrentPageId(), false)
		const first = geometry(editor, ids)
		const util = editor.getShapeUtil(first.arrow) as FreeformArrowShapeUtil
		let usesSdkBody = false
		renderToStaticMarkup(createElement(() => {
			const rendered = util.component(first.arrow)
			if (isValidElement<{ children?: ReactNode }>(rendered)) {
				const svgContainer = Children.toArray(rendered.props.children)[0]
				if (isValidElement<{ children?: ReactNode }>(svgContainer)) {
					const body = Children.toArray(svgContainer.props.children)[0]
					if (isValidElement(body)) usesSdkBody = typeof body.type === 'object'
				}
			}
			return null
		}))
		assert.equal(usesSdkBody, true, 'plain imported arrows use the SDK label clipping and bound geometry')
		assert.equal(editor.getBindingsFromShape(first.arrow.id, 'arrow').length, 2)
		assert.ok(Math.abs(first.start.x - first.source.maxX) < 32)
		assert.ok(Math.abs(first.end.x - first.target.x) < 32)
		assert.ok(first.labelCenter.x > first.source.maxX + 24)
		assert.ok(first.labelCenter.x < first.target.x - 24)

		const targetShape = editor.getShape(ids[1])!
		editor.updateShape({ id: targetShape.id, type: targetShape.type, x: targetShape.x + 120 })
		const moved = geometry(editor, ids)
		assert.ok(Math.abs(moved.end.x - (first.end.x + 120)) < 2, 'bound endpoint follows the moved target')
		assert.ok(moved.labelCenter.x > moved.source.maxX + 24 && moved.labelCenter.x < moved.target.x - 24)

		loadSnapshot(restored.store, getSnapshot(editor.store))
		const reloaded = geometry(restored, ids)
		assert.equal(restored.getBindingsFromShape(reloaded.arrow.id, 'arrow').length, 2)
		assert.ok(Math.abs(reloaded.end.x - moved.end.x) < 2)
		assert.ok(reloaded.labelCenter.x > reloaded.source.maxX + 24 && reloaded.labelCenter.x < reloaded.target.x - 24)
	} finally { editor.dispose(); restored.dispose() }
})
