import assert from 'node:assert/strict'
import test from 'node:test'
import type { TLGeoShape } from 'tldraw'
import { backgroundForNewShape, getBackgroundColor, getDisplayedBackgroundColor, nextFillForBackground, withBackgroundColor, withoutBackgroundColor } from './backgroundColor'
import { shapeBackgroundDisplayValues } from './backgroundDisplay'
import { getCustomFill, withCustomColor, withoutCustomColor } from './colors'

const geo = (meta: TLGeoShape['meta'] = {}, color: TLGeoShape['props']['color'] = 'black') =>
	({ type: 'geo', props: { color, fill: 'fill' }, meta } as TLGeoShape)

test('background color stays independent of stroke color and preserves other metadata', () => {
	const original = geo({ provenance: 'keep', freeformColor: { version: 1, hex: '#abcdef', base: 'black' } })
	const updated = geo(withBackgroundColor(original, '#ff8080'))
	assert.equal(getBackgroundColor(updated), '#ff8080')
	assert.deepEqual(updated.meta.freeformColor, original.meta.freeformColor)
	assert.equal(updated.meta.provenance, 'keep')
	assert.equal(getBackgroundColor(geo(updated.meta, 'blue')), '#ff8080')
	const cleared = geo(withoutBackgroundColor(updated))
	assert.equal(getBackgroundColor(cleared), null)
	assert.equal(cleared.meta.freeformBackgroundColor, null)
	assert.deepEqual(cleared.meta.freeformColor, original.meta.freeformColor)
})

test('invalid metadata cannot render as a background color', () => {
	assert.equal(getBackgroundColor(geo({ freeformBackgroundColor: { version: 2, hex: '#aabbcc' } })), null)
	assert.equal(getBackgroundColor(geo({ freeformBackgroundColor: { version: 1, hex: 'red' } })), null)
	assert.equal(getBackgroundColor(geo({ freeformBackgroundColor: '#aabbcc' })), null)
})

test('only manual geometry creation inherits the background default', () => {
	const value = geo()
	const created = backgroundForNewShape(value, 'user', 'geo.pointing', '#112233') as TLGeoShape
	assert.equal(getBackgroundColor(created), '#112233')
	assert.equal(created.props.fill, 'fill')
	assert.equal(backgroundForNewShape(value, 'remote', 'geo.pointing', '#112233'), value)
	assert.equal(backgroundForNewShape(value, 'user', 'select.translating', '#112233'), value)
	assert.equal(backgroundForNewShape(geo({ freeformBackgroundColor: null }), 'user', 'geo.pointing', '#112233').meta.freeformBackgroundColor, null)
	const patterned = { ...value, props: { ...value.props, fill: 'pattern' as const } }
	assert.equal((backgroundForNewShape(patterned, 'user', 'geo.pointing', '#112233') as TLGeoShape).props.fill, 'pattern')
	const transparent = { ...value, props: { ...value.props, fill: 'none' as const } }
	assert.equal((backgroundForNewShape(transparent, 'user', 'geo.pointing', '#112233') as TLGeoShape).props.fill, 'none')
})

test('changing background preserves visible fill styles and reveals an explicitly colored empty fill', () => {
	for (const fill of ['pattern', 'lined-fill', 'solid', 'fill'] as const) assert.equal(nextFillForBackground(fill), fill)
	assert.equal(nextFillForBackground('none'), 'fill')
	assert.equal(nextFillForBackground('semi'), 'fill')
})

test('geometry display values keep stroke independent and honor transparent fill', () => {
	const shape = geo(withBackgroundColor(geo(), '#224466'))
	assert.deepEqual(shapeBackgroundDisplayValues(shape, '#eeeeee', 'light'), {
		fillColor: '#224466', patternFillFallbackColor: getCustomFill('#224466', 'solid', '#eeeeee', 'light'),
	})
	const transparent = { ...shape, props: { ...shape.props, fill: 'none' as const } }
	assert.equal(shapeBackgroundDisplayValues(transparent, '#eeeeee', 'light').fillColor, 'transparent')
	for (const fill of ['solid', 'pattern', 'lined-fill'] as const) {
		const variant = { ...shape, props: { ...shape.props, fill } }
		assert.equal(shapeBackgroundDisplayValues(variant, '#eeeeee', 'light').fillColor, getCustomFill('#224466', fill, '#eeeeee', 'light'))
	}
	assert.notEqual(shapeBackgroundDisplayValues({ ...shape, props: { ...shape.props, fill: 'solid' } }, '#eeeeee', 'light').fillColor, shapeBackgroundDisplayValues(shape, '#eeeeee', 'light').fillColor)
	const oldShape = geo({ freeformColor: { version: 1, hex: '#123456', base: 'black' } })
	assert.equal(shapeBackgroundDisplayValues(oldShape, '#eeeeee', 'light').fillColor, '#123456', 'older boards keep their linked fill')
	const newShape = geo(withCustomColor(geo(), '#123456'))
	assert.deepEqual(shapeBackgroundDisplayValues(newShape, '#eeeeee', 'light'), {}, 'new custom stroke leaves the background native')
})

test('editing stroke on an older linked-color shape preserves its visible fill', () => {
	const legacy = geo({ freeformColor: { version: 1, hex: '#123456', base: 'black' } })
	assert.equal(getDisplayedBackgroundColor(legacy), '#123456')
	const recolored = geo(withCustomColor(legacy, '#654321'))
	assert.equal(getBackgroundColor(recolored), '#123456')
	assert.equal(getDisplayedBackgroundColor(recolored), '#123456')
	assert.equal(shapeBackgroundDisplayValues(recolored, '#eeeeee', 'light').fillColor, '#123456')
	const nativeStroke = geo(withoutCustomColor(legacy))
	assert.equal(getBackgroundColor(nativeStroke), '#123456')
	const tinted = { ...legacy, props: { ...legacy.props, fill: 'solid' as const } }
	const retinted = { ...tinted, meta: withCustomColor(tinted, '#654321') }
	assert.equal(shapeBackgroundDisplayValues(retinted, '#eeeeee', 'light').fillColor, shapeBackgroundDisplayValues(tinted, '#eeeeee', 'light').fillColor)
})
