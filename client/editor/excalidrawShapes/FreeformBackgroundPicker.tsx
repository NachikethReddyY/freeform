import { DefaultFillStyle, useEditor, useStylePanelContext, useValue, type TLGeoShape } from 'tldraw'
import { getSelectedColorShapes } from './actions'
import { getDisplayedBackgroundColor, nextFillForBackground, withBackgroundColor, withoutBackgroundColor } from './backgroundColor'
import { getDefaultBackgroundColor, setDefaultBackgroundColor } from './backgroundState'
import { normalizeHexColor, type HexColor } from './colors'

const presets = [
	{ color: '#ffffff', label: 'White background' },
	{ color: '#ff8787', label: 'Coral background' },
	{ color: '#339653', label: 'Green background' },
	{ color: '#60a5fa', label: 'Blue background' },
	{ color: '#e59a2e', label: 'Amber background' },
	{ color: '#d7a1f9', label: 'Lilac background' },
] as const

export function FreeformBackgroundPicker() {
	const editor = useEditor()
	const { styles } = useStylePanelContext()
	const fill = styles.get(DefaultFillStyle)
	const selection = useValue('freeform background colors', () => {
		const selected = editor.getSelectedShapes()
		const geometries = getSelectedColorShapes(editor).filter((shape): shape is TLGeoShape => shape.type === 'geo')
		const colors = geometries.map(getDisplayedBackgroundColor)
		return {
			selectedCount: selected.length,
			geometries: geometries.length,
			key: geometries.map((shape) => `${shape.id}:${shape.props.fill}:${getDisplayedBackgroundColor(shape)}`).join('|'),
			color: colors.length && colors.every((color) => color === colors[0]) ? colors[0] : null,
			transparent: geometries.length > 0 && geometries.every((shape) => shape.props.fill === 'none'),
			readonly: editor.getIsReadonly(),
		}
	}, [editor])
	const defaultColor = useValue('freeform next background', () => getDefaultBackgroundColor(editor), [editor])
	const color = selection.selectedCount ? selection.color : defaultColor
	const transparent = selection.selectedCount ? selection.transparent : fill?.type === 'shared' && fill.value === 'none' && !defaultColor
	const disabled = selection.readonly || (selection.selectedCount > 0 && selection.geometries === 0)

	const apply = (value: string) => {
		const hex = normalizeHexColor(value)
		if (!hex || disabled) return
		editor.markHistoryStoppingPoint('background color')
		editor.run(() => {
			setDefaultBackgroundColor(editor, hex)
			editor.setStyleForNextShapes(DefaultFillStyle, nextFillForBackground(editor.getStyleForNextShape(DefaultFillStyle)))
			const shapes = getSelectedColorShapes(editor).filter((shape): shape is TLGeoShape => shape.type === 'geo')
			editor.updateShapes(shapes.map((shape) => ({ id: shape.id, type: shape.type, props: { fill: nextFillForBackground(shape.props.fill) }, meta: withBackgroundColor(shape, hex as HexColor) })))
		})
	}

	const clear = () => {
		if (disabled) return
		editor.markHistoryStoppingPoint('transparent background')
		editor.run(() => {
			setDefaultBackgroundColor(editor, null)
			editor.setStyleForNextShapes(DefaultFillStyle, 'none')
			const shapes = getSelectedColorShapes(editor).filter((shape): shape is TLGeoShape => shape.type === 'geo')
			editor.updateShapes(shapes.map((shape) => ({ id: shape.id, type: shape.type, props: { fill: 'none' as const }, meta: withoutBackgroundColor(shape) })))
		})
	}

	return <div className="freeform-background-palette" role="group" aria-label="Background color" data-selection-key={selection.key}>
		<button type="button" className="freeform-background-palette__swatch freeform-background-palette__none" aria-label="Transparent background" title="Transparent background" aria-pressed={transparent} disabled={disabled} onClick={clear} />
		{presets.map(({ color: preset, label }) => <button key={preset} type="button" className="freeform-background-palette__swatch" aria-label={label} title={label} aria-pressed={!transparent && color === preset} disabled={disabled} onClick={() => apply(preset)} style={{ background: preset }} />)}
		<label className="freeform-background-palette__custom" title="Custom background color">
			<input type="color" aria-label="Custom background color" value={color ?? '#ffffff'} disabled={disabled} onChange={(event) => apply(event.target.value)} />
			<span aria-hidden="true" className="freeform-background-palette__swatch" style={color && !presets.some(({ color: preset }) => preset === color) ? { background: color } : undefined} />
		</label>
	</div>
}
