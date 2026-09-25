import assert from 'node:assert/strict'
import test from 'node:test'
import { cardFromClipboard } from './cardPaste'
import { diagramFromClipboard } from './diagramPaste'

function clipboard(text: string, types: string[] = ['text/plain'], html = '', fileCount = 0) {
	return {
		types,
		files: { length: fileCount },
		items: [] as { kind: string }[],
		getData: (format: string) => format === 'text/plain' ? text : format === 'text/html' ? html : '',
	}
}

test('Markdown proposes a concise card while preserving original source', () => {
	const source = '  # Architecture notes\n\n- Client\n- API\n  '
	assert.deepEqual(cardFromClipboard(clipboard(source)), {
		kind: 'markdown', title: 'Architecture notes', source, preview: 'Architecture notes',
	})
	assert.equal(cardFromClipboard(clipboard('An ordinary sentence.')), null)
})

test('code and structured JSON produce bounded typed proposals', () => {
	const fenced = '```ts\nconst answer = 42\n```'
	assert.deepEqual(cardFromClipboard(clipboard(fenced)), {
		kind: 'code', title: 'TypeScript', language: 'ts', source: fenced, preview: 'const answer = 42',
	})
	assert.deepEqual(cardFromClipboard(clipboard('```md\n# Sample\n```')), {
		kind: 'code', title: 'MD', language: 'md', source: '```md\n# Sample\n```', preview: '# Sample',
	})
	const json = '{"name":"FreeForm","enabled":true}'
	assert.deepEqual(cardFromClipboard(clipboard(json)), {
		kind: 'json', title: 'JSON', source: json, preview: 'name · enabled',
	})
	assert.equal(cardFromClipboard(clipboard('{"name":')), null)
	assert.equal(cardFromClipboard(clipboard('```json\n[1,2,3]\n```'))?.kind, 'json')
	assert.equal(cardFromClipboard(clipboard('"just a string"')), null)
})

test('one safe HTTP URL proposes a link card without fetching it', () => {
	const source = 'https://example.com/docs/guide?section=api'
	assert.deepEqual(cardFromClipboard(clipboard(source)), {
		kind: 'url', title: 'example.com', url: source, source, preview: '/docs/guide',
	})
	assert.equal(cardFromClipboard(clipboard('https://user:pass@example.com')), null)
	assert.equal(cardFromClipboard(clipboard('javascript:alert(1)')), null)
	assert.equal(cardFromClipboard(clipboard('See https://example.com for details')), null)
})

test('a matching URI-list clipboard format keeps the URL review route', () => {
	const url = 'https://example.com/docs/guide'
	assert.deepEqual(cardFromClipboard({
		...clipboard(url, ['text/plain', 'text/uri-list']),
		getData: (format: string) => format === 'text/uri-list' || format === 'text/plain' ? url : '',
	}), {
		kind: 'url', title: 'example.com', url, source: url, preview: '/docs/guide',
	})
	assert.equal(cardFromClipboard({
		...clipboard(url, ['text/plain', 'text/uri-list']),
		getData: (format: string) => format === 'text/plain' ? url : 'https://other.example.com/',
	}), null)
	const json = '{"name":"FreeForm"}'
	assert.equal(cardFromClipboard({
		...clipboard(json, ['text/plain', 'text/uri-list']),
		getData: () => json,
	}), null)
})

test('native media, board records, and rich clipboard content remain native', () => {
	const markdown = '# Notes\n- Item'
	assert.equal(cardFromClipboard(clipboard(markdown, ['text/plain', 'Files'], '', 1)), null)
	assert.equal(cardFromClipboard(clipboard(markdown, ['text/plain', 'image/png'])), null)
	assert.equal(cardFromClipboard({ ...clipboard(markdown), items: [{ kind: 'file' }] }), null)
	assert.equal(cardFromClipboard(clipboard(markdown, ['text/plain', 'text/html'], '<strong>Notes</strong>')), null)
	assert.equal(cardFromClipboard(clipboard(markdown, ['text/plain', 'text/html'], '<div data-tldraw="true">shapes</div>')), null)
	assert.equal(cardFromClipboard(clipboard(markdown, ['text/plain', 'application/x-tldraw'])), null)
	assert.equal(cardFromClipboard(clipboard('')), null)
})

test('diagram imports keep their existing review route', () => {
	for (const source of [
		'flowchart LR\nA --> B',
		'CREATE TABLE users (id INT);',
		'{"openapi":"3.1.0","info":{"title":"API"},"paths":{}}',
		'Client -> API -> Database',
	]) {
		assert.notEqual(diagramFromClipboard(clipboard(source)), null)
		assert.equal(cardFromClipboard(clipboard(source)), null)
	}
})

test('oversized card source is left for native paste', () => {
	assert.equal(cardFromClipboard(clipboard('```ts\n' + 'x'.repeat(8_001) + '\n```')), null)
	assert.equal(cardFromClipboard(clipboard('# Notes\n' + 'item\n'.repeat(240))), null)
	assert.equal(cardFromClipboard(clipboard('https://example.com/' + 'a'.repeat(2_049))), null)
})
