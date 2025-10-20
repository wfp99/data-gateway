import { describe, it, expect } from 'vitest';
import { QueryBuilder, WhereBuilder, JoinConditionBuilder } from './queryBuilder';
import { tableField, repoField } from './queryObject';

describe('QueryBuilder', () =>
{
	describe('Basic SELECT Queries', () =>
	{
		it('should build simple SELECT query', () =>
		{
			const query = new QueryBuilder('users')
				.select('id', 'name', 'email')
				.build();

			expect(query).toEqual({
				type: 'SELECT',
				table: 'users',
				fields: ['id', 'name', 'email']
			});
		});

		it('should build SELECT with FieldReference objects', () =>
		{
			const query = new QueryBuilder('users')
				.select(
					tableField('users', 'id'),
					tableField('users', 'name')
				)
				.build();

			expect(query).toEqual({
				type: 'SELECT',
				table: 'users',
				fields: [
					{ table: 'users', field: 'id' },
					{ table: 'users', field: 'name' }
				]
			});
		});

		it('should build SELECT with mixed string and FieldReference', () =>
		{
			const query = new QueryBuilder('users')
				.select(
					'id',
					tableField('users', 'name'),
					'email'
				)
				.build();

			expect(query.fields).toEqual([
				'id',
				{ table: 'users', field: 'name' },
				'email'
			]);
		});

		it('should allow setting table separately', () =>
		{
			const query = new QueryBuilder()
				.table('users')
				.select('id', 'name')
				.build();

			expect(query.table).toBe('users');
		});

		it('should throw error if table not set', () =>
		{
			const builder = new QueryBuilder()
				.select('id', 'name');

			expect(() => builder.build()).toThrow('Table name is required');
		});
	});

	describe('Aggregate Functions', () =>
	{
		it('should build COUNT query', () =>
		{
			const query = new QueryBuilder('users')
				.count('id', 'totalUsers')
				.build();

			expect(query.fields).toEqual([
				{ type: 'COUNT', field: 'id', alias: 'totalUsers' }
			]);
		});

		it('should build SUM query', () =>
		{
			const query = new QueryBuilder('orders')
				.sum('amount', 'totalAmount')
				.build();

			expect(query.fields).toEqual([
				{ type: 'SUM', field: 'amount', alias: 'totalAmount' }
			]);
		});

		it('should build AVG query', () =>
		{
			const query = new QueryBuilder('products')
				.avg('price', 'avgPrice')
				.build();

			expect(query.fields).toEqual([
				{ type: 'AVG', field: 'price', alias: 'avgPrice' }
			]);
		});

		it('should build MIN query', () =>
		{
			const query = new QueryBuilder('products')
				.min('price', 'minPrice')
				.build();

			expect(query.fields).toEqual([
				{ type: 'MIN', field: 'price', alias: 'minPrice' }
			]);
		});

		it('should build MAX query', () =>
		{
			const query = new QueryBuilder('products')
				.max('price', 'maxPrice')
				.build();

			expect(query.fields).toEqual([
				{ type: 'MAX', field: 'price', alias: 'maxPrice' }
			]);
		});

		it('should build query with mixed fields and aggregates', () =>
		{
			const query = new QueryBuilder('orders')
				.select('userId')
				.count('id', 'orderCount')
				.sum('amount', 'totalSpent')
				.build();

			expect(query.fields).toEqual([
				'userId',
				{ type: 'COUNT', field: 'id', alias: 'orderCount' },
				{ type: 'SUM', field: 'amount', alias: 'totalSpent' }
			]);
		});

		it('should support FieldReference in aggregates', () =>
		{
			const query = new QueryBuilder('orders')
				.count(tableField('orders', 'id'), 'total')
				.build();

			expect(query.fields).toEqual([
				{ type: 'COUNT', field: { table: 'orders', field: 'id' }, alias: 'total' }
			]);
		});
	});

	describe('WHERE Conditions', () =>
	{
		it('should build simple WHERE with equals', () =>
		{
			const query = new QueryBuilder('users')
				.select('id', 'name')
				.where(w => w.equals('status', 'active'))
				.build();

			expect(query.where).toEqual({
				field: 'status',
				op: '=',
				value: 'active'
			});
		});

		it('should build WHERE with multiple conditions (AND)', () =>
		{
			const query = new QueryBuilder('users')
				.select('id', 'name')
				.where(w => w
					.equals('status', 'active')
					.greaterThan('age', 18)
				)
				.build();

			expect(query.where).toEqual({
				and: [
					{ field: 'status', op: '=', value: 'active' },
					{ field: 'age', op: '>', value: 18 }
				]
			});
		});

		it('should support all comparison operators', () =>
		{
			const query = new QueryBuilder('users')
				.select('id')
				.where(w => w
					.equals('a', 1)
					.notEquals('b', 2)
					.greaterThan('c', 3)
					.lessThan('d', 4)
					.greaterThanOrEquals('e', 5)
					.lessThanOrEquals('f', 6)
				)
				.build();

			expect(query.where).toEqual({
				and: [
					{ field: 'a', op: '=', value: 1 },
					{ field: 'b', op: '!=', value: 2 },
					{ field: 'c', op: '>', value: 3 },
					{ field: 'd', op: '<', value: 4 },
					{ field: 'e', op: '>=', value: 5 },
					{ field: 'f', op: '<=', value: 6 }
				]
			});
		});

		it('should build WHERE with IN condition', () =>
		{
			const query = new QueryBuilder('users')
				.select('id')
				.where(w => w.in('status', ['active', 'pending']))
				.build();

			expect(query.where).toEqual({
				field: 'status',
				op: 'IN',
				values: ['active', 'pending']
			});
		});

		it('should build WHERE with NOT IN condition', () =>
		{
			const query = new QueryBuilder('users')
				.select('id')
				.where(w => w.notIn('status', ['deleted', 'banned']))
				.build();

			expect(query.where).toEqual({
				field: 'status',
				op: 'NOT IN',
				values: ['deleted', 'banned']
			});
		});

		it('should build WHERE with LIKE condition', () =>
		{
			const query = new QueryBuilder('users')
				.select('id')
				.where(w => w.like('name', '%John%'))
				.build();

			expect(query.where).toEqual({
				like: { field: 'name', pattern: '%John%' }
			});
		});

		it('should build WHERE with OR condition', () =>
		{
			const query = new QueryBuilder('users')
				.select('id')
				.where(w => w.or(or => or
					.equals('status', 'active')
					.equals('status', 'pending')
				))
				.build();

			expect(query.where).toEqual({
				or: [
					{ field: 'status', op: '=', value: 'active' },
					{ field: 'status', op: '=', value: 'pending' }
				]
			});
		});

		it('should build WHERE with NOT condition', () =>
		{
			const query = new QueryBuilder('users')
				.select('id')
				.where(w => w.not(not => not.equals('status', 'deleted')))
				.build();

			expect(query.where).toEqual({
				not: { field: 'status', op: '=', value: 'deleted' }
			});
		});

		it('should build complex nested WHERE conditions', () =>
		{
			const query = new QueryBuilder('users')
				.select('id')
				.where(w => w
					.equals('verified', true)
					.or(or => or
						.equals('role', 'admin')
						.equals('role', 'moderator')
					)
				)
				.build();

			expect(query.where).toEqual({
				and: [
					{ field: 'verified', op: '=', value: true },
					{
						or: [
							{ field: 'role', op: '=', value: 'admin' },
							{ field: 'role', op: '=', value: 'moderator' }
						]
					}
				]
			});
		});

		it('should support FieldReference in WHERE', () =>
		{
			const query = new QueryBuilder('users')
				.select('id')
				.where(w => w.equals(tableField('users', 'status'), 'active'))
				.build();

			expect(query.where).toEqual({
				field: { table: 'users', field: 'status' },
				op: '=',
				value: 'active'
			});
		});
	});

	describe('JOIN Clauses', () =>
	{
		it('should build INNER JOIN', () =>
		{
			const query = new QueryBuilder('users')
				.select('users.id', 'posts.title')
				.innerJoin(
					{ table: 'posts' },
					on => on.equals('users.id', 'posts.userId')
				)
				.build();

			expect(query.joins).toEqual([
				{
					type: 'INNER',
					source: { table: 'posts' },
					on: {
						field: 'users.id',
						op: '=',
						value: 'posts.userId'
					}
				}
			]);
		});

		it('should build LEFT JOIN', () =>
		{
			const query = new QueryBuilder('users')
				.select('*')
				.leftJoin(
					{ table: 'profiles' },
					on => on.equals('users.id', 'profiles.userId')
				)
				.build();

			expect(query.joins?.[0].type).toBe('LEFT');
		});

		it('should build RIGHT JOIN', () =>
		{
			const query = new QueryBuilder('users')
				.select('*')
				.rightJoin(
					{ table: 'posts' },
					on => on.equals('users.id', 'posts.userId')
				)
				.build();

			expect(query.joins?.[0].type).toBe('RIGHT');
		});

		it('should build FULL JOIN', () =>
		{
			const query = new QueryBuilder('users')
				.select('*')
				.fullJoin(
					{ table: 'posts' },
					on => on.equals('users.id', 'posts.userId')
				)
				.build();

			expect(query.joins?.[0].type).toBe('FULL');
		});

		it('should build multiple JOINs', () =>
		{
			const query = new QueryBuilder('users')
				.select('*')
				.leftJoin(
					{ table: 'posts' },
					on => on.equals('users.id', 'posts.userId')
				)
				.leftJoin(
					{ table: 'comments' },
					on => on.equals('posts.id', 'comments.postId')
				)
				.build();

			expect(query.joins).toHaveLength(2);
			expect(query.joins?.[0].source).toEqual({ table: 'posts' });
			expect(query.joins?.[1].source).toEqual({ table: 'comments' });
		});

		it('should support repository JOIN source', () =>
		{
			const query = new QueryBuilder('users')
				.select('*')
				.leftJoin(
					{ repository: 'posts' },
					on => on.equals('users.id', 'posts.userId')
				)
				.build();

			expect(query.joins?.[0].source).toEqual({ repository: 'posts' });
		});

		it('should support FieldReference in JOIN ON', () =>
		{
			const query = new QueryBuilder('users')
				.select('*')
				.innerJoin(
					{ table: 'posts' },
					on => on.equals(
						tableField('users', 'id'),
						tableField('posts', 'userId')
					)
				)
				.build();

			expect(query.joins?.[0].on).toEqual({
				field: { table: 'users', field: 'id' },
				op: '=',
				value: 'posts.userId'
			});
		});

		it('should support complex JOIN ON conditions with AND', () =>
		{
			const query = new QueryBuilder('users')
				.select('*')
				.innerJoin(
					{ table: 'posts' },
					on => on
						.equals('users.id', 'posts.userId')
						.and(and => and.equals('posts.status', 'published'))
				)
				.build();

			expect(query.joins?.[0].on).toEqual({
				and: [
					{ field: 'users.id', op: '=', value: 'posts.userId' },
					{ field: 'posts.status', op: '=', value: 'published' }
				]
			});
		});

		it('should support JOIN ON with LIKE', () =>
		{
			const query = new QueryBuilder('users')
				.select('*')
				.leftJoin(
					{ table: 'search' },
					on => on.like('search.term', '%user%')
				)
				.build();

			expect(query.joins?.[0].on).toEqual({
				like: { field: 'search.term', pattern: '%user%' }
			});
		});
	});

	describe('GROUP BY and ORDER BY', () =>
	{
		it('should build GROUP BY clause', () =>
		{
			const query = new QueryBuilder('orders')
				.select('userId')
				.count('id', 'orderCount')
				.groupBy('userId')
				.build();

			expect(query.groupBy).toEqual(['userId']);
		});

		it('should build GROUP BY with multiple fields', () =>
		{
			const query = new QueryBuilder('orders')
				.select('userId', 'status')
				.count('id', 'total')
				.groupBy('userId', 'status')
				.build();

			expect(query.groupBy).toEqual(['userId', 'status']);
		});

		it('should support FieldReference in GROUP BY', () =>
		{
			const query = new QueryBuilder('orders')
				.select('userId')
				.count('id', 'total')
				.groupBy(tableField('orders', 'userId'))
				.build();

			expect(query.groupBy).toEqual([
				{ table: 'orders', field: 'userId' }
			]);
		});

		it('should build ORDER BY clause', () =>
		{
			const query = new QueryBuilder('users')
				.select('id', 'name')
				.orderBy('createdAt', 'DESC')
				.build();

			expect(query.orderBy).toEqual([
				{ field: 'createdAt', direction: 'DESC' }
			]);
		});

		it('should default to ASC if direction not specified', () =>
		{
			const query = new QueryBuilder('users')
				.select('id', 'name')
				.orderBy('name')
				.build();

			expect(query.orderBy).toEqual([
				{ field: 'name', direction: 'ASC' }
			]);
		});

		it('should build ORDER BY with multiple fields', () =>
		{
			const query = new QueryBuilder('users')
				.select('id', 'name')
				.orderBy('status', 'ASC')
				.orderBy('createdAt', 'DESC')
				.build();

			expect(query.orderBy).toEqual([
				{ field: 'status', direction: 'ASC' },
				{ field: 'createdAt', direction: 'DESC' }
			]);
		});

		it('should support FieldReference in ORDER BY', () =>
		{
			const query = new QueryBuilder('users')
				.select('id')
				.orderBy(tableField('users', 'createdAt'), 'DESC')
				.build();

			expect(query.orderBy).toEqual([
				{ field: { table: 'users', field: 'createdAt' }, direction: 'DESC' }
			]);
		});
	});

	describe('LIMIT and OFFSET', () =>
	{
		it('should build query with LIMIT', () =>
		{
			const query = new QueryBuilder('users')
				.select('id', 'name')
				.limit(10)
				.build();

			expect(query.limit).toBe(10);
		});

		it('should build query with OFFSET', () =>
		{
			const query = new QueryBuilder('users')
				.select('id', 'name')
				.offset(20)
				.build();

			expect(query.offset).toBe(20);
		});

		it('should build query with LIMIT and OFFSET', () =>
		{
			const query = new QueryBuilder('users')
				.select('id', 'name')
				.limit(10)
				.offset(20)
				.build();

			expect(query.limit).toBe(10);
			expect(query.offset).toBe(20);
		});
	});

	describe('Static Factory Methods', () =>
	{
		it('should create INSERT query', () =>
		{
			const query = QueryBuilder.insert('users', {
				name: 'John',
				email: 'john@example.com'
			}).build();

			expect(query).toEqual({
				type: 'INSERT',
				table: 'users',
				values: {
					name: 'John',
					email: 'john@example.com'
				}
			});
		});

		it('should create UPDATE query', () =>
		{
			const query = QueryBuilder.update('users', { status: 'active' })
				.where(w => w.equals('id', 123))
				.build();

			expect(query).toEqual({
				type: 'UPDATE',
				table: 'users',
				values: { status: 'active' },
				where: { field: 'id', op: '=', value: 123 }
			});
		});

		it('should create DELETE query', () =>
		{
			const query = QueryBuilder.delete('users')
				.where(w => w.equals('id', 123))
				.build();

			expect(query).toEqual({
				type: 'DELETE',
				table: 'users',
				where: { field: 'id', op: '=', value: 123 }
			});
		});
	});

	describe('Complex Real-world Scenarios', () =>
	{
		it('should build complex analytics query', () =>
		{
			const query = new QueryBuilder('orders')
				.select('userId', 'status')
				.count('id', 'orderCount')
				.sum('amount', 'totalRevenue')
				.avg('amount', 'avgOrderValue')
				.where(w => w
					.greaterThanOrEquals('createdAt', '2024-01-01')
					.in('status', ['completed', 'shipped'])
				)
				.groupBy('userId', 'status')
				.orderBy('totalRevenue', 'DESC')
				.limit(100)
				.build();

			expect(query).toMatchObject({
				type: 'SELECT',
				table: 'orders',
				fields: expect.arrayContaining([
					'userId',
					'status',
					{ type: 'COUNT', field: 'id', alias: 'orderCount' },
					{ type: 'SUM', field: 'amount', alias: 'totalRevenue' },
					{ type: 'AVG', field: 'amount', alias: 'avgOrderValue' }
				]),
				groupBy: ['userId', 'status'],
				limit: 100
			});
		});

		it('should build complex JOIN query with conditions', () =>
		{
			const query = new QueryBuilder('users')
				.select(
					tableField('users', 'id'),
					tableField('users', 'name'),
					tableField('posts', 'title')
				)
				.leftJoin(
					{ table: 'posts' },
					on => on.equals(
						tableField('users', 'id'),
						tableField('posts', 'userId')
					)
				)
				.where(w => w
					.equals(tableField('users', 'status'), 'active')
					.greaterThan(tableField('posts', 'views'), 100)
				)
				.orderBy(tableField('posts', 'createdAt'), 'DESC')
				.limit(50)
				.build();

			expect(query.joins).toHaveLength(1);
			expect(query.where).toBeDefined();
			expect(query.limit).toBe(50);
		});
	});
});

