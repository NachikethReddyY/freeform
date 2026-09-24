import { useEditor, useStylePanelContext, useValue, DefaultDashStyle, DefaultSizeStyle, GeoShapeGeoStyle, getArrowInfo, type TLArrowShape, type TLGeoShape, type TLLineShape } from 'tldraw'
import { curvePointFromMeta, withCurvePoint } from './arrowCurve'
import { ROUNDED_RECTANGLE, isRectangleGeo } from './roundedRectangle'
import { getDefaultSloppiness, getSloppiness, setDefaultSloppiness, withSloppiness, type Sloppiness } from './sloppiness'
import './strokeControls.css'

type StrokeShape = TLLineShape | TLGeoShape
type ControlOption<T> = { value: T; label: string; path: string }

function ControlRow<T extends string | number>({ title, options, value, onChange }: {
	title: string; options: readonly ControlOption<T>[]; value: T | null; onChange: (value: T) => void
}) {
	return <fieldset className="freeform-stroke-control">
		<legend>{title}</legend>
		<div className="freeform-stroke-control__choices">
			{options.map((option) => <button key={option.value} type="button" aria-label={`${title} — ${option.label}`}
				aria-pressed={value === option.value} title={option.label} onClick={() => onChange(option.value)}>
				<svg viewBox="0 0 32 32" aria-hidden="true"><path d={option.path} /></svg>
			</button>)}
		</div>
	</fieldset>
}

const widths = [
	{ value: 's', label: 'Thin', path: 'M7 16h18' },
	{ value: 'm', label: 'Medium', path: 'M7 16h18' },
	{ value: 'l', label: 'Bold', path: 'M7 16h18' },
] as const
const dashes = [
	{ value: 'solid', label: 'Solid', path: 'M5 16h22' },
	{ value: 'dashed', label: 'Dashed', path: 'M5 16h4m4 0h5m4 0h5' },
	{ value: 'dotted', label: 'Dotted', path: 'M6 16h.1m5 0h.1m5 0h.1m5 0h.1m5 0h.1' },
] as const
const roughness = [
	{ value: 0, label: 'Architect', path: 'M4 23 26 9' },
	{ value: 1, label: 'Artist', path: 'M4 23q9-9 16-10l-2 7 9-5' },
	{ value: 2, label: 'Cartoonist', path: 'M4 23q7-11 16-10l-4 8 11-7' },
] as const
const arrowKinds = [
	{ value: 'straight', label: 'Straight', path: 'M5 26 25 6m-8 0h8v8' },
	{ value: 'curved', label: 'Curved', path: 'M5 25Q4 10 25 9m-7-5 7 5-7 5' },
	{ value: 'elbow', label: 'Elbow', path: 'M5 25h11V9h10m-6-5 6 5-6 5' },
] as const
const edges = [
	{ value: 'rectangle', label: 'Sharp', path: 'M6 6h20v20H6z' },
	{ value: ROUNDED_RECTANGLE, label: 'Rounded', path: 'M12 6h8q6 0 6 6v8q0 6-6 6h-8q-6 0-6-6v-8q0-6 6-6z' },
] as const

