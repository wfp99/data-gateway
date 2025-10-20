import { DataProvider, ConnectionPoolStatus } from '../dataProvider';
import { Condition, Query, QueryResult, fieldRefToString, FieldReference, Aggregate } from '../queryObject';
import { Pool, PoolClient, PoolConfig, Client, ClientConfig } from 'pg';
import { getLogger } from '../logger';

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
	 * Validate SQL identifiers (table names, field names, etc.)
	 * Only allows letters, numbers, underscores, and must start with a letter
	 */
	private validateIdentifier(identifier: string): string
	{
		this.logger.debug('Validating PostgreSQL identifier', { identifier });

		if (!identifier || typeof identifier !== 'string')
		{
			this.logger.error('Invalid identifier: empty or non-string', { identifier });
			throw new Error('Invalid identifier: empty or non-string');
		}
		// Allow letters at the beginning, followed by letters, numbers, underscores
		const pattern = /^[a-zA-Z][a-zA-Z0-9_]*$/;
		if (!pattern.test(identifier) || identifier.length > 64)
		{
			this.logger.error('Invalid PostgreSQL identifier detected', { identifier, reason: 'Contains invalid characters or too long' });
			throw new Error(`Invalid identifier: ${identifier}`);
		}

		this.logger.debug('PostgreSQL identifier validated successfully', { identifier });
		return identifier;
	}

	/**
	 * Validate alias
	 */
	private validateAlias(alias: string): string
	{
		this.logger.debug('Validating PostgreSQL alias', { alias });
		const result = this.validateIdentifier(alias);
		this.logger.debug('PostgreSQL alias validated successfully', { alias });
		return result;
	}

	/**
	 * Validate sort direction
	 */
	private validateDirection(direction: string): string
	{
		this.logger.debug('Validating sort direction', { direction });

		if (direction !== 'ASC' && direction !== 'DESC')
		{
			this.logger.error('Invalid sort direction detected', { direction, validDirections: ['ASC', 'DESC'] });
			throw new Error(`Invalid direction: ${direction}`);
		}

		this.logger.debug('Sort direction validated successfully', { direction });
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
	 * @param query The query object.
	 */
	private validateQuery(query: Query): void
	{
		this.logger.debug('Validating PostgreSQL query structure', { type: query.type, table: query.table });

		// Validate table name
		if (query.table)
		{
			this.validateIdentifier(query.table);
		}

		// Validate fields
		if (query.type === 'SELECT' && query.fields)
		{
			this.logger.debug('Validating SELECT query fields', { fieldCount: query.fields.length });
			for (const field of query.fields)
			{
				// Check if it's an Aggregate (has 'type' property that's a valid aggregate function)
				if (typeof field === 'object' && field !== null && 'type' in field)
				{
					const validAggregates = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
					const fieldType = (field as any).type;
					if (validAggregates.includes(fieldType))
					{
						// It's an Aggregate
						const aggregate = field as Aggregate;
						this.validateIdentifier(aggregate.type);
						if (aggregate.field)
						{
							this.validateIdentifier(fieldRefToString(aggregate.field));
						}
						if (aggregate.alias)
						{
							this.validateAlias(aggregate.alias);
						}
					}
					else
					{
						// It's a FieldReference object
						const fieldRefStr = fieldRefToString(field as FieldReference);
						if (fieldRefStr !== '*')
						{
							this.validateIdentifier(fieldRefStr);
						}
					}
				}
				else
				{
					// It's a string FieldReference
					const fieldRefStr = fieldRefToString(field as FieldReference);
					if (fieldRefStr !== '*')
					{
						this.validateIdentifier(fieldRefStr);
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
				this.validateIdentifier(fieldRefToString(order.field));
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
				if ('table' in join.source)
				{
					this.validateIdentifier(join.source.table!);
					this.validateJoinType(join.type);
					this.validateConditionStructure(join.on);
				}
				else
				{
					this.logger.error('JOIN source must specify a table name', { joinSource: join.source });
					throw new Error('JOIN source must specify a table name');
				}
			}
		}

		// Validate LIMIT and OFFSET
		if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 0))
		{
			this.logger.error('Invalid LIMIT value detected', { limit: query.limit });
			throw new Error('Invalid LIMIT value');
		}
		if (query.offset !== undefined && (!Number.isInteger(query.offset) || query.offset < 0))
		{
			this.logger.error('Invalid OFFSET value detected', { offset: query.offset });
			throw new Error('Invalid OFFSET value');
		}

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

		if (condition.and)
		{
			this.logger.debug('Validating AND condition', { subconditionCount: condition.and.length });
			condition.and.forEach((c: any) => this.validateConditionStructure(c));
		} else if (condition.or)
		{
			this.logger.debug('Validating OR condition', { subconditionCount: condition.or.length });
			condition.or.forEach((c: any) => this.validateConditionStructure(c));
		} else if (condition.not)
		{
			this.logger.debug('Validating NOT condition');
			this.validateConditionStructure(condition.not);
		} else if (condition.field)
		{
			this.logger.debug('Validating field condition', { field: condition.field, operator: condition.op });
			this.validateIdentifier(condition.field);
			if (condition.op)
			{
				this.validateOperator(condition.op);
			}
			if (condition.subquery)
			{
				this.logger.debug('Validating subquery in condition');
				this.validateQuery(condition.subquery);
			}
		} else if (condition.like)
		{
			this.logger.debug('Validating LIKE condition', { field: condition.like.field });
			this.validateIdentifier(condition.like.field);
		}
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
		const safeTableName = this.validateIdentifier(query.table);

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
						const safeType = this.validateIdentifier(aggregate.type);
						const safeFieldName = this.validateIdentifier(fieldRefToString(aggregate.field));
						const safeAlias = aggregate.alias ? this.validateAlias(aggregate.alias) : '';
						return `${safeType}("${safeFieldName}")${safeAlias ? ' AS "' + safeAlias + '"' : ''}`;
					}
					else
					{
						// It's a FieldReference object
						const fieldRefStr = fieldRefToString(f as FieldReference);
						if (fieldRefStr === '*') return '*';
						const safeFieldName = this.validateIdentifier(fieldRefStr);
						return `"${safeFieldName}"`;
					}
				}
				else
				{
					// It's a string FieldReference
					const fieldRefStr = fieldRefToString(f as FieldReference);
					if (fieldRefStr === '*') return '*';
					const safeFieldName = this.validateIdentifier(fieldRefStr);
					return `"${safeFieldName}"`;
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
					const safeJoinType = this.validateJoinType(join.type);
					const safeJoinTable = this.validateIdentifier(join.source.table!);
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
			const safeGroupBy = query.groupBy.map(f => this.validateIdentifier(fieldRefToString(f)));
			sql += ' GROUP BY ' + safeGroupBy.map(f => `"${f}"`).join(', ');
		}

		if (query.orderBy && query.orderBy.length > 0)
		{
			sql += ' ORDER BY ' + query.orderBy.map(o =>
			{
				const safeField = this.validateIdentifier(fieldRefToString(o.field));
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
			const safeFieldName = this.validateIdentifier(fieldRefToString(cond.field));
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
			const safeFieldName = this.validateIdentifier(fieldRefToString(cond.field));
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
			const safeFieldName = this.validateIdentifier(fieldRefToString(cond.field));
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
			const safeFieldName = this.validateIdentifier(fieldRefToString(cond.like.field));
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
}