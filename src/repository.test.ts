import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Repository } from './repository';
import { DataProvider } from './dataProvider';
import { DefaultFieldMapper, MappingFieldMapper } from './entityFieldMapper';
import { DataGateway } from './dataGateway';

describe('Repository - Unit Tests', () =>
{
	let mockProvider: DataProvider;
	let mockGateway: DataGateway;
	let repository: Repository<any>;

	beforeEach(() =>
	{
		mockProvider = {
			connect: vi.fn().mockResolvedValue(undefined),
			disconnect: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 }),
		};

		// Create a mock DataGateway
		mockGateway = {
			getRepository: vi.fn(),
			getProvider: vi.fn().mockReturnValue(mockProvider),
			joinSourceToTableName: vi.fn(),
			getProviderPoolStatus: vi.fn(),
			getAllPoolStatuses: vi.fn(),
			disconnectAll: vi.fn(),
		} as any;

		repository = new Repository(mockGateway, mockProvider, 'test_table');
	});

	describe('Basic CRUD Operations', () =>
	{
		it('should execute find query correctly', async () =>
		{
			const mockRows = [
				{ id: 1, name: 'John', email: 'john@example.com' },
				{ id: 2, name: 'Jane', email: 'jane@example.com' },
			];

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: mockRows,
				affectedRows: 0,
				insertId: 0
			});

			const result = await repository.find({
				fields: ['id', 'name'],
				where: { field: 'status', op: '=' as const, value: 'active' },
				limit: 10
			});

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'test_table',
				fields: ['id', 'name'],
				where: { field: 'status', op: '=', value: 'active' },
				limit: 10
			});

			expect(result).toEqual(mockRows);
		});

		it('should execute findOne query correctly', async () =>
		{
			const mockRow = { id: 1, name: 'John', email: 'john@example.com' };

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [mockRow],
				affectedRows: 0,
				insertId: 0
			});

			const result = await repository.findOne({ field: 'id', op: '=' as const, value: 1 });

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'test_table',
				where: { field: 'id', op: '=', value: 1 },
				limit: 1
			});

			expect(result).toEqual(mockRow);
		});

		it('should return null when findOne finds no results', async () =>
		{
			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			const result = await repository.findOne({ field: 'id', op: '=' as const, value: 999 });

			expect(result).toBeNull();
		});

		it('should execute insert query correctly', async () =>
		{
			const insertData = { name: 'John', email: 'john@example.com' };
			const expectedInsertId = 123;

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 1,
				insertId: expectedInsertId
			});

			const result = await repository.insert(insertData);

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'INSERT',
				table: 'test_table',
				values: insertData
			});

			expect(result).toBe(expectedInsertId);
		});

		it('should execute update query correctly', async () =>
		{
			const updateData = { name: 'Updated Name' };
			const condition = { field: 'id', op: '=' as const, value: 1 };

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 1,
				insertId: 0
			});

			const result = await repository.update(updateData, condition);

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'UPDATE',
				table: 'test_table',
				values: updateData,
				where: condition
			});

			expect(result).toBe(1);
		});

		it('should execute delete query correctly', async () =>
		{
			const condition = { field: 'id', op: '=' as const, value: 1 };

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 1,
				insertId: 0
			});

			const result = await repository.delete(condition);

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'DELETE',
				table: 'test_table',
				where: condition
			});

			expect(result).toBe(1);
		});
	});

	describe('Aggregate Operations', () =>
	{
		it('should execute count query correctly', async () =>
		{
			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [{ result: 5 }],
				affectedRows: 0,
				insertId: 0
			});

			const result = await repository.count('id', { field: 'status', op: '=', value: 'active' });

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'test_table',
				fields: [{ type: 'COUNT', field: 'id', alias: 'result' }],
				where: { field: 'status', op: '=', value: 'active' }
			});

			expect(result).toBe(5);
		});

		it('should return 0 for count when no results', async () =>
		{
			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			const result = await repository.count('id');

			expect(result).toBe(0);
		});

		it('should execute sum query correctly', async () =>
		{
			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [{ price: 1500, quantity: 25 }],
				affectedRows: 0,
				insertId: 0
			});

			const result = await repository.sum(['price', 'quantity'], { field: 'status', op: '=', value: 'active' });

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'test_table',
				fields: [
					{ type: 'SUM', field: 'price', alias: 'price' },
					{ type: 'SUM', field: 'quantity', alias: 'quantity' }
				],
				where: { field: 'status', op: '=', value: 'active' }
			});

			expect(result).toEqual({ price: 1500, quantity: 25 });
		});
	});

	describe('Complex Query Conditions', () =>
	{
		it('should handle AND conditions', async () =>
		{
			await repository.find({
				where: {
					and: [
						{ field: 'status', op: '=', value: 'active' },
						{ field: 'age', op: '>', value: 18 }
					]
				}
			});

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'test_table',
				where: {
					and: [
						{ field: 'status', op: '=', value: 'active' },
						{ field: 'age', op: '>', value: 18 }
					]
				}
			});
		});

		it('should handle OR conditions', async () =>
		{
			await repository.find({
				where: {
					or: [
						{ field: 'status', op: '=', value: 'active' },
						{ field: 'status', op: '=', value: 'pending' }
					]
				}
			});

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'test_table',
				where: {
					or: [
						{ field: 'status', op: '=', value: 'active' },
						{ field: 'status', op: '=', value: 'pending' }
					]
				}
			});
		});

		it('should handle NOT conditions', async () =>
		{
			await repository.find({
				where: {
					not: { field: 'status', op: '=', value: 'deleted' }
				}
			});

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'test_table',
				where: {
					not: { field: 'status', op: '=', value: 'deleted' }
				}
			});
		});

		it('should handle nested complex conditions', async () =>
		{
			await repository.find({
				where: {
					and: [
						{ field: 'status', op: '=', value: 'active' },
						{
							or: [
								{ field: 'role', op: '=', value: 'admin' },
								{ field: 'role', op: '=', value: 'moderator' }
							]
						}
					]
				}
			});

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'test_table',
				where: {
					and: [
						{ field: 'status', op: '=', value: 'active' },
						{
							or: [
								{ field: 'role', op: '=', value: 'admin' },
								{ field: 'role', op: '=', value: 'moderator' }
							]
						}
					]
				}
			});
		});
	});

	describe('Field Mapping', () =>
	{
		it('should apply field mapping for entity fields', async () =>
		{
			const mapper = new MappingFieldMapper({
				userName: 'user_name',
				userEmail: 'user_email',
				createdAt: 'created_at'
			});

			const repositoryWithMapper = new Repository(mockGateway, mockProvider, 'users', mapper);

			await repositoryWithMapper.find({
				fields: ['userName', 'userEmail'],
				where: { field: 'userName', op: '=', value: 'john' },
				orderBy: [{ field: 'createdAt', direction: 'DESC' }]
			});

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'users',
				fields: ['user_name', 'user_email'],
				where: { field: 'user_name', op: '=', value: 'john' },
				orderBy: [{ field: 'created_at', direction: 'DESC' }]
			});
		});

		it('should apply field mapping for insert values', async () =>
		{
			const mapper = new MappingFieldMapper({
				userName: 'user_name',
				userEmail: 'user_email'
			});

			const repositoryWithMapper = new Repository(mockGateway, mockProvider, 'users', mapper);

			await repositoryWithMapper.insert({
				userName: 'john',
				userEmail: 'john@example.com'
			});

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'INSERT',
				table: 'users',
				values: {
					user_name: 'john',
					user_email: 'john@example.com'
				}
			});
		});
	});

	describe('Error Handling', () =>
	{
		it('should handle find errors with context', async () =>
		{
			const error = new Error('Database connection failed');
			vi.mocked(mockProvider.query).mockRejectedValue(error);

			await expect(repository.find()).rejects.toThrow('[Repository.find] Database connection failed');
		});

		it('should handle insert errors with context', async () =>
		{
			const error = new Error('Constraint violation');
			vi.mocked(mockProvider.query).mockRejectedValue(error);

			await expect(repository.insert({ name: 'John' })).rejects.toThrow('[Repository.insert] Constraint violation');
		});

		it('should handle update errors with context', async () =>
		{
			const error = new Error('Row not found');
			vi.mocked(mockProvider.query).mockRejectedValue(error);

			await expect(repository.update({ name: 'John' }, { field: 'id', op: '=', value: 1 }))
				.rejects.toThrow('[Repository.update] Row not found');
		});

		it('should handle delete errors with context', async () =>
		{
			const error = new Error('Foreign key constraint');
			vi.mocked(mockProvider.query).mockRejectedValue(error);

			await expect(repository.delete({ field: 'id', op: '=', value: 1 }))
				.rejects.toThrow('[Repository.delete] Foreign key constraint');
		});

		it('should handle count errors with context', async () =>
		{
			const error = new Error('Invalid field');
			vi.mocked(mockProvider.query).mockRejectedValue(error);

			await expect(repository.count('invalid_field'))
				.rejects.toThrow('[Repository.count] Invalid field');
		});

		it('should handle sum errors with context', async () =>
		{
			const error = new Error('Non-numeric field');
			vi.mocked(mockProvider.query).mockRejectedValue(error);

			await expect(repository.sum(['price'], { field: 'status', op: '=', value: 'active' }))
				.rejects.toThrow('[Repository.sum] Non-numeric field');
		});
	});

	describe('findMany Method', () =>
	{
		it('should execute findMany with all options', async () =>
		{
			const mockRows = [
				{ id: 1, name: 'John', age: 25 },
				{ id: 2, name: 'Jane', age: 30 },
			];

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: mockRows,
				affectedRows: 0,
				insertId: 0
			});

			const result = await repository.findMany(
				{ field: 'status', op: '=', value: 'active' },
				{
					limit: 10,
					offset: 5,
					orderBy: [{ field: 'name', direction: 'ASC' }]
				}
			);

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'test_table',
				where: { field: 'status', op: '=', value: 'active' },
				limit: 10,
				offset: 5,
				orderBy: [{ field: 'name', direction: 'ASC' }]
			});

			expect(result).toEqual(mockRows);
		});

		it('should execute findMany with minimal options', async () =>
		{
			await repository.findMany();

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'test_table',
				where: undefined,
				limit: undefined,
				offset: undefined,
				orderBy: undefined
			});
		});
	});

	describe('JOIN ON Condition Field Mapping', () =>
	{
		it('should handle table.field format in JOIN ON value', async () =>
		{
			// Create a repository with field mapping
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
					customerId: 'customer_id'
				})
			);

			// Mock getRepository to return orderRepo
			vi.mocked(mockGateway.getRepository).mockReturnValue(orderRepo);

			const mockRows = [
				{ user_id: 1, user_name: 'John', order_id: 101, customer_id: 1 }
			];

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: mockRows,
				affectedRows: 0,
				insertId: 0
			});

			// Query with JOIN using table.field format in value
			await userRepo.find({
				joins: [
					{
						type: 'INNER',
						source: { repository: 'orders' },
						on: { field: 'userId', op: '=', value: 'orders.customerId' }
					}
				]
			});

			// Verify that the query was called with properly mapped fields
			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'users',
				joins: [
					{
						type: 'INNER',
						source: { table: 'orders' },
						// field should be mapped: userId -> user_id
						// value should preserve table prefix and map field: orders.customerId -> orders.customer_id
						on: { field: 'user_id', op: '=', value: 'orders.customer_id' }
					}
				]
			});
		});

		it('should handle simple field name in JOIN ON value without table prefix', async () =>
		{
			const userRepo = new Repository(
				mockGateway,
				mockProvider,
				'users',
				new MappingFieldMapper({
					userId: 'user_id'
				})
			);

			const profileRepo = new Repository(
				mockGateway,
				mockProvider,
				'profiles',
				new MappingFieldMapper({
					profileUserId: 'profile_user_id'
				})
			);

			vi.mocked(mockGateway.getRepository).mockReturnValue(profileRepo);

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// Query with JOIN using simple field name (no table prefix)
			await userRepo.find({
				joins: [
					{
						type: 'LEFT',
						source: { repository: 'profiles' },
						on: { field: 'userId', op: '=', value: 'profileUserId' }
					}
				]
			});

			// Verify that both sides are mapped correctly
			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'users',
				joins: [
					{
						type: 'LEFT',
						source: { table: 'profiles' },
						// Both field and value should be mapped
						on: { field: 'user_id', op: '=', value: 'profile_user_id' }
					}
				]
			});
		});

		it('should handle table.field format with table source (not repository)', async () =>
		{
			const userRepo = new Repository(
				mockGateway,
				mockProvider,
				'users',
				new MappingFieldMapper({
					userId: 'user_id'
				})
			);

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// Query with JOIN using direct table name
			await userRepo.find({
				joins: [
					{
						type: 'INNER',
						source: { table: 'orders' },
						// When using table source, the mapper is the same as main repo
						on: { field: 'userId', op: '=', value: 'orders.customer_id' }
					}
				]
			});

			// Verify the mapping
			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'users',
				joins: [
					{
						type: 'INNER',
						source: { table: 'orders' },
						// field mapped, value keeps table prefix but field part uses main repo's mapper
						on: { field: 'user_id', op: '=', value: 'orders.customer_id' }
					}
				]
			});
		});

		it('should convert repository name to table name in value when using repository.field format', async () =>
		{
			const userRepo = new Repository(
				mockGateway,
				mockProvider,
				'users_table',
				new MappingFieldMapper({
					userId: 'user_id',
					userName: 'user_name'
				})
			);

			const orderRepo = new Repository(
				mockGateway,
				mockProvider,
				'orders_table',
				new MappingFieldMapper({
					orderId: 'order_id',
					customerId: 'customer_id'
				})
			);

			// Mock getRepository to return the correct repository
			vi.mocked(mockGateway.getRepository).mockImplementation((name: string) =>
			{
				if (name === 'orders') return orderRepo;
				if (name === 'users') return userRepo;
				return undefined;
			});

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// Query using repository.field format in value
			await userRepo.find({
				joins: [
					{
						type: 'INNER',
						source: { repository: 'orders' },
						// Use repository name in value prefix
						on: { field: 'userId', op: '=', value: 'orders.customerId' }
					}
				]
			});

			// Verify the conversion:
			// 1. 'orders' repository name -> 'orders_table' table name
			// 2. 'customerId' field -> 'customer_id' using order repo's mapper
			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'users_table',
				joins: [
					{
						type: 'INNER',
						source: { table: 'orders_table' },
						on: { field: 'user_id', op: '=', value: 'orders_table.customer_id' }
					}
				]
			});
		});

		it('should handle mixed repository and table references in multiple joins', async () =>
		{
			const productRepo = new Repository(
				mockGateway,
				mockProvider,
				'products_table',
				new MappingFieldMapper({
					productId: 'product_id',
					categoryId: 'category_id'
				})
			);

			const orderRepo = new Repository(
				mockGateway,
				mockProvider,
				'orders_table',
				new MappingFieldMapper({
					orderId: 'order_id',
					productId: 'product_id'
				})
			);

			vi.mocked(mockGateway.getRepository).mockImplementation((name: string) =>
			{
				if (name === 'orders') return orderRepo;
				if (name === 'products') return productRepo;
				return undefined;
			});

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// Multiple joins with mixed repository and table references
			await productRepo.find({
				joins: [
					{
						type: 'INNER',
						source: { repository: 'orders' },
						// Repository name in value
						on: { field: 'productId', op: '=', value: 'orders.productId' }
					},
					{
						type: 'LEFT',
						source: { table: 'categories' },
						// Direct table name in value (should use product repo's mapper)
						on: { field: 'categoryId', op: '=', value: 'categories.cat_id' }
					}
				]
			});

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'products_table',
				joins: [
					{
						type: 'INNER',
						source: { table: 'orders_table' },
						// Repository name converted to table name
						on: { field: 'product_id', op: '=', value: 'orders_table.product_id' }
					},
					{
						type: 'LEFT',
						source: { table: 'categories' },
						// Direct table name preserved, field mapped by product repo's mapper
						on: { field: 'category_id', op: '=', value: 'categories.cat_id' }
					}
				]
			});
		});
	});

	describe('SELECT Fields with table/repository Prefix', () =>
	{
		it('should handle repository.field format in SELECT fields', async () =>
		{
			const userRepo = new Repository(
				mockGateway,
				mockProvider,
				'users_table',
				new MappingFieldMapper({
					userId: 'user_id',
					userName: 'user_name'
				})
			);

			const orderRepo = new Repository(
				mockGateway,
				mockProvider,
				'orders_table',
				new MappingFieldMapper({
					orderId: 'order_id',
					orderDate: 'order_date',
					userId: 'user_id' // Add this mapping for the JOIN condition
				})
			);

			vi.mocked(mockGateway.getRepository).mockImplementation((name: string) =>
			{
				if (name === 'orders') return orderRepo;
				if (name === 'users') return userRepo;
				return undefined;
			});

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// Query with repository.field format in SELECT fields
			await userRepo.find({
				fields: ['userId', 'userName', 'orders.orderId', 'orders.orderDate'],
				joins: [
					{
						type: 'LEFT',
						source: { repository: 'orders' },
						on: { field: 'userId', op: '=', value: 'orders.userId' }
					}
				]
			});

			// Verify that fields with repository prefix are correctly mapped
			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'users_table',
				fields: ['user_id', 'user_name', 'orders_table.order_id', 'orders_table.order_date'],
				joins: [
					{
						type: 'LEFT',
						source: { table: 'orders_table' },
						on: { field: 'user_id', op: '=', value: 'orders_table.user_id' }
					}
				]
			});
		});

		it('should handle table.field format in SELECT fields', async () =>
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
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// Query with table.field format in SELECT fields (direct table reference)
			await userRepo.find({
				fields: ['userId', 'userName', 'orders.order_id'],
				joins: [
					{
						type: 'LEFT',
						source: { table: 'orders' },
						on: { field: 'userId', op: '=', value: 'orders.user_id' }
					}
				]
			});

			// When using direct table name, the field part is mapped using main repo's mapper
			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'users',
				fields: ['user_id', 'user_name', 'orders.order_id'],
				joins: [
					{
						type: 'LEFT',
						source: { table: 'orders' },
						on: { field: 'user_id', op: '=', value: 'orders.user_id' }
					}
				]
			});
		});

		it('should handle repository.field in aggregate functions', async () =>
		{
			const userRepo = new Repository(
				mockGateway,
				mockProvider,
				'users_table',
				new MappingFieldMapper({
					userId: 'user_id'
				})
			);

			const orderRepo = new Repository(
				mockGateway,
				mockProvider,
				'orders_table',
				new MappingFieldMapper({
					orderId: 'order_id',
					orderAmount: 'order_amount',
					userId: 'user_id' // Add this mapping for the JOIN condition
				})
			);

			vi.mocked(mockGateway.getRepository).mockImplementation((name: string) =>
			{
				if (name === 'orders') return orderRepo;
				if (name === 'users') return userRepo;
				return undefined;
			});

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// Query with repository.field in aggregate functions
			await userRepo.find({
				fields: [
					'userId',
					{ type: 'COUNT', field: 'orders.orderId', alias: 'totalOrders' },
					{ type: 'SUM', field: 'orders.orderAmount', alias: 'totalAmount' }
				],
				joins: [
					{
						type: 'LEFT',
						source: { repository: 'orders' },
						on: { field: 'userId', op: '=', value: 'orders.userId' }
					}
				],
				groupBy: ['userId']
			});

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'users_table',
				fields: [
					'user_id',
					{ type: 'COUNT', field: 'orders_table.order_id', alias: 'totalOrders' },
					{ type: 'SUM', field: 'orders_table.order_amount', alias: 'totalAmount' }
				],
				joins: [
					{
						type: 'LEFT',
						source: { table: 'orders_table' },
						on: { field: 'user_id', op: '=', value: 'orders_table.user_id' }
					}
				],
				groupBy: ['user_id']
			});
		});
	});

	describe('JOIN Query Result Mapping', () =>
	{
		it('should map joined query results from multiple tables correctly', async () =>
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

			const orderRepo = new Repository(
				mockGateway,
				mockProvider,
				'orders',
				new MappingFieldMapper({
					orderId: 'order_id',
					orderDate: 'order_date'
				})
			);

			vi.mocked(mockGateway.getRepository).mockImplementation((name: string) =>
			{
				if (name === 'orders') return orderRepo;
				if (name === 'users') return userRepo;
				return undefined;
			});

			// Simulate database result with columns from both tables
			// When there are ambiguous column names, they might come from different tables
			const mockRows = [
				{
					user_id: 1,
					user_name: 'John',
					order_id: 101,
					order_date: '2023-01-15'
				},
				{
					user_id: 2,
					user_name: 'Jane',
					order_id: 102,
					order_date: '2023-01-16'
				}
			];

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: mockRows,
				affectedRows: 0,
				insertId: 0
			});

			const results = await userRepo.find({
				joins: [
					{
						type: 'INNER',
						source: { repository: 'orders' },
						on: { field: 'userId', op: '=', value: 'orders.orderId' }
					}
				]
			});

			// Verify that the results are mapped correctly:
			// - Main table fields (users) should be mapped using user repo's mapper
			// - Since order columns have different names (order_id, order_date),
			//   they will be identified by the order repo's mapper and prefixed with table name
			expect(results).toHaveLength(2);
			expect(results[0]).toEqual({
				userId: 1,
				userName: 'John',
				'orders.orderId': 101,
				'orders.orderDate': '2023-01-15'
			});
			expect(results[1]).toEqual({
				userId: 2,
				userName: 'Jane',
				'orders.orderId': 102,
				'orders.orderDate': '2023-01-16'
			});
		});

		it('should handle table-prefixed columns in joined query results', async () =>
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

			const orderRepo = new Repository(
				mockGateway,
				mockProvider,
				'orders',
				new MappingFieldMapper({
					orderId: 'order_id'
				})
			);

			vi.mocked(mockGateway.getRepository).mockImplementation((name: string) =>
			{
				if (name === 'orders') return orderRepo;
				if (name === 'users') return userRepo;
				return undefined;
			});

			// Some databases return columns with table prefixes
			const mockRows = [
				{
					'users.user_id': 1,
					'users.user_name': 'John',
					'orders.order_id': 101
				}
			];

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: mockRows,
				affectedRows: 0,
				insertId: 0
			});

			const results = await userRepo.find({
				joins: [
					{
						type: 'INNER',
						source: { repository: 'orders' },
						on: { field: 'userId', op: '=', value: 'orders.orderId' }
					}
				]
			});

			// Verify that table-prefixed columns are mapped correctly
			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				'users.userId': 1,
				'users.userName': 'John',
				'orders.orderId': 101
			});
		});

		it('should handle mixed table join with default mapper', async () =>
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

			vi.mocked(mockGateway.getRepository).mockReturnValue(undefined);

			// Simulate database result with columns from main table and a direct table join
			const mockRows = [
				{
					user_id: 1,
					user_name: 'John',
					profile_bio: 'Software developer'
				}
			];

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: mockRows,
				affectedRows: 0,
				insertId: 0
			});

			const results = await userRepo.find({
				joins: [
					{
						type: 'LEFT',
						source: { table: 'profiles' }, // Direct table reference
						on: { field: 'userId', op: '=', value: 'profiles.user_id' }
					}
				]
			});

			// Verify that:
			// - Main table fields are mapped using user repo's mapper
			// - Direct table join fields use default mapper (no change)
			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				userId: 1,
				userName: 'John',
				profile_bio: 'Software developer'
			});
		});
	});

	describe('Complex JOIN ON Conditions', () =>
	{
		it('should handle AND conditions in JOIN ON clause', async () =>
		{
			const userRepo = new Repository(
				mockGateway,
				mockProvider,
				'users',
				new MappingFieldMapper({
					userId: 'user_id',
					companyId: 'company_id'
				})
			);

			const orderRepo = new Repository(
				mockGateway,
				mockProvider,
				'orders',
				new MappingFieldMapper({
					customerId: 'customer_id',
					companyId: 'company_id',
					status: 'order_status'
				})
			);

			vi.mocked(mockGateway.getRepository).mockImplementation((name: string) =>
			{
				if (name === 'orders') return orderRepo;
				return undefined;
			});

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// JOIN with AND condition
			await userRepo.find({
				joins: [
					{
						type: 'INNER',
						source: { repository: 'orders' },
						on: {
							and: [
								{ field: 'userId', op: '=', value: 'orders.customerId' },
								{ field: 'companyId', op: '=', value: 'orders.companyId' }
							]
						}
					}
				]
			});

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'users',
				joins: [
					{
						type: 'INNER',
						source: { table: 'orders' },
						on: {
							and: [
								{ field: 'user_id', op: '=', value: 'orders.customer_id' },
								{ field: 'company_id', op: '=', value: 'orders.company_id' }
							]
						}
					}
				]
			});
		});

		it('should handle OR conditions in JOIN ON clause', async () =>
		{
			const productRepo = new Repository(
				mockGateway,
				mockProvider,
				'products',
				new MappingFieldMapper({
					productId: 'product_id',
					legacyId: 'legacy_id'
				})
			);

			const inventoryRepo = new Repository(
				mockGateway,
				mockProvider,
				'inventory',
				new MappingFieldMapper({
					productRef: 'product_ref',
					oldProductRef: 'old_product_ref'
				})
			);

			vi.mocked(mockGateway.getRepository).mockImplementation((name: string) =>
			{
				if (name === 'inventory') return inventoryRepo;
				return undefined;
			});

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// JOIN with OR condition (for legacy data compatibility)
			await productRepo.find({
				joins: [
					{
						type: 'LEFT',
						source: { repository: 'inventory' },
						on: {
							or: [
								{ field: 'productId', op: '=', value: 'inventory.productRef' },
								{ field: 'legacyId', op: '=', value: 'inventory.oldProductRef' }
							]
						}
					}
				]
			});

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'products',
				joins: [
					{
						type: 'LEFT',
						source: { table: 'inventory' },
						on: {
							or: [
								{ field: 'product_id', op: '=', value: 'inventory.product_ref' },
								{ field: 'legacy_id', op: '=', value: 'inventory.old_product_ref' }
							]
						}
					}
				]
			});
		});

		it('should handle nested AND/OR conditions in JOIN ON clause', async () =>
		{
			const accountRepo = new Repository(
				mockGateway,
				mockProvider,
				'accounts',
				new MappingFieldMapper({
					accountId: 'account_id',
					ownerId: 'owner_id',
					status: 'account_status'
				})
			);

			const accessRepo = new Repository(
				mockGateway,
				mockProvider,
				'access_grants',
				new MappingFieldMapper({
					accountRef: 'account_ref',
					userId: 'user_id',
					grantStatus: 'grant_status'
				})
			);

			vi.mocked(mockGateway.getRepository).mockImplementation((name: string) =>
			{
				if (name === 'access') return accessRepo;
				return undefined;
			});

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// Complex nested condition: (accountId = ref AND (ownerId = userId OR status = grantStatus))
			await accountRepo.find({
				joins: [
					{
						type: 'LEFT',
						source: { repository: 'access' },
						on: {
							and: [
								{ field: 'accountId', op: '=', value: 'access.accountRef' },
								{
									or: [
										{ field: 'ownerId', op: '=', value: 'access.userId' },
										{ field: 'status', op: '=', value: 'access.grantStatus' }
									]
								}
							]
						}
					}
				]
			});

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'accounts',
				joins: [
					{
						type: 'LEFT',
						source: { table: 'access_grants' },
						on: {
							and: [
								{ field: 'account_id', op: '=', value: 'access_grants.account_ref' },
								{
									or: [
										{ field: 'owner_id', op: '=', value: 'access_grants.user_id' },
										{ field: 'account_status', op: '=', value: 'access_grants.grant_status' }
									]
								}
							]
						}
					}
				]
			});
		});

		it('should handle NOT conditions in JOIN ON clause', async () =>
		{
			const userRepo = new Repository(
				mockGateway,
				mockProvider,
				'users',
				new MappingFieldMapper({
					userId: 'user_id',
					isActive: 'is_active'
				})
			);

			const blockRepo = new Repository(
				mockGateway,
				mockProvider,
				'blocked_users',
				new MappingFieldMapper({
					blockedUserId: 'blocked_user_id',
					isBlocked: 'is_blocked'
				})
			);

			vi.mocked(mockGateway.getRepository).mockImplementation((name: string) =>
			{
				if (name === 'blocked') return blockRepo;
				return undefined;
			});

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// JOIN with NOT condition
			await userRepo.find({
				joins: [
					{
						type: 'LEFT',
						source: { repository: 'blocked' },
						on: {
							not: {
								field: 'userId',
								op: '=',
								value: 'blocked.blockedUserId'
							}
						}
					}
				]
			});

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'users',
				joins: [
					{
						type: 'LEFT',
						source: { table: 'blocked_users' },
						on: {
							not: {
								field: 'user_id',
								op: '=',
								value: 'blocked_users.blocked_user_id'
							}
						}
					}
				]
			});
		});

		it('should handle LIKE conditions in JOIN ON clause', async () =>
		{
			const searchRepo = new Repository(
				mockGateway,
				mockProvider,
				'search_index',
				new MappingFieldMapper({
					searchTerm: 'search_term'
				})
			);

			const productRepo = new Repository(
				mockGateway,
				mockProvider,
				'products',
				new MappingFieldMapper({
					productName: 'product_name'
				})
			);

			vi.mocked(mockGateway.getRepository).mockImplementation((name: string) =>
			{
				if (name === 'products') return productRepo;
				return undefined;
			});

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// JOIN with LIKE condition
			await searchRepo.find({
				joins: [
					{
						type: 'LEFT',
						source: { repository: 'products' },
						on: {
							like: {
								field: 'searchTerm',
								pattern: '%product%'
							}
						}
					}
				]
			});

			expect(mockProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'search_index',
				joins: [
					{
						type: 'LEFT',
						source: { table: 'products' },
						on: {
							like: {
								field: 'search_term',
								pattern: '%product%'
							}
						}
					}
				]
			});
		});
	});

	describe('FieldReference Type Safety', () =>
	{
		it('should support string format for backward compatibility', async () =>
		{
			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// Old string format still works
			await repository.find({
				fields: ['id', 'name'],
				where: { field: 'status', op: '=', value: 'active' },
				orderBy: [{ field: 'createdAt', direction: 'DESC' }]
			});

			expect(mockProvider.query).toHaveBeenCalled();
		});

		it('should support object format with table prefix', async () =>
		{
			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// New object format with table prefix
			await repository.find({
				fields: [
					{ table: 'test_table', field: 'id' },
					{ table: 'test_table', field: 'name' }
				],
				where: {
					field: { table: 'test_table', field: 'status' },
					op: '=',
					value: 'active'
				}
			});

			expect(mockProvider.query).toHaveBeenCalled();
		});

		it('should support object format with repository prefix', async () =>
		{
			const userRepo = new Repository(
				mockGateway,
				mockProvider,
				'users',
				new MappingFieldMapper({ userId: 'user_id', userName: 'user_name' })
			);

			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// Object format with repository prefix
			await userRepo.find({
				fields: [
					{ repository: 'user', field: 'userId' },
					{ repository: 'user', field: 'userName' }
				],
				where: {
					field: { repository: 'user', field: 'userId' },
					op: '>',
					value: 100
				}
			});

			const call = vi.mocked(mockProvider.query).mock.calls[0][0];
			// With repository prefix, fields become "repository.field" format
			expect(call.fields).toContain('user.user_id');
			expect(call.fields).toContain('user.user_name');
			expect(call.where).toEqual({
				field: 'user.user_id',
				op: '>',
				value: 100
			});
		});

		it('should support mixed format in same query', async () =>
		{
			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// Mix string and object formats
			await repository.find({
				fields: [
					'id',  // String format
					{ table: 'test_table', field: 'name' }  // Object format
				],
				where: {
					and: [
						{ field: 'status', op: '=', value: 'active' },  // String
						{ field: { table: 'test_table', field: 'verified' }, op: '=', value: true }  // Object
					]
				}
			});

			expect(mockProvider.query).toHaveBeenCalled();
		});

		it('should support FieldReference in aggregates', async () =>
		{
			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// Object format in aggregates
			await repository.find({
				fields: [
					{
						type: 'COUNT',
						field: { table: 'test_table', field: 'id' },
						alias: 'totalCount'
					},
					{
						type: 'AVG',
						field: { repository: 'test', field: 'score' },
						alias: 'avgScore'
					}
				]
			});

			expect(mockProvider.query).toHaveBeenCalled();
		});

		it('should support FieldReference in GROUP BY', async () =>
		{
			vi.mocked(mockProvider.query).mockResolvedValue({
				rows: [],
				affectedRows: 0,
				insertId: 0
			});

			// Object format in GROUP BY
			await repository.find({
				fields: ['category', { type: 'COUNT', field: 'id', alias: 'count' }],
				groupBy: [
					{ table: 'test_table', field: 'category' },
					{ table: 'test_table', field: 'status' }
				]
			});

			expect(mockProvider.query).toHaveBeenCalled();
		});
	});
});