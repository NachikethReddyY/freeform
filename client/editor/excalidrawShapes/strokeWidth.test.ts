import assert from 'node:assert/strict'
import test from 'node:test'
import type { Editor, TLArrowShape, TLGeoShape, TLLineShape, TLTheme } from 'tldraw'
import { FreeformArrowShapeUtil } from './FreeformArrowShapeUtil'
import { FreeformGeoShapeUtil, FreeformLineShapeUtil } from './FreeformStrokeShapeUtils'
import { getStrokeWidth, preserveStrokeWidth, withStrokeWidth } from './strokeWidth'

const geo = (size: TLGeoShape['props']['size'], meta: TLGeoShape['meta'] = {}) => ({
	type: 'geo', props: { size, color: 'black', labelColor: 'black', fill: 'none', font: 'draw', align: 'middle', verticalAlign: 'middle' }, meta,
}) as TLGeoShape

test('stroke width is independent of native size used by shape labels', () => {
	const original = geo('s')
	const unchangedWidth = preserveStrokeWidth(original, 2)
	assert.equal(getStrokeWidth(unchangedWidth), 2)
	assert.equal(getStrokeWidth({ ...unchangedWidth, props: { ...unchangedWidth.props, size: 'xl' } }), 2)
	assert.equal(getStrokeWidth(original), null)
})

test('stroke width metadata supports geo, arrow, and line without discarding other metadata', () => {
	for (const type of ['geo', 'arrow', 'line'] as const) {
		const shape = { type, props: { size: 'm' }, meta: { provenance: 'retain' } } as unknown as TLGeoShape | TLArrowShape | TLLineShape
		const updated = withStrokeWidth(shape, 6)
		assert.equal(getStrokeWidth(updated), 6)
		assert.equal(updated.meta.provenance, 'retain')
		assert.equal(getStrokeWidth(shape), null)
	}
})

test('invalid stored stroke widths fall back to the native width', () => {
	for (const width of [0, -1, Number.NaN, Infinity, '6']) {
		const shape = geo('m', { freeformStrokeWidth: { version: 1, width } })
		assert.equal(getStrokeWidth(shape), null)
	}
})

test('native geo text size grows while custom stroke width stays fixed', () => {
	const util = new FreeformGeoShapeUtil({} as Editor)
	const theme = { fontSize: 16, strokeWidth: 2, lineHeight: 1.35, fonts: { draw: { fontFamily: 'draw' } }, colors: { light: { solid: '#fff' } } } as unknown as TLTheme
	const small = withStrokeWidth(geo('s'), 4)
	const large = { ...small, props: { ...small.props, size: 'xl' as const } }
	const defaults = util.options.getDefaultDisplayValues
	const custom = util.options.getCustomDisplayValues
	assert.ok(defaults({} as Editor, large, theme, 'light').labelFontSize > defaults({} as Editor, small, theme, 'light').labelFontSize)
	assert.equal(custom({} as Editor, small, theme, 'light').strokeWidth, 4)
	assert.equal(custom({} as Editor, large, theme, 'light').strokeWidth, 4)
})

test('arrow and line renderers honor the independent stroke width', () => {
	const theme = { colors: { light: { solid: '#fff' } } } as TLTheme
	const editor = {} as Editor
	const arrow = withStrokeWidth({ type: 'arrow', props: { size: 'xl' }, meta: {} } as TLArrowShape, 4)
	const line = withStrokeWidth({ type: 'line', props: { size: 'xl' }, meta: {} } as TLLineShape, 4)
	assert.equal(new FreeformArrowShapeUtil(editor).options.getCustomDisplayValues(editor, arrow, theme, 'light').strokeWidth, 4)
	assert.equal(new FreeformLineShapeUtil(editor).options.getCustomDisplayValues(editor, line, theme, 'light').strokeWidth, 4)
})
