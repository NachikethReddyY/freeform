import { useEffect } from 'react'
import { useAssetUrls, useEditor, useValue } from 'tldraw'
import { clearBoardPreview, writeBoardPreview } from './boardPreview'
import { captureBoardPreview } from './previewCapture'

/** Mount inside Tldraw. Captures stay in this browser's IndexedDB, outside the synced document. */
export function BoardPreviewRecorder({ roomId }: { roomId: string }) {
	const editor = useEditor()
	const { fonts } = useAssetUrls()
	const pageId = useValue('preview page', () => editor.getCurrentPageId(), [editor])
	const colorMode = useValue('preview color mode', () => editor.getColorMode(), [editor])

	useEffect(() => {
		let disposed = false
		let revision = 0
		let capturing = false
		let timer: ReturnType<typeof setTimeout> | undefined

		const capture = async () => {
			if (capturing || disposed) return
			capturing = true
			const version = revision
			const startedAt = Date.now()
			const isCurrent = () => !disposed && revision === version && editor.getCurrentPageId() === pageId
			try {
				const preview = await captureBoardPreview(editor, roomId, fonts)
				if (!isCurrent()) return
				if (preview === null) await clearBoardPreview(roomId, startedAt, isCurrent)
				else if (preview) await writeBoardPreview(preview, isCurrent)
			} catch { /* Export errors must never interrupt drawing or remove a good thumbnail. */ }
			finally {
				capturing = false
				if (!disposed && revision !== version) {
					clearTimeout(timer)
					timer = setTimeout(capture, 900)
				}
			}
		}
		const schedule = () => {
			revision += 1
			clearTimeout(timer)
			timer = setTimeout(capture, 900)
		}
		const stop = editor.store.listen(schedule, { scope: 'document' })
		schedule()
		return () => {
			disposed = true
			revision += 1
			clearTimeout(timer)
			stop()
		}
	}, [editor, fonts, pageId, roomId, colorMode])

	return null
}
