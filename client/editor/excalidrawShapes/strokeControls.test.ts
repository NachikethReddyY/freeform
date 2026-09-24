import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
	type Editor,
	type TLGeoShape,
	type TLLineShape,
	type TLTheme,
} from 'tldraw'
import { FreeformGeoShapeUtil, roughLine, roughRectangle } from './FreeformStrokeShapeUtils'
import { ROUNDED_RECTANGLE, roundedRectangleDefinition } from './roundedRectangle'
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

test('Cartoonist rounded rectangle keeps dashed and dotted strokes on a rough outline', () => {
	const shape = {
		id: 'shape:rough-rectangle', meta: { freeformSloppiness: { version: 1, level: 2 } },
		props: { geo: ROUNDED_RECTANGLE, w: 220, h: 100, growY: 0, scale: 1, fill: 'none' },
	} as unknown as TLGeoShape
	const smoothPath = roundedRectangleDefinition.getPath(220, 100, shape, 3).toD()
	for (const dash of ['dashed', 'dotted'] as const) {
		const styledShape = { ...shape, props: { ...shape.props, dash } }
		const first = renderToStaticMarkup(roughRectangle(styledShape, '#ff0000', 3))
		const second = renderToStaticMarkup(roughRectangle(styledShape, '#ff0000', 3))
		assert.equal(first, second, 'roughness stays stable across renders')
		assert.match(first, /stroke-dasharray="[^"]+"/)
		assert.match(first, /stroke="#ff0000"/)
		assert.ok(!first.includes(`d="${smoothPath}"`), 'Cartoonist uses a different path from the native rounded edge')
		const exportMarkup = renderToStaticMarkup(roughRectangle(styledShape, '#ff0000', 3, true))
		assert.match(exportMarkup, /stroke-dasharray="[^"]+"/)
		assert.ok(!exportMarkup.includes(`d="${smoothPath}"`), 'SVG export keeps the rough outline')
	}
})

test('Cartoonist sharp rectangle keeps angular corners with every stroke style', () => {
	const shape = {
		id: 'shape:sharp-rectangle', meta: { freeformSloppiness: { version: 1, level: 2 } },
		props: { geo: 'rectangle', w: 220, h: 100, growY: 0, scale: 1, fill: 'none' },
	} as unknown as TLGeoShape
	for (const dash of ['solid', 'dashed', 'dotted'] as const) {
		const styled = { ...shape, props: { ...shape.props, dash } }
		const markup = renderToStaticMarkup(roughRectangle(styled, '#00ff00', 3))
		const d = markup.match(/\sd="([^"]+)"/)?.[1]
		assert.ok(d, 'a rough outline is drawn')
		assert.doesNotMatch(d, /C /, 'sharp corners should not be converted into curves')
	}
})

test('Cartoonist line keeps dashed and dotted patterns at canvas and export scale', () => {
	const shape = {
		id: 'shape:rough-line', meta: { freeformSloppiness: { version: 1, level: 2 } },
		props: { dash: 'dashed', scale: 2, spline: 'line', points: {
			a1: { id: 'a1', index: 'a1', x: 0, y: 0 },
			a2: { id: 'a2', index: 'a2', x: 80, y: 0 },
			a3: { id: 'a3', index: 'a3', x: 80, y: 40 },
		} },
	} as unknown as TLLineShape
	const outputs: string[] = []
	for (const dash of ['dashed', 'dotted'] as const) {
		const styled = { ...shape, props: { ...shape.props, dash } }
		const canvas = renderToStaticMarkup(roughLine(styled, '#ff0000', 3))
		const second = renderToStaticMarkup(roughLine(styled, '#ff0000', 3))
		const exported = renderToStaticMarkup(roughLine(styled, '#ff0000', 3, true))
		assert.equal(canvas, second, 'roughness stays stable across renders')
		assert.match(canvas, /stroke-dasharray="[^"]+"/)
		assert.match(exported, /stroke-dasharray="[^"]+"/)
		assert.match(exported, /transform="scale\(0\.5\)"/)
		assert.match(canvas, /stroke="#ff0000"/)
		outputs.push(canvas)
	}
	assert.notEqual(outputs[0], outputs[1], 'dashed and dotted remain distinct')
})

test('Cartoonist adds a deterministic interior bend to a long two-point line', () => {
	const shape = {
		id: 'shape:long-line', meta: { freeformSloppiness: { version: 1, level: 2 } },
		props: { dash: 'dashed', scale: 1, spline: 'line', points: {
			a1: { id: 'a1', index: 'a1', x: 0, y: 0 },
			a2: { id: 'a2', index: 'a2', x: 520, y: 0 },
		} },
	} as unknown as TLLineShape
	for (const dash of ['dashed', 'dotted'] as const) {
		const styled = { ...shape, props: { ...shape.props, dash } }
		const markup = renderToStaticMarkup(roughLine(styled, '#ffffff', 3))
		const path = markup.match(/\sd="([^"]+)"/)?.[1]
		assert.ok(path)
		assert.equal(markup, renderToStaticMarkup(roughLine(styled, '#ffffff', 3)))
		assert.match(path, /^M 0 0 /, 'line start remains anchored')
		assert.match(path, /L 520 0$/, 'line end remains anchored')
		const bends = [...path.matchAll(/Q [\d.-]+ (-?[\d.]+)/g)].map((match) => Number(match[1]))
		assert.equal(bends.length, 4, 'four small bends make the roughness visible at 100%')
		assert.ok(bends.some((bend) => Math.abs(bend) >= 2), 'interior deviation is perceptible')
		assert.ok(bends.every((bend) => Math.abs(bend) <= 2.25), 'visible centerline stays within native hit tolerance')
		assert.match(markup, /stroke-dasharray="[^"]+"/)
		const exported = renderToStaticMarkup(roughLine(styled, '#ffffff', 3, true))
		assert.equal(exported.match(/\sd="([^"]+)"/)?.[1], path, 'export and canvas geometry agree at scale 1')
		assert.match(exported, /stroke-dasharray="[^"]+"/)
	}
})
