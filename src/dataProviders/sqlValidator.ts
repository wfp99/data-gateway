import { getLogger } from '../logger';
import { Query, Condition, FieldReference, Aggregate, fieldRefToString } from '../queryObject';

/**
 * SQL security validation utility class
 * Provides universal SQL validation functionality across databases
 */
export class SQLValidator
{
	private static readonly logger = getLogger('SQLValidator');

	/**
	 * Validate SQL identifiers (table names, field names, etc.)
	 * Only allows letters, numbers, underscores, and dots (for table.field format)
	 * @param identifier Identifier to validate
	 * @returns Validated identifier
	 * @throws Error if identifier is invalid
	 */
	static validateIdentifier(identifier: string): string
	{
		this.logger.debug('Validating SQL identifier', { identifier });

		if (!identifier || typeof identifier !== 'string')
		{
			this.logger.error('Invalid identifier: empty or non-string', { identifier });
			throw new Error('Invalid identifier: empty or non-string');
		}

		// Allow letter start, followed by letters, numbers, underscores, and dots (for table.field format)
		const pattern = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/;
		if (!pattern.test(identifier) || identifier.length > 128)
		{
			this.logger.error('Invalid SQL identifier detected', {
				identifier,
				reason: 'Contains invalid characters or too long'
			});
			throw new Error(`Invalid identifier: ${identifier}`);
		}

		this.logger.debug('SQL identifier validated successfully', { identifier });
		return identifier;
	}

	/**
	 * Validate alias
	 * @param alias Alias to validate
	 * @returns Validated alias
	 */
	static validateAlias(alias: string): string
	{
		this.logger.debug('Validating SQL alias', { alias });

		// Aliases cannot contain dots
		if (!alias || typeof alias !== 'string')
		{
			this.logger.error('Invalid alias: empty or non-string', { alias });
			throw new Error('Invalid alias: empty or non-string');
		}

		const pattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
		if (!pattern.test(alias))
		{
			this.logger.error('Invalid SQL alias detected', { alias, reason: 'Contains invalid characters' });
			throw new Error(`Invalid alias: ${alias}`);
		}

		this.logger.debug('SQL alias validated successfully', { alias });
		return alias;
	}

	/**
	 * Validate ORDER BY direction
	 * @param direction Sort direction
	 * @returns Validated direction (uppercase)
	 */
	static validateDirection(direction: string): string
	{
		this.logger.debug('Validating ORDER BY direction', { direction });

		const validDirections = ['ASC', 'DESC'];
		const upperDirection = direction.toUpperCase();

		if (!validDirections.includes(upperDirection))
		{
			this.logger.error('Invalid ORDER BY direction detected', { direction, validDirections });
			throw new Error(`Invalid ORDER BY direction: ${direction}`);
		}

		this.logger.debug('ORDER BY direction validated successfully', { direction: upperDirection });
		return upperDirection;
	}

	/**
	 * Validate JOIN type
	 * @param joinType JOIN type
	 * @returns Validated JOIN type (uppercase)
	 */
	static validateJoinType(joinType: string): string
	{
		this.logger.debug('Validating JOIN type', { joinType });

		const validTypes = ['INNER', 'LEFT', 'RIGHT', 'FULL', 'FULL OUTER'];
		const upperType = joinType.toUpperCase();

		if (!validTypes.includes(upperType))
		{
			this.logger.error('Invalid JOIN type detected', { joinType, validTypes });
			throw new Error(`Invalid JOIN type: ${joinType}`);
		}

		this.logger.debug('JOIN type validated successfully', { joinType: upperType });
		return upperType;
	}

	/**
	 * Validate operator
	 * @param operator Operator
	 * @returns Returns true if operator is valid
	 */
	static validateOperator(operator: string): boolean
	{
		const allowedOps = [
			'=', '!=', '<>', '<', '>', '<=', '>=',
			'LIKE', 'NOT LIKE', 'IN', 'NOT IN',
			'IS NULL', 'IS NOT NULL'
		];
		return allowedOps.includes(operator.toUpperCase());
	}

	/**
	 * Validate aggregate function type
	 * @param type Aggregate function type
	 * @returns Returns true if type is valid
	 */
	static validateAggregateType(type: string): boolean
	{
		const validAggregates = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
		return validAggregates.includes(type.toUpperCase());
	}

	/**
	 * Validate LIMIT/OFFSET value
	 * @param value LIMIT or OFFSET value
	 * @throws Error if value is invalid
	 */
	static validateLimitOffset(value: any): void
	{
		if (value !== undefined && (!Number.isInteger(value) || value < 0))
		{
			this.logger.error('Invalid LIMIT/OFFSET value detected', { value });
			throw new Error(`Invalid LIMIT/OFFSET value: ${value}`);
		}
	}

