import type { Query, Condition, Aggregate, Join, FieldReference, JoinSource } from './queryObject';
import { tableField, repoField, fieldRefToString } from './queryObject';

/**
 * Type for JOIN ON clause builder callback
 */
export type JoinOnBuilder = (builder: JoinConditionBuilder) => JoinConditionBuilder;

/**
 * Builder for JOIN ON conditions
 * Provides fluent API for building JOIN conditions
 */
export class JoinConditionBuilder
{
	private condition: Condition | undefined;

	/**
	 * Add an equality condition (field1 = field2)
	 */
	equals(leftField: FieldReference, rightField: FieldReference): this
	{
		this.condition = {
			field: leftField,
			op: '=',
			value: fieldRefToString(rightField)
		};
		return this;
	}

	/**
	 * Add a not-equals condition (field1 != field2)
	 */
	notEquals(leftField: FieldReference, rightField: FieldReference): this
	{
		this.condition = {
			field: leftField,
			op: '!=',
			value: fieldRefToString(rightField)
		};
		return this;
	}

	/**
	 * Add a LIKE condition
	 */
	like(field: FieldReference, pattern: string): this
	{
		this.condition = {
			like: { field, pattern }
		};
		return this;
	}

	/**
	 * Add an IS NULL condition
	 */
	isNull(field: FieldReference): this
	{
		this.condition = {
			field,
			op: 'IS NULL'
		};
		return this;
	}

	/**
	 * Add an IS NOT NULL condition
	 */
	isNotNull(field: FieldReference): this
	{
		this.condition = {
			field,
			op: 'IS NOT NULL'
		};
		return this;
	}

	/**
	 * Combine current condition with another using AND
	 */
	and(callback: JoinOnBuilder): this
	{
		const builder = new JoinConditionBuilder();
		callback(builder);
		const newCondition = builder.build();

		if (this.condition && newCondition)
		{
			this.condition = {
				and: [this.condition, newCondition]
			};
		}
		else if (newCondition)
		{
			this.condition = newCondition;
		}

		return this;
	}

	/**
	 * Combine current condition with another using OR
	 */
	or(callback: JoinOnBuilder): this
	{
		const builder = new JoinConditionBuilder();
		callback(builder);
		const newCondition = builder.build();

		if (this.condition && newCondition)
		{
			this.condition = {
				or: [this.condition, newCondition]
			};
		}
		else if (newCondition)
		{
			this.condition = newCondition;
		}

		return this;
	}

	/**
	 * Build and return the final condition
	 */
	build(): Condition | undefined
	{
		return this.condition;
	}
}

/**
 * Builder for WHERE conditions
 * Provides fluent API for building complex WHERE clauses
 */
export class WhereBuilder
{
	private conditions: Condition[] = [];

	/**
	 * Add a field condition with operator
	 */
	field(field: FieldReference, op: '=' | '!=' | '>' | '<' | '>=' | '<=', value: any): this
	{
		this.conditions.push({ field, op, value });
		return this;
	}

	/**
	 * Add an equals condition (field = value)
	 */
	equals(field: FieldReference, value: any): this
	{
		return this.field(field, '=', value);
	}

	/**
	 * Add a not-equals condition (field != value)
	 */
	notEquals(field: FieldReference, value: any): this
	{
		return this.field(field, '!=', value);
	}

	/**
	 * Add a greater-than condition (field > value)
	 */
	greaterThan(field: FieldReference, value: any): this
	{
		return this.field(field, '>', value);
	}

	/**
	 * Add a less-than condition (field < value)
	 */
	lessThan(field: FieldReference, value: any): this
	{
		return this.field(field, '<', value);
	}

	/**
	 * Add a greater-than-or-equals condition (field >= value)
	 */
	greaterThanOrEquals(field: FieldReference, value: any): this
	{
		return this.field(field, '>=', value);
	}

	/**
	 * Add a less-than-or-equals condition (field <= value)
	 */
	lessThanOrEquals(field: FieldReference, value: any): this
	{
		return this.field(field, '<=', value);
	}

	/**
	 * Add an IN condition (field IN values)
	 */
	in(field: FieldReference, values: any[]): this
	{
		this.conditions.push({ field, op: 'IN', values });
		return this;
	}

	/**
	 * Add a NOT IN condition (field NOT IN values)
	 */
	notIn(field: FieldReference, values: any[]): this
	{
		this.conditions.push({ field, op: 'NOT IN', values });
		return this;
	}

	/**
	 * Add an IS NULL condition (field IS NULL)
	 */
	isNull(field: FieldReference): this
	{
		this.conditions.push({ field, op: 'IS NULL' });
		return this;
	}

	/**
	 * Add an IS NOT NULL condition (field IS NOT NULL)
	 */
	isNotNull(field: FieldReference): this
	{
		this.conditions.push({ field, op: 'IS NOT NULL' });
		return this;
	}

	/**
	 * Add a LIKE condition
	 */
	like(field: FieldReference, pattern: string): this
	{
		this.conditions.push({ like: { field, pattern } });
		return this;
	}

	/**
	 * Add a nested AND condition
	 */
	and(callback: (builder: WhereBuilder) => void): this
	{
		const builder = new WhereBuilder();
		callback(builder);
		const condition = builder.build();
		if (condition)
		{
			this.conditions.push(condition);
		}
		return this;
	}

	/**
	 * Add a nested OR condition
	 */
	or(callback: (builder: WhereBuilder) => void): this
	{
		const builder = new WhereBuilder();
		callback(builder);
		const builtConditions = builder.conditions;
		if (builtConditions.length > 0)
		{
			this.conditions.push({ or: builtConditions });
		}
		return this;
	}

