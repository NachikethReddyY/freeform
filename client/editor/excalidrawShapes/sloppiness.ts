import type { Editor, TLGeoShape, TLLineShape, TLShape } from 'tldraw'

export type Sloppiness = 0 | 1 | 2
type StrokeShape = TLGeoShape | TLLineShape
const defaults = new WeakMap<Editor, Sloppiness>()

export function getDefaultSloppiness(editor: Editor): Sloppiness { return defaults.get(editor) ?? 1 }
export function setDefaultSloppiness(editor: Editor, level: Sloppiness) { defaults.set(editor, level) }

export function sloppinessForNewShape(shape: TLShape, source: 'user' | 'remote', state: string, level: Sloppiness): TLShape {
	if (source !== 'user' || (shape.type !== 'line' && !(shape.type === 'geo' && shape.props.geo === 'rectangle'))
		|| state !== `${shape.type}.pointing` || Object.hasOwn(shape.meta, 'freeformSloppiness')) return shape
	return { ...shape, meta: withSloppiness(shape, level) }
}

export function getSloppiness(shape: StrokeShape): Sloppiness {
	const value = shape.meta.freeformSloppiness
	if (value && typeof value === 'object' && !Array.isArray(value) && value.version === 1
		&& (value.level === 0 || value.level === 1 || value.level === 2)) return value.level
	return shape.props.dash === 'draw' ? 1 : 0
}

export function withSloppiness(shape: StrokeShape, level: Sloppiness): StrokeShape['meta'] {
	return { ...shape.meta, freeformSloppiness: { version: 1, level } }
}
