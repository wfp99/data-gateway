# Data Gateway

[![NPM version](https://img.shields.io/npm/v/@wfp99/data-gateway.svg)](https://www.npmjs.com/package/@wfp99/data-gateway)
[![License](https://img.shields.io/npm/l/@wfp99/data-gateway.svg)](./license)

A lightweight, extensible data access gateway for Node.js, supporting multiple data sources (MySQL, SQLite, remote API), custom providers, and middleware. Ideal for building modern, data-driven applications.

## Features

- Supports multiple data sources: MySQL, SQLite, Remote API
- Customizable providers and middleware
- Type-safe, written in TypeScript
- Unified query object model for CRUD and advanced queries
- Easy to extend and integrate

## Installation

```bash
# Install the core library
npm install @wfp99/data-gateway

# Then, install the driver(s) for the database(s) you want to use
npm install mysql2
# or
npm install sqlite sqlite3
```

## Quick Start

```typescript
import { DataGateway, MySQLProviderOptions, SQLiteProviderOptions } from '@wfp99/data-gateway';

// Define configuration for providers and repositories
const config = {
	providers: {
		// MySQL provider configuration
		mysql: {
			type: 'mysql',
			options: {
				host: 'localhost',
				user: 'root',
				password: '',
				database: 'test'
			} as MySQLProviderOptions
		},
		// SQLite provider configuration
		sqlite: {
			type: 'sqlite',
			options: { filename: './test.db' } as SQLiteProviderOptions
		}
	},
	repositories: {
		// User repository using MySQL
		user: { provider: 'mysql', table: 'users' },
		// Log repository using SQLite
		log: { provider: 'sqlite', table: 'logs' }
	}
};

(async () => {
	// Build the DataGateway instance
	const gateway = await DataGateway.build(config);

	// Get the user repository
	const userRepo = gateway.getRepository('user');

	// Query for active users
	const users = await userRepo?.find({ where: { field: 'status', op: '=', value: 'active' } });

	// Do something with the users (e.g., print them)
	console.log(users);

	// Disconnect all providers when done
	await gateway.disconnectAll();
})();
```

## Core Concepts

- **DataProvider**: Abstract interface for data sources. Built-in support for MySQL, SQLite, RemoteProvider, and custom providers.
- **Repository**: Encapsulates CRUD and query logic for a specific table.
- **Middleware**: Insert custom logic before/after queries (e.g., validation, logging, caching).
- **EntityFieldMapper**: Transforms between database rows and application objects. It also automatically maps field names used in queries (like `where`, `orderBy`, `fields`) to their corresponding database column names, allowing you to use application-level property names throughout your code.
- **QueryObject**: Unified query object format supporting conditions, pagination, sorting, aggregation, and more.


## Query Object Example

The `QueryObject` provides a flexible and unified way to describe database operations. Here's a more complex example of how to use it to query data:

```typescript
// Find all active users over 18, select specific fields,
// order by creation date, and get the first 10.
const userRepo = gateway.getRepository('user');
const users = await userRepo?.find({
    fields: ['id', 'name', 'email'],
    where: {
        and: [
            { field: 'status', op: '=', value: 'active' },
            { field: 'age', op: '>', value: 18 }
        ]
    },
    orderBy: [{ field: 'createdAt', direction: 'DESC' }],
    limit: 10,
    offset: 0
});

console.log(users);
```

Note: In the example above, field names like `status`, `age`, and `createdAt` are automatically converted to their corresponding database column names (e.g., `user_status`, `user_age`, `created_at`) by the `EntityFieldMapper` if a custom mapper is configured for the repository. This keeps your application code clean and decoupled from the database schema.

## Middleware Example

You can add middleware to intercept and process queries before or after they are executed. Middleware is useful for logging, validation, caching, etc.

```typescript
import { Middleware } from '@wfp99/data-gateway';

// Example: Logging middleware
const loggingMiddleware: Middleware = async (query, next) => {
	console.log('Query:', query);
	const result = await next(query);
	console.log('Result:', result);
	return result;
};

// Usage in repository config
const config = {
	providers: {
		// ...provider configs
	},
	repositories: {
		user: {
			provider: 'mysql',
			table: 'users',
			middlewares: [loggingMiddleware] // Attach middleware here
		}
	}
};
```

## Custom Provider Example

```typescript
import { DataProvider, Query, QueryResult } from '@wfp99/data-gateway';

class CustomProvider implements DataProvider {
	async connect() { /* ... */ }
	async disconnect() { /* ... */ }
	async query<T = any>(query: Query): Promise<QueryResult<T>> { /* ... */ }
}
```

## Supported Data Sources

- MySQL (requires `mysql2`)
- SQLite (requires `sqlite3`)
- Remote API (RemoteProvider)
- Custom providers

## License

MIT License

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/wfp99/data-gateway).

## Author

Wang Feng Ping
