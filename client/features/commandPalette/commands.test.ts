import assert from 'node:assert/strict'
import test from 'node:test'
import { availableCommandDefinitions, commandDefinitions, filterCommands, isPaletteShortcut, moveActiveIndex } from './commands'

test('palette includes requested native tools and zoom actions without duplicate IDs', () => {
	const ids = commandDefinitions.map((item) => item.id)
	assert.equal(new Set(ids).size, ids.length)
	for (const id of ['select', 'hand', 'draw', 'eraser', 'arrow', 'text', 'rectangle', 'ellipse', 'note', 'line', 'diamond', 'frame', 'laser', 'zoom-in', 'zoom-out', 'zoom-to-fit', 'zoom-to-100']) assert.ok(ids.includes(id))
})

test('search matches names and useful aliases, including multiword queries', () => {
	const commands = [{ id: 'note', label: 'Note', keywords: 'sticky memo' }, { id: 'zoom-to-100', label: 'Reset zoom', keywords: '100 percent' }, { id: 'draw', label: 'Draw', keywords: 'pen pencil freehand' }]
	assert.deepEqual(filterCommands(commands, ' STICKY ').map((command) => command.id), ['note'])
	assert.deepEqual(filterCommands(commands, 'zoom 100').map((command) => command.id), ['zoom-to-100'])
	assert.equal(filterCommands(commands, 'not available').length, 0)
	assert.equal(filterCommands(commands, '').length, commands.length)
})

test('arrange diagram is searchable only when a diagram can be laid out', () => {
	const unavailable = availableCommandDefinitions(false)
	const available = availableCommandDefinitions(true)
	assert.equal(filterCommands(unavailable, 'auto layout').length, 0)
	assert.deepEqual(filterCommands(available, 'auto layout').map((command) => command.id), ['arrange-diagram', 'arrange-vertical', 'arrange-compact'])
	assert.equal(unavailable.length + 3, available.length)
	assert.deepEqual(unavailable.map((command) => command.id), available.filter((command) => !['arrange-diagram', 'arrange-vertical', 'arrange-compact'].includes(command.id)).map((command) => command.id))
})

test('vertical and tree arrangement follow selection eligibility', () => {
	assert.equal(filterCommands(availableCommandDefinitions(false), 'arrange vertical').length, 0)
	assert.deepEqual(filterCommands(availableCommandDefinitions(true, false, false, false), 'arrange vertical').map((command) => command.id), ['arrange-vertical'])
	assert.equal(filterCommands(availableCommandDefinitions(true, false, false, false), 'arrange tree').length, 0)
	assert.deepEqual(filterCommands(availableCommandDefinitions(true, false, false, true), 'arrange tree').map((command) => command.id), ['arrange-tree'])
})

test('radial arrangement follows its own bounded eligibility', () => {
	assert.equal(filterCommands(availableCommandDefinitions(true, false, false, false, false), 'arrange radial').length, 0)
	assert.deepEqual(filterCommands(availableCommandDefinitions(true, false, false, false, true), 'arrange radial').map((command) => command.id), ['arrange-radial'])
})

test('connected node directions appear only for an eligible selected node', () => {
	const disconnected = availableCommandDefinitions(false, false)
	const connected = availableCommandDefinitions(false, true)
	assert.deepEqual(filterCommands(disconnected, 'connect node').map((command) => command.id), [])
	assert.deepEqual(filterCommands(connected, 'connect node').map((command) => command.id), [
		'connect-up', 'connect-right', 'connect-down', 'connect-left',
	])
	assert.deepEqual(filterCommands(connected, 'connect below').map((command) => command.id), ['connect-down'])
	assert.equal(connected.length, disconnected.length + 4)
})

test('create node can start a keyboard-only diagram on an editable board', () => {
	assert.equal(filterCommands(availableCommandDefinitions(false, false, false), 'create node').length, 0)
	assert.ok(filterCommands(availableCommandDefinitions(false, false, true), 'create node').some((command) => command.id === 'create-node'))
	assert.deepEqual(filterCommands(availableCommandDefinitions(false, false, true), 'create database').map((command) => command.id), ['create-database'])
})

test('keyboard selection wraps and the palette chord preserves native K and modified K', () => {
	assert.equal(moveActiveIndex(0, -1, 3), 2)
	assert.equal(moveActiveIndex(2, 1, 3), 0)
	assert.equal(moveActiveIndex(0, 1, 0), 0)
	const plain = { key: 'k', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false }
	assert.equal(isPaletteShortcut(plain), false)
	assert.equal(isPaletteShortcut({ ...plain, metaKey: true }), true)
	assert.equal(isPaletteShortcut({ ...plain, ctrlKey: true }), true)
	assert.equal(isPaletteShortcut({ ...plain, metaKey: true, shiftKey: true }), false)
	assert.equal(isPaletteShortcut({ ...plain, metaKey: true, repeat: true }), false)
})
