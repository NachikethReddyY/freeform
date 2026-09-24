import { createBindingId, createShapeId, toRichText, type TLBindingCreate, type TLPageId, type TLShapePartial } from '@tldraw/tlschema'
import type { Editor } from 'tldraw'
import { DiagramSchema, diagramShapeKey, type Diagram, type DiagramNode } from '../../../shared/diagram'

// Native sticky notes are square and grow only when their text needs more room.
export function nativeNodeBounds(node: DiagramNode): DiagramNode {
	return node.kind === 'note' ? { ...node, h: node.w } : node
}

export function diagramBounds(diagram: Diagram) {
	const nodes = diagram.nodes.map(nativeNodeBounds)
	const minX = Math.min(...nodes.map((node) => node.x))
	const minY = Math.min(...nodes.map((node) => node.y))
	return { x: minX, y: minY, w: Math.max(...nodes.map((node) => node.x + node.w)) - minX, h: Math.max(...nodes.map((node) => node.y + node.h)) - minY }
}

interface Bounds { x: number; y: number; w: number; h: number }

function commonBounds(bounds: readonly Bounds[]): Bounds | undefined {
	if (!bounds.length) return undefined
	const x = Math.min(...bounds.map((bound) => bound.x)), y = Math.min(...bounds.map((bound) => bound.y))
	return { x, y, w: Math.max(...bounds.map((bound) => bound.x + bound.w)) - x, h: Math.max(...bounds.map((bound) => bound.y + bound.h)) - y }
}

export function nonOverlappingOffset(diagram: Bounds, occupied: readonly Bounds[], gap = 80) {
	const overlaps = occupied.some((shape) => diagram.x < shape.x + shape.w + gap && diagram.x + diagram.w + gap > shape.x && diagram.y < shape.y + shape.h + gap && diagram.y + diagram.h + gap > shape.y)
	if (!overlaps) return { x: 0, y: 0 }
	return { x: Math.max(...occupied.map((shape) => shape.x + shape.w)) + gap - diagram.x, y: 0 }
}

export function createNativeDiagram(input: Diagram, proposalId: string, pageId: TLPageId, offset = { x: 0, y: 0 }) {
	const diagram = DiagramSchema.parse(input)
	diagram.nodes = diagram.nodes.map(nativeNodeBounds)
	const nodeIds = new Map(diagram.nodes.map((node) => [node.id, createShapeId(diagramShapeKey(proposalId, node.id, 'node'))]))
	const shapes: TLShapePartial[] = diagram.nodes.map((node) => {
		const base = { id: nodeIds.get(node.id)!, parentId: pageId, x: node.x + offset.x, y: node.y + offset.y,
			...(node.role === 'anchor' ? { opacity: 0 } : {}), meta: { diagramProposal: proposalId } }
		if (node.kind === 'note') return { ...base, type: 'note', props: { color: node.color, richText: toRichText(node.label), font: 'draw', size: 'm', scale: node.w / 200 } }
		return { ...base, type: 'geo', props: { geo: node.kind, w: node.w, h: node.h, richText: toRichText(node.label), color: node.color, fill: 'none', font: 'draw', size: 'm', dash: 'draw' } }
	})
	const bindings: TLBindingCreate[] = []
	for (const edge of diagram.edges) {
		const from = diagram.nodes.find((node) => node.id === edge.from)!
		const to = diagram.nodes.find((node) => node.id === edge.to)!
		const id = createShapeId(diagramShapeKey(proposalId, edge.id, 'edge'))
		const x = from.x + from.w / 2 + offset.x, y = from.y + from.h / 2 + offset.y
		shapes.push({ id, type: 'arrow', parentId: pageId, x, y, meta: { diagramProposal: proposalId }, props: { color: edge.color, font: 'draw', size: 'm', dash: edge.style === 'lifeline' ? 'dashed' : 'draw', richText: toRichText(edge.label), arrowheadStart: 'none', arrowheadEnd: edge.style === 'lifeline' ? 'none' : 'arrow', start: { x: 0, y: 0 }, end: { x: to.x + to.w / 2 + offset.x - x, y: to.y + to.h / 2 + offset.y - y } } })
		for (const [terminal, target] of [['start', edge.from], ['end', edge.to]] as const) bindings.push({
			id: createBindingId(`diagram-${proposalId}-${edge.id}-${terminal}`), type: 'arrow', fromId: id, toId: nodeIds.get(target)!,
			props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: diagram.nodes.find((node) => node.id === target)?.role === 'anchor', isPrecise: false, snap: 'none' },
		})
	}
	return { shapes, bindings }
}

