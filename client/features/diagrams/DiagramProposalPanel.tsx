import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { type Editor, type TLPageId } from 'tldraw'
import { z } from 'zod'
import { DiagramSchema, PageIdSchema, type Diagram, type DiagramProposal } from '../../../shared/diagram'
import { DiagramPreview } from './DiagramPreview'
import { DiagramText } from './DiagramText'
import { parseMermaidFlowchart } from './mermaid'
import { applyNativeDiagram } from './native'
import { DiagramLibrarySection } from './library/DiagramLibrarySection'
import './diagrams.css'

const ProposalSchema = z.object({
	id: z.string().uuid(), diagram: DiagramSchema, pageId: PageIdSchema.optional(),
	createdAt: z.number().finite(), expiresAt: z.number().finite(), status: z.enum(['pending', 'claimed']), claimUntil: z.number().finite().optional(),
}).strict()
const QueueSchema = z.object({ proposals: z.array(ProposalSchema).max(20) }).strict()
const ClaimResponseSchema = z.object({ proposal: ProposalSchema, claimId: z.string() }).strict()
const example = 'flowchart LR\n  A[Idea] --> B{Ready?}\n  B -->|yes| C[Build]\n  B -->|no| A'

class DiagramApiError extends Error {
	constructor(message: string, readonly code?: string) { super(message) }
}

async function api(path: string, options: RequestInit, signal: AbortSignal) {
	const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) })
	const result: unknown = await response.json()
	if (!response.ok) {
		const parsed = z.object({ error: z.string(), code: z.string().optional() }).safeParse(result)
		throw new DiagramApiError(parsed.success ? parsed.data.error : `Request failed (${response.status}).`, parsed.success ? parsed.data.code : undefined)
	}
	return result
}

async function acknowledge(path: string, claimId: string, signal: AbortSignal) {
	const timeout = AbortSignal.timeout(6000)
	const bounded = AbortSignal.any([signal, timeout])
	try {
		for (let attempt = 0; attempt < 20; attempt++) {
			try { await api(path, { method: 'POST', body: JSON.stringify({ claimId }) }, bounded); return }
			catch (cause) {
				if (!(cause instanceof DiagramApiError) || cause.code !== 'awaiting_sync') throw cause
				await new Promise((resolve) => setTimeout(resolve, 250))
			}
		}
	} catch (cause) {
		if (!timeout.aborted) throw cause
	}
	throw new Error('The insertion has not finished syncing. Keep this board open and retry Add to board; it will not duplicate shapes.')
}

interface LocalDraft { id: string; pageId: TLPageId; diagram: Diagram }

