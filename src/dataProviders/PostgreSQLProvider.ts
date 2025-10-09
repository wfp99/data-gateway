import { DataProvider, ConnectionPoolStatus } from '../dataProvider';
import { Condition, Query, QueryResult } from '../queryObject';
import { Pool, PoolClient, PoolConfig, Client, ClientConfig } from 'pg';

/**
 * Connection pool configuration options for PostgreSQL.
 */
export interface PostgreSQLConnectionPoolConfig
{
	/** Whether to use connection pooling (default: true) */
	usePool?: boolean;
	/** Maximum number of connections in the pool (default: 10) */
	max?: number;
	/** Minimum number of connections to maintain (default: 0) */
	min?: number;
	/** Maximum number of milliseconds a client can be idle before being closed (default: 10000) */
	idleTimeoutMillis?: number;
	/** Maximum number of milliseconds to wait for a connection (default: 30000) */
	connectionTimeoutMillis?: number;
	/** Whether to allow connections over SSL only (default: false) */
	allowExitOnIdle?: boolean;
}

/**
 * PostgreSQL connection options, extending `ClientConfig` from `pg` with pool configuration.
 */
export interface PostgreSQLProviderOptions extends ClientConfig
{
	/** Connection pool configuration */
	pool?: PostgreSQLConnectionPoolConfig;
}

/**
 * A PostgreSQL data provider that implements the `DataProvider` interface,
 * supporting PostgreSQL operations through a query object model with connection pooling support.
 */
export class PostgreSQLProvider implements DataProvider
{
	/**
	 * The PostgreSQL client instance (used when pooling is disabled).
	 */
	private client?: Client;

	/**
	 * The PostgreSQL connection pool instance (used when pooling is enabled).
	 */
	private pool?: Pool;

	/**
	 * The connection options.
	 */
	private readonly options: PostgreSQLProviderOptions;

	/**
	 * Whether connection pooling is enabled.
	 */
	private readonly usePool: boolean;

	/**
	 * Constructor that takes connection options.
	 * @param options The PostgreSQL provider options.
	 */
	constructor(options: PostgreSQLProviderOptions)
	{
		this.options = options;
		this.usePool = options.pool?.usePool !== false; // Default to true
	}

	/**
	 * Validate SQL identifiers (table names, field names, etc.)
	 * Only allows letters, numbers, underscores, and must start with a letter
	 */
	private validateIdentifier(identifier: string): string
	{
		if (!identifier || typeof identifier !== 'string')
		{
			throw new Error('Invalid identifier: empty or non-string');
		}
		// Allow letters at the beginning, followed by letters, numbers, underscores
		const pattern = /^[a-zA-Z][a-zA-Z0-9_]*$/;
		if (!pattern.test(identifier) || identifier.length > 64)
		{
			throw new Error(`Invalid identifier: ${identifier}`);
		}
		return identifier;
	}

	/**
	 * Validate alias
	 */
	private validateAlias(alias: string): string
	{
		return this.validateIdentifier(alias);
	}

	/**
	 * Validate sort direction
	 */
	private validateDirection(direction: string): string
	{
		if (direction !== 'ASC' && direction !== 'DESC')
		{
			throw new Error(`Invalid direction: ${direction}`);
		}
		return direction;
	}

	/**
	 * Validate JOIN type
	 */
	private validateJoinType(joinType: string): string
	{
		const allowedJoinTypes = ['INNER', 'LEFT', 'RIGHT', 'FULL OUTER'];
		if (!allowedJoinTypes.includes(joinType.toUpperCase()))
		{
			throw new Error(`Invalid JOIN type: ${joinType}`);
		}
		return joinType.toUpperCase();
	}

