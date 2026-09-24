import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMermaidFlowchart } from './mermaid'

test('imports connected native nodes, branch labels, and chained edges', () => {
	const result = parseMermaidFlowchart('flowchart LR\nA[Browser] --> B{Signed in?}\nB -->|yes| C((Ready))\nB -->|no| D[Login] --> A')
	assert.deepEqual(result.nodes.map(({ id, label, kind }) => ({ id, label, kind })), [
		{ id: 'A', label: 'Browser', kind: 'rectangle' },
		{ id: 'B', label: 'Signed in?', kind: 'diamond' },
		{ id: 'C', label: 'Ready', kind: 'ellipse' },
		{ id: 'D', label: 'Login', kind: 'rectangle' },
	])
	assert.equal(result.edges.length, 4)
	assert.equal(result.edges[1].label, 'yes')
	assert.ok(new Set(result.nodes.map(({ x, y }) => `${x},${y}`)).size === 4)
})

test('preserves semicolons and arrows inside quoted labels and Mermaid fences', () => {
	const result = parseMermaidFlowchart('```mermaid\ngraph TD; A["Read; A --> B"] --> B[Done]\n```')
	assert.equal(result.nodes[0].label, 'Read; A --> B')
	assert.ok(result.nodes[1].y > result.nodes[0].y)
})

test('rejects unsupported syntax, dangling edges, missing declarations, and overflow', () => {
	for (const source of [
		'sequenceDiagram\nAlice->>Bob: hello',
		'flowchart LR\nsubgraph box\nA-->B\nend',
		'flowchart LR\nA -->',
		'flowchart LR\nA -.-> B',
		'flowchart LR\nA[(Database)] --> B',
		'flowchart LR\nclick A "https://example.com"',
		'A --> B',
		`flowchart LR\n${Array.from({ length: 81 }, (_, i) => `N${i}[Node ${i}]`).join('\n')}`,
	]) assert.throws(() => parseMermaidFlowchart(source), { name: 'Error' }, source)
})
