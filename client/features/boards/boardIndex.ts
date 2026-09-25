import { useCallback, useEffect, useState } from 'react'
import { mergeBoardCatalogs, parseBoardCatalog, type BoardCatalog } from '../../../shared/boardCatalog'

export const BOARD_INDEX_STORAGE_KEY = 'freeform:board-index:v2'
export const LEGACY_BOARD_INDEX_STORAGE_KEY = 'freeform:board-index:v1'
export const LEGACY_ROOM_STORAGE_KEY = 'my-local-room-id'
export const DEFAULT_BOARD_TITLE = 'Untitled board'
export const DEFAULT_COLLECTION_ID = 'collection-default'
export const DEFAULT_COLLECTION_TITLE = 'My boards'
export const MAX_BOARD_TITLE_LENGTH = 64

export interface LocalBoard {
	id: string
	title: string
	collectionId: string
	createdAt: number
	updatedAt: number
	lastOpenedAt: number
	deletedAt: number | null
	restoredAt?: number
}

export interface LocalBoardCollection {
	id: string
	title: string
	createdAt: number
	updatedAt: number
}

export interface LocalBoardCatalog {
	boards: LocalBoard[]
	collections: LocalBoardCollection[]
}

export interface BoardIndexStorage {
	getItem(key: string): string | null
	setItem(key: string, value: string): void
}

export interface UseBoardIndexResult extends LocalBoardCatalog {
	trashBoards: LocalBoard[]
	syncStatus: 'saving' | 'saved' | 'unavailable'
	createBoard(title?: string, collectionId?: string): LocalBoard
	renameBoard(id: string, title: string): LocalBoard | undefined
	ensureBoard(id: string): LocalBoard | undefined
	createCollection(title?: string): LocalBoardCollection
	renameCollection(id: string, title: string): LocalBoardCollection | undefined
	moveBoard(boardId: string, collectionId: string): LocalBoard | undefined
	deleteBoard(id: string): LocalBoard | undefined
	restoreBoard(id: string): LocalBoard | undefined
}

const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/
const memory = new Map<string, string>()
let browserStorageUnavailable = false
const failedStorages = new WeakSet<object>()
const CATALOG_SYNC_EVENT = 'freeform:board-catalog-synced'
let syncQueue: Promise<unknown> = Promise.resolve()
let catalogSyncStatus: UseBoardIndexResult['syncStatus'] = 'saving'

function publishCatalogSyncStatus(status: UseBoardIndexResult['syncStatus']): void {
	catalogSyncStatus = status
	globalThis.dispatchEvent?.(new Event(CATALOG_SYNC_EVENT))
}

const memoryStorage: BoardIndexStorage = {
	getItem(key) { return memory.get(key) ?? null },
	setItem(key, value) { memory.set(key, value) },
}

function defaultStorage(): BoardIndexStorage {
	if (browserStorageUnavailable) return memoryStorage
	try {
		return globalThis.localStorage
	} catch {
		browserStorageUnavailable = true
		return memoryStorage
	}
}

function readValue(storage: BoardIndexStorage, key: string): string | null {
	if (failedStorages.has(storage)) return memoryStorage.getItem(key)
	try {
		return storage.getItem(key)
	} catch {
		failedStorages.add(storage)
		return memoryStorage.getItem(key)
	}
}

function writeValue(storage: BoardIndexStorage, key: string, value: string): void {
	if (failedStorages.has(storage)) {
		memoryStorage.setItem(key, value)
		return
	}
	try {
		storage.setItem(key, value)
	} catch {
		failedStorages.add(storage)
		memoryStorage.setItem(key, value)
	}
}

export function validateBoardTitle(title: string): string {
	const cleanTitle = title.trim()
	if (!cleanTitle) throw new RangeError('Board title cannot be empty')
	if (cleanTitle.length > MAX_BOARD_TITLE_LENGTH) throw new RangeError(`Board title must be ${MAX_BOARD_TITLE_LENGTH} characters or fewer`)
	return cleanTitle
}

export function validateCollectionTitle(title: string): string {
	return validateBoardTitle(title)
}

