import {
	DrawShapeUtil,
	TextShapeUtil,
	type TLArrowShape,
	type TLDrawShape,
	type TLGeoShape,
	type TLTheme,
} from 'tldraw'
import { getCustomColor, getCustomFill } from './colors'
import { FreeformArrowShapeUtil } from './FreeformArrowShapeUtil'
import { FreeformGeoShapeUtil, FreeformLineShapeUtil } from './FreeformStrokeShapeUtils'
import { ROUNDED_RECTANGLE, roundedRectangleDefinition } from './roundedRectangle'

function shapeColors(shape: TLGeoShape | TLArrowShape | TLDrawShape, theme: TLTheme, mode: 'light' | 'dark') {
	const hex = getCustomColor(shape)
	return hex ? {
		strokeColor: hex,
		fillColor: getCustomFill(hex, shape.props.fill, theme.colors[mode].solid, mode),
		patternFillFallbackColor: getCustomFill(hex, 'solid', theme.colors[mode].solid, mode),
	} : {}
}

/** Configure native renderers only: schemas, geometry, handles, bindings, editing, and export stay native. */
export const freeformColorShapeUtils = [
	FreeformGeoShapeUtil.configure({ customGeoTypes: { [ROUNDED_RECTANGLE]: roundedRectangleDefinition } }),
	FreeformArrowShapeUtil,
	DrawShapeUtil.configure({ getCustomDisplayValues: (_editor, shape, theme, mode) => shapeColors(shape, theme, mode) }),
	FreeformLineShapeUtil,
	TextShapeUtil.configure({
		getCustomDisplayValues: (_editor, shape) => {
			const hex = getCustomColor(shape)
			return hex ? { color: hex } : {}
		},
	}),
]
