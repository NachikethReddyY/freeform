import assert from 'node:assert/strict'
import test from 'node:test'
import { MessagePort } from 'node:worker_threads'
import {
	Box,
	Editor,
	createShapeId,
	createTLStore,
	defaultBindingUtils,
	defaultShapeTools,
	defaultShapeUtils,
	defaultTools,
	type TLGeoShape,
} from 'tldraw'
import { addConnectedNode, canAddConnectedNode, findConnectedNodePlacement } from './connectedNode'

// Importing tldraw starts a scheduler MessagePort in Node. It must not keep
// the focused test runner alive after all editors have been disposed.
for (const handle of (process as NodeJS.Process & { _getActiveHandles(): unknown[] })._getActiveHandles()) {
	if (handle instanceof MessagePort) handle.unref()
}

// The installed SDK's TestEditor is a Vitest fixture. This small TestEditor uses
// its production shape and binding utils with only the DOM surface Node needs.
class TestElement {
	readonly ownerDocument: TestDocument
	readonly style = { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' }
	readonly classList = { add() {}, remove() {} }
	readonly dataset = {}
	constructor(document: TestDocument) { this.ownerDocument = document }
	setAttribute() {}
	appendChild(child: TestElement) { return child }
	remove() {}
	focus() {}
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
	window: {
		document: documentRef, devicePixelRatio: 1,
		requestAnimationFrame: () => 0, cancelAnimationFrame() {},
		setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
		addEventListener() {}, removeEventListener() {},
	},
	requestAnimationFrame: () => 0,
	cancelAnimationFrame() {},
})

class TestEditor extends Editor {
	constructor(maxShapesPerPage = 4000) {
		super({
			shapeUtils: defaultShapeUtils,
			bindingUtils: defaultBindingUtils,
			tools: [...defaultTools, ...defaultShapeTools],
			store: createTLStore({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils }),
			getContainer: () => new TestElement(documentRef) as unknown as HTMLElement,
			initialState: 'select',
			options: { maxShapesPerPage },
		})
		this.textMeasure.measureText = () => ({ x: 0, y: 0, w: 0, h: 0, scrollWidth: 0 })
		this.textMeasure.measureHtml = () => ({ x: 0, y: 0, w: 0, h: 0, scrollWidth: 0 })
		this.updateViewportScreenBounds(new Box(0, 0, 1080, 720))
	}
}

function rectangle(editor: TestEditor, x = 100, y = 100, w = 160, h = 100) {
	const id = createShapeId()
	editor.createShape({ id, type: 'geo', x, y, props: { geo: 'rectangle', w, h, color: 'blue', fill: 'semi', dash: 'draw' } })
	return editor.getShape(id) as TLGeoShape
}

for (const direction of ['up', 'right', 'down', 'left'] as const) {
	test(`creates a native rectangle and two live arrow bindings ${direction} of the source`, () => {
		const editor = new TestEditor()
		try {
			const source = rectangle(editor)
			editor.select(source.id)
			const result = addConnectedNode(editor, direction)
			assert.ok(result)
			const node = editor.getShape(result.nodeId)
			const arrow = editor.getShape(result.arrowId)
			assert.equal(node?.type, 'geo')
			assert.equal(node.props.geo, 'rectangle')
			assert.equal(node.props.color, source.props.color)
			assert.equal(node.props.fill, source.props.fill)
			assert.equal(arrow?.type, 'arrow')
			assert.deepEqual(editor.getSelectedShapeIds(), [result.nodeId])
			const bindings = editor.getBindingsFromShape(result.arrowId, 'arrow')
			assert.equal(bindings.length, 2)
			assert.equal(bindings.find((binding) => binding.props.terminal === 'start')?.toId, source.id)
			assert.equal(bindings.find((binding) => binding.props.terminal === 'end')?.toId, result.nodeId)
			const sourceBounds = editor.getShapePageBounds(source.id)!
			const targetBounds = editor.getShapePageBounds(result.nodeId)!
			if (direction === 'right') assert.ok(targetBounds.x >= sourceBounds.maxX + 80)
			if (direction === 'left') assert.ok(targetBounds.maxX <= sourceBounds.x - 80)
			if (direction === 'down') assert.ok(targetBounds.y >= sourceBounds.maxY + 80)
			if (direction === 'up') assert.ok(targetBounds.maxY <= sourceBounds.y - 80)
			const arrowBeforeMove = editor.getShapePageBounds(result.arrowId)!
			editor.updateShape({ id: result.nodeId, type: 'geo', x: node.x + 64 })
			const arrowAfterMove = editor.getShapePageBounds(result.arrowId)!
			assert.notDeepEqual(arrowAfterMove, arrowBeforeMove, 'binding follows the moved node')
			assert.deepEqual(editor.getShape(source.id), source, 'source data stays untouched')
		} finally { editor.dispose() }
	})
}

