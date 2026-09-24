import { DefaultColorStyle, type Editor, type TLDefaultColorStyle, type TLShape, type TLShapeId } from 'tldraw'
import { getCustomColor, normalizeHexColor, supportsCustomColor, withCustomColor, withoutCustomColor, type CustomColorShape } from './colors'
import { setDefaultCustomColor } from './defaultColorState'

/** Match native style selection semantics: groups recurse, frames do not. */
export function getSelectedColorShapes(editor: Editor): CustomColorShape[] {
	const shapes: CustomColorShape[] = []
	const visited = new Set<TLShapeId>()
	const visit = (shape: TLShape) => {
		if (visited.has(shape.id) || editor.isShapeOrAncestorLocked(shape)) return
		visited.add(shape.id)
		if (shape.type === 'group') {
			for (const id of editor.getSortedChildIdsForParent(shape.id)) {
				const child = editor.getShape(id)
				if (child) visit(child)
			}
		} else if (supportsCustomColor(shape)) shapes.push(shape)
	}
	for (const shape of editor.getSelectedShapes()) visit(shape)
	return shapes
}

/** Updates selected shapes and the default for later manual drawings; returns the selected-shape count. */
export function applyCustomColor(editor: Editor, value: string): number {
	const hex = normalizeHexColor(value)
	if (!hex) throw new Error('Enter a 3- or 6-digit HEX color.')
	if (editor.getIsReadonly()) return 0
	setDefaultCustomColor(editor, hex)
	const targets = getSelectedColorShapes(editor).filter((shape) => getCustomColor(shape) !== hex)
	if (!targets.length) return 0
	editor.markHistoryStoppingPoint('custom color')
	editor.updateShapes(targets.map((shape) => ({ id: shape.id, type: shape.type, meta: withCustomColor(shape, hex) })))
	return targets.length
}

export function clearCustomColor(editor: Editor): number {
	if (editor.getIsReadonly()) return 0
	const targets = getSelectedColorShapes(editor).filter((shape) => shape.meta.freeformColor != null)
	editor.updateShapes(targets.map((shape) => ({ id: shape.id, type: shape.type, meta: withoutCustomColor(shape) })))
	return targets.length
}

/** Clears an override even when the chosen native token already matches the underlying color. */
export function applyNativeColor(editor: Editor, color: TLDefaultColorStyle, options: { markHistory?: boolean; setNext?: boolean } = {}): void {
	DefaultColorStyle.validate(color)
	if (editor.getIsReadonly()) return
	if (options.markHistory !== false) editor.markHistoryStoppingPoint('native color')
	editor.run(() => {
		clearCustomColor(editor)
		editor.setStyleForSelectedShapes(DefaultColorStyle, color)
		if (options.setNext !== false) {
			setDefaultCustomColor(editor, null)
			editor.setStyleForNextShapes(DefaultColorStyle, color)
		}
	})
}
