import { useState } from 'react'
import { useValue, type Editor } from 'tldraw'
import { addConnectedNode, canAddConnectedNode, getConnectedNodeSource, type ConnectedNodeDirection } from './connectedNode'
import './connectedNode.css'

const directions: { direction: ConnectedNodeDirection; rotation: number }[] = [
	{ direction: 'up', rotation: -90 },
	{ direction: 'right', rotation: 0 },
	{ direction: 'down', rotation: 90 },
	{ direction: 'left', rotation: 180 },
]

/** Mount inside an editor-aware contextual panel, e.g. below native shape styles. */
export function ConnectedNodeControls({ editor }: { editor: Editor }) {
	const [error, setError] = useState<{ sourceId: string; message: string } | null>(null)
	const state = useValue('connected node controls', () => ({
		source: getConnectedNodeSource(editor),
		canAdd: canAddConnectedNode(editor),
	}), [editor])
	if (!state.source) return null
	const sourceId = state.source.id

	return <fieldset className="freeform-connected-node">
		<legend>Connect</legend>
		<div className="freeform-connected-node__choices">
			{directions.map(({ direction, rotation }) => <button
				key={direction} type="button" disabled={!state.canAdd}
				aria-label={`Add connected node ${direction}`}
				title={`Add connected node ${direction}`}
				onPointerDown={(event) => event.stopPropagation()}
				onKeyDown={(event) => event.stopPropagation()}
				onClick={() => {
					try {
						setError(addConnectedNode(editor, direction) ? null : { sourceId, message: 'Could not add a connection. Try again.' })
					} catch { setError({ sourceId, message: 'Could not add a connection. Try again.' }) }
				}}
			>
				<svg viewBox="0 0 32 32" aria-hidden="true"><g transform={`rotate(${rotation} 16 16)`}>
					<rect x="2.5" y="11.5" width="9" height="9" rx="1.5" />
					<path d="M13 16h8m-3-3 3 3-3 3" />
					<rect x="22" y="11.5" width="8" height="9" rx="1.5" />
				</g></svg>
			</button>)}
		</div>
		{error?.sourceId === sourceId && <p className="freeform-connected-node__error" role="alert">{error.message}</p>}
	</fieldset>
}
