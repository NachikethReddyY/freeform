import { classifyPaste } from './classifyPaste'
import { diagramFromClipboard, type ClipboardTextData } from './diagramPaste'

export type IncomingPasteCard =
	| { kind: 'markdown'; title: string; source: string; preview: string }
	| { kind: 'code'; title: string; language?: string; source: string; preview: string }
	| { kind: 'json'; title: string; source: string; preview: string }
	| { kind: 'url'; title: string; url: string; source: string; preview: string }

export const MAX_CARD_SOURCE = 8_000
export const MAX_CARD_LINES = 240
const MAX_URL_SOURCE = 2_048
const CODE_LANGUAGES: Record<string, string> = {
	js: 'JavaScript', javascript: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript',
	py: 'Python', python: 'Python', sh: 'Shell', bash: 'Shell', sql: 'SQL', html: 'HTML', css: 'CSS',
	json: 'JSON', yaml: 'YAML', yml: 'YAML', go: 'Go', rs: 'Rust', rust: 'Rust', java: 'Java',
}

function fencedCode(source: string): { language?: string; body: string } | null {
	const match = /^```([\w+-]*)[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```$/.exec(source)
	return match ? { language: match[1].toLowerCase() || undefined, body: match[2] } : null
}

function compactLine(source: string): string {
	return source.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 96) ?? ''
}

function jsonPreview(value: unknown): string {
	if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'item' : 'items'}`
	if (value && typeof value === 'object') {
		const keys = Object.keys(value)
		return keys.length ? keys.slice(0, 3).join(' · ') : 'Empty object'
	}
	return ''
}

function jsonCard(source: string, content: string): IncomingPasteCard | null {
	if (!/^[\[{]/.test(content)) return null
	try {
		const value: unknown = JSON.parse(content)
		if (!value || typeof value !== 'object') return null
		return { kind: 'json', title: 'JSON', source, preview: jsonPreview(value) }
	} catch { return null }
}

function codeCard(source: string, body: string, language?: string): IncomingPasteCard {
	return {
		kind: 'code', title: language ? CODE_LANGUAGES[language] ?? language.toUpperCase() : 'Code',
		...(language ? { language } : {}), source, preview: compactLine(body),
	}
}

/**
 * A paste proposal only. The caller must show a review action before creating a card.
 * Native clipboard data and all existing diagram routes take precedence.
 */
export function cardFromClipboard(data: ClipboardTextData | null): IncomingPasteCard | null {
	if (!data || data.files.length || Array.from(data.items).some((item) => item.kind === 'file')) return null
	const source = data.getData('text/plain')
	const plainTextOnly = data.types.length === 1 && data.types[0] === 'text/plain'
	const matchingUriList = data.types.length === 2 && data.types.includes('text/plain')
		&& data.types.includes('text/uri-list') && data.getData('text/uri-list').trim() === source.trim()
	if (!plainTextOnly && !matchingUriList) return null
	if (!source.trim() || source.length > MAX_CARD_SOURCE || source.split(/\r?\n/).length > MAX_CARD_LINES) return null
	if (diagramFromClipboard(data)) return null
	const classification = classifyPaste(source, { types: data.types })
	if (matchingUriList && classification.kind !== 'url') return null

	const trimmed = source.trim()
	const fenced = fencedCode(trimmed)
	const json = jsonCard(source, (fenced?.language === 'json' ? fenced.body : trimmed).trim())
	if (json) return json
	if (fenced) return codeCard(source, fenced.body, fenced.language)
	switch (classification.kind) {
		case 'markdown': {
			const heading = /^#{1,6}\s+(.+)$/m.exec(trimmed)
			const title = heading?.[1].trim().slice(0, 80) || 'Markdown'
			return { kind: 'markdown', title, source, preview: heading ? title : compactLine(trimmed) }
		}
		case 'code': return codeCard(source, trimmed)
		case 'url': {
			if (trimmed.length > MAX_URL_SOURCE) return null
			const url = new URL(trimmed)
			if (url.username || url.password) return null
			return { kind: 'url', title: url.hostname, url: trimmed, source, preview: url.pathname || '/' }
		}
		default: return null
	}
}
