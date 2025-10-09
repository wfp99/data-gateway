import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Repository } from './repository';
import { DataProvider } from './dataProvider';
import { DefaultFieldMapper, MappingFieldMapper } from './entityFieldMapper';

describe('Repository - Unit Tests', () =>
{
	let mockProvider: DataProvider;
	let repository: Repository<any>;

	beforeEach(() =>
	{
		mockProvider = {
			connect: vi.fn().mockResolvedValue(undefined),
			disconnect: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 }),
		};

		repository = new Repository(mockProvider, 'test_table');
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

			const repositoryWithMapper = new Repository(mockProvider, 'users', mapper);

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

			const repositoryWithMapper = new Repository(mockProvider, 'users', mapper);

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
});