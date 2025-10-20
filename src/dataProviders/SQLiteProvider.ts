import { DataProvider, ConnectionPoolStatus } from '../dataProvider';
import { Condition, Query, QueryResult, fieldRefToString, FieldReference, Aggregate } from '../queryObject';
import { getLogger } from '../logger';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

/**
 * Connection pool configuration for SQLite.
 * Note: SQLite doesn't support true connection pooling like MySQL,
 * but we can manage multiple database handles for read operations.
 */
export interface SQLiteConnectionPoolConfig
{
	/** Whether to use connection pooling for read operations (default: false) */
	usePool?: boolean;
	/** Maximum number of read-only connections (default: 3) */
	maxReadConnections?: number;
	/** Whether to enable WAL mode for better concurrency (default: true when pooling) */
	enableWAL?: boolean;
}

/**
 * Options for connecting to and operating on a SQLite database.
 */
export interface SQLiteProviderOptions
{
	/** The file path to the SQLite database. */
	filename: string;
	/** Connection pool configuration */
	pool?: SQLiteConnectionPoolConfig;
}

/**
 * A SQLite data provider that implements the `DataProvider` interface,
 * supporting SQLite operations through a query object model with basic connection management.
 */
export class SQLiteProvider implements DataProvider
{
	/** Primary database connection (used for writes and when pooling is disabled) */
	private db?: Database;
	/** Pool of read-only connections (when pooling is enabled) */
	private readPool: Database[] = [];
	/** Configuration options */
	private readonly options: SQLiteProviderOptions;
	/** Whether connection pooling is enabled */
	private readonly usePool: boolean;
	/** Maximum number of read connections */
	private readonly maxReadConnections: number;
	/** Current index for round-robin read connection selection */
	private readConnectionIndex = 0;
	/** Logger instance for this provider */
	private readonly logger: ReturnType<typeof getLogger>;

	/**
	 * Creates an instance of SQLiteProvider.
	 * @param options The SQLite database configuration.
	 */
	constructor(options: SQLiteProviderOptions)
	{
		this.options = options;
		this.usePool = options.pool?.usePool === true;
		this.maxReadConnections = options.pool?.maxReadConnections || 3;
		this.logger = getLogger('SQLiteProvider');

		this.logger.debug('SQLiteProvider initialized', {
			filename: options.filename,
			usePool: this.usePool,
			maxReadConnections: this.maxReadConnections,
			enableWAL: options.pool?.enableWAL
		});
	}

	/**
	 * Validate SQL identifiers (table names, field names, etc.)
	 * Only allows letters, numbers, underscores, and dots (for table.field format)
	 */
	private validateIdentifier(identifier: string): string
	{
		this.logger.debug('Validating SQLite identifier', { identifier });

		if (!identifier || typeof identifier !== 'string')
		{
			this.logger.error('Invalid identifier: empty or non-string', { identifier });
			throw new Error('Invalid identifier: empty or non-string');
		}
		// Allow letters at the beginning, followed by letters, numbers, underscores, and dots (for table.field)
		const pattern = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)?$/;
		if (!pattern.test(identifier) || identifier.length > 128)
		{
			this.logger.error('Invalid SQLite identifier detected', { identifier, reason: 'Contains invalid characters or too long' });
			throw new Error(`Invalid identifier: ${identifier}`);
		}

