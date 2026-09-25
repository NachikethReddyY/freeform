import { DIAGRAM_LIMITS, DiagramSchema, type Diagram } from './diagram'

const SQL_BYTES = 32 * 1024
const MAX_COLUMNS = 24
const FIELD_SUFFIX = /\b(?:PRIMARY\s+KEY|REFERENCES|NOT\s+NULL|DEFAULT|UNIQUE|CHECK|CONSTRAINT|COLLATE|GENERATED|IDENTITY|AUTO_INCREMENT)\b/i

interface Column { name: string; type: string; primary: boolean; foreign: boolean }
interface Reference { columns: string[]; target: string; targetColumns: string[] }
interface Table { name: string; key: string; columns: Column[]; references: Reference[] }

// Quotes can contain commas, semicolons and parentheses. Scan once instead of
// splitting with regex, so a pasted SQL default cannot turn into a fake table.
function quotedEnd(source: string, start: number): number {
	const open = source[start]
	const close = open === '[' ? ']' : open
	for (let index = start + 1; index < source.length; index++) {
		if (source[index] === '\\' && open === "'") { index++; continue }
		if (source[index] !== close) continue
		if (source[index + 1] === close) { index++; continue }
		return index + 1
	}
	throw new Error('Unclosed quoted SQL value or identifier.')
}

function withoutComments(source: string): string {
	let result = ''
	for (let index = 0; index < source.length;) {
		if ('\'"`['.includes(source[index])) {
			const end = quotedEnd(source, index)
			result += source.slice(index, end)
			index = end
		} else if (source.startsWith('--', index)) {
			const end = source.indexOf('\n', index)
			result += end === -1 ? ' ' : ` ${' '.repeat(end - index - 2)}\n`
			index = end === -1 ? source.length : end + 1
		} else if (source.startsWith('/*', index)) {
			const end = source.indexOf('*/', index + 2)
			if (end === -1) throw new Error('Unclosed SQL comment.')
			result += ' '.repeat(end + 2 - index)
			index = end + 2
		} else {
			result += source[index++]
		}
	}
	return result
}

function splitTopLevel(source: string, separator: ',' | ';'): string[] {
	const parts: string[] = []
	let start = 0
	let depth = 0
	for (let index = 0; index < source.length; index++) {
		const char = source[index]
		if ('\'"`['.includes(char)) { index = quotedEnd(source, index) - 1; continue }
		if (char === '(') depth++
		if (char === ')') {
			depth--
			if (depth < 0) throw new Error('Unexpected closing parenthesis in SQL schema.')
		}
		if (char === separator && depth === 0) {
			parts.push(source.slice(start, index).trim())
			start = index + 1
		}
	}
	if (depth !== 0) throw new Error('Unclosed CREATE TABLE parenthesis.')
	parts.push(source.slice(start).trim())
	return parts
}

function maskQuoted(source: string): string {
	let masked = ''
	for (let index = 0; index < source.length;) {
		if ('\'"`['.includes(source[index])) {
			const end = quotedEnd(source, index)
			masked += ' '.repeat(end - index)
			index = end
		} else masked += source[index++]
	}
	return masked
}

function identifier(source: string): { name: string; rest: string } {
	const input = source.trimStart()
	const first = input[0]
	if ('"`['.includes(first)) {
		const end = quotedEnd(input, 0)
		const close = first === '[' ? ']' : first
		const name = input.slice(1, end - 1).replaceAll(close + close, close)
		if (!name.trim()) throw new Error('An SQL identifier is empty.')
		return { name, rest: input.slice(end) }
	}
	const match = /^[a-zA-Z_][a-zA-Z0-9_$]*/.exec(input)
	if (!match) throw new Error(`Expected an SQL identifier near: ${input.slice(0, 40)}`)
	return { name: match[0], rest: input.slice(match[0].length) }
}

function qualifiedIdentifier(source: string): { name: string; rest: string } {
	let current = identifier(source)
	const names = [current.name]
	while (current.rest.trimStart().startsWith('.')) {
		current = identifier(current.rest.trimStart().slice(1))
		names.push(current.name)
		if (names.length > 3) throw new Error('SQL names may have at most three parts.')
	}
	return { name: names.join('.'), rest: current.rest }
}

