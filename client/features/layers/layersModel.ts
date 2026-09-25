import { renderPlaintextFromRichText, type Editor, type TLShape, type TLShapeId } from 'tldraw'

export interface LayerItem {
	id: TLShapeId
	type: TLShape['type']
	label: string
	children: LayerItem[]
}

function firstLine(value: string): string {
	const line = value.trim().split(/\r?\n/, 1)[0]?.replace(/\s+/g, ' ').trim() ?? ''
	return line.length > 64 ? `${line.slice(0, 63)}…` : line
}

function typeName(type: string): string {
	return type.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/** A short, recognizable row name, including text embedded in native shapes. */
export function layerLabel(editor: Editor, shape: TLShape): string {
	switch (shape.type) {
	case 'frame': return firstLine(shape.props.name) || 'Frame'
	case 'group': return 'Group'
	case 'geo':
	case 'text':
	case 'note':
	case 'arrow': {
		const label = firstLine(renderPlaintextFromRichText(editor, shape.props.richText))
		return label || (shape.type === 'geo' ? typeName(shape.props.geo) : typeName(shape.type))
	}
	case 'image': return firstLine(shape.props.altText) || 'Image'
	case 'bookmark': {
		try { return firstLine(new URL(shape.props.url).hostname.replace(/^www\./, '')) || 'Bookmark' }
		catch { return 'Bookmark' }
	}
	default: return typeName(shape.type)
	}
}

function isDiagramAnchor(shape: TLShape): boolean {
	return shape.meta.freeformRole === 'anchor'
		|| shape.meta.role === 'anchor'
		|| (shape.type === 'geo' && shape.opacity === 0 && typeof shape.meta.diagramProposal === 'string')
}

/** Read native parent IDs/indexes; frontmost sibling first, without adding board records. */
export function buildLayerTree(editor: Editor): LayerItem[] {
	const visit = (parentId: ReturnType<Editor['getCurrentPageId']> | TLShapeId): LayerItem[] =>
		editor.getSortedChildIdsForParent(parentId).slice().reverse().flatMap((id) => {
			const shape = editor.getShape(id)
			if (!shape || isDiagramAnchor(shape)) return []
			return [{ id, type: shape.type, label: layerLabel(editor, shape), children: visit(id) }]
		})
	return visit(editor.getCurrentPageId())
}

/** Session-only navigation: native selection and camera, no shape mutation. */
export function selectLayer(editor: Editor, shapeId: TLShapeId): boolean {
	if (!editor.getCurrentPageShapeIds().has(shapeId)) return false
	const bounds = editor.getShapePageBounds(shapeId)
	if (!bounds) return false
	editor.setCurrentTool('select')
	editor.select(shapeId)
	editor.centerOnPoint(bounds.center)
	return true
}
