import type { Editor, TLShape, TLShapeId } from 'tldraw'

type NodeShape = Extract<TLShape, { type: 'geo' | 'note' }>
type Bounds = { x: number; y: number; w: number; h: number }
type LayoutNode = { shape: NodeShape; bounds: Bounds }
type Edge = { from: TLShapeId; to: TLShapeId }

const HORIZONTAL_GAP = 160
const VERTICAL_GAP = 64
const MAX_NODES = 200

function isNode(shape: TLShape): shape is NodeShape {
	return shape.type === 'geo' || shape.type === 'note'
}

function selectedGraph(editor: Editor): { nodes: LayoutNode[]; edges: Edge[] } | null {
	if (editor.getIsReadonly() || !editor.isIn('select.idle')) return null
	const selection = editor.getSelectedShapes()
	if (selection.some((shape) => !isNode(shape) && shape.type !== 'arrow')) return null
	const shapes = selection.filter(isNode)
	if (shapes.length < 2 || shapes.length > MAX_NODES) return null
	const pageId = editor.getCurrentPageId()
	if (shapes.some((shape) => shape.parentId !== pageId || editor.isShapeOrAncestorLocked(shape))) return null
	const nodes: LayoutNode[] = []
	for (const shape of shapes) {
		const bounds = editor.getShapePageBounds(shape)
		if (!bounds || ![bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite)) return null
		nodes.push({ shape, bounds: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h } })
	}
	// Small anchors and disconnected participant lanes are authored layouts
	// (such as sequence diagrams), not a flowchart to rearrange.
	if (nodes.some(({ bounds }) => bounds.w < 72 || bounds.h < 40)) return null
	const ids = new Set(nodes.map(({ shape }) => shape.id))
	const edges: Edge[] = []
	const visitedArrows = new Set<TLShapeId>()
	for (const node of nodes) for (const binding of editor.getBindingsToShape(node.shape.id, 'arrow')) {
		if (visitedArrows.has(binding.fromId)) continue
		visitedArrows.add(binding.fromId)
		const shape = editor.getShape(binding.fromId)
		if (shape?.type !== 'arrow' || shape.parentId !== pageId) continue
		const bindings = editor.getBindingsFromShape(shape.id, 'arrow')
		const from = bindings.find(({ props }) => props.terminal === 'start')?.toId
		const to = bindings.find(({ props }) => props.terminal === 'end')?.toId
		if (from && to && from !== to && ids.has(from) && ids.has(to)) edges.push({ from, to })
	}
	if (!edges.length) return null
	const connected = new Set<TLShapeId>([nodes[0].shape.id])
	const neighbours = new Map([...ids].map((id) => [id, new Set<TLShapeId>()]))
	for (const { from, to } of edges) {
		neighbours.get(from)!.add(to)
		neighbours.get(to)!.add(from)
	}
	const pending = [nodes[0].shape.id]
	while (pending.length) {
		for (const neighbour of neighbours.get(pending.pop()!)!) {
			if (connected.has(neighbour)) continue
			connected.add(neighbour)
			pending.push(neighbour)
		}
	}
	return connected.size === nodes.length ? { nodes, edges } : null
}

/** True when the current native-node selection has at least one live connection. */
export function canLayoutSelectedDiagram(editor: Editor): boolean {
	return selectedGraph(editor) !== null
}