function isRoomId(id: string): boolean {
	return ROOM_ID_PATTERN.test(id)
}

function isCollectionId(id: string): boolean {
	return ROOM_ID_PATTERN.test(id)
}

function parseBoard(value: unknown): LocalBoard | undefined {
	if (!value || typeof value !== 'object') return undefined
	const candidate = value as Partial<LocalBoard>
	if (typeof candidate.id !== 'string' || !isRoomId(candidate.id)) return undefined
	if (typeof candidate.title !== 'string') return undefined
	let title: string
	try {
		title = validateBoardTitle(candidate.title)
	} catch {
		return undefined
	}
	if (!Number.isFinite(candidate.createdAt) || !Number.isFinite(candidate.updatedAt)) return undefined
	const lastOpenedAt = Number.isFinite(candidate.lastOpenedAt) ? candidate.lastOpenedAt as number : candidate.updatedAt as number
	const deletedAt = candidate.deletedAt === null || candidate.deletedAt === undefined
		? null
		: Number.isFinite(candidate.deletedAt) ? candidate.deletedAt as number : null
	return {
		id: candidate.id,
		title,
		collectionId: typeof candidate.collectionId === 'string' && isCollectionId(candidate.collectionId) ? candidate.collectionId : DEFAULT_COLLECTION_ID,
		createdAt: candidate.createdAt as number,
		updatedAt: candidate.updatedAt as number,
		lastOpenedAt,
		deletedAt,
		...(Number.isFinite(candidate.restoredAt) ? { restoredAt: candidate.restoredAt as number } : {}),
	}
}

function parseCollection(value: unknown): LocalBoardCollection | undefined {
	if (!value || typeof value !== 'object') return undefined
	const candidate = value as Partial<LocalBoardCollection>
	if (typeof candidate.id !== 'string' || !isCollectionId(candidate.id) || typeof candidate.title !== 'string') return undefined
	let title: string
	try {
		title = validateCollectionTitle(candidate.title)
	} catch {
		return undefined
	}
	if (!Number.isFinite(candidate.createdAt) || !Number.isFinite(candidate.updatedAt)) return undefined
	return { id: candidate.id, title, createdAt: candidate.createdAt as number, updatedAt: candidate.updatedAt as number }
}

function orderBoards(boards: LocalBoard[]): LocalBoard[] {
	return [...boards].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id))
}

