import { atom, type Atom, type Editor } from 'tldraw'
import type { HexColor } from './colors'

const backgrounds = new WeakMap<Editor, Atom<HexColor | null>>()

function getState(editor: Editor) {
	let state = backgrounds.get(editor)
	if (!state) {
		state = atom<HexColor | null>('freeform background default', null)
		backgrounds.set(editor, state)
	}
	return state
}

export function getDefaultBackgroundColor(editor: Editor) {
	return getState(editor).get()
}

export function setDefaultBackgroundColor(editor: Editor, color: HexColor | null) {
	if (!editor.getIsReadonly()) getState(editor).set(color)
}
