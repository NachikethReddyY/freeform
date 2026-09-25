import type { Editor, TLShape, TLShapeId } from 'tldraw'

type NodeShape = Extract<TLShape, { type: 'geo' | 'note' }>
type Bounds = { x: number; y: number; w: number; h: number }
type LayoutNode = { shape: NodeShape; bounds: Bounds }
type Edge = { from: TLShapeId; to: TLShapeId }
export type DiagramLayoutDirection = 'horizontal' | 'vertical' | 'tree' | 'radial' | 'compact'

const HORIZONTAL_GAP = 160
const VERTICAL_GAP = 64
const MAX_NODES = 200
const MAX_RADIAL_NODES = 16

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
export function canLayoutSelectedDiagram(editor: Editor, direction: DiagramLayoutDirection = 'horizontal'): boolean {
	const graph = selectedGraph(editor)
	return graph !== null && (direction !== 'tree' || treeRoot(graph.nodes, graph.edges) !== null)
		&& (direction !== 'radial' || graph.nodes.length <= MAX_RADIAL_NODES)
}

function treeRoot(nodes: readonly LayoutNode[], edges: readonly Edge[]): TLShapeId | null {
	// A shared child or a cycle has no unambiguous tree placement. The other
	// layout modes remain available for those graphs.
	if (edges.length !== nodes.length - 1) return null
	const incoming = new Map(nodes.map(({ shape }) => [shape.id, 0]))
	for (const { to } of edges) incoming.set(to, (incoming.get(to) ?? 0) + 1)
	if ([...incoming.values()].some((count) => count > 1)) return null
	const roots = [...incoming].filter(([, count]) => count === 0)
	return roots.length === 1 ? roots[0][0] : null
}

function treePositions(nodes: readonly LayoutNode[], edges: readonly Edge[]): Map<TLShapeId, { x: number; y: number }> {
	const root = treeRoot(nodes, edges)!
	const byId = new Map(nodes.map((node) => [node.shape.id, node]))
	const children = new Map(nodes.map(({ shape }) => [shape.id, [] as TLShapeId[]]))
	for (const { from, to } of edges) children.get(from)!.push(to)
	for (const list of children.values()) list.sort((a, b) =>
		byId.get(a)!.bounds.x - byId.get(b)!.bounds.x || byId.get(a)!.bounds.y - byId.get(b)!.bounds.y || a.localeCompare(b))
	const width = new Map<TLShapeId, number>()
	const rowHeight = new Map<number, number>()
	const visit = (id: TLShapeId, depth: number): number => {
		const own = byId.get(id)!.bounds
		rowHeight.set(depth, Math.max(rowHeight.get(depth) ?? 0, own.h))
		const childWidths = children.get(id)!.map((child) => visit(child, depth + 1))
		const descendants = childWidths.reduce((sum, value) => sum + value, 0)
			+ Math.max(0, childWidths.length - 1) * VERTICAL_GAP
		const span = Math.max(own.w, descendants)
		width.set(id, span)
		return span
	}
	visit(root, 0)
	const yByDepth = new Map<number, number>()
	let rowY = Math.min(...nodes.map(({ bounds }) => bounds.y))
	for (const depth of [...rowHeight.keys()].sort((a, b) => a - b)) {
		yByDepth.set(depth, rowY)
		rowY += rowHeight.get(depth)! + HORIZONTAL_GAP
	}
	const result = new Map<TLShapeId, { x: number; y: number }>()
	const place = (id: TLShapeId, left: number, depth: number) => {
		const own = byId.get(id)!.bounds
		const span = width.get(id)!
		result.set(id, { x: left + (span - own.w) / 2, y: yByDepth.get(depth)! })
		const branches = children.get(id)!
		const childWidth = branches.reduce((sum, child) => sum + width.get(child)!, 0)
			+ Math.max(0, branches.length - 1) * VERTICAL_GAP
		let childLeft = left + (span - childWidth) / 2
		for (const child of branches) {
			place(child, childLeft, depth + 1)
			childLeft += width.get(child)! + VERTICAL_GAP
		}
	}
	place(root, Math.min(...nodes.map(({ bounds }) => bounds.x)), 0)
	return result
}

