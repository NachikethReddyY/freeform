import assert from 'node:assert/strict'
import test from 'node:test'
import { MessagePort } from 'node:worker_threads'
import {
	AssetRecordType,
	Box,
	Editor,
	PageRecordType,
	createShapeId,
	createTLStore,
	defaultBindingUtils,
	defaultShapeTools,
	defaultShapeUtils,
	defaultTools,
	parseTldrawJsonFile,
	serializeTldrawJson,
	type TLAsset,
} from 'tldraw'
import { readBoardIndex, type BoardIndexStorage } from '../boards/boardIndex'
import {
	MAX_NATIVE_FILE_BYTES,
	completePendingImport,
	exportImageBlob,
	getImageExportIds,
	parseNativeBoard,
	stageNativeImport,
	type DraftStore,
} from './nativeBoard'

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
	window: {
		document: documentRef, devicePixelRatio: 1,
		requestAnimationFrame: () => 0, cancelAnimationFrame() {},
		addEventListener() {}, removeEventListener() {},
	},
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
		})
		this.textMeasure.measureText = () => ({ x: 0, y: 0, w: 0, h: 0, scrollWidth: 0 })
		this.textMeasure.measureHtml = () => ({ x: 0, y: 0, w: 0, h: 0, scrollWidth: 0 })
		this.updateViewportScreenBounds(new Box(0, 0, 1080, 720))
	}
}

class MemoryDrafts implements DraftStore {
	readonly values = new Map<string, string>()
	async get(id: string) { return this.values.get(id) ?? null }
	async put(id: string, json: string) { this.values.set(id, json) }
	async delete(id: string) { this.values.delete(id) }
}

class MemoryBoardStorage implements BoardIndexStorage {
	private values = new Map<string, string>()
	getItem(key: string) { return this.values.get(key) ?? null }
	setItem(key: string, value: string) { this.values.set(key, value) }
}

function makeSource() {
	const editor = new TestEditor()
	const first = createShapeId('first')
	const second = createShapeId('second')
	editor.createShape({ id: first, type: 'geo', x: 20, y: 30, props: { geo: 'rectangle', w: 120, h: 80 } })
	editor.createShape({ id: second, type: 'geo', x: 240, y: 30, props: { geo: 'ellipse', w: 120, h: 80 } })
	return { editor, first, second }
}

function nativeFile(json: string, name = 'Diagram.tldr') {
	return new File([json], name, { type: 'application/vnd.tldraw+json' })
}

test('native export parses and round trips pages, shapes, and an embedded image asset', async () => {
	const { editor, first } = makeSource()
	const assetId = AssetRecordType.createId('embedded')
	const pageTwo = PageRecordType.createId('second')
	try {
		editor.createAssets([{ id: assetId, typeName: 'asset', type: 'image', props: {
			w: 1, h: 1, name: 'pixel.png', isAnimated: false, mimeType: 'image/png',
			src: 'data:image/png;base64,iVBORw0KGgo=',
		}, meta: {} }])
		editor.createShape({ id: createShapeId('image'), type: 'image', x: 10, y: 200, props: { assetId, w: 1, h: 1 } })
		editor.createPage({ id: pageTwo, name: 'Second page' })
		editor.setCurrentPage(pageTwo)
		editor.createShape({ id: createShapeId('third'), type: 'geo', x: 3, y: 4, props: { geo: 'diamond', w: 40, h: 40 } })

		const json = await serializeTldrawJson(editor)
		const parsed = parseNativeBoard(editor, json)
		assert.equal(parsed.pageCount, 2)
		assert.equal(parsed.shapeCount, 4)
		assert.equal(parsed.embeddedAssetCount, 1)
		assert.ok(parsed.snapshot.store[first])
		assert.equal((parsed.snapshot.store[assetId] as TLAsset).props.src, 'data:image/png;base64,iVBORw0KGgo=')
		assert.equal(parseTldrawJsonFile({ json, schema: editor.store.schema }).ok, true)
	} finally { editor.dispose() }
})

test('image export uses board or selected IDs without changing selection', async () => {
	const { editor, first, second } = makeSource()
	try {
		editor.select(first)
		assert.deepEqual(getImageExportIds(editor, 'selection'), [first])
		assert.deepEqual(new Set(getImageExportIds(editor, 'board')), new Set([first, second]))
		const seen: Array<{ ids: string[]; format?: string }> = []
		editor.toImage = async (ids, options) => {
			seen.push({ ids: ids.map((shape) => typeof shape === 'string' ? shape : shape.id), format: options?.format })
			return { blob: new Blob(['image'], { type: 'image/svg+xml' }), width: 100, height: 100 }
		}
		await exportImageBlob(editor, 'svg', 'selection')
		await exportImageBlob(editor, 'png', 'board')
		assert.deepEqual(seen, [
			{ ids: [first], format: 'svg' },
			{ ids: [first, second], format: 'png' },
		])
		assert.deepEqual(editor.getSelectedShapeIds(), [first])
	} finally { editor.dispose() }
})

