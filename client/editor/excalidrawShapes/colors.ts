import type { TLDefaultFillStyle, TLShape } from 'tldraw'

export type HexColor = `#${string}`
export type CustomColorShape = Extract<TLShape, { type: 'geo' | 'arrow' | 'text' | 'draw' | 'line' }>

export function normalizeHexColor(value: unknown): HexColor | null {
	if (typeof value !== 'string') return null
	const digits = value.trim().replace(/^#/, '')
	if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(digits)) return null
	return `#${(digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits).toLowerCase()}`
}

export function supportsCustomColor(shape: TLShape): shape is CustomColorShape {
	return shape.type === 'geo' || shape.type === 'arrow' || shape.type === 'text' || shape.type === 'draw' || shape.type === 'line'
}

/** Keep the native color token valid; the HEX override travels atomically in the same shape record. */
export function withCustomColor(shape: CustomColorShape, hex: HexColor): TLShape['meta'] {
	return {
		...shape.meta,
		freeformColor: { version: 1, hex, base: shape.props.color },
		// Preserve the old visible fill before splitting stroke and background on a legacy shape.
		...(shape.type === 'geo' && !Object.hasOwn(shape.meta, 'freeformBackgroundColor')
			? { freeformBackgroundColor: getCustomColor(shape) ? { version: 1, hex: getCustomColor(shape), mode: 'legacy' } : null }
			: {}),
	}
}

export function withoutCustomColor(shape: TLShape): TLShape['meta'] {
	// Explicit null also clears the field when tldraw merges partial metadata updates.
	return {
		...shape.meta,
		freeformColor: null,
		...(shape.type === 'geo' && !Object.hasOwn(shape.meta, 'freeformBackgroundColor')
			? { freeformBackgroundColor: getCustomColor(shape) ? { version: 1, hex: getCustomColor(shape), mode: 'legacy' } : null }
			: {}),
	}
}

export function getCustomColor(shape: TLShape): HexColor | null {
	if (!supportsCustomColor(shape)) return null
	const value = shape.meta.freeformColor
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null
	if (value.version !== 1 || value.base !== shape.props.color) return null
	return normalizeHexColor(value.hex)
}

function mixHex(hex: HexColor, target: number, amount: number): HexColor {
	return `#${[1, 3, 5].map((offset) => {
		const channel = parseInt(hex.slice(offset, offset + 2), 16)
		return Math.round(channel + (target - channel) * amount).toString(16).padStart(2, '0')
	}).join('')}`
}

export function getCustomFill(hex: HexColor, fill: TLDefaultFillStyle, canvasSolid: string, mode: 'light' | 'dark'): string {
	switch (fill) {
		case 'none': return 'transparent'
		case 'semi': return canvasSolid
		case 'fill': return hex
		case 'solid': return mixHex(hex, mode === 'light' ? 255 : 0, mode === 'light' ? 0.8 : 0.7)
		case 'pattern':
		case 'lined-fill': return mixHex(hex, mode === 'light' ? 255 : 0, 0.25)
	}
}
