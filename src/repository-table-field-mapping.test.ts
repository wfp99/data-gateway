/**
 * Tests for table.field format mapping in JOIN queries
 * This test file specifically addresses the issue where using table.field format
 * in queries results in null values after mapping.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Repository } from './repository';
import { DataGateway } from './dataGateway';
import { DataProvider } from './dataProvider';
import { MappingFieldMapper } from './entityFieldMapper';

describe('Repository - table.field Format Mapping', () =>
{
	let mockGateway: DataGateway;
	let mockProvider: DataProvider;

	beforeEach(() =>
	{
		mockProvider = {
			query: vi.fn(),
			connect: vi.fn(),
			disconnect: vi.fn(),
			supportsConnectionPooling: vi.fn(() => false),
			getPoolStatus: vi.fn(() => undefined)
		} as unknown as DataProvider;

		mockGateway = {
			getRepository: vi.fn()
		} as unknown as DataGateway;
	});

	describe('Direct table reference without repository', () =>
	{
		it('should correctly map table.field format when database returns prefixed columns', async () =>
		{
			// Setup: User repository with field mapping
			const userRepo = new Repository(
				mockGateway,
				mockProvider,
				'users',
				new MappingFieldMapper({
					userId: 'user_id',
					userName: 'user_name'
				})
			);

			// Mock: Database returns columns with table prefixes (common in JOIN queries)
			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [
					{
						user_id: 1,
						user_name: 'John Doe',
						'orders.order_id': 101,
						'orders.amount': 500
					}
				]
			});

			// Execute: Query with JOIN using direct table reference
			const results = await userRepo.find({
				fields: ['userId', 'userName', 'orders.order_id', 'orders.amount'],
				joins: [
					{
						type: 'LEFT',
						source: { table: 'orders' },
						on: { field: 'userId', op: '=', value: 'orders.user_id' }
					}
				]
			});

			// Assert: Should correctly map all fields, including table-prefixed ones
			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				userId: 1,
				userName: 'John Doe',
				'orders.order_id': 101,
				'orders.amount': 500
			});

			// Verify: Values should not be null
			expect(results[0]['orders.order_id']).not.toBeNull();
			expect(results[0]['orders.amount']).not.toBeNull();
		});

		it('should handle database returning main table fields with table prefix', async () =>
		{
			// Setup: User repository with field mapping
			const userRepo = new Repository(
				mockGateway,
				mockProvider,
				'users',
				new MappingFieldMapper({
					userId: 'user_id',
					userName: 'user_name'
				})
			);

			// Mock: Database returns main table columns WITH table prefix
			// This can happen with some SQL queries or database drivers
			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [
					{
						'users.user_id': 1,
						'users.user_name': 'Jane Smith',
						'orders.order_id': 201,
						'orders.amount': 750
					}
				]
			});

			// Execute: Query with JOIN
			const results = await userRepo.find({
				fields: ['userId', 'userName', 'orders.order_id', 'orders.amount'],
				joins: [
					{
						type: 'LEFT',
						source: { table: 'orders' },
						on: { field: 'userId', op: '=', value: 'orders.user_id' }
					}
				]
			});

			// Assert: Main table fields should NOT have table prefix in result
			// Joined table fields SHOULD have table prefix
			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				userId: 1,           // Not 'users.userId'
				userName: 'Jane Smith', // Not 'users.userName'
				'orders.order_id': 201,
				'orders.amount': 750
			});

			// Verify: All values should be present
			expect(results[0].userId).toBe(1);
			expect(results[0].userName).toBe('Jane Smith');
			expect(results[0]['orders.order_id']).toBe(201);
			expect(results[0]['orders.amount']).toBe(750);
		});

		it('should handle mixed format: some fields with prefix, some without', async () =>
		{
			const userRepo = new Repository(
				mockGateway,
				mockProvider,
				'users',
				new MappingFieldMapper({
					userId: 'user_id',
					userName: 'user_name'
				})
			);

			// Database might return mixed format
			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [
					{
						user_id: 1,
						user_name: 'Jane Smith',
						order_count: 5  // Without prefix
					}
				]
			});

			const results = await userRepo.find({
				fields: ['userId', 'userName'],
				joins: [
					{
						type: 'LEFT',
						source: { table: 'orders' },
						on: { field: 'userId', op: '=', value: 'orders.user_id' }
					}
				]
			});

			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				userId: 1,
				userName: 'Jane Smith',
				order_count: 5
			});
		});

		it('should preserve table.field format for unknown tables', async () =>
		{
			const userRepo = new Repository(
				mockGateway,
				mockProvider,
				'users',
				new MappingFieldMapper({
					userId: 'user_id',
					userName: 'user_name'
				})
			);

			// Database returns columns from a table not in the JOIN configuration
			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [
					{
						user_id: 1,
						user_name: 'Bob Wilson',
						'unknown_table.some_field': 'value123'
					}
				]
			});

			const results = await userRepo.find({
				fields: ['userId', 'userName'],
				joins: [
					{
						type: 'LEFT',
						source: { table: 'orders' },
						on: { field: 'userId', op: '=', value: 'orders.user_id' }
					}
				]
			});

			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				userId: 1,
				userName: 'Bob Wilson',
				'unknown_table.some_field': 'value123'
			});

			// Value should not be null
			expect(results[0]['unknown_table.some_field']).toBe('value123');
		});
	});

	describe('Repository reference with mapping', () =>
	{
		it('should correctly map repository.field format with proper mapper', async () =>
		{
			// Setup: Both user and order repositories with mappings
			const userRepo = new Repository(
				mockGateway,
				mockProvider,
				'users',
				new MappingFieldMapper({
					userId: 'user_id',
					userName: 'user_name'
				})
			);

			const orderRepo = new Repository(
				mockGateway,
				mockProvider,
				'orders',
				new MappingFieldMapper({
					orderId: 'order_id',
					orderAmount: 'order_amount',
					userId: 'user_id'
				})
			);

			// Mock gateway to return the order repository
			vi.mocked(mockGateway.getRepository).mockImplementation((name: string) =>
			{
				if (name === 'orders') return orderRepo;
				return undefined;
			});

			// Database returns with table prefixes
			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [
					{
						user_id: 1,
						user_name: 'Alice Johnson',
						'orders.order_id': 201,
						'orders.order_amount': 750
					}
				]
			});

			// Execute query using repository reference
			const results = await userRepo.find({
				fields: ['userId', 'userName', 'orders.orderId', 'orders.orderAmount'],
				joins: [
					{
						type: 'LEFT',
						source: { repository: 'orders' },
						on: { field: 'userId', op: '=', value: 'orders.userId' }
					}
				]
			});

			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				userId: 1,
				userName: 'Alice Johnson',
				'orders.orderId': 201,
				'orders.orderAmount': 750
			});

			// Values should be mapped correctly and not null
			expect(results[0]['orders.orderId']).toBe(201);
			expect(results[0]['orders.orderAmount']).toBe(750);
		});
	});

	describe('Edge cases', () =>
	{
		it('should handle empty result set', async () =>
		{
			const userRepo = new Repository(
				mockGateway,
				mockProvider,
				'users',
				new MappingFieldMapper({ userId: 'user_id' })
			);

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: []
			});

			const results = await userRepo.find({
				joins: [
					{
						type: 'LEFT',
						source: { table: 'orders' },
						on: { field: 'userId', op: '=', value: 'orders.user_id' }
					}
				]
			});

			expect(results).toEqual([]);
		});

		it('should handle null values in database columns', async () =>
		{
			const userRepo = new Repository(
				mockGateway,
				mockProvider,
				'users',
				new MappingFieldMapper({
					userId: 'user_id',
					userName: 'user_name'
				})
			);

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [
					{
						user_id: 1,
						user_name: 'Test User',
						'orders.order_id': null,  // Legitimate NULL from LEFT JOIN
						'orders.amount': null
					}
				]
			});

			const results = await userRepo.find({
				fields: ['userId', 'userName', 'orders.order_id'],
				joins: [
					{
						type: 'LEFT',
						source: { table: 'orders' },
						on: { field: 'userId', op: '=', value: 'orders.user_id' }
					}
				]
			});

			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				userId: 1,
				userName: 'Test User',
				'orders.order_id': null,
				'orders.amount': null
			});

			// NULL should be preserved as NULL, not undefined
			expect(results[0]['orders.order_id']).toBeNull();
		});

		it('should handle deeply nested table.field.subfield format', async () =>
		{
			const userRepo = new Repository(
				mockGateway,
				mockProvider,
				'users',
				new MappingFieldMapper({ userId: 'user_id' })
			);

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [
					{
						user_id: 1,
						// Some databases might return complex nested structures
						'orders.details': '{"total": 100}'
					}
				]
			});

			const results = await userRepo.find({
				fields: ['userId'],
				joins: [
					{
						type: 'LEFT',
						source: { table: 'orders' },
						on: { field: 'userId', op: '=', value: 'orders.user_id' }
					}
				]
			});

			expect(results).toHaveLength(1);
			expect(results[0]['orders.details']).toBe('{"total": 100}');
		});
	});
});
