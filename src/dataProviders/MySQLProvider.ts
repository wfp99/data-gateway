
import { DataProvider, ConnectionPoolStatus } from '../dataProvider';
import { Condition, Query, QueryResult } from '../queryObject';
import mysql, { Connection, ConnectionOptions, Pool, PoolOptions } from 'mysql2/promise';
import { getLogger } from '../logger';

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
	 * Logger instance for this provider.
	 */
	private readonly logger = getLogger('MySQLProvider');

	/**
	 * Constructor that takes connection options.
	 * @param options The MySQL provider options.
	 */
	constructor(options: MySQLProviderOptions)
	{
		this.options = options;
		this.usePool = options.pool?.usePool !== false; // Default to true
		this.logger.debug('MySQLProvider initialized', {
			host: options.host,
			database: options.database,
			usePool: this.usePool,
			connectionLimit: options.pool?.connectionLimit || 10
		});
	}

	/**
	 * Connects to the MySQL database using either a connection pool or a single connection.
	 */
	async connect(): Promise<void>
	{
		this.logger.debug('Connecting to MySQL database', { usePool: this.usePool });

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

			this.logger.debug('Creating MySQL connection pool', {
				connectionLimit: poolOptions.connectionLimit,
				queueLimit: poolOptions.queueLimit
			});

			this.pool = mysql.createPool(poolOptions);

			// Test the pool with a simple query if preConnect is enabled
			if (poolConfig.preConnect)
			{
				try
				{
					this.logger.debug('Testing connection pool with ping');
					const testConnection = await this.pool.getConnection();
					await testConnection.ping();
					testConnection.release();
					this.logger.debug('Connection pool test successful');
				}
				catch (error)
				{
					this.logger.error('Connection pool test failed', { error: error instanceof Error ? error.message : String(error) });
					await this.pool.end();
					throw error;
				}
			}

			this.logger.info('MySQL connection pool created successfully');
		}
		else
		{
			this.logger.debug('Creating single MySQL connection');
			this.connection = await mysql.createConnection(this.options);
			this.logger.info('MySQL single connection created successfully');
		}
	}

	/**
	 * Closes the MySQL connection or connection pool.
	 */
	async disconnect(): Promise<void>
	{
		this.logger.debug('Disconnecting from MySQL database');

		if (this.pool)
		{
			this.logger.debug('Closing connection pool');
			await this.pool.end();
			this.pool = undefined;
			this.logger.info('MySQL connection pool closed');
		}
		else if (this.connection)
		{
			this.logger.debug('Closing single connection');
			await this.connection.end();
			this.connection = undefined;
			this.logger.info('MySQL single connection closed');
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
		this.logger.debug('Validating SQL identifier', { identifier });

		// Only allow alphanumeric characters, underscores, and dots (for schema.table)
		if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(identifier))
		{
			this.logger.error('Invalid SQL identifier detected', { identifier, reason: 'Contains invalid characters' });
			throw new Error(`Invalid identifier: ${identifier}`);
		}

		this.logger.debug('SQL identifier validated successfully', { identifier });
		return identifier;
	}

	/**
	 * Validates an SQL alias.
	 * @param alias The alias to validate.
	 * @returns The validated alias.
	 */
	private validateAlias(alias: string): string
	{
		this.logger.debug('Validating SQL alias', { alias });

		// Only allow alphanumeric characters and underscores
		if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias))
		{
			this.logger.error('Invalid SQL alias detected', { alias, reason: 'Contains invalid characters' });
			throw new Error(`Invalid alias: ${alias}`);
		}

		this.logger.debug('SQL alias validated successfully', { alias });
		return alias;
	}

	/**
	 * Validates ORDER BY direction.
	 * @param direction The direction to validate.
	 * @returns The validated direction.
	 */
	private validateDirection(direction: string): string
	{
		this.logger.debug('Validating ORDER BY direction', { direction });

		const validDirections = ['ASC', 'DESC'];
		if (!validDirections.includes(direction.toUpperCase()))
		{
			this.logger.error('Invalid ORDER BY direction detected', { direction, validDirections });
			throw new Error(`Invalid ORDER BY direction: ${direction}`);
		}

		const validatedDirection = direction.toUpperCase();
		this.logger.debug('ORDER BY direction validated successfully', { direction: validatedDirection });
		return validatedDirection;
	}

	/**
	 * Validates JOIN type.
	 * @param joinType The JOIN type to validate.
	 * @returns The validated JOIN type.
	 */
	private validateJoinType(joinType: string): string
	{
		this.logger.debug('Validating JOIN type', { joinType });

		const validJoinTypes = ['INNER', 'LEFT', 'RIGHT', 'FULL'];
		if (!validJoinTypes.includes(joinType.toUpperCase()))
		{
			this.logger.error('Invalid JOIN type detected', { joinType, validJoinTypes });
			throw new Error(`Invalid JOIN type: ${joinType}`);
		}

		const validatedJoinType = joinType.toUpperCase();
		this.logger.debug('JOIN type validated successfully', { joinType: validatedJoinType });
		return validatedJoinType;
	}

	/**
	 * Builds the SQL and parameters for a SELECT query.
	 * @param query The query object.
	 */
	private buildSelectSQL(query: Query): { sql: string; params: any[] }
	{
		this.logger.debug('Building SELECT SQL statement', { table: query.table, fields: query.fields });

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

		this.logger.debug('SELECT SQL statement built successfully', { sql, paramCount: params.length });
		return { sql, params };
	}

	/**
	 * Builds the SQL and parameters for an INSERT query.
	 * @param query The query object.
	 */
	private buildInsertSQL(query: Query): { sql: string; params: any[] }
	{
		this.logger.debug('Building INSERT SQL statement', { table: query.table, values: query.values });

		if (!query.values) {
			this.logger.error('INSERT query missing values', { table: query.table });
			throw new Error('INSERT must have values');
		}

		const tableName = this.validateIdentifier(query.table);
		const keys = Object.keys(query.values);

		// Validate all column names
		const validatedKeys = keys.map(k => this.validateIdentifier(k));

		const sql = `INSERT INTO \`${tableName}\` (${validatedKeys.map(k => `\`${k}\``).join(', ')}) VALUES (${keys.map(_ => '?').join(', ')})`;
		const params = keys.map(k => query.values![k]);

		this.logger.debug('INSERT SQL statement built successfully', { sql, paramCount: params.length, columns: validatedKeys });
		return { sql, params };
	}

	/**
	 * Builds the SQL and parameters for an UPDATE query.
	 * @param query The query object.
	 */
	private buildUpdateSQL(query: Query): { sql: string; params: any[] }
	{
		this.logger.debug('Building UPDATE SQL statement', { table: query.table, values: query.values, where: query.where });

		if (!query.values) {
			this.logger.error('UPDATE query missing values', { table: query.table });
			throw new Error('UPDATE must have values');
		}

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

		this.logger.debug('UPDATE SQL statement built successfully', { sql, paramCount: params.length, columns: validatedKeys });
		return { sql, params };
	}

	/**
	 * Builds the SQL and parameters for a DELETE query.
	 * @param query The query object.
	 */
	private buildDeleteSQL(query: Query): { sql: string; params: any[] }
	{
		this.logger.debug('Building DELETE SQL statement', { table: query.table, where: query.where });

		const tableName = this.validateIdentifier(query.table);
		let sql = `DELETE FROM \`${tableName}\``;
		const params: any[] = [];
		if (query.where)
		{
			sql += ' WHERE ' + this.conditionToSQL(query.where, params);
		}

		this.logger.debug('DELETE SQL statement built successfully', { sql, paramCount: params.length });
		return { sql, params };
	}

	/**
	 * Converts a condition object into an SQL string and parameters.
	 * @param cond The condition object.
	 * @param params The array to which parameters will be added.
	 */
	private conditionToSQL(cond: Condition, params: any[]): string
	{
		this.logger.debug('Converting condition to SQL', { condition: cond });

		// Handle subquery conditions: { field, op: 'IN'|'NOT IN', subquery }
		if ('field' in cond && 'op' in cond && 'subquery' in cond)
		{
			// Only allow IN/NOT IN operators for subqueries
			const allowedOps = ['IN', 'NOT IN'];
			if (!allowedOps.includes(cond.op))
			{
				this.logger.error('Invalid operator for subquery condition', { operator: cond.op, allowedOps });
				throw new Error(`Invalid operator: ${cond.op}`);
			}
			// Build the subquery into SQL and merge its parameters
			const { sql, params: subParams } = this.buildSelectSQL(cond.subquery);
			params.push(...subParams);
			const fieldName = this.validateIdentifier(cond.field);
			const result = `\`${fieldName}\` ${cond.op} (${sql})`;
			this.logger.debug('Subquery condition converted to SQL', { result });
			return result;
		}
		// Handle standard field comparisons: { field, op, value }
		else if ('field' in cond && 'op' in cond && 'value' in cond)
		{
			// Only allow basic comparison operators
			const allowedOps = ['=', '!=', '<', '<=', '>', '>='];
			if (!allowedOps.includes(cond.op))
			{
				this.logger.error('Invalid comparison operator', { operator: cond.op, allowedOps });
				throw new Error(`Invalid operator: ${cond.op}`);
			}
			// Validate field name
			const fieldName = this.validateIdentifier(cond.field);
			params.push(cond.value);
			const result = `\`${fieldName}\` ${cond.op} ?`;
			this.logger.debug('Field comparison condition converted to SQL', { result });
			return result;
		}
		// Handle IN/NOT IN conditions with an array of values: { field, op, values }
		else if ('field' in cond && 'op' in cond && 'values' in cond)
		{
			const allowedOps = ['IN', 'NOT IN'];
			if (!allowedOps.includes(cond.op))
			{
				this.logger.error('Invalid IN/NOT IN operator', { operator: cond.op, allowedOps });
				throw new Error(`Invalid operator: ${cond.op}`);
			}
			const fieldName = this.validateIdentifier(cond.field);
			params.push(...cond.values);
			const result = `\`${fieldName}\` ${cond.op} (${cond.values.map(() => '?').join(', ')})`;
			this.logger.debug('IN/NOT IN condition converted to SQL', { result, valueCount: cond.values.length });
			return result;
		}
		// Handle an array of AND conditions
		else if ('and' in cond)
		{
			this.logger.debug('Processing AND condition', { conditionCount: cond.and.length });
			const result = '(' + cond.and.map((c) => this.conditionToSQL(c, params)).join(' AND ') + ')';
			this.logger.debug('AND condition converted to SQL', { result });
			return result;
		}
		// Handle an array of OR conditions
		else if ('or' in cond)
		{
			this.logger.debug('Processing OR condition', { conditionCount: cond.or.length });
			const result = '(' + cond.or.map((c) => this.conditionToSQL(c, params)).join(' OR ') + ')';
			this.logger.debug('OR condition converted to SQL', { result });
			return result;
		}
		// Handle a NOT condition
		else if ('not' in cond)
		{
			this.logger.debug('Processing NOT condition');
			const result = 'NOT (' + this.conditionToSQL(cond.not, params) + ')';
			this.logger.debug('NOT condition converted to SQL', { result });
			return result;
		}
		// Handle LIKE conditions: { like: { field, pattern } }
		else if ('like' in cond)
		{
			this.logger.debug('Processing LIKE condition', { field: cond.like.field, pattern: cond.like.pattern });
			const fieldName = this.validateIdentifier(cond.like.field);
			params.push(cond.like.pattern);
			const result = `\`${fieldName}\` LIKE ?`;
			this.logger.debug('LIKE condition converted to SQL', { result });
			return result;
		}
		// All other condition shapes are considered an error
		this.logger.error('Unknown condition type detected', { condition: cond });
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
		this.logger.debug('Executing MySQL query', { type: query.type, table: query.table });

		try
		{
			// Validate query structure before processing
			this.validateQuery(query);

			switch (query.type)
			{
				case 'SELECT':
					const rows = await this.find<T>(query);
					this.logger.debug('SELECT query completed', { table: query.table, rowCount: rows.length });
					return { rows };

				case 'INSERT':
					const insertId = await this.insert(query);
					this.logger.info('INSERT query completed', { table: query.table, insertId });
					return { insertId };

				case 'UPDATE':
					const updatedRows = await this.update(query);
					this.logger.info('UPDATE query completed', { table: query.table, affectedRows: updatedRows });
					return { affectedRows: updatedRows };

				case 'DELETE':
					const deletedRows = await this.delete(query);
					this.logger.info('DELETE query completed', { table: query.table, affectedRows: deletedRows });
					return { affectedRows: deletedRows };

				default:
					// Handle legacy RAW queries and unknown types
					if ((query as any).type === 'RAW')
					{
						const errorMsg = '[MySQLProvider.query] RAW queries are not supported for security reasons';
						this.logger.error(errorMsg);
						return { error: errorMsg };
					}
					const unknownTypeError = '[MySQLProvider.query] Unknown query type: ' + (query as any).type;
					this.logger.error(unknownTypeError, { type: (query as any).type });
					return { error: unknownTypeError };
			}
		}
		catch (err)
		{
			const errorMsg = `[MySQLProvider.query] ${err instanceof Error ? err.message : String(err)}`;
			this.logger.error(errorMsg, { type: query.type, table: query.table });
			return { error: errorMsg };
		}
	}

	/**
	 * Validates query structure for security.
	 * @param query The query object to validate.
	 */
	private validateQuery(query: Query): void
	{
		this.logger.debug('Validating query structure', { type: query.type, table: query.table });

		// Validate table name
		this.validateIdentifier(query.table);

		// Validate fields
		if (query.fields)
		{
			this.logger.debug('Validating query fields', { fieldCount: query.fields.length });
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
						this.logger.error('Invalid aggregate type detected', { aggregateType: field.type, validAggregates });
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
			this.logger.debug('Validating WHERE condition');
			this.validateCondition(query.where);
		}

		// Validate values (for INSERT/UPDATE)
		if (query.values)
		{
			this.logger.debug('Validating query values', { columnCount: Object.keys(query.values).length });
			for (const key of Object.keys(query.values))
			{
				this.validateIdentifier(key);
			}
		}

		this.logger.debug('Query structure validation completed successfully', { type: query.type, table: query.table });
	}

	/**
	 * Validates a condition recursively.
	 * @param condition The condition to validate.
	 */
	private validateCondition(condition: any): void
	{
		this.logger.debug('Validating condition structure', { conditionType: Object.keys(condition) });

		if ('field' in condition)
		{
			this.validateIdentifier(condition.field);
		}
		if ('and' in condition)
		{
			this.logger.debug('Validating AND condition', { subconditionCount: condition.and.length });
			for (const cond of condition.and)
			{
				this.validateCondition(cond);
			}
		}
		if ('or' in condition)
		{
			this.logger.debug('Validating OR condition', { subconditionCount: condition.or.length });
			for (const cond of condition.or)
			{
				this.validateCondition(cond);
			}
		}
		if ('not' in condition)
		{
			this.logger.debug('Validating NOT condition');
			this.validateCondition(condition.not);
		}
		if ('like' in condition)
		{
			this.logger.debug('Validating LIKE condition', { field: condition.like.field });
			this.validateIdentifier(condition.like.field);
		}
		if ('subquery' in condition)
		{
			this.validateQuery(condition.subquery);
		}
	}
}
