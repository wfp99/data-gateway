
import { DataProvider } from './dataProvider';
import { DefaultFieldMapper, EntityFieldMapper } from './entityFieldMapper';
import { Middleware, runMiddlewares } from './middleware';
import { Query, Condition, Aggregate } from './queryObject';

/**
 * Generic Repository, provides methods to operate on specified type objects using DataProvider.
 */
export class Repository<T = any, M extends EntityFieldMapper<T> = EntityFieldMapper<T>>
{
	/**
	 * @param provider Data provider
	 * @param table Table name
	 * @param mapper EntityMapper instance, defaults to DefaultEntityMapper
	 */
	constructor(
		private readonly provider: DataProvider,
		private readonly table: string,
		private readonly mapper: M = new DefaultFieldMapper<T>() as M,
		private readonly middlewares: Middleware[] = []
	) { }

	/**
	 * Maps a query object from entity-centric fields and values to database-centric
	 * column names using the repository's mapper. This includes fields, conditions,
	 * ordering, and values for insertion/updates.
	 * @param query The application-level query object.
	 * @returns A new query object with names translated for the database.
	 */
	private mapQueryToDb(query: Query): Query
	{
		const convertField = (field: string | Aggregate): string | Aggregate =>
		{
			if (typeof field === 'string')
			{
				return this.mapper.toDbField(field);
			}
			if (typeof field === 'object' && field !== null)
			{
				const newField = { ...field };
				if (newField.field)
				{
					newField.field = this.mapper.toDbField(newField.field);
				}
				return newField;
			}
			return field;
		};

		const convertCondition = (cond: Condition): Condition =>
		{
			if (!cond || typeof cond !== 'object') return cond;

			const newCond = { ...cond } as Condition;
			if ('field' in newCond && typeof newCond.field === 'string')
			{
				newCond.field = this.mapper.toDbField(newCond.field);
				if ('subquery' in newCond && typeof newCond.subquery === 'object')
				{
					newCond.subquery = this.mapQueryToDb(newCond.subquery);
				}
			}
			// Recursively handle compound conditions
			if ('and' in newCond && Array.isArray(newCond.and))
			{
				newCond.and = newCond.and.map(convertCondition);
			}
			if ('or' in newCond && Array.isArray(newCond.or))
			{
				newCond.or = newCond.or.map(convertCondition);
			}
			if ('not' in newCond && typeof newCond.not === 'object')
			{
				newCond.not = convertCondition(newCond.not);
			}
			if ('like' in newCond && typeof newCond.like === 'object' && newCond.like !== null)
			{
				if ('field' in newCond.like && typeof newCond.like.field === 'string')
				{
					newCond.like.field = this.mapper.toDbField(newCond.like.field);
				}
			}

			return newCond;
		};

		const newQuery: Query = { ...query };

		if (newQuery.fields)
		{
			newQuery.fields = newQuery.fields.map(convertField);
		}
		if (newQuery.where)
		{
			newQuery.where = convertCondition(newQuery.where);
		}
		if (newQuery.orderBy)
		{
			newQuery.orderBy = newQuery.orderBy.map(order => ({
				...order,
				field: this.mapper.toDbField(order.field)
			}));
		}
		if (newQuery.values && typeof newQuery.values === 'object' && !Array.isArray(newQuery.values))
		{
			const newValues: Record<string, any> = {};
			for (const key in newQuery.values)
			{
				newValues[this.mapper.toDbField(key)] = newQuery.values[key];
			}
			newQuery.values = newValues;
		}
		return newQuery;
	}

