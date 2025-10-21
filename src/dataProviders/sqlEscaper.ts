/**
 * Abstract class for SQL identifier escaping
 * Different databases use different escape characters
 */
export abstract class SQLEscaper
{
	/**
	 * Escape identifiers (table names, field names, etc.)
	 * @param identifier Identifier to escape
	 * @returns Escaped identifier
	 */
	abstract escapeIdentifier(identifier: string): string;
}

/**
 * MySQL identifier escaper
 * Uses backticks (`) to escape identifiers
 */
export class MySQLEscaper extends SQLEscaper
{
	/**
	 * Escape identifiers using backticks, supports table.field format
	 * @param identifier Identifier (e.g., "users.id" or "id")
	 * @returns Escaped identifier (e.g., "`users`.`id`" or "`id`")
	 */
	escapeIdentifier(identifier: string): string
	{
		// Split by dot to handle table.field format
		const parts = identifier.split('.');

		// Escape each part separately
		return parts.map(part => `\`${part}\``).join('.');
	}
}

/**
 * PostgreSQL identifier escaper
 * Uses double quotes (") to escape identifiers
 */
export class PostgreSQLEscaper extends SQLEscaper
{
	/**
	 * Escape identifiers using double quotes, supports table.field format
	 * @param identifier Identifier (e.g., "users.id" or "id")
	 * @returns Escaped identifier (e.g., "\"users\".\"id\"" or "\"id\"")
	 */
	escapeIdentifier(identifier: string): string
	{
		// Split by dot to handle table.field format
		const parts = identifier.split('.');

		// Escape each part separately
		return parts.map(part => `"${part}"`).join('.');
	}
}

/**
 * SQLite identifier escaper
 * Uses double quotes (") to escape identifiers
 */
export class SQLiteEscaper extends SQLEscaper
{
	/**
	 * Escape identifiers using double quotes, supports table.field format
	 * @param identifier Identifier (e.g., "users.id" or "id")
	 * @returns Escaped identifier (e.g., "\"users\".\"id\"" or "\"id\"")
	 */
	escapeIdentifier(identifier: string): string
	{
		// Split by dot to handle table.field format
		const parts = identifier.split('.');

		// Escape each part separately
		return parts.map(part => `"${part}"`).join('.');
	}
}
