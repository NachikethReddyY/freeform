import { useEffect } from 'react'
import { useEditor } from 'tldraw'
import { colorNewToolShape } from './defaultColorPolicy'
import { getDefaultCustomColor } from './defaultColorState'

/** Mount once inside Tldraw. Metadata is added atomically before new manual shapes enter the store. */
export function CustomColorDefaults() {
	const editor = useEditor()
	useEffect(() => editor.sideEffects.registerBeforeCreateHandler('shape', (shape, source) => {
		if (editor.getIsReadonly()) return shape
		return colorNewToolShape(shape, source, editor.getPath(), getDefaultCustomColor(editor))
	}), [editor])
	return null
}