	/**
	 * Validate query structure for security
	 * @param query Query object
	 */
	static validateQuery(query: Query): void
	{
		this.logger.debug('Validating query structure', { type: query.type, table: query.table });

		// Validate table name
		if (query.table)
		{
			this.validateIdentifier(query.table);
		}

		// Validate fields
		if (query.fields)
		{
			this.logger.debug('Validating query fields', { fieldCount: query.fields.length });
			for (const field of query.fields)
			{
				this.validateField(field);
			}
		}

		// Validate WHERE condition
		if (query.where)
		{
			this.logger.debug('Validating WHERE condition');
			this.validateCondition(query.where);
		}

		// Validate ORDER BY
		if (query.orderBy)
		{
			for (const order of query.orderBy)
			{
				this.validateIdentifier(fieldRefToString(order.field));
				if (order.direction)
				{
					this.validateDirection(order.direction);
				}
			}
		}

		// Validate GROUP BY
		if (query.groupBy)
		{
			for (const field of query.groupBy)
			{
				this.validateIdentifier(fieldRefToString(field));
			}
		}

		// Validate JOINs
		if (query.joins)
		{
			for (const join of query.joins)
			{
				if ('table' in join.source)
				{
					this.validateJoinType(join.type);
					this.validateIdentifier(join.source.table!);
					this.validateCondition(join.on);
				}
				else
				{
					this.logger.error('JOIN source must specify a table name', { joinSource: join.source });
					throw new Error('JOIN source must specify a table name');
				}
			}
		}

		// Validate LIMIT and OFFSET
		this.validateLimitOffset(query.limit);
		this.validateLimitOffset(query.offset);

		// Validate values (for INSERT/UPDATE)
		if (query.values)
		{
			this.logger.debug('Validating query values', { columnCount: Object.keys(query.values).length });
			for (const key of Object.keys(query.values))
			{
				this.validateIdentifier(key);
			}
		}

		this.logger.debug('Query structure validation completed successfully', { type: query.type, table: query.table });
	}

	/**
	 * Validate field (supports string, FieldReference object, and Aggregate)
	 * @param field Field to validate
	 */
	private static validateField(field: FieldReference | Aggregate): void
	{
		if (typeof field === 'object' && field !== null && 'type' in field)
		{
			const validAggregates = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
			const fieldType = (field as any).type;

			if (validAggregates.includes(fieldType))
			{
				// This is an Aggregate
				const aggregate = field as Aggregate;
				if (!this.validateAggregateType(aggregate.type))
				{
					this.logger.error('Invalid aggregate type detected', {
						aggregateType: aggregate.type,
						validAggregates
					});
					throw new Error(`Invalid aggregate type: ${aggregate.type}`);
				}
				this.validateIdentifier(fieldRefToString(aggregate.field));
				if (aggregate.alias)
				{
					this.validateAlias(aggregate.alias);
				}
			}
			else
			{
				// This is a FieldReference object
				const fieldStr = fieldRefToString(field as FieldReference);
				if (fieldStr !== '*')
				{
					this.validateIdentifier(fieldStr);
				}
			}
		}
		else
		{
			// This is a string FieldReference
			const fieldStr = fieldRefToString(field as FieldReference);
			if (fieldStr !== '*')
			{
				this.validateIdentifier(fieldStr);
			}
		}
	}

	/**
	 * Recursively validate condition structure
	 * @param condition Condition object
	 */
	static validateCondition(condition: Condition): void
	{
		if (!condition) return;

		this.logger.debug('Validating condition structure', { conditionType: Object.keys(condition) });

		if ('field' in condition)
		{
			this.logger.debug('Validating field condition', { field: condition.field, operator: (condition as any).op });
			this.validateIdentifier(fieldRefToString(condition.field));

			if ('op' in condition && (condition as any).op)
			{
				if (!this.validateOperator((condition as any).op))
				{
					this.logger.error('Invalid operator detected', { operator: (condition as any).op });
					throw new Error(`Invalid operator: ${(condition as any).op}`);
				}
			}

			if ('subquery' in condition && typeof (condition as any).subquery === 'object')
			{
				this.logger.debug('Validating subquery in condition');
				this.validateQuery((condition as any).subquery);
			}
		}

		if ('and' in condition)
		{
			this.logger.debug('Validating AND condition', { subconditionCount: condition.and.length });
			for (const cond of condition.and)
			{
				this.validateCondition(cond);
			}
		}

		if ('or' in condition)
		{
			this.logger.debug('Validating OR condition', { subconditionCount: condition.or.length });
			for (const cond of condition.or)
			{
				this.validateCondition(cond);
			}
		}

		if ('not' in condition)
		{
			this.logger.debug('Validating NOT condition');
			this.validateCondition(condition.not);
		}

		if ('like' in condition)
		{
			this.logger.debug('Validating LIKE condition', { field: condition.like.field });
			this.validateIdentifier(fieldRefToString(condition.like.field));
		}
	}
}