export function FreeformStrokeControls({ kind }: { kind: 'line' | 'rectangle' | 'arrow' }) {
	const editor = useEditor()
	const { styles, onValueChange } = useStylePanelContext()
	const sizeStyle = styles.get(DefaultSizeStyle)
	const dashStyle = styles.get(DefaultDashStyle)
	const size = sizeStyle?.type === 'shared' ? sizeStyle.value : null
	const dash = dashStyle?.type === 'shared' ? dashStyle.value : null
	const selection = useValue('freeform stroke controls', () => editor.getSelectedShapes(), [editor])
	const strokeShapes = selection.filter((shape): shape is StrokeShape => shape.type === 'line' || (shape.type === 'geo' && isRectangleGeo(shape.props.geo)))
	const rectangleShapes = selection.filter((shape): shape is TLGeoShape => shape.type === 'geo' && isRectangleGeo(shape.props.geo))
	const nextGeo = editor.getStyleForNextShape(GeoShapeGeoStyle)
	const commonEdge = rectangleShapes.length
		? rectangleShapes.every((shape) => shape.props.geo === rectangleShapes[0].props.geo) ? rectangleShapes[0].props.geo : null
		: nextGeo
	const commonSlop = strokeShapes.length && strokeShapes.every((shape) => getSloppiness(shape) === getSloppiness(strokeShapes[0]))
		? getSloppiness(strokeShapes[0]) : strokeShapes.length ? null : getDefaultSloppiness(editor)
	const arrows = selection.filter((shape): shape is TLArrowShape => shape.type === 'arrow')
	const arrowKind = (shape: TLArrowShape) => shape.props.kind === 'elbow' ? 'elbow' : curvePointFromMeta(shape) || shape.props.bend !== 0 ? 'curved' : 'straight'
	const commonArrow = arrows.length && arrows.every((shape) => arrowKind(shape) === arrowKind(arrows[0])) ? arrowKind(arrows[0]) : arrows.length ? null : 'straight'
	const readonly = editor.getIsReadonly()
	const changeSloppiness = (level: Sloppiness) => {
		if (readonly) return
		setDefaultSloppiness(editor, level)
		editor.run(() => {
			if (strokeShapes.length) editor.updateShapes(strokeShapes.map((shape) => ({ id: shape.id, type: shape.type, meta: withSloppiness(shape, level),
				props: { dash: shape.props.dash === 'draw' || shape.props.dash === 'solid' ? level === 0 ? 'solid' : 'draw' : shape.props.dash } })))
			if (kind !== 'arrow') editor.setStyleForNextShapes(DefaultDashStyle, level === 0 ? 'solid' : 'draw')
		})
	}
	const changeArrow = (value: 'straight' | 'curved' | 'elbow') => {
		if (readonly) return
		editor.run(() => editor.updateShapes(arrows.map((shape) => {
			if (value === 'elbow') return { id: shape.id, type: shape.type, props: { kind: 'elbow' as const } }
			if (value === 'straight') return { id: shape.id, type: shape.type, props: { kind: 'arc' as const, bend: 0 }, meta: { ...shape.meta, freeformCurve: null } }
			const info = getArrowInfo(editor, shape)
			if (!info || curvePointFromMeta(shape)) return { id: shape.id, type: shape.type, props: { kind: 'arc' as const } }
			const start = info.start.point, end = info.end.point
			const length = Math.hypot(end.x - start.x, end.y - start.y) || 1
			const control = { x: (start.x + end.x) / 2 + (end.y - start.y) / length * 40,
				y: (start.y + end.y) / 2 - (end.x - start.x) / length * 40 }
			return { id: shape.id, type: shape.type, props: { kind: 'arc' as const, bend: 40 }, meta: withCurvePoint(shape, control) }
		})))
	}
	return <div className="freeform-stroke-controls" aria-disabled={readonly}>
		<ControlRow<'s' | 'm' | 'l'> title="Stroke width" options={widths} value={size === 'xl' ? 'l' : size === 's' || size === 'm' || size === 'l' ? size : null} onChange={(value) => onValueChange(DefaultSizeStyle, value)} />
		<ControlRow<'solid' | 'dashed' | 'dotted'> title="Stroke style" options={dashes} value={dash === 'draw' ? 'solid' : dash === 'solid' || dash === 'dashed' || dash === 'dotted' ? dash : null} onChange={(value) => onValueChange(DefaultDashStyle, value === 'solid' && commonSlop !== 0 ? 'draw' : value)} />
		{kind !== 'arrow' && <ControlRow title="Sloppiness" options={roughness} value={commonSlop} onChange={changeSloppiness} />}
		{kind === 'rectangle' && <ControlRow title="Edges" options={edges} value={isRectangleGeo(commonEdge ?? '') ? commonEdge : null} onChange={(value) => onValueChange(GeoShapeGeoStyle, value)} />}
		{kind === 'arrow' && arrows.length > 0 && <ControlRow title="Arrow type" options={arrowKinds} value={commonArrow} onChange={changeArrow} />}
	</div>
}
