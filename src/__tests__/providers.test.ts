import { describe, it, expect, vi } from 'vitest';
import { DataGateway } from '../index';

/**
 * Provider compatibility tests - Test basic functionality of different Providers
 * Note: These tests use mocks and do not require actual database connections
 */
describe('Provider Compatibility Tests', () =>
{
	describe('MySQL Provider Integration', () =>
	{
		it('should handle MySQL provider configuration', async () =>
		{
			const config = {
				providers: {
					mysql: {
						type: 'mysql' as const,
						options: {
							host: 'localhost',
							user: 'test',
							password: 'test',
							database: 'test',
						},
					},
				},
				repositories: {
					user: {
						provider: 'mysql' as const,
						table: 'users',
					},
				},
			};

			// In actual environment, since mysql2 is installed, this will successfully create DataGateway
			// However, connection will fail due to invalid credentials, but that's tested elsewhere
			const gateway = await DataGateway.build(config);
			expect(gateway).toBeInstanceOf(DataGateway);
			expect(gateway.getRepository('user')).toBeDefined();
		});

		it('should handle MySQL with connection pooling', async () =>
		{
			const config = {
				providers: {
					mysql: {
						type: 'mysql' as const,
						options: {
							host: 'localhost',
							user: 'test',
							password: 'test',
							database: 'test',
							pool: {
								usePool: true,
								connectionLimit: 10,
								acquireTimeout: 60000,
								timeout: 600000
							}
						}
					}
				},
				repositories: {
					user: { provider: 'mysql', table: 'users' }
				}
			};

			// MySQL with connection pooling should succeed even without server running
			// because it doesn't test the connection immediately unless preConnect is true
			const gateway = await DataGateway.build(config);
			expect(gateway).toBeInstanceOf(DataGateway);
			expect(gateway.getRepository('user')).toBeDefined();
			await gateway.disconnectAll();
		});
		});
	});

	describe('SQLite Provider Integration', () =>
	{
		it('should handle SQLite provider configuration', async () =>
		{
			const config = {
				providers: {
					sqlite: {
						type: 'sqlite' as const,
						options: {
							filename: './test.db'
						}
					}
				},
				repositories: {
					user: { provider: 'sqlite', table: 'users' }
				}
			};

			// In test environment, SQLite packages are available but should succeed with test.db
			const gateway = await DataGateway.build(config);
			expect(gateway).toBeInstanceOf(DataGateway);
			expect(gateway.getRepository('user')).toBeDefined();
			await gateway.disconnectAll();
		});

		it('should handle SQLite with read connection pooling', async () =>
		{
			const config = {
				providers: {
					sqlite: {
						type: 'sqlite' as const,
						options: {
							filename: './test.db',
							pool: {
								usePool: true,
								maxReadConnections: 3,
								enableWAL: true
							}
						}
					}
				},
				repositories: {
					user: { provider: 'sqlite', table: 'users' }
				}
			};

			// In test environment, SQLite packages are available and should succeed
			const gateway = await DataGateway.build(config);
			expect(gateway).toBeInstanceOf(DataGateway);
			expect(gateway.getRepository('user')).toBeDefined();
			await gateway.disconnectAll();
		});
	});

	describe('PostgreSQL Provider Integration', () =>
	{
		it('should handle PostgreSQL provider configuration', async () =>
		{
			const config = {
				providers: {
					postgres: {
						type: 'postgresql' as const,
						options: {
							host: 'localhost',
							user: 'test',
							password: 'test',
							database: 'test'
						}
					}
				},
				repositories: {
					user: { provider: 'postgres', table: 'users' }
				}
			};

			await expect(DataGateway.build(config))
				.rejects.toThrow(/Connection failed for provider 'postgres'/);
		});

		it('should handle PostgreSQL with connection pooling', async () =>
		{
			const config = {
				providers: {
					postgres: {
						type: 'postgresql' as const,
						options: {
							host: 'localhost',
							user: 'test',
							password: 'test',
							database: 'test',
							pool: {
								usePool: true,
								maxConnections: 20,
								idleTimeoutMillis: 30000,
								connectionTimeoutMillis: 2000
							}
						}
					}
				},
				repositories: {
					user: { provider: 'postgres', table: 'users' }
				}
			};

			await expect(DataGateway.build(config))
				.rejects.toThrow(/Connection failed for provider 'postgres'/);
		});
	});

	describe('Remote Provider Integration', () =>
	{
		it('should successfully build with Remote provider', async () =>
		{
			const config = {
				providers: {
					api: {
						type: 'remote' as const,
						options: {
							endpoint: 'https://api.example.com/data',
							bearerToken: 'test-token'
						}
					}
				},
				repositories: {
					user: { provider: 'api', table: 'users' }
				}
			};

			const gateway = await DataGateway.build(config);
			expect(gateway).toBeInstanceOf(DataGateway);

			const userRepo = gateway.getRepository('user');
			expect(userRepo).toBeDefined();

			const apiProvider = gateway.getProvider('api');
			expect(apiProvider).toBeDefined();

			await gateway.disconnectAll();
		});

		it('should handle Remote provider without token', async () =>
		{
			const config = {
				providers: {
					api: {
						type: 'remote' as const,
						options: {
							endpoint: 'https://api.example.com/data'
						}
					}
				},
				repositories: {
					data: { provider: 'api', table: 'data' }
				}
			};

			const gateway = await DataGateway.build(config);
			expect(gateway).toBeInstanceOf(DataGateway);
			await gateway.disconnectAll();
		});
	});

	describe('Custom Provider Integration', () =>
	{
		it('should handle custom provider correctly', async () =>
		{
			const customProvider = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 }),
				getPoolStatus: vi.fn().mockReturnValue({
					totalConnections: 5,
					idleConnections: 3,
					activeConnections: 2,
					maxConnections: 10
				}),
				supportsConnectionPooling: vi.fn().mockReturnValue(true)
			};

			const config = {
				providers: {
					custom: {
						type: 'custom' as const,
						options: { provider: customProvider }
					}
				},
				repositories: {
					test: { provider: 'custom', table: 'test_table' }
				}
			};

			const gateway = await DataGateway.build(config);
			expect(customProvider.connect).toHaveBeenCalledTimes(1);

			// Test connection pool status
			const poolStatus = gateway.getProviderPoolStatus('custom');
			expect(poolStatus).toEqual({
				totalConnections: 5,
				idleConnections: 3,
				activeConnections: 2,
				maxConnections: 10
			});

			const repo = gateway.getRepository('test');
			expect(repo).toBeDefined();

			await gateway.disconnectAll();
			expect(customProvider.disconnect).toHaveBeenCalledTimes(1);
		});

		it('should handle custom provider without pool support', async () =>
		{
			const simpleProvider = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 })
			};

			const config = {
				providers: {
					simple: {
						type: 'custom' as const,
						options: { provider: simpleProvider }
					}
				},
				repositories: {
					test: { provider: 'simple', table: 'test_table' }
				}
			};

			const gateway = await DataGateway.build(config);

			// Provider without connection pool support should return undefined
			const poolStatus = gateway.getProviderPoolStatus('simple');
			expect(poolStatus).toBeUndefined();

			await gateway.disconnectAll();
		});
	});

	describe('Mixed Provider Scenarios', () =>
	{
		it('should handle multiple different providers', async () =>
		{
			const customProvider = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 })
			};

			const config = {
				providers: {
					api: {
						type: 'remote' as const,
						options: {
							endpoint: 'https://api.example.com/data',
							bearerToken: 'api-token'
						}
					},
					custom: {
						type: 'custom' as const,
						options: { provider: customProvider }
					}
				},
				repositories: {
					user: { provider: 'api', table: 'users' },
					log: { provider: 'custom', table: 'logs' }
				}
			};

			const gateway = await DataGateway.build(config);

			const userRepo = gateway.getRepository('user');
			const logRepo = gateway.getRepository('log');
			const apiProvider = gateway.getProvider('api');
			const customProv = gateway.getProvider('custom');

			expect(userRepo).toBeDefined();
			expect(logRepo).toBeDefined();
			expect(apiProvider).toBeDefined();
			expect(customProv).toBeDefined();
			expect(customProv).toBe(customProvider);

			await gateway.disconnectAll();
			expect(customProvider.disconnect).toHaveBeenCalledTimes(1);
		});

		it('should get all pool statuses from mixed providers', async () =>
		{
			const providerWithPool = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 }),
				getPoolStatus: vi.fn().mockReturnValue({
					totalConnections: 8,
					idleConnections: 5,
					activeConnections: 3,
					maxConnections: 15
				})
			};

			const providerWithoutPool = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 })
			};

			const config = {
				providers: {
					api: {
						type: 'remote' as const,
						options: { endpoint: 'https://api.example.com' }
					},
					pooled: {
						type: 'custom' as const,
						options: { provider: providerWithPool }
					},
					simple: {
						type: 'custom' as const,
						options: { provider: providerWithoutPool }
					}
				},
				repositories: {
					user: { provider: 'pooled', table: 'users' }
				}
			};

			const gateway = await DataGateway.build(config);
			const allStatuses = gateway.getAllPoolStatuses();

			// Only pooled provider has connection pool status
			expect(allStatuses.size).toBe(1);
			expect(allStatuses.has('pooled')).toBe(true);
			expect(allStatuses.has('api')).toBe(false);
			expect(allStatuses.has('simple')).toBe(false);

			const pooledStatus = allStatuses.get('pooled');
			expect(pooledStatus).toEqual({
				totalConnections: 8,
				idleConnections: 5,
				activeConnections: 3,
				maxConnections: 15
			});

			await gateway.disconnectAll();
		});
	});

	describe('Provider Error Handling', () =>
	{
		it('should handle provider connection failures gracefully', async () =>
		{
			const failingProvider = {
				connect: vi.fn().mockRejectedValue(new Error('Connection refused')),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 })
			};

			const workingProvider = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 })
			};

			const config = {
				providers: {
					failing: {
						type: 'custom' as const,
						options: { provider: failingProvider }
					},
					working: {
						type: 'custom' as const,
						options: { provider: workingProvider }
					}
				},
				repositories: {
					test: { provider: 'working', table: 'test' }
				}
			};

			await expect(DataGateway.build(config))
				.rejects.toThrow(/Connection failed for provider 'failing': Connection refused/);

			// Ensure that successfully connected provider is also cleaned up
			expect(workingProvider.disconnect).toHaveBeenCalledTimes(1);
		});

		it('should provide specific error messages for missing packages', async () =>
		{
			// Note: In test environment with devDependencies installed, we can't actually test
			// missing package errors. Instead, we test connection failures which is the expected
			// behavior when dependencies are available but servers are not running.
			const configurations = [
				{
					name: 'MySQL',
					config: {
						providers: {
							mysql: {
								type: 'mysql' as const,
								options: {
									host: 'localhost',
									user: 'test',
									password: 'test',
									database: 'test',
									pool: {
										usePool: true,
										preConnect: true // Force immediate connection test
									}
								}
							}
						},
						repositories: { user: { provider: 'mysql', table: 'users' } }
					},
					expectedError: /Connection failed for provider 'mysql'/
				},
				{
					name: 'PostgreSQL',
					config: {
						providers: {
							postgres: {
								type: 'postgresql' as const,
								options: { host: 'localhost', user: 'test', password: 'test', database: 'test' }
							}
						},
						repositories: { user: { provider: 'postgres', table: 'users' } }
					},
					expectedError: /Connection failed for provider 'postgres'/
				}
			];

			for (const { name, config, expectedError } of configurations)
			{
				await expect(DataGateway.build(config as any), `${name} provider error`).rejects.toThrow(expectedError);
			}
		});
	});
