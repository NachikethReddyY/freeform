import assert from 'node:assert/strict'
import test from 'node:test'
import type { Editor, TLImageExportOptions } from 'tldraw'
import {
	MAX_BOARD_PREVIEW_BYTES,
	isBoardPreview,
	readBoardPreview,
	type BoardPreview,
} from './boardPreview'
import { captureBoardPreview, getPreviewScale, isLocalPreviewUrl } from './previewCapture'

const preview: BoardPreview = {
	roomId: 'preview-room_a',
	pageId: 'page:one',
	blob: new Blob(['png-fixture'], { type: 'image/png' }),
	width: 480,
	height: 240,
	updatedAt: 123,
}

test('stored previews are bounded PNGs tied to one valid room and page', () => {
	assert.equal(isBoardPreview(preview, preview.roomId), true)
	assert.equal(isBoardPreview(preview, 'another-room'), false)
	assert.equal(isBoardPreview({ ...preview, roomId: '../room' }), false)
	assert.equal(isBoardPreview({ ...preview, pageId: 'not-a-page' }), false)
	assert.equal(isBoardPreview({ ...preview, width: 481 }), false)
	assert.equal(isBoardPreview({ ...preview, height: 0 }), false)
	assert.equal(isBoardPreview({ ...preview, width: 255.5, height: 81.15882352941176 }), true)
	assert.equal(isBoardPreview({ ...preview, width: Number.NaN }), false)
	assert.equal(isBoardPreview({ ...preview, updatedAt: Number.NaN }), false)
	assert.equal(isBoardPreview({ ...preview, blob: new Blob(['svg'], { type: 'image/svg+xml' }) }), false)
	assert.equal(isBoardPreview({ ...preview, blob: new Blob([new Uint8Array(MAX_BOARD_PREVIEW_BYTES + 1)], { type: 'image/png' }) }), false)
	assert.equal(isBoardPreview(null), false)
})

test('thumbnail export fits both wide and tall content including padding without upscaling', () => {
	assert.equal(getPreviewScale(448, 100), 1)
	assert.equal(getPreviewScale(928, 208), 0.5)
	assert.equal(getPreviewScale(208, 928), 0.5)
	assert.equal(getPreviewScale(100, 100), 1)
	assert.equal(getPreviewScale(0, 0), 1)
	assert.equal(getPreviewScale(Number.POSITIVE_INFINITY, 100), null)
	assert.equal(getPreviewScale(-1, 100), null)
})

test('text bounds are measured after its font has loaded', async (context) => {
	const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
	Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'http://localhost:5173' } } })
	context.after(() => {
		if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
		else Reflect.deleteProperty(globalThis, 'window')
	})
	const shape = { id: 'shape:text-preview', type: 'text' }
	let fontReady = false
	let exportedScale = 0
	const editor = {
		getCurrentPageId: () => preview.pageId,
		getCurrentPageShapes: () => [shape],
		getShapePageBounds: () => {
			assert.equal(fontReady, true, 'capture should wait for the text face before measuring')
			return { x: 0, y: 0, maxX: 928, maxY: 200 }
		},
		fonts: {
			getShapeFontFaces: () => [],
			loadRequiredFontsForCurrentPage: async () => { fontReady = true },
		},
		getColorMode: () => 'dark',
		toImage: async (_shapes: unknown, options: TLImageExportOptions) => {
			exportedScale = options.scale ?? 0
			return { blob: preview.blob, width: 480, height: 116 }
		},
	} as unknown as Editor

	const result = await captureBoardPreview(editor, preview.roomId)
	assert.equal(exportedScale, 0.5)
	assert.equal(result?.width, 480)
})

test('thumbnail background and shape palette follow the current editor theme without changing content', async (context) => {
	const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
	Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'http://localhost:5173' } } })
	context.after(() => {
		if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
		else Reflect.deleteProperty(globalThis, 'window')
	})
	const shape = Object.freeze({ id: 'shape:preview-theme', type: 'geo' })
	const shapes = Object.freeze([shape])
	const exports: TLImageExportOptions[] = []
	let darkMode = true
	const editor = {
		getCurrentPageId: () => preview.pageId,
		getCurrentPageShapes: () => shapes,
		getShapePageBounds: () => ({ x: 0, y: 0, maxX: 100, maxY: 100 }),
		fonts: { getShapeFontFaces: () => [], loadRequiredFontsForCurrentPage: async () => {} },
		getColorMode: () => darkMode ? 'dark' : 'light',
		toImage: async (exportedShapes: unknown, options: TLImageExportOptions) => {
			assert.equal(exportedShapes, shapes)
			exports.push(options)
			return { blob: preview.blob, width: 132, height: 132 }
		},
	} as unknown as Editor

	const darkPreview = await captureBoardPreview(editor, preview.roomId)
	darkMode = false
	const lightPreview = await captureBoardPreview(editor, preview.roomId)
	assert.deepEqual(exports.map(({ background, darkMode: dark }) => ({ background, dark })), [
		{ background: true, dark: true },
		{ background: true, dark: false },
	])
	assert.equal(isBoardPreview(darkPreview, preview.roomId), true)
	assert.equal(isBoardPreview(lightPreview, preview.roomId), true)
	assert.deepEqual(shapes, [{ id: 'shape:preview-theme', type: 'geo' }])
})

test('automatic export only permits local asset and font sources', () => {
	const origin = 'http://localhost:5173'
	for (const url of ['/assets/font.woff2', './font.woff2', 'http://localhost:5173/api/uploads/image.png', 'blob:http://localhost:5173/123', 'data:image/png;base64,AAAA', 'data:font/woff2;base64,AAAA']) {
		assert.equal(isLocalPreviewUrl(url, origin), true, url)
	}
	for (const url of ['https://cdn.example/font.woff2', '//cdn.example/image.png', 'http://localhost:5174/image.png', 'blob:https://example.com/123', 'javascript:alert(1)', 'tldraw_sans', '', 'data:text/html,hello']) {
		assert.equal(isLocalPreviewUrl(url, origin), false, url)
	}
})

test('missing browser storage and invalid room IDs fail quietly', async () => {
	assert.equal(await readBoardPreview('preview-room_a'), null)
	assert.equal(await readBoardPreview('../wrong-room'), null)
})
