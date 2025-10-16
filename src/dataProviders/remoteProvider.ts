import { DataProvider, ConnectionPoolStatus } from "../dataProvider";
import { Query, QueryResult } from "../queryObject";
import { getLogger } from "../logger";

export interface RemoteProviderOptions
{
	endpoint: string;
	bearerToken?: string;
}

/**
 * A data provider that accesses a remote API via POST requests.
 * It supports a single API endpoint and an optional Bearer Token for authentication.
 */
export class RemoteProvider implements DataProvider
{
	/** The API endpoint URL. */
	private readonly endpoint: string;
	/** The optional Bearer Token. */
	private readonly bearerToken?: string;
	/** Logger instance */
	private readonly logger = getLogger('RemoteProvider');

	/**
	 * Constructs a RemoteProvider instance.
	 * @param options Initialization options.
	 */
	constructor(options: RemoteProviderOptions)
	{
		this.endpoint = options.endpoint;
		this.bearerToken = options.bearerToken;
		this.logger.debug(`RemoteProvider initialized`, { endpoint: this.endpoint, hasToken: !!this.bearerToken });
	}

	/**
	 * Custom JSON serializer that handles Date objects.
	 * @param key The object key.
	 * @param value The value to serialize.
	 * @returns The serialized value.
	 */
	private jsonReplacer(key: string, value: any): any
	{
		if (value instanceof Date)
		{
			// Mark Date objects with a special type indicator
			return { __type: 'Date', __value: value.toISOString() };
		}
		return value;
	}

	/**
	 * Custom JSON deserializer that restores Date objects.
	 * @param key The object key.
	 * @param value The value to deserialize.
	 * @returns The deserialized value.
	 */
	private jsonReviver(key: string, value: any): any
	{
		if (value && typeof value === 'object' && value.__type === 'Date')
		{
			return new Date(value.__value);
		}
		return value;
	}

	/**
	 * Recursively converts Date objects in query parameters.
	 * @param obj The object to process.
	 * @returns The processed object.
	 */
	private prepareQueryForTransport(obj: any): any
	{
		if (obj instanceof Date)
		{
			return { __type: 'Date', __value: obj.toISOString() };
		}
		if (Array.isArray(obj))
		{
			return obj.map(item => this.prepareQueryForTransport(item));
		}
		if (obj && typeof obj === 'object')
		{
			const result: any = {};
			for (const key in obj)
			{
				result[key] = this.prepareQueryForTransport(obj[key]);
			}
			return result;
		}
		return obj;
	}

	/**
	 * Recursively restores Date objects from the response.
	 * @param obj The object to process.
	 * @returns The processed object.
	 */
	private restoreFromTransport(obj: any): any
	{
		if (obj && typeof obj === 'object' && obj.__type === 'Date')
		{
			return new Date(obj.__value);
		}
		if (Array.isArray(obj))
		{
			return obj.map(item => this.restoreFromTransport(item));
		}
		if (obj && typeof obj === 'object')
		{
			const result: any = {};
			for (const key in obj)
			{
				result[key] = this.restoreFromTransport(obj[key]);
			}
			return result;
		}
		return obj;
	}

	/**
	 * Connects to the data source. (No-op for a remote API, for interface compatibility).
	 */
	async connect(): Promise<void>
	{
		this.logger.debug(`Connecting to remote endpoint`, { endpoint: this.endpoint });
		return;
	}

	/**
	 * Disconnects from the data source. (No-op for a remote API, for interface compatibility).
	 */
	async disconnect(): Promise<void>
	{
		this.logger.debug(`Disconnecting from remote endpoint`, { endpoint: this.endpoint });
		return;
	}

	/**
	 * Sends a POST request to the API endpoint and expects a QueryResult in return.
	 * @param queryObject The query object to send.
	 * @returns A promise that resolves to the QueryResult from the API.
	 */
	private async post<T = any>(queryObject: Query): Promise<QueryResult<T>>
	{
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};
		if (this.bearerToken)
		{
			headers['Authorization'] = `Bearer ${this.bearerToken}`;
		}

		this.logger.debug(`Sending POST request to remote endpoint`, {
			endpoint: this.endpoint,
			queryType: queryObject.type,
			table: queryObject.table
		});

		// Prepare query object with Date handling
		const preparedQuery = this.prepareQueryForTransport(queryObject);

		const response = await fetch(this.endpoint, {
			method: 'POST',
			headers,
			body: JSON.stringify(preparedQuery),
		});

		if (!response.ok)
		{
			const errorMsg = `HTTP error! status: ${response.status}`;
			this.logger.error(errorMsg, { endpoint: this.endpoint, status: response.status });
			throw new Error(errorMsg);
		}

		const rawResult = await response.json() as QueryResult<T>;

		// Restore Date objects from the response
		const result = this.restoreFromTransport(rawResult) as QueryResult<T>;

		this.logger.debug(`Received response from remote endpoint`, {
			endpoint: this.endpoint,
			hasRows: !!result.rows,
			rowCount: result.rows?.length,
			hasError: !!result.error
		});

		return result;
	}

	/**
	 * Gets the connection pool status.
	 * @returns Always undefined as remote providers don't support connection pooling.
	 */
	getPoolStatus(): ConnectionPoolStatus | undefined
	{
		return undefined;
	}

	/**
	 * Checks if the provider supports connection pooling.
	 * @returns Always false for remote providers.
	 */
	supportsConnectionPooling(): boolean
	{
		return false;
	}

	/**
	 * Forwards the query to the remote endpoint via a POST request.
	 * @param query The query object.
	 * @returns The QueryResult returned by the remote endpoint.
	 */
	async query<T = any>(query: Query): Promise<QueryResult<T>>
	{
		this.logger.debug(`Executing query`, { type: query.type, table: query.table });

		try
		{
			// The remote endpoint is expected to handle the query type and return a valid QueryResult.
			switch (query.type)
			{
				case 'SELECT':
				case 'INSERT':
				case 'UPDATE':
				case 'DELETE':
					const result = await this.post<T>(query);
					if (result.error) {
						this.logger.warn(`Query executed with error`, { type: query.type, table: query.table, error: result.error });
					} else {
						this.logger.debug(`Query executed successfully`, { type: query.type, table: query.table });
					}
					return result;
				default:
					// Handle legacy RAW queries and unknown types
					if ((query as any).type === 'RAW')
					{
						const errorMsg = '[RemoteProvider.query] RAW queries are not supported for security reasons';
						this.logger.error(errorMsg);
						return { error: errorMsg };
					}
					const unknownTypeError = '[RemoteProvider.query] Unknown query type: ' + (query as any).type;
					this.logger.error(unknownTypeError, { type: (query as any).type });
					return { error: unknownTypeError };
			}
		}
		catch (err)
		{
			const errorMsg = `[RemoteProvider.query] ${err instanceof Error ? err.message : String(err)}`;
			this.logger.error(errorMsg, { type: query.type, table: query.table });
			return { error: errorMsg };
		}
	}
}
