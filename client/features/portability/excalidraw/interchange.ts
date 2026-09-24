import {
	createBindingId,
	createShapeId,
	getArrowBindings,
	getArrowTerminalsInArrowSpace,
	renderPlaintextFromRichText,
	toRichText,
	type Editor,
	type TLArrowBinding,
	type TLArrowShape,
	type TLBindingCreate,
	type TLGeoShape,
	type TLLineShape,
	type TLPageId,
	type TLShape,
	type TLShapeId,
	type TLShapePartial,
	type TLTextShape,
	type IndexKey,
} from 'tldraw'
import { getCustomColor, normalizeHexColor } from '../../../editor/excalidrawShapes/colors'
import { curvePointFromMeta } from '../../../editor/excalidrawShapes/arrowCurve'

export const MAX_EXCALIDRAW_FILE_BYTES = 25 * 1024 * 1024
const MAX_ELEMENTS = 5000
const MAX_WARNINGS = 24

type JsonRecord = Record<string, unknown>
type Point = { x: number; y: number }

/** Counts refer to visible source elements. Labels merged into a native shape still count as converted. */
export interface InterchangeReport {
	convertedElements: number
	skippedElements: number
	skippedByType: Record<string, number>
	styleLosses: Record<string, number>
	warnings: string[]
}

export interface ParsedExcalidrawBoard {
	shapes: TLShapePartial[]
	bindings: TLBindingCreate[]
	report: InterchangeReport
}

export interface ExportedExcalidrawPage {
	json: string
	report: InterchangeReport
}

function report(): InterchangeReport {
	return { convertedElements: 0, skippedElements: 0, skippedByType: {}, styleLosses: {}, warnings: [] }
}

function warn(result: InterchangeReport, message: string) {
	if (result.warnings.length < MAX_WARNINGS) result.warnings.push(message)
}

function skip(result: InterchangeReport, type: string, reason: string) {
	result.skippedElements++
	result.skippedByType[type] = (result.skippedByType[type] ?? 0) + 1
	warn(result, reason)
}

function lose(result: InterchangeReport, kind: string, reason: string) {
	result.styleLosses[kind] = (result.styleLosses[kind] ?? 0) + 1
	warn(result, reason)
}

function record(value: unknown): value is JsonRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finite(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value)
}

function str(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback
}

function point(value: unknown): Point | null {
	if (!Array.isArray(value) || !finite(value[0]) || !finite(value[1])) return null
	return { x: value[0], y: value[1] }
}

function position(element: JsonRecord): Point | null {
	return finite(element.x) && finite(element.y) ? { x: element.x, y: element.y } : null
}

function dimensions(element: JsonRecord): { w: number; h: number } | null {
	return finite(element.width) && finite(element.height) && element.width >= 0 && element.height >= 0
		? { w: Math.max(1, element.width), h: Math.max(1, element.height) }
		: null
}

function stroke(element: JsonRecord, result: InterchangeReport, id: string) {
	const hex = normalizeHexColor(element.strokeColor)
	if (!hex) lose(result, 'stroke color', `${id}: invalid stroke color; black was used.`)
	return hex ?? '#000000'
}

function fill(element: JsonRecord, strokeHex: string, result: InterchangeReport, id: string): 'none' | 'fill' | 'pattern' | 'lined-fill' {
	if (element.backgroundColor === 'transparent' || !element.backgroundColor) return 'none'
	const background = normalizeHexColor(element.backgroundColor)
	if (!background) {
		lose(result, 'fill color', `${id}: invalid fill color; the fill was omitted.`)
		return 'none'
	}
	const style = str(element.fillStyle, 'solid')
	if (background !== strokeHex) lose(result, 'fill color', `${id}: separate fill color cannot be represented exactly; the stroke color was used.`)
	if (style === 'solid') return 'fill'
	if (style === 'hachure') return 'lined-fill'
	if (style === 'cross-hatch' || style === 'zigzag') {
		lose(result, 'fill pattern', `${id}: ${style} fill was approximated by a pattern.`)
		return 'pattern'
	}
	lose(result, 'fill pattern', `${id}: unknown fill style was approximated by solid fill.`)
	return 'fill'
}

