/**
 * @file This file serves as the main entry point for the DataGateway library.
 * It exports all the public-facing classes, types, and interfaces, and defines the main `DataGateway` class
 * which acts as the central coordinator for data providers and repositories.
 */
import { Query, Condition, Aggregate, Join } from './queryObject';
import { DataProvider, ConnectionPoolStatus } from './dataProvider';
import { RemoteProvider, RemoteProviderOptions } from './dataProviders/remoteProvider';
import { Middleware } from './middleware';
import { EntityFieldMapper, DefaultFieldMapper, MappingFieldMapper } from './entityFieldMapper';
import { Repository } from './repository';
import { Logger, LogLevel, LoggerConfig, globalLogger, getLogger } from './logger';

// Type-only imports for providers that require peer dependencies
// This allows us to export the types without importing the actual implementations
export type { MySQLProviderOptions, ConnectionPoolConfig } from './dataProviders/MySQLProvider.js';
export type { SQLiteProviderOptions, SQLiteConnectionPoolConfig } from './dataProviders/SQLiteProvider.js';
export type { PostgreSQLProviderOptions, PostgreSQLConnectionPoolConfig } from './dataProviders/PostgreSQLProvider.js';

export
{
	Query, Condition, Aggregate, Join,
	DataProvider, ConnectionPoolStatus,
	RemoteProvider, RemoteProviderOptions,
	Middleware,
	EntityFieldMapper, DefaultFieldMapper, MappingFieldMapper,
	Repository,
	Logger, LogLevel, LoggerConfig, globalLogger, getLogger
}

// Defines the types for data provider configurations.
type ProviderType = 'mysql' | 'sqlite' | 'postgresql' | 'remote' | 'custom' | string;

// Defines the options for custom data providers.
type CustomProviderOptions = { provider: DataProvider };

// Import types dynamically - these will be resolved at build time
type MySQLProviderOptions = import('./dataProviders/MySQLProvider.js').MySQLProviderOptions;
type SQLiteProviderOptions = import('./dataProviders/SQLiteProvider.js').SQLiteProviderOptions;
type PostgreSQLProviderOptions = import('./dataProviders/PostgreSQLProvider.js').PostgreSQLProviderOptions;

// Defines the options for each provider type.
type ProviderOptions = MySQLProviderOptions | SQLiteProviderOptions | PostgreSQLProviderOptions | RemoteProviderOptions | CustomProviderOptions;

/**
 * Configuration options for the DataGateway.
 */
export interface DataGatewayConfig
{
	/**
	 * The list of data providers to use.
	 */
	providers:
	{
		[name: string]:
		| { type: 'mysql'; options: MySQLProviderOptions }
		| { type: 'sqlite'; options: SQLiteProviderOptions }
		| { type: 'postgresql'; options: PostgreSQLProviderOptions }
		| { type: 'remote'; options: RemoteProviderOptions }
		| { type: 'custom'; options: CustomProviderOptions }
		| { type: ProviderType; options: ProviderOptions };
	};

	/**
	 * The list of repositories to use.
	 */
	repositories:
	{
		[name: string]:
		{
			provider: string; // The name of the provider to use for this repository.
			table: string;
			mapper?: EntityFieldMapper<any>;
			middlewares?: Middleware[];
		};
	};

	/**
	 * Logging configuration options.
	 */
	logging?: LoggerConfig;
}

/**
 * DataGateway: A central hub for data access that integrates DataProviders and Repositories.
 */
export class DataGateway
{
	private providers: Map<string, DataProvider> = new Map();
	private repositories: Map<string, Repository<any>> = new Map();

	private constructor() { }

	/**
	 * Gets a repository by its registered name.
	 */
	getRepository<T = any>(name: string): Repository<T> | undefined
	{
		return this.repositories.get(name);
	}

	/**
	 * Gets a data provider by its registered name.
	 */
	getProvider(name: string): DataProvider | undefined
	{
		return this.providers.get(name);
	}

	/**
	 * Gets connection pool status for a specific provider.
	 * @param providerName The name of the provider.
	 * @returns Connection pool status or undefined if provider doesn't exist or doesn't support pooling.
	 */
	getProviderPoolStatus(providerName: string): ConnectionPoolStatus | undefined
	{
		const provider = this.providers.get(providerName);
		return provider?.getPoolStatus?.();
	}

	/**
	 * Gets connection pool status for all providers that support pooling.
	 * @returns A map of provider names to their pool status.
	 */
	getAllPoolStatuses(): Map<string, ConnectionPoolStatus>
	{
		const statuses = new Map<string, ConnectionPoolStatus>();
		for (const [name, provider] of this.providers)
		{
			const status = provider.getPoolStatus?.();
			if (status)
			{
				statuses.set(name, status);
			}
		}
		return statuses;
	}

	/**
	 * Disconnects all registered data providers.
	 */
	async disconnectAll(): Promise<void>
	{
		const logger = getLogger('DataGateway');
		logger.info('Disconnecting all providers');
		await Promise.all(Array.from(this.providers.values()).map(p => p.disconnect()));
		logger.info('All providers disconnected');
	}

	/**
	 * Configures the global logger for DataGateway.
	 */
	static configureLogger(config: LoggerConfig): void
	{
		globalLogger.configure(config);
	}

	/**
	 * Gets the current logger configuration.
	 */
	static getLoggerLevel(): LogLevel
	{
		return globalLogger.getLevel();
	}

	/**
	 * Sets the logger level.
	 */
	static setLoggerLevel(level: LogLevel): void
	{
		globalLogger.setLevel(level);
	}

