import {
	Editor,
	createTLStore,
	defaultBindingUtils,
	defaultShapeTools,
	defaultShapeUtils,
	defaultTools,
	getTipTapDefaultExtensions,
	serializeTldrawJson,
} from 'tldraw'
import { freeformColorShapeUtils } from '../../../editor/excalidrawShapes/shapeUtils'
import { parseExcalidrawBoard, type InterchangeReport } from './interchange'

const replacementTypes = new Set<string>(freeformColorShapeUtils.map((util) => util.type))
const shapeUtils = [
	...defaultShapeUtils.filter((util) => !replacementTypes.has(util.type)),
	...freeformColorShapeUtils,
]

/** Convert into a validated native document in an isolated editor. No synced editor is accepted or touched. */
export async function convertExcalidrawToNativeJson(sourceJson: string): Promise<{ json: string; report: InterchangeReport }> {
	const container = document.createElement('div')
	container.style.position = 'fixed'
	container.style.left = '-10000px'
	container.style.width = '1000px'
	container.style.height = '1000px'
	document.body.appendChild(container)
	let editor: Editor | undefined
	try {
		editor = new Editor({
			shapeUtils,
			bindingUtils: defaultBindingUtils,
			tools: [...defaultTools, ...defaultShapeTools],
			store: createTLStore({ shapeUtils, bindingUtils: defaultBindingUtils }),
			getContainer: () => container,
			initialState: 'select',
			textOptions: { tipTapConfig: { extensions: getTipTapDefaultExtensions() } },
		})
		const converted = parseExcalidrawBoard(sourceJson, editor.getCurrentPageId())
		editor.createShapes(converted.shapes)
		editor.createBindings(converted.bindings)
		if (converted.shapes.some((shape) => !editor!.getShape(shape.id)) || converted.bindings.some((binding) => !editor!.getBinding(binding.id!))) {
			throw new Error('The complete Excalidraw conversion could not fit in a new board.')
		}
		return { json: await serializeTldrawJson(editor), report: converted.report }
	} finally {
		editor?.dispose()
		container.remove()
	}
}