	/**
	 * Query an array of objects
	 * @param query Query conditions, no need to specify type and table
	 * @returns Array of queried result objects
	 */
	async find(query?: Partial<Query>): Promise<T[]>
	{
		try
		{
			const dbQuery = this.mapQueryToDb({ ...query, type: 'SELECT', table: this.table });
			const { rows } = await runMiddlewares(this.middlewares, dbQuery, async (q) =>
			{
				return this.provider.query<Record<string, any>>(q);
			});

			return Promise.all(rows?.map(row => this.mapper.fromDb(row)) ?? []);
		}
		catch (err)
		{
			throw new Error(`[Repository.find] ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/**
	 * Query a single object
	 * @param condition Query conditions
	 * @returns Object entity or null
	 */
	async findOne(condition?: Condition): Promise<T | null>
	{
		const [result] = await this.find({ where: condition, limit: 1 });
		return result ?? null;
	}

	/**
	 * Query multiple objects, supports optional pagination
	 * @param condition Query conditions
	 * @param options Pagination and sorting options
	 * @returns Array of object entities
	 */
	async findMany(condition?: Condition, options?: { limit?: number, offset?: number, orderBy?: { field: string, direction: 'ASC' | 'DESC' }[] }): Promise<T[]>
	{
		const query: Partial<Query> =
		{
			where: condition,
			limit: options?.limit,
			offset: options?.offset,
			orderBy: options?.orderBy
		};
		return this.find(query);
	}

	/**
	 * Count the number of objects that meet the conditions
	 * @param field Field to count
	 * @param condition Query conditions
	 * @returns Number of objects that meet the conditions
	 */
	async count(field: string, condition?: Condition): Promise<number>
	{
		try
		{
			const query: Query = {
				type: 'SELECT',
				table: this.table,
				fields: [{ type: 'COUNT', field: this.mapper.toDbField(field), alias: 'result' }],
				where: condition
			};
			const dbQuery = this.mapQueryToDb(query);
			const { rows } = await runMiddlewares(this.middlewares, dbQuery, async (q) =>
			{
				return this.provider.query<Record<string, any>>(q);
			});
			// The result will be in a field named 'result' due to the alias.
			// Coerce to Number as some DB drivers might return it as a string.
			return (rows && rows.length > 0) ? Number(rows[0].result) || 0 : 0;
		}
		catch (err)
		{
			throw new Error(`[Repository.count] ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/**
	 * Calculate the sum of field values that meet the conditions
	 * @param fields Array of fields to sum
	 * @param condition Query conditions
	 * @returns Object of field sums, keys are field names, values are corresponding sums
	 */
	async sum(fields: string[], condition?: Condition): Promise<Record<string, number>>
	{
		try
		{
			const query: Query = {
				type: 'SELECT',
				table: this.table,
				fields: fields.map(f => ({ type: 'SUM', field: this.mapper.toDbField(f), alias: f })),
				where: condition
			};
			const dbQuery = this.mapQueryToDb(query);
			const { rows } = await runMiddlewares(this.middlewares, dbQuery, async (q) =>
			{
				return this.provider.query<Record<string, any>>(q);
			});
			const result: Record<string, number> = {};
			const row = rows?.[0] ?? {};
			for (const f of fields)
			{
				// The result for each sum will be in a field named after the original entity field.
				result[f] = Number(row[f]) || 0;
			}
			return result;
		}
		catch (err)
		{
			throw new Error(`[Repository.sum] ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/**
	 * Insert a new object
	 * @param entity Object to be inserted
	 * @returns ID of the inserted object
	 */
	async insert(entity: Partial<T>): Promise<number | string>
	{
		try
		{
			const values = await this.mapper.toDb(entity);
			const query: Query = {
				type: 'INSERT',
				table: this.table,
				values
			};
			const dbQuery = this.mapQueryToDb(query);
			const result = await runMiddlewares(this.middlewares, dbQuery, async (q) =>
			{
				return this.provider.query(q);
			});
			return result.insertId ?? 0;
		}
		catch (err)
		{
			throw new Error(`[Repository.insert] ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/**
	 * Update an object
	 * @param values Fields to update
	 * @param condition Update conditions
	 * @returns Number of objects updated successfully
	 */
	async update(values: Partial<T>, condition?: Condition): Promise<number>
	{
		try
		{
			const dbValues = await this.mapper.toDb(values);
			const query: Query = {
				type: 'UPDATE',
				table: this.table,
				values: dbValues,
				where: condition
			};
			const dbQuery = this.mapQueryToDb(query);
			const { affectedRows } = await runMiddlewares(this.middlewares, dbQuery, async (q) =>
			{
				return this.provider.query(q);
			});
			return affectedRows ?? 0;
		}
		catch (err)
		{
			throw new Error(`[Repository.update] ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/**
	 * Delete an object
	 * @param condition Deletion conditions
	 * @returns Number of objects deleted successfully
	 */
	async delete(condition?: Condition): Promise<number>
	{
		try
		{
			const query: Query = {
				type: 'DELETE',
				table: this.table,
				where: condition
			};
			const dbQuery = this.mapQueryToDb(query);
			const { affectedRows } = await runMiddlewares(this.middlewares, dbQuery, async (q) =>
			{
				return this.provider.query(q);
			});
			return affectedRows ?? 0;
		}
		catch (err)
		{
			throw new Error(`[Repository.delete] ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}
