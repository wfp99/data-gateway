/**
 * QueryCompiler - Compiles high-level Query objects into PreparedQuery format
 *
 * The QueryCompiler is responsible for:
 * 1. Validating all query components using SQLValidator
 * 2. Escaping identifiers using the database-specific SQLEscaper
 * 3. Converting conditions into parameterized SQL fragments
 * 4. Producing a PreparedQuery that Providers can execute directly
 *
 * This centralizes all query preprocessing, removing this responsibility from Providers.
 *
 * @module queryCompiler
 */

import { Query, Condition, Join, Aggregate, FieldReference, fieldRefToString } from './queryObject';
import { PreparedQuery, PreparedCondition, PreparedJoin, PreparedOrderBy } from './preparedQuery';
import { SQLValidator } from './dataProviders/sqlValidator';
import { SQLEscaper } from './dataProviders/sqlEscaper';
import { getLogger } from './logger';

/**
 * QueryCompiler compiles high-level Query objects into PreparedQuery format.
 * All security validations and field transformations happen here.
 */
export class QueryCompiler
{
	private readonly logger: ReturnType<typeof getLogger>;

	/**
	 * Creates a QueryCompiler instance.
	 * @param escaper Database-specific identifier escaper (e.g., MySQLEscaper)
	 */
	constructor(
		private readonly escaper: SQLEscaper
	)
	{
		this.logger = getLogger('QueryCompiler');
	}

	/**
	 * Compiles a Query object into a PreparedQuery.
	 * Performs all validation, escaping, and transformation.
	 *
	 * @param query High-level query object
	 * @returns Precompiled query ready for execution
	 * @throws Error if validation fails
	 */
	compile(query: Query): PreparedQuery
	{
		this.logger.debug('Compiling query', { type: query.type, table: query.table });

		// Validate entire query structure first
		SQLValidator.validateQuery(query);

		const prepared: PreparedQuery = {
			type: query.type,
			table: query.table
		};

		// Compile each component
		if (query.fields && query.type === 'SELECT')
		{
			prepared.safeFields = this.compileFields(query.fields);
		}

		if (query.values && (query.type === 'INSERT' || query.type === 'UPDATE'))
		{
			prepared.values = query.values;
		}

		if (query.where)
		{
			prepared.where = this.compileCondition(query.where);
		}

		if (query.joins)
		{
			prepared.joins = query.joins.map(j => this.compileJoin(j));
		}

		if (query.groupBy)
		{
			prepared.groupBy = query.groupBy.map(f =>
				this.escaper.escapeIdentifier(fieldRefToString(f))
			);
		}

		if (query.orderBy)
		{
			prepared.orderBy = query.orderBy.map(o => this.compileOrderBy(o));
		}

		prepared.limit = query.limit;
		prepared.offset = query.offset;

		this.logger.debug('Query compiled successfully', { type: prepared.type, table: prepared.table });

		return prepared;
	}

	/**
	 * Compiles field list for SELECT queries.
	 * Handles both simple fields and aggregates.
	 *
	 * @param fields Field references or aggregates
	 * @returns Array of escaped field SQL fragments
	 */
	private compileFields(fields: (FieldReference | Aggregate)[]): string[]
	{
		return fields.map(field =>
		{
			// Handle wildcards
			if (field === '*')
			{
				return '*';
			}

			// Handle aggregates
			if (typeof field === 'object' && field !== null && 'type' in field)
			{
				const validAggregates = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
				const aggregate = field as Aggregate;

				if (validAggregates.includes(aggregate.type))
				{
					// It's an aggregate
					let sql = `${aggregate.type}(`;

					if (aggregate.field)
					{
						const fieldStr = fieldRefToString(aggregate.field);
						sql += this.escaper.escapeIdentifier(fieldStr);
					}
					else
					{
						sql += '*';
					}

					sql += ')';

					if (aggregate.alias)
					{
						sql += ` AS ${this.escaper.escapeIdentifier(aggregate.alias)}`;
					}

					return sql;
				}
			}

			// Regular field reference
			const fieldStr = fieldRefToString(field as FieldReference);
			return this.escaper.escapeIdentifier(fieldStr);
		});
	}

