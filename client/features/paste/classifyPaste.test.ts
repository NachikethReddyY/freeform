import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyPaste } from './classifyPaste'

test('recognizes Mermaid flowcharts with or without a fence', () => {
	for (const source of ['flowchart LR\nA --> B', '  ```mermaid\ngraph TD\nA --> B\n```\n']) {
		assert.deepEqual(classifyPaste(source), { kind: 'mermaid', source })
	}
	assert.equal(classifyPaste('graph theory is useful').kind, 'text')
})

test('recognizes SQL table schemas without confusing prose or ordinary SQL', () => {
	for (const source of ['CREATE TABLE users (id int);', '```sql\nCREATE TABLE IF NOT EXISTS users (id int);\n```']) {
		assert.deepEqual(classifyPaste(source), { kind: 'sql', source })
	}
	assert.equal(classifyPaste('I want to create table diagrams').kind, 'text')
	assert.equal(classifyPaste('SELECT * FROM users;').kind, 'code')
})

test('recognizes OpenAPI JSON before general JSON code', () => {
	const source = JSON.stringify({ info: { title: 'Shop' }, paths: { '/users': { get: {} } }, openapi: '3.1.0' })
	assert.deepEqual(classifyPaste(source), { kind: 'openapi', source })
	assert.equal(classifyPaste('{"openapi":"3.1.0","message":"hello"}').kind, 'code')
	assert.equal(classifyPaste('{"name":"freeform"}').kind, 'code')
})

test('recognizes short arrow chains while leaving source intact', () => {
	for (const source of ['Browser -> API -> DB', 'A → B', '  User -> Checkout  ']) {
		assert.deepEqual(classifyPaste(source), { kind: 'arrow-chain', source })
	}
	assert.equal(classifyPaste('x => y').kind, 'text')
	assert.equal(classifyPaste('A ->').kind, 'text')
	assert.equal(classifyPaste('A -> B\nA -> C').kind, 'text')
})

test('recognizes Markdown, code, URLs and ordinary text in that order', () => {
	assert.equal(classifyPaste('# Project notes\n- First step').kind, 'markdown')
	assert.equal(classifyPaste('- [ ] First step\n- [x] Done').kind, 'markdown')
	assert.equal(classifyPaste('```ts\nconst x = 1\n```').kind, 'code')
	assert.equal(classifyPaste('import { z } from "zod"\nconst schema = z.string()').kind, 'code')
	assert.equal(classifyPaste('https://example.com/docs?a=1').kind, 'url')
	assert.equal(classifyPaste('A sentence with https://example.com inside it.').kind, 'text')
	assert.equal(classifyPaste('The release is ready tomorrow.').kind, 'text')
})

test('image/file and empty clipboard content remains native, even with text fallback', () => {
	assert.deepEqual(classifyPaste('flowchart LR\nA --> B', { hasFiles: true }), { kind: 'native', source: 'flowchart LR\nA --> B' })
	assert.equal(classifyPaste('A -> B', { types: ['text/plain', 'Files'] }).kind, 'native')
	assert.equal(classifyPaste('hello', { types: ['image/png', 'text/plain'] }).kind, 'native')
	assert.deepEqual(classifyPaste(''), { kind: 'native', source: '' })
	assert.deepEqual(classifyPaste(' \n  '), { kind: 'native', source: ' \n  ' })
})