		this.logger.debug('SQLite identifier validated successfully', { identifier });
		return identifier;
	}

	/**
	 * Escapes a database identifier with double quotes, handling table.field format.
	 * @param identifier The identifier to escape (e.g., "users.id" or "id").
	 * @returns The escaped identifier (e.g., "\"users\".\"id\"" or "\"id\"").
	 */
	private escapeIdentifier(identifier: string): string
	{
		// Split by dot to handle table.field format
		const parts = identifier.split('.');

		// Escape each part separately with double quotes
		return parts.map(part => `"${part}"`).join('.');
	}

	/**
	 * Validate alias
	 */
	private validateAlias(alias: string): string
	{
		this.logger.debug('Validating SQLite alias', { alias });
		const result = this.validateIdentifier(alias);
		this.logger.debug('SQLite alias validated successfully', { alias });
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
		this.logger.debug('Validating SQLite query structure', { type: query.type, table: query.table });

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
				if (typeof field === 'string')
				{
					if (field !== '*')
					{
						this.validateIdentifier(field);
					}
				} else if (typeof field === 'object')
				{
					// Check if this is an Aggregate
					const validAggregates = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
					if ('type' in field && typeof field.type === 'string' && validAggregates.includes(field.type))
					{
						const agg = field as Aggregate;
						this.validateIdentifier(agg.type);
						if (agg.field)
						{
							this.validateIdentifier(fieldRefToString(agg.field));
						}
						if (agg.alias)
						{
							this.validateAlias(agg.alias);
						}
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

		this.logger.debug('SQLite query structure validation completed successfully', { type: query.type, table: query.table });
	}

	/**
	 * Recursively validate condition structure
	 * @param condition The condition object.
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
	 * Initializes the database connection(s).
	 */
	async connect(): Promise<void>
	{
		this.logger.debug('Connecting to SQLite database', {
			filename: this.options.filename,
			usePool: this.usePool
		});

		// Create the primary connection
		this.db = await open({
			filename: this.options.filename,
			driver: sqlite3.Database,
		});

		this.logger.debug('Primary database connection established');

		// Enable WAL mode if pooling is enabled or explicitly requested
		if (this.usePool || this.options.pool?.enableWAL)
		{
			this.logger.debug('Enabling WAL mode for better concurrency');
			await this.db.exec('PRAGMA journal_mode = WAL;');
			this.logger.debug('WAL mode enabled');
		}

		// Create read-only connections if pooling is enabled
		if (this.usePool)
		{
			this.logger.debug(`Creating ${this.maxReadConnections} read-only connections for pool`);
			for (let i = 0; i < this.maxReadConnections; i++)
			{
				const readDb = await open({
					filename: this.options.filename,
					driver: sqlite3.Database,
					mode: sqlite3.OPEN_READONLY,
				});
				this.readPool.push(readDb);
				this.logger.debug(`Read-only connection ${i + 1}/${this.maxReadConnections} created`);
			}
			this.logger.info('Connection pool created successfully', {
				poolSize: this.readPool.length
			});
		}

		this.logger.info('SQLite database connected successfully', {
			filename: this.options.filename,
			usePool: this.usePool,
			readConnections: this.readPool.length
		});
	}

	/**
	 * Closes all database connections.
	 */
	async disconnect(): Promise<void>
	{
		this.logger.debug('Disconnecting from SQLite database');

		// Close read pool connections
		if (this.readPool.length > 0)
		{
			this.logger.debug(`Closing ${this.readPool.length} read-only connections`);
			for (const readDb of this.readPool)
			{
				await readDb.close();
			}
			this.readPool = [];
			this.logger.debug('Read-only connections closed');
		}

		// Close primary connection
		if (this.db)
		{
			this.logger.debug('Closing primary database connection');
			await this.db.close();
			this.db = undefined;
			this.logger.debug('Primary connection closed');
		}

		this.logger.info('SQLite database disconnected successfully');
	}

	/**
	 * Gets the connection pool status.
	 * @returns Connection pool status or undefined if not using pooling.
	 */
	getPoolStatus(): ConnectionPoolStatus | undefined
	{
		if (!this.usePool) return undefined;

		return {
			totalConnections: this.readPool.length + (this.db ? 1 : 0),
			idleConnections: this.readPool.length, // Read connections are always considered idle
			activeConnections: this.db ? 1 : 0, // Only the write connection can be active
			maxConnections: this.maxReadConnections + 1,
			minConnections: 1, // Always maintain at least the primary connection
		};
	}

	/**
	 * Checks if the provider supports connection pooling.
	 * @returns Always true for SQLite provider (though limited compared to MySQL).
	 */
	supportsConnectionPooling(): boolean
	{
		return true;
	}

	/**
	 * Gets a connection for reading operations.
	 * Uses round-robin to distribute load across read connections.
	 */
	private getReadConnection(): Database
	{
		if (!this.usePool || this.readPool.length === 0)
		{
			if (!this.db) throw new Error('Not connected');
			return this.db;
		}

		const connection = this.readPool[this.readConnectionIndex];
		this.readConnectionIndex = (this.readConnectionIndex + 1) % this.readPool.length;
		return connection;
	}

	/**
	 * Gets a connection for write operations.
	 * Always uses the primary connection for writes.
	 */
	private getWriteConnection(): Database
	{
		if (!this.db) throw new Error('Not connected');
		return this.db;
	}

	/**
	 * Builds the SQL statement and parameters for a SELECT query.
	 * @param query The query object.
	 * @returns An object containing the SQL string and parameters.
	 */
	private buildSelectSQL(query: Query): { sql: string; params: any[] }
	{
		let sql = 'SELECT ';
		const params: any[] = [];

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
					return this.escapeIdentifier(safeFieldName);
				} else
				{
					// Check if this is an Aggregate
					const validAggregates = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
					if ('type' in f && typeof f.type === 'string' && validAggregates.includes(f.type))
					{
						const agg = f as Aggregate;
						const safeType = this.validateIdentifier(agg.type);
						const safeFieldName = this.validateIdentifier(fieldRefToString(agg.field));
						const safeAlias = agg.alias ? this.validateAlias(agg.alias) : '';
						return `${safeType}(${this.escapeIdentifier(safeFieldName)})${safeAlias ? ' AS "' + safeAlias + '"' : ''}`;
					}
					// This shouldn't happen but provide a fallback
					return '*';
				}
			}).join(', ');
		}
		else
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
					sql += ` ${safeJoinType} JOIN "${safeJoinTable}" ON ` + this.conditionToSQL(join.on, params);
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
			sql += ' WHERE ' + this.conditionToSQL(query.where, params);
		}

		if (query.groupBy && query.groupBy.length > 0)
		{
			const safeGroupBy = query.groupBy.map(f => this.validateIdentifier(fieldRefToString(f)));
			sql += ' GROUP BY ' + safeGroupBy.map(f => this.escapeIdentifier(f)).join(', ');
		}

		if (query.orderBy && query.orderBy.length > 0)
		{
			sql += ' ORDER BY ' + query.orderBy.map(o =>
			{
				const safeField = this.validateIdentifier(fieldRefToString(o.field));
				const safeDirection = this.validateDirection(o.direction);
				return `${this.escapeIdentifier(safeField)} ${safeDirection}`;
			}).join(', ');
		}

		if (query.limit !== undefined)
		{
			sql += ' LIMIT ?';
			params.push(query.limit);
		}
		if (query.offset !== undefined)
		{
			sql += ' OFFSET ?';
			params.push(query.offset);
		}
		return { sql, params };
	}

	/**
	 * Converts a value to a SQLite-compatible format.
	 * Handles Date objects by converting them to ISO 8601 strings.
	 * @param value The value to convert.
	 * @returns The converted value.
	 */
	private convertValueToSQLite(value: any): any
	{
		if (value instanceof Date)
		{
			// Convert Date to ISO 8601 string format for SQLite
			return value.toISOString();
		}
		return value;
	}

	/**
	 * Converts a value from SQLite format to JavaScript types.
	 * Attempts to detect and convert ISO 8601 date strings back to Date objects.
	 * @param value The value from SQLite.
	 * @returns The converted value.
	 */
	private convertValueFromSQLite(value: any): any
	{
		// If the value is a string that looks like an ISO 8601 date, convert it to Date
		if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value))
		{
			const date = new Date(value);
			// Check if the conversion resulted in a valid date
			if (!isNaN(date.getTime()))
			{
				return date;
			}
		}
		return value;
	}

	/**
	 * Converts all values in a row from SQLite format.
	 * @param row The row from SQLite.
	 * @returns The row with converted values.
	 */
	private convertRowFromSQLite(row: Record<string, any>): Record<string, any>
	{
		const converted: Record<string, any> = {};
		for (const key in row)
		{
			converted[key] = this.convertValueFromSQLite(row[key]);
		}
		return converted;
	}

	/**
	 * Builds the SQL statement and parameters for an INSERT query.
	 * @param query The query object.
	 * @returns An object containing the SQL string and parameters.
	 */
	private buildInsertSQL(query: Query): { sql: string; params: any[] }
	{
		if (!query.values) throw new Error('INSERT must have values');

		const safeTableName = this.validateIdentifier(query.table);
		const keys = Object.keys(query.values);
		const safeKeys = keys.map(k => this.validateIdentifier(k));

		const sql = `INSERT INTO "${safeTableName}" (${safeKeys.map(k => `"${k}"`).join(', ')}) VALUES (${keys.map(_ => '?').join(', ')})`;
		const params = keys.map(k => this.convertValueToSQLite(query.values![k]));
		return { sql, params };
	}

	/**
	 * Builds the SQL statement and parameters for an UPDATE query.
	 * @param query The query object.
	 * @returns An object containing the SQL string and parameters.
	 */
	private buildUpdateSQL(query: Query): { sql: string; params: any[] }
	{
		if (!query.values) throw new Error('UPDATE must have values');

		const safeTableName = this.validateIdentifier(query.table);
		const keys = Object.keys(query.values);
		const safeKeys = keys.map(k => this.validateIdentifier(k));

		let sql = `UPDATE "${safeTableName}" SET ` + safeKeys.map(k => `"${k}" = ?`).join(', ');
		const params = keys.map(k => this.convertValueToSQLite(query.values![k]));

		if (query.where)
		{
			sql += ' WHERE ' + this.conditionToSQL(query.where, params);
		}
		return { sql, params };
	}

	/**
	 * Builds the SQL statement and parameters for a DELETE query.
	 * @param query The query object.
	 * @returns An object containing the SQL string and parameters.
	 */
	private buildDeleteSQL(query: Query): { sql: string; params: any[] }
	{
		const safeTableName = this.validateIdentifier(query.table);
		let sql = `DELETE FROM "${safeTableName}"`;
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
	 * @returns The SQL string for the condition.
	 */
	private conditionToSQL(cond: Condition, params: any[]): string
	{
		if ('field' in cond && 'op' in cond && 'subquery' in cond)
		{
			const allowedOps = ['IN', 'NOT IN'];
			if (!allowedOps.includes(cond.op))
			{
				throw new Error(`Invalid operator: ${cond.op}`);
			}
			const safeFieldName = this.validateIdentifier(fieldRefToString(cond.field));
			const { sql, params: subParams } = this.buildSelectSQL(cond.subquery);
			params.push(...subParams);
			return `${this.escapeIdentifier(safeFieldName)} ${cond.op} (${sql})`;
		}
		else if ('field' in cond && 'op' in cond && 'value' in cond)
		{
			const allowedOps = ['=', '!=', '<', '<=', '>', '>='];
			if (!allowedOps.includes(cond.op))
			{
				throw new Error(`Invalid operator: ${cond.op}`);
			}
			const safeFieldName = this.validateIdentifier(fieldRefToString(cond.field));
			params.push(this.convertValueToSQLite(cond.value));
			return `${this.escapeIdentifier(safeFieldName)} ${cond.op} ?`;
		}
		else if ('field' in cond && 'op' in cond && 'values' in cond)
		{
			const allowedOps = ['IN', 'NOT IN'];
			if (!allowedOps.includes(cond.op))
			{
				throw new Error(`Invalid operator: ${cond.op}`);
			}
			const safeFieldName = this.validateIdentifier(fieldRefToString(cond.field));
			params.push(...cond.values.map(v => this.convertValueToSQLite(v)));
			return `${this.escapeIdentifier(safeFieldName)} ${cond.op} (${cond.values.map(() => '?').join(', ')})`;
		}
		else if ('and' in cond)
		{
			return '(' + cond.and.map((c) => this.conditionToSQL(c, params)).join(' AND ') + ')';
		}
		else if ('or' in cond)
		{
			return '(' + cond.or.map((c) => this.conditionToSQL(c, params)).join(' OR ') + ')';
		}
		else if ('not' in cond)
		{
			return 'NOT (' + this.conditionToSQL(cond.not, params) + ')';
		}
		else if ('like' in cond)
		{
			const safeFieldName = this.validateIdentifier(fieldRefToString(cond.like.field));
			params.push(cond.like.pattern);
			return `${this.escapeIdentifier(safeFieldName)} LIKE ?`;
		}
		throw new Error('Unknown condition type');
	}

	/**
	 * Executes a SELECT query.
	 * @param query The query object.
	 * @returns An array of results.
	 */
	private async find<T = any>(query: Query): Promise<T[]>
	{
		const db = this.getReadConnection();
		const { sql, params } = this.buildSelectSQL(query);
		const rows = await db.all<T[]>(sql, params);
		// Convert date strings back to Date objects
		return rows.map(row => this.convertRowFromSQLite(row as any)) as T[];
	}

	/**
	 * Executes an INSERT operation.
	 * @param query The query object.
	 * @returns The ID of the newly inserted row.
	 */
	private async insert(query: Query): Promise<number>
	{
		const db = this.getWriteConnection();
		const { sql, params } = this.buildInsertSQL(query);
		const result = await db.run(sql, params);
		return result.lastID ?? 0;
	}

	/**
	 * Executes an UPDATE operation.
	 * @param query The query object.
	 * @returns The number of affected rows.
	 */
	private async update(query: Query): Promise<number>
	{
		const db = this.getWriteConnection();
		const { sql, params } = this.buildUpdateSQL(query);
		const result = await db.run(sql, params);
		return result.changes ?? 0;
	}

	/**
	 * Executes a DELETE operation.
	 * @param query The query object.
	 * @returns The number of affected rows.
	 */
	private async delete(query: Query): Promise<number>
	{
		const db = this.getWriteConnection();
		const { sql, params } = this.buildDeleteSQL(query);
		const result = await db.run(sql, params);
		return result.changes ?? 0;
	}

	/**
	 * Generic query method that dispatches to the appropriate CRUD operation based on `query.type`.
	 * @param query The query object.
	 * @returns The query result, which may contain rows, an insertId, or the number of affected rows.
	 */
	async query<T = any>(query: Query): Promise<QueryResult<T>>
	{
		this.logger.debug('Executing SQLite query', { type: query.type, table: query.table });

		try
		{
			// Validate security before executing query
			this.validateQuery(query);

			switch (query.type)
			{
				case 'SELECT':
					this.logger.debug('Executing SELECT query', { table: query.table, where: query.where });
					const selectResult = { rows: await this.find(query) };
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
						return { error: '[SQLiteProvider.query] RAW queries are not supported for security reasons' };
					}
					this.logger.error('Unknown query type', { type: (query as any).type, table: query.table });
					return { error: '[SQLiteProvider.query] Unknown query type: ' + (query as any).type };
			}
		}
		catch (err)
		{
			const error = err instanceof Error ? err.message : String(err);
			this.logger.error('SQLite query failed', {
				error,
				type: query.type,
				table: query.table
			});
			return { error: `[SQLiteProvider.query] ${error}` };
		}
	}
}
