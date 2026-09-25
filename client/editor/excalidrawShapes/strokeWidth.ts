import type { TLArrowShape, TLGeoShape, TLLineShape } from 'tldraw'

export type StrokeWidthShape = TLGeoShape | TLArrowShape | TLLineShape
export type StrokeWidthLevel = 's' | 'm' | 'l' | 'xl'

// These are tldraw's native stroke factors. The shape's `size` remains the
// source for text size; this metadata controls only the rendered outline.
const nativeStrokeFactors = { s: 1, m: 1.75, l: 2.5, xl: 5 } as const
const strokeFactors: Record<StrokeWidthLevel, number> = { s: 1, m: 1.75, l: 2.5, xl: 5 }

export function strokeWidthForLevel(level: StrokeWidthLevel, themeStrokeWidth: number) {
	return themeStrokeWidth * strokeFactors[level]
}

export function nativeStrokeWidth(shape: StrokeWidthShape, themeStrokeWidth: number) {
	return themeStrokeWidth * nativeStrokeFactors[shape.props.size]
}

export function getStrokeWidth(shape: StrokeWidthShape): number | null {
	const stored = shape.meta.freeformStrokeWidth
	if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null
	const { version, width } = stored as Record<string, unknown>
	return version === 1 && typeof width === 'number' && Number.isFinite(width) && width > 0 && width <= 40
		? width : null
}

export function resolvedStrokeWidth(shape: StrokeWidthShape, themeStrokeWidth: number) {
	return getStrokeWidth(shape) ?? nativeStrokeWidth(shape, themeStrokeWidth)
}

export function withStrokeWidth<T extends StrokeWidthShape>(shape: T, width: number): T {
	if (!Number.isFinite(width) || width <= 0 || width > 40) throw new RangeError('Invalid stroke width')
	return {
		...shape,
		meta: { ...shape.meta, freeformStrokeWidth: { version: 1, width } },
	} as T
}

export function preserveStrokeWidth<T extends StrokeWidthShape>(shape: T, themeStrokeWidth: number): T {
	return getStrokeWidth(shape) === null
		? withStrokeWidth(shape, nativeStrokeWidth(shape, themeStrokeWidth))
		: shape
}
