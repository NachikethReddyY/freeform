import { createShapeId, type TLGeoShape, type TLPageId, type TLShapePartial } from 'tldraw'
import type { Editor, TLShapeId } from 'tldraw'
import { MAX_CARD_LINES, MAX_CARD_SOURCE, type IncomingPasteCard } from './cardPaste'
import { nativeCardRichText } from './cardContent'

interface Bounds { x: number; y: number; w: number; h: number }

function cardText(card: IncomingPasteCard): string {
	return card.kind === 'url' ? `${card.title}\n${card.url}` : card.source
}

function cardDimensions(text: string, monospace: boolean): { w: number; h: number } {
	const width = monospace ? 440 : 400
	const charsPerLine = monospace ? 43 : 48
	const rows = text.split(/\r?\n/).reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
	return { w: width, h: Math.max(100, rows * 25 + 44) }
}

function safeCardUrl(card: IncomingPasteCard): string {
	if (card.kind !== 'url') return ''
	if (card.source.trim() !== card.url || /\s/.test(card.url)) throw new Error('Use one HTTP link for a URL card.')
	try {
		const url = new URL(card.url)
		if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error()
		return card.url
	} catch { throw new Error('Use one HTTP link for a URL card.') }
}

/** A native, editable tldraw shape. Exact source remains in shape metadata. */
export function createNativePasteCard(card: IncomingPasteCard, pageId: TLPageId): TLShapePartial<TLGeoShape> {
	if (!card.source.trim() || card.source.length > MAX_CARD_SOURCE || card.source.split(/\r?\n/).length > MAX_CARD_LINES) throw new Error('This card is empty or too large to insert.')
	const url = safeCardUrl(card)
	const monospace = card.kind === 'code' || card.kind === 'json'
	const text = cardText(card)
	const { w, h } = cardDimensions(text, monospace)
	return {
		id: createShapeId(), parentId: pageId, type: 'geo', x: 0, y: 0,
		meta: { freeformPasteCard: { version: 1, kind: card.kind, originalSource: card.source } },
		props: { geo: 'rectangle', w, h, richText: nativeCardRichText(card), font: monospace ? 'mono' : 'sans',
			align: 'start', verticalAlign: 'start', size: 's', color: 'grey', labelColor: 'black',
			fill: 'semi', dash: 'solid', url },
	}
}

function overlaps(a: Bounds, b: Bounds, gap: number): boolean {
	return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y
}

function openPosition(editor: Editor, size: { w: number; h: number }): { x: number; y: number } {
	const viewport = editor.getViewportPageBounds()
	const preferred = { x: viewport.center.x - size.w / 2, y: viewport.center.y - size.h / 2 }
	const occupied = editor.getCurrentPageShapes().flatMap((shape) => {
		const box = editor.getShapePageBounds(shape)
		return box ? [{ x: box.x, y: box.y, w: box.w, h: box.h }] : []
	})
	for (let offset = 0; offset < 24; offset++) {
		const position = { x: preferred.x, y: preferred.y + offset * (size.h + 48) }
		if (occupied.every((box) => !overlaps({ ...position, ...size }, box, 32))) return position
	}
	return { x: Math.max(preferred.x, ...occupied.map((box) => box.x + box.w + 48)), y: preferred.y }
}

/** Call only after the user accepts a reviewed proposal. Undo removes the shape. */
export function applyNativePasteCard(editor: Editor, card: IncomingPasteCard, pageId: TLPageId): TLShapeId {
	if (editor.getIsReadonly()) throw new Error('This board is read-only.')
	if (editor.getCurrentPageId() !== pageId || !editor.getPage(pageId)) throw new Error('Return to the original page before adding this card.')
	if (editor.getCurrentPageShapeIds().size >= editor.options.maxShapesPerPage) throw new Error('This board has reached its shape limit.')
	const shape = createNativePasteCard(card, pageId)
	const position = openPosition(editor, { w: shape.props!.w!, h: shape.props!.h! })
	shape.x = position.x; shape.y = position.y
	const mark = editor.markHistoryStoppingPoint('Insert pasted card')
	try {
		editor.createShape(shape)
		if (!editor.getShape(shape.id!)) throw new Error('The card could not be added. Try again.')
		editor.select(shape.id!)
	} catch (cause) { editor.bailToMark(mark); throw cause }
	editor.markHistoryStoppingPoint('Pasted card added')
	return shape.id!
}
