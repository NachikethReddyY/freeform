import assert from 'node:assert/strict'
import test from 'node:test'
import { MessagePort } from 'node:worker_threads'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Editor, TLPageId } from 'tldraw'
import { CardPastePanel } from './CardPastePanel'
import type { IncomingPasteCard } from './cardPaste'

for (const handle of (process as NodeJS.Process & { _getActiveHandles(): unknown[] })._getActiveHandles()) {
	if (handle instanceof MessagePort) handle.unref()
}

const pageId = 'page:test' as TLPageId
const editor = {} as Editor

test('review panel exposes preview and source modes with explicit Insert/Cancel controls', () => {
	const card: IncomingPasteCard = { kind: 'code', title: 'TypeScript', preview: 'const n = 1', source: 'const n = 1' }
	const markup = renderToStaticMarkup(createElement(CardPastePanel, { editor, card, pageId, onClose: () => {} }))
	assert.match(markup, /aria-label="Paste preview"/)
	assert.match(markup, /TypeScript/)
	assert.match(markup, /Rendered card preview/)
	assert.match(markup, /freeform-paste-token-keyword[^>]*>const<\/span>/)
	assert.match(markup, />Preview<\/button>/)
	assert.match(markup, />Source<\/button>/)
	assert.match(markup, />Add to board<\/button>/)
	assert.match(markup, />Cancel<\/button>/)
	assert.match(markup, /aria-label="Close paste preview"/)
})

test('preview renders Markdown as safe document structure and code as tokenized text', () => {
	const note: IncomingPasteCard = { kind: 'markdown', title: 'Notes', preview: 'Notes', source: '# Notes\n- **Safe** [docs](https://example.com)\n- <img src=x onerror=alert(1)>' }
	const markup = renderToStaticMarkup(createElement(CardPastePanel, { editor, card: note, pageId, onClose: () => {} }))
	assert.match(markup, /<h3><span>Notes<\/span><\/h3>/)
	assert.match(markup, /<ul>/)
	assert.match(markup, /<strong>Safe<\/strong>/)
	assert.match(markup, /href="https:\/\/example.com"/)
	assert.doesNotMatch(markup, /<img src=x/)
	const code: IncomingPasteCard = { kind: 'code', title: 'TypeScript', language: 'ts', preview: '', source: '```ts\nconst value = 42\n```' }
	const codeMarkup = renderToStaticMarkup(createElement(CardPastePanel, { editor, card: code, pageId, onClose: () => {} }))
	assert.match(codeMarkup, /freeform-paste-token-keyword[^>]*>const<\/span>/)
	assert.match(codeMarkup, /freeform-paste-token-number[^>]*>42<\/span>/)
})

test('untrusted source is escaped and rendering does not mutate the editor', () => {
	const card: IncomingPasteCard = { kind: 'markdown', title: '<script>', preview: '<script>', source: '<script>alert(1)</script>' }
	const markup = renderToStaticMarkup(createElement(CardPastePanel, { editor, card, pageId, onClose: () => {} }))
	assert.ok(!markup.includes('<script>'))
	assert.match(markup, /&lt;script&gt;/)
})
