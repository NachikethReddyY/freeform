import {
	createBindingId,
	createShapeId,
	startEditingShapeWithRichText,
	type Editor,
	type TLGeoShape,
	type TLShapeId,
} from 'tldraw'

// Native shape, binding, and history flow follows tldraw's Add connected shape
// example: https://tldraw.dev/examples/add-connected-shape (tldraw license).

export type ConnectedNodeDirection = 'up' | 'right' | 'down' | 'left'

interface Bounds { x: number; y: number; w: number; h: number }
interface Size { w: number; h: number }

const CONNECTION_GAP = 96
const SHAPE_CLEARANCE = 24

export function getConnectedNodeSource(editor: Editor): TLGeoShape | undefined {
	if (!editor.isIn('select.idle')) return undefined
	const shape = editor.getOnlySelectedShape()
	return shape?.type === 'geo' ? shape : undefined
}

export function canAddConnectedNode(editor: Editor): boolean {
	const source = getConnectedNodeSource(editor)
	return !!source && !editor.getIsReadonly() && !editor.isShapeOrAncestorLocked(source)
		&& editor.getCurrentPageShapeIds().size + 2 <= editor.options.maxShapesPerPage
}

interface Interval { low: number; high: number }

function freeCoordinate(at: number, blocked: Interval[], mode: 'nearest' | 'forward' | 'backward') {
	if (!blocked.length) return at
	const merged: Interval[] = []
	for (const interval of blocked.sort((a, b) => a.low - b.low)) {
		const last = merged.at(-1)
		if (last && interval.low <= last.high) last.high = Math.max(last.high, interval.high)
		else merged.push({ ...interval })
	}
	const containing = merged.find(({ low, high }) => low < at && at < high)
	if (!containing) return at
	if (mode === 'forward') return containing.high
	if (mode === 'backward') return containing.low
	return at - containing.low <= containing.high - at ? containing.low : containing.high
}

/** Search nearby lanes first, then move farther along the chosen direction. */
export function findConnectedNodePlacement(source: Bounds, size: Size, occupied: readonly Bounds[], direction: ConnectedNodeDirection): Bounds {
	const centerX = source.x + source.w / 2
	const centerY = source.y + source.h / 2
	const initial: Bounds = direction === 'right'
		? { x: source.x + source.w + CONNECTION_GAP, y: centerY - size.h / 2, ...size }
		: direction === 'left'
			? { x: source.x - CONNECTION_GAP - size.w, y: centerY - size.h / 2, ...size }
			: direction === 'down'
				? { x: centerX - size.w / 2, y: source.y + source.h + CONNECTION_GAP, ...size }
				: { x: centerX - size.w / 2, y: source.y - CONNECTION_GAP - size.h, ...size }

	const horizontal = direction === 'right' || direction === 'left'
	const placement = (primary: number, secondary: number): Bounds => horizontal
		? { x: primary, y: secondary, ...size }
		: { x: secondary, y: primary, ...size }
	const primary = horizontal ? initial.x : initial.y
	const secondary = horizontal ? initial.y : initial.x
	const primaryBlocked: Interval[] = []
	const secondaryBlocked: Interval[] = []
	const primarySize = horizontal ? size.w : size.h
	const secondarySize = horizontal ? size.h : size.w
	for (const box of occupied) {
		const boxPrimary = horizontal ? box.x : box.y
		const boxPrimarySize = horizontal ? box.w : box.h
		const boxSecondary = horizontal ? box.y : box.x
		const boxSecondarySize = horizontal ? box.h : box.w
		const primaryInterval = { low: boxPrimary - primarySize - SHAPE_CLEARANCE, high: boxPrimary + boxPrimarySize + SHAPE_CLEARANCE }
		const secondaryInterval = { low: boxSecondary - secondarySize - SHAPE_CLEARANCE, high: boxSecondary + boxSecondarySize + SHAPE_CLEARANCE }
		if (secondaryInterval.low < secondary && secondary < secondaryInterval.high) primaryBlocked.push(primaryInterval)
		if (primaryInterval.low < primary && primary < primaryInterval.high) secondaryBlocked.push(secondaryInterval)
	}
	const along = freeCoordinate(primary, primaryBlocked, direction === 'right' || direction === 'down' ? 'forward' : 'backward')
	const across = freeCoordinate(secondary, secondaryBlocked, 'nearest')
	return Math.abs(across - secondary) < Math.abs(along - primary)
		? placement(primary, across) : placement(along, secondary)
}

export interface ConnectedNodeResult { nodeId: TLShapeId; arrowId: TLShapeId }