	/**
	 * Validate SQL operators
	 */
	private validateOperator(operator: string): boolean
	{
		const allowedOperators = ['=', '!=', '<>', '<', '>', '<=', '>=', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL'];
		return allowedOperators.includes(operator.toUpperCase());
	}

	/**
	 * Validate the security of query objects
	 */
	private validateQuery(query: Query): void
	{
		// Validate table name
		if (query.table)
		{
			this.validateIdentifier(query.table);
		}

		// Validate fields
		if (query.type === 'SELECT' && query.fields)
		{
			for (const field of query.fields)
			{
				if (typeof field === 'string')
				{
					if (field !== '*')
					{
						this.validateIdentifier(field);
					}
				} else if (typeof field === 'object' && field.type)
				{
					this.validateIdentifier(field.type);
					if (field.field)
					{
						this.validateIdentifier(field.field);
					}
					if (field.alias)
					{
						this.validateAlias(field.alias);
					}
				}
			}
		}

		// Validate WHERE conditions
		if (query.where)
		{
			this.validateConditionStructure(query.where);
		}

		// Validate ORDER BY
		if (query.orderBy)
		{
			for (const order of query.orderBy)
			{
				this.validateIdentifier(order.field);
				if (order.direction)
				{
					this.validateDirection(order.direction);
				}
			}
		}

		// Validate JOIN
		if (query.joins)
		{
			for (const join of query.joins)
			{
				this.validateIdentifier(join.table);
				this.validateJoinType(join.type);
				this.validateConditionStructure(join.on);
			}
		}

		// Validate LIMIT and OFFSET
		if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 0))
		{
			throw new Error('Invalid LIMIT value');
		}
		if (query.offset !== undefined && (!Number.isInteger(query.offset) || query.offset < 0))
		{
			throw new Error('Invalid OFFSET value');
		}
	}

	/**
	 * Recursively validate condition structure
	 */
	private validateConditionStructure(condition: any): void
	{
		if (!condition) return;

		if (condition.and)
		{
			condition.and.forEach((c: any) => this.validateConditionStructure(c));
		} else if (condition.or)
		{
			condition.or.forEach((c: any) => this.validateConditionStructure(c));
		} else if (condition.not)
		{
			this.validateConditionStructure(condition.not);
		} else if (condition.field)
		{
			this.validateIdentifier(condition.field);
			if (condition.op)
			{
				this.validateOperator(condition.op);
			}
			if (condition.subquery)
			{
				this.validateQuery(condition.subquery);
			}
		} else if (condition.like)
		{
			this.validateIdentifier(condition.like.field);
		}
	}

	/**
	 * Connects to the PostgreSQL database using either a connection pool or a single connection.
	 */
	async connect(): Promise<void>
	{
		if (this.usePool)
		{
			const poolConfig = this.options.pool || {};
			const poolOptions: PoolConfig = {
				...this.options,
				max: poolConfig.max || 10,
				min: poolConfig.min || 0,
				idleTimeoutMillis: poolConfig.idleTimeoutMillis || 10000,
				connectionTimeoutMillis: poolConfig.connectionTimeoutMillis || 30000,
				allowExitOnIdle: poolConfig.allowExitOnIdle || false,
			};

			this.pool = new Pool(poolOptions);

			// Test the pool with a simple query
			try
			{
				const testClient = await this.pool.connect();
				await testClient.query('SELECT 1');
				testClient.release();
			}
			catch (error)
			{
				await this.pool.end();
				throw error;
			}
		}
		else
		{
			this.client = new Client(this.options);
			await this.client.connect();
		}
	}

	/**
	 * Closes the PostgreSQL connection or connection pool.
	 */
	async disconnect(): Promise<void>
	{
		if (this.pool)
		{
			await this.pool.end();
			this.pool = undefined;
		}
		else if (this.client)
		{
			await this.client.end();
			this.client = undefined;
		}
	}

	/**
	 * Gets the connection pool status.
	 * @returns Connection pool status or undefined if not using pooling.
	 */
	getPoolStatus(): ConnectionPoolStatus | undefined
	{
		if (!this.pool) return undefined;

		return {
			totalConnections: this.pool.totalCount,
			idleConnections: this.pool.idleCount,
			activeConnections: this.pool.totalCount - this.pool.idleCount,
			maxConnections: this.options.pool?.max || 10,
			minConnections: this.options.pool?.min || 0,
		};
	}

	/**
	 * Checks if the provider supports connection pooling.
	 * @returns Always true for PostgreSQL provider.
	 */
	supportsConnectionPooling(): boolean
	{
		return true;
	}

	/**
	 * Gets a connection from the pool or returns the single connection.
	 * @returns A connection instance.
	 */
	private async getConnection(): Promise<PoolClient | Client>
	{
		if (this.pool)
		{
			return await this.pool.connect();
		}
		else if (this.client)
		{
			return this.client;
		}
		else
		{
			throw new Error('Not connected');
		}
	}

	/**
	 * Releases a connection back to the pool (if pooling is enabled).
	 * @param connection The connection to release.
	 */
	private releaseConnection(connection: PoolClient | Client): void
	{
		if (this.pool && 'release' in connection)
		{
			// When using pool, the connection has a release method
			connection.release();
		}
		// For single connections, we don't release as they're reused
	}

	/**
	 * Builds the SQL and parameters for a SELECT query.
	 * @param query The query object.
	 */
	private buildSelectSQL(query: Query): { sql: string; params: any[] }
	{
		let sql = 'SELECT ';
		const params: any[] = [];
		let paramIndex = 1;

		// Validate and get safe table name
		const safeTableName = this.validateIdentifier(query.table);

		if (query.fields && query.fields.length > 0)
		{
			sql += query.fields.map(f =>
			{
				if (typeof f === 'string')
				{
					if (f === '*') return '*';
					const safeFieldName = this.validateIdentifier(f);
					return `"${safeFieldName}"`;
				} else
				{
					const safeType = this.validateIdentifier(f.type);
					const safeFieldName = this.validateIdentifier(f.field);
					const safeAlias = f.alias ? this.validateAlias(f.alias) : '';
					return `${safeType}("${safeFieldName}")${safeAlias ? ' AS "' + safeAlias + '"' : ''}`;
				}
			}).join(', ');
		} else
		{
			sql += '*';
		}
		sql += ` FROM "${safeTableName}"`;

		if (query.joins && query.joins.length > 0)
		{
			for (const join of query.joins)
			{
				const safeJoinType = this.validateJoinType(join.type);
				const safeJoinTable = this.validateIdentifier(join.table);
				const { conditionSql, usedParamIndex } = this.conditionToSQL(join.on, params, paramIndex);
				sql += ` ${safeJoinType} JOIN "${safeJoinTable}" ON ` + conditionSql;
				paramIndex = usedParamIndex;
			}
		}

		if (query.where)
		{
			const { conditionSql, usedParamIndex } = this.conditionToSQL(query.where, params, paramIndex);
			sql += ' WHERE ' + conditionSql;
			paramIndex = usedParamIndex;
		}

		if (query.groupBy && query.groupBy.length > 0)
		{
			const safeGroupBy = query.groupBy.map(f => this.validateIdentifier(f));
			sql += ' GROUP BY ' + safeGroupBy.map(f => `"${f}"`).join(', ');
		}

		if (query.orderBy && query.orderBy.length > 0)
		{
			sql += ' ORDER BY ' + query.orderBy.map(o =>
			{
				const safeField = this.validateIdentifier(o.field);
				const safeDirection = this.validateDirection(o.direction);
				return `"${safeField}" ${safeDirection}`;
			}).join(', ');
		}

		if (query.limit !== undefined && typeof query.limit === 'number' && query.limit > 0)
		{
			sql += ` LIMIT $${paramIndex++}`;
			params.push(query.limit);
		}

		if (query.offset !== undefined && typeof query.offset === 'number' && query.offset >= 0)
		{
			sql += ` OFFSET $${paramIndex++}`;
			params.push(query.offset);
		}

		return { sql, params };
	}

	/**
	 * Builds the SQL and parameters for an INSERT query.
	 * @param query The query object.
	 */
	private buildInsertSQL(query: Query): { sql: string; params: any[] }
	{
		if (!query.values) throw new Error('INSERT must have values');

		const safeTableName = this.validateIdentifier(query.table);
		const keys = Object.keys(query.values);
		const safeKeys = keys.map(k => this.validateIdentifier(k));

		const sql = `INSERT INTO "${safeTableName}" (${safeKeys.map(k => `"${k}"`).join(', ')}) VALUES (${keys.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING id`;
		const params = keys.map(k => query.values![k]);
		return { sql, params };
	}

	/**
	 * Builds the SQL and parameters for an UPDATE query.
	 * @param query The query object.
	 */
	private buildUpdateSQL(query: Query): { sql: string; params: any[] }
	{
		if (!query.values) throw new Error('UPDATE must have values');

		const safeTableName = this.validateIdentifier(query.table);
		const keys = Object.keys(query.values);
		const safeKeys = keys.map(k => this.validateIdentifier(k));

		let sql = `UPDATE "${safeTableName}" SET ` + safeKeys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
		const params = keys.map(k => query.values![k]);
		let paramIndex = params.length + 1;

		if (query.where)
		{
			const { conditionSql, usedParamIndex } = this.conditionToSQL(query.where, params, paramIndex);
			sql += ' WHERE ' + conditionSql;
			paramIndex = usedParamIndex;
		}

		return { sql, params };
	}

	/**
	 * Builds the SQL and parameters for a DELETE query.
	 * @param query The query object.
	 */
	private buildDeleteSQL(query: Query): { sql: string; params: any[] }
	{
		const safeTableName = this.validateIdentifier(query.table);
		let sql = `DELETE FROM "${safeTableName}"`;
		const params: any[] = [];
		let paramIndex = 1;

		if (query.where)
		{
			const { conditionSql, usedParamIndex } = this.conditionToSQL(query.where, params, paramIndex);
			sql += ' WHERE ' + conditionSql;
			paramIndex = usedParamIndex;
		}

		return { sql, params };
	}

	/**
	 * Converts a condition object into an SQL string and parameters.
	 * @param cond The condition object.
	 * @param params The array to which parameters will be added.
	 * @param paramIndex The current parameter index for PostgreSQL ($1, $2, etc.).
	 * @returns An object containing the SQL condition string and the next parameter index.
	 */
	private conditionToSQL(cond: Condition, params: any[], paramIndex: number): { conditionSql: string; usedParamIndex: number }
	{
		// Handle subquery conditions: { field, op: 'IN'|'NOT IN', subquery }
		if ('field' in cond && 'op' in cond && 'subquery' in cond)
		{
			// Only allow IN/NOT IN operators for subqueries
			const allowedOps = ['IN', 'NOT IN'];
			if (!allowedOps.includes(cond.op))
			{
				throw new Error(`Invalid operator: ${cond.op}`);
			}
			// Build the subquery into SQL and merge its parameters
			const { sql, params: subParams } = this.buildSelectSQL(cond.subquery);
			params.push(...subParams);
			// Re-index parameters in subquery to match PostgreSQL numbering
			const reindexedSql = this.reindexParameters(sql, paramIndex, subParams.length);
			const safeFieldName = this.validateIdentifier(cond.field);
			return {
				conditionSql: `"${safeFieldName}" ${cond.op} (${reindexedSql})`,
				usedParamIndex: paramIndex + subParams.length
			};
		}
		// Handle standard field comparisons: { field, op, value }
		else if ('field' in cond && 'op' in cond && 'value' in cond)
		{
			// Only allow basic comparison operators
			const allowedOps = ['=', '!=', '<', '<=', '>', '>='];
			if (!allowedOps.includes(cond.op))
			{
				throw new Error(`Invalid operator: ${cond.op}`);
			}
			const safeFieldName = this.validateIdentifier(cond.field);
			params.push(cond.value);
			return {
				conditionSql: `"${safeFieldName}" ${cond.op} $${paramIndex}`,
				usedParamIndex: paramIndex + 1
			};
		}
		// Handle IN/NOT IN conditions with an array of values: { field, op, values }
		else if ('field' in cond && 'op' in cond && 'values' in cond)
		{
			const allowedOps = ['IN', 'NOT IN'];
			if (!allowedOps.includes(cond.op))
			{
				throw new Error(`Invalid operator: ${cond.op}`);
			}
			const safeFieldName = this.validateIdentifier(cond.field);
			params.push(...cond.values);
			const placeholders = cond.values.map((_, i) => `$${paramIndex + i}`).join(', ');
			return {
				conditionSql: `"${safeFieldName}" ${cond.op} (${placeholders})`,
				usedParamIndex: paramIndex + cond.values.length
			};
		}
		// Handle an array of AND conditions
		else if ('and' in cond)
		{
			const conditions: string[] = [];
			let currentParamIndex = paramIndex;
			for (const c of cond.and)
			{
				const { conditionSql, usedParamIndex } = this.conditionToSQL(c, params, currentParamIndex);
				conditions.push(conditionSql);
				currentParamIndex = usedParamIndex;
			}
			return {
				conditionSql: '(' + conditions.join(' AND ') + ')',
				usedParamIndex: currentParamIndex
			};
		}
		// Handle an array of OR conditions
		else if ('or' in cond)
		{
			const conditions: string[] = [];
			let currentParamIndex = paramIndex;
			for (const c of cond.or)
			{
				const { conditionSql, usedParamIndex } = this.conditionToSQL(c, params, currentParamIndex);
				conditions.push(conditionSql);
				currentParamIndex = usedParamIndex;
			}
			return {
				conditionSql: '(' + conditions.join(' OR ') + ')',
				usedParamIndex: currentParamIndex
			};
		}
		// Handle a NOT condition
		else if ('not' in cond)
		{
			const { conditionSql, usedParamIndex } = this.conditionToSQL(cond.not, params, paramIndex);
			return {
				conditionSql: 'NOT (' + conditionSql + ')',
				usedParamIndex
			};
		}
		// Handle LIKE conditions: { like: { field, pattern } }
		else if ('like' in cond)
		{
			const safeFieldName = this.validateIdentifier(cond.like.field);
			params.push(cond.like.pattern);
			return {
				conditionSql: `"${safeFieldName}" LIKE $${paramIndex}`,
				usedParamIndex: paramIndex + 1
			};
		}
		// All other condition shapes are considered an error
		throw new Error('Unknown condition type');
	}

	/**
	 * Re-indexes parameter placeholders in a SQL string to match PostgreSQL numbering.
	 * @param sql The SQL string with parameter placeholders.
	 * @param startIndex The starting parameter index.
	 * @param paramCount The number of parameters to re-index.
	 * @returns The SQL string with re-indexed parameters.
	 */
	private reindexParameters(sql: string, startIndex: number, paramCount: number): string
	{
		let result = sql;
		for (let i = paramCount; i >= 1; i--)
		{
			result = result.replace(new RegExp(`\\$${i}`, 'g'), `$${startIndex + i - 1}`);
		}
		return result;
	}

	/**
	 * Executes a SELECT query using a query object.
	 * @param query The query object.
	 * @returns An array of results.
	 */
	private async find<T = any>(query: Query): Promise<T[]>
	{
		const connection = await this.getConnection();
		try
		{
			const { sql, params } = this.buildSelectSQL(query);
			const result = await connection.query(sql, params);
			return result.rows as T[];
		}
		finally
		{
			this.releaseConnection(connection);
		}
	}

	/**
	 * Executes an INSERT operation using a query object.
	 * @param query The query object.
	 * @returns The ID of the newly inserted row.
	 */
	private async insert(query: Query): Promise<number>
	{
		const connection = await this.getConnection();
		try
		{
			const { sql, params } = this.buildInsertSQL(query);
			const result = await connection.query(sql, params);
			return result.rows[0]?.id ?? 0;
		}
		finally
		{
			this.releaseConnection(connection);
		}
	}

	/**
	 * Executes an UPDATE operation using a query object.
	 * @param query The query object.
	 * @returns The number of affected rows.
	 */
	private async update(query: Query): Promise<number>
	{
		const connection = await this.getConnection();
		try
		{
			const { sql, params } = this.buildUpdateSQL(query);
			const result = await connection.query(sql, params);
			return result.rowCount ?? 0;
		}
		finally
		{
			this.releaseConnection(connection);
		}
	}

	/**
	 * Executes a DELETE operation using a query object.
	 * @param query The query object.
	 * @returns The number of affected rows.
	 */
	private async delete(query: Query): Promise<number>
	{
		const connection = await this.getConnection();
		try
		{
			const { sql, params } = this.buildDeleteSQL(query);
			const result = await connection.query(sql, params);
			return result.rowCount ?? 0;
		}
		finally
		{
			this.releaseConnection(connection);
		}
	}

	/**
	 * Generic query method that dispatches to the appropriate CRUD operation based on `query.type`.
	 * @param query The query object.
	 * @returns The query result, which may contain rows, an insertId, or the number of affected rows.
	 */
	async query<T = any>(query: Query): Promise<QueryResult<T>>
	{
		try
		{
			// Validate security before executing query
			this.validateQuery(query);

			switch (query.type)
			{
				case 'SELECT':
					return { rows: await this.find<T>(query) };

				case 'INSERT':
					return { insertId: await this.insert(query) };

				case 'UPDATE':
					return { affectedRows: await this.update(query) };

				case 'DELETE':
					return { affectedRows: await this.delete(query) };

				default:
					// Handle legacy RAW queries and unknown types
					if ((query as any).type === 'RAW')
					{
						return { error: '[PostgreSQLProvider.query] RAW queries are not supported for security reasons' };
					}
					return { error: '[PostgreSQLProvider.query] Unknown query type: ' + (query as any).type };
			}
		}
		catch (err)
		{
			return { error: `[PostgreSQLProvider.query] ${err instanceof Error ? err.message : String(err)}` };
		}
	}
}