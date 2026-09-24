import { z } from 'zod'

export const DIAGRAM_LIMITS = {
	nodes: 80,
	edges: 120,
	bodyBytes: 64 * 1024,
	queue: 20,
	ttlMs: 24 * 60 * 60 * 1000,
	claimMs: 60 * 1000,
} as const

export const RoomIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
export const PageIdSchema = z.string().regex(/^page:[a-zA-Z0-9_-]{1,128}$/)
const ItemIdSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/)
export const DiagramColorSchema = z.enum(['black', 'grey', 'blue', 'green', 'red', 'orange', 'violet', 'yellow'])

export const DiagramNodeSchema = z.object({
	id: ItemIdSchema,
	kind: z.enum(['rectangle', 'ellipse', 'diamond', 'note']),
	role: z.enum(['anchor']).optional(),
	label: z.string().max(500),
	x: z.number().finite().min(-100_000).max(100_000),
	y: z.number().finite().min(-100_000).max(100_000),
	w: z.number().finite().min(24).max(4000).default(180),
	h: z.number().finite().min(24).max(4000).default(90),
	color: DiagramColorSchema.default('black'),
}).strict()

export const DiagramEdgeSchema = z.object({
	id: ItemIdSchema,
	from: ItemIdSchema,
	to: ItemIdSchema,
	label: z.string().max(200).default(''),
	color: DiagramColorSchema.default('black'),
	style: z.enum(['lifeline']).optional(),
}).strict()

export const DiagramSchema = z.object({
	title: z.string().trim().min(1).max(120),
	nodes: z.array(DiagramNodeSchema).min(1).max(DIAGRAM_LIMITS.nodes),
	edges: z.array(DiagramEdgeSchema).max(DIAGRAM_LIMITS.edges).default([]),
}).strict().superRefine((diagram, context) => {
	const nodes = new Set(diagram.nodes.map((node) => node.id))
	if (nodes.size !== diagram.nodes.length) context.addIssue({ code: 'custom', message: 'Node IDs must be unique', path: ['nodes'] })
	const edges = new Set(diagram.edges.map((edge) => edge.id))
	if (edges.size !== diagram.edges.length) context.addIssue({ code: 'custom', message: 'Edge IDs must be unique', path: ['edges'] })
	for (const [index, edge] of diagram.edges.entries()) {
		if (!nodes.has(edge.from) || !nodes.has(edge.to)) context.addIssue({ code: 'custom', message: 'Each edge must reference two diagram nodes', path: ['edges', index] })
		if (edge.from === edge.to) context.addIssue({ code: 'custom', message: 'Self connections are not supported', path: ['edges', index] })
	}
})

export const ProposalInputSchema = z.object({
	diagram: DiagramSchema,
	pageId: PageIdSchema.optional(),
}).strict()

export const ClaimInputSchema = z.object({
	claimId: z.string().min(8).max(80).regex(/^[a-zA-Z0-9_-]+$/),
}).strict()

export type Diagram = z.infer<typeof DiagramSchema>
export type DiagramNode = Diagram['nodes'][number]
export type DiagramEdge = Diagram['edges'][number]

export interface DiagramProposal {
	id: string
	diagram: Diagram
	pageId?: string
	createdAt: number
	expiresAt: number
	status: 'pending' | 'claimed'
	claimUntil?: number
}

export interface ProposalsResponse {
	proposals: DiagramProposal[]
}

// Stable IDs let a browser recover from an interrupted acceptance without duplicating shapes.
export function diagramShapeKey(proposalId: string, itemId: string, kind: 'node' | 'edge') {
	return `diagram-${proposalId}-${kind}-${itemId}`
}