	/**
	 * Creates and initializes a DataGateway instance from a configuration object.
	 */
	static async build(config: DataGatewayConfig): Promise<DataGateway>
	{
		const gateway = new DataGateway();
		const logger = getLogger('DataGateway');

		// Configure logging if provided
		if (config.logging)
		{
			globalLogger.configure(config.logging);
			logger.info('Logger configured', { level: LogLevel[config.logging.level || LogLevel.INFO] });
		}

		logger.info('Building DataGateway instance');

		try
		{
			// Initialize all data providers in parallel
			const providerPromises = Object.entries(config.providers).map(async ([name, providerConfig]) =>
			{
				let provider: DataProvider;
				logger.debug(`Initializing provider: ${name}`, { type: providerConfig.type });

				switch (providerConfig.type)
				{
					case 'mysql':
						try
						{
							const { MySQLProvider } = await import('./dataProviders/MySQLProvider.js');
							provider = new MySQLProvider((providerConfig.options as MySQLProviderOptions));
							logger.debug(`MySQL provider created for: ${name}`);
						}
						catch (err)
						{
							const error = err instanceof Error ? err : new Error(String(err));
							logger.error(`Failed to create MySQL provider: ${name}`, { error: error.message });
							if (error.message.includes('Cannot resolve module') || error.message.includes('MODULE_NOT_FOUND'))
							{
								throw new Error(`MySQL provider requires 'mysql2' package. Please install it: npm install mysql2`);
							}
							throw error;
						}
						break;
					case 'sqlite':
						try
						{
							const { SQLiteProvider } = await import('./dataProviders/SQLiteProvider.js');
							provider = new SQLiteProvider((providerConfig.options as SQLiteProviderOptions));
							logger.debug(`SQLite provider created for: ${name}`);
						}
						catch (err)
						{
							const error = err instanceof Error ? err : new Error(String(err));
							logger.error(`Failed to create SQLite provider: ${name}`, { error: error.message });
							if (error.message.includes('Cannot resolve module') || error.message.includes('MODULE_NOT_FOUND'))
							{
								throw new Error(`SQLite provider requires 'sqlite' and 'sqlite3' packages. Please install them: npm install sqlite sqlite3`);
							}
							throw error;
						}
						break;
					case 'postgresql':
						try
						{
							const { PostgreSQLProvider } = await import('./dataProviders/PostgreSQLProvider.js');
							provider = new PostgreSQLProvider((providerConfig.options as PostgreSQLProviderOptions));
							logger.debug(`PostgreSQL provider created for: ${name}`);
						}
						catch (err)
						{
							const error = err instanceof Error ? err : new Error(String(err));
							logger.error(`Failed to create PostgreSQL provider: ${name}`, { error: error.message });
							if (error.message.includes('Cannot resolve module') || error.message.includes('MODULE_NOT_FOUND'))
							{
								throw new Error(`PostgreSQL provider requires 'pg' package. Please install it: npm install pg @types/pg`);
							}
							throw error;
						}
						break;
					case 'remote':
						provider = new RemoteProvider((providerConfig.options as RemoteProviderOptions));
						logger.debug(`Remote provider created for: ${name}`);
						break;
					case 'custom':
						provider = (providerConfig.options as CustomProviderOptions).provider;
						logger.debug(`Custom provider created for: ${name}`);
						break;
					default:
						// This error will be caught by the outer try-catch block
						const errorMsg = `Unknown provider type: '${providerConfig.type}'`;
						logger.error(errorMsg, { providerName: name });
						throw new Error(errorMsg);
				}

				try
				{
					logger.debug(`Connecting to provider: ${name}`);
					await provider.connect();
					// Only add the provider to the gateway if the connection is successful
					gateway.providers.set(name, provider);
					logger.info(`Provider connected successfully: ${name}`);
				} catch (err)
				{
					const message = err instanceof Error ? err.message : String(err);
					const errorMsg = `Connection failed for provider '${name}': ${message}`;
					logger.error(errorMsg);
					// Re-throw with more context about which provider failed
					throw new Error(errorMsg);
				}
			});

			await Promise.all(providerPromises);
			logger.info(`All providers initialized successfully`, { count: Object.keys(config.providers).length });

			// Initialize all repositories
			for (const [name, repoConfig] of Object.entries(config.repositories))
			{
				logger.debug(`Initializing repository: ${name}`, { provider: repoConfig.provider, table: repoConfig.table });
				const provider = gateway.providers.get(repoConfig.provider);
				if (!provider)
				{
					const errorMsg = `Provider '${repoConfig.provider}' not found for repository '${name}'`;
					logger.error(errorMsg);
					throw new Error(errorMsg);
				}
				const repo = new Repository(
					provider,
					repoConfig.table,
					repoConfig.mapper,
					repoConfig.middlewares ?? []
				);
				gateway.repositories.set(name, repo);
				logger.debug(`Repository initialized successfully: ${name}`);
			}

			logger.info(`All repositories initialized successfully`, { count: Object.keys(config.repositories).length });
		}
		catch (error)
		{
			// If any part of the build fails, disconnect all successfully connected providers to prevent dangling connections.
			logger.error('Build failed, disconnecting all providers');
			await gateway.disconnectAll();

			// Re-throw the error with a clear prefix for better debugging.
			const message = error instanceof Error ? error.message : String(error);
			const errorMsg = `[DataGateway] Build failed: ${message}`;
			logger.error(errorMsg);
			throw new Error(errorMsg);
		}

		logger.info('DataGateway instance built successfully');
		return gateway;
	}
}
