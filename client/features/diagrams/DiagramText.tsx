import type { Diagram } from '../../../shared/diagram'

export function DiagramText({ diagram }: { diagram: Diagram }) {
	return <details className="wboard-diagrams-text">
		<summary>Diagram text</summary>
		<ul>{diagram.nodes.map((node) => <li key={node.id}><strong>{node.id}</strong>: {node.label}</li>)}</ul>
		{diagram.edges.length > 0 && <ul>{diagram.edges.map((edge) => <li key={edge.id}>{edge.from} → {edge.to}{edge.label ? `: ${edge.label}` : ''}</li>)}</ul>}
	</details>
}