test('one undo removes both new shapes and bindings and restores source selection', () => {
	const editor = new TestEditor()
	try {
		const source = rectangle(editor)
		editor.select(source.id)
		const result = addConnectedNode(editor, 'right')!
		assert.equal(editor.getCurrentPageShapes().length, 3)
		editor.undo()
		assert.equal(editor.getCurrentPageShapes().length, 1)
		assert.equal(editor.getShape(result.nodeId), undefined)
		assert.equal(editor.getShape(result.arrowId), undefined)
		assert.deepEqual(editor.getBindingsFromShape(result.arrowId, 'arrow'), [])
		assert.deepEqual(editor.getSelectedShapeIds(), [source.id])
		assert.ok(editor.getShape(source.id))
	} finally { editor.dispose() }
})

test('new connected rectangle enters native label editing and one undo still removes the connection', () => {
	const editor = new TestEditor()
	try {
		const source = rectangle(editor)
		editor.select(source.id)
		const result = addConnectedNode(editor, 'right')!
		assert.equal(editor.getEditingShapeId(), result.nodeId)
		assert.equal(editor.isIn('select.editing_shape'), true)
		editor.undo()
		assert.equal(editor.getShape(result.nodeId), undefined)
		assert.equal(editor.getShape(result.arrowId), undefined)
		assert.deepEqual(editor.getSelectedShapeIds(), [source.id])
	} finally { editor.dispose() }
})

test('focuses the new native rich-text editor when TipTap mounts after creation', async () => {
	const editor = new TestEditor()
	try {
		const source = rectangle(editor)
		editor.select(source.id)
		const result = addConnectedNode(editor, 'right')!
		const focusCalls: string[] = []
		const dom = {
			isConnected: true,
			ownerDocument: { activeElement: null as unknown },
			focus() { focusCalls.push('dom'); this.ownerDocument.activeElement = this },
		}
		await new Promise((resolve) => setTimeout(resolve, 55))
		editor.setRichTextEditor({
			isDestroyed: false,
			view: { dom },
			commands: { focus(position: string) { focusCalls.push(position); return true } },
		} as unknown as NonNullable<ReturnType<Editor['getRichTextEditor']>>)
		await new Promise((resolve) => setTimeout(resolve, 100))
		assert.deepEqual(focusCalls, ['dom', 'end'])
		assert.equal(editor.getEditingShapeId(), result.nodeId)
	} finally { editor.dispose() }
})

test('late editor mount does not steal focus after label editing ends', async () => {
	const editor = new TestEditor()
	try {
		const source = rectangle(editor)
		editor.select(source.id)
		addConnectedNode(editor, 'right')
		editor.setEditingShape(null)
		let focused = false
		editor.setRichTextEditor({
			isDestroyed: false,
			view: { dom: { isConnected: true, ownerDocument: { activeElement: null }, focus() { focused = true } } },
			commands: { focus() { focused = true; return true } },
		} as unknown as NonNullable<ReturnType<Editor['getRichTextEditor']>>)
		await new Promise((resolve) => setTimeout(resolve, 60))
		assert.equal(focused, false)
	} finally { editor.dispose() }
})

