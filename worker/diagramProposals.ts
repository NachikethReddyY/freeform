import { z } from 'zod'
import {
	ClaimInputSchema,
	DIAGRAM_LIMITS,
	ProposalInputSchema,
	diagramShapeKey,
	type Diagram,
	type DiagramProposal,
} from '../shared/diagram'

export class DiagramRequestError extends Error {
	constructor(public readonly status: number, message: string, public readonly code?: 'awaiting_sync') { super(message) }
}

export interface StoredProposal extends DiagramProposal {
	claimId?: string
}

export function pruneProposals(proposals: StoredProposal[], now: number): StoredProposal[] {
	return proposals.filter((proposal) => proposal.expiresAt > now).map((proposal) => {
		if (proposal.status === 'claimed' && (proposal.claimUntil ?? 0) <= now) {
			const { claimId: _claimId, claimUntil: _claimUntil, ...rest } = proposal
			return { ...rest, status: 'pending' }
		}
		return { ...proposal }
	})
}

export function publicProposal(proposal: StoredProposal): DiagramProposal {
	const { claimId: _claimId, ...visible } = proposal
	return visible
}

export function createProposal(proposals: StoredProposal[], diagram: Diagram, now: number, id: string, pageId?: string): DiagramProposal {
	if (proposals.length >= DIAGRAM_LIMITS.queue) throw new DiagramRequestError(429, 'This board already has 20 pending proposals. Apply or dismiss one first.')
	const proposal: StoredProposal = { id, diagram, createdAt: now, expiresAt: now + DIAGRAM_LIMITS.ttlMs, status: 'pending', ...(pageId ? { pageId } : {}) }
	proposals.push(proposal)
	return publicProposal(proposal)
}

export function claimProposal(proposals: StoredProposal[], id: string, claimId: string, now: number): DiagramProposal {
	const proposal = proposals.find((entry) => entry.id === id)
	if (!proposal) throw new DiagramRequestError(404, 'Proposal not found or expired')
	if (proposal.status === 'claimed' && proposal.claimId !== claimId && (proposal.claimUntil ?? 0) > now) throw new DiagramRequestError(409, 'This proposal is already being applied in another window')
	proposal.status = 'claimed'
	proposal.claimId = claimId
	proposal.claimUntil = now + DIAGRAM_LIMITS.claimMs
	return publicProposal(proposal)
}

export function finishProposal(proposals: StoredProposal[], id: string, claimId: string): void {
	const index = proposals.findIndex((entry) => entry.id === id)
	if (index === -1) return // Repeating an acknowledgement is harmless.
	if (proposals[index].claimId !== claimId) throw new DiagramRequestError(409, 'Proposal claim does not match')
	proposals.splice(index, 1)
}

const ReceiptRecordSchema = z.object({
	id: z.string(), typeName: z.string(), parentId: z.string().optional(),
	meta: z.object({ diagramProposal: z.string().optional() }).optional(),
	fromId: z.string().optional(), toId: z.string().optional(),
})

/** A queue acknowledgement is valid only after the synchronized document contains the insertion. */
export function assertDiagramStored(proposal: DiagramProposal, records: readonly unknown[]): void {
	const stored = new Map(records.flatMap((record) => {
		const parsed = ReceiptRecordSchema.safeParse(record)
		return parsed.success ? [[parsed.data.id, parsed.data] as const] : []
	}))
	const pending = () => { throw new DiagramRequestError(409, 'Waiting for the diagram to sync. Retry acceptance shortly.', 'awaiting_sync') }
	const containingPage = (id: string) => {
		const visited = new Set<string>()
		let record = stored.get(id)
		while (record?.typeName === 'shape' && record.parentId && !visited.has(record.id)) {
			visited.add(record.id)
			record = stored.get(record.parentId)
		}
		return record?.typeName === 'page' ? record.id : undefined
	}
	let pageId = proposal.pageId
	const items = [...proposal.diagram.nodes.map((node) => [node.id, 'node'] as const), ...proposal.diagram.edges.map((edge) => [edge.id, 'edge'] as const)]
	for (const [id, kind] of items) {
		const key = `shape:${diagramShapeKey(proposal.id, id, kind)}`
		const record = stored.get(key)
		const page = containingPage(key)
		pageId ??= page
		if (record?.typeName !== 'shape' || record.meta?.diagramProposal !== proposal.id || !page || page !== pageId) pending()
	}
	for (const edge of proposal.diagram.edges) {
		for (const [terminal, target] of [['start', edge.from], ['end', edge.to]] as const) {
			const binding = stored.get(`binding:diagram-${proposal.id}-${edge.id}-${terminal}`)
			if (binding?.typeName !== 'binding' || binding.fromId !== `shape:${diagramShapeKey(proposal.id, edge.id, 'edge')}` || binding.toId !== `shape:${diagramShapeKey(proposal.id, target, 'node')}`) pending()
		}
	}
}

