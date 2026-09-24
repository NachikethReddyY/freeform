import type { TLGeoShape } from 'tldraw'
import { getBackgroundColor } from './backgroundColor'
import { getCustomColor, getCustomFill } from './colors'

export function shapeBackgroundDisplayValues(shape: TLGeoShape, canvasSolid: string, mode: 'light' | 'dark') {
	const background = getBackgroundColor(shape)
	if (background) return {
		fillColor: getCustomFill(background, shape.props.fill, canvasSolid, mode),
		patternFillFallbackColor: getCustomFill(background, 'solid', canvasSolid, mode),
	}
	if (!Object.hasOwn(shape.meta, 'freeformBackgroundColor')) {
		const stroke = getCustomColor(shape)
		if (stroke) return {
			fillColor: getCustomFill(stroke, shape.props.fill, canvasSolid, mode),
			patternFillFallbackColor: getCustomFill(stroke, 'solid', canvasSolid, mode),
		}
	}
	return {}
}
