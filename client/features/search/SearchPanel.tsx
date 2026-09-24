import { useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import { findBoardText, jumpToBoardSearchResult, type BoardSearchResult } from './searchIndex'
import './BoardSearch.css'

function Icon({ name }: { name: 'search' | 'close' | 'clear' }) {
	const paths = {
		search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
		close: <path d="M5 5l14 14M19 5 5 19" />,
		clear: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>,
	}
	return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>
}

/** A read-only document search surface; results navigate via native tldraw page, selection and camera APIs. */
export function BoardSearch({ editor }: { editor: Editor }) {
	const root = useRef<HTMLDivElement>(null)
	const input = useRef<HTMLInputElement>(null)
	const trigger = useRef<HTMLButtonElement>(null)
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')
	const [active, setActive] = useState(0)
	const [, setDocumentRevision] = useState(0)
	const allResults = open ? findBoardText(editor, query, 101) : []
	const results = allResults.slice(0, 100)
	const hasMore = allResults.length > 100

	useEffect(() => {
		if (!open) return
		const document = editor.getContainer().ownerDocument
		const outside = (event: PointerEvent) => {
			if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
		}
		const escape = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return
			event.preventDefault()
			event.stopPropagation()
			event.stopImmediatePropagation()
			setOpen(false)
			requestAnimationFrame(() => trigger.current?.focus())
		}
		const unsubscribe = editor.store.listen(() => setDocumentRevision((value) => value + 1), { scope: 'document' })
		document.addEventListener('pointerdown', outside, true)
		document.defaultView?.addEventListener('keydown', escape, true)
		requestAnimationFrame(() => input.current?.focus())
		return () => {
			unsubscribe()
			document.removeEventListener('pointerdown', outside, true)
			document.defaultView?.removeEventListener('keydown', escape, true)
		}
	}, [editor, open])

	const go = (result: BoardSearchResult) => {
		if (jumpToBoardSearchResult(editor, result)) setOpen(false)
	}

	return <div className="freeform-board-search" ref={root}>
		<button ref={trigger} type="button" className="freeform-board-search__trigger" title="Search board" aria-label="Search board" aria-expanded={open} aria-controls="freeform-board-search-panel" onClick={() => setOpen((value) => !value)}><Icon name="search" /></button>
		{open && <section id="freeform-board-search-panel" className="freeform-board-search__panel" aria-label="Search board">
			<header className="freeform-board-search__header"><strong>Search board</strong><button type="button" className="freeform-board-search__icon" title="Close search" aria-label="Close search" onClick={() => { setOpen(false); trigger.current?.focus() }}><Icon name="close" /></button></header>
			<div className="freeform-board-search__input-wrap">
				<Icon name="search" />
				<input ref={input} type="text" aria-label="Search text on all pages" placeholder="Find text on any page" value={query} onChange={(event) => { setQuery(event.target.value); setActive(0) }} onKeyDown={(event) => {
					if (event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => Math.min(value + 1, results.length - 1)) }
					if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(0, value - 1)) }
					if (event.key === 'Enter' && results.length) { event.preventDefault(); go(results[Math.min(active, results.length - 1)]) }
				}} />
				{query && <button type="button" className="freeform-board-search__icon" title="Clear search" aria-label="Clear search" onClick={() => { setQuery(''); setActive(0); input.current?.focus() }}><Icon name="clear" /></button>}
			</div>
			{query.trim() ? <>
				<p className="freeform-board-search__count" role="status">{results.length ? `${results.length}${hasMore ? '+' : ''} ${results.length === 1 && !hasMore ? 'result' : 'results'}` : 'No matching text'}</p>
				{results.length > 0 && <ol className="freeform-board-search__results">{results.map((result, index) => <li key={result.shapeId}>
					<button type="button" className="freeform-board-search__result" data-active={active === index} onMouseEnter={() => setActive(index)} onClick={() => go(result)}>
						<span className="freeform-board-search__snippet">{result.snippet}</span>
						<span className="freeform-board-search__meta">{result.pageName} · {result.kind === 'geo' ? 'shape' : result.kind}</span>
					</button>
				</li>)}</ol>}
			</> : <p className="freeform-board-search__empty">Text, shapes, notes and arrows</p>}
		</section>}
	</div>
}
