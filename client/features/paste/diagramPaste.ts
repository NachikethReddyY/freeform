import { classifyPaste } from './classifyPaste'

export interface ClipboardTextData {
	types: readonly string[]
	files: { length: number }
	items: ArrayLike<{ kind: string }>
	getData(format: string): string
}

export interface IncomingPasteDiagram {
	format: 'mermaid' | 'openapi' | 'sql'
	source: string
}

function arrowChainToMermaid(source: string): string {
	const labels = source.trim().split(/\s*(?:->|→)\s*/)
	return `flowchart LR\n${labels.map((label, index) => `N${index + 1}["${label}"]`).join(' --> ')}`
}

/** Return only clipboard content that can safely use the diagram review UI. */
export function diagramFromClipboard(data: ClipboardTextData | null): IncomingPasteDiagram | null {
	if (!data || data.files.length || Array.from(data.items).some((item) => item.kind === 'file')) return null
	if (!data.types.includes('text/plain') || data.types.some((type) => !['text/plain', 'text/html'].includes(type))) return null
	const html = data.types.includes('text/html') ? data.getData('text/html') : ''
	if (/<div\b[^>]*\bdata-tldraw\b/i.test(html)) return null
	const classification = classifyPaste(data.getData('text/plain'), { types: data.types })
	switch (classification.kind) {
		case 'mermaid':
		case 'sql':
		case 'openapi': return { format: classification.kind, source: classification.source }
		case 'arrow-chain': return { format: 'mermaid', source: arrowChainToMermaid(classification.source) }
		default: return null
	}
}
