export const MAX_BOARD_PREVIEW_BYTES = 256 * 1024
export const MAX_BOARD_PREVIEW_SIZE = 480

const DATABASE_NAME = 'freeform-board-previews'
const STORE_NAME = 'previews'
const CHANNEL_NAME = 'freeform:board-previews'
const ROOM_ID = /^[a-zA-Z0-9_-]{1,128}$/

export interface BoardPreview {
	roomId: string
	pageId: string
	blob: Blob
	width: number
	height: number
	updatedAt: number
}

function getStoredTimestamp(value: unknown): number {
	if (!value || typeof value !== 'object' || !('updatedAt' in value)) return -1
	return typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : -1
}

export function isBoardPreview(value: unknown, roomId?: string): value is BoardPreview {
	if (!value || typeof value !== 'object') return false
	const item = value as Partial<BoardPreview>
	return typeof item.roomId === 'string' && ROOM_ID.test(item.roomId)
		&& (roomId === undefined || item.roomId === roomId)
		&& typeof item.pageId === 'string' && /^page:.{1,128}$/.test(item.pageId)
		&& item.blob instanceof Blob && item.blob.type === 'image/png'
		&& item.blob.size > 0 && item.blob.size <= MAX_BOARD_PREVIEW_BYTES
		&& typeof item.width === 'number' && Number.isFinite(item.width)
		&& item.width > 0 && item.width <= MAX_BOARD_PREVIEW_SIZE
		&& typeof item.height === 'number' && Number.isFinite(item.height)
		&& item.height > 0 && item.height <= MAX_BOARD_PREVIEW_SIZE
		&& typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) && item.updatedAt >= 0
}

function openDatabase(): Promise<IDBDatabase | null> {
	if (typeof indexedDB === 'undefined') return Promise.resolve(null)
	return new Promise((resolve) => {
		let finished = false
		const finish = (database: IDBDatabase | null) => {
			if (finished) { database?.close(); return }
			finished = true
			clearTimeout(timeout)
			resolve(database)
		}
		const timeout = setTimeout(() => finish(null), 3000)
		try {
			const request = indexedDB.open(DATABASE_NAME, 1)
			request.onupgradeneeded = () => {
				if (!request.result.objectStoreNames.contains(STORE_NAME)) {
					request.result.createObjectStore(STORE_NAME, { keyPath: 'roomId' })
				}
			}
			request.onsuccess = () => finish(request.result)
			request.onerror = () => finish(null)
			request.onblocked = () => finish(null)
		} catch { finish(null) }
	})
}

/** Local to this browser origin. Storage errors do not affect the board. */
export async function readBoardPreview(roomId: string): Promise<BoardPreview | null> {
	if (!ROOM_ID.test(roomId)) return null
	const database = await openDatabase()
	if (!database) return null
	return new Promise((resolve) => {
		try {
			const transaction = database.transaction(STORE_NAME, 'readonly')
			const request = transaction.objectStore(STORE_NAME).get(roomId)
			request.onsuccess = () => resolve(isBoardPreview(request.result, roomId) ? request.result : null)
			request.onerror = () => resolve(null)
			transaction.oncomplete = () => database.close()
			transaction.onabort = () => { database.close(); resolve(null) }
		} catch { database.close(); resolve(null) }
	})
}

type Listener = () => void
const listeners = new Map<string, Set<Listener>>()
let channel: BroadcastChannel | null = null

function emit(roomId: string) {
	listeners.get(roomId)?.forEach((listener) => listener())
}

function announce(roomId: string) {
	emit(roomId)
	if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return
	try {
		const sender = channel ?? new BroadcastChannel(CHANNEL_NAME)
		sender.postMessage(roomId)
		if (sender !== channel) sender.close()
	} catch { /* The thumbnail is still readable if cross-tab messages are unavailable. */ }
}

export function subscribeBoardPreview(roomId: string, listener: Listener) {
	const roomListeners = listeners.get(roomId) ?? new Set<Listener>()
	roomListeners.add(listener)
	listeners.set(roomId, roomListeners)
	if (!channel && typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
		try {
			channel = new BroadcastChannel(CHANNEL_NAME)
			channel.onmessage = ({ data }: MessageEvent<unknown>) => {
				if (typeof data === 'string' && ROOM_ID.test(data)) emit(data)
			}
		} catch { /* Same-tab notifications remain available. */ }
	}
	return () => {
		roomListeners.delete(listener)
		if (roomListeners.size === 0) listeners.delete(roomId)
		if (listeners.size === 0) { channel?.close(); channel = null }
	}
}

async function updatePreview(
	roomId: string,
	preview: BoardPreview | null,
	updatedAt: number,
	isCurrent: () => boolean,
) {
	if (!ROOM_ID.test(roomId) || !isCurrent()) return false
	const database = await openDatabase()
	if (!database) return false
	return new Promise<boolean>((resolve) => {
		let changed = false
		try {
			const transaction = database.transaction(STORE_NAME, 'readwrite')
			const store = transaction.objectStore(STORE_NAME)
			const request = store.get(roomId)
			request.onsuccess = () => {
				if (!isCurrent()) return
				const previous: unknown = request.result
				// A slow export from another tab cannot replace a newer thumbnail.
				if (getStoredTimestamp(previous) > updatedAt) return
				if (preview) store.put(preview)
				// Keep the timestamp so an older in-flight export cannot resurrect a cleared image.
				else store.put({ roomId, updatedAt, blank: true })
				changed = true
			}
			transaction.oncomplete = () => {
				database.close()
				if (changed) announce(roomId)
				resolve(changed)
			}
			transaction.onabort = () => { database.close(); resolve(false) }
			transaction.onerror = () => { /* onabort handles quota and storage failures. */ }
		} catch { database.close(); resolve(false) }
	})
}

export function writeBoardPreview(preview: BoardPreview, isCurrent: () => boolean = () => true) {
	if (!isBoardPreview(preview)) return Promise.resolve(false)
	return updatePreview(preview.roomId, preview, preview.updatedAt, isCurrent)
}

export function clearBoardPreview(roomId: string, updatedAt = Date.now(), isCurrent: () => boolean = () => true) {
	return updatePreview(roomId, null, updatedAt, isCurrent)
}
