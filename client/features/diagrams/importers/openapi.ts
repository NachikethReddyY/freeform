import { DIAGRAM_LIMITS, DiagramSchema, type Diagram, type DiagramNode } from '../../../../shared/diagram'

const MAX_SOURCE_BYTES = 1024 * 1024
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const
type Method = (typeof METHODS)[number]

interface Operation {
	method: Method
	path: string
	groupKey: string
	groupLabel: string
	label: string
}

function object(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function plainText(value: unknown, description: string, maxLength: number): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${description} must be nonempty text.`)
	const trimmed = value.trim().replace(/\s+/g, ' ')
	if (trimmed.length > maxLength) throw new Error(`${description} must be ${maxLength} characters or fewer.`)
	return trimmed
}

function optionalText(value: unknown, description: string, maxLength: number): string {
	if (value === undefined) return ''
	if (typeof value !== 'string') throw new Error(`${description} must be text.`)
	const trimmed = value.trim().replace(/\s+/g, ' ')
	if (trimmed.length > maxLength) throw new Error(`${description} must be ${maxLength} characters or fewer.`)
	return trimmed
}

function unwrapCodeBlock(source: string): string {
	const trimmed = source.trim()
	if (!trimmed.startsWith('```')) return trimmed
	const match = /^```(?:json|openapi)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed)
	if (!match) throw new Error('Use OpenAPI JSON or a JSON code block.')
	return match[1]
}

function parseSource(source: string): Record<string, unknown> {
	if (new TextEncoder().encode(source).length > MAX_SOURCE_BYTES) throw new Error('OpenAPI input must be 1 MiB or smaller.')
	let parsed: unknown
	try { parsed = JSON.parse(unwrapCodeBlock(source)) }
	catch { throw new Error('OpenAPI input must be valid JSON.') }
	if (!object(parsed)) throw new Error('OpenAPI input must be a JSON object.')
	if (typeof parsed.openapi !== 'string' || !/^3\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(parsed.openapi)) {
		throw new Error('Only OpenAPI 3.x JSON is supported.')
	}
	return parsed
}

function operationGroup(path: string, value: Record<string, unknown>): { key: string; label: string } {
	if (value.tags !== undefined) {
		if (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== 'string')) {
			throw new Error(`Tags for ${path} must be an array of text labels.`)
		}
		const firstTag = value.tags.find((tag: string) => tag.trim())
		if (firstTag) {
			const label = plainText(firstTag, `A tag for ${path}`, 500)
			return { key: `tag:${label}`, label }
		}
	}
	const segment = path.split('/').find((part) => part && !part.startsWith('{')) ?? 'Root'
	const label = plainText(segment, `A resource name for ${path}`, 500)
	return { key: `path:${label}`, label }
}

function readOperations(paths: Record<string, unknown>): Operation[] {
	const operations: Operation[] = []
	for (const [path, pathItem] of Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))) {
		if (!path.startsWith('/')) throw new Error(`API path ${path} must start with /.`)
		if (!object(pathItem)) throw new Error(`The path item for ${path} must be an object.`)
		if ('$ref' in pathItem) throw new Error(`Path item references are not supported: ${path}. Resolve the reference before import.`)
		const allowedPathFields = new Set<string>([...METHODS, 'summary', 'description', 'servers', 'parameters'])
		for (const field of Object.keys(pathItem)) {
			if (!allowedPathFields.has(field) && !field.startsWith('x-')) throw new Error(`Unsupported path field ${field} in ${path}. Use lowercase OpenAPI methods.`)
		}
		for (const method of METHODS) {
			if (!(method in pathItem)) continue
			const entry = pathItem[method]
			if (!object(entry) || '$ref' in entry) throw new Error(`${method.toUpperCase()} ${path} must contain an operation object, not a reference.`)
			const group = operationGroup(path, entry)
			const summary = optionalText(entry.summary, `Summary for ${method.toUpperCase()} ${path}`, 450)
				|| optionalText(entry.operationId, `Operation ID for ${method.toUpperCase()} ${path}`, 450)
			const label = `${method.toUpperCase()} ${path}${summary ? `\n${summary}` : ''}`
			if (label.length > 500) throw new Error(`${method.toUpperCase()} ${path} has a label over 500 characters.`)
			operations.push({ method, path, groupKey: group.key, groupLabel: group.label, label })
		}
	}
	if (!operations.length) throw new Error('Add at least one operation under paths to make an API map.')
	return operations
}

const operationColor: Record<Method, DiagramNode['color']> = {
	get: 'blue', post: 'green', put: 'orange', patch: 'orange', delete: 'red', options: 'grey', head: 'grey', trace: 'violet',
}

/** Maps OpenAPI 3.x JSON paths into editable native diagram nodes and bound arrows.
 * It intentionally omits schemas, request/response bodies, auth, and callbacks. */
export function parseOpenApiJson(source: string): Diagram {
	const document = parseSource(source)
	if (!object(document.info)) throw new Error('OpenAPI info must include a title.')
	const title = plainText(document.info.title, 'OpenAPI title', 120)
	if (!object(document.paths)) throw new Error('OpenAPI paths must be an object.')
	const operations = readOperations(document.paths)
	const groups = new Map<string, { id: string; label: string; operations: Operation[] }>()
	for (const operation of operations) {
		const current = groups.get(operation.groupKey)
		if (current) current.operations.push(operation)
		else groups.set(operation.groupKey, { id: `group${groups.size + 1}`, label: operation.groupLabel, operations: [operation] })
	}
	const nodeCount = 1 + groups.size + operations.length
	const edgeCount = groups.size + operations.length
	if (nodeCount > DIAGRAM_LIMITS.nodes) throw new Error(`An API map can contain at most ${DIAGRAM_LIMITS.nodes} nodes; this source needs ${nodeCount}.`)
	if (edgeCount > DIAGRAM_LIMITS.edges) throw new Error(`An API map can contain at most ${DIAGRAM_LIMITS.edges} arrows; this source needs ${edgeCount}.`)

	const nodes: Diagram['nodes'] = [{ id: 'api', kind: 'ellipse', label: title, x: 0, y: Math.max(0, (operations.length - 1) * 65), w: 200, h: 90, color: 'violet' }]
	const edges: Diagram['edges'] = []
	let lane = 0
	for (const group of groups.values()) {
		const firstLane = lane
		for (const operation of group.operations) {
			const operationId = `operation${lane + 1}`
			nodes.push({ id: operationId, kind: 'rectangle', label: operation.label, x: 600, y: lane * 130, w: 300, h: operation.label.includes('\n') ? 104 : 84, color: operationColor[operation.method] })
			edges.push({ id: `operationEdge${lane + 1}`, from: group.id, to: operationId, label: '', color: 'grey' })
			lane++
		}
		nodes.push({ id: group.id, kind: 'rectangle', label: group.label, x: 300, y: (firstLane + lane - 1) * 65, w: 190, h: 90, color: 'blue' })
		edges.push({ id: `groupEdge${edges.length + 1}`, from: 'api', to: group.id, label: '', color: 'grey' })
	}
	const parsed = DiagramSchema.safeParse({ title, nodes, edges })
	if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid API map.')
	return parsed.data
}
