import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { DataGateway, DataGatewayConfig } from './index';
import { DataProvider } from './dataProvider';
import { Repository } from './repository';
import { MySQLProvider } from './dataProviders/MySQLProvider';
import { SQLiteProvider } from './dataProviders/SQLiteProvider';

// Mock the providers
vi.mock('./dataProviders/MySQLProvider');
vi.mock('./dataProviders/SQLiteProvider');

describe('DataGateway', () =>
{
	let mockMySQLProvider: Mocked<MySQLProvider>;
	let mockSQLiteProvider: Mocked<SQLiteProvider>;

	beforeEach(() =>
	{
		// Reset mocks before each test
		vi.clearAllMocks();

		// Mock implementations
		mockMySQLProvider = new MySQLProvider({}) as Mocked<MySQLProvider>;
		mockMySQLProvider.connect = vi.fn().mockResolvedValue(undefined);
		mockMySQLProvider.disconnect = vi.fn().mockResolvedValue(undefined);

		mockSQLiteProvider = new SQLiteProvider({ filename: ':memory:' }) as Mocked<SQLiteProvider>;
		mockSQLiteProvider.connect = vi.fn().mockResolvedValue(undefined);
		mockSQLiteProvider.disconnect = vi.fn().mockResolvedValue(undefined);

		// Use vi.mocked to get typed mocks
		vi.mocked(MySQLProvider).mockImplementation(() => mockMySQLProvider);
		vi.mocked(SQLiteProvider).mockImplementation(() => mockSQLiteProvider);
	});

	it('should build gateway, initialize providers and repositories', async () =>
	{
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

		const gateway = await DataGateway.build(config);

		expect(gateway).toBeInstanceOf(DataGateway);
		expect(mockMySQLProvider.connect).toHaveBeenCalledTimes(1);
		expect(mockSQLiteProvider.connect).toHaveBeenCalledTimes(1);

		const userRepo = gateway.getRepository('user');
		expect(userRepo).toBeInstanceOf(Repository);
		expect(gateway.getRepository('nonexistent')).toBeUndefined();

		const mysqlProvider = gateway.getProvider('mysql');
		expect(mysqlProvider).toBe(mockMySQLProvider);
		expect(gateway.getProvider('nonexistent')).toBeUndefined();
	});

	it('should handle connection failure during build and disconnect others', async () =>
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
		expect(mockSQLiteProvider.disconnect).not.toHaveBeenCalled();
	});

	it('should throw an error for unknown provider type', async () =>
	{
		const config: any = {
			providers: {
				foo: { type: 'foo', options: {} },
			},
			repositories: {},
		};

		await expect(DataGateway.build(config)).rejects.toThrow(
			"[DataGateway] Build failed: Unknown provider type: 'foo'"
		);
	});

	it('should throw an error for repository with missing provider', async () =>
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

	it('should disconnect all providers', async () =>
	{
		const config: DataGatewayConfig = {
			providers: {
				mysql: { type: 'mysql', options: {} },
				sqlite: { type: 'sqlite', options: { filename: 'test.db' } },
			},
			repositories: {},
		};

		const gateway = await DataGateway.build(config);
		await gateway.disconnectAll();

		expect(mockMySQLProvider.disconnect).toHaveBeenCalledTimes(1);
		expect(mockSQLiteProvider.disconnect).toHaveBeenCalledTimes(1);
	});

	it('should use custom provider', async () =>
	{
		const mockCustomProvider: DataProvider = {
			connect: vi.fn().mockResolvedValue(undefined),
			disconnect: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue({ rows: [] }),
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