import assert from 'node:assert/strict'
import test from 'node:test'
import { DiagramSchema } from './diagram'
import { parseSqlSchema } from './sqlDiagram'

test('converts primary keys and inline references to a native ER diagram', () => {
	const diagram = parseSqlSchema(`
		CREATE TABLE users (
			id UUID PRIMARY KEY,
			email VARCHAR(255) NOT NULL
		);
		CREATE TABLE orders (
			id INTEGER PRIMARY KEY,
			user_id UUID REFERENCES users(id),
			total DECIMAL(10, 2)
		);
	`)
	assert.equal(DiagramSchema.safeParse(diagram).success, true)
	assert.equal(diagram.title, 'SQL entity relationship')
	assert.deepEqual(diagram.nodes.map(({ label }) => label), [
		'users\nid  UUID  PK\nemail  VARCHAR(255)',
		'orders\nid  INTEGER  PK\nuser_id  UUID  FK\ntotal  DECIMAL(10, 2)',
	])
	assert.deepEqual(diagram.edges.map(({ from, to, label }) => ({ from, to, label })), [
		{ from: 'table2', to: 'table1', label: 'user_id → id' },
	])
	assert.ok(diagram.nodes[1].x >= diagram.nodes[0].x + diagram.nodes[0].w)
})

test('parses quoted/schema names, comments, table constraints, and commas inside literals', () => {
	const diagram = parseSqlSchema(`
		-- exported schema
		CREATE TABLE "core"."Users" (
			"ID" INTEGER,
			"Display Name" TEXT DEFAULT 'A,B',
			CONSTRAINT users_pk PRIMARY KEY ("ID")
		);
		/* relational table */
		CREATE TABLE [core].[Memberships] (
			user_id INTEGER,
			role TEXT DEFAULT 'it''s fine',
			CONSTRAINT membership_fk FOREIGN KEY (user_id) REFERENCES "core"."Users"("ID")
		);
	`)
	assert.match(diagram.nodes[0].label, /^core\.Users\nID  INTEGER  PK/m)
	assert.match(diagram.nodes[1].label, /^core\.Memberships\nuser_id  INTEGER  FK/m)
	assert.deepEqual(diagram.edges.map(({ label }) => label), ['user_id → ID'])
})

test('supports composite foreign keys while keeping a single bound relation', () => {
	const diagram = parseSqlSchema(`
		CREATE TABLE accounts (tenant_id INT, id INT, PRIMARY KEY (tenant_id, id));
		CREATE TABLE invoices (tenant_id INT, account_id INT,
			FOREIGN KEY (tenant_id, account_id) REFERENCES accounts(tenant_id, id));
	`)
	assert.equal(diagram.edges.length, 1)
	assert.equal(diagram.edges[0].label, 'tenant_id, account_id → tenant_id, id')
	assert.match(diagram.nodes[0].label, /tenant_id  INT  PK/)
	assert.match(diagram.nodes[1].label, /account_id  INT  FK/)
})

test('does not treat SQL keywords inside default strings as constraints', () => {
	const diagram = parseSqlSchema("CREATE TABLE notes (id INT, body TEXT DEFAULT 'REFERENCES users(id), PRIMARY KEY;');")
	assert.equal(diagram.edges.length, 0)
	assert.doesNotMatch(diagram.nodes[0].label, /\bPK\b/)
})

test('resolves an unqualified reference only when its table name is unambiguous', () => {
	const diagram = parseSqlSchema('CREATE TABLE public.users (id INT PRIMARY KEY); CREATE TABLE orders (user_id INT REFERENCES users);')
	assert.equal(diagram.edges[0].label, 'user_id → id')
	assert.throws(() => parseSqlSchema('CREATE TABLE public.users (id INT PRIMARY KEY); CREATE TABLE archive.users (id INT PRIMARY KEY); CREATE TABLE orders (user_id INT REFERENCES users);'), /Ambiguous referenced table users/i)
})

test('rejects missing targets, unsupported statements, and malformed definitions', () => {
	assert.throws(() => parseSqlSchema('CREATE TABLE orders (user_id INT REFERENCES users(id));'), /Referenced table .*users.*not found/)
	assert.throws(() => parseSqlSchema('CREATE TABLE users (id INT); ALTER TABLE users ADD email TEXT;'), /Unsupported SQL statement.*ALTER TABLE/i)
	assert.throws(() => parseSqlSchema('CREATE TABLE users (id INT'), /Unclosed.*CREATE TABLE/i)
	assert.throws(() => parseSqlSchema('CREATE TABLE users (id INT,);'), /empty definition/i)
	assert.throws(() => parseSqlSchema('CREATE TABLE users (id INT); CREATE TABLE users (email TEXT);'), /Duplicate table/i)
	assert.throws(() => parseSqlSchema('SELECT * FROM users;'), /Unsupported SQL statement/i)
	assert.throws(() => parseSqlSchema('-- nothing here'), /No CREATE TABLE/i)
})

test('rejects unsupported syntax and excessive input instead of truncating the diagram', () => {
	assert.throws(() => parseSqlSchema('CREATE TABLE users (id INT, CHECK (id > 0));'), /Unsupported table constraint.*CHECK/i)
	assert.throws(() => parseSqlSchema('CREATE TABLE users (email TEXT UNIQUE);'), /Unsupported UNIQUE constraint.*users\.email/i)
	assert.throws(() => parseSqlSchema('CREATE TABLE users (email TEXT CONSTRAINT users_email_unique UNIQUE);'), /Unsupported UNIQUE constraint.*users\.email/i)
	assert.throws(() => parseSqlSchema(Array.from({ length: 81 }, (_, i) => `CREATE TABLE t${i} (id INT);`).join('\n')), /at most 80 tables/i)
	assert.throws(() => parseSqlSchema('CREATE TABLE users (name TEXT);'.repeat(2000)), /32 KiB/i)
})
