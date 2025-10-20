import { describe, it, expect } from 'vitest';
import { Query, Condition, Aggregate, Join } from './queryObject';

describe('QueryObject - Type Tests', () =>
{
	describe('Condition Type', () =>
	{
		it('should accept basic comparison conditions', () =>
		{
			const conditions: Condition[] = [
				{ field: 'age', op: '=', value: 25 },
				{ field: 'age', op: '!=', value: 30 },
				{ field: 'age', op: '>', value: 18 },
				{ field: 'age', op: '<', value: 65 },
				{ field: 'age', op: '>=', value: 21 },
				{ field: 'age', op: '<=', value: 60 },
			];

			// TypeScript compile-time check, will fail compilation if types are incorrect
			expect(conditions).toHaveLength(6);
		});

		it('should accept IN conditions with values array', () =>
		{
			const condition: Condition = {
				field: 'status',
				op: 'IN',
				values: ['active', 'pending', 'completed']
			};

			expect(condition.field).toBe('status');
			expect(condition.op).toBe('IN');
			expect((condition as any).values).toEqual(['active', 'pending', 'completed']);
		});

		it('should accept IN conditions with subquery', () =>
		{
			const subquery: Query = {
				type: 'SELECT',
				table: 'active_users',
				fields: ['user_id']
			};

			const condition: Condition = {
				field: 'user_id',
				op: 'IN',
				subquery: subquery
			};

			expect(condition.field).toBe('user_id');
			expect(condition.op).toBe('IN');
			expect((condition as any).subquery).toEqual(subquery);
		});

		it('should accept NOT IN conditions', () =>
		{
			const conditions: Condition[] = [
				{ field: 'status', op: 'NOT IN', values: ['deleted', 'banned'] },
				{
					field: 'user_id',
					op: 'NOT IN',
					subquery: {
						type: 'SELECT',
						table: 'blocked_users',
						fields: ['user_id']
					}
				}
			];

			expect(conditions).toHaveLength(2);
		});

		it('should accept AND/OR/NOT logical conditions', () =>
		{
			const andCondition: Condition = {
				and: [
					{ field: 'status', op: '=', value: 'active' },
					{ field: 'age', op: '>', value: 18 }
				]
			};

			const orCondition: Condition = {
				or: [
					{ field: 'role', op: '=', value: 'admin' },
					{ field: 'role', op: '=', value: 'moderator' }
				]
			};

			const notCondition: Condition = {
				not: { field: 'status', op: '=', value: 'deleted' }
			};

			expect(andCondition.and).toHaveLength(2);
			expect(orCondition.or).toHaveLength(2);
			expect(notCondition.not).toBeDefined();
		});

		it('should accept LIKE conditions', () =>
		{
			const likeCondition: Condition = {
				like: { field: 'name', pattern: 'John%' }
			};

			expect((likeCondition as any).like.field).toBe('name');
			expect((likeCondition as any).like.pattern).toBe('John%');
		});

		it('should accept nested complex conditions', () =>
		{
			const complexCondition: Condition = {
				and: [
					{ field: 'status', op: '=', value: 'active' },
					{
						or: [
							{ field: 'role', op: '=', value: 'admin' },
							{
								and: [
									{ field: 'role', op: '=', value: 'user' },
									{ field: 'verified', op: '=', value: true }
								]
							}
						]
					},
					{
						not: { field: 'flags', op: 'IN', values: ['banned', 'suspended'] }
					}
				]
			};

			expect(complexCondition.and).toHaveLength(3);
		});
	});

	describe('Aggregate Type', () =>
	{
		it('should accept all aggregate types', () =>
		{
			const aggregates: Aggregate[] = [
				{ type: 'COUNT', field: 'id' },
				{ type: 'SUM', field: 'amount' },
				{ type: 'AVG', field: 'score' },
				{ type: 'MIN', field: 'created_at' },
				{ type: 'MAX', field: 'updated_at' },
			];

			aggregates.forEach(agg =>
			{
				expect(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']).toContain(agg.type);
			});
		});

		it('should accept aggregates with aliases', () =>
		{
			const aggregatesWithAlias: Aggregate[] = [
				{ type: 'COUNT', field: 'id', alias: 'total_count' },
				{ type: 'SUM', field: 'amount', alias: 'total_amount' },
				{ type: 'AVG', field: 'score', alias: 'average_score' },
			];

			expect(aggregatesWithAlias[0].alias).toBe('total_count');
			expect(aggregatesWithAlias[1].alias).toBe('total_amount');
			expect(aggregatesWithAlias[2].alias).toBe('average_score');
		});
	});

	describe('Join Type', () =>
	{
		it('should accept all join types', () =>
		{
			const joins: Join[] = [
				{
					type: 'INNER',
					source: { table: 'user_profiles' },
					on: { field: 'user_id', op: '=', value: 'users.id' }
				},
				{
					type: 'LEFT',
					source: { table: 'user_settings' },
					on: { field: 'user_id', op: '=', value: 'users.id' }
				},
				{
					type: 'RIGHT',
					source: { table: 'user_roles' },
					on: { field: 'user_id', op: '=', value: 'users.id' }
				},
				{
					type: 'FULL',
					source: { table: 'user_logs' },
					on: { field: 'user_id', op: '=', value: 'users.id' }
				},
			];

			expect(joins).toHaveLength(4);
			joins.forEach(join =>
			{
				expect(['INNER', 'LEFT', 'RIGHT', 'FULL']).toContain(join.type);
			});
		});
	});

	describe('Query Type', () =>
	{
		it('should accept SELECT queries', () =>
		{
			const selectQuery: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['id', 'name', 'email'],
				where: { field: 'status', op: '=', value: 'active' },
				orderBy: [{ field: 'created_at', direction: 'DESC' }],
				limit: 10,
				offset: 0
			};

			expect(selectQuery.type).toBe('SELECT');
			expect(selectQuery.table).toBe('users');
			expect(selectQuery.fields).toHaveLength(3);
		});

		it('should accept SELECT queries with aggregates', () =>
		{
			const aggregateQuery: Query = {
				type: 'SELECT',
				table: 'orders',
				fields: [
					'customer_id',
					{ type: 'COUNT', field: 'id', alias: 'order_count' },
					{ type: 'SUM', field: 'total_amount', alias: 'total_spent' }
				],
				groupBy: ['customer_id'],
				orderBy: [{ field: 'total_spent', direction: 'DESC' }]
			};

			expect(aggregateQuery.fields).toHaveLength(3);
			expect(aggregateQuery.groupBy).toEqual(['customer_id']);
		});

		it('should accept SELECT queries with joins', () =>
		{
			const joinQuery: Query = {
				type: 'SELECT',
				table: 'users',
				fields: ['users.name', 'profiles.avatar', 'roles.name'],
				joins: [
					{
						type: 'LEFT',
						source: { table: 'user_profiles' },
						on: { field: 'user_id', op: '=', value: 'users.id' }
					},
					{
						type: 'INNER',
						source: { table: 'user_roles' },
						on: { field: 'user_id', op: '=', value: 'users.id' }
					}
				],
				where: { field: 'users.status', op: '=', value: 'active' }
			};

			expect(joinQuery.joins).toHaveLength(2);
		});

		it('should accept INSERT queries', () =>
		{
			const insertQuery: Query = {
				type: 'INSERT',
				table: 'users',
				values: {
					name: 'John Doe',
					email: 'john@example.com',
					status: 'active',
					created_at: new Date().toISOString()
				}
			};

			expect(insertQuery.type).toBe('INSERT');
			expect(insertQuery.values).toBeDefined();
			expect((insertQuery.values as any).name).toBe('John Doe');
		});

		it('should accept UPDATE queries', () =>
		{
			const updateQuery: Query = {
				type: 'UPDATE',
				table: 'users',
				values: {
					name: 'Jane Doe',
					updated_at: new Date().toISOString()
				},
				where: { field: 'id', op: '=', value: 1 }
			};

			expect(updateQuery.type).toBe('UPDATE');
			expect(updateQuery.values).toBeDefined();
			expect(updateQuery.where).toBeDefined();
		});

		it('should accept DELETE queries', () =>
		{
			const deleteQuery: Query = {
				type: 'DELETE',
				table: 'users',
				where: {
					and: [
						{ field: 'status', op: '=', value: 'inactive' },
						{ field: 'last_login', op: '<', value: '2022-01-01' }
					]
				}
			};

			expect(deleteQuery.type).toBe('DELETE');
			expect(deleteQuery.where).toBeDefined();
		});
	});

	describe('QueryResult Type', () =>
	{
		it('should accept various result formats', () =>
		{
			const selectResult = {
				rows: [
					{ id: 1, name: 'John', email: 'john@example.com' },
					{ id: 2, name: 'Jane', email: 'jane@example.com' }
				],
				affectedRows: 0,
				insertId: 0
			};

			const insertResult = {
				rows: [],
				affectedRows: 1,
				insertId: 123
			};

			const updateResult = {
				rows: [],
				affectedRows: 5,
				insertId: 0
			};

			const deleteResult = {
				rows: [],
				affectedRows: 3,
				insertId: 0
			};

			const errorResult = {
				rows: [],
				affectedRows: 0,
				insertId: 0,
				error: 'Database connection failed'
			};

			expect(selectResult.rows).toHaveLength(2);
			expect(insertResult.insertId).toBe(123);
			expect(updateResult.affectedRows).toBe(5);
			expect(deleteResult.affectedRows).toBe(3);
			expect(errorResult.error).toBe('Database connection failed');
		});
	});

	describe('Real-world Query Examples', () =>
	{
		it('should support complex e-commerce queries', () =>
		{
			const complexEcommerceQuery: Query = {
				type: 'SELECT',
				table: 'orders',
				fields: [
					'orders.id',
					'customers.name',
					'orders.total_amount',
					{ type: 'COUNT', field: 'order_items.id', alias: 'item_count' }
				],
				joins: [
					{
						type: 'INNER',
						source: { table: 'customers' },
						on: { field: 'customer_id', op: '=', value: 'orders.customer_id' }
					},
					{
						type: 'LEFT',
						source: { table: 'order_items' },
						on: { field: 'order_id', op: '=', value: 'orders.id' }
					}
				],
				where: {
					and: [
						{ field: 'orders.status', op: '=', value: 'completed' },
						{ field: 'orders.created_at', op: '>=', value: '2023-01-01' },
						{
							or: [
								{ field: 'orders.total_amount', op: '>', value: 100 },
								{ field: 'customers.vip_status', op: '=', value: true }
							]
						}
					]
				},
				groupBy: ['orders.id', 'customers.name'],
				orderBy: [
					{ field: 'orders.total_amount', direction: 'DESC' },
					{ field: 'orders.created_at', direction: 'DESC' }
				],
				limit: 50,
				offset: 0
			};

			expect(complexEcommerceQuery.type).toBe('SELECT');
			expect(complexEcommerceQuery.joins).toHaveLength(2);
			expect(complexEcommerceQuery.groupBy).toHaveLength(2);
			expect(complexEcommerceQuery.orderBy).toHaveLength(2);
		});

		it('should support analytics dashboard queries', () =>
		{
			const analyticsQuery: Query = {
				type: 'SELECT',
				table: 'user_activities',
				fields: [
					'activity_date',
					{ type: 'COUNT', field: 'user_id', alias: 'unique_users' },
					{ type: 'COUNT', field: 'id', alias: 'total_activities' },
					{ type: 'AVG', field: 'session_duration', alias: 'avg_session_duration' }
				],
				where: {
					and: [
						{ field: 'activity_date', op: '>=', value: '2023-01-01' },
						{ field: 'activity_date', op: '<=', value: '2023-12-31' },
						{ field: 'activity_type', op: 'IN', values: ['page_view', 'click', 'scroll'] }
					]
				},
				groupBy: ['activity_date'],
				orderBy: [{ field: 'activity_date', direction: 'ASC' }]
			};

			expect(analyticsQuery.fields).toHaveLength(4);
			expect(analyticsQuery.groupBy).toEqual(['activity_date']);
		});
	});
});