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
	{ id: 'toggle-focus-mode', kind: 'action', label: 'Focus mode', keywords: 'hide panels distraction free canvas' },
	{ id: 'arrange-diagram', kind: 'custom', label: 'Arrange diagram', keywords: 'auto layout flowchart connected nodes' },
	{ id: 'arrange-vertical', kind: 'custom', label: 'Arrange vertical', keywords: 'auto layout top bottom diagram' },
	{ id: 'arrange-tree', kind: 'custom', label: 'Arrange tree', keywords: 'auto layout branches hierarchy diagram' },
	{ id: 'arrange-radial', kind: 'custom', label: 'Arrange radial', keywords: 'circle mind map connected nodes' },
	{ id: 'arrange-compact', kind: 'custom', label: 'Arrange compact', keywords: 'auto layout dense flowchart connected nodes' },
	{ id: 'create-node', kind: 'custom', label: 'Create node', keywords: 'create node rectangle box diagram keyboard' },
	{ id: 'create-api', kind: 'custom', label: 'Create API', keywords: 'create api endpoint developer node' },
	{ id: 'create-database', kind: 'custom', label: 'Create database', keywords: 'create database sql data node' },
	{ id: 'create-service', kind: 'custom', label: 'Create service', keywords: 'create service server node' },
	{ id: 'create-queue', kind: 'custom', label: 'Create queue', keywords: 'create queue jobs events node' },
	{ id: 'create-function', kind: 'custom', label: 'Create function', keywords: 'create function code node' },
	{ id: 'create-cloud', kind: 'custom', label: 'Create cloud', keywords: 'create cloud provider node' },
	{ id: 'connect-up', kind: 'custom', label: 'Connect node above', keywords: 'connect node above up diagram' },
	{ id: 'connect-right', kind: 'custom', label: 'Connect node right', keywords: 'connect node right diagram' },
	{ id: 'connect-down', kind: 'custom', label: 'Connect node below', keywords: 'connect node below down diagram' },
	{ id: 'connect-left', kind: 'custom', label: 'Connect node left', keywords: 'connect node left diagram' },
]

export function availableCommandDefinitions(canArrangeDiagram: boolean, canConnectNode = false, canCreateNode = false, canArrangeTree = false, canArrangeRadial = false): CommandDefinition[] {
	return commandDefinitions.filter((definition) => {
		if (definition.id === 'arrange-diagram' || definition.id === 'arrange-vertical' || definition.id === 'arrange-compact') return canArrangeDiagram
		if (definition.id === 'arrange-tree') return canArrangeTree
		if (definition.id === 'arrange-radial') return canArrangeRadial
		if (definition.id.startsWith('create-')) return canCreateNode
		if (definition.id.startsWith('connect-')) return canConnectNode
		return true
	})
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
