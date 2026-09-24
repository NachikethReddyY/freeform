import { useId } from 'react'
import type { Diagram } from '../../../shared/diagram'
import { diagramBounds, nativeNodeBounds } from './native'

export function DiagramPreview({ diagram }: { diagram: Diagram }) {
	const marker = useId().replaceAll(':', '')
	const bounds = diagramBounds(diagram)
	const nodes = new Map(diagram.nodes.map((node) => [node.id, nativeNodeBounds(node)]))
	return (
		<svg className="wboard-diagrams-preview" role="img" aria-label={`${diagram.title}: ${diagram.nodes.length} nodes and ${diagram.edges.length} arrows`} viewBox={`${bounds.x - 32} ${bounds.y - 32} ${bounds.w + 64} ${bounds.h + 64}`}>
			<defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
			{diagram.edges.map((edge) => {
				const from = nodes.get(edge.from)!, to = nodes.get(edge.to)!
				const sx = from.x + from.w / 2, sy = from.y + from.h / 2, tx = to.x + to.w / 2, ty = to.y + to.h / 2
				const dx = tx - sx, dy = ty - sy
				const edgeOffset = Math.min(to.w / 2 / (Math.abs(dx) || 1), to.h / 2 / (Math.abs(dy) || 1), 0.48)
				return <g key={edge.id}><line x1={sx} y1={sy} x2={tx - dx * edgeOffset} y2={ty - dy * edgeOffset} stroke="currentColor" strokeWidth="2" markerEnd={`url(#${marker})`} />{edge.label && <text x={(sx + tx) / 2} y={(sy + ty) / 2 - 8} textAnchor="middle" fill="currentColor" fontSize="15">{edge.label}</text>}</g>
			})}
			{[...nodes.values()].map((node) => <g key={node.id}>
				{node.kind === 'ellipse'
					? <ellipse cx={node.x + node.w / 2} cy={node.y + node.h / 2} rx={node.w / 2} ry={node.h / 2} />
					: node.kind === 'diamond'
						? <polygon points={`${node.x + node.w / 2},${node.y} ${node.x + node.w},${node.y + node.h / 2} ${node.x + node.w / 2},${node.y + node.h} ${node.x},${node.y + node.h / 2}`} />
						: <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={node.kind === 'note' ? 0 : 6} />}
				<foreignObject x={node.x + 12} y={node.y + 10} width={node.w - 24} height={node.h - 20}><div className="wboard-diagrams-node-label">{node.label}</div></foreignObject>
			</g>)}
		</svg>
	)
}
