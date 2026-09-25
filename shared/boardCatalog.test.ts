import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeBoardCatalogs, parseBoardCatalog } from './boardCatalog'

const collection = (title = 'My boards', updatedAt = 1) => ({ id: 'collection-default', title, createdAt: 1, updatedAt })
const board = (overrides: Record<string, unknown> = {}) => ({
	id: 'board-one', title: 'Original', collectionId: 'collection-default',
	createdAt: 1, updatedAt: 2, lastOpenedAt: 2, deletedAt: null,
	...overrides,
})

test('catalog merge preserves board IDs, collections, and Trash across separate browsers', () => {
	const saved = { boards: [board({ title: 'Saved', updatedAt: 10, deletedAt: 10 })], collections: [collection('My boards', 1)] }
	const staleBrowser = { boards: [board({ title: 'Old browser', updatedAt: 4, lastOpenedAt: 20 })], collections: [collection()] }
	const merged = mergeBoardCatalogs(saved, staleBrowser)
	assert.equal(merged.boards[0]?.title, 'Saved')
	assert.equal(merged.boards[0]?.deletedAt, 10)
	assert.equal(merged.boards[0]?.lastOpenedAt, 20)
	assert.equal(merged.boards[0]?.id, 'board-one')
	assert.deepEqual(mergeBoardCatalogs(merged, { boards: [], collections: [] }), merged)
})

test('a later restore wins over a prior deletion and a blank browser cannot rename a collection', () => {
	const saved = { boards: [board({ updatedAt: 10, deletedAt: 10 })], collections: [collection('Research', 10)] }
	const restored = { boards: [board({ updatedAt: 11, deletedAt: null, restoredAt: 11 })], collections: [collection()] }
	const merged = mergeBoardCatalogs(saved, restored)
	assert.equal(merged.boards[0]?.deletedAt, null)
	assert.equal(merged.collections[0]?.title, 'Research')
})

test('a stale browser rename after a deletion cannot resurrect Trash without an explicit restore event', () => {
	const saved = { boards: [board({ updatedAt: 10, deletedAt: 10 })], collections: [collection()] }
	const staleEdit = { boards: [board({ title: 'Edited on stale tab', updatedAt: 20, deletedAt: null })], collections: [collection()] }
	const merged = mergeBoardCatalogs(saved, staleEdit)
	assert.equal(merged.boards[0]?.title, 'Edited on stale tab')
	assert.equal(merged.boards[0]?.deletedAt, 10)
	const olderDeletion = { boards: [board({ updatedAt: 10, deletedAt: 10 })], collections: [collection()] }
	const afterRestore = mergeBoardCatalogs(merged, { boards: [board({ updatedAt: 21, deletedAt: null, restoredAt: 21 })], collections: [collection()] })
	assert.equal(mergeBoardCatalogs(afterRestore, olderDeletion).boards[0]?.deletedAt, null)
})

test('new records from each side survive a merge and ties retain the server version', () => {
	const saved = { boards: [board({ title: 'Server', updatedAt: 10 })], collections: [collection()] }
	const incoming = { boards: [board({ title: 'Browser', updatedAt: 10 }), board({ id: 'board-two' })], collections: [collection()] }
	const merged = mergeBoardCatalogs(saved, incoming)
	assert.equal(merged.boards.find((item) => item.id === 'board-one')?.title, 'Server')
	assert.ok(merged.boards.find((item) => item.id === 'board-two'))
})

test('an intentional rename back to the default collection name is retained', () => {
	const saved = { boards: [], collections: [collection('Research', 10)] }
	const renamed = { boards: [], collections: [collection('My boards', 11)] }
	assert.equal(mergeBoardCatalogs(saved, renamed).collections[0]?.title, 'My boards')
})

test('invalid incoming catalogs fail as a whole instead of deleting valid server metadata', () => {
	assert.throws(() => parseBoardCatalog({ boards: [board({ id: 'bad/id' })], collections: [collection()] }))
	assert.throws(() => parseBoardCatalog({ boards: [board(), board()], collections: [collection()] }))
	assert.throws(() => parseBoardCatalog({ boards: [board({ deletedAt: 'yesterday' })], collections: [collection()] }))
})
