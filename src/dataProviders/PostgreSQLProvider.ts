import { DataProvider, ConnectionPoolStatus } from '../dataProvider';
import { Condition, Query, QueryResult, fieldRefToString, FieldReference, Aggregate } from '../queryObject';
import { Pool, PoolClient, PoolConfig, Client, ClientConfig } from 'pg';
import { getLogger } from '../logger';
import { SQLValidator } from './sqlValidator';
import { PostgreSQLEscaper } from './sqlEscaper';
import { PreparedQuery } from '../preparedQuery';

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
	 * Logger instance for this provider.
	 */
	private readonly logger = getLogger('PostgreSQLProvider');

	/**
	 * SQL escaper for PostgreSQL identifiers.
	 */
	private readonly escaper = new PostgreSQLEscaper();

	/**
	 * Constructor that takes connection options.
	 * @param options The PostgreSQL provider options.
	 */
	constructor(options: PostgreSQLProviderOptions)
	{
		this.options = options;
		this.usePool = options.pool?.usePool !== false; // Default to true
		this.logger.debug('PostgreSQLProvider initialized', {
			host: options.host,
			database: options.database,
			usePool: this.usePool,
			max: options.pool?.max || 10
		});
	}



	/**
	 * Validate the security of query objects
	 * @param query The query object.
	 */
	private validateQuery(query: Query): void
	{
		this.logger.debug('Validating PostgreSQL query structure', { type: query.type, table: query.table });
		SQLValidator.validateQuery(query);
		this.logger.debug('PostgreSQL query structure validation completed successfully', { type: query.type, table: query.table });
	}

	/**
	 * Recursively validate condition structure
	 * @param condition The condition object.
	 */
	private validateConditionStructure(condition: any): void
	{
		if (!condition) return;
		this.logger.debug('Validating PostgreSQL condition structure', { conditionType: Object.keys(condition) });
		SQLValidator.validateCondition(condition);
	}

	/**
	 * Connects to the PostgreSQL database using either a connection pool or a single client.
	 */
	async connect(): Promise<void>
	{
		this.logger.debug('Connecting to PostgreSQL database', { usePool: this.usePool });

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

			this.logger.debug('Creating PostgreSQL connection pool', {
				max: poolOptions.max,
				min: poolOptions.min,
				idleTimeoutMillis: poolOptions.idleTimeoutMillis
			});

			this.pool = new Pool(poolOptions);

			// Test the pool with a simple query
			try
			{
				this.logger.debug('Testing connection pool with simple query');
				const testClient = await this.pool.connect();
				await testClient.query('SELECT 1');
				testClient.release();
				this.logger.info('PostgreSQL connection pool created successfully');
			}
			catch (error)
			{
				this.logger.error('Connection pool test failed', { error: error instanceof Error ? error.message : String(error) });
				await this.pool.end();
				throw error;
			}
		}
		else
		{
			this.logger.debug('Creating single PostgreSQL client');
			this.client = new Client(this.options);
			await this.client.connect();
			this.logger.info('PostgreSQL single client connected successfully');
		}
	}	/**
	 * Closes the PostgreSQL connection or connection pool.
	 */
	async disconnect(): Promise<void>
	{
		this.logger.debug('Disconnecting from PostgreSQL database');

		if (this.pool)
		{
			this.logger.debug('Ending connection pool');
			await this.pool.end();
			this.pool = undefined;
			this.logger.info('Connection pool ended successfully');
		}
		else if (this.client)
		{
			this.logger.debug('Ending client connection');
			await this.client.end();
			this.client = undefined;
			this.logger.info('Client connection ended successfully');
		}

		this.logger.info('PostgreSQL database disconnected');
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
		const safeTableName = SQLValidator.validateIdentifier(query.table);

		if (query.fields && query.fields.length > 0)
		{
			sql += query.fields.map(f =>
			{
				// Check if it's an Aggregate (has 'type' property that's a valid aggregate function)
				if (typeof f === 'object' && f !== null && 'type' in f)
				{
					const validAggregates = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
					const fieldType = (f as any).type;
					if (validAggregates.includes(fieldType))
					{
						// It's an Aggregate
						const aggregate = f as Aggregate;
						const safeType = SQLValidator.validateIdentifier(aggregate.type);
						const safeFieldName = SQLValidator.validateIdentifier(fieldRefToString(aggregate.field));
						const safeAlias = aggregate.alias ? SQLValidator.validateAlias(aggregate.alias) : '';
						return `${safeType}(${this.escaper.escapeIdentifier(safeFieldName)})${safeAlias ? ' AS "' + safeAlias + '"' : ''}`;
					}
					else
					{
						// It's a FieldReference object
						const fieldRefStr = fieldRefToString(f as FieldReference);
						if (fieldRefStr === '*') return '*';
						const safeFieldName = SQLValidator.validateIdentifier(fieldRefStr);
						return this.escaper.escapeIdentifier(safeFieldName);
					}
				}
				else
				{
					// It's a string FieldReference
					const fieldRefStr = fieldRefToString(f as FieldReference);
					if (fieldRefStr === '*') return '*';
					const safeFieldName = SQLValidator.validateIdentifier(fieldRefStr);
					return this.escaper.escapeIdentifier(safeFieldName);
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
				if ('table' in join.source)
				{
					const safeJoinType = SQLValidator.validateJoinType(join.type);
					const safeJoinTable = SQLValidator.validateIdentifier(join.source.table!);
					const { conditionSql, usedParamIndex } = this.conditionToSQL(join.on, params, paramIndex);
					sql += ` ${safeJoinType} JOIN "${safeJoinTable}" ON ` + conditionSql;
					paramIndex = usedParamIndex;
				}
				else
				{
					this.logger.error('JOIN source must specify a table name', { joinSource: join.source });
					throw new Error('JOIN source must specify a table name');
				}
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
			const safeGroupBy = query.groupBy.map(f => SQLValidator.validateIdentifier(fieldRefToString(f)));
			sql += ' GROUP BY ' + safeGroupBy.map(f => this.escaper.escapeIdentifier(f)).join(', ');
		}

		if (query.orderBy && query.orderBy.length > 0)
		{
			sql += ' ORDER BY ' + query.orderBy.map(o =>
			{
				const safeField = SQLValidator.validateIdentifier(fieldRefToString(o.field));
				const safeDirection = SQLValidator.validateDirection(o.direction);
				return `${this.escaper.escapeIdentifier(safeField)} ${safeDirection}`;
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

		const safeTableName = SQLValidator.validateIdentifier(query.table);
		const keys = Object.keys(query.values);
		const safeKeys = keys.map(k => SQLValidator.validateIdentifier(k));

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

		const safeTableName = SQLValidator.validateIdentifier(query.table);
		const keys = Object.keys(query.values);
		const safeKeys = keys.map(k => SQLValidator.validateIdentifier(k));

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
		const safeTableName = SQLValidator.validateIdentifier(query.table);
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
			const safeFieldName = SQLValidator.validateIdentifier(fieldRefToString(cond.field));
			return {
				conditionSql: `${this.escaper.escapeIdentifier(safeFieldName)} ${cond.op} (${reindexedSql})`,
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
			const safeFieldName = SQLValidator.validateIdentifier(fieldRefToString(cond.field));
			params.push(cond.value);
			return {
				conditionSql: `${this.escaper.escapeIdentifier(safeFieldName)} ${cond.op} $${paramIndex}`,
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
			const safeFieldName = SQLValidator.validateIdentifier(fieldRefToString(cond.field));
			params.push(...cond.values);
			const placeholders = cond.values.map((_, i) => `$${paramIndex + i}`).join(', ');
			return {
				conditionSql: `${this.escaper.escapeIdentifier(safeFieldName)} ${cond.op} (${placeholders})`,
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
			const safeFieldName = SQLValidator.validateIdentifier(fieldRefToString(cond.like.field));
			params.push(cond.like.pattern);
			return {
				conditionSql: `${this.escaper.escapeIdentifier(safeFieldName)} LIKE $${paramIndex}`,
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
		this.logger.debug('Executing PostgreSQL query', { type: query.type, table: query.table });

		try
		{
			// Validate security before executing query
			this.validateQuery(query);

			switch (query.type)
			{
				case 'SELECT':
					this.logger.debug('Executing SELECT query', { table: query.table, where: query.where });
					const selectResult = { rows: await this.find<T>(query) };
					this.logger.info('SELECT query completed successfully', {
						table: query.table,
						rowCount: selectResult.rows?.length ?? 0
					});
					return selectResult;

				case 'INSERT':
					this.logger.debug('Executing INSERT query', { table: query.table });
					const insertId = await this.insert(query);
					this.logger.info('INSERT query completed successfully', {
						table: query.table,
						insertId
					});
					return { insertId };

				case 'UPDATE':
					this.logger.debug('Executing UPDATE query', { table: query.table, where: query.where });
					const updateResult = await this.update(query);
					this.logger.info('UPDATE query completed successfully', {
						table: query.table,
						affectedRows: updateResult
					});
					return { affectedRows: updateResult };

				case 'DELETE':
					this.logger.debug('Executing DELETE query', { table: query.table, where: query.where });
					const deleteResult = await this.delete(query);
					this.logger.info('DELETE query completed successfully', {
						table: query.table,
						affectedRows: deleteResult
					});
					return { affectedRows: deleteResult };

				default:
					// Handle legacy RAW queries and unknown types
					if ((query as any).type === 'RAW')
					{
						this.logger.warn('RAW query blocked for security reasons', { table: query.table });
						return { error: '[PostgreSQLProvider.query] RAW queries are not supported for security reasons' };
					}
					this.logger.error('Unknown query type', { type: (query as any).type, table: query.table });
					return { error: '[PostgreSQLProvider.query] Unknown query type: ' + (query as any).type };
			}
		}
		catch (err)
		{
			const error = err instanceof Error ? err.message : String(err);
			this.logger.error('PostgreSQL query failed', {
				error,
				type: query.type,
				table: query.table
			});
			return { error: `[PostgreSQLProvider.query] ${error}` };
		}
	}

	/**
	 * Executes a prepared query that has been pre-compiled and validated.
	 * @param preparedQuery The prepared query object from QueryCompiler.
	 * @returns The query result.
	 */
	async executePrepared<T = any>(preparedQuery: PreparedQuery): Promise<QueryResult<T>>
	{
		this.logger.debug('Executing prepared PostgreSQL query', { type: preparedQuery.type, table: preparedQuery.table });

		try
		{
			let sql: string;
			let params: any[] = [];

			// Build SQL based on query type
			switch (preparedQuery.type)
			{
				case 'SELECT':
					const selectSql = this.buildSelectFromPrepared(preparedQuery);
					sql = selectSql.sql;
					params = selectSql.params;
					break;

				case 'INSERT':
					const insertResult = this.buildInsertFromPrepared(preparedQuery);
					sql = insertResult.sql;
					params = insertResult.params;
					break;

				case 'UPDATE':
					const updateResult = this.buildUpdateFromPrepared(preparedQuery);
					sql = updateResult.sql;
					params = updateResult.params;
					break;

				case 'DELETE':
					const deleteResult = this.buildDeleteFromPrepared(preparedQuery);
					sql = deleteResult.sql;
					params = deleteResult.params;
					break;

				default:
					const unknownTypeError = '[PostgreSQLProvider.executePrepared] Unknown query type: ' + preparedQuery.type;
					this.logger.error(unknownTypeError, { type: preparedQuery.type });
					return { error: unknownTypeError };
			}

			this.logger.debug('Executing SQL', { sql, params });

			// Execute the query
			const connection = await this.getConnection();
			try
			{
				const result = await connection.query(sql, params);

				// Process results based on query type
				if (preparedQuery.type === 'SELECT')
				{
					const rows = result.rows as T[];
					this.logger.debug('SELECT query completed', { table: preparedQuery.table, rowCount: rows.length });
					return { rows };
				}
				else if (preparedQuery.type === 'INSERT')
				{
					// PostgreSQL returns inserted rows if RETURNING clause is used
					const insertId = result.rows[0]?.id;
					this.logger.info('INSERT query completed', { table: preparedQuery.table, insertId });
					return { insertId };
				}
				else
				{
					const affectedRows = result.rowCount ?? 0;
					this.logger.info(`${preparedQuery.type} query completed`, { table: preparedQuery.table, affectedRows });
					return { affectedRows };
				}
			}
			finally
			{
				this.releaseConnection(connection);
			}
		}
		catch (err)
		{
			const errorMsg = `[PostgreSQLProvider.executePrepared] ${err instanceof Error ? err.message : String(err)}`;
			this.logger.error(errorMsg, { type: preparedQuery.type, table: preparedQuery.table });
			return { error: errorMsg };
		}
	}

	/**
	 * Builds SELECT SQL from PreparedQuery.
	 * Note: PostgreSQL uses $1, $2, $3 placeholders instead of ?
	 */
	private buildSelectFromPrepared(prepared: PreparedQuery): { sql: string; params: any[] }
	{
		const table = this.escaper.escapeIdentifier(prepared.table);
		const fields = prepared.safeFields?.join(', ') || '*';

		let sql = `SELECT ${fields} FROM ${table}`;
		const params: any[] = [];

		// Add JOINs
		if (prepared.joins && prepared.joins.length > 0)
		{
			for (const join of prepared.joins)
			{
				const joinTable = this.escaper.escapeIdentifier(join.table);
				sql += ` ${join.type} JOIN ${joinTable}`;
				if (join.alias)
				{
					sql += ` AS ${this.escaper.escapeIdentifier(join.alias)}`;
				}
				// Convert ? placeholders to $n format
				const onSql = this.convertToPostgreSQLPlaceholders(join.on.sql, join.on.params, params);
				sql += ` ON ${onSql}`;
			}
		}

		// Add WHERE
		if (prepared.where)
		{
			const whereSql = this.convertToPostgreSQLPlaceholders(prepared.where.sql, prepared.where.params, params);
			sql += ` WHERE ${whereSql}`;
		}

		// Add GROUP BY
		if (prepared.groupBy && prepared.groupBy.length > 0)
		{
			sql += ` GROUP BY ${prepared.groupBy.join(', ')}`;
		}

		// Add ORDER BY
		if (prepared.orderBy && prepared.orderBy.length > 0)
		{
			const orderClauses = prepared.orderBy.map(o => `${o.field} ${o.direction}`);
			sql += ` ORDER BY ${orderClauses.join(', ')}`;
		}

		// Add LIMIT
		if (prepared.limit !== undefined)
		{
			sql += ` LIMIT ${prepared.limit}`;
		}

		// Add OFFSET
		if (prepared.offset !== undefined)
		{
			sql += ` OFFSET ${prepared.offset}`;
		}

		return { sql, params };
	}

	/**
	 * Builds INSERT SQL from PreparedQuery with RETURNING clause.
	 */
	private buildInsertFromPrepared(prepared: PreparedQuery): { sql: string; params: any[] }
	{
		if (!prepared.values || Object.keys(prepared.values).length === 0)
		{
			throw new Error('INSERT query requires values');
		}

		const table = this.escaper.escapeIdentifier(prepared.table);
		const fields = Object.keys(prepared.values).map(f => this.escaper.escapeIdentifier(f));
		const params = Object.values(prepared.values);
		const placeholders = params.map((_, i) => `$${i + 1}`);

		// PostgreSQL supports RETURNING clause to get inserted ID
		const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`;

		return { sql, params };
	}

	/**
	 * Builds UPDATE SQL from PreparedQuery with RETURNING clause.
	 */
	private buildUpdateFromPrepared(prepared: PreparedQuery): { sql: string; params: any[] }
	{
		if (!prepared.values || Object.keys(prepared.values).length === 0)
		{
			throw new Error('UPDATE query requires values');
		}

		const table = this.escaper.escapeIdentifier(prepared.table);
		const params: any[] = [...Object.values(prepared.values)];
		const setClauses = Object.keys(prepared.values).map((f, i) =>
			`${this.escaper.escapeIdentifier(f)} = $${i + 1}`
		);

		let sql = `UPDATE ${table} SET ${setClauses.join(', ')}`;

		// Add WHERE
		if (prepared.where)
		{
			const whereSql = this.convertToPostgreSQLPlaceholders(prepared.where.sql, prepared.where.params, params);
			sql += ` WHERE ${whereSql}`;
		}

		return { sql, params };
	}

	/**
	 * Builds DELETE SQL from PreparedQuery.
	 */
	private buildDeleteFromPrepared(prepared: PreparedQuery): { sql: string; params: any[] }
	{
		const table = this.escaper.escapeIdentifier(prepared.table);
		let sql = `DELETE FROM ${table}`;
		const params: any[] = [];

		// Add WHERE
		if (prepared.where)
		{
			const whereSql = this.convertToPostgreSQLPlaceholders(prepared.where.sql, prepared.where.params, params);
			sql += ` WHERE ${whereSql}`;
		}

		return { sql, params };
	}

	/**
	 * Returns the PostgreSQL-specific SQL escaper.
	 * Used by QueryCompiler to escape identifiers correctly.
	 * @returns PostgreSQLEscaper instance
	 */
	getEscaper(): PostgreSQLEscaper
	{
		return this.escaper;
	}

	/**
	 * Converts MySQL-style ? placeholders to PostgreSQL $n placeholders.
	 * @param sql SQL string with ? placeholders
	 * @param newParams Parameters to add
	 * @param existingParams Existing parameters array to append to
	 * @returns SQL with $n placeholders
	 */
	private convertToPostgreSQLPlaceholders(sql: string, newParams: any[], existingParams: any[]): string
	{
		let result = sql;
		let paramIndex = existingParams.length + 1;

		// Replace each ? with $n
		for (const param of newParams)
		{
			result = result.replace('?', `$${paramIndex}`);
			existingParams.push(param);
			paramIndex++;
		}

		return result;
	}
}