test('placement uses a nearby free lane before hopping past an occupied row', () => {
	const editor = new TestEditor()
	try {
		const source = rectangle(editor)
		const first = rectangle(editor, 350, 100, 160, 100)
		const second = rectangle(editor, 610, 100, 160, 100)
		editor.select(source.id)
		const result = addConnectedNode(editor, 'right')!
		const target = editor.getShapePageBounds(result.nodeId)!
		assert.equal(target.x, editor.getShapePageBounds(source.id)!.maxX + 96)
		assert.ok(Math.abs(target.y - editor.getShapePageBounds(source.id)!.y) >= 100)
		for (const obstacle of [first, second]) {
			const box = editor.getShapePageBounds(obstacle.id)!
			assert.ok(target.maxX + 24 <= box.x || target.x >= box.maxX + 24 || target.maxY + 24 <= box.y || target.y >= box.maxY + 24)
		}
	} finally { editor.dispose() }
})

test('placement is finite at negative page coordinates and brings an offscreen new node into view', () => {
	const editor = new TestEditor()
	try {
		const source = rectangle(editor, -10000, -10000)
		editor.select(source.id)
		const up = addConnectedNode(editor, 'up')!
		const bounds = editor.getShapePageBounds(up.nodeId)!
		assert.ok(Number.isFinite(bounds.x) && Number.isFinite(bounds.y))
		assert.ok(bounds.maxY < editor.getShapePageBounds(source.id)!.y)
		editor.setEditingShape(null)
		editor.setCurrentTool('select.idle')
		const edge = rectangle(editor, 970, 300)
		editor.select(edge.id)
		assert.equal(editor.isIn('select.idle'), true)
		assert.deepEqual(editor.getSelectedShapeIds(), [edge.id])
		assert.equal(canAddConnectedNode(editor), true)
		const zoomBefore = editor.getZoomLevel()
		const result = addConnectedNode(editor, 'right')!
		assert.ok(editor.getViewportPageBounds().contains(editor.getShapePageBounds(result.nodeId)!))
		assert.equal(editor.getZoomLevel(), zoomBefore, 'revealing the target keeps the current zoom')
		const right = findConnectedNodePlacement({ x: 1000, y: 600, w: 160, h: 100 }, { w: 160, h: 100 }, [], 'right')
		assert.ok(right.x > 1000)
		assert.ok(Number.isFinite(right.x) && Number.isFinite(right.y))
	} finally { editor.dispose() }
})

test('unavailable states never mutate the board: no selection, multi-selection, locked, read-only, tool state', () => {
	const editor = new TestEditor()
	try {
		const source = rectangle(editor)
		assert.equal(canAddConnectedNode(editor), false)
		assert.equal(addConnectedNode(editor, 'right'), null)
		const other = rectangle(editor, 500, 100)
		editor.select(source.id, other.id)
		assert.equal(addConnectedNode(editor, 'right'), null)
		editor.select(source.id)
		editor.updateShape({ id: source.id, type: 'geo', isLocked: true })
		assert.equal(editor.getShape(source.id)?.isLocked, true)
		assert.equal(addConnectedNode(editor, 'right'), null)
		editor.updateShape({ id: source.id, type: 'geo', isLocked: false })
		assert.equal(editor.getShape(source.id)?.isLocked, false)
		editor.updateInstanceState({ isReadonly: true })
		assert.equal(addConnectedNode(editor, 'right'), null)
		editor.updateInstanceState({ isReadonly: false })
		editor.setCurrentTool('draw')
		assert.equal(addConnectedNode(editor, 'right'), null)
		editor.setCurrentTool('select')
		assert.equal(canAddConnectedNode(editor), true)
		assert.equal(editor.getCurrentPageShapes().length, 2)
	} finally { editor.dispose() }
})

test('page capacity checks both new shapes before marking history', () => {
	const editor = new TestEditor(3)
	try {
		const source = rectangle(editor)
		editor.select(source.id)
		assert.equal(canAddConnectedNode(editor), true, 'one source plus two new shapes fits exactly')
		const blocker = rectangle(editor, 500, 100)
		editor.select(source.id)
		assert.equal(canAddConnectedNode(editor), false, 'two new shapes would exceed the page limit')
		assert.equal(addConnectedNode(editor, 'right'), null)
		assert.equal(editor.getCurrentPageShapes().length, 2)
		assert.ok(editor.getShape(blocker.id))
	} finally { editor.dispose() }
})
