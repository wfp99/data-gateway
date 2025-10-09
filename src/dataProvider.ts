import { Query, QueryResult } from './queryObject';

/**
 * Connection pool status information.
 */
export interface ConnectionPoolStatus
{
	/** Total number of connections in the pool */
	totalConnections: number;
	/** Number of idle connections */
	idleConnections: number;
	/** Number of active connections */
	activeConnections: number;
	/** Maximum allowed connections */
	maxConnections: number;
	/** Minimum idle connections to maintain */
	minConnections?: number;
}

/**
 * Abstract interface for a generic data provider.
 */
export interface DataProvider
{
	/**
	 * Connects to the database.
	 */
	connect(): Promise<void>;

	/**
	 * Disconnects from the database.
	 */
	disconnect(): Promise<void>;

	/**
	 * Executes a query using a query object.
	 * @param query The query object.
	 * @returns The query result object.
	 */
	query<T = any>(query: Query): Promise<QueryResult<T>>;

	/**
	 * Gets the connection pool status (if applicable).
	 * Returns undefined if the provider doesn't support connection pooling.
	 */
	getPoolStatus?(): ConnectionPoolStatus | undefined;

	/**
	 * Checks if the provider supports connection pooling.
	 */
	supportsConnectionPooling?(): boolean;
}
