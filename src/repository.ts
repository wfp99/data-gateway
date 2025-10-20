
import { DataProvider } from './dataProvider';
import { DefaultFieldMapper, EntityFieldMapper } from './entityFieldMapper';
import { Middleware, runMiddlewares } from './middleware';
import { Query, Condition, Aggregate, Join } from './queryObject';
import { getLogger } from './logger';
import { DataGateway } from './dataGateway';

/**
 * Generic Repository, provides methods to operate on specified type objects using DataProvider.
 */
export class Repository<T = any, M extends EntityFieldMapper<T> = EntityFieldMapper<T>>
{
	private readonly logger = getLogger('Repository');

	/**
	 * Constructor
	 * @param dataGateway DataGateway instance
	 * @param provider Data provider
	 * @param table Table name
	 * @param mapper EntityMapper instance, defaults to DefaultEntityMapper
	 */
	constructor(
		private readonly dataGateway: DataGateway,
		private readonly provider: DataProvider,
		private readonly table: string,
		private readonly mapper: M = new DefaultFieldMapper<T>() as M,
		private readonly middlewares: Middleware[] = []
	)
	{
		this.logger.debug(`Repository initialized`, { table: this.table, middlewares: this.middlewares.length });
	}

	/**
	 * Get the DataProvider instance
	 * @returns DataProvider
	 */
	getProvider(): DataProvider
	{
		return this.provider;
	}

	/**
	 * Get the table name
	 * @returns Table name
	 */
	getTable(): string
	{
		return this.table;
	}

	/**
	 * Get the EntityFieldMapper instance
	 * @returns EntityFieldMapper
	 */
	getMapper(): M
	{
		return this.mapper;
	}

	/**
	 * Maps a query object from entity-centric fields and values to database-centric
	 * column names using the repository's mapper. This includes fields, conditions,
	 * ordering, and values for insertion/updates.
	 * @param query The application-level query object.
	 * @returns A new query object with names translated for the database.
	 */
	private mapQueryToDb(query: Query): Query
	{
		// Helper function to convert fields and aggregates
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

		// Helper function to convert conditions recursively
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

		// Helper function to convert JOIN conditions
		const convertJoinOn = (join: Join): Join =>
		{
			// Determine the repository and mapper for the JOIN source
			let repo: Repository<any> | undefined;
			let mapper: EntityFieldMapper<any> = this.mapper; // Default to main repository's mapper
			let table: string | undefined;

			// Type guard to check if source has repository property
			if ('repository' in join.source)
			{
				repo = this.dataGateway.getRepository(join.source.repository);
				if (repo)
				{
					mapper = repo.getMapper();
					table = repo.getTable();
				}
			}
			else if ('table' in join.source)
			{
				// Direct table reference, use main repository's mapper
				table = join.source.table;
			}

			if (!table)
			{
				this.logger.error(`[Repository.mapQueryToDb] Unable to determine table for JOIN source: ${JSON.stringify(join.source)}`);
				throw new Error(`[Repository.mapQueryToDb] Unable to determine table for JOIN source: ${JSON.stringify(join.source)}`);
			}

			// Create a new Join object instead of modifying the original
			const newJoin: Join = {
				type: join.type,
				source: { table },
				on: { ...join.on }
			};

			// Convert the ON condition
			// Important: Only support simple field comparison for now
			// The left side uses the main repository's mapper, and the right side uses the join source's mapper
			if ('field' in newJoin.on && typeof newJoin.on.field === 'string')
			{
				// Use the repository's mapper to convert the left field
				newJoin.on.field = this.mapper.toDbField(newJoin.on.field);

				// Use the join source's mapper to convert the right field (in the value)
				if (newJoin.on.op === '=' || newJoin.on.op === '!=' || newJoin.on.op === '>' || newJoin.on.op === '<' || newJoin.on.op === '>=' || newJoin.on.op === '<=')
				{
					// Handle table.field or repository.field format in value
					const valueStr = String(newJoin.on.value);
					if (valueStr.includes('.'))
					{
						// Split table/repository.field format
						const parts = valueStr.split('.');
						if (parts.length === 2)
						{
							let [tableOrRepoName, fieldName] = parts;

							// Check if the prefix is a repository name, if so, convert to table name
							const referencedRepo = this.dataGateway.getRepository(tableOrRepoName);
							if (referencedRepo)
							{
								// It's a repository name, use its table name
								tableOrRepoName = referencedRepo.getTable();
								// Use the referenced repository's mapper to convert the field
								const referencedMapper = referencedRepo.getMapper();
								fieldName = referencedMapper.toDbField(fieldName);
							}
							else
							{
								// It's a direct table name, use the join source's mapper to convert the field
								fieldName = mapper.toDbField(fieldName);
							}

							newJoin.on.value = `${tableOrRepoName}.${fieldName}`;
						}
						else
						{
							// If format is unexpected, keep original value
							newJoin.on.value = valueStr;
						}
					}
					else
					{
						// No table prefix, convert the entire value as a field name
						newJoin.on.value = mapper.toDbField(valueStr);
					}
				}
			}

			return newJoin;
		}

		const newQuery: Query = { ...query };

		if (newQuery.fields)
		{
			newQuery.fields = newQuery.fields.map(convertField);
		}
		if (newQuery.where)
		{
			newQuery.where = convertCondition(newQuery.where);
		}
		if (newQuery.joins)
		{
			newQuery.joins = newQuery.joins.map(join => ({
				...convertJoinOn(join)
			}));
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
			this.logger.debug(`Executing find query`, { table: this.table, query });
			const dbQuery = this.mapQueryToDb({ ...query, type: 'SELECT', table: this.table });
			const { rows } = await runMiddlewares(this.middlewares, dbQuery, async (q) =>
			{
				return this.provider.query<Record<string, any>>(q);
			});

			const results = await Promise.all(rows?.map(row => this.mapper.fromDb(row)) ?? []);
			this.logger.debug(`Find query completed`, { table: this.table, resultCount: results.length });
			return results;
		}
		catch (err)
		{
			const errorMsg = `[Repository.find] ${err instanceof Error ? err.message : String(err)}`;
			this.logger.error(errorMsg, { table: this.table, query });
			throw new Error(errorMsg);
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
			this.logger.debug(`Inserting entity`, { table: this.table });
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
			const insertId = result.insertId ?? 0;
			this.logger.info(`Entity inserted successfully`, { table: this.table, insertId });
			return insertId;
		}
		catch (err)
		{
			const errorMsg = `[Repository.insert] ${err instanceof Error ? err.message : String(err)}`;
			this.logger.error(errorMsg, { table: this.table });
			throw new Error(errorMsg);
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
