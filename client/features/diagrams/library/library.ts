import type { Editor, TLBindingId, TLContent, TLShapeId } from 'tldraw'
import { applyNativeDiagram, createNativeDiagram } from '../native'
import { getStarter, type StarterId } from './templates'

export { STARTERS, type StarterId } from './templates'

export const PERSONAL_LIBRARY_KEY = 'freeform:personal-library:v1'
const MAX_BLOCKS = 24
const MAX_SHAPES_PER_BLOCK = 80
const MAX_BLOCK_BYTES = 1024 * 1024
const MAX_LIBRARY_BYTES = 4 * 1024 * 1024

export interface StorageLike {
	getItem(key: string): string | null
	setItem(key: string, value: string): void
}

interface Bounds { x: number; y: number; w: number; h: number }
export interface PersonalBlock { id: string; name: string; content: TLContent; createdAt: number; bounds?: Bounds }
export interface InsertResult { shapeIds: TLShapeId[]; bindingIds: TLBindingId[] }

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isBounds(value: unknown): value is Bounds {
	return isRecord(value) && ['x', 'y', 'w', 'h'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))
		&& (value.w as number) > 0 && (value.h as number) > 0
}

function isPersonalBlock(value: unknown): value is PersonalBlock {
	if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' ||
		!Number.isFinite(value.createdAt) || (value.bounds !== undefined && !isBounds(value.bounds)) || !isRecord(value.content)) return false
	const { content } = value
	if (!Array.isArray(content.shapes) || content.shapes.length < 1 || content.shapes.length > MAX_SHAPES_PER_BLOCK ||
		!Array.isArray(content.rootShapeIds) || !Array.isArray(content.assets) ||
		!(content.bindings === undefined || Array.isArray(content.bindings)) || !isRecord(content.schema)) return false
	const shapeIds = new Set(content.shapes.filter(isRecord).map((shape) => shape.id))
	return shapeIds.size === content.shapes.length && content.shapes.every((shape) => isRecord(shape) && typeof shape.id === 'string' && typeof shape.type === 'string')
		&& content.rootShapeIds.every((id) => typeof id === 'string' && shapeIds.has(id))
		&& (content.bindings ?? []).every((binding) => isRecord(binding) && typeof binding.id === 'string'
			&& shapeIds.has(binding.fromId) && shapeIds.has(binding.toId))
}

export function loadPersonalBlocks(storage: StorageLike = localStorage): PersonalBlock[] {
	try {
		const raw = storage.getItem(PERSONAL_LIBRARY_KEY)
		if (!raw || raw.length > MAX_LIBRARY_BYTES) return []
		const data: unknown = JSON.parse(raw)
		return Array.isArray(data) && data.length <= MAX_BLOCKS && data.every(isPersonalBlock) ? data : []
	} catch { return [] }
}

function persist(blocks: readonly PersonalBlock[], storage: StorageLike) {
	const raw = JSON.stringify(blocks)
	if (raw.length > MAX_LIBRARY_BYTES) throw new Error('Personal library is full. Remove a block before saving.')
	storage.setItem(PERSONAL_LIBRARY_KEY, raw)
}

function assertCanInsert(editor: Editor, count: number) {
	if (editor.getIsReadonly()) throw new Error('This board is read-only.')
	if (editor.getCurrentPageShapeIds().size + count > editor.options.maxShapesPerPage) {
		throw new Error('This board has reached its shape limit.')
	}
}

export function insertStarter(editor: Editor, id: StarterId): InsertResult {
	const { diagram } = getStarter(id)
	assertCanInsert(editor, diagram.nodes.length + diagram.edges.length)
	const insertionId = `starter-${crypto.randomUUID()}`
	const pageId = editor.getCurrentPageId()
	const { shapes, bindings } = createNativeDiagram(diagram, insertionId, pageId)
	applyNativeDiagram(editor, diagram, insertionId, pageId, true)
	return { shapeIds: shapes.map((shape) => shape.id!), bindingIds: bindings.map((binding) => binding.id!) }
}

export function saveSelectionAsBlock(editor: Editor, name: string, storage: StorageLike = localStorage): PersonalBlock {
	const trimmed = name.trim()
	if (!trimmed || trimmed.length > 60) throw new Error('Give the block a name of 1 to 60 characters.')
	const selected = editor.getSelectedShapeIds()
	if (!selected.length) throw new Error('Select at least one shape to save.')
	const content = editor.getContentFromCurrentPage(selected)
	if (!content?.shapes.length) throw new Error('The selection could not be saved.')
	if (content.shapes.length > MAX_SHAPES_PER_BLOCK) throw new Error(`Select at most ${MAX_SHAPES_PER_BLOCK} shapes.`)
	const bytes = JSON.stringify(content).length
	if (bytes > MAX_BLOCK_BYTES) throw new Error('This selection is too large for the personal library.')
	const blocks = loadPersonalBlocks(storage)
	if (blocks.length >= MAX_BLOCKS) throw new Error('Personal library is full. Remove a block before saving.')
	const shapeBounds = selected.flatMap((id) => { const bounds = editor.getShapePageBounds(id); return bounds ? [bounds] : [] })
	const bounds = shapeBounds.length ? {
		x: Math.min(...shapeBounds.map((box) => box.x)), y: Math.min(...shapeBounds.map((box) => box.y)),
		w: Math.max(...shapeBounds.map((box) => box.maxX)) - Math.min(...shapeBounds.map((box) => box.x)),
		h: Math.max(...shapeBounds.map((box) => box.maxY)) - Math.min(...shapeBounds.map((box) => box.y)),
	} : undefined
	const block = { id: crypto.randomUUID(), name: trimmed, content, createdAt: Date.now(), bounds }
	persist([block, ...blocks], storage)
	return block
}

