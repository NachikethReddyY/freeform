import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTLSchema, defaultShapeSchemas, GeoShapeGeoStyle } from '@tldraw/tlschema'
import { ROUNDED_RECTANGLE, isRectangleGeo, roundedRectangleDefinition } from './roundedRectangle'

test('rounded rectangles use an actual curved native geo path', () => {
	const shape = { props: { fill: 'none' } } as Parameters<typeof roundedRectangleDefinition.getPath>[2]
	const path = roundedRectangleDefinition.getPath(100, 60, shape, 2).toD()
	assert.match(path, /C /)
	assert.equal((path.match(/C /g) ?? []).length, 4)
	assert.equal(isRectangleGeo(ROUNDED_RECTANGLE), true)
	assert.equal(isRectangleGeo('rectangle'), true)
	assert.equal(isRectangleGeo('ellipse'), false)
})

test('sync schema accepts a rounded geo value', () => {
	GeoShapeGeoStyle.addValues(ROUNDED_RECTANGLE as Parameters<typeof GeoShapeGeoStyle.addValues>[0])
	const schema = createTLSchema({ shapes: { ...defaultShapeSchemas } })
	assert.equal(GeoShapeGeoStyle.validate(ROUNDED_RECTANGLE), ROUNDED_RECTANGLE)
	const shape = {
		id: 'shape:rounded-test', typeName: 'shape', type: 'geo', parentId: 'page:test',
		x: 0, y: 0, rotation: 0, index: 'a1', opacity: 1, isLocked: false, meta: {},
		props: {
			geo: ROUNDED_RECTANGLE, w: 120, h: 80, color: 'black', labelColor: 'black',
			fill: 'none', dash: 'solid', size: 'm', font: 'draw', align: 'middle', verticalAlign: 'middle',
			growY: 0, scale: 1, flipX: false, flipY: false, url: '', richText: { type: 'doc', content: [] },
		},
	}
	const validated = schema.types.shape.validate(shape)
	assert.equal(validated.typeName, 'shape')
	if (validated.typeName !== 'shape') throw new Error('Expected a shape record')
	assert.equal(validated.type, 'geo')
	if (validated.type !== 'geo') throw new Error('Expected a geo shape')
	assert.equal(validated.props.geo, ROUNDED_RECTANGLE)
})