function parenthesizedNames(source: string): { names: string[]; rest: string } {
	const input = source.trimStart()
	if (!input.startsWith('(')) throw new Error(`Expected a column list near: ${input.slice(0, 40)}`)
	let depth = 0
	let end = -1
	for (let index = 0; index < input.length; index++) {
		if ('\'"`['.includes(input[index])) { index = quotedEnd(input, index) - 1; continue }
		if (input[index] === '(') depth++
		if (input[index] === ')' && --depth === 0) { end = index; break }
	}
	if (end === -1) throw new Error('Unclosed SQL column list.')
	const names = splitTopLevel(input.slice(1, end), ',').map((part) => {
		const parsed = identifier(part)
		if (parsed.rest.trim()) throw new Error(`Unsupported column expression: ${part.slice(0, 60)}`)
		return parsed.name
	})
	if (!names.length) throw new Error('An SQL column list is empty.')
	return { names, rest: input.slice(end + 1) }
}

function reference(source: string): { reference: Omit<Reference, 'columns'>; rest: string } {
	const match = /^\s*REFERENCES\s+/i.exec(source)
	if (!match) throw new Error('Expected REFERENCES in foreign key.')
	const target = qualifiedIdentifier(source.slice(match[0].length))
	const remainder = target.rest.trimStart()
	const columns = remainder.startsWith('(') ? parenthesizedNames(remainder) : { names: [], rest: remainder }
	if (columns.rest.trim() && !/^(?:ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|RESTRICT|SET\s+NULL|NO\s+ACTION)(?:\s+|$))+$/i.test(columns.rest.trim())) {
		throw new Error(`Unsupported foreign key clause: ${columns.rest.trim().slice(0, 60)}`)
	}
	return { reference: { target: target.name, targetColumns: columns.names }, rest: columns.rest }
}

function columnKey(name: string) { return name.toLowerCase() }