function orderCollections(collections: LocalBoardCollection[]): LocalBoardCollection[] {
	return [...collections].sort((a, b) => a.createdAt - b.createdAt || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
}

function defaultCollection(now: number): LocalBoardCollection {
	// A synthesized collection must not overwrite an existing user rename during migration.
	return { id: DEFAULT_COLLECTION_ID, title: DEFAULT_COLLECTION_TITLE, createdAt: now, updatedAt: 0 }
}

function parseCatalog(raw: string, now: number): LocalBoardCatalog | undefined {
	try {
		const parsed: unknown = JSON.parse(raw)
		if (Array.isArray(parsed)) {
			const boards = parsed.map(parseBoard).filter((board): board is LocalBoard => Boolean(board)).map((board) => ({ ...board, collectionId: DEFAULT_COLLECTION_ID }))
			return { boards: orderBoards(dedupeById(boards)), collections: [defaultCollection(now)] }
		}
		if (!parsed || typeof parsed !== 'object') return undefined
		const value = parsed as { version?: unknown; boards?: unknown; collections?: unknown }
		if (value.version !== 2 || !Array.isArray(value.boards) || !Array.isArray(value.collections)) return undefined
		const collections = dedupeById(value.collections.map(parseCollection).filter((collection): collection is LocalBoardCollection => Boolean(collection)))
		if (!collections.length) collections.push(defaultCollection(now))
		const validCollectionIds = new Set(collections.map(({ id }) => id))
		const boards = dedupeById(value.boards.map(parseBoard).filter((board): board is LocalBoard => Boolean(board)).map((board) => ({
			...board,
			collectionId: validCollectionIds.has(board.collectionId) ? board.collectionId : DEFAULT_COLLECTION_ID,
		})))
		if (!validCollectionIds.has(DEFAULT_COLLECTION_ID) && boards.some(({ collectionId }) => collectionId === DEFAULT_COLLECTION_ID)) collections.push(defaultCollection(now))
		return { boards: orderBoards(boards), collections: orderCollections(collections) }
	} catch {
		return undefined
	}
}

function dedupeById<T extends { id: string }>(values: T[]): T[] {
	const seen = new Set<string>()
	return values.filter((value) => {
		if (seen.has(value.id)) return false
		seen.add(value.id)
		return true
	})
}

function persistCatalog(storage: BoardIndexStorage, catalog: LocalBoardCatalog): void {
	writeValue(storage, BOARD_INDEX_STORAGE_KEY, JSON.stringify({
		version: 2,
		boards: orderBoards(catalog.boards),
		collections: orderCollections(catalog.collections),
	}))
}

function isFreshEmptyCatalog(catalog: LocalBoardCatalog): boolean {
	return catalog.boards.length === 0 && catalog.collections.length === 1
		&& catalog.collections[0].id === DEFAULT_COLLECTION_ID && catalog.collections[0].title === DEFAULT_COLLECTION_TITLE
		&& catalog.collections[0].updatedAt === 0
}

/** Migrate and reconcile the browser cache with the signed-in owner's SQLite-backed catalog. */
export async function synchronizeBoardCatalog(
	storage: BoardIndexStorage = defaultStorage(),
	fetcher: typeof fetch = fetch,
	now = Date.now(),
): Promise<LocalBoardCatalog> {
	let catalog = readBoardCatalog(storage, now)
	for (let attempt = 0; attempt < 3; attempt++) {
		const outgoing: BoardCatalog = isFreshEmptyCatalog(catalog) ? { boards: [], collections: [] } : catalog
		const response = await fetcher('/api/catalog/sync', {
			method: 'POST', credentials: 'same-origin', cache: 'no-store',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ catalog: outgoing }),
		})
		if (!response.ok) throw new Error(`Could not save board catalog (${response.status})`)
		const body: unknown = await response.json()
		if (!body || typeof body !== 'object' || !('catalog' in body)) throw new Error('Invalid board catalog response')
		const remote = parseBoardCatalog(body.catalog)
		const current = readBoardCatalog(storage, now)
		catalog = isFreshEmptyCatalog(current) ? remote : mergeBoardCatalogs(remote, current)
		if (!catalog.collections.length) catalog.collections = [defaultCollection(now)]
		persistCatalog(storage, catalog)
		globalThis.dispatchEvent?.(new Event(CATALOG_SYNC_EVENT))
		if (isFreshEmptyCatalog(catalog) && remote.boards.length === 0 && remote.collections.length === 0) return catalog
		if (JSON.stringify(catalog) === JSON.stringify(remote)) return catalog
	}
	return catalog
}

function queueBoardCatalogSync(): Promise<unknown> {
	publishCatalogSyncStatus('saving')
	syncQueue = syncQueue.catch(() => undefined).then(() => synchronizeBoardCatalog()).then(
		() => publishCatalogSyncStatus('saved'),
		(cause: unknown) => {
			// The browser cache remains intact and the next navigation or mutation retries sync.
			console.warn('Board catalog sync is pending', cause instanceof Error ? cause.message : cause)
			publishCatalogSyncStatus('unavailable')
		},
	)
	return syncQueue
}