describe('WhereBuilder', () =>
{
	it('should build single condition', () =>
	{
		const builder = new WhereBuilder();
		builder.equals('status', 'active');
		const condition = builder.build();

		expect(condition).toEqual({
			field: 'status',
			op: '=',
			value: 'active'
		});
	});

	it('should build AND conditions', () =>
	{
		const builder = new WhereBuilder();
		builder
			.equals('status', 'active')
			.greaterThan('age', 18);
		const condition = builder.build();

		expect(condition).toEqual({
			and: [
				{ field: 'status', op: '=', value: 'active' },
				{ field: 'age', op: '>', value: 18 }
			]
		});
	});

	it('should return undefined for empty builder', () =>
	{
		const builder = new WhereBuilder();
		const condition = builder.build();

		expect(condition).toBeUndefined();
	});
});

describe('JoinConditionBuilder', () =>
{
	it('should build equals condition', () =>
	{
		const builder = new JoinConditionBuilder();
		builder.equals('users.id', 'posts.userId');
		const condition = builder.build();

		expect(condition).toEqual({
			field: 'users.id',
			op: '=',
			value: 'posts.userId'
		});
	});

	it('should build notEquals condition', () =>
	{
		const builder = new JoinConditionBuilder();
		builder.notEquals('users.status', 'posts.status');
		const condition = builder.build();

		expect(condition).toEqual({
			field: 'users.status',
			op: '!=',
			value: 'posts.status'
		});
	});

	it('should build LIKE condition', () =>
	{
		const builder = new JoinConditionBuilder();
		builder.like('search.term', '%query%');
		const condition = builder.build();

		expect(condition).toEqual({
			like: { field: 'search.term', pattern: '%query%' }
		});
	});

	it('should build AND conditions', () =>
	{
		const builder = new JoinConditionBuilder();
		builder
			.equals('users.id', 'posts.userId')
			.and(and => and.equals('posts.status', 'published'));
		const condition = builder.build();

		expect(condition).toEqual({
			and: [
				{ field: 'users.id', op: '=', value: 'posts.userId' },
				{ field: 'posts.status', op: '=', value: 'published' }
			]
		});
	});

	it('should build OR conditions', () =>
	{
		const builder = new JoinConditionBuilder();
		builder
			.equals('users.id', 'posts.userId')
			.or(or => or.like('posts.title', '%test%'));
		const condition = builder.build();

		expect(condition).toEqual({
			or: [
				{ field: 'users.id', op: '=', value: 'posts.userId' },
				{ like: { field: 'posts.title', pattern: '%test%' } }
			]
		});
	});
});
