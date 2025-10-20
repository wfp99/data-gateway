/**
 * Tests for field escaping with table.field format
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MySQLProvider } from './MySQLProvider';
import { PostgreSQLProvider } from './PostgreSQLProvider';
import { SQLiteProvider } from './SQLiteProvider';

describe('Field Escaping with table.field format', () =>
{
	describe('MySQLProvider', () =>
	{
		it('should escape table.field format correctly in SELECT fields', async () =>
		{
			const provider = new MySQLProvider({
				host: 'localhost',
				user: 'test',
				password: 'test',
				database: 'test'
			});

			// Access private method for testing
			const buildSelectSQL = (provider as any).buildSelectSQL.bind(provider);

			const query = {
				type: 'SELECT' as const,
				table: 'users',
				fields: ['users.id', 'users.name', 'posts.title']
			};

			const { sql } = buildSelectSQL(query);

			// Should produce: SELECT `users`.`id`, `users`.`name`, `posts`.`title` FROM `users`
			expect(sql).toContain('`users`.`id`');
			expect(sql).toContain('`users`.`name`');
			expect(sql).toContain('`posts`.`title`');
			expect(sql).not.toContain('`users.id`');
		});

		it('should escape table.field format correctly in WHERE conditions', async () =>
		{
			const provider = new MySQLProvider({
				host: 'localhost',
				user: 'test',
				password: 'test',
				database: 'test'
			});

			const buildSelectSQL = (provider as any).buildSelectSQL.bind(provider);

			const query = {
				type: 'SELECT' as const,
				table: 'users',
				where: {
					field: 'users.id',
					op: '=' as const,
					value: 1
				}
			};

			const { sql } = buildSelectSQL(query);

			// Should produce WHERE clause with: `users`.`id` = ?
			expect(sql).toContain('WHERE `users`.`id` = ?');
			expect(sql).not.toContain('WHERE `users.id` = ?');
		});

		it('should escape table.field format correctly in ORDER BY', async () =>
		{
			const provider = new MySQLProvider({
				host: 'localhost',
				user: 'test',
				password: 'test',
				database: 'test'
			});

			const buildSelectSQL = (provider as any).buildSelectSQL.bind(provider);

			const query = {
				type: 'SELECT' as const,
				table: 'users',
				orderBy: [{
					field: 'users.created_at',
					direction: 'DESC' as const
				}]
			};

			const { sql } = buildSelectSQL(query);

			// Should produce: ORDER BY `users`.`created_at` DESC
			expect(sql).toContain('ORDER BY `users`.`created_at` DESC');
			expect(sql).not.toContain('ORDER BY `users.created_at` DESC');
		});

		it('should escape table.field format correctly in GROUP BY', async () =>
		{
			const provider = new MySQLProvider({
				host: 'localhost',
				user: 'test',
				password: 'test',
				database: 'test'
			});

			const buildSelectSQL = (provider as any).buildSelectSQL.bind(provider);

			const query = {
				type: 'SELECT' as const,
				table: 'users',
				groupBy: ['users.status', 'users.role']
			};

			const { sql } = buildSelectSQL(query);

			// Should produce: GROUP BY `users`.`status`, `users`.`role`
			expect(sql).toContain('GROUP BY `users`.`status`, `users`.`role`');
			expect(sql).not.toContain('GROUP BY `users.status`');
		});
	});

	describe('PostgreSQLProvider', () =>
	{
		it('should escape table.field format correctly in SELECT fields', async () =>
		{
			const provider = new PostgreSQLProvider({
				host: 'localhost',
				user: 'test',
				password: 'test',
				database: 'test'
			});

			const buildSelectSQL = (provider as any).buildSelectSQL.bind(provider);

			const query = {
				type: 'SELECT' as const,
				table: 'users',
				fields: ['users.id', 'users.name', 'posts.title']
			};

			const { sql } = buildSelectSQL(query);

			// Should produce: SELECT "users"."id", "users"."name", "posts"."title" FROM "users"
			expect(sql).toContain('"users"."id"');
			expect(sql).toContain('"users"."name"');
			expect(sql).toContain('"posts"."title"');
			expect(sql).not.toContain('"users.id"');
		});

		it('should escape table.field format correctly in WHERE conditions', async () =>
		{
			const provider = new PostgreSQLProvider({
				host: 'localhost',
				user: 'test',
				password: 'test',
				database: 'test'
			});

			const buildSelectSQL = (provider as any).buildSelectSQL.bind(provider);

			const query = {
				type: 'SELECT' as const,
				table: 'users',
				where: {
					field: 'users.id',
					op: '=' as const,
					value: 1
				}
			};

			const { sql } = buildSelectSQL(query);

			// Should produce WHERE clause with: "users"."id" = $1
			expect(sql).toContain('WHERE "users"."id" = $1');
			expect(sql).not.toContain('WHERE "users.id" = $1');
		});
	});

	describe('SQLiteProvider', () =>
	{
		it('should escape table.field format correctly in SELECT fields', async () =>
		{
			const provider = new SQLiteProvider({
				filename: ':memory:'
			});

			const buildSelectSQL = (provider as any).buildSelectSQL.bind(provider);

			const query = {
				type: 'SELECT' as const,
				table: 'users',
				fields: ['users.id', 'users.name', 'posts.title']
			};

			const { sql } = buildSelectSQL(query);

			// Should produce: SELECT "users"."id", "users"."name", "posts"."title" FROM "users"
			expect(sql).toContain('"users"."id"');
			expect(sql).toContain('"users"."name"');
			expect(sql).toContain('"posts"."title"');
			expect(sql).not.toContain('"users.id"');
		});

		it('should escape table.field format correctly in WHERE conditions', async () =>
		{
			const provider = new SQLiteProvider({
				filename: ':memory:'
			});

			const buildSelectSQL = (provider as any).buildSelectSQL.bind(provider);

			const query = {
				type: 'SELECT' as const,
				table: 'users',
				where: {
					field: 'users.id',
					op: '=' as const,
					value: 1
				}
			};

			const { sql } = buildSelectSQL(query);

			// Should produce WHERE clause with: "users"."id" = ?
			expect(sql).toContain('WHERE "users"."id" = ?');
			expect(sql).not.toContain('WHERE "users.id" = ?');
		});
	});

	describe('Field reference without table prefix', () =>
	{
		it('MySQL should handle fields without table prefix', async () =>
		{
			const provider = new MySQLProvider({
				host: 'localhost',
				user: 'test',
				password: 'test',
				database: 'test'
			});

			const buildSelectSQL = (provider as any).buildSelectSQL.bind(provider);

			const query = {
				type: 'SELECT' as const,
				table: 'users',
				fields: ['id', 'name']
			};

			const { sql } = buildSelectSQL(query);

			// Should produce: SELECT `id`, `name` FROM `users`
			expect(sql).toContain('`id`');
			expect(sql).toContain('`name`');
		});

		it('PostgreSQL should handle fields without table prefix', async () =>
		{
			const provider = new PostgreSQLProvider({
				host: 'localhost',
				user: 'test',
				password: 'test',
				database: 'test'
			});

			const buildSelectSQL = (provider as any).buildSelectSQL.bind(provider);

			const query = {
				type: 'SELECT' as const,
				table: 'users',
				fields: ['id', 'name']
			};

			const { sql } = buildSelectSQL(query);

			// Should produce: SELECT "id", "name" FROM "users"
			expect(sql).toContain('"id"');
			expect(sql).toContain('"name"');
		});

		it('SQLite should handle fields without table prefix', async () =>
		{
			const provider = new SQLiteProvider({
				filename: ':memory:'
			});

			const buildSelectSQL = (provider as any).buildSelectSQL.bind(provider);

			const query = {
				type: 'SELECT' as const,
				table: 'users',
				fields: ['id', 'name']
			};

			const { sql } = buildSelectSQL(query);

			// Should produce: SELECT "id", "name" FROM "users"
			expect(sql).toContain('"id"');
			expect(sql).toContain('"name"');
		});
	});
});
