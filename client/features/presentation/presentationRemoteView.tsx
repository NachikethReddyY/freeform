import { useEffect, useRef, useState } from 'react'
import { connectPresentationRemote, normalizeRemotePoint, type PresentationRemoteCommand, type PresentationRemoteState } from './presentationRemote'
import './presentationRemoteView.css'

function RemoteIcon({ name }: { name: 'previous' | 'next' | 'laser' | 'exit' }) {
	const paths = {
		previous: <path d="m15 18-6-6 6-6" />,
		next: <path d="m9 6 6 6-6 6" />,
		laser: <><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" /><path d="M12 3v4m0 10v4M3 12h4m10 0h4" /></>,
		exit: <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5m4-4 4-4-4-4m-7 4h11" /></>,
	}
	return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

/** A focused second-tab control surface. It never opens another sync connection to edit the board. */
export function PresentationRemoteView({ roomId, sessionId }: { roomId: string; sessionId: string }) {
	const [state, setState] = useState<PresentationRemoteState | null>(null)
	const [connected, setConnected] = useState(false)
	const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
	const client = useRef<ReturnType<typeof connectPresentationRemote> | null>(null)
	const lastSeen = useRef(0)
	const lastMove = useRef(0)

	useEffect(() => {
		try {
			const remote = connectPresentationRemote({ roomId, sessionId, onState: (next) => {
				setState(next)
				setConnected(next.presenting)
				lastSeen.current = Date.now()
			} })
			client.current = remote
			const heartbeat = window.setInterval(() => {
				remote.requestState()
				if (lastSeen.current && Date.now() - lastSeen.current > 8000) setConnected(false)
			}, 2500)
			return () => { window.clearInterval(heartbeat); remote.dispose(); client.current = null }
		} catch {
			setConnected(false)
			return undefined
		}
	}, [roomId, sessionId])

	const send = (command: PresentationRemoteCommand) => {
		if (connected) client.current?.send(command)
	}
	const sendPoint = (event: React.PointerEvent<HTMLButtonElement>, action: 'laser-move' | 'laser-pulse') => {
		const normalized = normalizeRemotePoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
		setPoint(normalized)
		send({ action, ...normalized })
	}
	const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
		if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
		if (performance.now() - lastMove.current < 16) return
		lastMove.current = performance.now()
		sendPoint(event, 'laser-move')
	}

	return <div className="freeform-presentation-remote" data-testid="presentation-remote">
		<main className="freeform-presentation-remote__panel">
			<header className="freeform-presentation-remote__header">
				<strong>Presentation remote</strong>
				<span className={connected ? 'is-connected' : ''} role="status">{connected ? 'Connected' : 'Waiting for presentation'}</span>
			</header>
			<div className="freeform-presentation-remote__slide" aria-live="polite">
				<span>{state?.title || 'Slide'}</span>
				<strong>{state?.presenting ? `${state.index + 1} / ${state.count}` : '—'}</strong>
			</div>
			<div className="freeform-presentation-remote__navigation">
				<button type="button" disabled={!connected || (state?.index ?? 0) <= 0} aria-label="Previous slide" onClick={() => send({ action: 'previous' })}><RemoteIcon name="previous" /><span>Previous</span></button>
				<button type="button" disabled={!connected || (state?.index ?? 0) >= (state?.count ?? 0) - 1} aria-label="Next slide" onClick={() => send({ action: 'next' })}><RemoteIcon name="next" /><span>Next</span></button>
			</div>
			<button type="button" className="freeform-presentation-remote__touchpad" disabled={!connected} aria-label="Laser touchpad" title="Touch or drag to point on the slide"
				onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); sendPoint(event, 'laser-pulse') }}
				onPointerMove={onPointerMove}
				onPointerUp={() => { send({ action: 'laser-clear' }); setPoint(null) }}
				onPointerCancel={() => { send({ action: 'laser-clear' }); setPoint(null) }}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); send({ action: 'laser-pulse', x: 0.5, y: 0.5 }) }
				}}
			>
				{point ? <span className="freeform-presentation-remote__point" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} /> : <RemoteIcon name="laser" />}
				<span className="freeform-presentation-remote__touchpad-label">Laser touchpad</span>
			</button>
			<footer className="freeform-presentation-remote__footer">
				<button type="button" disabled={!connected} aria-label={state?.laserActive ? 'Turn laser pointer off' : 'Turn laser pointer on'} aria-pressed={Boolean(state?.laserActive)} title="Toggle laser pointer" onClick={() => send({ action: 'laser-toggle' })}><RemoteIcon name="laser" /></button>
				<button type="button" disabled={!connected} aria-label="End presentation" title="End presentation" onClick={() => send({ action: 'exit' })}><RemoteIcon name="exit" /></button>
			</footer>
		</main>
	</div>
}