	/**
	 * Compiles a condition into a PreparedCondition with SQL and parameters.
	 * Recursively handles AND/OR/NOT conditions.
	 *
	 * @param condition Condition object
	 * @returns PreparedCondition with SQL fragment and parameters
	 */
	private compileCondition(condition: Condition): PreparedCondition
	{
		// Validate the condition structure
		SQLValidator.validateCondition(condition);

		// Handle logical operators (AND/OR/NOT)
		if ('and' in condition && condition.and)
		{
			const compiled = condition.and.map(c => this.compileCondition(c));
			return {
				sql: compiled.map(c => `(${c.sql})`).join(' AND '),
				params: compiled.flatMap(c => c.params)
			};
		}

		if ('or' in condition && condition.or)
		{
			const compiled = condition.or.map(c => this.compileCondition(c));
			return {
				sql: compiled.map(c => `(${c.sql})`).join(' OR '),
				params: compiled.flatMap(c => c.params)
			};
		}

		if ('not' in condition && condition.not)
		{
			const compiled = this.compileCondition(condition.not);
			return {
				sql: `NOT (${compiled.sql})`,
				params: compiled.params
			};
		}

		// Handle field conditions
		if ('field' in condition && condition.field)
		{
			const fieldStr = fieldRefToString(condition.field);
			const escapedField = this.escaper.escapeIdentifier(fieldStr);
			const op = condition.op;

			// Handle IN / NOT IN with subquery
			if ((op === 'IN' || op === 'NOT IN') && 'subquery' in condition)
			{
				const subquery = this.compile(condition.subquery);
				// Note: This is a simplified version. In production, you'd need to build the full SQL
				return {
					sql: `${escapedField} ${op} (SELECT ...)`,
					params: [] // Subquery params would go here
				};
			}

			// Handle IN / NOT IN with values
			if ((op === 'IN' || op === 'NOT IN') && 'values' in condition)
			{
				const values = condition.values;
				const placeholders = values.map(() => '?').join(', ');
				return {
					sql: `${escapedField} ${op} (${placeholders})`,
					params: values
				};
			}

			// Handle IS NULL / IS NOT NULL
			if (op === 'IS NULL' || op === 'IS NOT NULL')
			{
				return {
					sql: `${escapedField} ${op}`,
					params: []
				};
			}

			// Regular comparison (=, !=, >, <, >=, <=)
			if ('value' in condition)
			{
				return {
					sql: `${escapedField} ${op} ?`,
					params: [condition.value]
				};
			}
		}

		// Handle LIKE conditions
		if ('like' in condition && condition.like)
		{
			const fieldStr = fieldRefToString(condition.like.field);
			const escapedField = this.escaper.escapeIdentifier(fieldStr);
			return {
				sql: `${escapedField} LIKE ?`,
				params: [condition.like.pattern]
			};
		}

		// Fallback - should not reach here if validation is correct
		throw new Error('Invalid condition structure');
	}

	/**
	 * Compiles a JOIN clause.
	 *
	 * @param join Join specification
	 * @returns PreparedJoin with validated components
	 */
	private compileJoin(join: Join): PreparedJoin
	{
		if (!('table' in join.source))
		{
			throw new Error('JOIN source must specify a table');
		}

		return {
			type: join.type as 'INNER' | 'LEFT' | 'RIGHT' | 'FULL OUTER',
			table: join.source.table!,
			on: this.compileCondition(join.on)
		};
	}

	/**
	 * Compiles an ORDER BY clause.
	 *
	 * @param orderBy Order by specification
	 * @returns PreparedOrderBy with escaped field
	 */
	private compileOrderBy(orderBy: { field: FieldReference; direction: 'ASC' | 'DESC' }): PreparedOrderBy
	{
		return {
			field: this.escaper.escapeIdentifier(fieldRefToString(orderBy.field)),
			direction: orderBy.direction || 'ASC'
		};
	}
}
