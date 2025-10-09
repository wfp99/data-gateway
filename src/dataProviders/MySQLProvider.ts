
import { DataProvider, ConnectionPoolStatus } from '../dataProvider';
import { Condition, Query, QueryResult } from '../queryObject';
import mysql, { Connection, ConnectionOptions, Pool, PoolOptions } from 'mysql2/promise';

/**
 * Connection pool configuration options.
 */
export interface ConnectionPoolConfig
{
	/** Whether to use connection pooling (default: true) */
	usePool?: boolean;
	/** Maximum number of connections in the pool (default: 10) */
	connectionLimit?: number;
	/** Maximum number of connection requests in the queue (default: 0, no limit) */
	queueLimit?: number;
	/** Timeout for acquiring a connection in milliseconds (default: 60000) */
	acquireTimeout?: number;
	/** Timeout for idle connections in milliseconds (default: 600000) */
	timeout?: number;
	/** Whether to create connections immediately (default: false) */
	preConnect?: boolean;
}

/**
 * MySQL connection options, extending `ConnectionOptions` from `mysql2/promise` with pool configuration.
 */
export interface MySQLProviderOptions extends ConnectionOptions
{
	/** Connection pool configuration */
	pool?: ConnectionPoolConfig;
}

/**
 * A MySQL data provider that implements the `DataProvider` interface,
 * supporting MySQL operations through a query object model with connection pooling support.
 */
export class MySQLProvider implements DataProvider
{
	/**
	 * The MySQL connection instance (used when pooling is disabled).
	 */
	private connection?: Connection;

	/**
	 * The MySQL connection pool instance (used when pooling is enabled).
	 */
	private pool?: Pool;

	/**
	 * The connection options.
	 */
	private readonly options: MySQLProviderOptions;

	/**
	 * Whether connection pooling is enabled.
	 */
	private readonly usePool: boolean;

	/**
	 * Constructor that takes connection options.
	 * @param options The MySQL provider options.
	 */
	constructor(options: MySQLProviderOptions)
	{
		this.options = options;
		this.usePool = options.pool?.usePool !== false; // Default to true
	}

	/**
	 * Connects to the MySQL database using either a connection pool or a single connection.
	 */
	async connect(): Promise<void>
	{
		if (this.usePool)
		{
			const poolConfig = this.options.pool || {};
			const poolOptions: PoolOptions = {
				...this.options,
				connectionLimit: poolConfig.connectionLimit || 10,
				queueLimit: poolConfig.queueLimit || 0,
			};

			// Add optional pool-specific configurations if they exist in mysql2
			if (poolConfig.acquireTimeout !== undefined)
			{
				(poolOptions as any).acquireTimeout = poolConfig.acquireTimeout;
			}
			if (poolConfig.timeout !== undefined)
			{
				(poolOptions as any).idleTimeout = poolConfig.timeout;
			}

			this.pool = mysql.createPool(poolOptions);

			// Test the pool with a simple query if preConnect is enabled
			if (poolConfig.preConnect)
			{
				try
				{
					const testConnection = await this.pool.getConnection();
					await testConnection.ping();
					testConnection.release();
				}
				catch (error)
				{
					await this.pool.end();
					throw error;
				}
			}
		}
		else
		{
			this.connection = await mysql.createConnection(this.options);
		}
	}

	/**
	 * Closes the MySQL connection or connection pool.
	 */
	async disconnect(): Promise<void>
	{
		if (this.pool)
		{
			await this.pool.end();
			this.pool = undefined;
		}
		else if (this.connection)
		{
			await this.connection.end();
			this.connection = undefined;
		}
	}

