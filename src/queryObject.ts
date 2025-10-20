
/**
 * Condition type, describes SQL query where conditions.
 * Supports basic operators, AND/OR/NOT, IN, LIKE, etc.
 * Examples:
 * { field: 'age', op: '>', value: 18 }
 * { and: [ ... ] }
 * Condition can support subquery,
 * e.g.: { field: 'id', op: 'IN', subquery: {...} }
 */
export type Condition =
	| { field: string; op: '=' | '!=' | '>' | '<' | '>=' | '<='; value: any }
	| { field: string; op: 'IN' | 'NOT IN'; subquery: Query }
	| { field: string; op: 'IN' | 'NOT IN'; values: any[] }
	| { and: Condition[] }
	| { or: Condition[] }
	| { not: Condition }
	| { like: { field: string; pattern: string } };

/**
 * Aggregate description, specifies aggregation type, target field, and alias.
 * Example: { type: 'COUNT', field: 'id', alias: 'total' }
 */
export interface Aggregate
{
	/** Aggregation type */
	type: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
	/** Target field */
	field: string;
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
	fields?: (string | Aggregate)[];
	/** Data to insert or update (for INSERT/UPDATE) */
	values?: Record<string, any>;
	/** Query condition */
	where?: Condition;
	/** JOIN settings */
	joins?: Join[];
	/** GROUP BY fields */
	groupBy?: string[];
	/** ORDER BY settings */
	orderBy?: { field: string; direction: 'ASC' | 'DESC' }[];
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