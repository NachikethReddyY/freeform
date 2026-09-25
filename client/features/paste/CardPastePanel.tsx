import { useRef, useState } from 'react'
import type { Editor, TLPageId } from 'tldraw'
import type { IncomingPasteCard } from './cardPaste'
import { applyNativePasteCard } from './nativeCard'
import { codeCardBody, jsonCardBody, parseCardMarkdown, safeHttpUrl, tokenizeCode, type CardInline } from './cardContent'

const KIND_LABELS: Record<IncomingPasteCard['kind'], string> = {
	markdown: 'Markdown', code: 'Code', json: 'JSON', url: 'Link',
}

export interface CardPastePanelProps {
	editor: Editor
	card: IncomingPasteCard
	/** The page that was active when the paste occurred. */
	pageId: TLPageId
	onClose(): void
}

/** Review is explicit. Rendering this panel never changes board records. */
export function CardPastePanel({ editor, card, pageId, onClose }: CardPastePanelProps) {
	const [error, setError] = useState('')
	const [source, setSource] = useState(card.source)
	const [view, setView] = useState<'preview' | 'source'>('preview')
	const applying = useRef(false)
	const reviewedCard: IncomingPasteCard = card.kind === 'url'
		? { ...card, source, url: source.trim(), title: safeHttpUrl(source.trim()) ? new URL(source.trim()).hostname : card.title }
		: { ...card, source }
	const accept = () => {
		if (applying.current) return
		applying.current = true
		setError('')
		try { applyNativePasteCard(editor, reviewedCard, pageId); onClose() }
		catch (cause) { setError(cause instanceof Error ? cause.message : 'The card could not be added. Try again.') }
		finally { applying.current = false }
	}

	return <section className="freeform-paste-panel" aria-label="Paste preview" onPointerDown={(event) => event.stopPropagation()}
		onKeyDown={(event) => {
			if (event.key === 'Escape') { event.stopPropagation(); onClose() }
			else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.stopPropagation(); accept() }
			else event.stopPropagation()
		}}>
		<header>
			<div><span className="freeform-paste-kind">{KIND_LABELS[card.kind]}</span><h2>Paste as card</h2></div>
			<button type="button" className="freeform-paste-close" aria-label="Close paste preview" title="Close" onClick={onClose}>
				<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
			</button>
		</header>
		<div className="freeform-paste-view-switch" role="group" aria-label="Card view">
			<button type="button" aria-pressed={view === 'preview'} onClick={() => setView('preview')}>Preview</button>
			<button type="button" aria-pressed={view === 'source'} onClick={() => setView('source')}>Source</button>
		</div>
		{view === 'preview' ? <CardPreview card={reviewedCard} />
			: <textarea className="freeform-paste-source" aria-label="Pasted source" spellCheck={false} value={source} rows={8} onChange={(event) => { setSource(event.currentTarget.value); setError('') }} />}
		{error && <p className="freeform-paste-error" role="alert">{error}</p>}
		<div className="freeform-paste-actions">
			<button type="button" className="freeform-paste-accept" onClick={accept}>Add to board</button>
			<button type="button" onClick={onClose}>Cancel</button>
		</div>
	</section>
}

function InlinePreview({ content }: { content: CardInline[] }) {
	return <>{content.map((part, index) => {
		const key = `${index}-${part.text.slice(0, 12)}`
		switch (part.mark) {
			case 'bold': return <strong key={key}>{part.text}</strong>
			case 'italic': return <em key={key}>{part.text}</em>
			case 'code': return <code key={key}>{part.text}</code>
			case 'link': return <a key={key} href={part.href} target="_blank" rel="noopener noreferrer nofollow">{part.text}</a>
			default: return <span key={key}>{part.text}</span>
		}
	})}</>
}

function CardPreview({ card }: { card: IncomingPasteCard }) {
	if (card.kind === 'markdown') return <div className="freeform-paste-preview freeform-paste-markdown" aria-label="Rendered card preview">
		{parseCardMarkdown(card.source).map((block, index) => {
			const key = `${block.kind}-${index}`
			if (block.kind === 'heading') {
				const Heading = `h${Math.min(block.level + 2, 6)}` as 'h3' | 'h4' | 'h5' | 'h6'
				return <Heading key={key}><InlinePreview content={block.content} /></Heading>
			}
			if (block.kind === 'list') {
				const items = block.items.map((item, itemIndex) => <li key={itemIndex}><InlinePreview content={item} /></li>)
				return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>
			}
			if (block.kind === 'code') return <pre key={key}><code>{block.text}</code></pre>
			if (block.kind === 'quote') return <blockquote key={key}><InlinePreview content={block.content} /></blockquote>
			return <p key={key}><InlinePreview content={block.content} /></p>
		})}
	</div>
	if (card.kind === 'url') {
		const href = safeHttpUrl(card.url)
		return <div className="freeform-paste-preview freeform-paste-link" aria-label="Rendered card preview">
			<strong>{card.title}</strong>
			{href ? <a href={href} target="_blank" rel="noopener noreferrer nofollow">{card.url}</a> : <span>{card.url}</span>}
		</div>
	}
	const body = card.kind === 'json' ? jsonCardBody(card) : codeCardBody(card)
	return <div className="freeform-paste-preview freeform-paste-code" aria-label="Rendered card preview">
		<span className="freeform-paste-code-label">{card.title}</span>
		<pre><code>{tokenizeCode(body).map((token, index) => <span key={index} className={`freeform-paste-token-${token.kind}`}>{token.text}</span>)}</code></pre>
	</div>
}
