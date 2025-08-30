
/**
 * Data converter interface, responsible for converting between database format and object entities.
 */
export interface EntityFieldMapper<T>
{
	/**
	 * Convert an entity field name to a database column name.
	 * @param field Entity field name
	 * @returns Database column name
	 */
	toDbField(field: string): string;

	/**
	 * Convert a database column name to an entity field name.
	 * @param column Database column name
	 * @returns Entity field name
	 */
	fromDbField(column: string): string;

	/**
	 * Convert data from the database to object entities.
	 * @param dbRow Database data
	 */
	fromDb(dbRow: Record<string, any>): Promise<T>;

	/**
	 * Convert object entities to database format.
	 * @param entity Object entity, supports partial updates
	 */
	toDb(entity: Partial<T>): Promise<Record<string, any>>;
}

/**
 * Default EntityFieldMapper, directly copies objects without any conversion.
 */
export class DefaultFieldMapper<T> implements EntityFieldMapper<T>
{
	toDbField(field: string): string
	{
		return field;
	}

	fromDbField(column: string): string
	{
		return column;
	}

	async fromDb(dbRow: Record<string, any>): Promise<T>
	{
		return dbRow as T;
	}

	async toDb(entity: Partial<T>): Promise<Record<string, any>>
	{
		return { ...entity };
	}
}

/**
 * An EntityFieldMapper that converts between database columns and entity fields using a provided mapping object.
 */
export class MappingFieldMapper<T> implements EntityFieldMapper<T>
{
	private readonly fieldToColumnMap: Record<string, string>;
	private readonly columnToFieldMap: Record<string, string>;

	/**
	 * @param mapping A mapping object where keys are entity field names and values are database column names.
	 */
	constructor(mapping: Record<string, string>)
	{
		this.fieldToColumnMap = mapping;
		this.columnToFieldMap = Object.fromEntries(
			Object.entries(mapping).map(([field, column]) => [column, field])
		);
	}

	toDbField(field: string): string
	{
		return this.fieldToColumnMap[field] || field;
	}

	fromDbField(column: string): string
	{
		return this.columnToFieldMap[column] || column;
	}

	async fromDb(dbRow: Record<string, any>): Promise<T>
	{
		const entity: Record<string, any> = {};
		for (const column in dbRow)
		{
			const field = this.fromDbField(column);
			entity[field] = dbRow[column];
		}
		return entity as T;
	}

	async toDb(entity: Partial<T>): Promise<Record<string, any>>
	{
		const dbRow: Record<string, any> = {};
		for (const field in entity)
		{
			const column = this.toDbField(field);
			dbRow[column] = (entity as any)[field];
		}
		return dbRow;
	}
}
