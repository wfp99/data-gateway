import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataGateway, DataGatewayConfig } from '../index';
import { DataProvider } from '../dataProvider';
import { MappingFieldMapper } from '../entityFieldMapper';

describe('End-to-End Integration Tests', () =>
{
	let gateway: DataGateway;
	let mockProvider: DataProvider;

	beforeEach(() =>
	{
		vi.clearAllMocks();

		mockProvider = {
			connect: vi.fn().mockResolvedValue(undefined),
			disconnect: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 }),
		};
	});

	afterEach(async () =>
	{
		if (gateway)
		{
			await gateway.disconnectAll();
		}
	});

	describe('Real-world Usage Scenarios', () =>
	{
		it('should handle complete user management workflow', async () =>
		{
			// Configure Gateway settings
			const config: DataGatewayConfig = {
				providers: {
					userDb: { type: 'custom', options: { provider: mockProvider } },
				},
				repositories: {
					user: {
						provider: 'userDb',
						table: 'users',
						mapper: new MappingFieldMapper({
							userName: 'user_name',
							userEmail: 'user_email',
							firstName: 'first_name',
							lastName: 'last_name',
							createdAt: 'created_at',
							updatedAt: 'updated_at',
						})
					},
				},
			};

			gateway = await DataGateway.build(config);
			const userRepo = gateway.getRepository('user');

			interface User
			{
				id?: number;
				userName: string;
				userEmail: string;
				firstName: string;
				lastName: string;
				status?: string;
				createdAt?: string;
				updatedAt?: string;
			}

			// 1. Create new user
			vi.mocked(mockProvider.query).mockResolvedValueOnce({
				rows: [],
				affectedRows: 1,
				insertId: 123
			});

			const newUser: Partial<User> = {
				userName: 'john_doe',
				userEmail: 'john@example.com',
				firstName: 'John',
				lastName: 'Doe',
				status: 'active'
			};

			const insertId = await userRepo?.insert(newUser);
			expect(insertId).toBe(123);

			// Verify that the insert query used correct field mapping
			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'INSERT',
				table: 'users',
				values: {
					user_name: 'john_doe',
					user_email: 'john@example.com',
					first_name: 'John',
					last_name: 'Doe',
					status: 'active'
				}
			});

			// 2. Query user
			vi.mocked(mockProvider.query).mockResolvedValueOnce({
				rows: [{
					id: 123,
					user_name: 'john_doe',
					user_email: 'john@example.com',
					first_name: 'John',
					last_name: 'Doe',
					status: 'active',
					created_at: '2023-01-01T00:00:00Z'
				}],
				affectedRows: 0,
				insertId: 0
			});

			const foundUser = await userRepo?.findOne({ field: 'id', op: '=' as const, value: 123 });
			expect(foundUser).toEqual({
				id: 123,
				userName: 'john_doe',
				userEmail: 'john@example.com',
				firstName: 'John',
				lastName: 'Doe',
				status: 'active',
				createdAt: '2023-01-01T00:00:00Z'
			});

			// 3. Update user
			vi.mocked(mockProvider.query).mockResolvedValueOnce({
				rows: [],
				affectedRows: 1,
				insertId: 0
			});

			const updatedRows = await userRepo?.update(
				{ userEmail: 'john.doe@example.com' },
				{ field: 'id', op: '=' as const, value: 123 }
			);
			expect(updatedRows).toBe(1);

			// Verify that the update query used correct field mapping
			expect(mockProvider.query).toHaveBeenLastCalledWith({
				type: 'UPDATE',
				table: 'users',
				values: {
					user_email: 'john.doe@example.com'
				},
				where: { field: 'id', op: '=', value: 123 }
			});

			// 4. Query multiple users
			vi.mocked(mockProvider.query).mockResolvedValueOnce({
				rows: [
					{
						id: 123,
						user_name: 'john_doe',
						user_email: 'john.doe@example.com',
						first_name: 'John',
						last_name: 'Doe',
						status: 'active'
					},
					{
						id: 124,
						user_name: 'jane_doe',
						user_email: 'jane@example.com',
						first_name: 'Jane',
						last_name: 'Doe',
						status: 'active'
					}
				],
				affectedRows: 0,
				insertId: 0
			});

			const activeUsers = await userRepo?.find({
				fields: ['id', 'userName', 'userEmail', 'firstName', 'lastName'],
				where: { field: 'status', op: '=' as const, value: 'active' },
				orderBy: [{ field: 'firstName', direction: 'ASC' }],
				limit: 10
			});

			expect(activeUsers).toHaveLength(2);
			expect(activeUsers?.[0].userName).toBe('john_doe');
			expect(activeUsers?.[1].userName).toBe('jane_doe');

			// 5. Delete user
			vi.mocked(mockProvider.query).mockResolvedValueOnce({
				rows: [],
				affectedRows: 1,
				insertId: 0
			});

			const deletedRows = await userRepo?.delete({ field: 'id', op: '=' as const, value: 124 });
			expect(deletedRows).toBe(1);
		});

		it('should handle complex analytics workflow', async () =>
		{
			const config: DataGatewayConfig = {
				providers: {
					analyticsDb: { type: 'custom', options: { provider: mockProvider } },
				},
				repositories: {
					order: { provider: 'analyticsDb', table: 'orders' },
				},
			};

			gateway = await DataGateway.build(config);
			const orderRepo = gateway.getRepository('order');

			// 1. Count active orders
			vi.mocked(mockProvider.query).mockResolvedValueOnce({
				rows: [{ result: 150 }],
				affectedRows: 0,
				insertId: 0
			});

			const activeOrderCount = await orderRepo?.count('id', {
				field: 'status',
				op: '=' as const,
				value: 'active'
			});

			expect(activeOrderCount).toBe(150);

			// 2. Calculate total order amount
			vi.mocked(mockProvider.query).mockResolvedValueOnce({
				rows: [{ total_amount: 25000, shipping_cost: 1200 }],
				affectedRows: 0,
				insertId: 0
			});

			const orderSums = await orderRepo?.sum(['total_amount', 'shipping_cost'], {
				and: [
					{ field: 'status', op: '=' as const, value: 'completed' },
					{ field: 'created_at', op: '>=', value: '2023-01-01' }
				]
			});

			expect(orderSums).toEqual({
				total_amount: 25000,
				shipping_cost: 1200
			});

			// 3. Complex aggregation query
			vi.mocked(mockProvider.query).mockResolvedValueOnce({
				rows: [
					{ customer_id: 1, order_count: 5, total_spent: 1500 },
					{ customer_id: 2, order_count: 3, total_spent: 800 },
				],
				affectedRows: 0,
				insertId: 0
			});

			const customerAnalytics = await orderRepo?.find({
				fields: [
					'customer_id',
					{ type: 'COUNT', field: 'id', alias: 'order_count' },
					{ type: 'SUM', field: 'total_amount', alias: 'total_spent' }
				],
				where: {
					and: [
						{ field: 'status', op: '=' as const, value: 'completed' },
						{ field: 'created_at', op: '>=', value: '2023-01-01' }
					]
				},
				groupBy: ['customer_id'],
				orderBy: [{ field: 'total_spent', direction: 'DESC' }],
				limit: 100
			});

			expect(customerAnalytics).toHaveLength(2);
			expect(customerAnalytics?.[0].total_spent).toBe(1500);
		});

		it('should handle multi-provider scenario', async () =>
		{
			const userProvider = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 }),
			};

			const logProvider = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 }),
			};

			const config: DataGatewayConfig = {
				providers: {
					userDb: { type: 'custom', options: { provider: userProvider } },
					logDb: { type: 'custom', options: { provider: logProvider } },
				},
				repositories: {
					user: { provider: 'userDb', table: 'users' },
					activityLog: { provider: 'logDb', table: 'activity_logs' },
				},
			};

			gateway = await DataGateway.build(config);
			const userRepo = gateway.getRepository('user');
			const logRepo = gateway.getRepository('activityLog');

			// 1. Create user
			vi.mocked(userProvider.query).mockResolvedValueOnce({
				rows: [],
				affectedRows: 1,
				insertId: 123
			});

			const userId = await userRepo?.insert({
				name: 'John Doe',
				email: 'john@example.com'
			});

			expect(userId).toBe(123);
			expect(userProvider.query).toHaveBeenCalledWith({
				type: 'INSERT',
				table: 'users',
				values: { name: 'John Doe', email: 'john@example.com' }
			});

			// 2. Log activity
			vi.mocked(logProvider.query).mockResolvedValueOnce({
				rows: [],
				affectedRows: 1,
				insertId: 456
			});

			const logId = await logRepo?.insert({
				user_id: userId,
				action: 'user_created',
				timestamp: new Date().toISOString()
			});

			expect(logId).toBe(456);
			expect(logProvider.query).toHaveBeenCalledWith({
				type: 'INSERT',
				table: 'activity_logs',
				values: {
					user_id: 123,
					action: 'user_created',
					timestamp: expect.any(String)
				}
			});

			// 3. Query user and logs
			vi.mocked(userProvider.query).mockResolvedValueOnce({
				rows: [{ id: 123, name: 'John Doe', email: 'john@example.com' }],
				affectedRows: 0,
				insertId: 0
			});

			vi.mocked(logProvider.query).mockResolvedValueOnce({
				rows: [
					{ id: 456, user_id: 123, action: 'user_created', timestamp: '2023-01-01T00:00:00Z' },
					{ id: 457, user_id: 123, action: 'user_login', timestamp: '2023-01-01T10:00:00Z' }
				],
				affectedRows: 0,
				insertId: 0
			});

			const user = await userRepo?.findOne({ field: 'id', op: '=' as const, value: 123 });
			const userLogs = await logRepo?.find({
				where: { field: 'user_id', op: '=' as const, value: 123 },
				orderBy: [{ field: 'timestamp', direction: 'ASC' }]
			});

			expect(user?.name).toBe('John Doe');
			expect(userLogs).toHaveLength(2);
			expect(userLogs?.[0].action).toBe('user_created');
		});
	});

	describe('Error Recovery and Edge Cases', () =>
	{
		it('should handle partial provider failure gracefully', async () =>
		{
			const workingProvider = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 }),
			};

			const failingProvider = {
				connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 }),
			};

			const config: DataGatewayConfig = {
				providers: {
					working: { type: 'custom', options: { provider: workingProvider } },
					failing: { type: 'custom', options: { provider: failingProvider } },
				},
				repositories: {
					user: { provider: 'working', table: 'users' },
				},
			};

			// Should throw error due to failing provider connection failure
			await expect(DataGateway.build(config)).rejects.toThrow();

			// working provider should be disconnected
			expect(workingProvider.disconnect).toHaveBeenCalledTimes(1);
		});

		it('should handle concurrent operations', async () =>
		{
			const config: DataGatewayConfig = {
				providers: {
					db: { type: 'custom', options: { provider: mockProvider } },
				},
				repositories: {
					user: { provider: 'db', table: 'users' },
				},
			};

			gateway = await DataGateway.build(config);
			const userRepo = gateway.getRepository('user');

			// Simulate concurrent queries
			const mockResponses = Array.from({ length: 5 }, (_, i) => ({
				rows: [{ id: i + 1, name: `User ${i + 1}` }],
				affectedRows: 0,
				insertId: 0
			}));

			mockResponses.forEach((response, index) =>
			{
				vi.mocked(mockProvider.query).mockResolvedValueOnce(response);
			});

			const concurrentQueries = Array.from({ length: 5 }, (_, i) =>
				userRepo?.findOne({ field: 'id', op: '=' as const, value: i + 1 })
			);

			const results = await Promise.all(concurrentQueries);

			expect(results).toHaveLength(5);
			results.forEach((result, index) =>
			{
				expect(result?.name).toBe(`User ${index + 1}`);
			});

			expect(mockProvider.query).toHaveBeenCalledTimes(5);
		});

		it('should handle large dataset operations', async () =>
		{
			const config: DataGatewayConfig = {
				providers: {
					db: { type: 'custom', options: { provider: mockProvider } },
				},
				repositories: {
					user: { provider: 'db', table: 'users' },
				},
			};

			gateway = await DataGateway.build(config);
			const userRepo = gateway.getRepository('user');

			// Simulate large dataset query
			const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
				id: i + 1,
				name: `User ${i + 1}`,
				email: `user${i + 1}@example.com`
			}));

			vi.mocked(mockProvider.query).mockResolvedValueOnce({
				rows: largeDataset,
				affectedRows: 0,
				insertId: 0
			});

			const users = await userRepo?.find({
				limit: 1000,
				orderBy: [{ field: 'id', direction: 'ASC' }]
			});

			expect(users).toHaveLength(1000);
			expect(users?.[0].name).toBe('User 1');
			expect(users?.[999].name).toBe('User 1000');
		});
	});

	describe('Performance and Resource Management', () =>
	{
		it('should properly manage resources during lifecycle', async () =>
		{
			const provider1 = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 }),
			};

			const provider2 = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 }),
			};

			const config: DataGatewayConfig = {
				providers: {
					db1: { type: 'custom', options: { provider: provider1 } },
					db2: { type: 'custom', options: { provider: provider2 } },
				},
				repositories: {
					user: { provider: 'db1', table: 'users' },
					log: { provider: 'db2', table: 'logs' },
				},
			};

			// Build Gateway
			gateway = await DataGateway.build(config);

			expect(provider1.connect).toHaveBeenCalledTimes(1);
			expect(provider2.connect).toHaveBeenCalledTimes(1);

			// Use repositories
			const userRepo = gateway.getRepository('user');
			const logRepo = gateway.getRepository('log');

			expect(userRepo).toBeDefined();
			expect(logRepo).toBeDefined();

			// Disconnect all connections
			await gateway.disconnectAll();

			expect(provider1.disconnect).toHaveBeenCalledTimes(1);
			expect(provider2.disconnect).toHaveBeenCalledTimes(1);
		});

		it('should handle repeated build and destroy cycles', async () =>
		{
			const provider = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 }),
			};

			const config: DataGatewayConfig = {
				providers: {
					db: { type: 'custom', options: { provider } },
				},
				repositories: {
					user: { provider: 'db', table: 'users' },
				},
			};

			// Build and destroy Gateway multiple times
			for (let i = 0; i < 3; i++)
			{
				const gateway = await DataGateway.build(config);
				await gateway.disconnectAll();
			}

			expect(provider.connect).toHaveBeenCalledTimes(3);
			expect(provider.disconnect).toHaveBeenCalledTimes(3);
		});
	});
});