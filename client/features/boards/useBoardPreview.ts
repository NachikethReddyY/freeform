import { useEffect, useState } from 'react'
import { readBoardPreview, subscribeBoardPreview } from './boardPreview'

export interface BoardPreviewState {
	url: string | null
	loading: boolean
	updatedAt: number | null
}

/** Owns the object URL; callers render it but must not persist or revoke it. */
export function useBoardPreview(roomId: string): BoardPreviewState {
	const [state, setState] = useState<BoardPreviewState & { roomId: string }>({ roomId, url: null, loading: true, updatedAt: null })

	useEffect(() => {
		let disposed = false
		let revision = 0
		let currentUrl: string | null = null
		const refresh = async () => {
			const version = ++revision
			const preview = await readBoardPreview(roomId)
			if (disposed || version !== revision) return
			const url = preview ? URL.createObjectURL(preview.blob) : null
			if (currentUrl) URL.revokeObjectURL(currentUrl)
			currentUrl = url
			setState({ roomId, url, loading: false, updatedAt: preview?.updatedAt ?? null })
		}
		const unsubscribe = subscribeBoardPreview(roomId, refresh)
		void refresh()
		return () => {
			disposed = true
			unsubscribe()
			if (currentUrl) URL.revokeObjectURL(currentUrl)
		}
	}, [roomId])

	return state.roomId === roomId ? state : { url: null, loading: true, updatedAt: null }
}
