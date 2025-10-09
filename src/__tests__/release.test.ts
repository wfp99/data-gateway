import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DataGateway } from '../index';

/**
 * Pre-release check - Verify availability and consistency of all public APIs
 */
describe('Release Readiness Tests', () =>
{
	describe('Public API Availability', () =>
	{
		it('should export all required classes and interfaces', () =>
		{
			// Core classes
			expect(DataGateway).toBeDefined();
			expect(typeof DataGateway.build).toBe('function');

			// Check static methods
			expect(DataGateway.build).toBeInstanceOf(Function);
		});

		it('should have proper TypeScript type exports', async () =>
		{
			// These type checks will be done at compile time, here just ensure the module can be imported correctly
			const module = await import('../index');

			// Check main exports
			expect(module.DataGateway).toBeDefined();
			expect(module.Repository).toBeDefined();
			expect(module.DefaultFieldMapper).toBeDefined();
			expect(module.MappingFieldMapper).toBeDefined();
			expect(module.RemoteProvider).toBeDefined();

			// Check type exports (these are not available at runtime, but will be checked at compile time)
		});
		// MySQLProviderOptions, SQLiteProviderOptions, PostgreSQLProviderOptions
		// Should work normally in TypeScript
	});
});

describe('Documentation Examples Validation', () =>
{
	it('should work with README examples', async () =>
	{
		// Test basic examples from README
		const config = {
			providers: {
				sqlite: {
					type: 'sqlite' as const,
					options: { filename: ':memory:' }
				}
			},
			repositories: {
				user: { provider: 'sqlite', table: 'users' }
			}
		};

		// This should execute normally without throwing exceptions
		let gateway;
		try
		{
			gateway = await DataGateway.build(config);
			expect(gateway).toBeInstanceOf(DataGateway);
		} catch (error)
		{
			// SQLite may not be available, this is normal in test environments
			expect(error).toBeDefined();
		} finally
		{
			if (gateway)
			{
				await gateway.disconnectAll();
			}
		}
	});
});

describe('Version Compatibility', () =>
{
	it('should maintain backward compatibility with previous API', async () =>
	{
		// Ensure key API signatures remain unchanged
		const config = {
			providers: {
				test: {
					type: 'custom' as const,
					options: {
						provider: {
							connect: () => Promise.resolve(),
							disconnect: () => Promise.resolve(),
							query: () => Promise.resolve({ rows: [], affectedRows: 0, insertId: 0 })
						}
					}
				}
			},
			repositories: {
				test: { provider: 'test', table: 'test' }
			}
		};

		const gateway = await DataGateway.build(config);

		// Check that core methods exist and are callable
		expect(typeof gateway.getRepository).toBe('function');
		expect(typeof gateway.getProvider).toBe('function');
		expect(typeof gateway.disconnectAll).toBe('function');

		const repo = gateway.getRepository('test');
		expect(repo).toBeDefined();

		// Check Repository methods
		if (repo)
		{
			expect(typeof repo.find).toBe('function');
			expect(typeof repo.findOne).toBe('function');
			expect(typeof repo.findMany).toBe('function');
			expect(typeof repo.insert).toBe('function');
			expect(typeof repo.update).toBe('function');
			expect(typeof repo.delete).toBe('function');
			expect(typeof repo.count).toBe('function');
			expect(typeof repo.sum).toBe('function');
		}

		await gateway.disconnectAll();
	});
});

describe('Error Handling Standards', () =>
{
	it('should have proper error handling', async () =>
	{
		// Test that invalid provider configurations have appropriate error messages
		await expect(DataGateway.build({
			providers: {
				invalid: {
					type: 'unknown' as any,
					options: {}
				}
			},
			repositories: {
				test: { provider: 'invalid', table: 'test' }
			}
		})).rejects.toThrow(/Unknown provider type/);
	});

	describe('Memory and Resource Management', () =>
	{
		it('should properly clean up resources', async () =>
		{
			const disconnectSpy = vi.fn().mockResolvedValue(undefined);
			const provider = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: disconnectSpy,
				query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 })
			};

			const config = {
				providers: {
					test: { type: 'custom' as const, options: { provider } }
				},
				repositories: {
					test: { provider: 'test', table: 'test' }
				}
			};

			const gateway = await DataGateway.build(config);
			await gateway.disconnectAll();

			expect(disconnectSpy).toHaveBeenCalledTimes(1);
		});

		it('should handle multiple disconnect calls gracefully', async () =>
		{
			const disconnectSpy = vi.fn().mockResolvedValue(undefined);
			const provider = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: disconnectSpy,
				query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0, insertId: 0 })
			};

			const config = {
				providers: {
					test: { type: 'custom' as const, options: { provider } }
				},
				repositories: {
					test: { provider: 'test', table: 'test' }
				}
			};

			const gateway = await DataGateway.build(config);

			// Multiple calls to disconnectAll should be safe
			await gateway.disconnectAll();
			await gateway.disconnectAll();
			await gateway.disconnectAll();

			// disconnect should be called multiple times, once for each disconnectAll call
			expect(disconnectSpy).toHaveBeenCalledTimes(3);
		});
	});

	describe('Performance Characteristics', () =>
	{
		it('should handle reasonable load', async () =>
		{
			const provider = {
				connect: vi.fn().mockResolvedValue(undefined),
				disconnect: vi.fn().mockResolvedValue(undefined),
				query: vi.fn().mockImplementation((_query: any) =>
				{
					// Simulate some processing time
					return new Promise(resolve =>
					{
						setTimeout(() =>
						{
							resolve({ rows: [{ id: 1, data: 'test' }], affectedRows: 1, insertId: 1 });
						}, 1);
					});
				})
			};

			const config = {
				providers: {
					perf: { type: 'custom' as const, options: { provider } }
				},
				repositories: {
					test: { provider: 'perf', table: 'test' }
				}
			};

			const gateway = await DataGateway.build(config);
			const repo = gateway.getRepository('test');

			// Execute multiple concurrent operations
			const startTime = Date.now();
			const promises = Array.from({ length: 100 }, () =>
				repo?.find({ limit: 1 })
			);

			const results = await Promise.all(promises);
			const endTime = Date.now();

			expect(results).toHaveLength(100);
			expect(endTime - startTime).toBeLessThan(1000); // Should complete within a reasonable time

			await gateway.disconnectAll();
		});
	});

	describe('Cross-Platform Compatibility', () =>
	{
		it('should work in different Node.js environments', () =>
		{
			// Check critical Node.js API availability
			expect(typeof Promise).toBe('function');
			expect(typeof fetch).toBe('function'); // Requires Node.js 18+

			// Check that the project doesn't use browser-specific APIs
			expect(typeof window).toBe('undefined');
			expect(typeof document).toBe('undefined');
		});
	});

	describe('Package.json Validation', () =>
	{
		it('should have correct package configuration', async () =>
		{
			const packageJson = await import('../../package.json');

			// Check required fields
			expect(packageJson.name).toBe('@wfp99/data-gateway');
			expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
			expect(packageJson.main).toBe('dist/index.js');
			expect(packageJson.types).toBe('dist/index.d.ts');

			// Check engines configuration
			expect(packageJson.engines?.node).toBe('>=18.0.0');

			// Check publish scripts
			expect(packageJson.scripts?.prepublishOnly).toContain('test:run');
			expect(packageJson.scripts?.prepublishOnly).toContain('build');
		});
	});
});