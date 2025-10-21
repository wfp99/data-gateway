/**
 * Tests for QueryCompiler
 */

import { describe, it, expect } from 'vitest';
import { QueryCompiler } from './queryCompiler';
import { MySQLEscaper, PostgreSQLEscaper, SQLiteEscaper } from './dataProviders/sqlEscaper';
import { Query } from './queryObject';

describe('QueryCompiler', () =>
{
	describe('MySQL Compiler', () =>
	{
		const compiler = new QueryCompiler(new MySQLEscaper());

		it('should compile simple SELECT query', () =>
		{
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['id', 'name', 'email']
			};

			const prepared = compiler.compile(query);

			expect(prepared.type).toBe('SELECT');
			expect(prepared.table).toBe('users');
			expect(prepared.safeFields).toEqual(['`id`', '`name`', '`email`']);
		});

		it('should compile SELECT with WHERE condition', () =>
		{
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['*'],
				where: { field: 'age', op: '>', value: 18 }
			};

			const prepared = compiler.compile(query);

			expect(prepared.where).toBeDefined();
			expect(prepared.where!.sql).toBe('`age` > ?');
			expect(prepared.where!.params).toEqual([18]);
		});

		it('should compile SELECT with AND condition', () =>
		{
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['*'],
				where: {
					and: [
						{ field: 'age', op: '>=', value: 18 },
						{ field: 'status', op: '=', value: 'active' }
					]
				}
			};

			const prepared = compiler.compile(query);

			expect(prepared.where!.sql).toBe('(`age` >= ?) AND (`status` = ?)');
			expect(prepared.where!.params).toEqual([18, 'active']);
		});

		it('should compile SELECT with OR condition', () =>
		{
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['*'],
				where: {
					or: [
						{ field: 'role', op: '=', value: 'admin' },
						{ field: 'role', op: '=', value: 'moderator' }
					]
				}
			};

			const prepared = compiler.compile(query);

			expect(prepared.where!.sql).toBe('(`role` = ?) OR (`role` = ?)');
			expect(prepared.where!.params).toEqual(['admin', 'moderator']);
		});

		it('should compile SELECT with IN condition', () =>
		{
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['*'],
				where: { field: 'id', op: 'IN', values: [1, 2, 3] }
			};

			const prepared = compiler.compile(query);

			expect(prepared.where!.sql).toBe('`id` IN (?, ?, ?)');
			expect(prepared.where!.params).toEqual([1, 2, 3]);
		});

		it('should compile SELECT with LIKE condition', () =>
		{
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['*'],
				where: { like: { field: 'name', pattern: 'John%' } }
			};

			const prepared = compiler.compile(query);

			expect(prepared.where!.sql).toBe('`name` LIKE ?');
			expect(prepared.where!.params).toEqual(['John%']);
		});

		it('should compile SELECT with NOT condition', () =>
		{
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['*'],
				where: {
					not: { field: 'status', op: '=', value: 'deleted' }
				}
			};

			const prepared = compiler.compile(query);

			expect(prepared.where!.sql).toBe('NOT (`status` = ?)');
			expect(prepared.where!.params).toEqual(['deleted']);
		});

		it('should compile SELECT with table.field reference', () =>
		{
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: [{ table: 'users', field: 'name' }]
			};

			const prepared = compiler.compile(query);

			expect(prepared.safeFields).toEqual(['`users`.`name`']);
		});

		it('should compile SELECT with aggregate', () =>
		{
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: [
					{ type: 'COUNT', field: 'id', alias: 'total' }
				]
			};

			const prepared = compiler.compile(query);

			expect(prepared.safeFields).toEqual(['COUNT(`id`) AS `total`']);
		});

		it('should compile SELECT with ORDER BY', () =>
		{
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['*'],
				orderBy: [
					{ field: 'name', direction: 'ASC' },
					{ field: 'age', direction: 'DESC' }
				]
			};

			const prepared = compiler.compile(query);

			expect(prepared.orderBy).toHaveLength(2);
			expect(prepared.orderBy![0].field).toBe('`name`');
			expect(prepared.orderBy![0].direction).toBe('ASC');
			expect(prepared.orderBy![1].field).toBe('`age`');
			expect(prepared.orderBy![1].direction).toBe('DESC');
		});

		it('should compile SELECT with GROUP BY', () =>
		{
			const query: Query = {
				type: 'SELECT',
				table: 'orders',
				fields: ['user_id', { type: 'COUNT', field: 'id', alias: 'order_count' }],
				groupBy: ['user_id']
			};

			const prepared = compiler.compile(query);

			expect(prepared.groupBy).toEqual(['`user_id`']);
		});

		it('should compile SELECT with LIMIT and OFFSET', () =>
		{
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['*'],
				limit: 10,
				offset: 20
			};

			const prepared = compiler.compile(query);

			expect(prepared.limit).toBe(10);
			expect(prepared.offset).toBe(20);
		});

		it('should compile INSERT query', () =>
		{
			const query: Query = {
				type: 'INSERT',
				table: 'users',
				values: {
					name: 'John',
					email: 'john@example.com',
					age: 30
				}
			};

			const prepared = compiler.compile(query);

			expect(prepared.type).toBe('INSERT');
			expect(prepared.table).toBe('users');
			expect(prepared.values).toEqual({
				name: 'John',
				email: 'john@example.com',
				age: 30
			});
		});

		it('should compile UPDATE query', () =>
		{
			const query: Query = {
				type: 'UPDATE',
				table: 'users',
				values: { status: 'inactive' },
				where: { field: 'id', op: '=', value: 123 }
			};

			const prepared = compiler.compile(query);

			expect(prepared.type).toBe('UPDATE');
			expect(prepared.values).toEqual({ status: 'inactive' });
			expect(prepared.where!.sql).toBe('`id` = ?');
			expect(prepared.where!.params).toEqual([123]);
		});

		it('should compile DELETE query', () =>
		{
			const query: Query = {
				type: 'DELETE',
				table: 'users',
				where: { field: 'status', op: '=', value: 'deleted' }
			};

			const prepared = compiler.compile(query);

			expect(prepared.type).toBe('DELETE');
			expect(prepared.table).toBe('users');
			expect(prepared.where!.sql).toBe('`status` = ?');
		});

		it('should throw error for invalid identifier', () =>
		{
			const query: Query = {
				type: 'SELECT',
				table: 'users; DROP TABLE users',
				fields: ['*']
			};

			expect(() => compiler.compile(query)).toThrow('Invalid identifier');
		});

		it('should handle complex nested conditions', () =>
		{
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['*'],
				where: {
					and: [
						{ field: 'age', op: '>=', value: 18 },
						{
							or: [
								{ field: 'country', op: '=', value: 'US' },
								{ field: 'country', op: '=', value: 'CA' }
							]
						}
					]
				}
			};

			const prepared = compiler.compile(query);

			expect(prepared.where!.sql).toBe('(`age` >= ?) AND ((`country` = ?) OR (`country` = ?))');
			expect(prepared.where!.params).toEqual([18, 'US', 'CA']);
		});
	});

	describe('PostgreSQL Compiler', () =>
	{
		const compiler = new QueryCompiler(new PostgreSQLEscaper());

		it('should use double quotes for identifiers', () =>
		{
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['id', 'name']
			};

			const prepared = compiler.compile(query);

			expect(prepared.safeFields).toEqual(['"id"', '"name"']);
		});

		it('should escape table.field with double quotes', () =>
		{
			const query: Query = {
				type: 'SELECT',
				table: 'users',
				fields: [{ table: 'users', field: 'email' }]
			};

			const prepared = compiler.compile(query);

			expect(prepared.safeFields).toEqual(['"users"."email"']);
		});
	});

	describe('SQLite Compiler', () =>
	{
		const compiler = new QueryCompiler(new SQLiteEscaper());

		it('should use double quotes for identifiers', () =>
		{
			const query: Query = {
				type: 'SELECT',
				table: 'products',
				fields: ['id', 'name', 'price']
			};

			const prepared = compiler.compile(query);

			expect(prepared.safeFields).toEqual(['"id"', '"name"', '"price"']);
		});
	});
});