export function DiagramProposalPanel({ editor, roomId, onClose }: { editor: Editor; roomId: string; onClose?: () => void }) {
	const fieldId = useId()
	const [proposals, setProposals] = useState<DiagramProposal[]>([])
	const [loading, setLoading] = useState(true)
	const [busy, setBusy] = useState<string | null>(null)
	const [error, setError] = useState('')
	const [queueError, setQueueError] = useState('')
	const [notice, setNotice] = useState('')
	const [source, setSource] = useState(() => sessionStorage.getItem(`wboard:mermaid:${roomId}`) ?? '')
	const [draft, setDraft] = useState<LocalDraft | null>(null)
	const lifetime = useRef(new AbortController())
	const applying = useRef(false)
	const claims = useRef(new Map<string, string>())
	const base = `/api/rooms/${encodeURIComponent(roomId)}/proposals`

	const refresh = useCallback(async (signal: AbortSignal) => {
		const result = QueueSchema.parse(await api(base, {}, signal))
		if (!signal.aborted) setProposals(result.proposals)
	}, [base])

	useEffect(() => {
		const controller = new AbortController()
		lifetime.current = controller
		setProposals([]); setDraft(null); setNotice(''); setError(''); setQueueError(''); setLoading(true); setBusy(null)
		applying.current = false; claims.current.clear()
		setSource(sessionStorage.getItem(`wboard:mermaid:${roomId}`) ?? '')
		const poll = async () => {
			if (document.visibilityState !== 'visible') return
			try { await refresh(controller.signal); if (!controller.signal.aborted) setQueueError('') }
			catch (cause) { if (!controller.signal.aborted) setQueueError(cause instanceof Error ? cause.message : 'Could not load proposals.') }
			finally { if (!controller.signal.aborted) setLoading(false) }
		}
		void poll()
		const interval = window.setInterval(() => { if (!applying.current) void poll() }, 4000)
		return () => { controller.abort(); clearInterval(interval) }
	}, [editor, roomId, refresh])

	const run = async (id: string, task: (signal: AbortSignal) => Promise<void>) => {
		if (applying.current) return
		applying.current = true; setBusy(id); setError(''); setNotice('')
		const signal = lifetime.current.signal
		try { await task(signal) }
		catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'Diagram action failed.') }
		finally { if (lifetime.current.signal === signal) { applying.current = false; if (!signal.aborted) setBusy(null) } }
	}

	const accept = (proposal: DiagramProposal) => {
		const page = editor.getCurrentPageId()
		if (proposal.pageId && proposal.pageId !== page) { setError('Open the page this proposal targets, then apply it.'); return }
		void run(proposal.id, async (signal) => {
			const claimId = claims.current.get(proposal.id) ?? crypto.randomUUID()
			claims.current.set(proposal.id, claimId)
			const response = ClaimResponseSchema.parse(await api(`${base}/${proposal.id}/claim`, { method: 'POST', body: JSON.stringify({ claimId }) }, signal))
			if (signal.aborted) return
			if (editor.getCurrentPageId() !== page) throw new Error('Page changed while accepting. Return to the target page and retry.')
			if (response.proposal.pageId && response.proposal.pageId !== page) throw new Error('This proposal belongs to another page.')
			applyNativeDiagram(editor, response.proposal.diagram, proposal.id, page, false)
			await acknowledge(`${base}/${proposal.id}/applied`, claimId, signal)
			if (!signal.aborted) { setNotice('Diagram added. Undo removes the insertion.'); await refresh(signal) }
		})
	}

	const preview = () => {
		try {
			setError(''); setNotice('')
			setDraft({ id: crypto.randomUUID(), pageId: editor.getCurrentPageId(), diagram: parseMermaidFlowchart(source) })
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not parse this flowchart.') }
	}

	return (
		<section className="wboard-diagrams" aria-label="Diagrams" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
			if (event.key === 'Escape') { event.stopPropagation(); onClose?.() }
			else event.stopPropagation()
		}}>
			<header><h2>Diagrams</h2>{onClose && <button type="button" onClick={onClose} aria-label="Close diagrams">×</button>}</header>
			<DiagramLibrarySection editor={editor} />
			{error && <p className="wboard-diagrams-error" role="alert">{error}</p>}
			{queueError && <p className="wboard-diagrams-error" role="status">{queueError} Reconnecting automatically.</p>}
			{notice && <p role="status">{notice}</p>}
			<div className="wboard-diagrams-list" aria-busy={loading}>
				{loading ? <p>Loading proposals…</p> : proposals.length === 0 ? <p>Ask Codex or Pi to draw in <strong>{roomId}</strong>. Proposals appear here for review.</p> : proposals.map((proposal) => {
					const elsewhere = proposal.status === 'claimed' && (proposal.claimUntil ?? 0) > Date.now() && !claims.current.has(proposal.id)
					return <article className="wboard-diagrams-proposal" key={proposal.id}>
						<h3>{proposal.diagram.title}</h3>
						<DiagramPreview diagram={proposal.diagram} />
						<DiagramText diagram={proposal.diagram} />
						{proposal.diagram.nodes.some((node) => node.kind === 'note') && <p>Notes use square bounds and grow to fit their text.</p>}
						<p>{proposal.diagram.nodes.length} {proposal.diagram.nodes.length === 1 ? 'node' : 'nodes'} · {proposal.diagram.edges.length} {proposal.diagram.edges.length === 1 ? 'arrow' : 'arrows'}{elsewhere ? ' · Applying in another window' : ''}</p>
						<div className="wboard-diagrams-actions">
							<button type="button" disabled={busy !== null || elsewhere} onClick={() => accept(proposal)}>{busy === proposal.id ? 'Applying…' : 'Add to board'}</button>
							<button type="button" disabled={busy !== null || elsewhere} onClick={() => void run(`dismiss-${proposal.id}`, async (signal) => { await api(`${base}/${proposal.id}`, { method: 'DELETE' }, signal); await refresh(signal) })}>Dismiss</button>
						</div>
					</article>
				})}
			</div>
			<details className="wboard-diagrams-import" open={draft ? true : undefined}>
				<summary>Mermaid flowchart</summary>
				<label htmlFor={fieldId}>Flowchart text</label>
				<textarea id={fieldId} spellCheck={false} rows={7} value={source} placeholder={example} maxLength={20_000} onChange={(event) => {
					const value = event.target.value
					setSource(value); setDraft(null); sessionStorage.setItem(`wboard:mermaid:${roomId}`, value)
				}} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); preview() } }} />
				<p>Flowcharts only: [box], (box), ((circle)), {'{decision}'}, and --&gt; arrows. Use --&gt;|label| for labels.</p>
				<button type="button" disabled={!source.trim() || busy !== null} onClick={preview}>Preview <kbd>⌘/Ctrl Enter</kbd></button>
				{draft && <div className="wboard-diagrams-draft">
					<DiagramPreview diagram={draft.diagram} />
					<DiagramText diagram={draft.diagram} />
					<div className="wboard-diagrams-actions">
						<button type="button" disabled={busy !== null} onClick={() => void run(draft.id, async () => {
							applyNativeDiagram(editor, draft.diagram, draft.id, draft.pageId, true)
							setDraft(null); setNotice('Flowchart added. Every node and arrow is editable.')
						})}>Add flowchart</button>
						<button type="button" onClick={() => setDraft(null)}>Cancel preview</button>
					</div>
				</div>}
			</details>
		</section>
	)
}
