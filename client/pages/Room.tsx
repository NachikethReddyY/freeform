import { useSync } from '@tldraw/sync'
import { GeoShapeGeoStyle } from '@tldraw/tlschema'
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import {
	DefaultHelpMenu,
	DefaultFillStyle,
	DefaultMainMenu,
	DefaultMainMenuContent,
	DefaultMinimap,
	DefaultPageMenu,
	DefaultStylePanel,
	DefaultToolbar,
	StylePanelArrowheadPicker,
	StylePanelDashPicker,
	StylePanelButtonPicker,
	StylePanelFontPicker,
	StylePanelGeoShapePicker,
	StylePanelLabelAlignPicker,
	StylePanelOpacityPicker,
	StylePanelSizePicker,
	StylePanelSplinePicker,
	StylePanelTextAlignPicker,
	Tldraw,
	TldrawUiMenuGroup,
	TldrawUiMenuItem,
	ToolbarItem,
	type TLComponents,
	type TLUiOverrides,
	useActions,
	useEditor,
	useStylePanelContext,
	useValue,
} from 'tldraw'
import { boardAssetUrls, boardThemes } from '../editor/fontTheme'
import { CustomColorDefaults, FreeformColorPicker, freeformColorShapeUtils } from '../editor/excalidrawShapes'
import { FreeformStrokeControls, FreeformStrokeWidthPicker, FreeformTextSizePicker } from '../editor/excalidrawShapes/FreeformStrokeControls'
import { FreeformBackgroundPicker } from '../editor/excalidrawShapes/FreeformBackgroundPicker'
import { FreeformStrokeDefaults } from '../editor/excalidrawShapes/FreeformStrokeDefaults'
import { isRectangleGeo } from '../editor/excalidrawShapes/roundedRectangle'
import { useBoardIndex } from '../features/boards/boardIndex'
import { BoardPreviewRecorder } from '../features/boards/BoardPreviewRecorder'
import { CommandPalette } from '../features/commandPalette/CommandPalette'
import { DiagramProposalPanel } from '../features/diagrams/DiagramProposalPanel'
import { ConnectedNodeControls } from '../features/diagrams/connectedNodeControls'
import { canLayoutSelectedDiagram, layoutSelectedDiagram } from '../features/diagrams/layout'
import { PresentationControls } from '../features/presentation/presentation'
import { diagramFromClipboard, type IncomingPasteDiagram } from '../features/paste/diagramPaste'
import { cardFromClipboard, type IncomingPasteCard } from '../features/paste/cardPaste'
import { CardPastePanel } from '../features/paste/CardPastePanelEntry'
import { BoardFiles } from '../features/portability/BoardFiles'
import { BoardSearch } from '../features/search/SearchPanel'
import { AIChatPanel } from '../features/ai/AIChatPanel'
import { getBookmarkPreview } from '../getBookmarkPreview'
import { multiplayerAssetStore } from '../multiplayerAssetStore'

const boardOverrides: TLUiOverrides[] = [{
	translations: { en: { 'geo-style.freeform-rounded-rectangle': 'Rounded rectangle' } },
	tools(_editor, tools) {
		// The native geo tool already selects Diamond; register one unused direct key.
		return { ...tools, diamond: { ...tools.diamond, kbd: 'shift+r' } }
	},
}]

function BoardTopPanel() {
	const [compact, setCompact] = useState(() => window.innerWidth <= 1100)
	useEffect(() => {
		const media = window.matchMedia('(max-width: 1100px)')
		const update = () => setCompact(media.matches)
		media.addEventListener('change', update)
		return () => media.removeEventListener('change', update)
	}, [])
	const toolbarTools = compact ? [
		'select', 'hand', 'draw', 'arrow', 'text', 'rectangle',
		'eraser', 'ellipse', 'note', 'frame', 'asset', 'triangle', 'diamond', 'hexagon', 'oval', 'rhombus', 'star', 'cloud', 'heart',
		'x-box', 'check-box', 'arrow-left', 'arrow-up', 'arrow-down', 'arrow-right', 'line', 'highlight', 'laser',
	] : [
		'select', 'hand', 'draw', 'eraser', 'arrow', 'text', 'rectangle', 'ellipse', 'note', 'frame',
		'asset', 'triangle', 'diamond', 'hexagon', 'oval', 'rhombus', 'star', 'cloud', 'heart',
		'x-box', 'check-box', 'arrow-left', 'arrow-up', 'arrow-down', 'arrow-right',
		'line', 'highlight', 'laser',
	]
	return (
		<div className="freeform-top-tools">
			<DefaultToolbar minItems={compact ? 5 : 4} minSizePx={200} maxItems={compact ? 5 : 8} maxSizePx={compact ? 390 : 540}>
				{toolbarTools.map((tool) => <ToolbarItem key={tool} tool={tool} />)}
			</DefaultToolbar>
		</div>
	)
}

