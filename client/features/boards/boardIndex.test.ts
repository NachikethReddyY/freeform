import assert from 'node:assert/strict'
import test from 'node:test'
import {
	BOARD_INDEX_STORAGE_KEY,
	DEFAULT_COLLECTION_ID,
	DEFAULT_COLLECTION_TITLE,
	DEFAULT_BOARD_TITLE,
	LEGACY_BOARD_INDEX_STORAGE_KEY,
	LEGACY_ROOM_STORAGE_KEY,
	createLocalBoard,
	createLocalCollection,
	ensureLocalBoard,
	moveLocalBoardToCollection,
	restoreLocalBoard,
	readBoardCatalog,
	readBoardIndex,
	renameLocalCollection,
	renameLocalBoard,
	softDeleteLocalBoard,
	validateBoardTitle,
	type BoardIndexStorage,
} from './boardIndex'
import { filterBoardsByName } from './dashboardModel'

class MemoryStorage implements BoardIndexStorage {
	private values = new Map<string, string>()
	getItem(key: string) { return this.values.get(key) ?? null }
	setItem(key: string, value: string) { this.values.set(key, value) }
}

test('migrates the legacy room ID without changing its URL identity', () => {
	const storage = new MemoryStorage()
	storage.setItem(LEGACY_ROOM_STORAGE_KEY, 'test-room-legacy_1')

	const boards = readBoardIndex(storage, 100)

	assert.deepEqual(boards, [{
		id: 'test-room-legacy_1',
		title: DEFAULT_BOARD_TITLE,
		collectionId: DEFAULT_COLLECTION_ID,
		createdAt: 100,
		updatedAt: 100,
		lastOpenedAt: 100,
		deletedAt: null,
	}])
	assert.equal(JSON.parse(storage.getItem(BOARD_INDEX_STORAGE_KEY) ?? 'null').boards[0].id, boards[0].id)
})

test('migrates the previous board index into the collection-aware format without changing board IDs', () => {
	const storage = new MemoryStorage()
	storage.setItem(LEGACY_BOARD_INDEX_STORAGE_KEY, JSON.stringify([
		{ id: 'old-board-id', title: 'Old board', createdAt: 1, updatedAt: 2, lastOpenedAt: 3 },
	]))

	const catalog = readBoardCatalog(storage, 100)

	assert.deepEqual(catalog.boards.map(({ id, title, collectionId }) => ({ id, title, collectionId })), [
		{ id: 'old-board-id', title: 'Old board', collectionId: DEFAULT_COLLECTION_ID },
	])
	assert.equal(catalog.collections[0]?.title, DEFAULT_COLLECTION_TITLE)
	assert.equal(JSON.parse(storage.getItem(BOARD_INDEX_STORAGE_KEY) ?? 'null').version, 2)
})

test('keeps the legacy room in the list when other local boards already exist', () => {
	const storage = new MemoryStorage()
	storage.setItem(LEGACY_ROOM_STORAGE_KEY, 'legacy-room')
	ensureLocalBoard('direct-room', storage, { now: 200 })

	assert.deepEqual(readBoardIndex(storage, 100).map(({ id }) => id), ['direct-room', 'legacy-room'])
})

test('registers directly visited rooms and sorts the most recently opened first', () => {
	const storage = new MemoryStorage()
	const first = ensureLocalBoard('shared-room', storage, { now: 10 })
	assert.equal(first?.id, 'shared-room')
	assert.equal(first?.title, DEFAULT_BOARD_TITLE)
	assert.equal(ensureLocalBoard('bad/id', storage, { now: 20 }), undefined)
	assert.equal(ensureLocalBoard('second-room', storage, { now: 30 })?.id, 'second-room')
	assert.equal(ensureLocalBoard('shared-room', storage, { now: 40 })?.lastOpenedAt, 40)
	assert.deepEqual(readBoardIndex(storage).map(({ id }) => id), ['shared-room', 'second-room'])
	assert.equal(readBoardIndex(storage).find(({ id }) => id === 'shared-room')?.createdAt, 10)
})

test('creates stable distinct IDs and persists a trimmed title', () => {
	const storage = new MemoryStorage()
	const ids = ['board-fixed-id', 'board-fixed-id', 'board-next-id']
	const createId = () => ids.shift() ?? 'board-fallback-id'

	const first = createLocalBoard('  Planning  ', storage, { now: 1, createId })
	const second = createLocalBoard('Research', storage, { now: 2, createId })

	assert.equal(first.id, 'board-fixed-id')
	assert.equal(first.title, 'Planning')
	assert.equal(second.id, 'board-next-id')
	assert.deepEqual(readBoardIndex(storage).map(({ title }) => title), ['Research', 'Planning'])
})

