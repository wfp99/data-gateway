import { describe, it, expect, vi, beforeEach, afterEach, type Mocked } from 'vitest';
import { DataGateway, DataGatewayConfig } from './index';
import { DataProvider } from './dataProvider';
import { Repository } from './repository';
import { MySQLProvider } from './dataProviders/MySQLProvider';
import { SQLiteProvider } from './dataProviders/SQLiteProvider';
import { PostgreSQLProvider } from './dataProviders/PostgreSQLProvider';
import { RemoteProvider } from './dataProviders/remoteProvider';

// Mock all providers
vi.mock('./dataProviders/MySQLProvider');
vi.mock('./dataProviders/SQLiteProvider');
vi.mock('./dataProviders/PostgreSQLProvider');

describe('DataGateway - Core Integration Tests', () =>
{
	let mockMySQLProvider: Mocked<MySQLProvider>;
	let mockSQLiteProvider: Mocked<SQLiteProvider>;
	let mockPostgreSQLProvider: Mocked<PostgreSQLProvider>;

	beforeEach(() =>
	{
		vi.clearAllMocks();

		// Setup MySQL mock
		mockMySQLProvider = new MySQLProvider({}) as Mocked<MySQLProvider>;
		mockMySQLProvider.connect = vi.fn().mockResolvedValue(undefined);
		mockMySQLProvider.disconnect = vi.fn().mockResolvedValue(undefined);
		mockMySQLProvider.query = vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 });

		// Setup SQLite mock
		mockSQLiteProvider = new SQLiteProvider({ filename: ':memory:' }) as Mocked<SQLiteProvider>;
		mockSQLiteProvider.connect = vi.fn().mockResolvedValue(undefined);
		mockSQLiteProvider.disconnect = vi.fn().mockResolvedValue(undefined);
		mockSQLiteProvider.query = vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 });

		// Setup PostgreSQL mock
		mockPostgreSQLProvider = new PostgreSQLProvider({}) as Mocked<PostgreSQLProvider>;
		mockPostgreSQLProvider.connect = vi.fn().mockResolvedValue(undefined);
		mockPostgreSQLProvider.disconnect = vi.fn().mockResolvedValue(undefined);
		mockPostgreSQLProvider.query = vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 });

		// Setup mocked constructors
		vi.mocked(MySQLProvider).mockImplementation(() => mockMySQLProvider);
		vi.mocked(SQLiteProvider).mockImplementation(() => mockSQLiteProvider);
		vi.mocked(PostgreSQLProvider).mockImplementation(() => mockPostgreSQLProvider);
	});

	afterEach(async () =>
	{
		// Clean up any resources if needed
	});

	describe('Gateway Construction and Basic Operations', () =>
	{
		it('should build gateway with multiple providers and repositories', async () =>
		{
			const config: DataGatewayConfig = {
				providers: {
					mysql: { type: 'mysql', options: {} },
					sqlite: { type: 'sqlite', options: { filename: 'test.db' } },
					postgres: { type: 'postgresql', options: {} },
				},
				repositories: {
					user: { provider: 'mysql', table: 'users' },
					log: { provider: 'sqlite', table: 'logs' },
					product: { provider: 'postgres', table: 'products' },
				},
			};

			const gateway = await DataGateway.build(config);

			expect(gateway).toBeInstanceOf(DataGateway);
			expect(mockMySQLProvider.connect).toHaveBeenCalledTimes(1);
			expect(mockSQLiteProvider.connect).toHaveBeenCalledTimes(1);
			expect(mockPostgreSQLProvider.connect).toHaveBeenCalledTimes(1);

			// Verify repositories
			const userRepo = gateway.getRepository('user');
			const logRepo = gateway.getRepository('log');
			const productRepo = gateway.getRepository('product');

			expect(userRepo).toBeInstanceOf(Repository);
			expect(logRepo).toBeInstanceOf(Repository);
			expect(productRepo).toBeInstanceOf(Repository);

			// Verify providers
			expect(gateway.getProvider('mysql')).toBe(mockMySQLProvider);
			expect(gateway.getProvider('sqlite')).toBe(mockSQLiteProvider);
			expect(gateway.getProvider('postgres')).toBe(mockPostgreSQLProvider);

			await gateway.disconnectAll();
			expect(mockMySQLProvider.disconnect).toHaveBeenCalledTimes(1);
			expect(mockSQLiteProvider.disconnect).toHaveBeenCalledTimes(1);
			expect(mockPostgreSQLProvider.disconnect).toHaveBeenCalledTimes(1);
		});

		it('should handle remote provider configuration', async () =>
		{
			const config: DataGatewayConfig = {
				providers: {
					remote: {
						type: 'remote',
						options: {
							endpoint: 'https://api.example.com/data',
							bearerToken: 'test-token'
						}
					},
				},
				repositories: {
					api: { provider: 'remote', table: 'data' },
				},
			};

			const gateway = await DataGateway.build(config);
			const apiRepo = gateway.getRepository('api');
			const remoteProvider = gateway.getProvider('remote');

			expect(apiRepo).toBeInstanceOf(Repository);
			expect(remoteProvider).toBeInstanceOf(RemoteProvider);

			await gateway.disconnectAll();
		});

		it('should handle custom provider configuration', async () =>
		{
			const mockCustomProvider: DataProvider = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 }),
			};

			const config: DataGatewayConfig = {
				providers: {
					custom: { type: 'custom', options: { provider: mockCustomProvider } },
				},
				repositories: {
					customRepo: { provider: 'custom', table: 'custom_table' },
				},
			};

			const gateway = await DataGateway.build(config);
			expect(mockCustomProvider.connect).toHaveBeenCalledTimes(1);

			const repo = gateway.getRepository('customRepo');
			expect(repo).toBeInstanceOf(Repository);

			const provider = gateway.getProvider('custom');
			expect(provider).toBe(mockCustomProvider);

			await gateway.disconnectAll();
			expect(mockCustomProvider.disconnect).toHaveBeenCalledTimes(1);
		});
	});

	describe('Error Handling', () =>
	{
		it('should handle connection failure during build', async () =>
		{
			const connectionError = new Error('Connection failed');
			mockSQLiteProvider.connect.mockRejectedValue(connectionError);

			const config: DataGatewayConfig = {
				providers: {
					mysql: { type: 'mysql', options: {} },
					sqlite: { type: 'sqlite', options: { filename: 'test.db' } },
				},
				repositories: {
					user: { provider: 'mysql', table: 'users' },
				},
			};

			await expect(DataGateway.build(config)).rejects.toThrow(
				`[DataGateway] Build failed: Connection failed for provider 'sqlite': ${connectionError.message}`
			);

			expect(mockMySQLProvider.connect).toHaveBeenCalledTimes(1);
			expect(mockSQLiteProvider.connect).toHaveBeenCalledTimes(1);
			expect(mockMySQLProvider.disconnect).toHaveBeenCalledTimes(1);
		});

		it('should throw error for unknown provider type', async () =>
		{
			const config: any = {
				providers: {
					unknown: { type: 'unknown', options: {} },
				},
				repositories: {},
			};

			await expect(DataGateway.build(config)).rejects.toThrow(
				"[DataGateway] Build failed: Unknown provider type: 'unknown'"
			);
		});

		it('should throw error for repository with missing provider', async () =>
		{
			const config: DataGatewayConfig = {
				providers: {
					mysql: { type: 'mysql', options: {} },
				},
				repositories: {
					user: { provider: 'nonexistent', table: 'users' },
				},
			};

			await expect(DataGateway.build(config)).rejects.toThrow(
				"[DataGateway] Build failed: Provider 'nonexistent' not found for repository 'user'"
			);
		});

		it('should return undefined for non-existent repository or provider', async () =>
		{
			const config: DataGatewayConfig = {
				providers: {
					mysql: { type: 'mysql', options: {} },
				},
				repositories: {
					user: { provider: 'mysql', table: 'users' },
				},
			};

			const gateway = await DataGateway.build(config);

			expect(gateway.getRepository('nonexistent')).toBeUndefined();
			expect(gateway.getProvider('nonexistent')).toBeUndefined();

			await gateway.disconnectAll();
		});
	});

	describe('Connection Pool Status', () =>
	{
		it('should get pool status for providers that support it', async () =>
		{
			const mockPoolStatus = {
				totalConnections: 5,
				idleConnections: 3,
				activeConnections: 2,
				maxConnections: 10,
				minConnections: 1,
			};

			mockMySQLProvider.getPoolStatus = vi.fn().mockReturnValue(mockPoolStatus);

			const config: DataGatewayConfig = {
				providers: {
					mysql: { type: 'mysql', options: {} },
				},
				repositories: {},
			};

			const gateway = await DataGateway.build(config);
			const status = gateway.getProviderPoolStatus('mysql');

			expect(status).toEqual(mockPoolStatus);
			expect(mockMySQLProvider.getPoolStatus).toHaveBeenCalledTimes(1);

			await gateway.disconnectAll();
		});

		it('should return undefined for providers without pool support', async () =>
		{
			const config: DataGatewayConfig = {
				providers: {
					sqlite: { type: 'sqlite', options: { filename: ':memory:' } },
				},
				repositories: {},
			};

			const gateway = await DataGateway.build(config);
			const status = gateway.getProviderPoolStatus('sqlite');

			expect(status).toBeUndefined();

			await gateway.disconnectAll();
		});

		it('should get all pool statuses', async () =>
		{
			const mockMySQLPoolStatus = {
				totalConnections: 5,
				idleConnections: 3,
				activeConnections: 2,
				maxConnections: 10,
			};

			const mockPostgresPoolStatus = {
				totalConnections: 3,
				idleConnections: 1,
				activeConnections: 2,
				maxConnections: 8,
			};

			mockMySQLProvider.getPoolStatus = vi.fn().mockReturnValue(mockMySQLPoolStatus);
			mockPostgreSQLProvider.getPoolStatus = vi.fn().mockReturnValue(mockPostgresPoolStatus);

			const config: DataGatewayConfig = {
				providers: {
					mysql: { type: 'mysql', options: {} },
					postgres: { type: 'postgresql', options: {} },
					sqlite: { type: 'sqlite', options: { filename: ':memory:' } },
				},
				repositories: {},
			};

			const gateway = await DataGateway.build(config);
			const allStatuses = gateway.getAllPoolStatuses();

			expect(allStatuses.size).toBe(2);
			expect(allStatuses.get('mysql')).toEqual(mockMySQLPoolStatus);
			expect(allStatuses.get('postgres')).toEqual(mockPostgresPoolStatus);
			expect(allStatuses.has('sqlite')).toBe(false);

			await gateway.disconnectAll();
		});
	});

	describe('Repository Operations', () =>
	{
		interface User
		{
			id?: number;
			name: string;
			email: string;
			age?: number;
			status?: string;
		}

		it('should handle partial entity insert with Repository', async () =>
		{
			const mockInsertResult = { insertId: 123, affectedRows: 1, rows: [] };
			const mockCustomProvider: DataProvider = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue(mockInsertResult),
			};

			const config: DataGatewayConfig = {
				providers: {
					custom: { type: 'custom', options: { provider: mockCustomProvider } },
				},
				repositories: {
					user: { provider: 'custom', table: 'users' },
				},
			};

			const gateway = await DataGateway.build(config);
			const userRepo = gateway.getRepository<User>('user');

			const partialUser: Partial<User> = {
				name: 'John Doe',
				email: 'john@example.com'
				// age and status are omitted, should use database defaults
			};

			const insertId = await userRepo?.insert(partialUser);
			expect(insertId).toBe(123);

			// Verify the query was called with proper parameters
			expect(mockCustomProvider.query).toHaveBeenCalledWith({
				type: 'INSERT',
				table: 'users',
				values: {
					name: 'John Doe',
					email: 'john@example.com'
				}
			});

			await gateway.disconnectAll();
		});

		it('should handle complex find operations', async () =>
		{
			const mockUsers = [
				{ id: 1, name: 'John Doe', email: 'john@example.com', age: 25, status: 'active' },
				{ id: 2, name: 'Jane Smith', email: 'jane@example.com', age: 30, status: 'active' },
			];

			const mockCustomProvider: DataProvider = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue({ rows: mockUsers, affectedRows: 0, insertId: 0 }),
			};

			const config: DataGatewayConfig = {
				providers: {
					custom: { type: 'custom', options: { provider: mockCustomProvider } },
				},
				repositories: {
					user: { provider: 'custom', table: 'users' },
				},
			};

			const gateway = await DataGateway.build(config);
			const userRepo = gateway.getRepository<User>('user');

			const users = await userRepo?.find({
				fields: ['id', 'name', 'email'],
				where: {
					and: [
						{ field: 'status', op: '=', value: 'active' },
						{ field: 'age', op: '>', value: 18 }
					]
				},
				orderBy: [{ field: 'name', direction: 'ASC' }],
				limit: 10
			});

			expect(users).toEqual(mockUsers);
			expect(mockCustomProvider.query).toHaveBeenCalledWith({
				type: 'SELECT',
				table: 'users',
				fields: ['id', 'name', 'email'],
				where: {
					and: [
						{ field: 'status', op: '=', value: 'active' },
						{ field: 'age', op: '>', value: 18 }
					]
				},
				orderBy: [{ field: 'name', direction: 'ASC' }],
				limit: 10
			});

			await gateway.disconnectAll();
		});
	});

	describe('Concurrent Operations', () =>
	{
		it('should handle concurrent provider connections', async () =>
		{
			// Simulate slower connection times
			mockMySQLProvider.connect = vi.fn().mockImplementation(() =>
				new Promise(resolve => setTimeout(resolve, 100))
			);
			mockSQLiteProvider.connect = vi.fn().mockImplementation(() =>
				new Promise(resolve => setTimeout(resolve, 50))
			);

			const config: DataGatewayConfig = {
				providers: {
					mysql: { type: 'mysql', options: {} },
					sqlite: { type: 'sqlite', options: { filename: 'test.db' } },
				},
				repositories: {
					user: { provider: 'mysql', table: 'users' },
					log: { provider: 'sqlite', table: 'logs' },
				},
			};

			const startTime = Date.now();
			const gateway = await DataGateway.build(config);
			const endTime = Date.now();

			// Should complete in roughly the time of the slower connection (100ms)
			// plus some overhead, not the sum of both (150ms)
			expect(endTime - startTime).toBeLessThan(150);

			expect(mockMySQLProvider.connect).toHaveBeenCalledTimes(1);
			expect(mockSQLiteProvider.connect).toHaveBeenCalledTimes(1);

			await gateway.disconnectAll();
		});
	});
});