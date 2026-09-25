export type PasteKind = 'native' | 'mermaid' | 'sql' | 'openapi' | 'arrow-chain' | 'markdown' | 'code' | 'url' | 'text'

export interface PasteClassification {
	kind: PasteKind
	/** Exact clipboard text, including original whitespace and fences. */
	source: string
}

export interface PasteOptions {
	hasFiles?: boolean
	types?: readonly string[]
}

function unwrappedCode(source: string): { language: string; body: string } | undefined {
	const match = /^```([\w+-]*)\s*\n([\s\S]*?)\n```$/i.exec(source)
	return match ? { language: match[1].toLowerCase(), body: match[2] } : undefined
}

function isOpenApiJson(source: string): boolean {
	if (source.length > 256_000) return false
	const content = unwrappedCode(source)?.body ?? source
	if (!content.startsWith('{') || !content.includes('"openapi"')) return false
	try {
		const value: unknown = JSON.parse(content)
		return typeof value === 'object' && value !== null && !Array.isArray(value)
			&& 'openapi' in value && typeof value.openapi === 'string' && /^3\.\d+\.\d+/.test(value.openapi)
			&& 'info' in value && typeof value.info === 'object' && value.info !== null
			&& 'paths' in value && typeof value.paths === 'object' && value.paths !== null && !Array.isArray(value.paths)
	} catch { return false }
}

function isArrowChain(source: string): boolean {
	if (source.includes('\n') || source.includes('-->') || source.length > 400 || !/(?:->|→)/.test(source)) return false
	const parts = source.split(/\s*(?:->|→)\s*/)
	return parts.length >= 2 && parts.length <= 10 && parts.every((part) => part.length > 0 && part.length <= 80 && /^[\w][\w .:/()#+-]*[\w)]$|^[\w]$/.test(part))
}

function isMarkdown(source: string): boolean {
	if (/^(?:#{1,6}\s+\S|>\s+\S|\s*[-*+]\s+\[[ xX]\]\s+\S)/m.test(source)) return true
	if (/^\s*[-*+]\s+\S.*\n\s*[-*+]\s+\S/m.test(source)) return true
	return /^\s*\|[^\n]+\|\s*\n\s*\|\s*:?-{3,}/m.test(source)
}

function isCode(source: string): boolean {
	if (unwrappedCode(source)) return true
	if (/^[\[{]/.test(source)) {
		try { JSON.parse(source); return true }
		catch { /* An opening bracket in prose is not enough. */ }
	}
	return /^(?:import\s+.+\s+from\s+['"]|export\s+(?:default|const|function|class)\b|(?:async\s+)?function\s+\w+\s*\(|(?:const|let|var)\s+\w+\s*=|class\s+\w+\s*\{|def\s+\w+\s*\(|SELECT\s+.+\s+FROM\s+\w+)/im.test(source)
}

function isUrl(source: string): boolean {
	if (/\s/.test(source)) return false
	try {
		const url = new URL(source)
		return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname)
	} catch { return false }
}

/** One conservative pass; callers choose a preview/action and native paste remains untouched. */
export function classifyPaste(text: string, options: PasteOptions = {}): PasteClassification {
	const source = text
	if (options.hasFiles || options.types?.some((type) => type === 'Files' || type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/')) || !source.trim()) {
		return { kind: 'native', source }
	}
	const trimmed = source.trim()
	const fenced = unwrappedCode(trimmed)
	if ((fenced?.language === 'mermaid' && /^(?:flowchart|graph)\s+(?:LR|RL|TD|TB|BT)\b/i.test(fenced.body.trim())) || /^(?:flowchart|graph)\s+(?:LR|RL|TD|TB|BT)\b/i.test(trimmed)) return { kind: 'mermaid', source }
	if ((fenced?.language === 'sql' || !fenced) && /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["`\[]?[\w]+["`\]]?\.)?["`\[]?[\w]+["`\]]?\s*\(/i.test((fenced?.body ?? trimmed).trim())) return { kind: 'sql', source }
	if (isOpenApiJson(trimmed)) return { kind: 'openapi', source }
	if (isArrowChain(trimmed)) return { kind: 'arrow-chain', source }
	if (isMarkdown(trimmed)) return { kind: 'markdown', source }
	if (isCode(trimmed)) return { kind: 'code', source }
	if (isUrl(trimmed)) return { kind: 'url', source }
	return { kind: 'text', source }
}
