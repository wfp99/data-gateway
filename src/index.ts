/**
 * @file This file serves as the main entry point for the DataGateway library.
 * It exports all the public-facing classes, types, and interfaces, and defines the main `DataGateway` class
 * which acts as the central coordinator for data providers and repositories.
 */
import { Query, Condition, Aggregate, Join } from './queryObject';
import { DataProvider } from './dataProvider';
import { MySQLProvider, MySQLProviderOptions } from './dataProviders/MySQLProvider';
import { SQLiteProvider, SQLiteProviderOptions } from './dataProviders/SQLiteProvider';
import { RemoteProvider, RemoteProviderOptions } from './dataProviders/remoteProvider';
import { Middleware } from './middleware';
import { EntityFieldMapper, DefaultFieldMapper, MappingFieldMapper } from './entityFieldMapper';
import { Repository } from './repository';

export
{
	Query, Condition, Aggregate, Join,
	DataProvider,
	MySQLProvider, MySQLProviderOptions,
	SQLiteProvider, SQLiteProviderOptions,
	RemoteProvider, RemoteProviderOptions,
	Middleware,
	EntityFieldMapper, DefaultFieldMapper, MappingFieldMapper,
	Repository
}

// Defines the types for data provider configurations.
type ProviderType = 'mysql' | 'sqlite' | 'remote' | 'custom' | string;

// Defines the options for custom data providers.
type CustomProviderOptions = { provider: DataProvider };

// Defines the options for each provider type.
type ProviderOptions = MySQLProviderOptions | SQLiteProviderOptions | RemoteProviderOptions | CustomProviderOptions;

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
	 * Disconnects all registered data providers.
	 */
	async disconnectAll(): Promise<void>
	{
		await Promise.all(Array.from(this.providers.values()).map(p => p.disconnect()));
	}

	/**
	 * Creates and initializes a DataGateway instance from a configuration object.
	 */
	static async build(config: DataGatewayConfig): Promise<DataGateway>
	{
		const gateway = new DataGateway();

		try
		{
			// Initialize all data providers in parallel
			const providerPromises = Object.entries(config.providers).map(async ([name, providerConfig]) =>
			{
				let provider: DataProvider;

				switch (providerConfig.type)
				{
					case 'mysql':
						provider = new MySQLProvider((providerConfig.options as MySQLProviderOptions));
						break;
					case 'sqlite':
						provider = new SQLiteProvider((providerConfig.options as SQLiteProviderOptions));
						break;
					case 'remote':
						provider = new RemoteProvider((providerConfig.options as RemoteProviderOptions));
						break;
					case 'custom':
						provider = (providerConfig.options as CustomProviderOptions).provider;
						break;
					default:
						// This error will be caught by the outer try-catch block
						throw new Error(`Unknown provider type: '${providerConfig.type}'`);
				}

				try
				{
					await provider.connect();
					// Only add the provider to the gateway if the connection is successful
					gateway.providers.set(name, provider);
				} catch (err)
				{
					const message = err instanceof Error ? err.message : String(err);
					// Re-throw with more context about which provider failed
					throw new Error(`Connection failed for provider '${name}': ${message}`);
				}
			});

			await Promise.all(providerPromises);

			// Initialize all repositories
			for (const [name, repoConfig] of Object.entries(config.repositories))
			{
				const provider = gateway.providers.get(repoConfig.provider);
				if (!provider)
				{
					throw new Error(`Provider '${repoConfig.provider}' not found for repository '${name}'`);
				}
				const repo = new Repository(
					provider,
					repoConfig.table,
					repoConfig.mapper,
					repoConfig.middlewares ?? []
				);
				gateway.repositories.set(name, repo);
			}
		}
		catch (error)
		{
			// If any part of the build fails, disconnect all successfully connected providers to prevent dangling connections.
			await gateway.disconnectAll();

			// Re-throw the error with a clear prefix for better debugging.
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`[DataGateway] Build failed: ${message}`);
		}

		return gateway;
	}
}
