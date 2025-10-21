/**
 * PreparedQuery - Precompiled query with validated and escaped fields
 *
 * This represents a lower-level query format where all security validations
 * and field transformations have been completed by the QueryCompiler.
 * Providers can execute these queries directly without additional processing.
 *
 * @module preparedQuery
 */

/**
 * Precompiled query with validated and escaped fields.
 * All security checks and field transformations are complete.
 */
export interface PreparedQuery
{
	/** Query type */
	type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

	/** Validated table name (not escaped) */
	table: string;

	/** Validated and escaped field names (SELECT only) */
	safeFields?: string[];

	/** Validated and transformed values (INSERT/UPDATE) */
	values?: Record<string, any>;

	/** Precompiled WHERE condition with SQL fragment and parameters */
	where?: PreparedCondition;

	/** Precompiled JOIN clauses */
	joins?: PreparedJoin[];

	/** Validated and escaped GROUP BY fields */
	groupBy?: string[];

	/** Precompiled ORDER BY clauses */
	orderBy?: PreparedOrderBy[];

	/** Validated LIMIT value */
	limit?: number;

	/** Validated OFFSET value */
	offset?: number;
}

/**
 * Precompiled condition with SQL fragment and parameters.
 * The SQL fragment uses placeholders (?) and params contains the values.
 */
export interface PreparedCondition
{
	/** SQL condition fragment with placeholders (e.g., "name = ? AND age > ?") */
	sql: string;

	/** Parameter values in order */
	params: any[];
}

/**
 * Precompiled JOIN clause.
 */
export interface PreparedJoin
{
	/** JOIN type */
	type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL OUTER';

	/** Validated table name (not escaped) */
	table: string;

	/** Validated alias (if any) */
	alias?: string;

	/** Precompiled ON condition */
	on: PreparedCondition;
}

/**
 * Precompiled ORDER BY clause.
 */
export interface PreparedOrderBy
{
	/** Escaped field name (e.g., "`users`.`name`" for MySQL) */
	field: string;

	/** Sort direction */
	direction: 'ASC' | 'DESC';
}
