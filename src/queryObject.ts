
/**
 * Field reference type - represents a field with optional table/repository prefix
 * Formats supported:
 * - 'field' - simple field name
 * - 'table.field' - table-prefixed field
 * - 'repository.field' - repository-prefixed field
 */
export type FieldReference = string | {
	table?: string;
	repository?: string;
	field: string;
};

/**
 * Helper function to create a field reference with table prefix
 */
export function tableField(table: string, field: string): FieldReference
{
	return { table, field };
}

/**
 * Helper function to create a field reference with repository prefix
 */
export function repoField(repository: string, field: string): FieldReference
{
	return { repository, field };
}

/**
 * Converts a FieldReference to string format
 */
export function fieldRefToString(ref: FieldReference): string
{
	if (typeof ref === 'string')
	{
		return ref;
	}

	const prefix = ref.table || ref.repository;
	return prefix ? `${prefix}.${ref.field}` : ref.field;
}

/**
 * Condition type, describes SQL query where conditions.
 * Supports basic operators, AND/OR/NOT, IN, LIKE, IS NULL, IS NOT NULL, etc.
 * Examples:
 * { field: 'age', op: '>', value: 18 }
 * { field: 'deleted_at', op: 'IS NULL' }
 * { and: [ ... ] }
 * Condition can support subquery,
 * e.g.: { field: 'id', op: 'IN', subquery: {...} }
 */
export type Condition =
	| { field: FieldReference; op: '=' | '!=' | '>' | '<' | '>=' | '<='; value: any }
	| { field: FieldReference; op: 'IN' | 'NOT IN'; subquery: Query }
	| { field: FieldReference; op: 'IN' | 'NOT IN'; values: any[] }
	| { field: FieldReference; op: 'IS NULL' | 'IS NOT NULL' }
	| { and: Condition[] }
	| { or: Condition[] }
	| { not: Condition }
	| { like: { field: FieldReference; pattern: string } };

/**
 * Aggregate description, specifies aggregation type, target field, and alias.
 * Example: { type: 'COUNT', field: 'id', alias: 'total' }
 */
export interface Aggregate
{
	/** Aggregation type */
	type: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
	/** Target field */
	field: FieldReference;
	/** Result alias (optional) */
	alias?: string;
}

/** JOIN source can be specified by repository name or table name. */
export type JoinSource =
	| { repository: string }   // Reference a repository by name
	| { table: string };        // Reference a table directly

/**
 * JOIN description, defines JOIN type, target table, and join condition.
 */
export interface Join
{
	/** JOIN type (INNER/LEFT/RIGHT/FULL) */
	type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
	/** Source table or repository for the JOIN */
	source: JoinSource;
	/** JOIN condition */
	on: Condition;
}

/**
 * Query main object, describes a SQL query (SELECT/INSERT/UPDATE/DELETE).
 * Can express fields, conditions, JOIN, GROUP BY, ORDER BY, pagination, nested queries, etc.
 */
export interface Query
{
	/** Query type: SELECT/INSERT/UPDATE/DELETE */
	type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
	/** Target table name */
	table: string;
	/** Fields to query or operate (can include aggregates) */
	fields?: (FieldReference | Aggregate)[];
	/** Data to insert or update (for INSERT/UPDATE) */
	values?: Record<string, any>;
	/** Query condition */
	where?: Condition;
	/** JOIN settings */
	joins?: Join[];
	/** GROUP BY fields */
	groupBy?: FieldReference[];
	/** ORDER BY settings */
	orderBy?: { field: FieldReference; direction: 'ASC' | 'DESC' }[];
	/** Limit number of rows */
	limit?: number;
	/** Pagination offset */
	offset?: number;
}

/**
 * General query result object definition, suitable for various CRUD operations and different types of databases.
 * If an error occurs, the error field is returned.
 */
export interface QueryResult<T = any>
{
	/** SELECT query result rows */
	rows?: T[];

	/** Number of rows affected by INSERT, UPDATE, or DELETE operations. */
	affectedRows?: number;

	/** Primary key value of newly inserted data (optional, supported by some databases) */
	insertId?: number | string;

	/** Error message when query fails */
	error?: string;
}