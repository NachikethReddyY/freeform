export interface CatalogBoard {
	id: string
	title: string
	collectionId: string
	createdAt: number
	updatedAt: number
	lastOpenedAt: number
	deletedAt: number | null
	restoredAt?: number
}

export interface CatalogCollection {
	id: string
	title: string
	createdAt: number
	updatedAt: number
}

export interface BoardCatalog {
	boards: CatalogBoard[]
	collections: CatalogCollection[]
}

const MAX_RECORDS = 10_000
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/
const DEFAULT_COLLECTION_ID = 'collection-default'

function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid board catalog')
	return value as Record<string, unknown>
}

function id(value: unknown): string {
	if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new Error('Invalid catalog ID')
	return value
}

function title(value: unknown): string {
	if (typeof value !== 'string' || !value.trim() || value.trim().length > 64) throw new Error('Invalid catalog title')
	return value.trim()
}

function time(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid catalog timestamp')
	return value
}

function uniqueIds<T extends { id: string }>(items: T[]): T[] {
	if (new Set(items.map(({ id }) => id)).size !== items.length) throw new Error('Duplicate catalog ID')
	return items
}

/** Reject a malformed import as a whole; a partial parse could erase recoverable metadata. */
export function parseBoardCatalog(value: unknown): BoardCatalog {
	const input = object(value)
	if (!Array.isArray(input.boards) || !Array.isArray(input.collections)
		|| input.boards.length > MAX_RECORDS || input.collections.length > MAX_RECORDS) throw new Error('Invalid board catalog')
	const collections = uniqueIds(input.collections.map((raw): CatalogCollection => {
		const item = object(raw)
		return { id: id(item.id), title: title(item.title), createdAt: time(item.createdAt), updatedAt: time(item.updatedAt) }
	}))
	const collectionIds = new Set(collections.map(({ id }) => id))
	const boards = uniqueIds(input.boards.map((raw): CatalogBoard => {
		const item = object(raw)
		const collectionId = id(item.collectionId)
		if (!collectionIds.has(collectionId)) throw new Error('Board references a missing collection')
		return {
			id: id(item.id), title: title(item.title), collectionId,
			createdAt: time(item.createdAt), updatedAt: time(item.updatedAt),
			lastOpenedAt: time(item.lastOpenedAt), deletedAt: item.deletedAt === null ? null : time(item.deletedAt),
			...(item.restoredAt === undefined || item.restoredAt === null ? {} : { restoredAt: time(item.restoredAt) }),
		}
	}))
	return { boards, collections }
}

function choose<T extends { id: string; updatedAt: number }>(saved: T, incoming: T): T {
	return incoming.updatedAt > saved.updatedAt ? incoming : saved
}

/** Merge additive catalog records. A later restore beats an earlier tombstone, but stale snapshots cannot resurrect Trash. */
export function mergeBoardCatalogs(saved: BoardCatalog, incoming: BoardCatalog): BoardCatalog {
	const collections = new Map(saved.collections.map((collection) => [collection.id, collection]))
	for (const next of incoming.collections) {
		const prior = collections.get(next.id)
		if (!prior) { collections.set(next.id, next); continue }
		const selected = choose(prior, next)
		collections.set(next.id, { ...selected, createdAt: Math.min(prior.createdAt, next.createdAt) })
	}
	const boards = new Map(saved.boards.map((board) => [board.id, board]))
	for (const next of incoming.boards) {
		const prior = boards.get(next.id)
		if (!prior) { boards.set(next.id, next); continue }
		const selected = choose(prior, next)
		const latestDelete = Math.max(prior.deletedAt ?? -1, next.deletedAt ?? -1)
		const latestRestore = Math.max(prior.restoredAt ?? -1, next.restoredAt ?? -1)
		boards.set(next.id, {
			...selected,
			createdAt: Math.min(prior.createdAt, next.createdAt),
			lastOpenedAt: Math.max(prior.lastOpenedAt, next.lastOpenedAt),
			deletedAt: latestRestore > latestDelete || latestDelete < 0 ? null : latestDelete,
			...(latestRestore < 0 ? {} : { restoredAt: latestRestore }),
		})
	}
	const validCollections = new Set(collections.keys())
	return {
		boards: [...boards.values()].map((board) => validCollections.has(board.collectionId) ? board : { ...board, collectionId: DEFAULT_COLLECTION_ID })
			.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id)),
		collections: [...collections.values()].sort((a, b) => a.createdAt - b.createdAt || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)),
	}
}
