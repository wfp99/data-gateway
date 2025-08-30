import { Query, QueryResult } from './queryObject';

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
}
