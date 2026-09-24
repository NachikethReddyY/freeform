import { useEffect, useState } from 'react'
import {
	DefaultColorStyle,
	StylePanelButtonPickerInline,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	TldrawUiToolbar,
	TldrawUiToolbarButton,
	getColorStyleItems,
	tlmenus,
	useEditor,
	useStylePanelContext,
	useValue,
} from 'tldraw'
import { applyCustomColor, clearCustomColor, getSelectedColorShapes } from './actions'
import { getCustomColor, normalizeHexColor } from './colors'
import { getDefaultCustomColor, setDefaultCustomColor } from './defaultColorState'
import './colors.css'

/** Mount inside DefaultStylePanel, replacing its StylePanelColorPicker. */
export function FreeformColorPicker() {
	const editor = useEditor()
	const context = useStylePanelContext()
	const color = context.styles.get(DefaultColorStyle)
	// Reserve the twelfth palette slot for the custom picker.
	const items = useValue('freeform native colors', () => getColorStyleItems(editor.getCurrentTheme().colors[editor.getColorMode()]).slice(0, 11), [editor])
	const defaultColor = useValue('freeform default color', () => getDefaultCustomColor(editor), [editor])
	const selection = useValue('freeform custom colors', () => {
		const shapes = getSelectedColorShapes(editor)
		const colors = shapes.map(getCustomColor)
		return {
			key: shapes.map((shape) => `${shape.id}:${getCustomColor(shape) ?? shape.props.color}`).join('|'),
			count: shapes.length,
			selectedCount: editor.getSelectedShapeIds().length,
			readonly: editor.getIsReadonly(),
			hasCustom: colors.some((value) => value !== null),
			common: colors.length && colors.every((value) => value === colors[0]) ? colors[0] : null,
		}
	}, [editor])
	const [value, setValue] = useState('')
	const [error, setError] = useState('')
	const [open, setOpen] = useState(false)
	const commonColor = selection.selectedCount ? selection.common : defaultColor
	const hasCustom = selection.selectedCount ? selection.hasCustom : defaultColor !== null
	useEffect(() => {
		setValue(commonColor ?? '')
		setError('')
	}, [selection.key, commonColor])
	const disabled = selection.readonly || (selection.selectedCount > 0 && selection.count === 0)
	useEffect(() => {
		if (disabled) {
			tlmenus.deleteOpenMenu('freeform-custom-color', editor.contextId)
			setOpen(false)
		}
	}, [disabled, editor])

	const apply = (next: string) => {
		try {
			applyCustomColor(editor, next)
			setValue(normalizeHexColor(next) ?? next)
			setError('')
			return true
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to apply color.')
			return false
		}
	}

	if (!color) return null
	return <TldrawUiToolbar label="Color" orientation="grid" className="freeform-color-palette" onClickCapture={(event) => {
		// Keyboard activation of an already-selected native preset still clears the drawing default.
		const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-testid^="style.color."]') : null
		if (target && target.dataset.testid !== 'style.color.custom') setDefaultCustomColor(editor, null)
	}}>
		<StylePanelButtonPickerInline
			title="Color"
			uiType="color"
			style={DefaultColorStyle}
			items={items}
			value={hasCustom ? { type: 'mixed' } : color}
			onValueChange={(style, nativeColor) => editor.run(() => {
				setDefaultCustomColor(editor, null)
				clearCustomColor(editor)
				context.onValueChange(style, nativeColor)
			})}
		/>
		<TldrawUiPopover id="freeform-custom-color" open={open} onOpenChange={(next) => {
			if (next) { setValue(commonColor ?? ''); setError('') }
			setOpen(next)
		}}>
			<TldrawUiPopoverTrigger>
				<TldrawUiToolbarButton
					type="icon"
					className="freeform-custom-color-swatch"
					data-testid="style.color.custom"
					title={commonColor ? `Custom color — ${commonColor} (selected)` : 'Custom color'}
					tooltip={disabled ? 'Custom color is unavailable for this selection' : 'Custom color'}
					aria-pressed={hasCustom}
					isActive={hasCustom}
					disabled={disabled}
				>
					<span aria-hidden="true" className="freeform-custom-color-swatch__color" style={commonColor ? { background: commonColor } : undefined} />
				</TldrawUiToolbarButton>
			</TldrawUiPopoverTrigger>
			<TldrawUiPopoverContent side="right" align="start" collisionPadding={12} autoFocusFirstButton={false}>
				<form className="freeform-custom-color-popover" aria-label="Custom color" onSubmit={(event) => {
					event.preventDefault()
					if (apply(value)) {
						tlmenus.deleteOpenMenu('freeform-custom-color', editor.contextId)
						setOpen(false)
					}
				}}>
					<input type="color" aria-label="Choose custom color" value={normalizeHexColor(value) ?? '#000000'} disabled={disabled} onChange={(event) => apply(event.target.value)} />
					<input aria-label="Custom HEX color" title="3- or 6-digit HEX color; press Enter to apply" value={value} placeholder="#RRGGBB" maxLength={7} spellCheck={false} autoComplete="off" disabled={disabled} onChange={(event) => { setValue(event.target.value); setError('') }} />
					{error && <p className="freeform-custom-color__error" role="alert">{error}</p>}
				</form>
			</TldrawUiPopoverContent>
		</TldrawUiPopover>
	</TldrawUiToolbar>
}