function BoardIdentity({ roomId }: { roomId: string }) {
	const navigate = useNavigate()
	const { boards, renameBoard } = useBoardIndex(roomId)
	const current = boards.find((board) => board.id === roomId)
	const [renaming, setRenaming] = useState(false)
	const [title, setTitle] = useState('')
	const cancelRename = useRef(false)
	const finishRename = () => {
		if (!cancelRename.current && title.trim()) renameBoard(roomId, title)
		cancelRename.current = false
		setRenaming(false)
	}
	return <div className="freeform-board-identity">
		<button type="button" className="freeform-dashboard-link" aria-label="Dashboard" title="Dashboard" onClick={() => navigate('/')}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /></svg>
		</button>
		{renaming ? <input autoFocus className="freeform-board-name-input" aria-label="Board name" maxLength={64} value={title}
			onChange={(event) => setTitle(event.target.value)} onBlur={finishRename}
			onKeyDown={(event) => { if (event.key === 'Enter') finishRename(); if (event.key === 'Escape') { cancelRename.current = true; setRenaming(false) } }} />
			: <button type="button" className="freeform-board-name" title="Rename board" onClick={() => { cancelRename.current = false; setTitle(current?.title ?? ''); setRenaming(true) }}>{current?.title ?? roomId}</button>}
	</div>
}

function BoardMainMenu({ onOpenDiagrams }: { onOpenDiagrams: () => void }) {
	const navigate = useNavigate()
	return <DefaultMainMenu>
		<TldrawUiMenuGroup id="freeform-navigation">
			<TldrawUiMenuItem id="freeform-home" label="Home" onSelect={() => navigate('/')} />
			<TldrawUiMenuItem id="freeform-diagrams" label="Diagrams and AI" kbd="alt+shift+d" onSelect={onOpenDiagrams} />
		</TldrawUiMenuGroup>
		<DefaultMainMenuContent />
	</DefaultMainMenu>
}

function BoardPresentationControls() {
	const editor = useEditor()
	const actions = useActions()
	const history = useValue('freeform history', () => ({ undo: editor.getCanUndo(), redo: editor.getCanRedo() }), [editor])
	return <><div className="freeform-bottom-controls">
		<BoardZoomPanel />
		<div className="freeform-history-controls" role="group" aria-label="History">
			<button type="button" aria-label="Undo" title="Undo" disabled={!history.undo} onClick={() => actions.undo.onSelect('navigation-zone')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 6 6" /></svg></button>
			<button type="button" aria-label="Redo" title="Redo" disabled={!history.redo} onClick={() => actions.redo.onSelect('navigation-zone')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6" /></svg></button>
		</div>
		<PresentationControls editor={editor} />
		<BoardSearch editor={editor} />
		<BoardFiles editor={editor} />
	</div><AIChatPanel /></>
}

function BoardZoomPanel() {
	const editor = useEditor()
	const actions = useActions()
	const zoom = useValue('freeform zoom', () => editor.getZoomLevel(), [editor])
	const presets = useRef<HTMLDetailsElement>(null)
	const [minimapOpen, setMinimapOpen] = useState(false)
	const setZoom = (percent: number) => {
		presets.current?.removeAttribute('open')
		if (percent === 100) {
			actions['zoom-to-100'].onSelect('navigation-zone')
			return
		}
		const nextZoom = percent / 100
		const current = editor.getCamera()
		const center = editor.getViewportScreenCenter()
		editor.setCamera({
			x: current.x + center.x / nextZoom - center.x / current.z,
			y: current.y + center.y / nextZoom - center.y / current.z,
			z: nextZoom,
		}, { animation: { duration: editor.options.animationMediumMs } })
	}
	return <div className="freeform-zoom" aria-label="Zoom controls">
			<button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => actions['zoom-out'].onSelect('navigation-zone')}>−</button>
			<details ref={presets} className="freeform-zoom-presets">
				<summary aria-label={`Zoom level ${Math.round(zoom * 100)} percent`}>{Math.round(zoom * 100)}%</summary>
				<div className="freeform-zoom-options" role="group" aria-label="Zoom presets">
					{[25, 50, 75, 100, 150, 200].map((percent) => <button key={percent} type="button" onClick={() => setZoom(percent)}>{percent}%</button>)}
					<button type="button" onClick={() => setZoom(100)}>Reset to 100%</button>
				</div>
			</details>
			<button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => actions['zoom-in'].onSelect('navigation-zone')}>+</button>
			<button type="button" aria-label="Minimap" title="Minimap" aria-pressed={minimapOpen} onClick={() => { presets.current?.removeAttribute('open'); setMinimapOpen((open) => !open) }}>
				<svg className="freeform-minimap-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><rect x="5.5" y="6.5" width="7" height="5" rx=".5" /><path d="M15 15h3m-3 2h3" /></svg>
			</button>
			{minimapOpen && <div className="freeform-minimap-panel" role="group" aria-label="Minimap navigation" onPointerDown={(event) => event.stopPropagation()}>
				<button type="button" className="freeform-minimap-close" aria-label="Close minimap" title="Close minimap" onClick={() => setMinimapOpen(false)}>×</button>
				<DefaultMinimap />
			</div>}
	</div>
}