/** Put bound nodes on graph-distance rings around a stable source node. */
function radialPositions(nodes: readonly LayoutNode[], edges: readonly Edge[]): Map<TLShapeId, { x: number; y: number }> {
	const byId = new Map(nodes.map((node) => [node.shape.id, node]))
	const incoming = new Map(nodes.map(({ shape }) => [shape.id, 0]))
	const outgoing = new Map(nodes.map(({ shape }) => [shape.id, 0]))
	const neighbors = new Map(nodes.map(({ shape }) => [shape.id, new Set<TLShapeId>()]))
	for (const { from, to } of edges) {
		incoming.set(to, incoming.get(to)! + 1)
		outgoing.set(from, outgoing.get(from)! + 1)
		neighbors.get(from)!.add(to)
		neighbors.get(to)!.add(from)
	}
	// A central hub should stay put, even when a chain's authored arrow starts
	// at an endpoint. Prefer fan-out only when graph degree is otherwise tied.
	const byAuthoredOrder = (a: TLShapeId, b: TLShapeId) =>
		byId.get(a)!.shape.index.localeCompare(byId.get(b)!.shape.index) || a.localeCompare(b)
	const root = [...byId.keys()].sort((a, b) => neighbors.get(b)!.size - neighbors.get(a)!.size
		|| outgoing.get(b)! - outgoing.get(a)!
		|| incoming.get(a)! - incoming.get(b)!
		|| byAuthoredOrder(a, b))[0]
	const rings: TLShapeId[][] = [[root]]
	const seen = new Set<TLShapeId>([root])
	for (let depth = 0; depth < rings.length; depth++) {
		const next: TLShapeId[] = []
		for (const id of rings[depth]) for (const neighbor of [...neighbors.get(id)!].sort(byAuthoredOrder)) {
			if (seen.has(neighbor)) continue
			seen.add(neighbor)
			next.push(neighbor)
		}
		if (next.length) rings.push(next)
	}
	const rootBounds = byId.get(root)!.bounds
	const center = { x: rootBounds.x + rootBounds.w / 2, y: rootBounds.y + rootBounds.h / 2 }
	const result = new Map<TLShapeId, { x: number; y: number }>([[root, { x: rootBounds.x, y: rootBounds.y }]])
	let previousRadius = 0
	let previousHalfDiagonal = Math.hypot(rootBounds.w, rootBounds.h) / 2
	for (const [index, ring] of rings.entries()) {
		if (!index) continue
		const maxDiagonal = Math.max(...ring.map((id) => { const box = byId.get(id)!.bounds; return Math.hypot(box.w, box.h) }))
		const halfDiagonal = maxDiagonal / 2
		const chordRadius = ring.length > 1 ? (maxDiagonal + 32) / (2 * Math.sin(Math.PI / ring.length)) : 0
		const radius = Math.max(previousRadius + previousHalfDiagonal + halfDiagonal + 80, chordRadius)
		for (const [position, id] of ring.entries()) {
			const box = byId.get(id)!.bounds
			const angle = -Math.PI / 2 + position * 2 * Math.PI / ring.length
			result.set(id, { x: center.x + radius * Math.cos(angle) - box.w / 2,
				y: center.y + radius * Math.sin(angle) - box.h / 2 })
		}
		previousRadius = radius
		previousHalfDiagonal = halfDiagonal
	}
	return result
}

function positions(nodes: readonly LayoutNode[], edges: readonly Edge[], direction: DiagramLayoutDirection) {
	if (direction === 'tree') return treePositions(nodes, edges)
	if (direction === 'radial') return radialPositions(nodes, edges)
	const vertical = direction === 'vertical'
	const primaryGap = direction === 'compact' ? 96 : HORIZONTAL_GAP
	const secondaryGap = direction === 'compact' ? 40 : VERTICAL_GAP
	const byId = new Map(nodes.map((node) => [node.shape.id, node]))
	const byOriginalPosition = (left: TLShapeId, right: TLShapeId) => {
		const a = byId.get(left)!.bounds, b = byId.get(right)!.bounds
		return vertical ? a.x - b.x || a.y - b.y || left.localeCompare(right)
			: a.y - b.y || a.x - b.x || left.localeCompare(right)
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
	let primary = vertical ? originY : originX
	for (const depth of [...layers.keys()].sort((a, b) => a - b)) {
		const layer = layers.get(depth)!.sort(byOriginalPosition)
		let secondary = vertical ? originX : originY
		let maxPrimarySize = 0
		for (const id of layer) {
			const node = byId.get(id)!
			result.set(id, vertical ? { x: secondary, y: primary } : { x: primary, y: secondary })
			secondary += (vertical ? node.bounds.w : node.bounds.h) + secondaryGap
			maxPrimarySize = Math.max(maxPrimarySize, vertical ? node.bounds.h : node.bounds.w)
		}
		primary += maxPrimarySize + primaryGap
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
export function layoutSelectedDiagram(editor: Editor, direction: DiagramLayoutDirection = 'horizontal'): boolean {
	const graph = selectedGraph(editor)
	if (!graph || (direction === 'tree' && !treeRoot(graph.nodes, graph.edges))
		|| (direction === 'radial' && graph.nodes.length > MAX_RADIAL_NODES)) return false
	const next = positions(graph.nodes, graph.edges, direction)
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
