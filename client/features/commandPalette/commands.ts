export interface CommandDefinition { id: string; kind: 'tool' | 'action' | 'custom'; label: string; keywords: string }

export const commandDefinitions: readonly CommandDefinition[] = [
	{ id: 'select', kind: 'tool', label: 'Select', keywords: 'pointer cursor' },
	{ id: 'hand', kind: 'tool', label: 'Hand', keywords: 'pan move canvas' },
	{ id: 'draw', kind: 'tool', label: 'Draw', keywords: 'pen pencil freehand sketch' },
	{ id: 'eraser', kind: 'tool', label: 'Eraser', keywords: 'erase remove' },
	{ id: 'arrow', kind: 'tool', label: 'Arrow', keywords: 'connect' },
	{ id: 'text', kind: 'tool', label: 'Text', keywords: 'write label' },
	{ id: 'rectangle', kind: 'tool', label: 'Rectangle', keywords: 'box shape' },
	{ id: 'ellipse', kind: 'tool', label: 'Ellipse', keywords: 'circle oval shape' },
	{ id: 'note', kind: 'tool', label: 'Note', keywords: 'sticky memo' },
	{ id: 'line', kind: 'tool', label: 'Line', keywords: 'segment' },
	{ id: 'diamond', kind: 'tool', label: 'Diamond', keywords: 'decision shape' },
	{ id: 'frame', kind: 'tool', label: 'Frame', keywords: 'container presentation' },
	{ id: 'laser', kind: 'tool', label: 'Laser', keywords: 'pointer highlight' },
	{ id: 'zoom-in', kind: 'action', label: 'Zoom in', keywords: 'enlarge' },
	{ id: 'zoom-out', kind: 'action', label: 'Zoom out', keywords: 'shrink' },
	{ id: 'zoom-to-fit', kind: 'action', label: 'Zoom to fit', keywords: 'all shapes' },
	{ id: 'zoom-to-selection', kind: 'action', label: 'Zoom to selection', keywords: 'selected shapes' },
	{ id: 'zoom-to-100', kind: 'action', label: 'Reset zoom', keywords: '100 percent actual size' },
	{ id: 'arrange-diagram', kind: 'custom', label: 'Arrange diagram', keywords: 'auto layout flowchart connected nodes' },
]

export function availableCommandDefinitions(canArrangeDiagram: boolean): CommandDefinition[] {
	return commandDefinitions.filter((definition) => definition.id !== 'arrange-diagram' || canArrangeDiagram)
}

export function filterCommands<T extends { label: string; keywords: string }>(commands: readonly T[], query: string): T[] {
	const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
	return commands.filter((command) => words.every((word) => `${command.label} ${command.keywords}`.toLowerCase().includes(word)))
}

export function moveActiveIndex(index: number, delta: number, count: number): number {
	return count === 0 ? 0 : (index + delta + count) % count
}

export function isPaletteShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'repeat' | 'isComposing'>): boolean {
	return event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && !event.repeat && !event.isComposing
}