function parseTable(statement: string): Table {
	const create = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/i.exec(statement)
	if (!create) throw new Error(`Unsupported SQL statement: ${statement.slice(0, 60)}`)
	const tableName = qualifiedIdentifier(statement.slice(create[0].length))
	const body = tableName.rest.trim()
	if (!body.startsWith('(') || !body.endsWith(')')) throw new Error(`Malformed CREATE TABLE ${tableName.name}.`)
	const definitions = splitTopLevel(body.slice(1, -1), ',')
	if (!definitions.length || definitions.some((definition) => !definition)) throw new Error(`CREATE TABLE ${tableName.name} has an empty definition.`)
	const columns: Column[] = []
	const references: Reference[] = []
	const primaryColumns: string[] = []
	for (const definition of definitions) {
		let part = definition
		if (/^CONSTRAINT\s+/i.test(part)) {
			part = identifier(part.replace(/^CONSTRAINT\s+/i, '')).rest.trimStart()
		}
		if (/^PRIMARY\s+KEY\s*\(/i.test(part)) {
			const parsed = parenthesizedNames(part.replace(/^PRIMARY\s+KEY\s*/i, ''))
			if (parsed.rest.trim()) throw new Error(`Unsupported PRIMARY KEY clause in ${tableName.name}.`)
			primaryColumns.push(...parsed.names)
		} else if (/^FOREIGN\s+KEY\s*\(/i.test(part)) {
			const local = parenthesizedNames(part.replace(/^FOREIGN\s+KEY\s*/i, ''))
			const parsed = reference(local.rest)
			references.push({ columns: local.names, ...parsed.reference })
		} else if (/^(?:CHECK|UNIQUE|EXCLUDE|INDEX|KEY)\b/i.test(part)) {
			throw new Error(`Unsupported table constraint in ${tableName.name}: ${part.slice(0, 60)}`)
		} else {
			const parsed = identifier(part)
			const unquoted = maskQuoted(parsed.rest)
			const suffix = FIELD_SUFFIX.exec(unquoted)
			const type = (suffix ? parsed.rest.slice(0, suffix.index) : parsed.rest).trim().replace(/\s+/g, ' ')
			if (!type) throw new Error(`Column ${parsed.name} in ${tableName.name} has no type.`)
			if (/\bCHECK\b/i.test(unquoted)) throw new Error(`Unsupported CHECK constraint on ${tableName.name}.${parsed.name}.`)
			if (/\bUNIQUE\b/i.test(unquoted)) throw new Error(`Unsupported UNIQUE constraint on ${tableName.name}.${parsed.name}.`)
			const primary = /\bPRIMARY\s+KEY\b/i.test(unquoted)
			columns.push({ name: parsed.name, type, primary, foreign: false })
			const inline = /\bREFERENCES\b/i.exec(unquoted)
			if (inline) references.push({ columns: [parsed.name], ...reference(parsed.rest.slice(inline.index)).reference })
		}
	}
	if (columns.length > MAX_COLUMNS) throw new Error(`Table ${tableName.name} has more than ${MAX_COLUMNS} columns; its label would not fit.`)
	const known = new Set<string>()
	for (const column of columns) {
		if (known.has(columnKey(column.name))) throw new Error(`Duplicate column ${column.name} in ${tableName.name}.`)
		known.add(columnKey(column.name))
	}
	for (const name of primaryColumns) {
		const column = columns.find((candidate) => columnKey(candidate.name) === columnKey(name))
		if (!column) throw new Error(`Primary key column ${name} not found in ${tableName.name}.`)
		column.primary = true
	}
	for (const relation of references) {
		for (const name of relation.columns) {
			const column = columns.find((candidate) => columnKey(candidate.name) === columnKey(name))
			if (!column) throw new Error(`Foreign key column ${name} not found in ${tableName.name}.`)
			column.foreign = true
		}
	}
	return { name: tableName.name, key: columnKey(tableName.name), columns, references }
}

/** Convert a bounded CREATE TABLE subset to editable native nodes and arrows. No SQL runs. */
export function parseSqlSchema(source: string): Diagram {
	if (new TextEncoder().encode(source).length > SQL_BYTES) throw new Error('SQL schema exceeds 32 KiB.')
	const statements = splitTopLevel(withoutComments(source), ';').filter(Boolean)
	if (!statements.length) throw new Error('No CREATE TABLE statements found.')
	if (statements.length > DIAGRAM_LIMITS.nodes) throw new Error('A diagram supports at most 80 tables.')
	const tables = statements.map(parseTable)
	const byKey = new Map<string, Table>()
	for (const table of tables) {
		if (byKey.has(table.key)) throw new Error(`Duplicate table ${table.name}.`)
		byKey.set(table.key, table)
	}
	const edges: Diagram['edges'] = []
	for (const [index, table] of tables.entries()) {
		for (const relation of table.references) {
			let target = byKey.get(columnKey(relation.target))
			if (!target && !relation.target.includes('.')) {
				const matches = tables.filter((candidate) => candidate.key.split('.').at(-1) === columnKey(relation.target))
				if (matches.length > 1) throw new Error(`Ambiguous referenced table ${relation.target}; use its schema-qualified name.`)
				target = matches[0]
			}
			if (!target) throw new Error(`Referenced table ${relation.target} not found. Include its CREATE TABLE statement.`)
			if (target === table) throw new Error(`Self-referencing foreign key in ${table.name} cannot be represented by the current diagram format.`)
			const targetColumns = relation.targetColumns.length ? relation.targetColumns : target.columns.filter((column) => column.primary).map((column) => column.name)
			if (!targetColumns.length) throw new Error(`Referenced table ${target.name} has no primary key; name target columns explicitly.`)
			if (relation.columns.length !== targetColumns.length) throw new Error(`Foreign key in ${table.name} has a different number of source and target columns.`)
			for (const name of targetColumns) {
				if (!target.columns.some((column) => columnKey(column.name) === columnKey(name))) throw new Error(`Referenced column ${target.name}.${name} not found.`)
			}
			edges.push({ id: `fk${edges.length + 1}`, from: `table${index + 1}`, to: `table${tables.indexOf(target) + 1}`, label: `${relation.columns.join(', ')} → ${targetColumns.join(', ')}`, color: 'black' })
			if (edges.length > DIAGRAM_LIMITS.edges) throw new Error('A diagram supports at most 120 foreign keys.')
		}
	}
	const rowHeights = Array.from({ length: Math.ceil(tables.length / 4) }, (_, row) => Math.max(...tables.slice(row * 4, row * 4 + 4).map((table) => Math.max(100, 44 + table.columns.length * 26))))
	let y = 0
	const rowY = rowHeights.map((height) => { const current = y; y += height + 100; return current })
	const nodes: Diagram['nodes'] = tables.map((table, index) => {
		const label = [table.name, ...table.columns.map((column) => `${column.name}  ${column.type}${column.primary ? '  PK' : ''}${column.foreign ? '  FK' : ''}`)].join('\n')
		if (label.length > 500) throw new Error(`Table ${table.name} has too much text for a diagram node (500 characters maximum).`)
		return { id: `table${index + 1}`, kind: 'rectangle', label, x: (index % 4) * 340, y: rowY[Math.floor(index / 4)], w: 260, h: Math.max(100, 44 + table.columns.length * 26), color: 'black' }
	})
	return DiagramSchema.parse({ title: 'SQL entity relationship', nodes, edges })
}
