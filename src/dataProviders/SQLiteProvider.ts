import { DataProvider, ConnectionPoolStatus } from '../dataProvider';
import { Condition, Query, QueryResult } from '../queryObject';
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

	/**
	 * Creates an instance of SQLiteProvider.
	 * @param options The SQLite database configuration.
	 */
	constructor(options: SQLiteProviderOptions)
	{
		this.options = options;
		this.usePool = options.pool?.usePool === true;
		this.maxReadConnections = options.pool?.maxReadConnections || 3;
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
	 * Initializes the database connection(s).
	 */
	async connect(): Promise<void>
	{
		// Create the primary connection
		this.db = await open({
			filename: this.options.filename,
			driver: sqlite3.Database,
		});

		// Enable WAL mode if pooling is enabled or explicitly requested
		if (this.usePool || this.options.pool?.enableWAL)
		{
			await this.db.exec('PRAGMA journal_mode = WAL;');
		}

		// Create read-only connections if pooling is enabled
		if (this.usePool)
		{
			for (let i = 0; i < this.maxReadConnections; i++)
			{
				const readDb = await open({
					filename: this.options.filename,
					driver: sqlite3.Database,
					mode: sqlite3.OPEN_READONLY,
				});
				this.readPool.push(readDb);
			}
		}
	}

	/**
	 * Closes all database connections.
	 */
	async disconnect(): Promise<void>
	{
		// Close read pool connections
		for (const readDb of this.readPool)
		{
			await readDb.close();
		}
		this.readPool = [];

		// Close primary connection
		if (this.db)
		{
			await this.db.close();
			this.db = undefined;
		}
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
					return `"${safeFieldName}"`;
				} else
				{
					const safeType = this.validateIdentifier(f.type);
					const safeFieldName = this.validateIdentifier(f.field);
					const safeAlias = f.alias ? this.validateAlias(f.alias) : '';
					return `${safeType}("${safeFieldName}")${safeAlias ? ' AS "' + safeAlias + '"' : ''}`;
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
				const safeJoinType = this.validateJoinType(join.type);
				const safeJoinTable = this.validateIdentifier(join.table);
				sql += ` ${safeJoinType} JOIN "${safeJoinTable}" ON ` + this.conditionToSQL(join.on, params);
			}
		}

		if (query.where)
		{
			sql += ' WHERE ' + this.conditionToSQL(query.where, params);
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
		const params = keys.map(k => query.values![k]);
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
		const params = keys.map(k => query.values![k]);

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
			const safeFieldName = this.validateIdentifier(cond.field);
			const { sql, params: subParams } = this.buildSelectSQL(cond.subquery);
			params.push(...subParams);
			return `"${safeFieldName}" ${cond.op} (${sql})`;
		}
		else if ('field' in cond && 'op' in cond && 'value' in cond)
		{
			const allowedOps = ['=', '!=', '<', '<=', '>', '>='];
			if (!allowedOps.includes(cond.op))
			{
				throw new Error(`Invalid operator: ${cond.op}`);
			}
			const safeFieldName = this.validateIdentifier(cond.field);
			params.push(cond.value);
			return `"${safeFieldName}" ${cond.op} ?`;
		}
		else if ('field' in cond && 'op' in cond && 'values' in cond)
		{
			const allowedOps = ['IN', 'NOT IN'];
			if (!allowedOps.includes(cond.op))
			{
				throw new Error(`Invalid operator: ${cond.op}`);
			}
			const safeFieldName = this.validateIdentifier(cond.field);
			params.push(...cond.values);
			return `"${safeFieldName}" ${cond.op} (${cond.values.map(() => '?').join(', ')})`;
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
			const safeFieldName = this.validateIdentifier(cond.like.field);
			params.push(cond.like.pattern);
			return `"${safeFieldName}" LIKE ?`;
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
		return await db.all<T[]>(sql, params);
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
		try
		{
			// Validate security before executing query
			this.validateQuery(query);

			switch (query.type)
			{
				case 'SELECT':
					return { rows: await this.find(query) };
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
						return { error: '[SQLiteProvider.query] RAW queries are not supported for security reasons' };
					}
					return { error: '[SQLiteProvider.query] Unknown query type: ' + (query as any).type };
			}
		}
		catch (err)
		{
			return { error: `[SQLiteProvider.query] ${err instanceof Error ? err.message : String(err)}` };
		}
	}
}
