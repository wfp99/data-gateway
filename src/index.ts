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

export type { DataGatewayConfig } from './dataGateway';
export { DataGateway } from './dataGateway';
