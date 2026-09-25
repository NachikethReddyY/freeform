import { useEffect, useRef, useState } from 'react'
import type { Editor, TLFrameShape, TLShapeId } from 'tldraw'
import { createPresentationRemoteHost, getPresentationRemoteUrl, type PresentationRemoteCommand, type PresentationRemoteState } from './presentationRemote'

interface SlideBounds { x: number; y: number; w: number; h: number }

/** Keep the original canvas positions so the transition moves in the same direction as the frames. */
export function getPresentationCamera(bounds: SlideBounds, viewportWidth: number, viewportHeight: number) {
	const padding = Math.min(48, Math.max(18, Math.min(viewportWidth, viewportHeight) * 0.045))
	const scale = Math.min(
		Math.max(1, viewportWidth - padding * 2) / Math.max(1, bounds.w),
		Math.max(1, viewportHeight - padding * 2) / Math.max(1, bounds.h)
	)
	return {
		x: viewportWidth / 2 - (bounds.x + bounds.w / 2) * scale,
		y: viewportHeight / 2 - (bounds.y + bounds.h / 2) * scale,
		scale,
	}
}

/** tldraw's single-frame SVG path excludes the frame outline and preserves nested content. */
export async function exportPresentationSlide(editor: Editor, frame: TLFrameShape, darkMode = false) {
	const bounds = editor.getShapePageBounds(frame.id)
	if (!bounds) return undefined
	const result = await editor.getSvgString([frame.id], { bounds, background: false, darkMode, padding: 0 })
	return { svg: result?.svg ?? '', bounds }
}

function Icon({ name }: { name: 'previous' | 'next' | 'laser' | 'hide' | 'show' | 'close' | 'dark' | 'light' | 'remote' }) {
	const path = {
		previous: <path d="m14.5 5-7 7 7 7" />,
		next: <path d="m9.5 5 7 7-7 7" />,
		laser: <><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" /><path d="M12 3v4m0 10v4M3 12h4m10 0h4" /></>,
		hide: <><path d="M4.5 8C7 5.8 9.4 5 12 5c4.5 0 8 3.4 9.5 7-1 2.2-2.7 4-4.7 5.2M9.7 18.7c-3.2-.7-5.7-3.2-7.2-6.7.5-1.1 1.2-2.1 2-2.9M3 3l18 18" /><path d="M10 10a3 3 0 0 0 4 4" /></>,
		show: <><path d="M2.5 12C4.3 8 7.7 5 12 5s7.7 3 9.5 7c-1.8 4-5.2 7-9.5 7s-7.7-3-9.5-7Z" /><circle cx="12" cy="12" r="3" /></>,
		close: <path d="M5 5 19 19M19 5 5 19" />,
		dark: <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.6 8.6 0 1 0 20.5 14.5Z" />,
		light: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19" /></>,
		remote: <><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18.5h2M4 8.5a8 8 0 0 0 0 7m16-7a8 8 0 0 1 0 7" /></>,
	}[name]
	return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{path}</svg>
}

interface LaserPoint { id: number; x: number; y: number }
interface LaserSegment { id: number; x1: number; y1: number; x2: number; y2: number }

export function getLaserSegment(previous: { x: number; y: number; at: number } | null, x: number, y: number, now: number, id: number): LaserSegment | null {
	if (!previous || now - previous.at > 130) return null
	const distance = Math.hypot(x - previous.x, y - previous.y)
	if (distance < 2 || distance > 320) return null
	return { id, x1: previous.x, y1: previous.y, x2: x, y2: y }
}

export interface PresentationStageProps {
	editor: Editor
	frames: readonly TLFrameShape[]
	index: number
	previousFrameId: TLShapeId | null
	onPrevious(): void
	onNext(): void
	onExit(): void
}

