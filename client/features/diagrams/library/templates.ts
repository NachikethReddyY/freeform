import { DiagramSchema, type Diagram } from '../../../../shared/diagram'

export type StarterId = 'flowchart' | 'mind-map' | 'erd' | 'sequence' | 'architecture'
	| 'api-stack' | 'data-model' | 'request-flow'
export interface Starter { id: StarterId; title: string; diagram: Diagram }

const node = (id: string, kind: 'rectangle' | 'ellipse' | 'diamond', label: string, x: number, y: number, w = 160, h = 88) =>
	({ id, kind, label, x, y, w, h, color: 'black' as const })
const edge = (id: string, from: string, to: string, label = '') => ({ id, from, to, label, color: 'black' as const })
const anchor = (id: string, x: number, y: number) => ({ ...node(id, 'ellipse', '', x, y, 24, 24), role: 'anchor' as const })
const lifeline = (id: string, from: string, to: string) => ({ ...edge(id, from, to), style: 'lifeline' as const })

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
			// Native bound arrows form three participant lifelines and four message
			// rows. Trailing newlines lift captions off their message strokes.
			nodes: [
				node('client', 'rectangle', 'Client', 0, 0, 160, 66),
				node('service', 'rectangle', 'Service', 300, 0, 160, 66),
				node('database', 'rectangle', 'Database', 600, 0, 160, 66),
				anchor('clientRequest', 68, 125),
				anchor('serviceRequest', 368, 125),
				anchor('serviceQuery', 368, 235),
				anchor('databaseQuery', 668, 235),
				anchor('databaseResult', 668, 345),
				anchor('serviceResult', 368, 345),
				anchor('serviceResponse', 368, 455),
				anchor('clientResponse', 68, 455),
				anchor('clientEnd', 68, 565),
				anchor('serviceEnd', 368, 565),
				anchor('databaseEnd', 668, 565),
			],
			edges: [
				lifeline('clientLine', 'client', 'clientEnd'),
				lifeline('serviceLine', 'service', 'serviceEnd'),
				lifeline('databaseLine', 'database', 'databaseEnd'),
				edge('request', 'clientRequest', 'serviceRequest', 'Request\n'),
				edge('query', 'serviceQuery', 'databaseQuery', 'Query\n'),
				edge('result', 'databaseResult', 'serviceResult', 'Result\n'),
				edge('response', 'serviceResponse', 'clientResponse', 'Response\n'),
			],
		}) },
	{
		id: 'architecture', title: 'Architecture', diagram: DiagramSchema.parse({ title: 'Architecture',
			nodes: [node('client', 'rectangle', 'Client', 0, 100, 170, 100),
				node('api', 'rectangle', 'API', 270, 100, 170, 100),
				node('worker', 'rectangle', 'Worker', 540, 0, 170, 100),
				node('database', 'rectangle', 'Database', 540, 210, 170, 100)],
			edges: [edge('request', 'client', 'api'), edge('job', 'api', 'worker'), edge('store', 'api', 'database')],
		}) },
	{
		id: 'api-stack', title: 'API stack', diagram: DiagramSchema.parse({ title: 'API stack',
			nodes: [node('browser', 'rectangle', 'Browser', 0, 120, 170, 88),
				node('route', 'rectangle', 'API route', 285, 120, 170, 88),
				node('service', 'rectangle', 'Service', 545, 120, 170, 88),
				node('database', 'rectangle', 'Database', 830, 0, 170, 88),
				node('queue', 'rectangle', 'Job queue', 830, 240, 170, 88)],
			edges: [edge('http', 'browser', 'route', 'HTTP'), edge('call', 'route', 'service'),
				edge('query', 'service', 'database', 'Query'), edge('publish', 'service', 'queue', 'Job')],
		}) },
	{
		id: 'data-model', title: 'Data model', diagram: DiagramSchema.parse({ title: 'Data model',
			nodes: [node('user', 'rectangle', 'User\nid · email', 0, 0, 170, 110),
				node('project', 'rectangle', 'Project\nid · user_id', 270, 0, 170, 110),
				node('task', 'rectangle', 'Task\nid · project_id', 540, 0, 170, 110),
				node('comment', 'rectangle', 'Comment\nid · task_id', 810, 0, 170, 110)],
			edges: [edge('projects', 'user', 'project', '1 : many'),
				edge('tasks', 'project', 'task', '1 : many'), edge('comments', 'task', 'comment', '1 : many')],
		}) },
	{
		id: 'request-flow', title: 'Request flow', diagram: DiagramSchema.parse({ title: 'Request flow',
			nodes: [node('client', 'rectangle', 'Client', 0, 130, 150, 88),
				node('route', 'rectangle', 'API route', 200, 130, 160, 88),
				node('validate', 'diamond', 'Valid?', 410, 115, 150, 118),
				node('database', 'rectangle', 'Database', 640, 0, 150, 88),
				node('success', 'rectangle', '200 OK', 850, 0, 140, 88),
				node('badRequest', 'rectangle', '400 Bad Request', 640, 260, 150, 88)],
			edges: [edge('request', 'client', 'route'), edge('check', 'route', 'validate'),
				edge('valid', 'validate', 'database', 'valid\n'), edge('invalid', 'validate', 'badRequest', '\ninvalid'),
				edge('result', 'database', 'success')],
		}) },
] as const

export function getStarter(id: StarterId) {
	const starter = STARTERS.find((candidate) => candidate.id === id)
	if (!starter) throw new Error('Starter not found.')
	return starter
}