/** Read the local catalog, migrating old board arrays and the original single-room setting. */
export function readBoardCatalog(storage: BoardIndexStorage = defaultStorage(), now = Date.now()): LocalBoardCatalog {
	const currentRaw = readValue(storage, BOARD_INDEX_STORAGE_KEY)
	let catalog = currentRaw ? parseCatalog(currentRaw, now) : undefined
	let migrated = false
	if (!catalog) {
		const oldRaw = readValue(storage, LEGACY_BOARD_INDEX_STORAGE_KEY)
		catalog = oldRaw ? parseCatalog(oldRaw, now) : undefined
		migrated = Boolean(catalog)
	}
	if (!catalog) {
		catalog = { boards: [], collections: [defaultCollection(now)] }
		migrated = true
	}

	if (!catalog.collections.length) catalog.collections = [defaultCollection(now)]
	const defaultIds = new Set(catalog.collections.map(({ id }) => id))
	const legacyRoomId = readValue(storage, LEGACY_ROOM_STORAGE_KEY)
	if (legacyRoomId && isRoomId(legacyRoomId) && !catalog.boards.some(({ id }) => id === legacyRoomId)) {
		catalog.boards.push({
			id: legacyRoomId,
			title: DEFAULT_BOARD_TITLE,
			collectionId: defaultIds.has(DEFAULT_COLLECTION_ID) ? DEFAULT_COLLECTION_ID : catalog.collections[0].id,
			createdAt: now,
			updatedAt: now,
			lastOpenedAt: now,
			deletedAt: null,
		})
		migrated = true
	}

	if (migrated || currentRaw === null) persistCatalog(storage, catalog)
	return { boards: orderBoards(catalog.boards), collections: orderCollections(catalog.collections) }
}

/** Backward-compatible board-only read helper. */
export function readBoardIndex(storage: BoardIndexStorage = defaultStorage(), now = Date.now()): LocalBoard[] {
	return readBoardCatalog(storage, now).boards.filter((board) => board.deletedAt === null)
}

function generateRoomId(prefix: 'board' | 'collection'): string {
	const randomId = globalThis.crypto?.randomUUID?.()
	if (randomId) return `${prefix}-${randomId}`
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
}

export function createLocalBoard(
	title = DEFAULT_BOARD_TITLE,
	storage: BoardIndexStorage = defaultStorage(),
	options: { now?: number; createId?: () => string; collectionId?: string } = {},
): LocalBoard {
	const catalog = readBoardCatalog(storage, options.now)
	const createId = options.createId ?? (() => generateRoomId('board'))
	let id = createId()
	for (let attempt = 0; catalog.boards.some((board) => board.id === id) && attempt < 4; attempt++) id = createId()
	if (!isRoomId(id) || catalog.boards.some((board) => board.id === id)) throw new Error('Could not create a unique valid board ID')
	if (options.collectionId && !catalog.collections.some((collection) => collection.id === options.collectionId)) {
		throw new RangeError('Choose an existing collection for the new board')
	}
	const collectionId = options.collectionId ?? catalog.collections[0]?.id ?? DEFAULT_COLLECTION_ID
	const now = options.now ?? Date.now()
	const board = { id, title: validateBoardTitle(title), collectionId, createdAt: now, updatedAt: now, lastOpenedAt: now, deletedAt: null }
	persistCatalog(storage, { ...catalog, boards: [board, ...catalog.boards] })
	return board
}

export function ensureLocalBoard(
	id: string,
	storage: BoardIndexStorage = defaultStorage(),
	options: { now?: number; title?: string; collectionId?: string } = {},
): LocalBoard | undefined {
	if (!isRoomId(id)) return undefined
	const catalog = readBoardCatalog(storage, options.now)
	const now = options.now ?? Date.now()
	const existing = catalog.boards.find((board) => board.id === id)
	const collectionId = options.collectionId && catalog.collections.some((collection) => collection.id === options.collectionId)
		? options.collectionId
		: catalog.collections[0]?.id ?? DEFAULT_COLLECTION_ID
	const board = existing
		? { ...existing, lastOpenedAt: Math.max(now, existing.lastOpenedAt + 1) }
		: { id, title: options.title ? validateBoardTitle(options.title) : DEFAULT_BOARD_TITLE, collectionId, createdAt: now, updatedAt: now, lastOpenedAt: now, deletedAt: null }
	persistCatalog(storage, { ...catalog, boards: existing ? catalog.boards.map((item) => item.id === id ? board : item) : [board, ...catalog.boards] })
	return board
}