export function applyNativeDiagram(editor: Editor, diagram: Diagram, proposalId: string, pageId: TLPageId, reposition: boolean) {
	if (editor.getIsReadonly()) throw new Error('This board is read-only.')
	if (!editor.getPage(pageId) || editor.getCurrentPageId() !== pageId) throw new Error('Return to the target page before applying this proposal.')
	const { shapes, bindings } = createNativeDiagram(diagram, proposalId, pageId)
	const ids = shapes.map((shape) => shape.id!)
	const visibleIds = shapes.filter((shape) => shape.opacity !== 0).map((shape) => shape.id!)
	const existing = ids.map((id) => editor.getShape(id)).filter((shape) => shape !== undefined)
	if (existing.length) {
		if (existing.length === ids.length && existing.every((shape) => shape.meta.diagramProposal === proposalId && editor.getAncestorPageId(shape) === pageId)) return
		throw new Error('Part of this proposal already exists. Undo that insertion before retrying.')
	}
	// Resolve retries before placement: saved same-ID shapes keep their positions even if the camera or board changed.
	const occupied = editor.getCurrentPageShapes().filter((shape) => !ids.includes(shape.id)).flatMap((shape) => {
		const bounds = editor.getShapePageBounds(shape)
		return bounds ? [{ x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }] : []
	})
	const bounds = diagramBounds(diagram)
	const viewport = editor.getViewportPageBounds()
	const preferred = reposition ? { x: viewport.center.x - bounds.x - bounds.w / 2, y: viewport.center.y - bounds.y - bounds.h / 2 } : { x: 0, y: 0 }
	const clearance = nonOverlappingOffset({ ...bounds, x: bounds.x + preferred.x, y: bounds.y + preferred.y }, occupied)
	for (const shape of shapes) { shape.x = (shape.x ?? 0) + preferred.x + clearance.x; shape.y = (shape.y ?? 0) + preferred.y + clearance.y }
	const insertedBounds = () => commonBounds(ids.flatMap((id) => { const bound = editor.getShapePageBounds(id); return bound ? [bound] : [] }))
	const mark = editor.markHistoryStoppingPoint('Apply diagram')
	try {
		editor.run(() => {
			editor.createShapes(shapes)
			editor.createBindings(bindings)
			// Native text and arrow labels can exceed the proposal's geometry; use the rendered bounds for a final clearance check.
			const actual = insertedBounds()
			if (actual) {
				const adjustment = nonOverlappingOffset(actual, occupied)
				if (adjustment.x || adjustment.y) editor.nudgeShapes(ids, adjustment)
			}
			editor.select(...visibleIds)
		})
		if (ids.some((id) => !editor.getShape(id)) || bindings.some((binding) => !editor.getBinding(binding.id!))) {
			throw new Error('The complete diagram could not be added. The board may have reached its shape limit.')
		}
	} catch (cause) {
		// This insertion is synchronous, so rollback cannot consume a later user action.
		editor.bailToMark(mark)
		throw cause
	}
	editor.markHistoryStoppingPoint('Diagram applied')
	const actual = insertedBounds()
	if (actual) editor.zoomToBounds(actual, { targetZoom: 1, animation: { duration: 0 } })
}
