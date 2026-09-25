import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMermaidFlowchart } from '../diagrams/mermaid'
import { diagramFromClipboard } from './diagramPaste'

function clipboard(text: string, types: string[] = ['text/plain'], files = 0, html = '') {
	return {
		types,
		files: { length: files },
		items: [] as { kind: string }[],
		getData: (format: string) => format === 'text/plain' ? text : format === 'text/html' ? html : '',
	}
}

test('recognizable diagram text routes to the review format with exact source', () => {
	const mermaid = '  flowchart LR\nA --> B  '
	const sql = 'CREATE TABLE users (id INT);'
	const openapi = JSON.stringify({ openapi: '3.1.0', info: { title: 'Shop' }, paths: { '/users': { get: {} } } })
	assert.deepEqual(diagramFromClipboard(clipboard(mermaid)), { format: 'mermaid', source: mermaid })
	assert.deepEqual(diagramFromClipboard(clipboard(sql)), { format: 'sql', source: sql })
	assert.deepEqual(diagramFromClipboard(clipboard(openapi)), { format: 'openapi', source: openapi })
})

test('short arrow chains become importable Mermaid flowcharts', () => {
	const chain = diagramFromClipboard(clipboard('Browser -> API → DB'))
	assert.deepEqual(chain, {
		format: 'mermaid',
		source: 'flowchart LR\nN1["Browser"] --> N2["API"] --> N3["DB"]',
	})
	assert.equal(parseMermaidFlowchart(chain!.source).edges.length, 2)
	assert.deepEqual(diagramFromClipboard(clipboard('User Login -> API/v1')), {
		format: 'mermaid',
		source: 'flowchart LR\nN1["User Login"] --> N2["API/v1"]',
	})
})

test('ordinary board paste remains native', () => {
	for (const source of ['A sentence.', '# Markdown\n- text', '```ts\nconst n = 1\n```', 'https://example.com', '{"name":"app"}', '']) {
		assert.equal(diagramFromClipboard(clipboard(source)), null, source)
	}
	assert.equal(diagramFromClipboard(clipboard('A -> B', ['text/plain', 'Files'], 1)), null)
	assert.equal(diagramFromClipboard(clipboard('flowchart LR\nA --> B', ['text/plain', 'image/png'])), null)
	assert.equal(diagramFromClipboard(clipboard('flowchart LR\nA --> B', ['text/plain', 'application/x-custom'])), null)
	assert.equal(diagramFromClipboard(clipboard('flowchart LR\nA --> B', ['text/plain'], 1)), null)
	assert.equal(diagramFromClipboard({ ...clipboard('flowchart LR\nA --> B'), items: [{ kind: 'file' }] }), null)
	assert.equal(diagramFromClipboard(clipboard('flowchart LR\nA --> B', ['text/plain', 'text/html'], 0, '<div data-tldraw="true">shapes</div>')), null)
	assert.deepEqual(diagramFromClipboard(clipboard('flowchart LR\nA --> B', ['text/plain', 'text/html'], 0, '<pre>flowchart LR</pre>')), {
		format: 'mermaid', source: 'flowchart LR\nA --> B',
	})
})