export function renameLocalBoard(
	id: string,
	title: string,
	storage: BoardIndexStorage = defaultStorage(),
	now = Date.now(),
): LocalBoard | undefined {
	const catalog = readBoardCatalog(storage, now)
	const existing = catalog.boards.find((board) => board.id === id)
	if (!existing) return undefined
	const renamed = { ...existing, title: validateBoardTitle(title), updatedAt: Math.max(now, existing.updatedAt + 1) }
	persistCatalog(storage, { ...catalog, boards: catalog.boards.map((board) => board.id === id ? renamed : board) })
	return renamed
}

function defaultNewCollectionTitle(collections: LocalBoardCollection[]): string {
	let number = collections.length + 1
	while (collections.some(({ title }) => title.toLowerCase() === `collection ${number}`.toLowerCase())) number++
	return `Collection ${number}`
}

export function createLocalCollection(
	title: string | undefined = undefined,
	storage: BoardIndexStorage = defaultStorage(),
	options: { now?: number; createId?: () => string } = {},
): LocalBoardCollection {
	const catalog = readBoardCatalog(storage, options.now)
	const createId = options.createId ?? (() => generateRoomId('collection'))
	let id = createId()
	for (let attempt = 0; catalog.collections.some((collection) => collection.id === id) && attempt < 4; attempt++) id = createId()
	if (!isCollectionId(id) || catalog.collections.some((collection) => collection.id === id)) throw new Error('Could not create a unique valid collection ID')
	const now = options.now ?? Date.now()
	const collection = { id, title: validateCollectionTitle(title ?? defaultNewCollectionTitle(catalog.collections)), createdAt: now, updatedAt: now }
	persistCatalog(storage, { ...catalog, collections: [...catalog.collections, collection] })
	return collection
}

export function renameLocalCollection(
	id: string,
	title: string,
	storage: BoardIndexStorage = defaultStorage(),
	now = Date.now(),
): LocalBoardCollection | undefined {
	const catalog = readBoardCatalog(storage, now)
	const existing = catalog.collections.find((collection) => collection.id === id)
	if (!existing) return undefined
	const renamed = { ...existing, title: validateCollectionTitle(title), updatedAt: Math.max(now, existing.updatedAt + 1) }
	persistCatalog(storage, { ...catalog, collections: catalog.collections.map((collection) => collection.id === id ? renamed : collection) })
	return renamed
}

export function moveLocalBoardToCollection(
	boardId: string,
	collectionId: string,
	storage: BoardIndexStorage = defaultStorage(),
	now = Date.now(),
): LocalBoard | undefined {
	const catalog = readBoardCatalog(storage, now)
	const existing = catalog.boards.find((board) => board.id === boardId)
	if (!existing || !catalog.collections.some((collection) => collection.id === collectionId)) return undefined
	const moved = { ...existing, collectionId, updatedAt: Math.max(now, existing.updatedAt + 1) }
	persistCatalog(storage, { ...catalog, boards: catalog.boards.map((board) => board.id === boardId ? moved : board) })
	return moved
}

/** Move a board into the recoverable local Trash without touching its room data. */
export function softDeleteLocalBoard(
	id: string,
	storage: BoardIndexStorage = defaultStorage(),
	now = Date.now(),
): LocalBoard | undefined {
	const catalog = readBoardCatalog(storage, now)
	const existing = catalog.boards.find((board) => board.id === id)
	if (!existing) return undefined
	const deletedAt = Math.max(now, existing.updatedAt + 1)
	const deleted = { ...existing, deletedAt, updatedAt: deletedAt }
	persistCatalog(storage, { ...catalog, boards: catalog.boards.map((board) => board.id === id ? deleted : board) })
	return deleted
}

export function restoreLocalBoard(
	id: string,
	storage: BoardIndexStorage = defaultStorage(),
	now = Date.now(),
): LocalBoard | undefined {
	const catalog = readBoardCatalog(storage, now)
	const existing = catalog.boards.find((board) => board.id === id)
	if (!existing) return undefined
	const restoredAt = Math.max(now, existing.updatedAt + 1)
	const restored = { ...existing, deletedAt: null, restoredAt, updatedAt: restoredAt }
	persistCatalog(storage, { ...catalog, boards: catalog.boards.map((board) => board.id === id ? restored : board) })
	return restored
}

