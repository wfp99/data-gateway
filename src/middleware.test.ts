import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Middleware, runMiddlewares } from './middleware';
import { Query } from './queryObject';
import { DataProvider } from './dataProvider';

describe('Middleware - Unit Tests', () =>
{
	let mockProvider: DataProvider;
	let mockQuery: Query;

	beforeEach(() =>
	{
		mockProvider = {
			connect: vi.fn().mockResolvedValue(undefined),
			disconnect: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 }),
		};

		mockQuery = {
			type: 'SELECT',
			table: 'test_table',
			fields: ['id', 'name'],
		};
	});

	describe('runMiddlewares Function', () =>
	{
		it('should execute query without middlewares', async () =>
		{
			const executeFn = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: 'John' }], affectedRows: 0, insertId: 0 });

			const result = await runMiddlewares([], mockQuery, executeFn);

			expect(executeFn).toHaveBeenCalledWith(mockQuery);
			expect(result).toEqual({ rows: [{ id: 1, name: 'John' }], affectedRows: 0, insertId: 0 });
		});

		it('should execute single middleware', async () =>
		{
			const middleware: Middleware = async (query, next) =>
			{
				// Modify query: add WHERE condition
				const modifiedQuery = {
					...query,
					where: { field: 'status', op: '=' as const, value: 'active' }
				};
				return next(modifiedQuery);
			};

			const executeFn = vi.fn().mockResolvedValue({ rows: [{ id: 1, name: 'John' }], affectedRows: 0, insertId: 0 });

			await runMiddlewares([middleware], mockQuery, executeFn);

			expect(executeFn).toHaveBeenCalledWith({
				...mockQuery,
				where: { field: 'status', op: '=', value: 'active' }
			});
		});

		it('should execute multiple middlewares in order', async () =>
		{
			const executionOrder: string[] = [];

			const middleware1: Middleware = async (query, next) =>
			{
				executionOrder.push('middleware1-before');
				const modifiedQuery = { ...query, limit: 10 };
				const result = await next(modifiedQuery);
				executionOrder.push('middleware1-after');
				return result;
			};

			const middleware2: Middleware = async (query, next) =>
			{
				executionOrder.push('middleware2-before');
				const modifiedQuery = { ...query, offset: 5 };
				const result = await next(modifiedQuery);
				executionOrder.push('middleware2-after');
				return result;
			};

			const executeFn = vi.fn().mockImplementation((query) =>
			{
				executionOrder.push('execute');
				return Promise.resolve({ rows: [], affectedRows: 0, insertId: 0 });
			});

			await runMiddlewares([middleware1, middleware2], mockQuery, executeFn);

			expect(executionOrder).toEqual([
				'middleware1-before',
				'middleware2-before',
				'execute',
				'middleware2-after',
				'middleware1-after'
			]);

			expect(executeFn).toHaveBeenCalledWith({
				...mockQuery,
				limit: 10,
				offset: 5
			});
		});

		it('should allow middleware to modify query result', async () =>
		{
			const middleware: Middleware = async (query, next) =>
			{
				const result = await next(query);
				// Add additional metadata to the result
				return {
					...result,
					metadata: { processedBy: 'middleware' }
				};
			};

			const executeFn = vi.fn().mockResolvedValue({ rows: [{ id: 1 }], affectedRows: 0, insertId: 0 });

			const result = await runMiddlewares([middleware], mockQuery, executeFn);

			expect(result).toEqual({
				rows: [{ id: 1 }],
				affectedRows: 0,
				insertId: 0,
				metadata: { processedBy: 'middleware' }
			});
		});

		it('should handle middleware that throws errors', async () =>
		{
			const errorMiddleware: Middleware = async (query, next) =>
			{
				throw new Error('Middleware error');
			};

			const executeFn = vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 });

			await expect(runMiddlewares([errorMiddleware], mockQuery, executeFn))
				.rejects.toThrow('Middleware error');

			expect(executeFn).not.toHaveBeenCalled();
		});

		it('should handle errors in execution function through middleware', async () =>
		{
			const errorHandlingMiddleware: Middleware = async (query, next) =>
			{
				try
				{
					return await next(query);
				} catch (error)
				{
					// Transform error format
					return {
						rows: [],
						affectedRows: 0,
						insertId: 0,
						error: `Handled: ${error instanceof Error ? error.message : String(error)}`
					};
				}
			};

			const executeFn = vi.fn().mockRejectedValue(new Error('Database error'));

			const result = await runMiddlewares([errorHandlingMiddleware], mockQuery, executeFn);

			expect(result).toEqual({
				rows: [],
				affectedRows: 0,
				insertId: 0,
				error: 'Handled: Database error'
			});
		});

		it('should allow middleware to skip execution', async () =>
		{
			const cachingMiddleware: Middleware = async (query, next) =>
			{
				// Simulate cache hit, skip actual execution
				if (query.type === 'SELECT' && query.table === 'test_table')
				{
					return {
						rows: [{ id: 1, name: 'Cached John' }],
						affectedRows: 0,
						insertId: 0,
						fromCache: true
					};
				}
				return next(query);
			};

			const executeFn = vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 });

			const result = await runMiddlewares([cachingMiddleware], mockQuery, executeFn);

			expect(executeFn).not.toHaveBeenCalled();
			expect(result).toEqual({
				rows: [{ id: 1, name: 'Cached John' }],
				affectedRows: 0,
				insertId: 0,
				fromCache: true
			});
		});
	});

	describe('Common Middleware Patterns', () =>
	{
		it('should implement logging middleware', async () =>
		{
			const logs: string[] = [];

			const loggingMiddleware: Middleware = async (query, next) =>
			{
				const startTime = Date.now();
				logs.push(`Executing ${query.type} on ${query.table}`);

				try
				{
					const result = await next(query);
					const duration = Date.now() - startTime;
					logs.push(`Completed ${query.type} in ${duration}ms`);
					return result;
				} catch (error)
				{
					logs.push(`Failed ${query.type}: ${error instanceof Error ? error.message : String(error)}`);
					throw error;
				}
			};

			const executeFn = vi.fn().mockResolvedValue({ rows: [{ id: 1 }], affectedRows: 1, insertId: 0 });

			await runMiddlewares([loggingMiddleware], mockQuery, executeFn);

			expect(logs).toHaveLength(2);
			expect(logs[0]).toBe('Executing SELECT on test_table');
			expect(logs[1]).toMatch(/Completed SELECT in \d+ms/);
		});

		it('should implement query transformation middleware', async () =>
		{
			const transformMiddleware: Middleware = async (query, next) =>
			{
				// Automatically add soft delete condition to all queries
				const modifiedQuery = { ...query };
				if (query.type === 'SELECT')
				{
					const softDeleteCondition = { field: 'deleted_at', op: '=' as const, value: null };
					if (query.where)
					{
						modifiedQuery.where = {
							and: [query.where, softDeleteCondition]
						};
					} else
					{
						modifiedQuery.where = softDeleteCondition;
					}
				}
				return next(modifiedQuery);
			};

			const executeFn = vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 });

			await runMiddlewares([transformMiddleware], mockQuery, executeFn);

			expect(executeFn).toHaveBeenCalledWith({
				...mockQuery,
				where: { field: 'deleted_at', op: '=', value: null }
			});
		});

		it('should implement validation middleware', async () =>
		{
			const validationMiddleware: Middleware = async (query, next) =>
			{
				// Validate that INSERT operations must include required fields
				if (query.type === 'INSERT')
				{
					if (!query.values || !query.values.name)
					{
						throw new Error('Name field is required for INSERT');
					}
				}
				return next(query);
			};

			const executeFn = vi.fn().mockResolvedValue({ rows: [], affectedRows: 1, insertId: 123 });

			// Test valid INSERT
			const validInsertQuery: Query = {
				type: 'INSERT',
				table: 'users',
				values: { name: 'John', email: 'john@example.com' }
			};

			const validResult = await runMiddlewares([validationMiddleware], validInsertQuery, executeFn);
			expect(validResult.insertId).toBe(123);

			// Test invalid INSERT
			const invalidInsertQuery: Query = {
				type: 'INSERT',
				table: 'users',
				values: { email: 'john@example.com' } // missing name
			};

			await expect(runMiddlewares([validationMiddleware], invalidInsertQuery, executeFn))
				.rejects.toThrow('Name field is required for INSERT');
		});

		it('should implement performance monitoring middleware', async () =>
		{
			const performanceData: { query: string, duration: number }[] = [];

			const performanceMiddleware: Middleware = async (query, next) =>
			{
				const startTime = process.hrtime.bigint();
				const result = await next(query);
				const endTime = process.hrtime.bigint();
				const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

				performanceData.push({
					query: `${query.type} ${query.table}`,
					duration
				});

				return result;
			};

			const executeFn = vi.fn().mockImplementation(() =>
				new Promise(resolve => setTimeout(() =>
					resolve({ rows: [], affectedRows: 0, insertId: 0 }), 10
				))
			);

			await runMiddlewares([performanceMiddleware], mockQuery, executeFn);

			expect(performanceData).toHaveLength(1);
			expect(performanceData[0].query).toBe('SELECT test_table');
			expect(performanceData[0].duration).toBeGreaterThan(0);
		});
	});

	describe('Edge Cases', () =>
	{
		it('should handle undefined next function gracefully', async () =>
		{
			// This is a theoretical edge case test
			const middlewares: Middleware[] = [];
			const executeFn = vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 });

			const result = await runMiddlewares(middlewares, mockQuery, executeFn);

			expect(executeFn).toHaveBeenCalledWith(mockQuery);
			expect(result).toEqual({ rows: [], affectedRows: 0, insertId: 0 });
		});

		it('should handle middleware that modifies query type', async () =>
		{
			const typeChangingMiddleware: Middleware = async (query, next) =>
			{
				// Convert SELECT to COUNT query for performance optimization
				if (query.type === 'SELECT' && query.limit === 0)
				{
					const countQuery: Query = {
						...query,
						type: 'SELECT',
						fields: [{ type: 'COUNT', field: '*', alias: 'total' }],
						limit: undefined,
						offset: undefined
					};
					return next(countQuery);
				}
				return next(query);
			};

			const countQuery: Query = { ...mockQuery, limit: 0 };
			const executeFn = vi.fn().mockResolvedValue({ rows: [{ total: 5 }], affectedRows: 0, insertId: 0 });

			await runMiddlewares([typeChangingMiddleware], countQuery, executeFn);

			expect(executeFn).toHaveBeenCalledWith({
				...countQuery,
				fields: [{ type: 'COUNT', field: '*', alias: 'total' }],
				limit: undefined,
				offset: undefined
			});
		});
	});
});