function StyleGroup({ title, children }: { title: string; children: ReactNode }) {
	return <section className="freeform-style-group"><h3>{title}</h3>{children}</section>
}

const fillItems = [
	{ value: 'none', icon: 'fill-none' },
	{ value: 'semi', icon: 'fill-semi' },
	{ value: 'solid', icon: 'fill-solid' },
	{ value: 'pattern', icon: 'fill-pattern' },
	{ value: 'lined-fill', icon: 'fill-lined-fill' },
	{ value: 'fill', icon: 'fill-fill' },
] as const

function FreeformFillPicker() {
	const { styles } = useStylePanelContext()
	const fill = styles.get(DefaultFillStyle)
	if (!fill) return null
	return <StylePanelButtonPicker title="Fill" uiType="fill" style={DefaultFillStyle} items={fillItems} value={fill} />
}

function FreeformStylePanel() {
	const editor = useEditor()
	const actions = useActions()
	const selected = useValue('freeform selected shapes', () => editor.getSelectedShapes(), [editor])
	const canArrangeDiagram = useValue('freeform diagram layout availability', () => canLayoutSelectedDiagram(editor), [editor])
	const tool = useValue('freeform style tool', () => editor.getCurrentToolId(), [editor])
	const geo = useValue('freeform geo tool', () => editor.getStyleForNextShape(GeoShapeGeoStyle), [editor])
	const selectedCount = selected.length
	const isText = selectedCount ? selected.some((shape) => shape.type === 'text' || shape.type === 'note') : tool === 'text' || tool === 'note'
	const showGeometryBackground = selectedCount
		? selected.every((shape) => shape.type === 'geo')
		: tool === 'geo'
	const strokeKind = selectedCount
		? selected.every((shape) => shape.type === 'arrow') ? 'arrow'
			: selected.every((shape) => shape.type === 'line') ? 'line'
				: selected.every((shape) => shape.type === 'geo' && isRectangleGeo(shape.props.geo)) ? 'rectangle' : null
		: tool === 'arrow' || tool === 'line' ? tool : tool === 'geo' && isRectangleGeo(geo) ? 'rectangle' : null
	const supportsTextSize = selectedCount
		? selected.some((shape) => shape.type === 'geo' || shape.type === 'arrow' || shape.type === 'text' || shape.type === 'note')
		: tool === 'geo' || tool === 'arrow' || tool === 'text' || tool === 'note'
	const supportsStrokeWidth = selected.some((shape) => shape.type === 'geo' || shape.type === 'arrow' || shape.type === 'line')
	return <DefaultStylePanel>
		<StyleGroup title={isText ? 'Color' : 'Stroke'}><FreeformColorPicker /></StyleGroup>
		{showGeometryBackground && <StyleGroup title="Background"><FreeformBackgroundPicker /></StyleGroup>}
		{!isText && <StyleGroup title="Fill"><FreeformFillPicker /></StyleGroup>}
		{supportsStrokeWidth && <FreeformStrokeWidthPicker />}
		{strokeKind ? <FreeformStrokeControls kind={strokeKind} /> : !isText && <StyleGroup title="Stroke style"><StylePanelDashPicker /></StyleGroup>}
		{supportsTextSize ? <StyleGroup title="Text size"><FreeformTextSizePicker /></StyleGroup>
			: <StyleGroup title="Size"><StylePanelSizePicker /></StyleGroup>}
		<StyleGroup title="Opacity"><StylePanelOpacityPicker /></StyleGroup>
		{isText && <StyleGroup title="Text"><StylePanelFontPicker /><StylePanelTextAlignPicker /><StylePanelLabelAlignPicker /></StyleGroup>}
		{!isText && <section className="freeform-style-group freeform-style-group--shape"><StylePanelGeoShapePicker /><StylePanelArrowheadPicker /><StylePanelSplinePicker /></section>}
		{selectedCount === 1 && selected[0].type === 'geo' && <ConnectedNodeControls editor={editor} />}
		{selectedCount > 0 && <StyleGroup title="Layers"><div className="freeform-action-row">
			<button disabled={!selectedCount} title="Send to back" onClick={() => actions['send-to-back'].onSelect('toolbar')}>⇤</button>
			<button disabled={!selectedCount} title="Send backward" onClick={() => actions['send-backward'].onSelect('toolbar')}>↓</button>
			<button disabled={!selectedCount} title="Bring forward" onClick={() => actions['bring-forward'].onSelect('toolbar')}>↑</button>
			<button disabled={!selectedCount} title="Bring to front" onClick={() => actions['bring-to-front'].onSelect('toolbar')}>⇥</button>
		</div></StyleGroup>}
		{selectedCount > 0 && <StyleGroup title="Actions"><div className="freeform-action-row">
			{canArrangeDiagram && <button type="button" aria-label="Arrange diagram" title="Arrange diagram" onClick={() => layoutSelectedDiagram(editor)}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="7" height="6" rx="1"/><rect x="15" y="3" width="7" height="6" rx="1"/><rect x="15" y="15" width="7" height="6" rx="1"/><path d="M9 6h4m-2-2 2 2-2 2M18.5 9v4m-2-2 2 2 2-2"/></svg></button>}
			<button aria-label="Duplicate" disabled={!selectedCount} title="Duplicate" onClick={() => actions.duplicate.onSelect('toolbar')}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg></button>
			<button aria-label="Delete" disabled={!selectedCount} title="Delete" onClick={() => actions.delete.onSelect('toolbar')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 4h4m-8 3 1 13h10l1-13M10 11v5m4-5v5" /></svg></button>
		</div></StyleGroup>}
	</DefaultStylePanel>
}

function BoardMenuPanel({ roomId, styleHost }: { roomId: string; styleHost: HTMLElement | null }) {
	const editor = useEditor()
	const [panel, setPanel] = useState<'style' | 'diagrams' | 'paste'>('style')
	const [open, setOpen] = useState(true)
	const [incoming, setIncoming] = useState<(IncomingPasteDiagram & { id: string }) | undefined>()
	const [incomingCard, setIncomingCard] = useState<{ id: string; card: IncomingPasteCard; pageId: ReturnType<typeof editor.getCurrentPageId> }>()
	const styleContext = useValue('freeform style context', () => ({
		selected: editor.getSelectedShapeIds().length > 0,
		selectionKey: editor.getSelectedShapeIds().join(','),
		tool: editor.getCurrentToolId(),
	}), [editor])
	const darkMode = useValue('freeform dark mode', () => editor.user.getIsDarkMode(), [editor])
	const hasStyleSettings = styleContext.selected || !['select', 'hand', 'zoom', 'laser', 'eraser', 'asset', 'frame'].includes(styleContext.tool)
	const showPanel = open && (panel === 'diagrams' || panel === 'paste' || hasStyleSettings)
	useEffect(() => {
		if (!hasStyleSettings) return
		setIncoming(undefined)
		setPanel('style')
		setOpen(true)
	}, [hasStyleSettings, styleContext.tool, styleContext.selectionKey])
	useEffect(() => {
		const onDiagramPaste = (event: Event) => {
			setIncoming((event as CustomEvent<IncomingPasteDiagram & { id: string }>).detail)
			setPanel('diagrams')
			setOpen(true)
		}
		const win = editor.getContainer().ownerDocument.defaultView
		if (!win) return
		win.addEventListener('freeform:paste-diagram', onDiagramPaste)
		return () => win.removeEventListener('freeform:paste-diagram', onDiagramPaste)
	}, [editor])
	useEffect(() => {
		const onCardPaste = (event: Event) => {
			setIncomingCard((event as CustomEvent<{ id: string; card: IncomingPasteCard; pageId: ReturnType<typeof editor.getCurrentPageId> }>).detail)
			setPanel('paste')
			setOpen(true)
		}
		const win = editor.getContainer().ownerDocument.defaultView
		if (!win) return
		win.addEventListener('freeform:paste-card', onCardPaste)
		return () => win.removeEventListener('freeform:paste-card', onCardPaste)
	}, [editor])
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!event.altKey || !event.shiftKey || event.metaKey || event.ctrlKey || event.defaultPrevented || event.repeat) return
			if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
			if (editor.getEditingShapeId() || editor.menus.hasAnyOpenMenus() || !editor.user.getAreKeyboardShortcutsEnabled()) return
			switch (event.code) {
			case 'KeyD': setPanel('diagrams'); setOpen(true); break
			case 'KeyS': setIncoming(undefined); setPanel('style'); setOpen(true); break
			case 'KeyB': setOpen((wasOpen) => !wasOpen); break
			default: return
			}
			event.preventDefault()
		}
		const doc = editor.getContainer().ownerDocument
		doc.addEventListener('keydown', onKeyDown)
		return () => doc.removeEventListener('keydown', onKeyDown)
	}, [editor])
	return <>
		<div className="freeform-control-line"><BoardMainMenu onOpenDiagrams={() => { setPanel('diagrams'); setOpen(true) }} /><BoardIdentity roomId={roomId} /><span className="freeform-page-separator" aria-hidden="true">/</span><DefaultPageMenu /></div>
		{styleHost && createPortal(<div className={`freeform-left-shell tl-theme__${darkMode ? 'dark' : 'light'}`} data-open={open} data-panel={panel}>
			{showPanel && <div className="freeform-left-panel">
				<div className="freeform-panel-body">
					{panel === 'style' ? <FreeformStylePanel /> : panel === 'diagrams'
						? <DiagramProposalPanel editor={editor} roomId={roomId} incoming={incoming} onClose={() => { setIncoming(undefined); setPanel('style') }} />
						: incomingCard && <CardPastePanel key={incomingCard.id} editor={editor} card={incomingCard.card} pageId={incomingCard.pageId} onClose={() => { setIncomingCard(undefined); setPanel('style') }} />}
				</div>
			</div>}
		</div>, styleHost)}
	</>
}

