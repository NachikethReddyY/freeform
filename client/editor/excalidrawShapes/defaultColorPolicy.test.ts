import assert from 'node:assert/strict'
import test from 'node:test'
import type { TLShape } from 'tldraw'
import { colorNewToolShape } from './defaultColorPolicy'

const shape = (type: string, meta: TLShape['meta'] = {}) => ({ type, props: { color: 'black' }, meta } as TLShape)

test('manual tool creations receive the chosen color before entering the store', () => {
	for (const type of ['geo', 'text', 'arrow', 'line', 'draw']) {
		const value = shape(type)
		const result = colorNewToolShape(value, 'user', `${type}.${type === 'draw' ? 'drawing' : 'pointing'}`, '#12abcd')
		assert.deepEqual(result.meta.freeformColor, { version: 1, hex: '#12abcd', base: 'black' })
		assert.equal(result.props, value.props)
		assert.deepEqual(value.meta, {})
	}
})

test('default colors preserve remote, pasted, duplicate, restored, and unsupported records', () => {
	const value = shape('geo')
	for (const state of ['select.idle', 'select.translating', 'geo.idle', 'text.pointing', 'select.resizing']) {
		assert.equal(colorNewToolShape(value, 'user', state, '#12abcd'), value)
	}
	assert.equal(colorNewToolShape(value, 'remote', 'geo.pointing', '#12abcd'), value)
	assert.equal(colorNewToolShape(value, 'user', 'geo.pointing', null), value)
	for (const type of ['note', 'frame', 'highlight', 'image']) {
		const unsupported = shape(type)
		assert.equal(colorNewToolShape(unsupported, 'user', `${type}.pointing`, '#12abcd'), unsupported)
	}
	const colored = shape('geo', { freeformColor: { version: 1, hex: '#abcdef', base: 'black' } })
	assert.equal(colorNewToolShape(colored, 'user', 'geo.pointing', '#12abcd'), colored)
})
