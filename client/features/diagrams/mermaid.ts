import { DIAGRAM_LIMITS, DiagramSchema, type Diagram, type DiagramNode } from '../../../shared/diagram'

interface ParsedNode { id: string; label?: string; kind?: DiagramNode['kind'] }

function statements(source: string): string[] {
	let text = source.trim()
	if (text.startsWith('```')) {
		const match = /^```mermaid\s*\n([\s\S]*?)\n```$/i.exec(text)
		if (!match) throw new Error('Use a Mermaid code block or plain flowchart text.')
		text = match[1]
	}
	const result: string[] = []
	let current = '', quote = false, depth = 0
	for (const line of text.split('\n')) {
		if (line.trim().startsWith('%%')) continue
		for (const char of `${line}\n`) {
			if (char === '"') quote = !quote
			if (!quote) {
				if ('[({'.includes(char)) depth++
				if ('])}'.includes(char)) depth--
				if (depth < 0) throw new Error('A node label has an unmatched closing bracket.')
				if ((char === ';' || char === '\n') && depth === 0) {
					if (current.trim()) result.push(current.trim())
					current = ''; continue
				}
			}
			current += char
		}
	}
	if (quote || depth) throw new Error('Close all quoted labels and node brackets.')
	if (current.trim()) result.push(current.trim())
	return result
}

function readNode(value: string): { node: ParsedNode; rest: string } {
	const id = /^([A-Za-z][A-Za-z0-9_-]{0,63})(?=\s|\[|\(|\{|-->|$)/.exec(value)
	if (!id) throw new Error('Use short node IDs such as A or api_server, and --> arrows.')
	let rest = value.slice(id[0].length).trimStart()
	const opening = rest.startsWith('((') ? '((' : ['[', '(', '{'].find((symbol) => rest.startsWith(symbol))
	if (!opening) return { node: { id: id[1] }, rest }
	const closing = opening === '((' ? '))' : opening === '[' ? ']' : opening === '(' ? ')' : '}'
	let quote = false, end = -1
	for (let i = opening.length; i < rest.length; i++) {
		if (rest[i] === '"') quote = !quote
		if (!quote && rest.startsWith(closing, i)) { end = i; break }
		if (!quote && '[({'.includes(rest[i])) throw new Error('This import supports rectangles [label], rounded nodes (label), circles ((label)), and diamonds {label}.')
	}
	if (end < 0) throw new Error(`Close the label for ${id[1]}.`)
	let label = rest.slice(opening.length, end).trim()
	if (label.startsWith('"') && label.endsWith('"')) label = label.slice(1, -1)
	if (label.includes('"') || label.includes('<') || label.includes('>') || label.includes('`')) {
		// Arrows in a quoted plain label are text, never HTML or executable Mermaid directives.
		if (!label.includes('-->') || /[<`"]/.test(label)) throw new Error('Use plain text labels; HTML and Markdown labels are not supported.')
	}
	const kind: DiagramNode['kind'] = opening === '{' ? 'diamond' : opening === '((' ? 'ellipse' : 'rectangle'
	rest = rest.slice(end + closing.length).trimStart()
	return { node: { id: id[1], label, kind }, rest }
}

/** A bounded native-shape importer, not a full Mermaid renderer. Unsupported syntax fails explicitly. */
export function parseMermaidFlowchart(source: string): Diagram {
	if (source.length > 20_000) throw new Error('Mermaid input must be 20,000 characters or fewer.')
	const lines = statements(source)
	const header = /^(?:flowchart|graph)\s+(LR|RL|TD|TB|BT)$/i.exec(lines.shift() ?? '')
	if (!header) throw new Error('Start with flowchart LR, RL, TD, TB, or BT.')
	const direction = header[1].toUpperCase()
	const nodes = new Map<string, ParsedNode>()
	const edges: Diagram['edges'] = []
	const remember = (node: ParsedNode) => {
		nodes.set(node.id, { ...nodes.get(node.id), ...node })
		if (nodes.size > DIAGRAM_LIMITS.nodes) throw new Error('A diagram can contain at most 80 nodes.')
	}
	for (const line of lines) {
		if (/^(subgraph|end|style|class|classDef|click|linkStyle|direction)\b/.test(line)) throw new Error('Subgraphs, styling, links, and directives are not supported in this flowchart import.')
		let parsed = readNode(line)
		remember(parsed.node)
		while (parsed.rest) {
			if (!parsed.rest.startsWith('-->')) throw new Error('Only --> arrows are supported. Use -->|label| for an edge label.')
			let remaining = parsed.rest.slice(3).trimStart(), label = ''
			if (remaining.startsWith('|')) {
				const end = remaining.indexOf('|', 1)
				if (end < 0) throw new Error('Close the edge label with |.')
				label = remaining.slice(1, end).trim(); remaining = remaining.slice(end + 1).trimStart()
			}
			const next = readNode(remaining)
			remember(next.node)
			edges.push({ id: `e${edges.length + 1}`, from: parsed.node.id, to: next.node.id, label, color: 'black' })
			if (edges.length > DIAGRAM_LIMITS.edges) throw new Error('A diagram can contain at most 120 arrows.')
			parsed = next
		}
	}
	if (!nodes.size) throw new Error('Add at least one node to the flowchart.')
	// Assign breadth-first levels; cyclic leftovers receive deterministic separate positions.
	const incoming = new Map([...nodes.keys()].map((id) => [id, 0]))
	for (const edge of edges) incoming.set(edge.to, incoming.get(edge.to)! + 1)
	const level = new Map<string, number>()
	const queue = [...nodes.keys()].filter((id) => incoming.get(id) === 0)
	for (const id of queue) level.set(id, 0)
	for (let index = 0; index < queue.length; index++) {
		const id = queue[index]
		for (const edge of edges.filter((edge) => edge.from === id)) {
			level.set(edge.to, Math.max(level.get(edge.to) ?? 0, level.get(id)! + 1))
			incoming.set(edge.to, incoming.get(edge.to)! - 1)
			if (incoming.get(edge.to) === 0) queue.push(edge.to)
		}
	}
	let nextLevel = Math.max(-1, ...level.values()) + 1
	for (const id of nodes.keys()) if (!queue.includes(id)) level.set(id, nextLevel++)
	const lanes = new Map<number, number>()
	const horizontal = direction === 'LR' || direction === 'RL'
	const reverse = direction === 'RL' || direction === 'BT'
	const positioned = [...nodes.values()].map((node) => {
		const rank = level.get(node.id) ?? 0, lane = lanes.get(rank) ?? 0
		lanes.set(rank, lane + 1)
		return {
			id: node.id, label: node.label ?? node.id, kind: node.kind ?? 'rectangle', color: 'black' as const,
			x: horizontal ? rank * 280 * (reverse ? -1 : 1) : lane * 240,
			y: horizontal ? lane * 160 : rank * 180 * (reverse ? -1 : 1),
			w: node.kind === 'diamond' ? 200 : node.kind === 'ellipse' ? 120 : 180,
			h: node.kind === 'diamond' || node.kind === 'ellipse' ? 120 : 90,
		}
	})
	const parsed = DiagramSchema.safeParse({ title: 'Mermaid flowchart', nodes: positioned, edges })
	if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid flowchart.')
	return parsed.data
}