export function diagramErrorResponse(error: unknown): Response {
	if (error instanceof DiagramRequestError) return Response.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
	if (error instanceof z.ZodError) return Response.json({ error: 'Invalid diagram request', issues: error.issues.slice(0, 6).map(({ path, message }) => ({ path, message })) }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
	console.error('Diagram request failed', error instanceof Error ? error.message : 'Unknown error')
	return Response.json({ error: 'Diagram service failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
}

export async function readDiagramJson(request: Request): Promise<unknown> {
	if (!request.headers.get('content-type')?.split(';')[0].trim().endsWith('/json')) throw new DiagramRequestError(415, 'Use application/json')
	const declared = Number(request.headers.get('content-length') ?? 0)
	if (declared > DIAGRAM_LIMITS.bodyBytes) throw new DiagramRequestError(413, 'Request exceeds 64 KiB')
	if (!request.body) throw new DiagramRequestError(400, 'Missing JSON body')
	const reader = request.body.getReader()
	const chunks: Uint8Array[] = []
	let length = 0
	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			length += value.byteLength
			if (length > DIAGRAM_LIMITS.bodyBytes) { await reader.cancel(); throw new DiagramRequestError(413, 'Request exceeds 64 KiB') }
			chunks.push(value)
		}
	} finally { reader.releaseLock() }
	const bytes = new Uint8Array(length)
	let offset = 0
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
	try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
	catch { throw new DiagramRequestError(400, 'Invalid JSON body') }
}

export function checkLocalDiagramRequest(request: Request): void {
	const url = new URL(request.url)
	if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new DiagramRequestError(403, 'Diagram tools are available on loopback only')
	const origin = request.headers.get('origin')
	if (origin && origin !== url.origin) throw new DiagramRequestError(403, 'Cross-origin diagram requests are not allowed')
	if (request.headers.get('sec-fetch-site') === 'cross-site') throw new DiagramRequestError(403, 'Cross-site diagram requests are not allowed')
}

// The queue lives in Durable Object KV, separately from the synchronized tldraw document.
export class DiagramProposalQueue {
	constructor(private readonly storage: DurableObjectStorage, private readonly readDocument: () => readonly unknown[]) {}

	async handle(request: Request, id?: string, action?: string): Promise<Response> {
		try {
			const now = Date.now()
			const input = request.method === 'POST' ? await readDiagramJson(request) : undefined
			return await this.storage.transaction(async (transaction) => {
				const prefix = 'diagram-proposal:v1:'
				const stored = await transaction.list<StoredProposal>({ prefix, limit: DIAGRAM_LIMITS.queue + 1 })
				const proposals = pruneProposals([...stored.values()], now)
				let result: unknown
				let status = 200
				if (request.method === 'GET' && !id) result = { proposals: proposals.map(publicProposal) }
				else if (request.method === 'POST' && !id) {
					const data = ProposalInputSchema.parse(input)
					result = { proposal: createProposal(proposals, data.diagram, now, crypto.randomUUID(), data.pageId) }
					status = 201
				} else if (request.method === 'DELETE' && id && !action) {
					const index = proposals.findIndex((proposal) => proposal.id === id)
					if (index !== -1) {
						if (proposals[index].status === 'claimed') throw new DiagramRequestError(409, 'Wait for the active application to finish before dismissing this proposal')
						proposals.splice(index, 1)
					}
					result = { dismissed: true }
				} else if (request.method === 'POST' && id && action === 'claim') {
					const { claimId } = ClaimInputSchema.parse(input)
					result = { proposal: claimProposal(proposals, id, claimId, now), claimId }
				} else if (request.method === 'POST' && id && action === 'applied') {
					const { claimId } = ClaimInputSchema.parse(input)
					const proposal = proposals.find((entry) => entry.id === id)
					if (proposal) {
						if (proposal.claimId !== claimId) throw new DiagramRequestError(409, 'Proposal claim does not match')
						assertDiagramStored(proposal, this.readDocument())
					}
					finishProposal(proposals, id, claimId)
					result = { applied: true }
				} else throw new DiagramRequestError(404, 'Unknown proposal operation')
				const remaining = new Map(proposals.map((proposal) => [`${prefix}${proposal.id}`, proposal]))
				for (const key of stored.keys()) if (!remaining.has(key)) await transaction.delete(key)
				for (const [key, proposal] of remaining) {
					if (JSON.stringify(stored.get(key)) !== JSON.stringify(proposal)) await transaction.put(key, proposal)
				}
				return Response.json(result, { status, headers: { 'Cache-Control': 'no-store' } })
			})
		} catch (error) { return diagramErrorResponse(error) }
	}
}