	/**
	 * Gets the connection pool status.
	 * @returns Connection pool status or undefined if not using pooling.
	 */
	getPoolStatus(): ConnectionPoolStatus | undefined
	{
		if (!this.pool) return undefined;

		// Access pool statistics from mysql2
		const pool = this.pool as any;
		const poolCluster = pool._allConnections || [];
		const freeConnections = pool._freeConnections || [];

		return {
			totalConnections: poolCluster.length || 0,
			idleConnections: freeConnections.length || 0,
			activeConnections: Math.max(0, (poolCluster.length || 0) - (freeConnections.length || 0)),
			maxConnections: this.options.pool?.connectionLimit || 10,
			minConnections: 0, // mysql2 doesn't have a minimum connection concept
		};
	}

	/**
	 * Checks if the provider supports connection pooling.
	 * @returns Always true for MySQL provider.
	 */
	supportsConnectionPooling(): boolean
	{
		return true;
	}

	/**
	 * Gets a connection from the pool or returns the single connection.
	 * @returns A connection instance.
	 */
	private async getConnection(): Promise<Connection>
	{
		if (this.pool)
		{
			return await this.pool.getConnection();
		}
		else if (this.connection)
		{
			return this.connection;
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
	private releaseConnection(connection: Connection): void
	{
		if (this.pool)
		{
			// When using pool, the connection has a release method
			(connection as any).release();
		}
		// For single connections, we don't release as they're reused
	}

	/**
	 * Validates and escapes a database identifier (table name, column name).
	 * @param identifier The identifier to validate.
	 * @returns The validated identifier.
	 */
	private validateIdentifier(identifier: string): string
	{
		// Only allow alphanumeric characters, underscores, and dots (for schema.table)
		if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(identifier))
		{
			throw new Error(`Invalid identifier: ${identifier}`);
		}
		return identifier;
	}

	/**
	 * Validates an SQL alias.
	 * @param alias The alias to validate.
	 * @returns The validated alias.
	 */
	private validateAlias(alias: string): string
	{
		// Only allow alphanumeric characters and underscores
		if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias))
		{
			throw new Error(`Invalid alias: ${alias}`);
		}
		return alias;
	}

	/**
	 * Validates ORDER BY direction.
	 * @param direction The direction to validate.
	 * @returns The validated direction.
	 */
	private validateDirection(direction: string): string
	{
		const validDirections = ['ASC', 'DESC'];
		if (!validDirections.includes(direction.toUpperCase()))
		{
			throw new Error(`Invalid ORDER BY direction: ${direction}`);
		}
		return direction.toUpperCase();
	}

	/**
	 * Validates JOIN type.
	 * @param joinType The JOIN type to validate.
	 * @returns The validated JOIN type.
	 */
	private validateJoinType(joinType: string): string
	{
		const validJoinTypes = ['INNER', 'LEFT', 'RIGHT', 'FULL'];
		if (!validJoinTypes.includes(joinType.toUpperCase()))
		{
			throw new Error(`Invalid JOIN type: ${joinType}`);
		}
		return joinType.toUpperCase();
	}

	/**
	 * Builds the SQL and parameters for a SELECT query.
	 * @param query The query object.
	 */
	private buildSelectSQL(query: Query): { sql: string; params: any[] }
	{
		let sql = 'SELECT ';
		const params: any[] = [];

		// Validate table name
		const tableName = this.validateIdentifier(query.table);

		if (query.fields && query.fields.length > 0)
		{
			sql += query.fields.map(f =>
			{
				if (typeof f === 'string')
				{
					const fieldName = this.validateIdentifier(f);
					return `\`${fieldName}\``;
				}
				else
				{
					// Validate aggregate type
					const validAggregates = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
					if (!validAggregates.includes(f.type))
					{
						throw new Error(`Invalid aggregate type: ${f.type}`);
					}
					const fieldName = this.validateIdentifier(f.field);
					const alias = f.alias ? this.validateAlias(f.alias) : '';
					return `${f.type}(\`${fieldName}\`)${alias ? ' AS `' + alias + '`' : ''}`;
				}
			}).join(', ');
		} else
		{
			sql += '*';
		}
		sql += ` FROM \`${tableName}\``;
		if (query.joins && query.joins.length > 0)
		{
			for (const join of query.joins)
			{
				const joinType = this.validateJoinType(join.type);
				const joinTable = this.validateIdentifier(join.table);
				sql += ` ${joinType} JOIN \`${joinTable}\` ON ` + this.conditionToSQL(join.on, params);
			}
		}
		if (query.where)
		{
			sql += ' WHERE ' + this.conditionToSQL(query.where, params);
		}
		if (query.groupBy && query.groupBy.length > 0)
		{
			const validatedGroupBy = query.groupBy.map(f => this.validateIdentifier(f));
			sql += ' GROUP BY ' + validatedGroupBy.map(f => `\`${f}\``).join(', ');
		}
		if (query.orderBy && query.orderBy.length > 0)
		{
			sql += ' ORDER BY ' + query.orderBy.map(o =>
			{
				const fieldName = this.validateIdentifier(o.field);
				const direction = this.validateDirection(o.direction);
				return `\`${fieldName}\` ${direction}`;
			}).join(', ');
		}
		if (query.limit !== undefined && typeof query.limit === 'number' && query.limit > 0)
		{
			sql += ` LIMIT ?`;
			params.push(query.limit);
		}
		if (query.offset !== undefined && typeof query.offset === 'number' && query.offset >= 0)
		{
			sql += ` OFFSET ?`;
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

		const tableName = this.validateIdentifier(query.table);
		const keys = Object.keys(query.values);

		// Validate all column names
		const validatedKeys = keys.map(k => this.validateIdentifier(k));

		const sql = `INSERT INTO \`${tableName}\` (${validatedKeys.map(k => `\`${k}\``).join(', ')}) VALUES (${keys.map(_ => '?').join(', ')})`;
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

		const tableName = this.validateIdentifier(query.table);
		const keys = Object.keys(query.values);

		// Validate all column names
		const validatedKeys = keys.map(k => this.validateIdentifier(k));

		let sql = `UPDATE \`${tableName}\` SET ` + validatedKeys.map(k => `\`${k}\` = ?`).join(', ');
		const params = keys.map(k => query.values![k]);
		if (query.where)
		{
			sql += ' WHERE ' + this.conditionToSQL(query.where, params);
		}
		return { sql, params };
	}

	/**
	 * Builds the SQL and parameters for a DELETE query.
	 * @param query The query object.
	 */
	private buildDeleteSQL(query: Query): { sql: string; params: any[] }
	{
		const tableName = this.validateIdentifier(query.table);
		let sql = `DELETE FROM \`${tableName}\``;
		const params: any[] = [];
		if (query.where)
		{
			sql += ' WHERE ' + this.conditionToSQL(query.where, params);
		}
		return { sql, params };
	}

	/**
	 * Converts a condition object into an SQL string and parameters.
	 * @param cond The condition object.
	 * @param params The array to which parameters will be added.
	 */
	private conditionToSQL(cond: Condition, params: any[]): string
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
			const fieldName = this.validateIdentifier(cond.field);
			return `\`${fieldName}\` ${cond.op} (${sql})`;
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
			// Validate field name
			const fieldName = this.validateIdentifier(cond.field);
			params.push(cond.value);
			return `\`${fieldName}\` ${cond.op} ?`;
		}
		// Handle IN/NOT IN conditions with an array of values: { field, op, values }
		else if ('field' in cond && 'op' in cond && 'values' in cond)
		{
			const allowedOps = ['IN', 'NOT IN'];
			if (!allowedOps.includes(cond.op))
			{
				throw new Error(`Invalid operator: ${cond.op}`);
			}
			const fieldName = this.validateIdentifier(cond.field);
			params.push(...cond.values);
			return `\`${fieldName}\` ${cond.op} (${cond.values.map(() => '?').join(', ')})`;
		}
		// Handle an array of AND conditions
		else if ('and' in cond)
		{
			return '(' + cond.and.map((c) => this.conditionToSQL(c, params)).join(' AND ') + ')';
		}
		// Handle an array of OR conditions
		else if ('or' in cond)
		{
			return '(' + cond.or.map((c) => this.conditionToSQL(c, params)).join(' OR ') + ')';
		}
		// Handle a NOT condition
		else if ('not' in cond)
		{
			return 'NOT (' + this.conditionToSQL(cond.not, params) + ')';
		}
		// Handle LIKE conditions: { like: { field, pattern } }
		else if ('like' in cond)
		{
			const fieldName = this.validateIdentifier(cond.like.field);
			params.push(cond.like.pattern);
			return `\`${fieldName}\` LIKE ?`;
		}
		// All other condition shapes are considered an error
		throw new Error('Unknown condition type');
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
			const [rows] = await connection.execute(sql, params);
			return rows as T[];
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
			const [result] = await connection.execute(sql, params);
			return (result as mysql.ResultSetHeader).insertId ?? 0;
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
			const [result] = await connection.execute(sql, params);
			return (result as mysql.ResultSetHeader).affectedRows ?? 0;
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
			const [result] = await connection.execute(sql, params);
			return (result as mysql.ResultSetHeader).affectedRows ?? 0;
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
			// Validate query structure before processing
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
						return { error: '[MySQLProvider.query] RAW queries are not supported for security reasons' };
					}
					return { error: '[MySQLProvider.query] Unknown query type: ' + (query as any).type };
			}
		}
		catch (err)
		{
			return { error: `[MySQLProvider.query] ${err instanceof Error ? err.message : String(err)}` };
		}
	}

	/**
	 * Validates query structure for security.
	 * @param query The query object to validate.
	 */
	private validateQuery(query: Query): void
	{
		// Validate table name
		this.validateIdentifier(query.table);

		// Validate fields
		if (query.fields)
		{
			for (const field of query.fields)
			{
				if (typeof field === 'string')
				{
					this.validateIdentifier(field);
				}
				else
				{
					// Validate aggregate
					const validAggregates = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
					if (!validAggregates.includes(field.type))
					{
						throw new Error(`Invalid aggregate type: ${field.type}`);
					}
					this.validateIdentifier(field.field);
					if (field.alias)
					{
						this.validateAlias(field.alias);
					}
				}
			}
		}

		// Validate ORDER BY
		if (query.orderBy)
		{
			for (const order of query.orderBy)
			{
				this.validateIdentifier(order.field);
				this.validateDirection(order.direction);
			}
		}

		// Validate GROUP BY
		if (query.groupBy)
		{
			for (const field of query.groupBy)
			{
				this.validateIdentifier(field);
			}
		}

		// Validate JOINs
		if (query.joins)
		{
			for (const join of query.joins)
			{
				this.validateJoinType(join.type);
				this.validateIdentifier(join.table);
				this.validateCondition(join.on);
			}
		}

		// Validate WHERE condition
		if (query.where)
		{
			this.validateCondition(query.where);
		}

		// Validate values (for INSERT/UPDATE)
		if (query.values)
		{
			for (const key of Object.keys(query.values))
			{
				this.validateIdentifier(key);
			}
		}
	}

	/**
	 * Validates a condition recursively.
	 * @param condition The condition to validate.
	 */
	private validateCondition(condition: any): void
	{
		if ('field' in condition)
		{
			this.validateIdentifier(condition.field);
		}
		if ('and' in condition)
		{
			for (const cond of condition.and)
			{
				this.validateCondition(cond);
			}
		}
		if ('or' in condition)
		{
			for (const cond of condition.or)
			{
				this.validateCondition(cond);
			}
		}
		if ('not' in condition)
		{
			this.validateCondition(condition.not);
		}
		if ('like' in condition)
		{
			this.validateIdentifier(condition.like.field);
		}
		if ('subquery' in condition)
		{
			this.validateQuery(condition.subquery);
		}
	}
}
