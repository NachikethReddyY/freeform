import { useEffect } from 'react'
import { useEditor } from 'tldraw'
import { backgroundForNewShape } from './backgroundColor'
import { getDefaultBackgroundColor } from './backgroundState'
import { colorNewToolShape } from './defaultColorPolicy'
import { getDefaultCustomColor } from './defaultColorState'

/** Mount once inside Tldraw. Metadata is added atomically before new manual shapes enter the store. */
export function CustomColorDefaults() {
	const editor = useEditor()
	useEffect(() => editor.sideEffects.registerBeforeCreateHandler('shape', (shape, source) => {
		if (editor.getIsReadonly()) return shape
		const colored = colorNewToolShape(shape, source, editor.getPath(), getDefaultCustomColor(editor))
		return backgroundForNewShape(colored, source, editor.getPath(), getDefaultBackgroundColor(editor))
	}), [editor])
	return null
}
