import { DataProvider } from '../dataProvider';
import { Condition, Query, QueryResult } from '../queryObject';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

/**
 * Options for connecting to and operating on a SQLite database.
 */
export interface SQLiteProviderOptions
{
	/** The file path to the SQLite database. */
	filename: string;
}

/**
 * A SQLite data provider that implements the `DataProvider` interface,
 * supporting SQLite operations through a query object model.
 */
export class SQLiteProvider implements DataProvider
{
	private db?: Database;
	private readonly options: SQLiteProviderOptions;

	/**
	 * Creates an instance of SQLiteProvider.
	 * @param options The SQLite database configuration.
	 */
	constructor(options: SQLiteProviderOptions)
	{
		this.options = options;
	}

	/**
	 * Initializes the database connection.
	 */
	async connect(): Promise<void>
	{
		this.db = await open({
			filename: this.options.filename,
			driver: sqlite3.Database,
		});
	}

	/**
	 * Closes the database connection.
	 */
	async disconnect(): Promise<void>
	{
		if (this.db)
		{
			await this.db.close();
			this.db = undefined;
		}
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
		if (query.fields && query.fields.length > 0)
		{
			sql += query.fields.map(f => typeof f === 'string' ? `"${f}"` : `${f.type}(${`"${f.field}"`})${f.alias ? ' AS ' + f.alias : ''}`).join(', ');
		}
		else
		{
			sql += '*';
		}
		sql += ` FROM "${query.table}"`;
		if (query.joins && query.joins.length > 0)
		{
			for (const join of query.joins)
			{
				sql += ` ${join.type} JOIN "${join.table}" ON ` + this.conditionToSQL(join.on, params);
			}
		}
		if (query.where)
		{
			sql += ' WHERE ' + this.conditionToSQL(query.where, params);
		}
		if (query.groupBy && query.groupBy.length > 0)
		{
			sql += ' GROUP BY ' + query.groupBy.map(f => `"${f}"`).join(', ');
		}
		if (query.orderBy && query.orderBy.length > 0)
		{
			sql += ' ORDER BY ' + query.orderBy.map(o => `"${o.field}" ${o.direction}`).join(', ');
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
		const keys = Object.keys(query.values);
		const sql = `INSERT INTO "${query.table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${keys.map(_ => '?').join(', ')})`;
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
		const keys = Object.keys(query.values);
		let sql = `UPDATE "${query.table}" SET ` + keys.map(k => `"${k}" = ?`).join(', ');
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
		let sql = `DELETE FROM "${query.table}"`;
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
			const { sql, params: subParams } = this.buildSelectSQL(cond.subquery);
			params.push(...subParams);
			return `"${cond.field}" ${cond.op} (${sql})`;
		}
		else if ('field' in cond && 'op' in cond && 'value' in cond)
		{
			const allowedOps = ['=', '!=', '<', '<=', '>', '>='];
			if (!allowedOps.includes(cond.op))
			{
				throw new Error(`Invalid operator: ${cond.op}`);
			}
			params.push(cond.value);
			return `"${cond.field}" ${cond.op} ?`;
		}
		else if ('field' in cond && 'op' in cond && 'values' in cond)
		{
			const allowedOps = ['IN', 'NOT IN'];
			if (!allowedOps.includes(cond.op))
			{
				throw new Error(`Invalid operator: ${cond.op}`);
			}
			params.push(...cond.values);
			return `"${cond.field}" ${cond.op} (${cond.values.map(() => '?').join(', ')})`;
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
			params.push(cond.like.pattern);
			return `"${cond.like.field}" LIKE ?`;
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
		if (!this.db) throw new Error('Not connected');
		const { sql, params } = this.buildSelectSQL(query);
		return await this.db.all<T[]>(sql, params);
	}

	/**
	 * Executes an INSERT operation.
	 * @param query The query object.
	 * @returns The ID of the newly inserted row.
	 */
	private async insert(query: Query): Promise<number>
	{
		if (!this.db) throw new Error('Not connected');
		const { sql, params } = this.buildInsertSQL(query);
		const result = await this.db.run(sql, params);
		return result.lastID ?? 0;
	}

	/**
	 * Executes an UPDATE operation.
	 * @param query The query object.
	 * @returns The number of affected rows.
	 */
	private async update(query: Query): Promise<number>
	{
		if (!this.db) throw new Error('Not connected');
		const { sql, params } = this.buildUpdateSQL(query);
		const result = await this.db.run(sql, params);
		return result.changes ?? 0;
	}

	/**
	 * Executes a DELETE operation.
	 * @param query The query object.
	 * @returns The number of affected rows.
	 */
	private async delete(query: Query): Promise<number>
	{
		if (!this.db) throw new Error('Not connected');
		const { sql, params } = this.buildDeleteSQL(query);
		const result = await this.db.run(sql, params);
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
				case 'RAW':
					if (!this.db)
						return { error: '[SQLiteProvider.query] Not connected' };
					if (!query.sql)
						return { error: '[SQLiteProvider.query] RAW query requires sql property' };
					const result = await this.db.run(query.sql, []);
					return { affectedRows: result.changes ?? 0 };
				default:
					return { error: '[SQLiteProvider.query] Unknown query type: ' + query.type };
			}
		}
		catch (err)
		{
			return { error: `[SQLiteProvider.query] ${err instanceof Error ? err.message : String(err)}` };
		}
	}
}