	/**
	 * Add a NOT condition
	 */
	not(callback: (builder: WhereBuilder) => void): this
	{
		const builder = new WhereBuilder();
		callback(builder);
		const condition = builder.build();
		if (condition)
		{
			this.conditions.push({ not: condition });
		}
		return this;
	}

	/**
	 * Build and return the final condition
	 */
	build(): Condition | undefined
	{
		if (this.conditions.length === 0) return undefined;
		if (this.conditions.length === 1) return this.conditions[0];
		return { and: this.conditions };
	}
}

/**
 * Main QueryBuilder class
 * Provides fluent API for building SQL queries
 *
 * @example
 * ```typescript
 * const query = new QueryBuilder('users')
 *   .select('id', 'name', 'email')
 *   .where(w => w
 *     .equals('status', 'active')
 *     .greaterThan('age', 18)
 *   )
 *   .orderBy('createdAt', 'DESC')
 *   .limit(10)
 *   .build();
 * ```
 */
export class QueryBuilder
{
	private query: Partial<Query> = {};

	/**
	 * Create a new QueryBuilder
	 * @param table - Table name (optional, can be set later)
	 */
	constructor(table?: string)
	{
		if (table)
		{
			this.query.table = table;
		}
	}

	/**
	 * Set the table name
	 */
	table(table: string): this
	{
		this.query.table = table;
		return this;
	}

	/**
	 * Add SELECT fields
	 * @param fields - Field references or aggregate functions
	 */
	select(...fields: (FieldReference | Aggregate)[]): this
	{
		this.query.type = 'SELECT';
		this.query.fields = [...(this.query.fields || []), ...fields];
		return this;
	}

	/**
	 * Add an aggregate function
	 */
	count(field: FieldReference, alias?: string): this
	{
		return this.select({ type: 'COUNT', field, alias });
	}

	/**
	 * Add a SUM aggregate
	 */
	sum(field: FieldReference, alias?: string): this
	{
		return this.select({ type: 'SUM', field, alias });
	}

	/**
	 * Add an AVG aggregate
	 */
	avg(field: FieldReference, alias?: string): this
	{
		return this.select({ type: 'AVG', field, alias });
	}

	/**
	 * Add a MIN aggregate
	 */
	min(field: FieldReference, alias?: string): this
	{
		return this.select({ type: 'MIN', field, alias });
	}

	/**
	 * Add a MAX aggregate
	 */
	max(field: FieldReference, alias?: string): this
	{
		return this.select({ type: 'MAX', field, alias });
	}

	/**
	 * Set WHERE conditions
	 */
	where(callback: (builder: WhereBuilder) => void): this
	{
		const builder = new WhereBuilder();
		callback(builder);
		this.query.where = builder.build();
		return this;
	}

	/**
	 * Add a JOIN clause
	 */
	join(
		type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL',
		source: JoinSource,
		onCallback: JoinOnBuilder
	): this
	{
		const builder = new JoinConditionBuilder();
		onCallback(builder);
		const condition = builder.build();

		if (condition)
		{
			const join: Join = { type, source, on: condition };
			this.query.joins = [...(this.query.joins || []), join];
		}

		return this;
	}

	/**
	 * Add an INNER JOIN
	 */
	innerJoin(source: JoinSource, onCallback: JoinOnBuilder): this
	{
		return this.join('INNER', source, onCallback);
	}

	/**
	 * Add a LEFT JOIN
	 */
	leftJoin(source: JoinSource, onCallback: JoinOnBuilder): this
	{
		return this.join('LEFT', source, onCallback);
	}

	/**
	 * Add a RIGHT JOIN
	 */
	rightJoin(source: JoinSource, onCallback: JoinOnBuilder): this
	{
		return this.join('RIGHT', source, onCallback);
	}

	/**
	 * Add a FULL JOIN
	 */
	fullJoin(source: JoinSource, onCallback: JoinOnBuilder): this
	{
		return this.join('FULL', source, onCallback);
	}

	/**
	 * Add GROUP BY fields
	 */
	groupBy(...fields: FieldReference[]): this
	{
		this.query.groupBy = [...(this.query.groupBy || []), ...fields];
		return this;
	}

	/**
	 * Add ORDER BY clause
	 */
	orderBy(field: FieldReference, direction: 'ASC' | 'DESC' = 'ASC'): this
	{
		this.query.orderBy = [
			...(this.query.orderBy || []),
			{ field, direction }
		];
		return this;
	}

	/**
	 * Set LIMIT
	 */
	limit(limit: number): this
	{
		this.query.limit = limit;
		return this;
	}

	/**
	 * Set OFFSET
	 */
	offset(offset: number): this
	{
		this.query.offset = offset;
		return this;
	}

	/**
	 * Build and return the final Query object
	 */
	build(): Query
	{
		if (!this.query.table)
		{
			throw new Error('Table name is required');
		}

		if (!this.query.type)
		{
			this.query.type = 'SELECT';
		}

		return this.query as Query;
	}

	/**
	 * Create a new QueryBuilder for INSERT operation
	 */
	static insert(table: string, values: Record<string, any>): QueryBuilder
	{
		const builder = new QueryBuilder(table);
		builder.query.type = 'INSERT';
		builder.query.values = values;
		return builder;
	}

	/**
	 * Create a new QueryBuilder for UPDATE operation
	 */
	static update(table: string, values: Record<string, any>): QueryBuilder
	{
		const builder = new QueryBuilder(table);
		builder.query.type = 'UPDATE';
		builder.query.values = values;
		return builder;
	}

	/**
	 * Create a new QueryBuilder for DELETE operation
	 */
	static delete(table: string): QueryBuilder
	{
		const builder = new QueryBuilder(table);
		builder.query.type = 'DELETE';
		return builder;
	}
}

// Export helper functions for convenience
export { tableField, repoField, fieldRefToString };
