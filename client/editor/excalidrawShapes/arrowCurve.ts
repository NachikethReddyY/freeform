import { PathBuilder, type TLArrowShape, type VecLike } from 'tldraw'

export type CurvePoint = { x: number; y: number }

/** Excalidraw's rounded arrow is a smooth path through its editable points. */
export function curveThroughPoint(start: VecLike, middle: VecLike, end: VecLike) {
	return PathBuilder.cubicSplineThroughPoints([start, middle, end], { endOffsets: 0 })
}

/** Excalidraw's open arrowhead is 25px long with 20° wings, capped by its last segment. */
export function openArrowheadWings(tip: VecLike, nearTip: VecLike, segmentLength: number, scale: number) {
	const length = Math.min(25 * scale, segmentLength * 0.5)
	const backAngle = Math.atan2(nearTip.y - tip.y, nearTip.x - tip.x)
	const spread = 20 * Math.PI / 180
	return [-1, 1].map((side) => ({
		x: tip.x + Math.cos(backAngle + side * spread) * length,
		y: tip.y + Math.sin(backAngle + side * spread) * length,
	})) as [{ x: number; y: number }, { x: number; y: number }]
}

export function curvePointFromMeta(shape: TLArrowShape): CurvePoint | null {
	const value = shape.meta.freeformCurve
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null
	if (value.version !== 1 || typeof value.x !== 'number' || typeof value.y !== 'number') return null
	if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return null
	return { x: value.x, y: value.y }
}

export function withCurvePoint(shape: TLArrowShape, point: CurvePoint): TLArrowShape['meta'] {
	return { ...shape.meta, freeformCurve: { version: 1, x: point.x, y: point.y } }
}
