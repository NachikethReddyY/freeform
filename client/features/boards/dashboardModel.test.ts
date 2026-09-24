import assert from 'node:assert/strict'
import test from 'node:test'
import { createLocalBoard, readBoardIndex, restoreLocalBoard, softDeleteLocalBoard, type BoardIndexStorage } from './boardIndex'
import { openBoardFromDashboard } from './dashboardModel'

class MemoryStorage implements BoardIndexStorage {
	private values = new Map<string, string>()
	getItem(key: string) { return this.values.get(key) ?? null }
	setItem(key: string, value: string) { this.values.set(key, value) }
}

test('opening a trashed board restores its name and collection before navigation', () => {
	const storage = new MemoryStorage()
	const board = createLocalBoard('Recoverable title', storage, { now: 1, createId: () => 'board-recoverable' })
	const deleted = softDeleteLocalBoard(board.id, storage, 2)
	assert.ok(deleted)
	const visited: string[] = []

	const opened = openBoardFromDashboard(deleted, (id) => restoreLocalBoard(id, storage, 3), (path) => {
		assert.equal(readBoardIndex(storage)[0]?.title, 'Recoverable title')
		visited.push(path)
	})

	assert.equal(opened, true)
	assert.deepEqual(visited, [`/${board.id}`])
	assert.equal(readBoardIndex(storage)[0]?.collectionId, board.collectionId)
})

test('a failed restore does not navigate to a deleted board', () => {
	const storage = new MemoryStorage()
	const board = createLocalBoard('Lost board', storage, { now: 1, createId: () => 'board-lost' })
	const deleted = softDeleteLocalBoard(board.id, storage, 2)
	assert.ok(deleted)
	const visited: string[] = []

	const opened = openBoardFromDashboard(deleted, () => undefined, (path) => visited.push(path))

	assert.equal(opened, false)
	assert.deepEqual(visited, [])
	assert.deepEqual(readBoardIndex(storage), [])
})

test('opening an active board leaves its deletion state unchanged', () => {
	const storage = new MemoryStorage()
	const board = createLocalBoard('Active title', storage, { now: 1, createId: () => 'board-active' })
	const visited: string[] = []
	let restoreCalls = 0

	const opened = openBoardFromDashboard(board, () => {
		restoreCalls++
		return undefined
	}, (path) => visited.push(path))

	assert.equal(opened, true)
	assert.equal(restoreCalls, 0)
	assert.deepEqual(visited, [`/${board.id}`])
	assert.equal(readBoardIndex(storage)[0]?.deletedAt, null)
})
