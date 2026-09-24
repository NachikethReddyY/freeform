import type { TLDefaultFillStyle, TLGeoShape, TLShape } from 'tldraw'
import { getCustomColor, normalizeHexColor, type HexColor } from './colors'

/** Background color is independent of the native stroke token and custom stroke override. */
export function withBackgroundColor(shape: TLGeoShape, hex: HexColor): TLShape['meta'] {
	return { ...shape.meta, freeformBackgroundColor: { version: 1, hex } }
}

export function withoutBackgroundColor(shape: TLGeoShape): TLShape['meta'] {
	return { ...shape.meta, freeformBackgroundColor: null }
}

export function getBackgroundColor(shape: TLShape): HexColor | null {
	if (shape.type !== 'geo') return null
	const value = shape.meta.freeformBackgroundColor
	if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) return null
	return normalizeHexColor(value.hex)
}

/** Older shapes used the custom stroke color for their fill. Match their visible state in the picker. */
export function getDisplayedBackgroundColor(shape: TLShape): HexColor | null {
	if (shape.type !== 'geo') return null
	return getBackgroundColor(shape) ?? (!Object.hasOwn(shape.meta, 'freeformBackgroundColor') ? getCustomColor(shape) : null)
}

/** An explicit background choice reveals empty fills without changing a chosen fill treatment. */
export function nextFillForBackground(fill: TLDefaultFillStyle): TLDefaultFillStyle {
	return fill === 'none' || fill === 'semi' ? 'fill' : fill
}

/** Add the drawing preference only to shapes created by the geometry tool. */
export function backgroundForNewShape(shape: TLShape, source: 'user' | 'remote', state: string, color: HexColor | null): TLShape {
	if (shape.type !== 'geo' || source !== 'user' || state !== 'geo.pointing' || !color || Object.hasOwn(shape.meta, 'freeformBackgroundColor')) return shape
	return { ...shape, meta: withBackgroundColor(shape, color) }
}
