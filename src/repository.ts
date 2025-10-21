
import { DataProvider } from './dataProvider';
import { DefaultFieldMapper, EntityFieldMapper } from './entityFieldMapper';
import { Middleware, runMiddlewares } from './middleware';
import { Query, Condition, Aggregate, Join, JoinSource, FieldReference, fieldRefToString, QueryResult } from './queryObject';
import { getLogger } from './logger';
import { DataGateway } from './dataGateway';
import { QueryCompiler } from './queryCompiler';

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
	 * Creates a standardized error with logging
	 * @param method The method name where the error occurred
	 * @param message The error message
	 * @param context Additional context for logging
	 * @returns Error object
	 */
	private createError(method: string, message: string, context?: any): Error
	{
		const errorMsg = `[Repository.${method}] ${message}`;
		this.logger.error(errorMsg, { table: this.table, ...context });
		return new Error(errorMsg);
	}

	/**
	 * Executes a query using PreparedQuery for security when available.
	 * Falls back to query() for providers that don't support executePrepared.
	 * All queries go through QueryCompiler for parameterization when possible.
	 *
	 * @param query The query object to execute
	 * @returns Query result
	 */
	private async executeQuery<T = any>(query: Query): Promise<QueryResult<T>>
	{
		// Use PreparedQuery if available (recommended for security)
		if (this.provider.executePrepared)
		{
			return await runMiddlewares(this.middlewares, query, async (q) =>
			{
				// Compile to PreparedQuery for security (inside middleware callback)
				const compiler = new QueryCompiler(this.provider.getEscaper());
				const preparedQuery = compiler.compile(q);

				// Execute using parameterized query
				return this.provider.executePrepared!<T>(preparedQuery);
			});
		}
		else
		{
			// Fallback to traditional query() for legacy providers
			return await runMiddlewares(this.middlewares, query, async (q) =>
			{
				return this.provider.query<T>(q);
			});
		}
	}

	/**
	 * Detects and warns about field conflicts in JOIN queries.
	 * When multiple tables have fields with the same name, this method
	 * helps developers identify potential ambiguity issues.
	 *
	 * @param query The query to check for field conflicts
	 */
	private detectFieldConflicts(query: Partial<Query>): void
	{
		// Only check for queries with JOINs
		if (!query.joins || query.joins.length === 0) return;

		// Helper function to check if a field has a prefix (table or repository)
		const hasPrefix = (field: FieldReference | Aggregate): boolean =>
		{
			if (typeof field === 'string')
			{
				// String format: check for dot notation
				return field.includes('.');
			}
			else if ('type' in field)
			{
				// Aggregate
				const fieldRef = field.field;
				if (typeof fieldRef === 'string')
				{
					return fieldRef.includes('.');
				}
				else if (typeof fieldRef === 'object')
				{
					return !!(fieldRef.table || fieldRef.repository);
				}
			}
			else
			{
				// FieldReference object
				return !!(field.table || field.repository);
			}
			return false;
		};

		// If fields are specified and ALL fields have prefixes, no need to check
		if (query.fields && query.fields.length > 0)
		{
			const allHavePrefix = query.fields.every(hasPrefix);
			if (allHavePrefix)
			{
				// All fields are properly prefixed, no conflict detection needed
				return;
			}
		}

		// Build a map of field names to tables that contain them
		const fieldToTables = new Map<string, string[]>();

		// Helper function to extract field names from a mapper
		const getFieldsFromMapper = (mapper: EntityFieldMapper<any>): string[] =>
		{
			// Get all entity fields by checking what the mapper can convert
			// We'll try common field names and see what it produces
			const sampleFields = ['id', 'name', 'status', 'createdAt', 'updatedAt'];
			const fields = new Set<string>();

			for (const field of sampleFields)
			{
				const dbField = mapper.toDbField(field);
				if (dbField !== field)
				{
					// The mapper recognized this field
					fields.add(field);
				}
			}

			return Array.from(fields);
		};

		// Add fields from the main table
		const mainFields = getFieldsFromMapper(this.mapper);
		for (const field of mainFields)
		{
			if (!fieldToTables.has(field))
			{
				fieldToTables.set(field, []);
			}
			fieldToTables.get(field)!.push(this.table);
		}

		// Add fields from joined tables
		for (const join of query.joins)
		{
			const { table, mapper } = this.resolveJoinSourceInfo(join.source);
			const joinedFields = getFieldsFromMapper(mapper);

			for (const field of joinedFields)
			{
				if (!fieldToTables.has(field))
				{
					fieldToTables.set(field, []);
				}
				fieldToTables.get(field)!.push(table);
			}
		}

		// Collect unprefixed fields from the query
		const unprefixedFields = new Set<string>();
		if (query.fields)
		{
			for (const field of query.fields)
			{
				if (!hasPrefix(field))
				{
					// Extract the field name
					if (typeof field === 'string')
					{
						unprefixedFields.add(field);
					}
					else if ('type' in field)
					{
						// Aggregate
						const fieldRef = field.field;
						if (typeof fieldRef === 'string')
						{
							unprefixedFields.add(fieldRef);
						}
						else if (typeof fieldRef === 'object')
						{
							unprefixedFields.add(fieldRef.field);
						}
					}
					else
					{
						// FieldReference object
						unprefixedFields.add(field.field);
					}
				}
			}
		}

		// Detect conflicts
		const conflicts: Array<{ field: string; tables: string[] }> = [];

		for (const [field, tables] of fieldToTables.entries())
		{
			if (tables.length > 1)
			{
				// This field exists in multiple tables
				// Only warn if:
				// 1. No specific fields were requested (SELECT *), or
				// 2. This field was explicitly requested without table/repository prefix
				if (!query.fields || unprefixedFields.has(field))
				{
					conflicts.push({ field, tables });
				}
			}
		}

		// Issue warnings for detected conflicts
		if (conflicts.length > 0)
		{
			for (const conflict of conflicts)
			{
				const tablesStr = conflict.tables.join("', '");
				this.logger.warn(
					`Field conflict detected: Field '${conflict.field}' exists in multiple tables: ['${tablesStr}']. ` +
					`Consider using table-prefixed fields like tableField('${conflict.tables[0]}', '${conflict.field}') ` +
					`to avoid ambiguity.`
				);
			}
		}
	}


	/**
	 * Resolves a field reference (repository.field or table.field) to database format
	 * Supports both string format and structured FieldReference object
	 * @param fieldRef Field reference (string or object)
	 * @param fallbackMapper Mapper to use when prefix cannot be identified
	 * @returns Resolved field reference with table and database field name
	 */
	private resolveFieldReference(
		fieldRef: FieldReference,
		fallbackMapper?: EntityFieldMapper<any>
	): { table?: string; field: string; repository?: string; mapper: EntityFieldMapper<any> }
	{
		// Handle structured FieldReference object
		if (typeof fieldRef === 'object')
		{
			const { table, repository, field } = fieldRef;

			if (repository)
			{
				// Repository reference
				const referencedRepo = this.dataGateway.getRepository(repository);
				if (referencedRepo)
				{
					return {
						table: referencedRepo.getTable(),
						field: referencedRepo.getMapper().toDbField(field),
						repository,
						mapper: referencedRepo.getMapper()
					};
				}

				// Repository not found, warn and use fallback
				this.logger.warn(`Repository '${repository}' not found for field '${field}'`);
				const mapper = fallbackMapper || this.mapper;
				return {
					table: repository,
					field: mapper.toDbField(field),
					mapper
				};
			}

			if (table)
			{
				// Direct table reference
				const mapper = fallbackMapper || this.mapper;
				return {
					table,
					field: mapper.toDbField(field),
					mapper
				};
			}

			// Simple field without prefix
			const mapper = fallbackMapper || this.mapper;
			return {
				field: mapper.toDbField(field),
				mapper
			};
		}

		// Handle string format (backward compatibility)
		if (!fieldRef.includes('.'))
		{
			// Simple field name without prefix
			const mapper = fallbackMapper || this.mapper;
			return {
				field: mapper.toDbField(fieldRef),
				mapper
			};
		}

		const parts = fieldRef.split('.');
		if (parts.length !== 2)
		{
			// Unexpected format, return as-is
			this.logger.warn(`Unexpected field reference format: ${fieldRef}`);
			return {
				field: fieldRef,
				mapper: fallbackMapper || this.mapper
			};
		}

		let [tableOrRepoName, fieldName] = parts;

		// Check if the prefix is a repository name
		const referencedRepo = this.dataGateway.getRepository(tableOrRepoName);
		if (referencedRepo)
		{
			// It's a repository name, use its table name and mapper
			return {
				table: referencedRepo.getTable(),
				field: referencedRepo.getMapper().toDbField(fieldName),
				repository: tableOrRepoName,
				mapper: referencedRepo.getMapper()
			};
		}

		// Direct table.field format
		const mapper = fallbackMapper || this.mapper;
		return {
			table: tableOrRepoName,
			field: mapper.toDbField(fieldName),
			mapper
		};
	}

	/**
	 * Resolves JOIN source information (table name, mapper, and repository)
	 * @param source JOIN source specification
	 * @returns Resolved JOIN source information
	 */
	private resolveJoinSourceInfo(source: JoinSource): {
		table: string;
		mapper: EntityFieldMapper<any>;
		repository?: Repository<any>;
	}
	{
		if ('repository' in source)
		{
			const repo = this.dataGateway.getRepository(source.repository);
			if (repo)
			{
				return {
					table: repo.getTable(),
					mapper: repo.getMapper(),
					repository: repo
				};
			}

			// Repository not found, log warning and use default
			this.logger.warn(`Repository '${source.repository}' not found, using default mapper`);
			return {
				table: source.repository,
				mapper: new DefaultFieldMapper()
			};
		}

		// Direct table reference
		return {
			table: source.table,
			mapper: new DefaultFieldMapper()
		};
	}

	/**
	 * Converts JOIN condition recursively, supporting complex nested conditions (AND/OR/NOT)
	 * @param condition The JOIN ON condition to convert
	 * @param joinMapper The mapper for the joined table (used for right-side fields)
	 * @returns Converted condition with database field names
	 */
	private convertJoinCondition(condition: Condition, joinMapper: EntityFieldMapper<any>): Condition
	{
		if (!condition || typeof condition !== 'object') return condition;

		const newCond = { ...condition } as Condition;

		// Handle simple field comparison conditions
		if ('field' in newCond && newCond.field !== undefined)
		{
			// Left side: use resolveFieldReference to handle repository.field or table.field format
			const leftResolved = this.resolveFieldReference(newCond.field);
			newCond.field = leftResolved.table ? `${leftResolved.table}.${leftResolved.field}` : leftResolved.field;

			// Handle the right side of the condition (in the value)
			if (newCond.op === '=' || newCond.op === '!=' || newCond.op === '>' || newCond.op === '<' || newCond.op === '>=' || newCond.op === '<=')
			{
				const valueStr = String(newCond.value);
				if (valueStr.includes('.'))
				{
					// Use resolveFieldReference to handle repository.field or table.field format
					const rightResolved = this.resolveFieldReference(valueStr, joinMapper);
					newCond.value = rightResolved.table ? `${rightResolved.table}.${rightResolved.field}` : rightResolved.field;
				}
				else
				{
					// No table prefix, convert the entire value as a field name using join source's mapper
					newCond.value = joinMapper.toDbField(valueStr);
				}
			}

			// Handle subqueries in JOIN conditions
			if ('subquery' in newCond && typeof newCond.subquery === 'object')
			{
				newCond.subquery = this.mapQueryToDb(newCond.subquery);
			}
		}

		// Recursively handle compound conditions (AND/OR/NOT)
		if ('and' in newCond && Array.isArray(newCond.and))
		{
			newCond.and = newCond.and.map(c => this.convertJoinCondition(c, joinMapper));
		}
		if ('or' in newCond && Array.isArray(newCond.or))
		{
			newCond.or = newCond.or.map(c => this.convertJoinCondition(c, joinMapper));
		}
		if ('not' in newCond && typeof newCond.not === 'object')
		{
			newCond.not = this.convertJoinCondition(newCond.not, joinMapper);
		}
		if ('like' in newCond && typeof newCond.like === 'object' && newCond.like !== null)
		{
			if ('field' in newCond.like && newCond.like.field !== undefined)
			{
				// Support repository.field or table.field format in LIKE conditions
				const resolved = this.resolveFieldReference(newCond.like.field);
				newCond.like.field = resolved.table ? `${resolved.table}.${resolved.field}` : resolved.field;
			}
		}

		return newCond;
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
		const convertField = (field: FieldReference | Aggregate): string | Aggregate =>
		{
			if (typeof field === 'string' || (typeof field === 'object' && 'field' in field && !('type' in field)))
			{
				// Handle FieldReference (string or object format)
				const resolved = this.resolveFieldReference(field as FieldReference);
				return resolved.table ? `${resolved.table}.${resolved.field}` : resolved.field;
			}
			if (typeof field === 'object' && field !== null && 'type' in field)
			{
				// Aggregate
				const newField = { ...field };
				if (newField.field)
				{
					// Handle repository.field or table.field format in aggregate
					const resolved = this.resolveFieldReference(newField.field);
					newField.field = resolved.table ? `${resolved.table}.${resolved.field}` : resolved.field;
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
			if ('field' in newCond && newCond.field !== undefined)
			{
				// Support repository.field or table.field format in conditions
				const resolved = this.resolveFieldReference(newCond.field);
				newCond.field = resolved.table ? `${resolved.table}.${resolved.field}` : resolved.field;

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
				if ('field' in newCond.like && newCond.like.field !== undefined)
				{
					// Support repository.field or table.field format in LIKE conditions
					const resolved = this.resolveFieldReference(newCond.like.field);
					newCond.like.field = resolved.table ? `${resolved.table}.${resolved.field}` : resolved.field;
				}
			}

			return newCond;
		};

		// Helper function to convert JOIN conditions
		const convertJoinOn = (join: Join): Join =>
		{
			// Use the helper to resolve JOIN source information
			const { table, mapper } = this.resolveJoinSourceInfo(join.source);

			// Create a new Join object instead of modifying the original
			const newJoin: Join = {
				type: join.type,
				source: { table },
				on: this.convertJoinCondition(join.on, mapper)
			};

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
			newQuery.orderBy = newQuery.orderBy.map(order =>
			{
				const { table, field } = this.resolveFieldReference(order.field);
				return {
					...order,
					field: table ? `${table}.${field}` : field
				};
			});
		}
		if (newQuery.groupBy)
		{
			newQuery.groupBy = newQuery.groupBy.map(field =>
			{
				const resolved = this.resolveFieldReference(field);
				return resolved.table ? `${resolved.table}.${resolved.field}` : resolved.field;
			});
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

			// Detect field conflicts in JOIN queries
			if (query?.joins && query.joins.length > 0)
			{
				this.detectFieldConflicts(query);
			}

			const dbQuery = this.mapQueryToDb({ ...query, type: 'SELECT', table: this.table });

			// Execute query using centralized method (uses PreparedQuery when available)
			const { rows } = await this.executeQuery<Record<string, any>>(dbQuery);
			const resultRows = rows ?? [];

			// If the query contains JOINs, we need to handle field mapping for multiple tables
			if (query?.joins && query.joins.length > 0)
			{
				const results = await Promise.all(resultRows.map(row => this.mapJoinedRowFromDb(row, query.joins!)));
				this.logger.debug(`Find query with JOINs completed`, { table: this.table, resultCount: results.length });
				return results;
			}
			else
			{
				// Simple query without JOINs, use the repository's mapper
				const results = await Promise.all(resultRows.map(row => this.mapper.fromDb(row)));
				this.logger.debug(`Find query completed`, { table: this.table, resultCount: results.length });
				return results;
			}
		}
		catch (err)
		{
			throw this.createError('find', err instanceof Error ? err.message : String(err), { query });
		}
	}

	/**
	 * Maps a joined row from database format to entity format,
	 * handling fields from multiple tables with their respective mappers.
	 * @param dbRow The database row containing fields from multiple tables
	 * @param joins The JOIN configurations from the query
	 * @returns The mapped entity object
	 */
	private async mapJoinedRowFromDb(dbRow: Record<string, any>, joins: Join[]): Promise<T>
	{
		const result: Record<string, any> = {};

		// Build a map of table names to their mappers and repository names
		const tableMappers = new Map<string, EntityFieldMapper<any>>();
		const tableToRepositoryName = new Map<string, string>();
		tableMappers.set(this.table, this.mapper);

		this.logger.debug(`Mapping joined row from DB`, { table: this.table, dbRow, joins });

		// Add mappers for joined tables
		for (const join of joins)
		{
			let tableName: string;
			let mapper: EntityFieldMapper<any>;
			let repositoryName: string | undefined;

			if ('repository' in join.source)
			{
				const repo = this.dataGateway.getRepository(join.source.repository);
				if (repo)
				{
					tableName = repo.getTable();
					mapper = repo.getMapper();
					repositoryName = join.source.repository;
				}
				else
				{
					// If repository not found, use default mapper
					tableName = join.source.repository;
					mapper = new DefaultFieldMapper();
				}
			}
			else
			{
				// Direct table reference, use default mapper
				tableName = join.source.table;
				mapper = new DefaultFieldMapper();
			}

			tableMappers.set(tableName, mapper);
			if (repositoryName)
			{
				tableToRepositoryName.set(tableName, repositoryName);
			}
		}

		// Process each column in the database row
		for (const dbColumn in dbRow)
		{
			let mapped = false;

			// Try to match the column to a table-prefixed format (table.column)
			// Many databases return columns with table prefixes when there are JOINs
			if (dbColumn.includes('.'))
			{
				const parts = dbColumn.split('.');
				if (parts.length === 2)
				{
					const [tableName, columnName] = parts;
					const mapper = tableMappers.get(tableName);
					if (mapper)
					{
						const fieldName = mapper.fromDbField(columnName);
						// Only add table prefix for non-main table fields
						// Main table fields should not have table prefix in the result
						if (tableName === this.table)
						{
							// Main table field: use field name without table prefix
							result[fieldName] = dbRow[dbColumn];
						}
						else
						{
							// Joined table field: use repository name if available, otherwise use table name
							const prefixName = tableToRepositoryName.get(tableName) || tableName;
							result[`${prefixName}.${fieldName}`] = dbRow[dbColumn];
						}
						mapped = true;
					}
					else
					{
						// Table not found in mappers, keep as-is with table prefix
						// This handles cases where table.field format is used but the table
						// doesn't have a corresponding mapper
						result[dbColumn] = dbRow[dbColumn];
						mapped = true;
					}
				}
			}

			// If not mapped yet, try each mapper to see if it can handle this column
			if (!mapped)
			{
				// First try the main repository's mapper
				const mainFieldName = this.mapper.fromDbField(dbColumn);
				if (mainFieldName !== dbColumn)
				{
					// The mapper recognized this column
					result[mainFieldName] = dbRow[dbColumn];
					mapped = true;
				}
				else
				{
					// Try other mappers
					for (const [tableName, mapper] of tableMappers.entries())
					{
						if (tableName === this.table) continue; // Already tried

						const fieldName = mapper.fromDbField(dbColumn);
						if (fieldName !== dbColumn)
						{
							// This mapper recognized the column
							// Use repository name if available, otherwise use table name
							const prefixName = tableToRepositoryName.get(tableName) || tableName;
							result[`${prefixName}.${fieldName}`] = dbRow[dbColumn];
							mapped = true;
							break;
						}
					}
				}
			}

			// If still not mapped, keep the original column name
			if (!mapped)
			{
				result[dbColumn] = dbRow[dbColumn];
			}
		}

		this.logger.debug(`Mapped row from DB`, { table: this.table, dbRow, result });

		return result as T;
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

			// Use PreparedQuery for security
			const { rows } = await this.executeQuery<Record<string, any>>(dbQuery);

			// The result will be in a field named 'result' due to the alias.
			// Coerce to Number as some DB drivers might return it as a string.
			return (rows && rows.length > 0) ? Number(rows[0].result) || 0 : 0;
		}
		catch (err)
		{
			throw this.createError('count', err instanceof Error ? err.message : String(err));
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

			// Use PreparedQuery for security
			const { rows } = await this.executeQuery<Record<string, any>>(dbQuery);

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
			throw this.createError('sum', err instanceof Error ? err.message : String(err));
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

			// Execute query using centralized method (uses PreparedQuery when available)
			const result = await this.executeQuery(dbQuery);

			const insertId = result.insertId ?? 0;
			this.logger.info(`Entity inserted successfully`, { table: this.table, insertId });
			return insertId;
		}
		catch (err)
		{
			throw this.createError('insert', err instanceof Error ? err.message : String(err));
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

			// Execute query using centralized method (uses PreparedQuery when available)
			const result = await this.executeQuery(dbQuery);

			return result.affectedRows ?? 0;
		}
		catch (err)
		{
			throw this.createError('update', err instanceof Error ? err.message : String(err));
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

			// Execute query using centralized method (uses PreparedQuery when available)
			const result = await this.executeQuery(dbQuery);

			return result.affectedRows ?? 0;
		}
		catch (err)
		{
			throw this.createError('delete', err instanceof Error ? err.message : String(err));
		}
	}
}
