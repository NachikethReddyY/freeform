import { Children, cloneElement, isValidElement } from 'react'
import {
	GeoShapeUtil,
	LineShapeUtil,
	PathBuilder,
	SVGContainer,
	getDisplayValues,
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

function roughLine(shape: TLLineShape, stroke: string, width: number, exportScale = false) {
	return linePath(shape).toSvg({
		style: 'draw', randomSeed: shape.id, strokeWidth: width * shape.props.scale,
		offset: width * shape.props.scale * 1.1, roundness: width * shape.props.scale * 4, passes: 2,
		props: { stroke, fill: 'none', transform: exportScale ? `scale(${1 / shape.props.scale})` : undefined },
	})
}

function roughRectangle(shape: TLGeoShape, stroke: string, width: number, exportScale = false) {
	const scaledShape = exportScale ? {
		...shape, props: { ...shape.props, w: shape.props.w / shape.props.scale,
			h: (shape.props.h + shape.props.growY) / shape.props.scale, growY: 0 },
	} : shape
	const { w, h } = scaledShape.props
	const path = (scaledShape.props.geo as string) === ROUNDED_RECTANGLE
		? roundedRectangleDefinition.getPath(w, h, scaledShape, width)
		: new PathBuilder().moveTo(0, 0).lineTo(w, 0).lineTo(w, h).lineTo(0, h).close()
	return path.toSvg({
		style: 'draw', randomSeed: shape.id, strokeWidth: width * (exportScale ? 1 : shape.props.scale),
		offset: width * 1.1, roundness: width * 4, passes: 2,
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
		if (getSloppiness(shape) !== 2 || shape.props.dash === 'dashed' || shape.props.dash === 'dotted') return native
		const dv = getDisplayValues<TLLineShape, LineShapeUtilDisplayValues>(this, shape)
		return <SVGContainer style={{ minWidth: 50, minHeight: 50 }}>{roughLine(shape, dv.strokeColor, dv.strokeWidth)}</SVGContainer>
	}

	override toSvg(shape: TLLineShape, ctx: SvgExportContext) {
		if (getSloppiness(shape) !== 2 || shape.props.dash === 'dashed' || shape.props.dash === 'dotted') return super.toSvg(shape, ctx)
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

	override component(shape: TLGeoShape) {
		const native = super.component(shape)
		if (!isRectangleGeo(shape.props.geo) || getSloppiness(shape) !== 2 || shape.props.dash === 'dashed' || shape.props.dash === 'dotted') return native
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
		if (!isRectangleGeo(shape.props.geo) || getSloppiness(shape) !== 2 || shape.props.dash === 'dashed' || shape.props.dash === 'dotted') return native
		const children = Children.toArray(native.props.children)
		const body = children[0]
		if (!isValidElement<{ strokeColor?: string }>(body)) return native
		const dv = getDisplayValues<TLGeoShape, GeoShapeUtilDisplayValues>(this, shape, ctx.colorMode)
		return <>{cloneElement(body, { strokeColor: 'transparent' })}{roughRectangle(shape, dv.strokeColor, dv.strokeWidth, true)}{children.slice(1)}</>
	}
}
