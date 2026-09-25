import { createShapeId, startEditingShapeWithRichText, toRichText, type Editor, type TLGeoShape, type TLShapeId } from 'tldraw'
import { nonOverlappingOffset } from './native'

export const TECHNICAL_NODES = [
	{ kind: 'api', title: 'API', geo: 'rectangle', label: 'API\nGET /resource' },
	{ kind: 'database', title: 'Database', geo: 'hexagon', label: 'Database\nusers · id' },
	{ kind: 'service', title: 'Service', geo: 'rectangle', label: 'Service\nlocalhost:4000' },
	{ kind: 'queue', title: 'Queue', geo: 'rectangle', label: 'Queue\njobs' },
	{ kind: 'function', title: 'Function', geo: 'rectangle', label: 'Function\nhandle()' },
	{ kind: 'cloud', title: 'Cloud', geo: 'cloud', label: 'Cloud\nprovider' },
] as const satisfies readonly { kind: string; title: string; geo: TLGeoShape['props']['geo']; label: string }[]

export type TechnicalNodeKind = typeof TECHNICAL_NODES[number]['kind']

interface Bounds { x: number; y: number; w: number; h: number }

function freePosition(editor: Editor, initial: Bounds, occupied: readonly Bounds[]): { x: number; y: number } {
	const viewport = editor.getViewportPageBounds()
	const candidates = Array.from({ length: 81 }, (_, index) => {
		const column = index % 9 - 4, row = Math.floor(index / 9) - 4
		return { column, row, score: column * column + row * row }
	}).sort((a, b) => a.score - b.score || a.row - b.row || a.column - b.column)
	for (const { column, row } of candidates) {
		const candidate = { ...initial, x: initial.x + column * (initial.w + 40), y: initial.y + row * (initial.h + 40) }
		if (candidate.x < viewport.x + 24 || candidate.y < viewport.y + 24
			|| candidate.x + candidate.w > viewport.maxX - 24 || candidate.y + candidate.h > viewport.maxY - 24) continue
		const offset = nonOverlappingOffset(candidate, occupied, 40)
		if (!offset.x && !offset.y) return { x: candidate.x, y: candidate.y }
	}
	const offset = nonOverlappingOffset(initial, occupied, 40)
	return { x: initial.x + offset.x, y: initial.y + offset.y }
}

/** Create an editable native geo, so built-in connectors, styling, resize, save and undo work. */
export function createStandaloneNode(editor: Editor, kind?: TechnicalNodeKind): { nodeId: TLShapeId } | null {
	if (editor.getIsReadonly() || editor.getCurrentPageShapeIds().size >= editor.options.maxShapesPerPage) return null
	const id = createShapeId()
	if (!editor.canCreateShapes([id])) return null
	const definition = kind ? TECHNICAL_NODES.find((item) => item.kind === kind) : undefined
	const size = { w: definition ? 200 : 180, h: definition ? 112 : 100 }
	const center = editor.getViewportPageBounds().center
	const initial = { x: center.x - size.w / 2, y: center.y - size.h / 2, ...size }
	const occupied = editor.getCurrentPageShapes().filter((shape) => shape.type !== 'arrow' && shape.type !== 'frame')
		.flatMap((shape) => { const box = editor.getShapePageBounds(shape); return box ? [{ x: box.x, y: box.y, w: box.w, h: box.h }] : [] })
	const position = freePosition(editor, initial, occupied)
	const mark = editor.markHistoryStoppingPoint('Create diagram node')
	try {
		editor.run(() => {
			editor.createShape({ id, type: 'geo', parentId: editor.getCurrentPageId(),
				x: position.x, y: position.y,
				meta: definition ? { freeformTechnicalNode: { kind: definition.kind, version: 1 } } : {},
				props: { geo: definition?.geo ?? 'rectangle', w: size.w, h: size.h,
					richText: toRichText(definition?.label ?? ''), color: 'black', fill: 'none', font: 'draw' },
			})
			editor.select(id)
		})
		if (!editor.getShape(id)) throw new Error('Could not create the diagram node.')
		startEditingShapeWithRichText(editor, id)
		return { nodeId: id }
	} catch (cause) {
		editor.bailToMark(mark)
		throw cause
	}
}
