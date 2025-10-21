import { DataProvider, ConnectionPoolStatus } from '../dataProvider';
import { Condition, Query, QueryResult, fieldRefToString, FieldReference, Aggregate } from '../queryObject';
import { getLogger } from '../logger';
import { SQLValidator } from './sqlValidator';
import { SQLiteEscaper } from './sqlEscaper';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { PreparedQuery } from '../preparedQuery';

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
	/** SQLite-specific identifier escaper */
	private readonly escaper = new SQLiteEscaper();

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
	 * Validate the security of query objects
	 * @param query The query object.
	 */
	private validateQuery(query: Query): void
	{
		this.logger.debug('Validating SQLite query structure', { type: query.type, table: query.table });
		SQLValidator.validateQuery(query);
		this.logger.debug('SQLite query structure validation completed successfully', { type: query.type, table: query.table });
	}

	/**
	 * Recursively validate condition structure
	 * @param condition The condition object.
	 */
	private validateConditionStructure(condition: any): void
	{
		if (!condition) return;
		this.logger.debug('Validating SQLite condition structure', { conditionType: Object.keys(condition) });
		SQLValidator.validateCondition(condition);
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
		const safeTableName = SQLValidator.validateIdentifier(query.table);

		if (query.fields && query.fields.length > 0)
		{
			sql += query.fields.map(f =>
			{
				if (typeof f === 'string')
				{
					if (f === '*') return '*';
					const safeFieldName = SQLValidator.validateIdentifier(f);
					return this.escaper.escapeIdentifier(safeFieldName);
				} else
				{
					// Check if this is an Aggregate
					const validAggregates = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
					if ('type' in f && typeof f.type === 'string' && validAggregates.includes(f.type))
					{
						const agg = f as Aggregate;
						const safeType = SQLValidator.validateIdentifier(agg.type);
						const safeFieldName = SQLValidator.validateIdentifier(fieldRefToString(agg.field));
						const safeAlias = agg.alias ? SQLValidator.validateAlias(agg.alias) : '';
						return `${safeType}(${this.escaper.escapeIdentifier(safeFieldName)})${safeAlias ? ' AS "' + safeAlias + '"' : ''}`;
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
					const safeJoinType = SQLValidator.validateJoinType(join.type);
					const safeJoinTable = SQLValidator.validateIdentifier(join.source.table!);
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

		const safeTableName = SQLValidator.validateIdentifier(query.table);
		const keys = Object.keys(query.values);
		const safeKeys = keys.map(k => SQLValidator.validateIdentifier(k));

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

		const safeTableName = SQLValidator.validateIdentifier(query.table);
		const keys = Object.keys(query.values);
		const safeKeys = keys.map(k => SQLValidator.validateIdentifier(k));

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
		const safeTableName = SQLValidator.validateIdentifier(query.table);
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
			const safeFieldName = SQLValidator.validateIdentifier(fieldRefToString(cond.field));
			const { sql, params: subParams } = this.buildSelectSQL(cond.subquery);
			params.push(...subParams);
			return `${this.escaper.escapeIdentifier(safeFieldName)} ${cond.op} (${sql})`;
		}
		else if ('field' in cond && 'op' in cond && 'value' in cond)
		{
			const allowedOps = ['=', '!=', '<', '<=', '>', '>='];
			if (!allowedOps.includes(cond.op))
			{
				throw new Error(`Invalid operator: ${cond.op}`);
			}
			const safeFieldName = SQLValidator.validateIdentifier(fieldRefToString(cond.field));
			params.push(this.convertValueToSQLite(cond.value));
			return `${this.escaper.escapeIdentifier(safeFieldName)} ${cond.op} ?`;
		}
		else if ('field' in cond && 'op' in cond && 'values' in cond)
		{
			const allowedOps = ['IN', 'NOT IN'];
			if (!allowedOps.includes(cond.op))
			{
				throw new Error(`Invalid operator: ${cond.op}`);
			}
			const safeFieldName = SQLValidator.validateIdentifier(fieldRefToString(cond.field));
			params.push(...cond.values.map(v => this.convertValueToSQLite(v)));
			return `${this.escaper.escapeIdentifier(safeFieldName)} ${cond.op} (${cond.values.map(() => '?').join(', ')})`;
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
			const safeFieldName = SQLValidator.validateIdentifier(fieldRefToString(cond.like.field));
			params.push(cond.like.pattern);
			return `${this.escaper.escapeIdentifier(safeFieldName)} LIKE ?`;
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

	/**
	 * Executes a prepared query that has been pre-compiled and validated.
	 * @param preparedQuery The prepared query object from QueryCompiler.
	 * @returns The query result.
	 */
	async executePrepared<T = any>(preparedQuery: PreparedQuery): Promise<QueryResult<T>>
	{
		this.logger.debug('Executing prepared SQLite query', { type: preparedQuery.type, table: preparedQuery.table });

		try
		{
			let sql: string;
			let params: any[] = [];

			// Build SQL based on query type
			switch (preparedQuery.type)
			{
				case 'SELECT':
					const selectResult = this.buildSelectFromPrepared(preparedQuery);
					sql = selectResult.sql;
					params = selectResult.params;
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
					const unknownTypeError = '[SQLiteProvider.executePrepared] Unknown query type: ' + preparedQuery.type;
					this.logger.error(unknownTypeError, { type: preparedQuery.type });
					return { error: unknownTypeError };
			}

			this.logger.debug('Executing SQL', { sql, params });

			// Get appropriate connection
			const db = preparedQuery.type === 'SELECT' ? this.getReadConnection() : this.db;
			if (!db)
			{
				throw new Error('Database connection not established');
			}

			// Execute the query based on type
			if (preparedQuery.type === 'SELECT')
			{
				const rows = await db.all<T[]>(sql, params);
				this.logger.debug('SELECT query completed', { table: preparedQuery.table, rowCount: rows.length });
				return { rows };
			}
			else if (preparedQuery.type === 'INSERT')
			{
				const result = await db.run(sql, params);
				const insertId = result.lastID;
				this.logger.info('INSERT query completed', { table: preparedQuery.table, insertId });
				return { insertId };
			}
			else
			{
				const result = await db.run(sql, params);
				const affectedRows = result.changes || 0;
				this.logger.info(`${preparedQuery.type} query completed`, { table: preparedQuery.table, affectedRows });
				return { affectedRows };
			}
		}
		catch (err)
		{
			const errorMsg = `[SQLiteProvider.executePrepared] ${err instanceof Error ? err.message : String(err)}`;
			this.logger.error(errorMsg, { type: preparedQuery.type, table: preparedQuery.table });
			return { error: errorMsg };
		}
	}

	/**
	 * Builds SELECT SQL from PreparedQuery.
	 * Note: SQLite uses ? placeholders like MySQL.
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
				sql += ` ON ${join.on.sql}`;
				params.push(...join.on.params);
			}
		}

		// Add WHERE
		if (prepared.where)
		{
			sql += ` WHERE ${prepared.where.sql}`;
			params.push(...prepared.where.params);
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
	 * Builds INSERT SQL from PreparedQuery.
	 */
	private buildInsertFromPrepared(prepared: PreparedQuery): { sql: string; params: any[] }
	{
		if (!prepared.values || Object.keys(prepared.values).length === 0)
		{
			throw new Error('INSERT query requires values');
		}

		const table = this.escaper.escapeIdentifier(prepared.table);
		const fields = Object.keys(prepared.values).map(f => this.escaper.escapeIdentifier(f));
		const placeholders = Object.keys(prepared.values).map(() => '?');
		const params = Object.values(prepared.values);

		const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`;

		return { sql, params };
	}

	/**
	 * Builds UPDATE SQL from PreparedQuery.
	 */
	private buildUpdateFromPrepared(prepared: PreparedQuery): { sql: string; params: any[] }
	{
		if (!prepared.values || Object.keys(prepared.values).length === 0)
		{
			throw new Error('UPDATE query requires values');
		}

		const table = this.escaper.escapeIdentifier(prepared.table);
		const setClauses = Object.keys(prepared.values).map(f => `${this.escaper.escapeIdentifier(f)} = ?`);
		const params = [...Object.values(prepared.values)];

		let sql = `UPDATE ${table} SET ${setClauses.join(', ')}`;

		// Add WHERE
		if (prepared.where)
		{
			sql += ` WHERE ${prepared.where.sql}`;
			params.push(...prepared.where.params);
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
			sql += ` WHERE ${prepared.where.sql}`;
			params.push(...prepared.where.params);
		}

		return { sql, params };
	}

	/**
	 * Returns the SQLite-specific SQL escaper.
	 * Used by QueryCompiler to escape identifiers correctly.
	 * @returns SQLiteEscaper instance
	 */
	getEscaper(): SQLiteEscaper
	{
		return this.escaper;
	}
}
