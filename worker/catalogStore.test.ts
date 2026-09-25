import assert from 'node:assert/strict'
import test from 'node:test'
import { CatalogStore } from './catalogStore'
import type { AuthKv, AuthStore } from './auth'

class MemoryStore implements AuthStore {
	private readonly values = new Map<string, unknown>()
	async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined }
	async put(key: string, value: unknown): Promise<void> { this.values.set(key, value) }
	async delete(key: string): Promise<boolean> { return this.values.delete(key) }
	async list<T>(prefix: string): Promise<Map<string, T>> { return new Map([...this.values].filter(([key]) => key.startsWith(prefix)) as [string, T][]) }
	async transaction<T>(fn: (store: AuthKv) => Promise<T>): Promise<T> { return fn(this) }
}

const catalog = (updatedAt: number, deletedAt: number | null = null) => ({
	boards: [{ id: 'board-keep', title: 'Keep', collectionId: 'collection-default', createdAt: 1, updatedAt, lastOpenedAt: updatedAt, deletedAt }],
	collections: [{ id: 'collection-default', title: 'My boards', createdAt: 1, updatedAt: 1 }],
})

test('first import persists in the owner store and reload returns the same board identity', async () => {
	const db = new MemoryStore()
	const first = new CatalogStore(db)
	const imported = await first.sync(catalog(2))
	assert.equal(imported.revision, 1)
	const reloaded = await new CatalogStore(db).read()
	assert.deepEqual(reloaded, imported)
	assert.equal(reloaded.catalog.boards[0]?.id, 'board-keep')
})

test('stale import cannot resurrect a trashed board or discard new collections', async () => {
	const db = new MemoryStore()
	const store = new CatalogStore(db)
	await store.sync(catalog(2))
	await store.sync({ ...catalog(5, 5), collections: [...catalog(5).collections, { id: 'collection-new', title: 'New', createdAt: 4, updatedAt: 4 }] })
	const result = await store.sync(catalog(2))
	assert.equal(result.catalog.boards[0]?.deletedAt, 5)
	assert.equal(result.catalog.collections.length, 2)
	assert.equal(result.revision, 2)
})

test('empty browser import hydrates the existing server catalog', async () => {
	const db = new MemoryStore()
	const store = new CatalogStore(db)
	await store.sync(catalog(2))
	const hydrated = await store.sync({ boards: [], collections: [] })
	assert.equal(hydrated.catalog.boards[0]?.title, 'Keep')
	assert.equal(hydrated.revision, 1)
})
