import assert from 'node:assert/strict'
import test from 'node:test'
import { MessagePort } from 'node:worker_threads'
import {
	Box, Editor, createTLStore, defaultAddFontsFromNode, defaultBindingUtils, defaultShapeTools,
	defaultShapeUtils, defaultTools, parseTldrawJsonFile, renderPlaintextFromRichText, serializeTldrawJson,
	tipTapDefaultExtensions,
} from 'tldraw'
import { applyNativePasteCard, createNativePasteCard } from './nativeCard'
import type { IncomingPasteCard } from './cardPaste'

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
		return `<${this.tagName}${[...this.attributes].map(([key, value]) => ` ${key}="${value}"`).join('')}>${this.innerHTML}</${this.tagName}>`
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

const markdown: IncomingPasteCard = {
	kind: 'markdown', title: 'Notes', preview: 'Notes', source: '# Notes\n- Client\n- API',
}

test('native proposals render Markdown structure and retain exact original source in shape metadata', () => {
	const editor = new TestEditor()
	try {
	const pageId = editor.getCurrentPageId()
	const code = createNativePasteCard({ kind: 'code', title: 'TypeScript', language: 'ts', preview: 'const n = 1', source: 'const n = 1' }, pageId)
	assert.equal(code.type, 'geo')
	assert.equal(code.parentId, pageId)
	assert.equal(code.props?.font, 'mono')
	assert.match(renderPlaintextFromRichText(editor, code.props!.richText!), /const n = 1/)
	assert.deepEqual(code.meta?.freeformPasteCard, { version: 1, kind: 'code', originalSource: 'const n = 1' })
	const note = createNativePasteCard(markdown, pageId)
	assert.equal(note.props?.font, 'sans')
	assert.equal((note.props?.richText?.content[0] as { type?: string })?.type, 'heading')
		assert.equal((note.props?.richText?.content[1] as { type?: string })?.type, 'paragraph')
		assert.match(renderPlaintextFromRichText(editor, note.props!.richText!), /Notes\n+• Client\n+• API/)
	assert.deepEqual(note.meta?.freeformPasteCard, { version: 1, kind: 'markdown', originalSource: markdown.source })
	const link = createNativePasteCard({ kind: 'url', title: 'example.com', preview: '/docs', source: 'https://example.com/docs', url: 'https://example.com/docs' }, pageId)
	assert.equal(link.props?.url, 'https://example.com/docs')
	assert.throws(() => createNativePasteCard({ kind: 'url', title: 'Bad', preview: '', source: 'javascript:alert(1)', url: 'javascript:alert(1)' }, pageId), /HTTP/)
	} finally { editor.dispose() }
})

test('Markdown headings and readable list text remain standard editable geo records', () => {
	const editor = new TestEditor()
	try {
		const page = editor.getCurrentPageId()
		const source = '# API\n- **Client** calls [service](https://example.com)\n- [bad](javascript:alert(1))'
		const shape = createNativePasteCard({ kind: 'markdown', title: 'API', preview: 'API', source }, page)
		assert.equal(shape.type, 'geo')
		assert.equal((shape.props?.richText?.content[0] as { type?: string })?.type, 'heading')
		assert.equal((shape.props?.richText?.content[1] as { type?: string })?.type, 'paragraph')
		const nodes = JSON.stringify(shape.props?.richText)
		assert.match(nodes, /Client/)
		assert.match(nodes, /service/)
		assert.doesNotMatch(nodes, /"marks"/, 'Canvas card keeps text flat to avoid Safari inline text overlap')
		assert.doesNotMatch(nodes, /"href":"javascript:/)
		assert.match(renderPlaintextFromRichText(editor, shape.props!.richText!), /• Client calls service/)
		assert.equal(shape.meta?.freeformPasteCard && (shape.meta.freeformPasteCard as { originalSource: string }).originalSource, source)
		const code = createNativePasteCard({ kind: 'code', title: 'TypeScript', language: 'ts', preview: '', source: '```ts\nconst n = 1\n```' }, page)
		assert.equal(code.props?.font, 'mono')
		assert.doesNotMatch(JSON.stringify(code.props?.richText), /"marks"/, 'Canvas code title uses readable plain text')
		assert.equal(renderPlaintextFromRichText(editor, code.props!.richText!), 'TypeScript\nconst n = 1')
		assert.deepEqual(code.meta?.freeformPasteCard, { version: 1, kind: 'code', originalSource: '```ts\nconst n = 1\n```' })
		const paddedUrl = createNativePasteCard({ kind: 'url', title: 'example.com', preview: '/docs', source: ' https://example.com/docs\n', url: 'https://example.com/docs' }, page)
		assert.equal(paddedUrl.props?.url, 'https://example.com/docs')
		assert.doesNotMatch(JSON.stringify(paddedUrl.props?.richText), /"marks"/, 'Canvas URL title uses readable plain text')
		assert.deepEqual(paddedUrl.meta?.freeformPasteCard, { version: 1, kind: 'url', originalSource: ' https://example.com/docs\n' })
	} finally { editor.dispose() }
})

test('accept inserts one editable native card on the target page and undo removes it', () => {
	const editor = new TestEditor()
	try {
		const page = editor.getCurrentPageId()
		assert.equal(editor.getCurrentPageShapes().length, 0)
		const id = applyNativePasteCard(editor, markdown, page)
		const shape = editor.getShape(id)
		assert.equal(shape?.type, 'geo')
		if (shape?.type !== 'geo') throw new Error('Expected geo')
		assert.match(renderPlaintextFromRichText(editor, shape.props.richText), /Notes\n+• Client\n+• API/)
		assert.equal(editor.getSelectedShapeIds()[0], id)
		editor.undo()
		assert.equal(editor.getShape(id), undefined)
	} finally { editor.dispose() }
})

test('formatted native card and exact source survive a .tldr round trip', async () => {
	const editor = new TestEditor()
	try {
		const id = applyNativePasteCard(editor, markdown, editor.getCurrentPageId())
		const json = await serializeTldrawJson(editor)
		const parsed = parseTldrawJsonFile({ json, schema: editor.store.schema })
		assert.equal(parsed.ok, true)
		if (!parsed.ok) return
		const shape = parsed.value.getStoreSnapshot().store[id]
		assert.equal(shape?.typeName, 'shape')
		if (shape?.typeName !== 'shape') return
		assert.equal(shape.type, 'geo')
		assert.deepEqual(shape.meta.freeformPasteCard, { version: 1, kind: 'markdown', originalSource: markdown.source })
	} finally { editor.dispose() }
})

test('accept rejects a changed page or invalid card before mutation', () => {
	const editor = new TestEditor()
	try {
		const wrongPage = 'page:other' as ReturnType<TestEditor['getCurrentPageId']>
		assert.throws(() => applyNativePasteCard(editor, markdown, wrongPage), /original page/)
		assert.throws(() => applyNativePasteCard(editor, { ...markdown, source: 'x'.repeat(40_000) }, editor.getCurrentPageId()), /too large/)
		assert.equal(editor.getCurrentPageShapes().length, 0)
	} finally { editor.dispose() }
})
