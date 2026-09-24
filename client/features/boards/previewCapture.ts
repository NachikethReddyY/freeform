import type { Editor, TLShape } from 'tldraw'
import { MAX_BOARD_PREVIEW_SIZE, type BoardPreview } from './boardPreview'

export const PREVIEW_PADDING = 16

export function getPreviewScale(width: number, height: number): number | null {
	if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) return null
	return Math.min(1, MAX_BOARD_PREVIEW_SIZE / (Math.max(width, height) + PREVIEW_PADDING * 2))
}

export function isLocalPreviewUrl(value: string, origin: string): boolean {
	if (!value || value.startsWith('tldraw_')) return false
	if (/^data:(?:image\/(?:png|jpeg|webp|gif|svg\+xml)|font\/[a-z0-9.+-]+|application\/(?:font-woff|octet-stream));/i.test(value)) return true
	try {
		const url = new URL(value, origin)
		return ['http:', 'https:', 'blob:'].includes(url.protocol) && url.origin === origin
	} catch { return false }
}

function canExportLocally(editor: Editor, shapes: TLShape[], origin: string, fontUrls: Record<string, string | undefined>) {
	for (const shape of shapes) {
		if (shape.type === 'bookmark' || shape.type === 'embed') return false
		for (const font of editor.fonts.getShapeFontFaces(shape)) {
			if (!isLocalPreviewUrl(fontUrls[font.src.url] ?? font.src.url, origin)) return false
		}
		if (shape.type === 'image' || shape.type === 'video') {
			const asset = shape.props.assetId ? editor.getAsset(shape.props.assetId) : undefined
			if (!asset || asset.type === 'bookmark' || !asset.props.src || !isLocalPreviewUrl(asset.props.src, origin)) return false
		}
	}
	return true
}

/** Returns null for a blank page; unsupported/failed exports leave the last good preview intact. */
export async function captureBoardPreview(editor: Editor, roomId: string, fontUrls: Record<string, string | undefined> = {}): Promise<BoardPreview | null | undefined> {
	const pageId = editor.getCurrentPageId()
	const shapes = editor.getCurrentPageShapes()
	if (shapes.length === 0) return null
	if (!canExportLocally(editor, shapes, window.location.origin, fontUrls)) return undefined
	const bounds = shapes.map((shape) => editor.getShapePageBounds(shape)).filter((box) => box !== undefined)
	if (bounds.length === 0) return undefined
	const left = Math.min(...bounds.map((box) => box.x))
	const top = Math.min(...bounds.map((box) => box.y))
	const right = Math.max(...bounds.map((box) => box.maxX))
	const bottom = Math.max(...bounds.map((box) => box.maxY))
	const scale = getPreviewScale(right - left, bottom - top)
	if (scale === null) return undefined
	const updatedAt = Date.now()
	const image = await editor.toImage(shapes, {
		format: 'png',
		pixelRatio: 1,
		scale,
		padding: PREVIEW_PADDING,
		background: true,
		darkMode: editor.getColorMode() === 'dark',
	})
	return { roomId, pageId, ...image, updatedAt }
}
