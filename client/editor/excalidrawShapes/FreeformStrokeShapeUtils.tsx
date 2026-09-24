import { Children, cloneElement, isValidElement } from 'react'
import {
	GeoShapeUtil,
	LineShapeUtil,
	PathBuilder,
	SVGContainer,
	getDisplayValues,
	getPerfectDashProps,
	type Editor,
	type GeoShapeUtilDisplayValues,
	type LineShapeUtilDisplayValues,
	type SvgExportContext,
	type TLGeoShape,
	type TLLineShape,
} from 'tldraw'
import { getCustomColor } from './colors'
import { shapeBackgroundDisplayValues } from './backgroundDisplay'
import { getSloppiness } from './sloppiness'
import { isRectangleGeo, ROUNDED_RECTANGLE, roundedRectangleDefinition } from './roundedRectangle'

function linePath(shape: TLLineShape) {
	const points = Object.values(shape.props.points).sort((a, b) => a.index.localeCompare(b.index))
	return shape.props.spline === 'cubic'
		? PathBuilder.cubicSplineThroughPoints(points, { endOffsets: 0 })
		: PathBuilder.lineThroughPoints(points, { endOffsets: 0 })
}

function roughDashedLinePath(shape: TLLineShape, strokeWidth: number) {
	if (shape.props.spline !== 'line') return linePath(shape)
	const points = Object.values(shape.props.points).sort((a, b) => a.index.localeCompare(b.index))
	const first = points[0]
	const path = new PathBuilder().moveTo(first.x, first.y, { offset: 0 })
	const seed = [...shape.id].reduce((total, char) => total + char.charCodeAt(0), 0)
	for (let i = 1; i < points.length; i++) {
		const start = points[i - 1], end = points[i]
		const dx = end.x - start.x, dy = end.y - start.y
		const length = Math.hypot(dx, dy)
		if (length >= 96) {
			// Keep the visible centerline inside tldraw's 3px fine-pointer hit margin.
			const displacement = Math.min(strokeWidth * 0.75, 2.25, length / 48)
			const sign = (seed + i) % 2 === 0 ? 1 : -1
			for (let step = 1; step <= 4; step++) {
				const direction = sign * (step % 2 === 0 ? -1 : 1)
				const nx = -dy / length * displacement * direction
				const ny = dx / length * displacement * direction
				path.lineTo(start.x + dx * step / 5 + nx, start.y + dy * step / 5 + ny, { offset: 0 })
			}
		}
		path.lineTo(end.x, end.y, i === points.length - 1 ? { offset: 0 } : undefined)
	}
	return path
}

export function roughLine(shape: TLLineShape, stroke: string, width: number, exportScale = false) {
	const path = linePath(shape)
	const strokeWidth = width * shape.props.scale
	const transform = exportScale ? `scale(${1 / shape.props.scale})` : undefined
	if (shape.props.dash === 'dashed' || shape.props.dash === 'dotted') {
		const roughPath = roughDashedLinePath(shape, strokeWidth)
		const { strokeDasharray, strokeDashoffset } = getPerfectDashProps(roughPath.toGeometry().length, strokeWidth, {
			style: shape.props.dash,
		})
		return <path d={roughPath.toDrawD({ strokeWidth, randomSeed: shape.id, offset: strokeWidth * 1.1,
			roundness: strokeWidth * 4, passes: 1 })} stroke={stroke} fill="none" strokeWidth={strokeWidth}
			strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} strokeLinecap="round"
			transform={transform} />
	}
	return path.toSvg({
		style: 'draw', randomSeed: shape.id, strokeWidth,
		offset: strokeWidth * 1.1, roundness: strokeWidth * 4, passes: 2,
		props: { stroke, fill: 'none', transform },
	})
}

