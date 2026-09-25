import { Children, cloneElement, isValidElement, useId } from 'react'
import {
	ArrowShapeUtil,
	Box,
	type ArrowShapeUtilDisplayValues,
	type Editor,
	Group2d,
	PathBuilder,
	Rectangle2d,
	SVGContainer,
	Vec,
	getArrowInfo,
	getDisplayValues,
	type SvgExportContext,
	type TLArrowShape,
	type TLHandleDragInfo,
	type TLResizeInfo,
} from 'tldraw'
import { curvePointFromMeta, curveThroughPoint, openArrowheadWings, withCurvePoint } from './arrowCurve'
import { getCustomColor, getCustomFill } from './colors'
import { getStrokeWidth } from './strokeWidth'

function curvePath(util: FreeformArrowShapeUtil, shape: TLArrowShape) {
	const control = curvePointFromMeta(shape)
	const info = getArrowInfo(util.editor, shape)
	if (!control || !info || shape.props.kind !== 'arc') return null
	return curveThroughPoint(info.start.point, control, info.end.point)
}

function displayedPath(util: FreeformArrowShapeUtil, shape: TLArrowShape) {
	const curved = curvePath(util, shape)
	if (curved) return curved
	if (shape.props.kind !== 'arc' || shape.props.bend !== 0) return null
	const info = getArrowInfo(util.editor, shape)
	return info ? PathBuilder.lineThroughPoints([info.start.point, info.end.point], { endOffsets: 0 }) : null
}

function curveLabelCenter(util: FreeformArrowShapeUtil, shape: TLArrowShape) {
	const path = displayedPath(util, shape)
	return path?.toGeometry().interpolateAlongEdge(shape.props.labelPosition)
}

function arrowheadPath(shape: TLArrowShape, at: 'start' | 'end', point: { x: number; y: number }, toward: { x: number; y: number }, width: number, segmentLength: number) {
	const kind = at === 'start' ? shape.props.arrowheadStart : shape.props.arrowheadEnd
	if (kind === 'none') return null
	const p = (v: { x: number; y: number }) => `${v.x} ${v.y}`
	if (kind === 'arrow') {
		const [left, right] = openArrowheadWings(point, toward, segmentLength, shape.props.scale)
		return { d: `M ${p(left)} L ${p(point)} L ${p(right)}`, fill: 'none' }
	}
	const dx = point.x - toward.x
	const dy = point.y - toward.y
	const distance = Math.hypot(dx, dy) || 1
	const ux = dx / distance
	const uy = dy / distance
	const length = Math.max(width * 3, 10 * shape.props.scale)
	const half = length * 0.42
	const back = { x: point.x - ux * length, y: point.y - uy * length }
	const left = { x: back.x - uy * half, y: back.y + ux * half }
	const right = { x: back.x + uy * half, y: back.y - ux * half }
	switch (kind) {
		case 'triangle': return { d: `M ${p(left)} L ${p(point)} L ${p(right)} Z`, fill: 'currentColor' }
		case 'inverted': return { d: `M ${p(point)} L ${p(left)} L ${p(right)} Z`, fill: 'currentColor' }
		case 'bar': return { d: `M ${p(left)} L ${p(right)}`, fill: 'none' }
		case 'diamond': {
			const tip = { x: point.x - ux * length * 2, y: point.y - uy * length * 2 }
			return { d: `M ${p(point)} L ${p(left)} L ${p(tip)} L ${p(right)} Z`, fill: 'currentColor' }
		}
		case 'square': {
			const l2 = { x: left.x - ux * length, y: left.y - uy * length }
			const r2 = { x: right.x - ux * length, y: right.y - uy * length }
			return { d: `M ${p(left)} L ${p(right)} L ${p(r2)} L ${p(l2)} Z`, fill: 'currentColor' }
		}
		case 'dot': return { d: `M ${point.x + length / 2} ${point.y} A ${length / 2} ${length / 2} 0 1 0 ${point.x - length / 2} ${point.y} A ${length / 2} ${length / 2} 0 1 0 ${point.x + length / 2} ${point.y}`, fill: 'currentColor' }
	}
}

export function arrowBodyClipPath(bounds: Box, label: Box) {
	return `M ${bounds.left - 100} ${bounds.top - 100} L ${bounds.right + 100} ${bounds.top - 100} L ${bounds.right + 100} ${bounds.bottom + 100} L ${bounds.left - 100} ${bounds.bottom + 100} Z `
		+ `M ${label.left} ${label.top} L ${label.left} ${label.bottom} L ${label.right} ${label.bottom} L ${label.right} ${label.top} Z`
}

function CurveSvg({ util, shape, colorMode }: { util: FreeformArrowShapeUtil; shape: TLArrowShape; colorMode?: 'light' | 'dark' }) {
	const clipId = useId().replaceAll(':', '_')
	const path = displayedPath(util, shape)
	const info = getArrowInfo(util.editor, shape)
	const control = curvePointFromMeta(shape)
	if (!path || !info) return null
	const geometry = util.editor.getShapeGeometry(shape)
	const label = geometry instanceof Group2d && geometry.children[1] instanceof Rectangle2d ? geometry.children[1].bounds : null
	const display = getDisplayValues<TLArrowShape, ArrowShapeUtilDisplayValues>(util, shape, colorMode)
	const width = display.strokeWidth * shape.props.scale
	const vertices = path.toGeometry().getVertices({})
	const middle = control ?? info.start.point
	const start = arrowheadPath(shape, 'start', info.start.point, vertices[1] ?? info.end.point, width,
		Math.hypot(middle.x - info.start.point.x, middle.y - info.start.point.y) || Math.hypot(info.end.point.x - info.start.point.x, info.end.point.y - info.start.point.y))
	const end = arrowheadPath(shape, 'end', info.end.point, vertices[vertices.length - 2] ?? middle, width,
		Math.hypot(info.end.point.x - middle.x, info.end.point.y - middle.y))
	const opts = { style: shape.props.dash, strokeWidth: width, randomSeed: shape.id }
	return <g fill="none" stroke={display.strokeColor} color={display.strokeColor} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
		{label && <defs><clipPath id={clipId}><path d={arrowBodyClipPath(path.toGeometry().bounds, label)} clipRule="evenodd" /></clipPath></defs>}
		<g clipPath={label ? `url(#${clipId})` : undefined}>{path.toSvg(opts)}</g>
		{start && <path d={start.d} fill={start.fill} />}
		{end && <path d={end.d} fill={end.fill} />}
	</g>
}