export function Room() {
	const { roomId } = useParams<{ roomId: string }>()
	const [paletteOpen, setPaletteOpen] = useState(false)
	const [styleHost, setStyleHost] = useState<HTMLElement | null>(null)
	const boardComponents = useMemo<TLComponents>(() => ({
		Toolbar: null,
		TopPanel: BoardTopPanel,
		MenuPanel: () => <BoardMenuPanel roomId={roomId ?? ''} styleHost={styleHost} />,
		QuickActions: null,
		ActionsMenu: null,
		StylePanel: null,
		NavigationPanel: null,
		HelpMenu: DefaultHelpMenu,
		InFrontOfTheCanvas: BoardPresentationControls,
	}), [roomId, styleHost])

	// Create a store connected to multiplayer.
	const store = useSync({
		// We need to know the websockets URI...
		uri: `${window.location.origin}/api/connect/${roomId}`,
		// ...and how to handle static assets like images & videos
		assets: multiplayerAssetStore,
	})

	return (
		<RoomWrapper styleHostRef={setStyleHost}>
			<Tldraw
				// we can pass the connected store into the Tldraw component which will handle
				// loading states & enable multiplayer UX like cursors & a presence menu
				store={store}
				assetUrls={boardAssetUrls}
				shapeUtils={freeformColorShapeUtils}
				components={boardComponents}
				overrides={boardOverrides}
				themes={boardThemes}
				options={{ deepLinks: true, onClipboardPasteRaw: (info) => {
					if (info.source !== 'native-event' || info.editor.getEditingShapeId()) return
					const diagram = diagramFromClipboard(info.clipboardData)
					const win = info.editor.getContainer().ownerDocument.defaultView
					if (!win) return
					if (diagram) {
						win.dispatchEvent(new CustomEvent('freeform:paste-diagram', {
							detail: { ...diagram, id: crypto.randomUUID() },
						}))
						return false
					}
					const card = cardFromClipboard(info.clipboardData)
					if (card) {
						win.dispatchEvent(new CustomEvent('freeform:paste-card', {
							detail: { id: crypto.randomUUID(), card, pageId: info.editor.getCurrentPageId() },
						}))
						return false
					}
				} }}
				onMount={(editor) => {
					// when the editor is ready, we need to register our bookmark unfurling service
					editor.registerExternalAssetHandler('url', getBookmarkPreview)
				}}
			>
				<CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
				<CustomColorDefaults />
				<FreeformStrokeDefaults />
				<BoardPreviewRecorder roomId={roomId ?? ''} />
			</Tldraw>
		</RoomWrapper>
	)
}

function RoomWrapper({ children, styleHostRef }: { children: ReactNode; styleHostRef: (element: HTMLElement | null) => void }) {
	return (
		<div className="RoomWrapper">
			<div className="RoomWrapper-content">
				<aside ref={styleHostRef} className="RoomWrapper-style" aria-label="Board style and diagrams" />
				<div className="RoomWrapper-editor">{children}</div>
			</div>
		</div>
	)
}