function positions(nodes: readonly LayoutNode[], edges: readonly Edge[]) {
	const byId = new Map(nodes.map((node) => [node.shape.id, node]))
	const byOriginalPosition = (left: TLShapeId, right: TLShapeId) => {
		const a = byId.get(left)!.bounds, b = byId.get(right)!.bounds
		return a.y - b.y || a.x - b.x || left.localeCompare(right)
	}
	const ids = [...byId.keys()].sort(byOriginalPosition)
	const outgoing = new Map(ids.map((id) => [id, new Set<TLShapeId>()]))
	const indegree = new Map(ids.map((id) => [id, 0]))
	const rank = new Map(ids.map((id) => [id, 0]))
	for (const { from, to } of edges) {
		if (outgoing.get(from)!.has(to)) continue
		outgoing.get(from)!.add(to)
		indegree.set(to, indegree.get(to)! + 1)
	}
	const remaining = new Set(ids)
	while (remaining.size) {
		// In a cycle, break the tie by the pre-layout position so the result stays stable.
		const next = ids.find((id) => remaining.has(id) && indegree.get(id) === 0)
			?? ids.find((id) => remaining.has(id))!
		remaining.delete(next)
		for (const target of outgoing.get(next)!) {
			if (!remaining.has(target)) continue
			rank.set(target, Math.max(rank.get(target)!, rank.get(next)! + 1))
			indegree.set(target, indegree.get(target)! - 1)
		}
	}
	const layers = new Map<number, TLShapeId[]>()
	for (const id of ids) {
		const depth = rank.get(id)!
		if (!layers.has(depth)) layers.set(depth, [])
		layers.get(depth)!.push(id)
	}
	const originX = Math.min(...nodes.map(({ bounds }) => bounds.x))
	const originY = Math.min(...nodes.map(({ bounds }) => bounds.y))
	const result = new Map<TLShapeId, { x: number; y: number }>()
	let x = originX
	for (const depth of [...layers.keys()].sort((a, b) => a - b)) {
		const layer = layers.get(depth)!.sort(byOriginalPosition)
		let y = originY
		let width = 0
		for (const id of layer) {
			const node = byId.get(id)!
			result.set(id, { x, y })
			y += node.bounds.h + VERTICAL_GAP
			width = Math.max(width, node.bounds.w)
		}
		x += width + HORIZONTAL_GAP
	}
	return result
}

function clearOfOtherShapes(editor: Editor, nodes: readonly LayoutNode[], positions: Map<TLShapeId, { x: number; y: number }>) {
	const selectedIds = new Set(editor.getSelectedShapeIds())
	const occupied = editor.getCurrentPageShapes()
		.filter((shape) => !selectedIds.has(shape.id) && shape.type !== 'arrow' && shape.type !== 'frame')
		.flatMap((shape) => { const bounds = editor.getShapePageBounds(shape); return bounds ? [bounds] : [] })
		.sort((a, b) => a.y - b.y)
	const top = Math.min(...nodes.map(({ shape }) => positions.get(shape.id)!.y))
	const gap = 48
	let shiftY = 0
	for (const other of occupied) {
		const collides = nodes.some(({ shape, bounds }) => {
			const position = positions.get(shape.id)!
			return position.x < other.maxX + gap && position.x + bounds.w + gap > other.x
				&& position.y + shiftY < other.maxY + gap && position.y + shiftY + bounds.h + gap > other.y
		})
		if (collides) shiftY = Math.max(shiftY, other.maxY + gap - top)
	}
	return shiftY
}

/** Move selected page-level geo/note nodes into connected layers. Native arrow bindings follow the nodes. */
export function layoutSelectedDiagram(editor: Editor): boolean {
	const graph = selectedGraph(editor)
	if (!graph) return false
	const next = positions(graph.nodes, graph.edges)
	const shiftY = clearOfOtherShapes(editor, graph.nodes, next)
	const changes = graph.nodes.flatMap(({ shape, bounds }) => {
		const position = next.get(shape.id)!
		const x = shape.x + position.x - bounds.x
		const y = shape.y + position.y + shiftY - bounds.y
		return Math.abs(x - shape.x) < 0.01 && Math.abs(y - shape.y) < 0.01
			? [] : [{ id: shape.id, type: shape.type, x, y }]
	})
	if (!changes.length) return false
	editor.markHistoryStoppingPoint('Layout diagram')
	editor.run(() => editor.updateShapes(changes))
	const arranged = graph.nodes.map(({ shape, bounds }) => ({ ...next.get(shape.id)!, w: bounds.w, h: bounds.h }))
	const minX = Math.min(...arranged.map(({ x }) => x))
	const minY = Math.min(...arranged.map(({ y }) => y)) + shiftY
	const maxX = Math.max(...arranged.map(({ x, w }) => x + w))
	const maxY = Math.max(...arranged.map(({ y, h }) => y + h)) + shiftY
	const screen = editor.getViewportScreenBounds()
	// The selected-shape panel occupies the left edge of the canvas. Fit the
	// result in the remaining area so its first node is visible while editing.
	const panelWidth = Math.min(256, screen.width * 0.4)
	const availableWidth = Math.max(1, screen.width - panelWidth - 64)
	const zoom = Math.min(1, availableWidth / (maxX - minX), Math.max(1, screen.height - 128) / (maxY - minY))
	editor.setCamera({
		x: -minX + (panelWidth + (availableWidth - (maxX - minX) * zoom) / 2) / zoom,
		y: -minY + (screen.height - (maxY - minY) * zoom) / 2 / zoom,
		z: zoom,
	})
	return true
}
