import { PathBuilder, type GeoTypeDefinition } from 'tldraw'

export const ROUNDED_RECTANGLE = 'freeform-rounded-rectangle'

export const roundedRectangleDefinition: GeoTypeDefinition = {
	snapType: 'polygon',
	icon: 'geo-rectangle',
	getPath(w, h, shape) {
		const radius = Math.min(16, w / 5, h / 5)
		const isFilled = shape.props.fill !== 'none'
		return new PathBuilder()
			.moveTo(radius, 0, { geometry: { isFilled } })
			.lineTo(w - radius, 0)
			.circularArcTo(radius, false, true, w, radius)
			.lineTo(w, h - radius)
			.circularArcTo(radius, false, true, w - radius, h)
			.lineTo(radius, h)
			.circularArcTo(radius, false, true, 0, h - radius)
			.lineTo(0, radius)
			.circularArcTo(radius, false, true, radius, 0)
			.close()
	},
}

export function isRectangleGeo(geo: string) {
	return geo === 'rectangle' || geo === ROUNDED_RECTANGLE
}
