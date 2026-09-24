import assert from 'node:assert/strict'
import test from 'node:test'
import type { TLArrowShape } from 'tldraw'
import { curvePointFromMeta, curveThroughPoint, openArrowheadWings, withCurvePoint } from './arrowCurve'

const arrow = {
	type: 'arrow',
	meta: { freeformColor: { version: 1, hex: '#ffffff', base: 'black' } },
} as unknown as TLArrowShape

test('a dragged control point is stored alongside other arrow metadata', () => {
	const meta = withCurvePoint(arrow, { x: 24, y: 130 })
	assert.deepEqual(meta.freeformColor, arrow.meta.freeformColor)
	assert.deepEqual(curvePointFromMeta({ ...arrow, meta }), { x: 24, y: 130 })
	assert.equal(curvePointFromMeta({ ...arrow, meta: { freeformCurve: { version: 1, x: Infinity, y: 0 } } }), null)
})

test('control point makes a noncircular curve through the requested location', () => {
	const curve = curveThroughPoint({ x: 0, y: 0 }, { x: 24, y: 130 }, { x: 400, y: 80 })
	const segments = curve.toGeometry().getVertices({})
	assert.ok(segments.some((point) => Math.hypot(point.x - 24, point.y - 130) < 1))
	assert.match(curve.toD(), /^M 0 0 C /)
})

test('open arrowhead uses Excalidraw length and narrow wing angle', () => {
	const [left, right] = openArrowheadWings({ x: 100, y: 0 }, { x: 90, y: 0 }, 100, 1)
	assert.ok(Math.abs(Math.hypot(left.x - 100, left.y) - 25) < 0.001)
	assert.ok(Math.abs(Math.atan2(Math.abs(left.y), 100 - left.x) * 180 / Math.PI - 20) < 0.001)
	assert.ok(Math.abs(left.y + right.y) < 0.001)
	const [shortWing] = openArrowheadWings({ x: 12, y: 0 }, { x: 2, y: 0 }, 12, 1)
	assert.ok(Math.abs(Math.hypot(shortWing.x - 12, shortWing.y) - 6) < 0.001)
})