test('invalid and oversized files leave source and board catalog unchanged', async () => {
	const { editor } = makeSource()
	const drafts = new MemoryDrafts()
	const boards = new MemoryBoardStorage()
	const before = editor.store.getStoreSnapshot()
	try {
		await assert.rejects(stageNativeImport(editor, nativeFile('{'), drafts, { boardStorage: boards }), /valid tldraw/i)
		await assert.rejects(stageNativeImport(editor, { name: 'huge.tldr', size: MAX_NATIVE_FILE_BYTES + 1, text: async () => '' } as File, drafts, { boardStorage: boards }), /too large/i)
		assert.deepEqual(editor.store.getStoreSnapshot(), before)
		assert.deepEqual(readBoardIndex(boards), [])
		assert.equal(drafts.values.size, 0)
	} finally { editor.dispose() }
})

test('storage failure does not create a board or mutate source', async () => {
	const { editor } = makeSource()
	const json = await serializeTldrawJson(editor)
	const boards = new MemoryBoardStorage()
	const before = editor.store.getStoreSnapshot()
	const drafts: DraftStore = { get: async () => null, put: async () => { throw new Error('Storage full') }, delete: async () => {} }
	try {
		await assert.rejects(stageNativeImport(editor, nativeFile(json), drafts, { boardStorage: boards, createId: () => 'board-new' }), /Storage full/)
		assert.deepEqual(editor.store.getStoreSnapshot(), before)
		assert.deepEqual(readBoardIndex(boards), [])
	} finally { editor.dispose() }
})

test('staged import hydrates only a blank new room, preserving multiple pages and assets', async () => {
	const { editor: source } = makeSource()
	const destination = new TestEditor()
	const occupied = new TestEditor()
	const drafts = new MemoryDrafts()
	const boards = new MemoryBoardStorage()
	const assetId = AssetRecordType.createId('embedded')
	try {
		source.createAssets([{ id: assetId, typeName: 'asset', type: 'image', props: {
			w: 1, h: 1, name: 'pixel.png', isAnimated: false, mimeType: 'image/png',
			src: 'data:image/png;base64,iVBORw0KGgo=',
		}, meta: {} }])
		source.createShape({ type: 'image', props: { assetId, w: 1, h: 1 } })
		source.createPage({ id: PageRecordType.createId('two'), name: 'Two' })
		const json = await serializeTldrawJson(source)
		const roomId = await stageNativeImport(source, nativeFile(json), drafts, { boardStorage: boards, createId: () => 'board-import-test' })
		assert.equal(roomId, 'board-import-test')
		assert.equal(source.getPages().length, 2)
		assert.equal(readBoardIndex(boards)[0]?.id, roomId)

		occupied.createShape({ type: 'geo' })
		const occupiedBefore = occupied.store.getStoreSnapshot()
		await assert.rejects(completePendingImport(occupied, roomId, drafts), /not empty/i)
		assert.deepEqual(occupied.store.getStoreSnapshot(), occupiedBefore)
		assert.ok(await drafts.get(roomId))

		const uploaded: string[] = []
		const result = await completePendingImport(destination, roomId, drafts, {
			uploadAsset: async (asset, file) => {
				uploaded.push(file.name)
				return { ...asset, props: { ...asset.props, src: '/api/uploads/imported-pixel' } }
			},
		})
		assert.equal(result, 'imported')
		assert.equal(destination.getPages().length, 2)
		assert.equal(destination.store.allRecords().filter((record) => record.typeName === 'shape').length, 3)
		assert.equal((destination.getAsset(assetId) as TLAsset).props.src, '/api/uploads/imported-pixel')
		assert.deepEqual(uploaded, ['pixel.png'])
		assert.equal(await drafts.get(roomId), null)
	} finally { source.dispose(); destination.dispose(); occupied.dispose() }
})

test('failed embedded asset upload leaves the new room blank and keeps the staged file', async () => {
	const { editor: source } = makeSource()
	const destination = new TestEditor()
	const drafts = new MemoryDrafts()
	const boards = new MemoryBoardStorage()
	const assetId = AssetRecordType.createId('upload-failure')
	try {
		source.createAssets([{ id: assetId, typeName: 'asset', type: 'image', props: {
			w: 1, h: 1, name: 'pixel.png', isAnimated: false, mimeType: 'image/png',
			src: 'data:image/png;base64,iVBORw0KGgo=',
		}, meta: {} }])
		source.createShape({ type: 'image', props: { assetId, w: 1, h: 1 } })
		const roomId = await stageNativeImport(source, nativeFile(await serializeTldrawJson(source)), drafts, {
			boardStorage: boards, createId: () => 'board-upload-failure',
		})
		const before = destination.store.getStoreSnapshot()
		await assert.rejects(completePendingImport(destination, roomId, drafts, {
			uploadAsset: async () => { throw new Error('Network unavailable') },
		}), /Network unavailable/)
		assert.deepEqual(destination.store.getStoreSnapshot(), before)
		assert.ok(await drafts.get(roomId))
	} finally { source.dispose(); destination.dispose() }
})