export class FreeformArrowShapeUtil extends ArrowShapeUtil {
	constructor(editor: Editor) {
		super(editor)
		this.options = {
			...this.options,
			getCustomDisplayValues: (_editor, shape, theme, mode) => {
			const hex = getCustomColor(shape)
			const strokeWidth = getStrokeWidth(shape)
			return {
				...(strokeWidth ? { strokeWidth } : {}),
				...(hex ? {
				strokeColor: hex,
				fillColor: getCustomFill(hex, shape.props.fill, theme.colors[mode].solid, mode),
				patternFillFallbackColor: getCustomFill(hex, 'solid', theme.colors[mode].solid, mode),
				} : {}),
			}
			},
		}
	}

	override getGeometry(shape: TLArrowShape) {
		const path = curvePath(this, shape)
		if (!path) return super.getGeometry(shape)
		const native = super.getGeometry(shape) as Group2d
		const body = path.toGeometry()
		const label = native.children[1]
		if (!(label instanceof Rectangle2d)) {
			return new Group2d({ children: [body, ...native.children.slice(1)] })
		}
		const center = body.interpolateAlongEdge(shape.props.labelPosition)
		const bounds = label.bounds
		return new Group2d({ children: [
			body,
			new Rectangle2d({ x: center.x - bounds.w / 2, y: center.y - bounds.h / 2, width: bounds.w, height: bounds.h, isFilled: true, isLabel: true }),
			...native.children.slice(2),
		] })
	}

	override getHandles(shape: TLArrowShape) {
		const handles = super.getHandles(shape)
		const control = curvePointFromMeta(shape)
		if (!control || shape.props.kind !== 'arc') return handles
		return handles.map((handle) => handle.id === 'middle' ? { ...handle, x: control.x, y: control.y } : handle)
	}

	override onHandleDrag(shape: TLArrowShape, info: TLHandleDragInfo<TLArrowShape>) {
		if (info.handle.id === 'middle' && shape.props.kind === 'arc') {
			const arrow = getArrowInfo(this.editor, shape)
			if (!arrow) return
			const start = arrow.start.handle
			const end = arrow.end.handle
			const length = Math.hypot(end.x - start.x, end.y - start.y) || 1
			const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
			const bend = ((info.handle.x - midpoint.x) * (end.y - start.y)
				- (info.handle.y - midpoint.y) * (end.x - start.x)) / length
			return { id: shape.id, type: shape.type, props: { bend }, meta: withCurvePoint(shape, info.handle) }
		}
		return super.onHandleDrag(shape, info)
	}

	override onResize(shape: TLArrowShape, info: TLResizeInfo<TLArrowShape>) {
		const native = super.onResize(shape, info)
		const control = curvePointFromMeta(shape)
		return control ? {
			...native,
			meta: withCurvePoint(shape, { x: control.x * info.scaleX, y: control.y * info.scaleY }),
		} : native
	}

	override component(shape: TLArrowShape) {
		const native = super.component(shape)
		if (!displayedPath(this, shape)) return native
		const nativeLabel = isValidElement<{ children?: React.ReactNode }>(native)
			? Children.toArray(native.props.children)[1] : null
		const center = curveLabelCenter(this, shape)
		const label = center && isValidElement<{ style?: React.CSSProperties }>(nativeLabel)
			? cloneElement(nativeLabel, {
				style: { ...nativeLabel.props.style, transform: `translate(${center.x}px, ${center.y}px)${shape.props.scale !== 1 ? ` scale(${shape.props.scale})` : ''}` },
			}) : nativeLabel
		return <>
			<SVGContainer style={{ minWidth: 50, minHeight: 50 }}><CurveSvg util={this} shape={shape} /></SVGContainer>
			{label}
		</>
	}

	override getIndicatorPath(shape: TLArrowShape) {
		const path = curvePath(this, shape)
		if (!path) return super.getIndicatorPath(shape)
		return path.toPath2D({ style: 'solid', strokeWidth: 1 })
	}

	override toSvg(shape: TLArrowShape, ctx: SvgExportContext) {
		if (!displayedPath(this, shape)) return super.toSvg(shape, ctx)
		const native = super.toSvg(shape, ctx)
		const nativeLabel = isValidElement<{ children?: React.ReactNode }>(native)
			? Children.toArray(native.props.children)[1] : null
		const center = curveLabelCenter(this, shape)
		const label = center && isValidElement<{ bounds?: Box }>(nativeLabel) && nativeLabel.props.bounds
			? cloneElement(nativeLabel, {
				bounds: Box.FromCenter(Vec.From(center), new Vec(nativeLabel.props.bounds.w, nativeLabel.props.bounds.h)),
			}) : nativeLabel
		return <g transform={`scale(${1 / shape.props.scale})`}>
			<CurveSvg util={this} shape={shape} colorMode={ctx.colorMode} />
			{label}
		</g>
	}
}