function dash(element: JsonRecord): 'solid' | 'dashed' | 'dotted' {
	return element.strokeStyle === 'dashed' || element.strokeStyle === 'dotted' ? element.strokeStyle : 'solid'
}

function size(element: JsonRecord): 's' | 'm' | 'l' | 'xl' {
	const width = finite(element.strokeWidth) ? element.strokeWidth : 2
	return width <= 1 ? 's' : width <= 2 ? 'm' : width <= 4 ? 'l' : 'xl'
}

function opacity(element: JsonRecord): number {
	return finite(element.opacity) ? Math.min(1, Math.max(0, element.opacity / 100)) : 1
}

function common(element: JsonRecord, id: string, pageId: TLPageId, hex: string) {
	return {
		id: createShapeId(), parentId: pageId, x: element.x as number, y: element.y as number,
		rotation: finite(element.angle) ? element.angle : 0,
		opacity: opacity(element),
		isLocked: element.locked === true,
		meta: { excalidrawId: id, freeformColor: { version: 1, hex, base: 'black' } },
	}
}

function labelText(element: JsonRecord): string {
	return str(element.originalText, str(element.text))
}

function arrowhead(value: unknown, result: InterchangeReport, id: string): 'none' | 'arrow' | 'dot' | 'triangle' | 'diamond' | 'bar' {
	if (value === null || value === undefined) return 'none'
	if (value === 'arrow' || value === 'dot' || value === 'triangle' || value === 'diamond' || value === 'bar') return value
	lose(result, 'arrowhead', `${id}: ${String(value)} arrowhead was approximated by an arrow.`)
	return 'arrow'
}

function exportArrowhead(value: TLArrowShape['props']['arrowheadStart'], result: InterchangeReport, id: string): string | null {
	if (value === 'none') return null
	if (value === 'arrow' || value === 'dot' || value === 'triangle' || value === 'diamond' || value === 'bar') return value
	lose(result, 'arrowhead', `${id}: native ${value} arrowhead was approximated by an Excalidraw arrow.`)
	return 'arrow'
}

function bindingFor(element: JsonRecord, terminal: 'start' | 'end', fromId: TLShapeId, ids: Map<string, TLShapeId>, result: InterchangeReport): TLBindingCreate | null {
	const source = element[`${terminal}Binding`]
	if (!record(source)) return null
	const targetName = str(source.elementId)
	const targetId = ids.get(targetName)
	if (!targetId) {
		warn(result, `${str(element.id)}: ${terminal} binding target ${targetName || '(missing)'} was unavailable; the endpoint remains free.`)
		return null
	}
	const fixed = point(source.fixedPoint)
	if (!fixed) {
		warn(result, `${str(element.id)}: ${terminal} binding anchor was invalid; the endpoint remains free.`)
		return null
	}
	const mode = str(source.mode, 'orbit')
	return {
		id: createBindingId(), type: 'arrow', fromId, toId: targetId,
		props: {
			terminal,
			normalizedAnchor: { x: Math.min(1, Math.max(0, fixed.x)), y: Math.min(1, Math.max(0, fixed.y)) },
			isExact: mode === 'inside', isPrecise: true, snap: 'none',
		},
	}
}

