import { atom, type Atom, type Editor } from 'tldraw'
import { normalizeHexColor, type HexColor } from './colors'

const colors = new WeakMap<Editor, Atom<HexColor | null>>()

function getState(editor: Editor) {
	let state = colors.get(editor)
	if (!state) {
		state = atom<HexColor | null>('freeform custom color default', null)
		colors.set(editor, state)
	}
	return state
}

/** Session-local drawing preference; the created shape's metadata is synced and persistent. */
export function getDefaultCustomColor(editor: Editor) {
	return getState(editor).get()
}

export function setDefaultCustomColor(editor: Editor, value: string | null) {
	const color = value === null ? null : normalizeHexColor(value)
	if (value !== null && color === null) throw new Error('Enter a 3- or 6-digit HEX color.')
	if (!editor.getIsReadonly()) getState(editor).set(color)
}
