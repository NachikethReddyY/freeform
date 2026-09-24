import assert from 'node:assert/strict'
import test from 'node:test'
import type { TLGeoShape } from 'tldraw'
import { getCustomColor, getCustomFill, normalizeHexColor, withCustomColor, withoutCustomColor } from './colors'

function shape(meta: TLGeoShape['meta'] = {}, color: TLGeoShape['props']['color'] = 'black') {
	return { type: 'geo', props: { color }, meta } as TLGeoShape
}

test('accepts only RGB hex colors and normalizes shorthand without accepting CSS expressions', () => {
	assert.equal(normalizeHexColor('#AbC'), '#aabbcc')
	assert.equal(normalizeHexColor(' 12Ab34 '), '#12ab34')
	for (const value of ['', '#12', '#12345g', '#12345678', 'red', 'url(https://example.com)', 'var(--color)', 123, null]) {
		assert.equal(normalizeHexColor(value), null)
	}
})

test('custom metadata is versioned, validates on read, and does not override a changed native color', () => {
	const meta = withCustomColor(shape({ provenance: 'keep' }), '#123456')
	assert.equal(meta.provenance, 'keep')
	assert.equal(getCustomColor(shape(meta)), '#123456')
	assert.equal(getCustomColor(shape(meta, 'blue')), null)
	assert.equal(getCustomColor(shape({ freeformColor: { version: 2, hex: '#123456', base: 'black' } })), null)
	assert.equal(getCustomColor(shape({ freeformColor: { version: 1, hex: 'red', base: 'black' } })), null)
	assert.equal(getCustomColor(shape({ freeformColor: '#123456' })), null)
})

test('native-color reset explicitly clears the override while preserving unrelated metadata', () => {
	const meta = withCustomColor(shape({ provenance: 'keep' }), '#123456')
	const reset = withoutCustomColor(shape(meta))
	assert.equal(reset.provenance, 'keep')
	assert.equal(reset.freeformColor, null, 'null survives tldraw partial metadata merges')
	assert.equal(getCustomColor(shape(reset)), null)
})

test('custom fill respects native none, canvas-solid, tinted, and colored-fill choices', () => {
	assert.equal(getCustomFill('#123456', 'none', '#fafafa', 'light'), 'transparent')
	assert.equal(getCustomFill('#123456', 'semi', '#fafafa', 'light'), '#fafafa')
	assert.equal(getCustomFill('#123456', 'fill', '#fafafa', 'light'), '#123456')
	assert.equal(getCustomFill('#000000', 'solid', '#ffffff', 'light'), '#cccccc')
	assert.equal(getCustomFill('#ffffff', 'solid', '#000000', 'dark'), '#4d4d4d')
})
