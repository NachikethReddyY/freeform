import { renderPlaintextFromRichText, type Editor, type TLPageId, type TLShape, type TLShapeId } from 'tldraw'

export type SearchableShapeKind = 'text' | 'geo' | 'note' | 'arrow'

export interface BoardSearchResult {
	shapeId: TLShapeId
	pageId: TLPageId
	pageName: string
	kind: SearchableShapeKind
	snippet: string
}

/** Arrow-key movement for the search combobox; -1 means there is no active result. */
export function nextSearchResultIndex(current: number, count: number, direction: 'up' | 'down'): number {
	if (count <= 0) return -1
	return (current + (direction === 'down' ? 1 : -1) + count) % count
}

function labelOf(editor: Editor, shape: TLShape): string {
	switch (shape.type) {
	case 'text':
	case 'geo':
	case 'note':
	case 'arrow':
		return renderPlaintextFromRichText(editor, shape.props.richText)
	default:
		return ''
	}
}

function snippetFor(label: string, term: string): string {
	const oneLine = label.replace(/\s+/g, ' ').trim()
	if (oneLine.length <= 92) return oneLine
	const match = oneLine.toLocaleLowerCase().indexOf(term.toLocaleLowerCase())
	const start = Math.max(0, Math.min(match - 28, oneLine.length - 92))
	const end = Math.min(oneLine.length, start + 92)
	return `${start ? '…' : ''}${oneLine.slice(start, end).trim()}${end < oneLine.length ? '…' : ''}`
}

/** Read the native document, including shapes nested inside frames, without changing the board. */
export function findBoardText(editor: Editor, query: string, limit = 100): BoardSearchResult[] {
	const term = query.trim().replace(/\s+/g, ' ')
	if (!term || limit <= 0) return []
	const lowerTerm = term.toLocaleLowerCase()
	const results: BoardSearchResult[] = []
	for (const page of editor.getPages()) {
		for (const shapeId of editor.getPageShapeIds(page.id)) {
			const shape = editor.getShape(shapeId)
			if (!shape) continue
			const label = labelOf(editor, shape)
			if (!label.replace(/\s+/g, ' ').toLocaleLowerCase().includes(lowerTerm)) continue
			results.push({ shapeId, pageId: page.id, pageName: page.name, kind: shape.type as SearchableShapeKind, snippet: snippetFor(label, term) })
			if (results.length >= limit) return results
		}
	}
	return results
}

/** Jump using only session state; a stale result is ignored. */
export function jumpToBoardSearchResult(editor: Editor, result: BoardSearchResult): boolean {
	if (!editor.getPages().some((page) => page.id === result.pageId)) return false
	if (!editor.getPageShapeIds(result.pageId).has(result.shapeId)) return false
	if (!editor.getShape(result.shapeId)) return false
	if (editor.getCurrentPageId() !== result.pageId) editor.setCurrentPage(result.pageId)
	editor.setCurrentTool('select')
	editor.select(result.shapeId)
	const bounds = editor.getShapePageBounds(result.shapeId)
	if (bounds) editor.zoomToBounds(bounds, { inset: 96, targetZoom: 1, animation: { duration: 160 } })
	return true
}