export function PresentationStage({ editor, frames, index, previousFrameId, onPrevious, onNext, onExit }: PresentationStageProps) {
	const surfaceRef = useRef<HTMLDivElement>(null)
	const remoteHost = useRef<ReturnType<typeof createPresentationRemoteHost> | null>(null)
	const remoteState = useRef<PresentationRemoteState>({ presenting: true, index, count: frames.length, title: '', laserActive: false })
	const remoteActions = useRef({ onPrevious, onNext, onExit })
	const objectUrls = useRef(new Map<string, string>())
	const pending = useRef(new Set<string>())
	const mounted = useRef(false)
	const pointId = useRef(0)
	const lastLaserPoint = useRef<{ x: number; y: number; at: number } | null>(null)
	const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
	const [, redraw] = useState(0)
	const [controlsHidden, setControlsHidden] = useState(false)
	const [remoteOpen, setRemoteOpen] = useState(false)
	const [remoteCopied, setRemoteCopied] = useState(false)
	const [laserActive, setLaserActive] = useState(false)
	const [darkMode, setDarkMode] = useState(false)
	const [trail, setTrail] = useState<LaserSegment[]>([])
	const [pulse, setPulse] = useState<LaserPoint | null>(null)
	const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
	const active = frames[index]
	const visible = frames.filter((frame) => frame.id === active?.id || frame.id === previousFrameId)
	const position = index + 1
	const title = active?.props.name.trim() || `Slide ${position}`
	remoteState.current = { presenting: true, index, count: frames.length, title, laserActive }
	remoteActions.current = { onPrevious, onNext, onExit }

	const moveLaser = (x: number, y: number) => {
		const now = performance.now()
		const segment = getLaserSegment(lastLaserPoint.current, x, y, now, ++pointId.current)
		lastLaserPoint.current = { x, y, at: now }
		setPointer({ x, y })
		if (!segment) return
		setTrail((current) => [...current.slice(-23), segment])
		window.setTimeout(() => setTrail((current) => current.filter((item) => item.id !== segment.id)), 460)
	}

	useEffect(() => {
		const roomId = window.location.pathname.slice(1)
		if (!/^[a-zA-Z0-9_-]{1,128}$/.test(roomId)) return
		const host = createPresentationRemoteHost({ roomId, getState: () => remoteState.current, onCommand: (command: PresentationRemoteCommand) => {
			switch (command.action) {
				case 'previous': remoteActions.current.onPrevious(); break
				case 'next': remoteActions.current.onNext(); break
				case 'exit': remoteActions.current.onExit(); break
				case 'laser-toggle': setLaserActive((value) => !value); break
				case 'laser-clear': setPointer(null); lastLaserPoint.current = null; break
				case 'laser-move': {
					setLaserActive(true)
					moveLaser(command.x * (surfaceRef.current?.clientWidth ?? window.innerWidth), command.y * (surfaceRef.current?.clientHeight ?? window.innerHeight))
					break
				}
				case 'laser-pulse': {
					setLaserActive(true)
					const next = { id: ++pointId.current, x: command.x * (surfaceRef.current?.clientWidth ?? window.innerWidth), y: command.y * (surfaceRef.current?.clientHeight ?? window.innerHeight) }
					moveLaser(next.x, next.y)
					setPulse(next)
					window.setTimeout(() => setPulse((current) => current?.id === next.id ? null : current), 420)
					break
				}
			}
		} })
		remoteHost.current = host
		return () => { remoteHost.current = null; host.dispose() }
	}, [])

	useEffect(() => { remoteHost.current?.publishState() }, [index, frames.length, title, laserActive])

	useEffect(() => {
		const element = surfaceRef.current
		if (!element) return
		const update = () => setSize({ width: element.clientWidth, height: element.clientHeight })
		update()
		const observer = new ResizeObserver(update)
		observer.observe(element)
		return () => observer.disconnect()
	}, [])

	useEffect(() => {
		// Preload neighbors so moving to the next frame normally has no empty state.
		const needed = [frames[index - 1], frames[index], frames[index + 1], frames.find((frame) => frame.id === previousFrameId)]
		for (const frame of needed) {
			if (!frame) continue
			const key = `${frame.id}:${darkMode ? 'dark' : 'light'}`
			if (objectUrls.current.has(key) || pending.current.has(key)) continue
			pending.current.add(key)
			void exportPresentationSlide(editor, frame, darkMode).then((slide) => {
				pending.current.delete(key)
				if (!slide || !mounted.current || !slide.svg) return
				const url = URL.createObjectURL(new Blob([slide.svg], { type: 'image/svg+xml' }))
				objectUrls.current.set(key, url)
				redraw((value) => value + 1)
			}).catch(() => { pending.current.delete(key) })
		}
	}, [editor, frames, index, previousFrameId, darkMode])

	useEffect(() => {
		mounted.current = true
		return () => {
			mounted.current = false
			for (const url of objectUrls.current.values()) URL.revokeObjectURL(url)
			objectUrls.current.clear()
		}
	}, [])

	useEffect(() => { setTrail([]); setPulse(null); setPointer(null); lastLaserPoint.current = null }, [index])

	const activeBounds = active ? editor.getShapePageBounds(active.id) : undefined
	const camera = activeBounds ? getPresentationCamera(activeBounds, size.width, size.height) : null
	const coordinate = (event: React.PointerEvent<HTMLDivElement>) => {
		const rect = event.currentTarget.getBoundingClientRect()
		return { x: event.clientX - rect.left, y: event.clientY - rect.top }
	}
	const pulsePointer = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!laserActive || event.button !== 0) return
		const point = coordinate(event)
		const next = { ...point, id: ++pointId.current }
		moveLaser(point.x, point.y)
		setPulse(next)
		window.setTimeout(() => setPulse((current) => current?.id === next.id ? null : current), 420)
	}
	const movePointer = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!laserActive) return
		const point = coordinate(event)
		moveLaser(point.x, point.y)
	}
	const remoteUrl = remoteHost.current ? getPresentationRemoteUrl(window.location.href, remoteHost.current.sessionId) : ''

	return <div ref={surfaceRef} className={`freeform-presentation-stage${darkMode ? ' freeform-presentation-stage--dark' : ''}`} role="group" aria-label="Presentation" data-testid="presentation-stage"
		onPointerDown={pulsePointer} onPointerMove={movePointer} onPointerLeave={() => { setPointer(null); lastLaserPoint.current = null }}>
		<div className="freeform-presentation-stage__world" style={{ transform: camera ? `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` : undefined }}>
			{visible.map((frame) => {
				const bounds = editor.getShapePageBounds(frame.id)
				if (!bounds) return null
				return <div key={frame.id} className="freeform-presentation-stage__slide" data-frame-id={frame.id}
					style={{ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h }}>
					{objectUrls.current.get(`${frame.id}:${darkMode ? 'dark' : 'light'}`)
						? <img src={objectUrls.current.get(`${frame.id}:${darkMode ? 'dark' : 'light'}`)} alt="" draggable={false} />
						: darkMode && objectUrls.current.get(`${frame.id}:light`)
							? <img src={objectUrls.current.get(`${frame.id}:light`)} className="freeform-presentation-stage__fallback" alt="" draggable={false} />
							: null}
				</div>
			})}
		</div>
		{laserActive && <svg className="freeform-presentation-stage__laser" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
			{trail.map((segment) => <g key={segment.id} className="freeform-presentation-stage__laser-trail"><line className="freeform-presentation-stage__laser-trail-glow" x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2} /><line className="freeform-presentation-stage__laser-trail-core" x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2} /></g>)}
			{pointer && <><circle className="freeform-presentation-stage__laser-glow" cx={pointer.x} cy={pointer.y} r="12" /><circle className="freeform-presentation-stage__laser-dot" cx={pointer.x} cy={pointer.y} r="4" /></>}
			{pulse && <circle key={pulse.id} className="freeform-presentation-stage__laser-pulse" cx={pulse.x} cy={pulse.y} r="5" />}
		</svg>}
		{controlsHidden ? <button type="button" className="freeform-presentation-stage__reveal" aria-label="Show presentation controls" title="Show controls" onPointerDown={(event) => event.stopPropagation()} onPointerMove={(event) => event.stopPropagation()} onClick={() => setControlsHidden(false)}><Icon name="show" /></button>
			: <div className="freeform-presentation-stage__controls" role="group" aria-label="Presentation controls" data-testid="presentation-controls" onPointerDown={(event) => event.stopPropagation()} onPointerMove={(event) => event.stopPropagation()}>
				<button type="button" aria-label="Previous slide" title="Previous slide" disabled={position <= 1} onClick={onPrevious}><Icon name="previous" /></button>
				<span className="freeform-presentation-stage__count" aria-live="polite" data-testid="presentation-position">{position} / {frames.length}</span>
				<span className="freeform-presentation-stage__title" title={title} data-testid="presentation-title">{title}</span>
				<button type="button" aria-label="Next slide" title="Next slide" disabled={position >= frames.length} onClick={onNext}><Icon name="next" /></button>
				<span className="freeform-presentation-stage__divider" />
				<button type="button" aria-label={darkMode ? 'Use light slide background' : 'Use dark slide background'} title={darkMode ? 'Light slides' : 'Dark slides'} aria-pressed={darkMode} onClick={() => setDarkMode((value) => !value)}><Icon name={darkMode ? 'light' : 'dark'} /></button>
				<button type="button" aria-label={laserActive ? 'Turn laser pointer off' : 'Turn laser pointer on'} title="Laser pointer" aria-pressed={laserActive} onClick={() => { setLaserActive((value) => !value); setPointer(null); setTrail([]); setPulse(null); lastLaserPoint.current = null }}><Icon name="laser" /></button>
				<button type="button" aria-label="Presentation remote" title="Presentation remote" aria-expanded={remoteOpen} onClick={() => setRemoteOpen((value) => !value)}><Icon name="remote" /></button>
				<button type="button" aria-label="Hide presentation controls" title="Hide controls" onClick={() => setControlsHidden(true)}><Icon name="hide" /></button>
				<button type="button" aria-label="Exit presentation" title="End presentation" onClick={onExit}><Icon name="close" /></button>
				{remoteOpen && <div className="freeform-presentation-stage__remote-popover" onPointerDown={(event) => event.stopPropagation()}>
					<strong>Remote control</strong><p>Open this link in another browser on this computer.</p>
					<input aria-label="Remote link" value={remoteUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
					<div>
						<button type="button" disabled={!remoteUrl} onClick={() => { void navigator.clipboard.writeText(remoteUrl).then(() => { setRemoteCopied(true); window.setTimeout(() => setRemoteCopied(false), 1600) }) }}>{remoteCopied ? 'Copied' : 'Copy link'}</button>
						<button type="button" disabled={!remoteUrl} onClick={() => window.open(remoteUrl, '_blank', 'noopener,noreferrer')}>Open in tab</button>
					</div>
				</div>}
			</div>}
	</div>
}
