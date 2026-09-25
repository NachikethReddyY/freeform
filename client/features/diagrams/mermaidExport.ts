import { DIAGRAM_LIMITS } from '../../../shared/diagram'
import { renderPlaintextFromRichText, type Editor, type TLShape, type TLShapeId } from 'tldraw'

export type MermaidFlowDirection = 'LR' | 'RL' | 'TD' | 'TB' | 'BT'

export interface MermaidExportResult {
	source: string
	included: { nodes: number; arrows: number }
	omitted: { shapes: number; arrows: number; approximatedShapes: number; normalizedLabels: number }
}

function exportableNode(shape: TLShape): shape is Extract<TLShape, { type: 'geo' | 'note' }> {
	return (shape.type === 'geo' || shape.type === 'note') && shape.opacity > 0
}

function safeLabel(raw: string, edge = false): { value: string; changed: boolean } {
	const value = raw.trim().replace(/\s+/g, ' ').replaceAll('-->', '→')
		.replaceAll('"', '”').replaceAll('<', '‹').replaceAll('>', '›')
		.replaceAll('`', '′').replaceAll('\\', '/')
		.replaceAll('|', edge ? '/' : '¦')
	return { value, changed: value !== raw }
}

/** Export a bounded selection as a plain flowchart; the native board file remains the lossless format. */
export function exportSelectedDiagramAsMermaid(editor: Editor, direction: MermaidFlowDirection = 'LR'): MermaidExportResult {
	const selection = editor.getSelectedShapes()
	const nodes = selection.filter(exportableNode).sort((a, b) => {
		const first = editor.getShapePageBounds(a)!, second = editor.getShapePageBounds(b)!
		return first.y - second.y || first.x - second.x || a.id.localeCompare(b.id)
	})
	if (!nodes.length) throw new Error('Select at least one visible rectangle, shape, or note to export.')
	if (nodes.length > DIAGRAM_LIMITS.nodes) throw new Error(`Select at most ${DIAGRAM_LIMITS.nodes} nodes for Mermaid export.`)
	const omitted = { shapes: selection.length - nodes.length - selection.filter((shape) => shape.type === 'arrow').length,
		arrows: 0, approximatedShapes: 0, normalizedLabels: 0 }
	const ids = new Map<TLShapeId, string>()
	const lines = [`flowchart ${direction}`]
	for (const [index, shape] of nodes.entries()) {
		const id = `N${index + 1}`
		ids.set(shape.id, id)
		const plain = renderPlaintextFromRichText(editor, shape.props.richText)
		const label = safeLabel(plain || `Node ${index + 1}`)
		if (label.changed || !plain) omitted.normalizedLabels++
		const kind = shape.type === 'geo' ? shape.props.geo : 'note'
		if (!['rectangle', 'diamond', 'ellipse'].includes(kind)) omitted.approximatedShapes++
		lines.push(kind === 'diamond' ? `${id}{"${label.value}"}`
			: kind === 'ellipse' ? `${id}(("${label.value}"))` : `${id}["${label.value}"]`)
	}
	const arrows = new Map<TLShapeId, Extract<TLShape, { type: 'arrow' }>>()
	for (const shape of selection) if (shape.type === 'arrow') arrows.set(shape.id, shape)
	for (const shape of nodes) for (const binding of editor.getBindingsToShape(shape.id, 'arrow')) {
		const arrow = editor.getShape(binding.fromId)
		if (arrow?.type === 'arrow') arrows.set(arrow.id, arrow)
	}
	let includedArrows = 0
	for (const arrow of [...arrows.values()].sort((a, b) => a.index.localeCompare(b.index))) {
		const bindings = editor.getBindingsFromShape(arrow.id, 'arrow')
		const from = bindings.find(({ props }) => props.terminal === 'start')?.toId
		const to = bindings.find(({ props }) => props.terminal === 'end')?.toId
		if (!from || !to || from === to || !ids.has(from) || !ids.has(to)) { omitted.arrows++; continue }
		if (includedArrows >= DIAGRAM_LIMITS.edges) throw new Error(`Select at most ${DIAGRAM_LIMITS.edges} bound arrows for Mermaid export.`)
		const label = safeLabel(renderPlaintextFromRichText(editor, arrow.props.richText), true)
		if (label.changed) omitted.normalizedLabels++
		lines.push(`${ids.get(from)} -->${label.value ? `|${label.value}| ` : ' '}${ids.get(to)}`)
		includedArrows++
	}
	const source = lines.join('\n')
	if (source.length > 20_000) throw new Error('The Mermaid export exceeds 20,000 characters; select a smaller diagram.')
	return { source, included: { nodes: nodes.length, arrows: includedArrows }, omitted }
}
