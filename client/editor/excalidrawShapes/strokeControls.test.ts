import assert from 'node:assert/strict'
import test from 'node:test'
import {
	type Editor,
	type TLGeoShape,
	type TLLineShape,
	type TLTheme,
} from 'tldraw'
import { FreeformGeoShapeUtil } from './FreeformStrokeShapeUtils'
import {
	getDefaultSloppiness,
	getSloppiness,
	setDefaultSloppiness,
	sloppinessForNewShape,
	withSloppiness,
	type Sloppiness,
} from './sloppiness'

function line(meta: TLLineShape['meta'] = {}, dash: 'draw' | 'solid' | 'dashed' | 'dotted' = 'draw') {
	return {
		type: 'line',
		meta,
		props: { dash },
	} as unknown as TLLineShape
}

function rectangle(meta: TLGeoShape['meta'] = {}, dash: 'draw' | 'solid' | 'dashed' | 'dotted' = 'draw') {
	return {
		type: 'geo',
		meta,
		props: { geo: 'rectangle', dash },
	} as unknown as TLGeoShape
}

test('sloppiness default is per editor and starts at Artist', () => {
	const firstEditor = {} as unknown as Editor
	const secondEditor = {} as unknown as Editor

	assert.equal(getDefaultSloppiness(firstEditor), 1)
	setDefaultSloppiness(firstEditor, 2)
	assert.equal(getDefaultSloppiness(firstEditor), 2)
	assert.equal(getDefaultSloppiness(secondEditor), 1)
	assert.deepEqual(
		sloppinessForNewShape(line(), 'user', 'line.pointing', getDefaultSloppiness(firstEditor)).meta.freeformSloppiness,
		{ version: 1, level: 2 }
	)
})

test('user-created lines and rectangles persist the selected sloppiness level in shape metadata', () => {
	for (const level of [0, 1, 2] as const satisfies readonly Sloppiness[]) {
		for (const shape of [line(), rectangle()]) {
			const result = sloppinessForNewShape(shape, 'user', `${shape.type}.pointing`, level)
			assert.deepEqual(result.meta.freeformSloppiness, { version: 1, level })

			// Shape metadata is part of the serializable record and survives a JSON round trip.
			const restored = JSON.parse(JSON.stringify(result)) as TLLineShape | TLGeoShape
			assert.equal(getSloppiness(restored), level)
		}
	}
})

test('new-shape defaults only apply to local drawing, supported geometry, and pointing states', () => {
	const unchanged = line({ provenance: 'preserve' })
	const cases = [
		[unchanged, 'remote', 'line.pointing'],
		[unchanged, 'user', 'select.idle'],
		[rectangle(), 'user', 'geo.idle'],
		[{ type: 'geo', meta: {}, props: { geo: 'ellipse', dash: 'draw' } } as TLGeoShape, 'user', 'geo.pointing'],
	] as const

	for (const [shape, source, state] of cases) {
		assert.equal(sloppinessForNewShape(shape, source, state, 2), shape)
	}

	const alreadyConfigured = line({ freeformSloppiness: { version: 1, level: 0 } })
	assert.equal(sloppinessForNewShape(alreadyConfigured, 'user', 'line.pointing', 2), alreadyConfigured)
})

test('shape sloppiness metadata overrides dash fallback while invalid metadata falls back to dash', () => {
	assert.equal(getSloppiness(line({}, 'draw')), 1)
	assert.equal(getSloppiness(line({}, 'solid')), 0)
	assert.equal(getSloppiness(line({}, 'dashed')), 0)
	assert.equal(getSloppiness(line({ freeformSloppiness: { version: 1, level: 2 } }, 'solid')), 2)
	assert.equal(getSloppiness(line({ freeformSloppiness: { version: 2, level: 2 } }, 'draw')), 1)
	assert.equal(getSloppiness(line({ freeformSloppiness: { version: 1, level: 3 } }, 'solid')), 0)
})

test('changing native geo size changes both the displayed stroke width and label font size', () => {
	const editor = {} as unknown as Editor
	const util = new FreeformGeoShapeUtil(editor)
	const theme = {
		id: 'default',
		fontSize: 16,
		lineHeight: 1.35,
		strokeWidth: 2,
		fonts: {},
		colors: { light: {}, dark: {} },
	} as unknown as TLTheme
	const makeShape = (size: TLGeoShape['props']['size']) => ({
		type: 'geo',
		meta: {},
		props: {
			geo: 'rectangle', dash: 'draw', url: '', w: 100, h: 60, growY: 0,
			scale: 1, flipX: false, flipY: false, color: 'black', labelColor: 'black',
			fill: 'none', size, font: 'sans', align: 'middle', verticalAlign: 'middle',
			richText: { type: 'doc', content: [] },
		},
	}) as unknown as TLGeoShape
	const getValues = util.options.getDefaultDisplayValues
	const small = getValues(editor, makeShape('s'), theme, 'light')
	const large = getValues(editor, makeShape('xl'), theme, 'light')

	assert.ok(large.strokeWidth > small.strokeWidth)
	assert.ok(large.labelFontSize > small.labelFontSize)
	assert.equal(small.strokeWidth, 2)
	assert.equal(large.strokeWidth, 10)
	assert.equal(small.labelFontSize, 18)
	assert.equal(large.labelFontSize, 32)
})

test('withSloppiness preserves unrelated custom color metadata', () => {
	const shape = line({ freeformColor: { version: 1, hex: '#123456', base: 'black' }, provenance: 'keep' })
	const meta = withSloppiness(shape, 2)

	assert.deepEqual(meta.freeformColor, shape.meta.freeformColor)
	assert.equal(meta.provenance, 'keep')
	assert.deepEqual(meta.freeformSloppiness, { version: 1, level: 2 })
})
