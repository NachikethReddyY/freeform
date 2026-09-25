import type { TLRichText } from 'tldraw'
import type { IncomingPasteCard } from './cardPaste'

export type CardInline = { text: string; mark?: 'bold' | 'italic' | 'code' | 'link'; href?: string }
export type CardBlock =
	| { kind: 'heading'; level: number; content: CardInline[] }
	| { kind: 'paragraph' | 'quote'; content: CardInline[] }
	| { kind: 'list'; ordered: boolean; items: CardInline[][] }
	| { kind: 'code'; language?: string; text: string }

const INLINE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_|`([^`\n]+)`/g

export function safeHttpUrl(value: string): string | null {
	try {
		const url = new URL(value)
		return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname && !url.username && !url.password ? value : null
	} catch { return null }
}

export function parseCardInline(input: string): CardInline[] {
	const result: CardInline[] = []
	let cursor = 0
	for (const match of input.matchAll(INLINE)) {
		const index = match.index
		if (index > cursor) result.push({ text: input.slice(cursor, index) })
		if (match[1] && match[2]) {
			const href = safeHttpUrl(match[2])
			result.push(href ? { text: match[1], mark: 'link', href } : { text: match[0] })
		} else if (match[3] || match[4]) result.push({ text: match[3] ?? match[4], mark: 'bold' })
		else if (match[5] || match[6]) result.push({ text: match[5] ?? match[6], mark: 'italic' })
		else if (match[7]) result.push({ text: match[7], mark: 'code' })
		cursor = index + match[0].length
	}
	if (cursor < input.length) result.push({ text: input.slice(cursor) })
	return result
}

/** Conservative CommonMark subset. Unsupported constructs remain literal and editable. */
export function parseCardMarkdown(source: string): CardBlock[] {
	const lines = source.split(/\r?\n/)
	const blocks: CardBlock[] = []
	let index = 0
	while (index < lines.length) {
		const line = lines[index]
		if (!line.trim()) { index++; continue }
		const fence = /^```([\w+-]*)\s*$/.exec(line.trim())
		if (fence) {
			const body: string[] = []
			index++
			while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) body.push(lines[index++])
			if (index < lines.length) index++
			blocks.push({ kind: 'code', language: fence[1] || undefined, text: body.join('\n') })
			continue
		}
		const heading = /^(#{1,6})\s+(.+)$/.exec(line)
		if (heading) {
			blocks.push({ kind: 'heading', level: heading[1].length, content: parseCardInline(heading[2]) })
			index++; continue
		}
		const list = /^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/.exec(line)
		if (list) {
			const ordered = Boolean(list[2])
			const items: CardInline[][] = []
			while (index < lines.length) {
				const item = /^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/.exec(lines[index])
				if (!item || Boolean(item[2]) !== ordered) break
				const check = /^\[([ xX])\]\s+/.exec(item[3])
				items.push(parseCardInline(check ? `${check[1].toLowerCase() === 'x' ? '☑' : '☐'} ${item[3].slice(check[0].length)}` : item[3]))
				index++
			}
			blocks.push({ kind: 'list', ordered, items })
			continue
		}
		if (/^>\s?/.test(line)) {
			const quote: string[] = []
			while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ''))
			blocks.push({ kind: 'quote', content: parseCardInline(quote.join(' ')) })
			continue
		}
		const paragraph: string[] = []
		while (index < lines.length && lines[index].trim() && !/^(?:#{1,6}\s|```|>|\s*(?:[-*+]\s|\d+[.)]\s))/.test(lines[index])) paragraph.push(lines[index++])
		if (!paragraph.length) paragraph.push(lines[index++])
		blocks.push({ kind: 'paragraph', content: parseCardInline(paragraph.join(' ')) })
	}
	return blocks
}

export function codeCardBody(card: Extract<IncomingPasteCard, { kind: 'code' }>): string {
	const trimmed = card.source.trim()
	const fence = /^```[\w+-]*[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed)
	return fence ? fence[1] : card.source
}

export function jsonCardBody(card: Extract<IncomingPasteCard, { kind: 'json' }>): string {
	try {
		const trimmed = card.source.trim().replace(/^```json\s*\n/i, '').replace(/\n```$/, '')
		return JSON.stringify(JSON.parse(trimmed), null, 2)
	} catch { return card.source }
}

function nativePlainInline(content: CardInline[]): unknown[] {
	const text = content.map((part) => part.text).join('')
	return text ? [{ type: 'text', text }] : []
}

function nativeParagraph(text: string): unknown {
	return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }
}

/** Only tldraw's default TipTap nodes; the document survives native .tldr import. */
export function nativeCardRichText(card: IncomingPasteCard): TLRichText {
	if (card.kind === 'markdown') {
		const content = parseCardMarkdown(card.source).flatMap((block): unknown[] => {
			if (block.kind === 'heading') return [{ type: 'heading', attrs: { level: block.level }, content: nativePlainInline(block.content) }]
			// Geo labels do not lay out TipTap list markers reliably at small shape sizes.
			// Editable paragraphs with visible markers keep the canvas readable in Safari.
			if (block.kind === 'list') return block.items.map((item, index) => ({
				type: 'paragraph', content: nativePlainInline([{ text: block.ordered ? `${index + 1}. ` : '• ' }, ...item]),
			}))
			if (block.kind === 'code') return [nativeParagraph(block.language || 'Code'), ...block.text.split('\n').map((line) => nativeParagraph(line))]
			if (block.kind === 'quote') return [{ type: 'paragraph', content: nativePlainInline([{ text: '❯ ' }, ...block.content]) }]
			return [{ type: 'paragraph', content: nativePlainInline(block.content) }]
		})
		return { type: 'doc', content: content.length ? content : [nativeParagraph('')] }
	}
	if (card.kind === 'url') {
		return { type: 'doc', content: [nativeParagraph(card.title), nativeParagraph(card.url)] }
	}
	const body = card.kind === 'json' ? jsonCardBody(card) : codeCardBody(card)
	const title = card.kind === 'json' ? 'JSON' : card.title
	return { type: 'doc', content: [nativeParagraph(title), ...body.split(/\r?\n/).map((line) => nativeParagraph(line))] }
}

export interface CodeToken { text: string; kind: 'plain' | 'keyword' | 'string' | 'number' | 'comment' }

/** Lightweight, dependency-free preview colors; never executes pasted code. */
export function tokenizeCode(source: string): CodeToken[] {
	const tokens: CodeToken[] = []
	const pattern = /(\/\/[^\n]*|#[^\n]*|--[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|export|import|from|async|await|def|class|if|else|SELECT|FROM|WHERE|CREATE|TABLE|true|false|null)\b|\b\d+(?:\.\d+)?\b)/g
	let cursor = 0
	for (const match of source.matchAll(pattern)) {
		if (match.index > cursor) tokens.push({ text: source.slice(cursor, match.index), kind: 'plain' })
		const text = match[0]
		const kind = /^(?:\/\/|#|--)/.test(text) ? 'comment' : /^['"`]/.test(text) ? 'string' : /^\d/.test(text) ? 'number' : 'keyword'
		tokens.push({ text, kind })
		cursor = match.index + text.length
	}
	if (cursor < source.length) tokens.push({ text: source.slice(cursor), kind: 'plain' })
	return tokens
}
