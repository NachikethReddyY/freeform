import { useEffect } from 'react'
import { useEditor } from 'tldraw'
import { getDefaultSloppiness, sloppinessForNewShape } from './sloppiness'

export function FreeformStrokeDefaults() {
	const editor = useEditor()
	useEffect(() => editor.sideEffects.registerBeforeCreateHandler('shape', (shape, source) =>
		editor.getIsReadonly() ? shape : sloppinessForNewShape(shape, source, editor.getPath(), getDefaultSloppiness(editor))), [editor])
	return null
}