/** Pure conversion. The caller must stage these records in a separate new board before applying them. */
export function parseExcalidrawBoard(json: string, pageId: TLPageId): ParsedExcalidrawBoard {
	if (new Blob([json]).size > MAX_EXCALIDRAW_FILE_BYTES) throw new Error('This Excalidraw file is too large (25 MB maximum).')
	let root: unknown
	try { root = JSON.parse(json) } catch { throw new Error('Choose a valid Excalidraw .excalidraw file.') }
	if (!record(root) || root.type !== 'excalidraw' || root.version !== 2 || !Array.isArray(root.elements) || root.elements.length > MAX_ELEMENTS) {
		throw new Error('Choose a valid Excalidraw .excalidraw version 2 file with at most 5,000 elements.')
	}
	const result = report()
	const elements: JsonRecord[] = []
	for (const candidate of root.elements) {
		if (!record(candidate)) { skip(result, 'invalid', 'An element was not an object.'); continue }
		if (candidate.isDeleted !== true) elements.push(candidate)
	}
	const shapes: TLShapePartial[] = []
	const bindings: TLBindingCreate[] = []
	const ids = new Map<string, TLShapeId>()
	const labels = new Map<string, JsonRecord[]>()
	for (const element of elements) {
		if (element.type !== 'text' || typeof element.containerId !== 'string') continue
		const list = labels.get(element.containerId) ?? []
		list.push(element)
		labels.set(element.containerId, list)
	}
	const mergedLabels = new Set<string>()
	const linear: Array<{ element: JsonRecord; id: TLShapeId }> = []
	const seen = new Set<string>()
	for (const element of elements) {
		const id = str(element.id)
		const type = str(element.type, 'unknown')
		if (!id || seen.has(id)) { skip(result, type, `${id || '(missing id)'}: duplicate or missing element ID.`); continue }
		seen.add(id)
		if (type === 'text' && element.containerId && labels.get(str(element.containerId))?.[0] === element) continue
		const xy = position(element)
		if (!xy) { skip(result, type, `${id}: invalid position.`); continue }
		if (!['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line'].includes(type)) {
			skip(result, type, `${id}: ${type} elements are not supported.`)
			continue
		}
		const hex = stroke(element, result, id)
		const base = common(element, id, pageId, hex)
		if (finite(element.roughness) && element.roughness !== 0) lose(result, 'roughness', `${id}: roughness was approximated by the native stroke style.`)
		if (Array.isArray(element.groupIds) && element.groupIds.length) lose(result, 'groups', `${id}: group membership was flattened.`)
		if (element.frameId) lose(result, 'frames', `${id}: frame membership was flattened.`)
		if (element.roundness) lose(result, 'roundness', `${id}: corner roundness was not retained.`)
		if (type === 'text' && finite(element.fontSize) && element.fontSize !== 20) lose(result, 'font size', `${id}: exact font size was approximated by a native text size.`)
		if (type === 'rectangle' || type === 'ellipse' || type === 'diamond') {
			const bounds = dimensions(element)
			if (!bounds) { skip(result, type, `${id}: invalid dimensions.`); continue }
			const label = labels.get(id)?.[0]
			if (label) mergedLabels.add(str(label.id))
			shapes.push({
				...base, type: 'geo', props: {
					geo: type, w: bounds.w, h: bounds.h, richText: toRichText(label ? labelText(label) : ''),
					color: 'black', labelColor: 'black', fill: fill(element, hex, result, id), dash: dash(element), size: size(element),
					font: 'draw', align: 'middle', verticalAlign: 'middle', url: str(element.link),
				},
			})
			ids.set(id, base.id)
			result.convertedElements++
			if (label) result.convertedElements++
		} else if (type === 'text') {
			const bounds = dimensions(element)
			if (!bounds) { skip(result, type, `${id}: invalid dimensions.`); continue }
			if (element.containerId) warn(result, `${id}: unattached bound text was imported as standalone text.`)
			shapes.push({ ...base, type: 'text', props: {
				w: bounds.w, richText: toRichText(labelText(element)), color: 'black',
				font: element.fontFamily === 3 ? 'mono' : element.fontFamily === 2 ? 'sans' : 'draw',
				textAlign: element.textAlign === 'center' ? 'middle' : element.textAlign === 'right' ? 'end' : 'start',
				autoSize: false,
			} })
			ids.set(id, base.id)
			result.convertedElements++
		} else if (type === 'arrow' || type === 'line') {
			const points = Array.isArray(element.points) ? element.points.map(point) : []
			if (points.length !== 2 || !points[0] || !points[1] || element.elbowed === true || element.polygon === true || (finite(element.angle) && element.angle !== 0)) {
				skip(result, type, `${id}: only unrotated straight two-point ${type}s are supported.`)
				continue
			}
			const start = points[0], end = points[1]
			const linearBase = { ...base, x: xy.x + start.x, y: xy.y + start.y, rotation: 0 }
			const vector = { x: end.x - start.x, y: end.y - start.y }
			if (type === 'arrow') {
				const label = labels.get(id)?.[0]
				if (label) mergedLabels.add(str(label.id))
				shapes.push({ ...linearBase, type: 'arrow', props: {
					start: { x: 0, y: 0 }, end: vector, kind: 'arc', bend: 0, color: 'black', labelColor: 'black',
					dash: dash(element), size: size(element), fill: 'none', font: 'draw',
					richText: toRichText(label ? labelText(label) : ''),
					labelPosition: label && finite(label.labelPosition) ? Math.min(1, Math.max(0, label.labelPosition)) : 0.5,
					arrowheadStart: arrowhead(element.startArrowhead, result, id), arrowheadEnd: arrowhead(element.endArrowhead, result, id),
				} })
				linear.push({ element, id: base.id })
				if (label) result.convertedElements++
			} else {
				if (record(element.startBinding) || record(element.endBinding)) {
					// Native line shapes have no bindings; a no-head native arrow does.
					shapes.push({ ...linearBase, meta: { ...linearBase.meta, excalidrawType: 'line' }, type: 'arrow', props: {
						start: { x: 0, y: 0 }, end: vector, kind: 'arc', bend: 0, color: 'black', labelColor: 'black',
						dash: dash(element), size: size(element), fill: 'none', font: 'draw', richText: toRichText(''),
						arrowheadStart: 'none', arrowheadEnd: 'none',
					} })
					linear.push({ element, id: base.id })
				} else {
					shapes.push({ ...linearBase, type: 'line', props: { color: 'black', dash: dash(element), size: size(element), spline: 'line', points: {
						'a1': { id: 'a1', index: 'a1' as IndexKey, x: 0, y: 0 },
						'a2': { id: 'a2', index: 'a2' as IndexKey, x: vector.x, y: vector.y },
					} } })
				}
			}
			ids.set(id, base.id)
			result.convertedElements++
		} else {
			skip(result, type, `${id}: ${type} elements are not supported.`)
		}
	}
	for (const item of linear) {
		for (const terminal of ['start', 'end'] as const) {
			const binding = bindingFor(item.element, terminal, item.id, ids, result)
			if (binding) bindings.push(binding)
		}
	}
	for (const element of elements) {
		if (element.type !== 'text' || !element.containerId || mergedLabels.has(str(element.id))) continue
		if (labels.get(str(element.containerId))?.[0] !== element) continue
		const id = str(element.id)
		if (!ids.has(id)) {
			const bounds = dimensions(element)
			const xy = position(element)
			if (!bounds || !xy) { skip(result, 'text', `${id}: unattached label has invalid geometry.`); continue }
			const hex = stroke(element, result, id)
			shapes.push({ ...common(element, id, pageId, hex), type: 'text', props: { w: bounds.w, richText: toRichText(labelText(element)), color: 'black', font: 'draw', autoSize: false } })
			result.convertedElements++
			warn(result, `${id}: unattached bound text was imported as standalone text.`)
		}
	}
	return { shapes, bindings, report: result }
}