/** Local-first API for board identity and dashboard collection controls. */
export function useBoardIndex(roomId?: string | null): UseBoardIndexResult {
	const [catalog, setCatalog] = useState(() => readBoardCatalog())
	const [syncStatus, setSyncStatus] = useState(() => catalogSyncStatus)

	const refresh = useCallback(() => {
		setCatalog(readBoardCatalog())
		setSyncStatus(catalogSyncStatus)
	}, [])
	useEffect(() => {
		let active = true
		void queueBoardCatalogSync().then(() => {
			if (!active || !roomId) return
			ensureLocalBoard(roomId)
			refresh()
			void queueBoardCatalogSync()
		})
		const onStorage = (event: StorageEvent) => {
			if (!event.key || event.key === BOARD_INDEX_STORAGE_KEY || event.key === LEGACY_BOARD_INDEX_STORAGE_KEY) {
				refresh()
				void queueBoardCatalogSync()
			}
		}
		const retryIfNeeded = () => {
			if (catalogSyncStatus === 'unavailable') void queueBoardCatalogSync()
		}
		const onVisible = () => { if (document.visibilityState === 'visible') retryIfNeeded() }
		const retryTimer = globalThis.setInterval?.(retryIfNeeded, 30_000)
		globalThis.addEventListener?.('storage', onStorage)
		globalThis.addEventListener?.('online', retryIfNeeded)
		globalThis.addEventListener?.('visibilitychange', onVisible)
		globalThis.addEventListener?.(CATALOG_SYNC_EVENT, refresh)
		return () => {
			active = false
			globalThis.clearInterval?.(retryTimer)
			globalThis.removeEventListener?.('storage', onStorage)
			globalThis.removeEventListener?.('online', retryIfNeeded)
			globalThis.removeEventListener?.('visibilitychange', onVisible)
			globalThis.removeEventListener?.(CATALOG_SYNC_EVENT, refresh)
		}
	}, [roomId, refresh])

	const createBoard = useCallback((title = DEFAULT_BOARD_TITLE, collectionId?: string) => {
		const board = createLocalBoard(title, defaultStorage(), { collectionId })
		refresh()
		void queueBoardCatalogSync()
		return board
	}, [refresh])
	const renameBoard = useCallback((id: string, title: string) => {
		const board = renameLocalBoard(id, title)
		refresh()
		void queueBoardCatalogSync()
		return board
	}, [refresh])
	const ensureBoard = useCallback((id: string) => {
		const board = ensureLocalBoard(id)
		refresh()
		void queueBoardCatalogSync()
		return board
	}, [refresh])
	const createCollection = useCallback((title?: string) => {
		const collection = createLocalCollection(title)
		refresh()
		void queueBoardCatalogSync()
		return collection
	}, [refresh])
	const renameCollection = useCallback((id: string, title: string) => {
		const collection = renameLocalCollection(id, title)
		refresh()
		void queueBoardCatalogSync()
		return collection
	}, [refresh])
	const moveBoard = useCallback((boardId: string, collectionId: string) => {
		const board = moveLocalBoardToCollection(boardId, collectionId)
		refresh()
		void queueBoardCatalogSync()
		return board
	}, [refresh])
	const deleteBoard = useCallback((id: string) => {
		const board = softDeleteLocalBoard(id)
		refresh()
		void queueBoardCatalogSync()
		return board
	}, [refresh])
	const restoreBoard = useCallback((id: string) => {
		const board = restoreLocalBoard(id)
		refresh()
		void queueBoardCatalogSync()
		return board
	}, [refresh])

	return {
		boards: catalog.boards.filter((board) => board.deletedAt === null),
		collections: catalog.collections,
		trashBoards: catalog.boards.filter((board) => board.deletedAt !== null),
		syncStatus,
		createBoard,
		renameBoard,
		ensureBoard,
		createCollection,
		renameCollection,
		moveBoard,
		deleteBoard,
		restoreBoard,
	}
}