test('renames an existing board and enforces non-empty titles up to 64 characters', () => {
	const storage = new MemoryStorage()
	ensureLocalBoard('named-room', storage, { now: 5 })
	const renamed = renameLocalBoard('named-room', '  My board  ', storage, 9)

	assert.equal(renamed?.title, 'My board')
	assert.equal(renamed?.updatedAt, 9)
	assert.equal(renameLocalBoard('missing-room', 'Name', storage), undefined)
	assert.throws(() => validateBoardTitle('   '), /cannot be empty/)
	assert.throws(() => validateBoardTitle('x'.repeat(65)), /64 characters/)
	assert.equal(validateBoardTitle('x'.repeat(64)).length, 64)
	assert.equal(readBoardIndex(storage)[0]?.title, 'My board')
})

test('creates and renames collections, then moves one board without moving others', () => {
	const storage = new MemoryStorage()
	const boardA = createLocalBoard('Alpha', storage, { now: 10, createId: () => 'board-alpha' })
	const boardB = createLocalBoard('Beta', storage, { now: 11, createId: () => 'board-beta' })
	const collection = createLocalCollection('  School  ', storage, { now: 20, createId: () => 'collection-school' })
	const renamed = renameLocalCollection(collection.id, 'Classes', storage, 30)
	const moved = moveLocalBoardToCollection(boardA.id, collection.id, storage, 40)
	const catalog = readBoardCatalog(storage)

	assert.equal(renamed?.title, 'Classes')
	assert.equal(renamed?.updatedAt, 30)
	assert.equal(moved?.collectionId, collection.id)
	assert.equal(catalog.boards.find(({ id }) => id === boardA.id)?.collectionId, collection.id)
	assert.equal(catalog.boards.find(({ id }) => id === boardB.id)?.collectionId, DEFAULT_COLLECTION_ID)
	assert.equal(catalog.collections.find(({ id }) => id === collection.id)?.title, 'Classes')
	assert.equal(moveLocalBoardToCollection(boardB.id, 'missing-collection', storage), undefined)
	assert.throws(() => createLocalCollection(' '.repeat(2), storage), /cannot be empty/)
})

test('dashboard name search matches board names only and is case-insensitive', () => {
	const storage = new MemoryStorage()
	createLocalBoard('Chemistry notes', storage, { now: 1, createId: () => 'chem-board' })
	createLocalBoard('Physics plan', storage, { now: 2, createId: () => 'physics-board' })

	assert.deepEqual(filterBoardsByName(readBoardIndex(storage), 'CHEM').map(({ id }) => id), ['chem-board'])
	assert.deepEqual(filterBoardsByName(readBoardIndex(storage), 'not there'), [])
})

test('ignores malformed and duplicate index entries without losing valid boards', () => {
	const storage = new MemoryStorage()
	storage.setItem(BOARD_INDEX_STORAGE_KEY, JSON.stringify([
		{ id: 'good-room', title: 'Good', createdAt: 1, updatedAt: 2, lastOpenedAt: 3 },
		{ id: 'bad/room', title: 'Bad', createdAt: 1, updatedAt: 2, lastOpenedAt: 3 },
		{ id: 'good-room', title: 'Duplicate', createdAt: 4, updatedAt: 4, lastOpenedAt: 4 },
		{ id: 'empty-title', title: '   ', createdAt: 1, updatedAt: 2, lastOpenedAt: 3 },
	]))

	assert.deepEqual(readBoardIndex(storage), [{ id: 'good-room', title: 'Good', collectionId: DEFAULT_COLLECTION_ID, createdAt: 1, updatedAt: 2, lastOpenedAt: 3, deletedAt: null }])
})

test('soft-deletes a board into recoverable Trash and restores it after catalog reload', () => {
	const storage = new MemoryStorage()
	const board = createLocalBoard('Recover me', storage, { now: 10, createId: () => 'board-recover-me' })
	const deleted = softDeleteLocalBoard(board.id, storage, 20)

	assert.equal(deleted?.deletedAt, 20)
	assert.deepEqual(readBoardIndex(storage).map(({ id }) => id), [])
	assert.equal(readBoardCatalog(storage).boards[0]?.deletedAt, 20)
	assert.equal(ensureLocalBoard(board.id, storage, { now: 30 })?.deletedAt, 20)
	assert.deepEqual(readBoardIndex(storage).map(({ id }) => id), [])

	const restored = restoreLocalBoard(board.id, storage, 40)
	assert.equal(restored?.deletedAt, null)
	assert.deepEqual(readBoardIndex(storage).map(({ id }) => id), [board.id])
	assert.equal(readBoardCatalog(storage).boards[0]?.title, 'Recover me')
})

test('falls back to an in-memory board index when browser storage is denied', () => {
	const deniedStorage: BoardIndexStorage = {
		getItem() { throw new Error('storage blocked') },
		setItem() { throw new Error('storage blocked') },
	}

	assert.equal(ensureLocalBoard('private-room', deniedStorage, { now: 50 })?.id, 'private-room')
	assert.equal(readBoardIndex(deniedStorage, 60)[0]?.id, 'private-room')
})