function shapeColor(editor: Editor, shape: TLGeoShape | TLTextShape | TLArrowShape | TLLineShape): string {
	const custom = getCustomColor(shape)
	if (custom) return custom
	return editor.getCurrentTheme().colors[editor.getColorMode()][shape.props.color].solid
}

function style(editor: Editor, shape: TLGeoShape | TLTextShape | TLArrowShape | TLLineShape) {
	const strokeColor = shapeColor(editor, shape)
	const width = shape.props.size === 's' ? 1 : shape.props.size === 'm' ? 2 : shape.props.size === 'l' ? 4 : 5
	const nativeDash = 'dash' in shape.props ? shape.props.dash : 'solid'
	return {
		strokeColor, backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: width,
		strokeStyle: nativeDash === 'dashed' || nativeDash === 'dotted' ? nativeDash : 'solid',
		roughness: nativeDash === 'draw' ? 1 : 0,
	}
}

function baseElement(editor: Editor, shape: TLGeoShape | TLTextShape | TLArrowShape | TLLineShape, type: string): JsonRecord {
	return {
		id: shape.id, type, x: shape.x, y: shape.y, width: 0, height: 0, angle: shape.rotation,
		...style(editor, shape), opacity: Math.round(shape.opacity * 100),
		groupIds: [], frameId: null, roundness: null, index: null, seed: 1, version: 1, versionNonce: 1,
		isDeleted: false, boundElements: null, updated: Date.now(), created: null, link: null, locked: shape.isLocked,
	}
}