function contentBounds(editor: Editor, block: PersonalBlock): Bounds {
	if (block.bounds) return block.bounds
	// Older local blocks predate the saved bounds; prefer their surviving source
	// shapes before falling back to the serialized root positions.
	const existing = block.content.shapes.flatMap((shape) => {
		const bounds = editor.getShapePageBounds(shape.id)
		return bounds ? [bounds] : []
	})
	if (existing.length) {
		const x = Math.min(...existing.map((box) => box.x)), y = Math.min(...existing.map((box) => box.y))
		return { x, y, w: Math.max(...existing.map((box) => box.maxX)) - x, h: Math.max(...existing.map((box) => box.maxY)) - y }
	}
	const roots = block.content.shapes.filter((shape) => block.content.rootShapeIds.includes(shape.id))
	const points = roots.map((shape) => {
		const props = shape.props as Record<string, unknown>
		const w = typeof props.w === 'number' && props.w > 0 ? props.w : 160
		const h = typeof props.h === 'number' && props.h > 0 ? props.h : 100
		return { x: shape.x, y: shape.y, w, h }
	})
	const x = Math.min(...points.map((box) => box.x)), y = Math.min(...points.map((box) => box.y))
	return { x, y, w: Math.max(...points.map((box) => box.x + box.w)) - x,
		h: Math.max(...points.map((box) => box.y + box.h)) - y }
}

function freeBlockPosition(editor: Editor, bounds: Bounds) {
	const viewport = editor.getViewportPageBounds()
	const base = { x: viewport.center.x - bounds.w / 2, y: viewport.center.y - bounds.h / 2 }
	const gap = 48
	const occupied = editor.getCurrentPageShapes().filter((shape) => shape.type !== 'arrow').flatMap((shape) => {
		const box = editor.getShapePageBounds(shape)
		return box ? [{ x: box.x, y: box.y, w: box.w, h: box.h }] : []
	})
	const clear = (position: { x: number; y: number }) => occupied.every((box) =>
		position.x >= box.x + box.w + gap || position.x + bounds.w + gap <= box.x ||
		position.y >= box.y + box.h + gap || position.y + bounds.h + gap <= box.y)
	const candidates = [base]
	for (let ring = 1; ring <= 12; ring++) candidates.push(
		{ x: base.x, y: base.y + ring * (bounds.h + gap) },
		{ x: base.x, y: base.y - ring * (bounds.h + gap) },
		{ x: base.x + ring * (bounds.w + gap), y: base.y },
		{ x: base.x - ring * (bounds.w + gap), y: base.y },
	)
	const position = candidates.find(clear) ?? { x: Math.max(...occupied.map((box) => box.x + box.w), base.x) + gap, y: base.y }
	return { x: position.x + bounds.w / 2, y: position.y + bounds.h / 2 }
}

export function removePersonalBlock(id: string, storage: StorageLike = localStorage) {
	const blocks = loadPersonalBlocks(storage)
	if (!blocks.some((block) => block.id === id)) return
	persist(blocks.filter((block) => block.id !== id), storage)
}

export function insertSavedBlock(editor: Editor, block: PersonalBlock): InsertResult {
	if (!isPersonalBlock(block)) throw new Error('This personal block is invalid.')
	assertCanInsert(editor, block.content.shapes.length)
	const before = new Set(editor.getCurrentPageShapeIds())
	const point = freeBlockPosition(editor, contentBounds(editor, block))
	const mark = editor.markHistoryStoppingPoint('Insert library block')
	try {
		editor.putContentOntoCurrentPage(block.content, { point, select: true })
		const shapeIds = [...editor.getCurrentPageShapeIds()].filter((id) => !before.has(id))
		if (shapeIds.length !== block.content.shapes.length) throw new Error('The block could not be added completely.')
		const ids = new Set(shapeIds)
		const bindingIds = [...new Map(shapeIds.flatMap((id) => editor.getBindingsInvolvingShape(id)).map((binding) => [binding.id, binding])).values()]
			.filter((binding) => ids.has(binding.fromId) && ids.has(binding.toId)).map((binding) => binding.id)
		if (bindingIds.length !== (block.content.bindings?.length ?? 0)) throw new Error('The block connections could not be added completely.')
		editor.select(...shapeIds)
		editor.markHistoryStoppingPoint('Block added')
		const boxes = shapeIds.flatMap((id) => { const box = editor.getShapePageBounds(id); return box ? [box] : [] })
		if (boxes.length) {
			const x = Math.min(...boxes.map((box) => box.x)), y = Math.min(...boxes.map((box) => box.y))
			const width = Math.max(...boxes.map((box) => box.maxX)) - x
			const height = Math.max(...boxes.map((box) => box.maxY)) - y
			const viewport = editor.getViewportPageBounds()
			if (x < viewport.x || y < viewport.y || x + width > viewport.maxX || y + height > viewport.maxY) {
				editor.zoomToBounds({ x, y, w: width, h: height }, { targetZoom: Math.min(1, editor.getZoomLevel()), animation: { duration: 0 } })
			}
		}
		return { shapeIds, bindingIds }
	} catch (cause) {
		editor.bailToMark(mark)
		throw cause
	}
}