function revealConnectedNode(editor: Editor, nodeId: TLShapeId) {
	const target = editor.getShapePageBounds(nodeId)
	const viewport = editor.getViewportPageBounds()
	if (!target || !viewport.w || !viewport.h) return
	const padding = 40 / editor.getZoomLevel()
	const shift = (min: number, max: number, viewMin: number, viewMax: number) => {
		if (max - min + padding * 2 > viewMax - viewMin) return (min + max - viewMin - viewMax) / 2
		if (min < viewMin + padding) return min - viewMin - padding
		if (max > viewMax - padding) return max - viewMax + padding
		return 0
	}
	const dx = shift(target.x, target.maxX, viewport.x, viewport.maxX)
	const dy = shift(target.y, target.maxY, viewport.y, viewport.maxY)
	if (dx || dy) {
		const camera = editor.getCamera()
		editor.setCamera({ x: camera.x - dx, y: camera.y - dy, z: camera.z }, { immediate: true })
	}
}

function focusConnectedNodeLabel(editor: Editor, nodeId: TLShapeId) {
	let attempts = 0
	const focusWhenMounted = () => {
		if (editor.getEditingShapeId() !== nodeId) return
		const textEditor = editor.getRichTextEditor()
		const input = textEditor?.view.dom
		if (!textEditor || !input?.isConnected || textEditor.isDestroyed) {
			if (++attempts < 5) editor.timers.setTimeout(focusWhenMounted, 40)
			return
		}
		if (input.ownerDocument.activeElement !== input) {
			input.focus()
			textEditor.commands.focus('end')
		}
	}
	editor.timers.setTimeout(focusWhenMounted, 0)
}

export function addConnectedNode(editor: Editor, direction: ConnectedNodeDirection): ConnectedNodeResult | null {
	const source = getConnectedNodeSource(editor)
	if (!source || !canAddConnectedNode(editor)) return null
	const sourceBounds = editor.getShapePageBounds(source)
	if (!sourceBounds) return null

	const size = { w: Math.max(120, Math.min(source.props.w, 360)), h: Math.max(80, Math.min(source.props.h + source.props.growY, 240)) }
	const occupied = editor.getCurrentPageShapes().filter((shape) => shape.type !== 'arrow').flatMap((shape) => {
		const box = editor.getShapePageBounds(shape)
		return box ? [{ x: box.x, y: box.y, w: box.w, h: box.h }] : []
	})
	const position = findConnectedNodePlacement(sourceBounds, size, occupied, direction)
	if (![position.x, position.y, position.w, position.h].every(Number.isFinite)) return null

	const nodeId = createShapeId()
	const arrowId = createShapeId()
	const startBindingId = createBindingId()
	const endBindingId = createBindingId()
	if (!editor.canCreateShapes([nodeId, arrowId])) return null
	const pageId = editor.getCurrentPageId()
	const start = sourceBounds.center
	const end = { x: position.x + position.w / 2, y: position.y + position.h / 2 }
	const mark = editor.markHistoryStoppingPoint('Add connected node')
	try {
		editor.run(() => {
			editor.createShapes([
				{
					id: nodeId, type: 'geo', parentId: pageId, x: position.x, y: position.y,
					props: { geo: 'rectangle', w: size.w, h: size.h, color: source.props.color,
						labelColor: source.props.labelColor, fill: source.props.fill, dash: source.props.dash,
						font: source.props.font, size: source.props.size },
				},
				{
					id: arrowId, type: 'arrow', parentId: pageId, x: start.x, y: start.y,
					props: { color: source.props.color, dash: source.props.dash, size: source.props.size,
						font: source.props.font, kind: 'arc', bend: 0, arrowheadStart: 'none', arrowheadEnd: 'arrow',
						start: { x: 0, y: 0 }, end: { x: end.x - start.x, y: end.y - start.y } },
				},
			])
			editor.createBindings([
				{ id: startBindingId, type: 'arrow', fromId: arrowId, toId: source.id,
					props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' } },
				{ id: endBindingId, type: 'arrow', fromId: arrowId, toId: nodeId,
					props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' } },
			])
			editor.select(nodeId)
		})
		if (!editor.getShape(nodeId) || !editor.getShape(arrowId) || !editor.getBinding(startBindingId) || !editor.getBinding(endBindingId)) {
			throw new Error('Could not add the complete connection.')
		}
		startEditingShapeWithRichText(editor, nodeId)
	} catch (cause) {
		editor.bailToMark(mark)
		throw cause
	}

	// Pan only the distance needed to reveal a node created near the viewport edge.
	revealConnectedNode(editor, nodeId)
	// TipTap mounts after this click; hand focus to its actual contenteditable once ready.
	focusConnectedNodeLabel(editor, nodeId)
	return { nodeId, arrowId }
}