function labelFor(editor: Editor, container: TLGeoShape | TLArrowShape, text: string, x: number, y: number, labelPosition = 0.5): JsonRecord {
	const label = baseElement(editor, container, 'text')
	return {
		...label, id: `${container.id}-label`, x, y, width: Math.max(40, Math.min(400, text.length * 12)), height: 28,
		text, originalText: text, fontSize: 20, baseFontSize: null, fontFamily: 5, textAlign: 'center', verticalAlign: 'middle',
		containerId: container.id, autoResize: false, lineHeight: 1.25, labelPosition,
	}
}

function bindingValue(binding: TLArrowBinding | undefined): JsonRecord | null {
	if (!binding) return null
	return {
		elementId: binding.toId,
		fixedPoint: [binding.props.normalizedAnchor.x, binding.props.normalizedAnchor.y],
		mode: binding.props.isExact ? 'inside' : 'orbit',
	}
}

function supportedParent(shape: TLShape, editor: Editor) {
	return shape.parentId === editor.getCurrentPageId()
}

/** Export the active page as a partial Excalidraw v2 document with explicit loss accounting. */
export function exportExcalidrawPage(editor: Editor): ExportedExcalidrawPage {
	const result = report()
	const elements: JsonRecord[] = []
	const pageShapes = editor.getCurrentPageShapes()
	const exportableIds = new Set<TLShapeId>()
	for (const shape of pageShapes) {
		if (!supportedParent(shape, editor)) continue
		if (shape.type === 'geo' && ['rectangle', 'ellipse', 'diamond'].includes(shape.props.geo) || shape.type === 'text') exportableIds.add(shape.id)
		if (shape.type === 'arrow' && shape.props.kind !== 'elbow' && shape.props.bend === 0 && shape.rotation === 0 && !curvePointFromMeta(shape)) exportableIds.add(shape.id)
		if (shape.type === 'line' && shape.props.spline === 'line' && Object.keys(shape.props.points).length === 2 && shape.rotation === 0) exportableIds.add(shape.id)
	}
	for (const shape of pageShapes) {
		if (!supportedParent(shape, editor)) { skip(result, shape.type, `${shape.id}: nested shapes are not exported.`); continue }
		if (shape.type === 'geo' && (shape.props.geo === 'rectangle' || shape.props.geo === 'ellipse' || shape.props.geo === 'diamond')) {
			const item = baseElement(editor, shape, shape.props.geo)
			item.width = shape.props.w
			item.height = shape.props.h
			item.link = shape.props.url || null
			if (shape.props.fill !== 'none') {
				item.backgroundColor = shapeColor(editor, shape)
				item.fillStyle = shape.props.fill === 'lined-fill' ? 'hachure' : shape.props.fill === 'pattern' ? 'cross-hatch' : 'solid'
				if (shape.props.fill === 'semi' || shape.props.fill === 'solid') lose(result, 'fill style', `${shape.id}: native fill style was approximated by a solid Excalidraw fill.`)
			}
			const text = renderPlaintextFromRichText(editor, shape.props.richText).trim()
			if (text) {
				const label = labelFor(editor, shape, text, shape.x + shape.props.w / 2 - Math.min(200, text.length * 6), shape.y + shape.props.h / 2 - 14)
				item.boundElements = [{ id: label.id, type: 'text' }]
				elements.push(label)
				result.convertedElements++
			}
			const boundArrows = editor.getBindingsToShape(shape.id, 'arrow').filter((binding) => exportableIds.has(binding.fromId))
			item.boundElements = [...(item.boundElements as JsonRecord[] | null ?? []), ...boundArrows.map((binding) => ({ id: binding.fromId, type: 'arrow' }))]
			elements.push(item)
			result.convertedElements++
		} else if (shape.type === 'text') {
			const item = baseElement(editor, shape, 'text')
			const content = renderPlaintextFromRichText(editor, shape.props.richText)
			item.width = shape.props.w
			item.height = editor.getShapePageBounds(shape)?.h ?? 28
			Object.assign(item, { text: content, originalText: content, fontSize: 20, baseFontSize: null, fontFamily: shape.props.font === 'mono' ? 3 : shape.props.font === 'sans' ? 2 : 5, textAlign: shape.props.textAlign === 'middle' ? 'center' : shape.props.textAlign === 'end' ? 'right' : 'left', verticalAlign: 'top', containerId: null, autoResize: shape.props.autoSize, lineHeight: 1.25 })
			elements.push(item)
			result.convertedElements++
		} else if (shape.type === 'arrow') {
			if (shape.props.kind === 'elbow' || shape.props.bend !== 0 || shape.rotation !== 0 || curvePointFromMeta(shape)) {
				skip(result, 'arrow', `${shape.id}: only unrotated straight arrows are exported.`)
				continue
			}
			const nativeBindings = getArrowBindings(editor, shape)
			const terminals = getArrowTerminalsInArrowSpace(editor, shape, nativeBindings)
			const text = renderPlaintextFromRichText(editor, shape.props.richText).trim()
			const fromLine = shape.meta.excalidrawType === 'line' && shape.props.arrowheadStart === 'none' && shape.props.arrowheadEnd === 'none' && !text
			if (shape.meta.excalidrawType === 'line' && !fromLine) warn(result, `${shape.id}: edited bound line was exported as an arrow to retain its label or arrowheads.`)
			const item = baseElement(editor, shape, fromLine ? 'line' : 'arrow')
			item.x = shape.x + terminals.start.x
			item.y = shape.y + terminals.start.y
			item.width = Math.abs(terminals.end.x - terminals.start.x)
			item.height = Math.abs(terminals.end.y - terminals.start.y)
			item.angle = 0
			item.points = [[0, 0], [terminals.end.x - terminals.start.x, terminals.end.y - terminals.start.y]]
			item.startBinding = nativeBindings.start && exportableIds.has(nativeBindings.start.toId) ? bindingValue(nativeBindings.start) : null
			item.endBinding = nativeBindings.end && exportableIds.has(nativeBindings.end.toId) ? bindingValue(nativeBindings.end) : null
			for (const terminal of ['start', 'end'] as const) {
				const binding = nativeBindings[terminal]
				if (binding && !exportableIds.has(binding.toId)) warn(result, `${shape.id}: ${terminal} binding target was not exportable; endpoint remains free.`)
			}
			item.startArrowhead = exportArrowhead(shape.props.arrowheadStart, result, shape.id)
			item.endArrowhead = exportArrowhead(shape.props.arrowheadEnd, result, shape.id)
			if (fromLine) item.polygon = false
			else item.elbowed = false
			if (text) {
				const labelX = (item.x as number) + (terminals.end.x - terminals.start.x) * shape.props.labelPosition
				const labelY = (item.y as number) + (terminals.end.y - terminals.start.y) * shape.props.labelPosition
				const label = labelFor(editor, shape, text, labelX - Math.min(200, text.length * 6), labelY - 14, shape.props.labelPosition)
				item.boundElements = [{ id: label.id, type: 'text' }]
				elements.push(label)
				result.convertedElements++
			}
			elements.push(item)
			result.convertedElements++
		} else if (shape.type === 'line') {
			const points = Object.values(shape.props.points).sort((a, b) => a.index.localeCompare(b.index))
			if (shape.props.spline !== 'line' || points.length !== 2 || shape.rotation !== 0) {
				skip(result, 'line', `${shape.id}: only unrotated straight two-point lines are exported.`)
				continue
			}
			const item = baseElement(editor, shape, 'line')
			item.x = shape.x + points[0].x
			item.y = shape.y + points[0].y
			item.width = Math.abs(points[1].x - points[0].x)
			item.height = Math.abs(points[1].y - points[0].y)
			item.points = [[0, 0], [points[1].x - points[0].x, points[1].y - points[0].y]]
			item.polygon = false
			item.startBinding = null
			item.endBinding = null
			item.startArrowhead = null
			item.endArrowhead = null
			elements.push(item)
			result.convertedElements++
		} else {
			skip(result, shape.type, `${shape.id}: ${shape.type} shapes are not supported.`)
		}
	}
	const colorMode = editor.getColorMode()
	const json = JSON.stringify({ type: 'excalidraw', version: 2, source: 'FreeForm', elements, appState: {
		theme: colorMode, viewBackgroundColor: editor.getCurrentTheme().colors[colorMode].background,
	}, files: {} }, null, 2)
	return { json, report: result }
}
