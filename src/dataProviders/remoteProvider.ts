import { DataProvider } from "../dataProvider";
import { Query, QueryResult } from "../queryObject";

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

	/**
	 * Constructs a RemoteProvider instance.
	 * @param options Initialization options.
	 */
	constructor(options: RemoteProviderOptions)
	{
		this.endpoint = options.endpoint;
		this.bearerToken = options.bearerToken;
	}

	/**
	 * Connects to the data source. (No-op for a remote API, for interface compatibility).
	 */
	async connect(): Promise<void>
	{
		return;
	}

	/**
	 * Disconnects from the data source. (No-op for a remote API, for interface compatibility).
	 */
	async disconnect(): Promise<void>
	{
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
		const response = await fetch(this.endpoint, {
			method: 'POST',
			headers,
			body: JSON.stringify(queryObject),
		});
		if (!response.ok)
		{
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		return await response.json() as QueryResult<T>;
	}

	/**
	 * Forwards the query to the remote endpoint via a POST request.
	 * @param query The query object.
	 * @returns The QueryResult returned by the remote endpoint.
	 */
	async query<T = any>(query: Query): Promise<QueryResult<T>>
	{
		try
		{
			// The remote endpoint is expected to handle the query type and return a valid QueryResult.
			switch (query.type)
			{
				case 'SELECT':
				case 'INSERT':
				case 'UPDATE':
				case 'DELETE':
				case 'RAW':
					return await this.post<T>(query);
				default:
					return { error: '[RemoteProvider.query] Unknown query type: ' + query.type };
			}
		}
		catch (err)
		{
			return { error: `[RemoteProvider.query] ${err instanceof Error ? err.message : String(err)}` };
		}
	}
}