export function roughRectangle(shape: TLGeoShape, stroke: string, width: number, exportScale = false) {
	const scaledShape = exportScale ? {
		...shape, props: { ...shape.props, w: shape.props.w / shape.props.scale,
			h: (shape.props.h + shape.props.growY) / shape.props.scale, growY: 0 },
	} : shape
	const { w, h } = scaledShape.props
	const path = (scaledShape.props.geo as string) === ROUNDED_RECTANGLE
		? roundedRectangleDefinition.getPath(w, h, scaledShape, width)
		: new PathBuilder().moveTo(0, 0).lineTo(w, 0).lineTo(w, h).lineTo(0, h).close()
	const strokeWidth = width * (exportScale ? 1 : shape.props.scale)
	const roundness = (scaledShape.props.geo as string) === ROUNDED_RECTANGLE ? width * 4 : 0
	if (shape.props.dash === 'dashed' || shape.props.dash === 'dotted') {
		const radius = (scaledShape.props.geo as string) === ROUNDED_RECTANGLE ? Math.min(16, w / 5, h / 5) : 0
		const perimeter = 2 * (w + h) - 8 * radius + 2 * Math.PI * radius
		const { strokeDasharray, strokeDashoffset } = getPerfectDashProps(perimeter, strokeWidth, {
			style: shape.props.dash, closed: true,
		})
		return <path d={path.toDrawD({ strokeWidth, randomSeed: shape.id, offset: width * 1.1,
			roundness, passes: 1 })} stroke={stroke} fill="none" strokeWidth={strokeWidth}
			strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
	}
	return path.toSvg({
		style: 'draw', randomSeed: shape.id, strokeWidth,
		offset: width * 1.1, roundness, passes: 2,
		props: { stroke, fill: 'none' },
	})
}

export class FreeformLineShapeUtil extends LineShapeUtil {
	constructor(editor: Editor) {
		super(editor)
		this.options = { ...this.options, getCustomDisplayValues: (_editor, shape) => {
			const hex = getCustomColor(shape)
			return hex ? { strokeColor: hex } : {}
		} }
	}

	override component(shape: TLLineShape) {
		const native = super.component(shape)
		if (getSloppiness(shape) !== 2) return native
		const dv = getDisplayValues<TLLineShape, LineShapeUtilDisplayValues>(this, shape)
		return <SVGContainer style={{ minWidth: 50, minHeight: 50 }}>{roughLine(shape, dv.strokeColor, dv.strokeWidth)}</SVGContainer>
	}

	override toSvg(shape: TLLineShape, ctx: SvgExportContext) {
		if (getSloppiness(shape) !== 2) return super.toSvg(shape, ctx)
		const dv = getDisplayValues<TLLineShape, LineShapeUtilDisplayValues>(this, shape, ctx.colorMode)
		return roughLine(shape, dv.strokeColor, dv.strokeWidth, true) ?? super.toSvg(shape, ctx)
	}
}

export class FreeformGeoShapeUtil extends GeoShapeUtil {
	constructor(editor: Editor) {
		super(editor)
		this.options = { ...this.options, getCustomDisplayValues: (_editor, shape, theme, mode) => {
			const hex = getCustomColor(shape)
			return {
				...(hex ? { strokeColor: hex } : {}),
				...shapeBackgroundDisplayValues(shape, theme.colors[mode].solid, mode),
			}
		} }
	}

	override getIndicatorPath(shape: TLGeoShape): Path2D | undefined {
		// Diagram binding anchors participate in selection and transforms, but have no visible outline.
		return shape.opacity === 0 ? undefined : super.getIndicatorPath(shape)
	}

	override component(shape: TLGeoShape) {
		const native = super.component(shape)
		if (!isRectangleGeo(shape.props.geo) || getSloppiness(shape) !== 2) return native
		const children = Children.toArray(native.props.children)
		const container = children[0]
		if (!isValidElement<{ children?: React.ReactNode }>(container)) return native
		const body = Children.toArray(container.props.children)[0]
		if (!isValidElement<{ strokeColor?: string }>(body)) return native
		const dv = getDisplayValues<TLGeoShape, GeoShapeUtilDisplayValues>(this, shape)
		return <>
			{cloneElement(container, { children: <>{cloneElement(body, { strokeColor: 'transparent' })}{roughRectangle(shape, dv.strokeColor, dv.strokeWidth)}</> })}
			{children.slice(1)}
		</>
	}

	override toSvg(shape: TLGeoShape, ctx: SvgExportContext) {
		const native = super.toSvg(shape, ctx)
		if (!isRectangleGeo(shape.props.geo) || getSloppiness(shape) !== 2) return native
		const children = Children.toArray(native.props.children)
		const body = children[0]
		if (!isValidElement<{ strokeColor?: string }>(body)) return native
		const dv = getDisplayValues<TLGeoShape, GeoShapeUtilDisplayValues>(this, shape, ctx.colorMode)
		return <>{cloneElement(body, { strokeColor: 'transparent' })}{roughRectangle(shape, dv.strokeColor, dv.strokeWidth, true)}{children.slice(1)}</>
	}
}
