import type { TLShape } from 'tldraw'
import { supportsCustomColor, withCustomColor, type HexColor } from './colors'

/** Only native drawing-tool creation states inherit defaults; paste/duplicate/remote records retain their colors. */
export function colorNewToolShape(shape: TLShape, source: 'user' | 'remote', state: string, color: HexColor | null): TLShape {
	if (!color || source !== 'user' || !supportsCustomColor(shape) || Object.hasOwn(shape.meta, 'freeformColor')) return shape
	const creationState = `${shape.type}.${shape.type === 'draw' ? 'drawing' : 'pointing'}`
	if (state !== creationState) return shape
	return { ...shape, meta: withCustomColor(shape, color) }
}
