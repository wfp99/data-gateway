# Data Gateway

[English](./README.md) | [繁體中文](./README.zh-TW.md)

[![NPM version](https://img.shields.io/npm/v/@wfp99/data-gateway.svg)](https://www.npmjs.com/package/@wfp99/data-gateway)
[![License](https://img.shields.io/npm/l/@wfp99/data-gateway.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-257%20passing-brightgreen.svg)](./src)

A lightweight, extensible, **type-safe** data access gateway for Node.js. Supporting multiple data sources (MySQL, PostgreSQL, SQLite, Remote API), custom providers, and middleware. Perfect for building modern, data-driven applications.

## ✨ Features

- 🎯 **Type Safety**: Full TypeScript support with compile-time error detection
- 🔄 **Fluent API**: QueryBuilder pattern with intuitive method chaining
- 🔍 **Smart Warnings**: Automatic field conflict detection in JOIN queries
- 🚀 **Multi-Source**: MySQL, PostgreSQL, SQLite, and Remote API support
- 🔌 **Extensible**: Easy to add custom data providers
- 🎭 **Middleware**: Request/response interception support
- 📦 **Lightweight**: Core code < 15KB (minified)
- 🧪 **Well Tested**: 257 tests passing, 12 test suites

## Installation

```bash
# Install the core library
npm install @wfp99/data-gateway

# Install database drivers as needed (lazy loading)
npm install mysql2              # For MySQL
npm install pg @types/pg        # For PostgreSQL
npm install sqlite3             # For SQLite
# Remote API requires no additional dependencies 🎉
```

**Lazy Loading**: Only install drivers you actually use. The library imports providers on-demand.

## Quick Start

```typescript
import { DataGateway, MySQLProviderOptions } from '@wfp99/data-gateway';

const config = {
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'test'
      } as MySQLProviderOptions
    }
  },
  repositories: {
    user: { provider: 'mysql', table: 'users' }
  }
};

const gateway = await DataGateway.build(config);
const userRepo = gateway.getRepository('user');

// Query active users
const users = await userRepo?.find({
  where: { field: 'status', op: '=', value: 'active' }
});

await gateway.disconnectAll();
```

## Type Safety Features (Oct 2025) ✨

### 1. FieldReference System

Type-safe field references with IDE auto-completion:

```typescript
import { tableField, repoField } from '@wfp99/data-gateway';

// Before: Error-prone strings
await userRepo.find({ fields: ['users.id', 'users.name'] });

// Now: Type-safe references
await userRepo.find({
  fields: [
    tableField('users', 'id'),      // Auto-completion
    tableField('users', 'name')
  ]
});
```

### 2. QueryBuilder Pattern

Fluent API for complex queries:

```typescript
import { QueryBuilder } from '@wfp99/data-gateway';

const query = new QueryBuilder('users')
  .select('id', 'name', 'email')
  .where(w => w
    .equals('status', 'active')
    .greaterThan('age', 18)
  )
  .orderBy('createdAt', 'DESC')
  .limit(10)
  .build();

const users = await userRepo.find(query);
```

### 3. Field Conflict Detection

Automatic warnings for ambiguous fields in JOINs:

```typescript
// ⚠️ Warning triggered
await userRepo.find({
  fields: ['id', 'name'],  // Which table's 'id'?
  joins: [{ type: 'LEFT', source: { repository: 'posts' }, ... }]
});

// ✅ Solution: Use prefixed fields
await userRepo.find({
  fields: [tableField('users', 'id'), tableField('posts', 'title')]
});
```

**Learn More**: [Type Safety Guide](./docs/guides/type-safety-2025-10.md)

## Core Concepts

- **DataGateway**: Central coordinator for providers and repositories
- **DataProvider**: Abstract interface for data sources (MySQL, PostgreSQL, SQLite, Remote API)
- **Repository**: CRUD and query operations for a specific table
- **QueryObject**: Unified query format with conditions, pagination, sorting, aggregation
- **Middleware**: Intercept and process queries (validation, logging, caching)
- **EntityFieldMapper**: Transform between database columns and application properties

## CRUD Operations

### Create

```typescript
const userId = await userRepo.insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30
});
```

### Read

```typescript
const users = await userRepo.find({
  fields: ['id', 'name', 'email'],
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      { field: 'age', op: '>', value: 18 }
    ]
  },
  orderBy: [{ field: 'createdAt', direction: 'DESC' }],
  limit: 10
});
```

### Update

```typescript
const affected = await userRepo.update(
  { status: 'inactive' },
  { field: 'id', op: '=', value: userId }
);
```

### Delete

```typescript
const deleted = await userRepo.delete(
  { field: 'id', op: '=', value: userId }
);
```

## Advanced Features

### JOIN Queries

```typescript
const orders = await orderRepo.find({
  fields: ['id', 'total', 'user.name', 'user.email'],
  joins: [{
    type: 'INNER',
    source: { repository: 'users' },
    on: { field: 'user_id', op: '=', value: 'users.id' }
  }],
  where: { field: 'status', op: '=', value: 'completed' }
});
```

**Supported JOIN Types**: INNER, LEFT, RIGHT, FULL (MySQL/SQLite don't support FULL)

### Middleware

```typescript
import { Middleware } from '@wfp99/data-gateway';

const loggingMiddleware: Middleware = async (query, next) => {
  console.log('Query:', query);
  const result = await next(query);
  console.log('Result:', result);
  return result;
};

// Attach to repository
repositories: {
  user: {
    provider: 'mysql',
    table: 'users',
    middlewares: [loggingMiddleware]
  }
}
```

### Connection Pooling

```typescript
providers: {
  mysql: {
    type: 'mysql',
    options: {
      // ... connection options
      pool: {
        usePool: true,          // Enable pooling (default: true)
        connectionLimit: 10,    // Max connections (default: 10)
        acquireTimeout: 60000,  // Timeout in ms (default: 60000)
        timeout: 600000         // Idle timeout (default: 600000)
      }
    }
  }
}

// Monitor pool status
const status = gateway.getProviderPoolStatus('mysql');
console.log(`Pool: ${status.activeConnections}/${status.maxConnections}`);
```

### Logging

```typescript
import { LogLevel } from '@wfp99/data-gateway';

const config = {
  // ...
  logging: {
    level: LogLevel.INFO,  // ALL, DEBUG, INFO, WARN, ERROR, OFF
    format: 'pretty'       // 'pretty' or 'json'
  }
};
```

## Documentation

📚 **[Full Documentation](./docs/README.md)**

### Guides
- [Quick Start Guide](./docs/guides/quick-start.md) - Get started in 5 minutes
- [Basic Usage](./docs/guides/basic-usage.md) - Common patterns
- [Type Safety](./docs/guides/type-safety-2025-10.md) - FieldReference & QueryBuilder
- [Logging](./docs/guides/logging.md) - Configure logging
- [Connection Pooling](./docs/advanced/connection-pooling.md) - Performance optimization

### Providers
- [MySQL](./docs/providers/mysql.md)
- [PostgreSQL](./docs/providers/postgresql.md)
- [SQLite](./docs/providers/sqlite.md)
- [Remote API](./docs/providers/remote.md)
- [Custom Providers](./docs/providers/custom.md)

### API Reference
- [DataGateway API](./docs/api/data-gateway.md)
- [Architecture Design](./docs/core/architecture.md)

## Custom Provider

Implement the `DataProvider` interface:

```typescript
import { DataProvider, PreparedQuery, QueryResult } from '@wfp99/data-gateway';

class CustomProvider implements DataProvider {
  async connect(): Promise<void> { /* ... */ }
  async disconnect(): Promise<void> { /* ... */ }
  async executeQuery<T = any>(query: PreparedQuery): Promise<QueryResult<T>> { /* ... */ }
}
```

## Supported Data Sources

| Provider | Package Required | Status |
|----------|------------------|--------|
| MySQL | `mysql2` | ✅ Stable |
| PostgreSQL | `pg`, `@types/pg` | ✅ Stable |
| SQLite | `sqlite3` | ✅ Stable |
| Remote API | None | ✅ Stable |
| Custom | Implement interface | ✅ Supported |

## Requirements

- **Node.js**: >= 18.0.0
- **TypeScript**: >= 5.0.0 (optional)

## License

MIT License - see [LICENSE](./LICENSE)

## Contributing

Issues and pull requests welcome on [GitHub](https://github.com/wfp99/data-gateway).

## Author

Wang Feng Ping

---

**Latest Update**: October 2025 - Type safety improvements with FieldReference, QueryBuilder, and field conflict detection. [Changelog](./CHANGELOG-2025-10.md)
