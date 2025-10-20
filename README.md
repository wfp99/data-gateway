# Data Gateway

[English](./README.md) | [繁體中文](./README.zh-TW.md)

[![NPM version](https://img.shields.io/npm/v/@wfp99/data-gateway.svg)](https://www.npmjs.com/package/@wfp99/data-gateway)
[![License](https://img.shields.io/npm/l/@wfp99/data-gateway.svg)](./LICENSE)

A lightweight, extensible data access gateway for Node.js, supporting multiple data sources (MySQL, PostgreSQL, SQLite, Remote API), custom providers, and middleware. Ideal for building modern, data-driven applications.

## Features

- Supports multiple data sources: MySQL, PostgreSQL, SQLite, Remote API
- **Connection pooling support** for improved performance and resource management
- **Configurable logging** with multiple log levels (ALL, DEBUG, INFO, WARN, ERROR, OFF)
- Customizable providers and middleware
- Type-safe, written in TypeScript
- Unified query object model for CRUD and advanced queries
- Easy to extend and integrate

## Installation

```bash
# Install the core library
npm install @wfp99/data-gateway

# Then, install only the driver(s) for the database(s) you want to use.
# Thanks to lazy loading, you only need to install what you actually use.

# For MySQL support:
npm install mysql2

# For PostgreSQL support:
npm install pg @types/pg

# For SQLite support:
npm install sqlite3

# For Remote API only (no additional dependencies needed):
# You're all set! 🎉
```

### Lazy Loading Benefits

- **Install only what you need**: The library uses lazy loading to import database providers only when actually used
- **No forced dependencies**: You can use RemoteProvider without installing any database drivers

## Quick Start

```typescript
import { DataGateway, LogLevel, MySQLProviderOptions, RemoteProviderOptions } from '@wfp99/data-gateway';

// Define configuration for providers and repositories
const config = {
	providers: {
		// MySQL provider configuration with connection pooling
		mysql: {
			type: 'mysql',
			options: {
				host: 'localhost',
				user: 'root',
				password: '',
				database: 'test',
				// Connection pool configuration (optional)
				pool: {
					usePool: true,          // Enable connection pooling (default: true)
					connectionLimit: 10,    // Maximum connections in pool (default: 10)
					acquireTimeout: 60000,  // Connection acquisition timeout (default: 60000ms)
					timeout: 600000,        // Idle connection timeout (default: 600000ms)
				}
			} as MySQLProviderOptions
		},
        // Remote API provider configuration
        remote: {
            type: 'remote',
            options: {
                endpoint: 'https://api.example.com/data',
                bearerToken: 'your-secret-token'
            } as RemoteProviderOptions
        }
	},
	repositories: {
		// User repository using MySQL
		user: { provider: 'mysql', table: 'users' },
        // Product repository using a remote API
        product: { provider: 'remote' }
	},
	// Logging configuration (optional)
	logging: {
		level: LogLevel.INFO,     // Log level: ALL, DEBUG, INFO, WARN, ERROR, OFF
		format: 'pretty'          // Format: 'pretty' or 'json'
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

	// Monitor connection pool status
	const poolStatus = gateway.getProviderPoolStatus('mysql');
	if (poolStatus) {
		console.log(`MySQL Pool: ${poolStatus.activeConnections}/${poolStatus.maxConnections} connections active`);
	}

	// Disconnect all providers when done
	await gateway.disconnectAll();
})();
```

## Documentation

For more detailed information, please see the [documentation](./docs/README.en.md).

### Quick Links
- [Installation Guide](./docs/guides/installation.en.md) - Detailed installation instructions
- [Quick Start Guide](./docs/guides/quick-start.en.md) - Get started in 5 minutes
- [Basic Usage](./docs/guides/basic-usage.en.md) - Common usage patterns
- [Logging Guide](./docs/guides/logging.en.md) - Configure and use the logging system
- [Architecture Design](./docs/core/architecture.en.md) - Understanding the core concepts
- [Connection Pooling](./docs/advanced/connection-pooling.en.md) - Advanced performance features

### Provider Guides
- [MySQL Provider](./docs/providers/mysql.en.md)
- [PostgreSQL Provider](./docs/providers/postgresql.en.md)
- [SQLite Provider](./docs/providers/sqlite.en.md)
- [Remote API Provider](./docs/providers/remote.en.md)
- [Custom Providers](./docs/providers/custom.en.md)

### Additional Guides
- [Date Object Handling](./docs/guides/date-handling.en.md) - Automatic Date conversion with databases

## Core Concepts

- **DataProvider**: Abstract interface for data sources. Built-in support for MySQL, SQLite, RemoteProvider, and custom providers.
- **Repository**: Encapsulates CRUD and query logic for a specific table.
- **Middleware**: Insert custom logic before/after queries (e.g., validation, logging, caching).
- **EntityFieldMapper**: Transforms between database rows and application objects. It also automatically maps field names used in queries (like `where`, `orderBy`, `fields`) to their corresponding database column names, allowing you to use application-level property names throughout your code.
- **QueryObject**: Unified query object format supporting conditions, pagination, sorting, aggregation, and more.


## Usage Examples

The `Repository` provides a simple and powerful API for all CRUD operations.

### Creating Data

```typescript
const userRepo = gateway.getRepository('user');

// Insert with full object
const newUserId = await userRepo.insert({
    name: 'John Doe',
    email: 'john.doe@example.com',
    age: 30,
    status: 'active'
});

// Insert with partial object (allowing database default values)
const anotherUserId = await userRepo.insert({
    name: 'Jane Smith',
    email: 'jane.smith@example.com'
    // age and status will use database default values if defined
});

console.log(`New user created with ID: ${newUserId}`);
console.log(`Another user created with ID: ${anotherUserId}`);
```

### Reading Data (Queries)

The `QueryObject` provides a flexible and unified way to describe database operations. Here's a more complex example:

```typescript
// Find all active users over 18, select specific fields,
// order by creation date, and get the first 10.
const userRepo = gateway.getRepository('user');
const users = await userRepo.find({
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

*Note: In the examples above, field names like `status`, `age`, and `createdAt` are automatically converted to their corresponding database column names (e.g., `user_status`, `user_age`, `created_at`) by the `EntityFieldMapper` if a custom mapper is configured for the repository. This keeps your application code clean and decoupled from the database schema.*

### Updating Data

```typescript
const userRepo = gateway.getRepository('user');

const affectedRows = await userRepo.update(
    { status: 'inactive' }, // values to update
    { field: 'id', op: '=', value: newUserId } // where condition
);

console.log(`${affectedRows} user(s) updated.`);
```

### Deleting Data

```typescript
const userRepo = gateway.getRepository('user');

const deletedRows = await userRepo.delete(
    { field: 'id', op: '=', value: newUserId } // where condition
);

console.log(`${deletedRows} user(s) deleted.`);
```

### JOIN Queries

Data Gateway supports table join queries (JOIN), allowing you to query related data from multiple tables.

```typescript
const orderRepo = gateway.getRepository('orders');

// Use repository name for JOIN (recommended approach)
const ordersWithUsers = await orderRepo?.find({
  fields: ['id', 'order_date', 'total', 'user.name', 'user.email'],
  joins: [
    {
      type: 'INNER',
      source: { repository: 'users' },  // Reference another repository
      on: { field: 'user_id', op: '=', value: 'users.id' }
    }
  ],
  where: { field: 'status', op: '=', value: 'completed' }
});

// Or use table name directly for JOIN
const ordersWithProfiles = await orderRepo?.find({
  fields: ['id', 'order_date', 'profiles.address'],
  joins: [
    {
      type: 'LEFT',
      source: { table: 'user_profiles' },  // Specify table name directly
      on: { field: 'user_id', op: '=', value: 'user_profiles.user_id' }
    }
  ]
});

console.log('Orders with user information:', ordersWithUsers?.rows);
```

**Supported JOIN Types:**
- `INNER`: Inner join, returns only matching records from both tables
- `LEFT`: Left outer join, returns all records from left table and matching records from right table
- `RIGHT`: Right outer join, returns all records from right table and matching records from left table
- `FULL`: Full outer join (Note: MySQL and SQLite do not support FULL OUTER JOIN)

For detailed usage, see [Basic Usage Guide](./docs/guides/basic-usage.en.md#join-queries).

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

## Logging

Data Gateway provides comprehensive logging functionality with multiple log levels and formats to help you monitor and debug your applications.

### Basic Configuration

```typescript
import { LogLevel } from '@wfp99/data-gateway';

const config = {
	providers: { /* ... */ },
	repositories: { /* ... */ },
	logging: {
		level: LogLevel.INFO,     // Set log level
		format: 'pretty'          // 'pretty' or 'json'
	}
};

const gateway = await DataGateway.build(config);
```

### Log Levels

```typescript
LogLevel.ALL    // 0  - Show all logs
LogLevel.DEBUG  // 10 - Debug information
LogLevel.INFO   // 20 - General information (default)
LogLevel.WARN   // 30 - Warning messages
LogLevel.ERROR  // 40 - Error messages
LogLevel.OFF    // 50 - Disable logging
```

For detailed logging configuration and examples, see the [Logging Guide](./docs/guides/logging.en.md).

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

- **MySQL** (requires `mysql2`)
- **PostgreSQL** (requires `pg` and `@types/pg`)
- **SQLite** (requires `sqlite3`)
- **Remote API** (via `RemoteProvider`)
- **Custom providers** (implement `DataProvider` interface)

## License

MIT License

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/wfp99/data-gateway).

## Author

Wang Feng Ping
