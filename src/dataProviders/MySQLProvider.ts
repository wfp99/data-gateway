
import { DataProvider } from '../dataProvider';
import { Condition, Query, QueryResult } from '../queryObject';
import mysql, { Connection, ConnectionOptions } from 'mysql2/promise';

/**
 * MySQL connection options, extending `ConnectionOptions` from `mysql2/promise`.
 */
export interface MySQLProviderOptions extends ConnectionOptions { }

/**
 * A MySQL data provider that implements the `DataProvider` interface,
 * supporting MySQL operations through a query object model.
 */
export class MySQLProvider implements DataProvider
{
	/**
	 * The MySQL connection instance.
	 */
	private connection?: Connection;

	/**
	 * The connection options.
	 */
	private readonly options: MySQLProviderOptions;

	/**
	 * Constructor that takes connection options.
	 * @param options The MySQL provider options.
	 */
	constructor(options: MySQLProviderOptions)
	{
		this.options = options;
	}

	/**
	 * Connects to the MySQL database.
	 */
	async connect(): Promise<void>
	{
		this.connection = await mysql.createConnection(this.options);
	}

	/**
	 * Closes the MySQL connection.
	 */
	async disconnect(): Promise<void>
	{
		if (this.connection)
		{
			await this.connection.end();
			this.connection = undefined;
		}
	}

	/**
	 * Builds the SQL and parameters for a SELECT query.
	 * @param query The query object.
	 */
	private buildSelectSQL(query: Query): { sql: string; params: any[] }
	{
		let sql = 'SELECT ';
		const params: any[] = [];
		if (query.fields && query.fields.length > 0)
		{
			sql += query.fields.map(f => typeof f === 'string' ? `\`${f}\`` : `${f.type}(\`${f.field}\`)${f.alias ? ' AS ' + f.alias : ''}`).join(', ');
		} else
		{
			sql += '*';
		}
		sql += ` FROM \`${query.table}\``;
		if (query.joins && query.joins.length > 0)
		{
			for (const join of query.joins)
			{
				sql += ` ${join.type} JOIN \`${join.table}\` ON ` + this.conditionToSQL(join.on, params);
			}
		}
		if (query.where)
		{
			sql += ' WHERE ' + this.conditionToSQL(query.where, params);
		}
		if (query.groupBy && query.groupBy.length > 0)
		{
			sql += ' GROUP BY ' + query.groupBy.map(f => `\`${f}\``).join(', ');
		}
		if (query.orderBy && query.orderBy.length > 0)
		{
			sql += ' ORDER BY ' + query.orderBy.map(o => `\`${o.field}\` ${o.direction}`).join(', ');
		}
		if (query.limit !== undefined && typeof query.limit === 'number' && query.limit > 0)
		{
			sql += ` LIMIT ${query.limit}`;
		}
		if (query.offset !== undefined && typeof query.offset === 'number' && query.offset >= 0)
		{
			sql += ` OFFSET ${query.offset}`;
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
		const keys = Object.keys(query.values);
		const sql = `INSERT INTO \`${query.table}\` (${keys.map(k => `\`${k}\``).join(', ')}) VALUES (${keys.map(_ => '?').join(', ')})`;
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
		const keys = Object.keys(query.values);
		let sql = `UPDATE \`${query.table}\` SET ` + keys.map(k => `\`${k}\` = ?`).join(', ');
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
		let sql = `DELETE FROM \`${query.table}\``;
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
			return `\`${cond.field}\` ${cond.op} (${sql})`;
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
			params.push(cond.value);
			return `\`${cond.field}\` ${cond.op} ?`;
		}
		// Handle IN/NOT IN conditions with an array of values: { field, op, values }
		else if ('field' in cond && 'op' in cond && 'values' in cond)
		{
			const allowedOps = ['IN', 'NOT IN'];
			if (!allowedOps.includes(cond.op))
			{
				throw new Error(`Invalid operator: ${cond.op}`);
			}
			params.push(...cond.values);
			return `\`${cond.field}\` ${cond.op} (${cond.values.map(() => '?').join(', ')})`;
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
			params.push(cond.like.pattern);
			return `\`${cond.like.field}\` LIKE ?`;
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
		if (!this.connection) throw new Error('Not connected');
		const { sql, params } = this.buildSelectSQL(query);
		const [rows] = await this.connection.execute(sql, params);
		return rows as T[];
	}

	/**
	 * Executes an INSERT operation using a query object.
	 * @param query The query object.
	 * @returns The ID of the newly inserted row.
	 */
	private async insert(query: Query): Promise<number>
	{
		if (!this.connection) throw new Error('Not connected');
		const { sql, params } = this.buildInsertSQL(query);
		const [result] = await this.connection.execute(sql, params);
		return (result as mysql.ResultSetHeader).insertId ?? 0;
	}

	/**
	 * Executes an UPDATE operation using a query object.
	 * @param query The query object.
	 * @returns The number of affected rows.
	 */
	private async update(query: Query): Promise<number>
	{
		if (!this.connection) throw new Error('Not connected');
		const { sql, params } = this.buildUpdateSQL(query);
		const [result] = await this.connection.execute(sql, params);
		return (result as mysql.ResultSetHeader).affectedRows ?? 0;
	}

	/**
	 * Executes a DELETE operation using a query object.
	 * @param query The query object.
	 * @returns The number of affected rows.
	 */
	private async delete(query: Query): Promise<number>
	{
		if (!this.connection) throw new Error('Not connected');
		const { sql, params } = this.buildDeleteSQL(query);
		const [result] = await this.connection.execute(sql, params);
		return (result as mysql.ResultSetHeader).affectedRows ?? 0;
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
					return { rows: await this.find<T>(query) };

				case 'INSERT':
					return { insertId: await this.insert(query) };

				case 'UPDATE':
					return { affectedRows: await this.update(query) };

				case 'DELETE':
					return { affectedRows: await this.delete(query) };

				case 'RAW':
					if (!this.connection)
						return { error: '[MySQLProvider.query] Not connected' };
					if (!query.sql)
						return { error: '[MySQLProvider.query] RAW query requires sql property' };
					const [result] = await this.connection.execute(query.sql, []);
					return { affectedRows: (result as mysql.ResultSetHeader).affectedRows ?? 0 };

				default:
					return { error: '[MySQLProvider.query] Unknown query type: ' + query.type };
			}
		}
		catch (err)
		{
			return { error: `[MySQLProvider.query] ${err instanceof Error ? err.message : String(err)}` };
		}
	}
}
