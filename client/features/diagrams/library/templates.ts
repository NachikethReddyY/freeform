import { DiagramSchema, type Diagram } from '../../../../shared/diagram'

export type StarterId = 'flowchart' | 'mind-map' | 'erd' | 'sequence' | 'architecture'
export interface Starter { id: StarterId; title: string; diagram: Diagram }

const node = (id: string, kind: 'rectangle' | 'ellipse' | 'diamond', label: string, x: number, y: number, w = 160, h = 88) =>
	({ id, kind, label, x, y, w, h, color: 'black' as const })
const edge = (id: string, from: string, to: string, label = '') => ({ id, from, to, label, color: 'black' as const })

// These are small editable arrangements, not baked images. Every starter uses
// the same native geo/arrow/binding path as externally proposed diagrams.
export const STARTERS: readonly Starter[] = [
	{
		id: 'flowchart', title: 'Flowchart', diagram: DiagramSchema.parse({ title: 'Flowchart',
			nodes: [node('start', 'ellipse', 'Start', 0, 0), node('step', 'rectangle', 'Step', 230, 0),
				node('decision', 'diamond', 'Decision?', 460, 0, 170, 110), node('next', 'rectangle', 'Next step', 860, -130),
				node('end', 'ellipse', 'End', 860, 130)],
			edges: [edge('one', 'start', 'step'), edge('two', 'step', 'decision'),
				edge('yes', 'decision', 'next', 'Yes\n'), edge('no', 'decision', 'end', '\nNo')],
		}) },
	{
		id: 'mind-map', title: 'Mind map', diagram: DiagramSchema.parse({ title: 'Mind map',
			nodes: [node('topic', 'ellipse', 'Topic', 250, 150, 190, 100),
				node('ideaA', 'rectangle', 'Idea', 0, 0), node('ideaB', 'rectangle', 'Idea', 520, 0),
				node('ideaC', 'rectangle', 'Idea', 0, 300), node('ideaD', 'rectangle', 'Idea', 520, 300)],
			edges: [edge('a', 'topic', 'ideaA'), edge('b', 'topic', 'ideaB'), edge('c', 'topic', 'ideaC'), edge('d', 'topic', 'ideaD')],
		}) },
	{
		id: 'erd', title: 'Entity relationship', diagram: DiagramSchema.parse({ title: 'Entity relationship',
			nodes: [node('user', 'rectangle', 'User\nid · name', 0, 0, 210, 120),
				node('order', 'rectangle', 'Order\nid · user_id', 300, 0, 210, 120),
				node('item', 'rectangle', 'Item\nid · order_id', 600, 0, 210, 120)],
			edges: [edge('owns', 'user', 'order', '1 : many'), edge('contains', 'order', 'item', '1 : many')],
		}) },
	{
		id: 'sequence', title: 'Sequence', diagram: DiagramSchema.parse({ title: 'Sequence',
			nodes: [node('person', 'rectangle', 'Client', 0, 0, 170, 75),
				node('service', 'rectangle', 'Service', 270, 0, 170, 75),
				node('data', 'rectangle', 'Database', 540, 0, 170, 75),
				node('request', 'rectangle', 'Request', 270, 170, 170, 75),
				node('response', 'rectangle', 'Response', 270, 310, 170, 75)],
			edges: [edge('calls', 'person', 'service'), edge('read', 'service', 'data'),
				edge('process', 'service', 'request'), edge('returns', 'request', 'response')],
		}) },
	{
		id: 'architecture', title: 'Architecture', diagram: DiagramSchema.parse({ title: 'Architecture',
			nodes: [node('client', 'rectangle', 'Client', 0, 100, 170, 100),
				node('api', 'rectangle', 'API', 270, 100, 170, 100),
				node('worker', 'rectangle', 'Worker', 540, 0, 170, 100),
				node('database', 'rectangle', 'Database', 540, 210, 170, 100)],
			edges: [edge('request', 'client', 'api'), edge('job', 'api', 'worker'), edge('store', 'api', 'database')],
		}) },
] as const

export function getStarter(id: StarterId) {
	const starter = STARTERS.find((candidate) => candidate.id === id)
	if (!starter) throw new Error('Starter not found.')
	return starter
}
