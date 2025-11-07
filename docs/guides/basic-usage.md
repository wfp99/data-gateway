# Basic Usage Guide

[中文版](./basic-usage.zh-TW.md) | English

Complete guide to Data Gateway features and usage patterns.

## Table of Contents

- [CRUD Operations](#crud-operations)
- [Query Features](#query-features)
- [Middleware](#middleware)
- [Field Mapping](#field-mapping)
- [Multiple Data Sources](#multiple-data-sources)
- [Performance](#performance)

## CRUD Operations

### Create

```typescript
const userRepo = gateway.getRepository('users');

const userId = await userRepo.insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  status: 'active'
});
```

### Read

```typescript
// Find all
const users = await userRepo.findMany();

// Find with condition
const activeUsers = await userRepo.findMany({
  field: 'status',
  op: '=',
  value: 'active'
});

// Find one
const user = await userRepo.findOne({
  field: 'id',
  op: '=',
  value: 1
});

// Complex query
const result = await userRepo.find({
  fields: ['id', 'name', 'email'],
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      { field: 'age', op: '>=', value: 18 }
    ]
  },
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 20
});
```

### Update

```typescript
// Update single record
const count = await userRepo.update(
  { status: 'inactive' },
  { field: 'id', op: '=', value: userId }
);

// Batch update
await userRepo.update(
  { last_login: new Date() },
  { field: 'status', op: '=', value: 'active' }
);
```

### Delete

```typescript
// Delete single record
const deleted = await userRepo.delete({
  field: 'id',
  op: '=',
  value: userId
});

// Conditional delete
await userRepo.delete({
  and: [
    { field: 'status', op: '=', value: 'inactive' },
    { field: 'last_login', op: '<', value: oneYearAgo }
  ]
});
```

## Query Features

### Operators

```typescript
// Comparison
{ field: 'age', op: '>', value: 18 }
{ field: 'age', op: '<=', value: 65 }

// String matching (LIKE)
{ like: { field: 'name', pattern: 'John%' } }

// Array operations
{ field: 'status', op: 'IN', values: ['active', 'pending'] }
{ field: 'role', op: 'NOT IN', values: ['admin'] }

// Null checks
{ field: 'deleted_at', op: 'IS NULL' }
{ field: 'email', op: 'IS NOT NULL' }
```

### Complex Conditions

```typescript
// AND/OR conditions
const result = await userRepo.find({
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      {
        or: [
          { field: 'role', op: '=', value: 'admin' },
          { field: 'role', op: '=', value: 'moderator' }
        ]
      }
    ]
  }
});
```

### Sorting & Pagination

```typescript
// Sorting
const users = await userRepo.find({
  orderBy: [
    { field: 'created_at', direction: 'DESC' },
    { field: 'name', direction: 'ASC' }
  ],
  limit: 20,
  offset: 0
});

// Pagination helper
function paginate(page: number, pageSize: number = 20) {
  return {
    limit: pageSize,
    offset: (page - 1) * pageSize
  };
}

const page2 = await userRepo.find({
  ...paginate(2, 10),
  orderBy: [{ field: 'id', direction: 'ASC' }]
});
```

### Aggregations

```typescript
// Group and aggregate
const stats = await userRepo.find({
  fields: [
    'department',
    { type: 'COUNT', field: 'id', alias: 'user_count' },
    { type: 'AVG', field: 'salary', alias: 'avg_salary' },
    { type: 'MAX', field: 'salary', alias: 'max_salary' }
  ],
  groupBy: ['department'],
  having: {
    field: { type: 'COUNT', field: 'id' },
    op: '>',
    value: 5
  }
});
```

### Field Selection

```typescript
// Select specific fields
const users = await userRepo.find({
  fields: ['id', 'name', 'email'],
  where: { field: 'status', op: '=', value: 'active' }
});

// Exclude sensitive fields
const publicUsers = await userRepo.find({
  fields: ['id', 'name', 'avatar']
  // password, email excluded
});
```

## Middleware

### Logging Middleware

```typescript
import { Middleware } from '@wfp99/data-gateway';

const loggingMiddleware: Middleware = async (query, next) => {
  const start = Date.now();
  console.log(`[${query.type}] ${query.table}`);

  try {
    const result = await next(query);
    console.log(`✓ Completed in ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    console.error(`✗ Failed: ${error.message}`);
    throw error;
  }
};

const config = {
  repositories: {
    users: {
      provider: 'mysql',
      table: 'users',
      middlewares: [loggingMiddleware]
    }
  }
};
```

### Validation Middleware

```typescript
const validationMiddleware: Middleware = async (query, next) => {
  if (query.type === 'INSERT' && query.data) {
    if (!query.data.email || !query.data.email.includes('@')) {
      throw new Error('Invalid email');
    }
    if (query.data.age && (query.data.age < 0 || query.data.age > 150)) {
      throw new Error('Invalid age');
    }
  }
  return next(query);
};
```

### Soft Delete Middleware

```typescript
const softDeleteMiddleware: Middleware = async (query, next) => {
  // Convert DELETE to UPDATE
  if (query.type === 'DELETE') {
    query.type = 'UPDATE';
    query.data = { deleted_at: new Date() };
  }

  // Filter out deleted records in SELECT
  if (query.type === 'SELECT') {
    query.where = query.where ? {
      and: [query.where, { field: 'deleted_at', op: 'IS NULL' }]
    } : { field: 'deleted_at', op: 'IS NULL' };
  }

  return next(query);
};
```

### Caching Middleware

```typescript
const cacheMiddleware: Middleware = (() => {
  const cache = new Map();
  const TTL = 5 * 60 * 1000; // 5 minutes

  return async (query, next) => {
    if (query.type !== 'SELECT') return next(query);

    const key = JSON.stringify(query);
    const cached = cache.get(key);

    if (cached && Date.now() - cached.timestamp < TTL) {
      return cached.data;
    }

    const result = await next(query);
    cache.set(key, { data: result, timestamp: Date.now() });
    return result;
  };
})();
```

## Field Mapping

### Basic Mapping

```typescript
import { MappingFieldMapper } from '@wfp99/data-gateway';

const userMapper = new MappingFieldMapper({
  id: 'user_id',
  name: 'full_name',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

const config = {
  repositories: {
    users: {
      provider: 'mysql',
      table: 'users',
      mapper: userMapper
    }
  }
};

// Use application field names
const users = await userRepo.find({
  fields: ['id', 'name', 'createdAt'],
  where: { field: 'createdAt', op: '>', value: lastWeek }
});
```

### Custom Mapper

```typescript
class UserMapper extends MappingFieldMapper {
  transformToDatabase(data: Partial<User>): Record<string, any> {
    const mapped = super.transformToDatabase(data);

    // Transform boolean to database format
    if ('isActive' in data) {
      mapped.status = data.isActive ? 'active' : 'inactive';
      delete mapped.isActive;
    }

    // Encrypt sensitive fields
    if (data.ssn) {
      mapped.ssn = encrypt(data.ssn);
    }

    return mapped;
  }

  transformFromDatabase(data: Record<string, any>): Partial<User> {
    const mapped = super.transformFromDatabase(data);

    // Transform database format to boolean
    if ('status' in data) {
      mapped.isActive = data.status === 'active';
    }

    // Decrypt sensitive fields
    if (data.ssn) {
      mapped.ssn = decrypt(data.ssn);
    }

    return mapped;
  }
}
```

## Multiple Data Sources

### Configuration

```typescript
const config = {
  providers: {
    mainDB: {
      type: 'mysql',
      options: {
        host: 'main-db.example.com',
        database: 'production',
        pool: { connectionLimit: 10 }
      }
    },
    analyticsDB: {
      type: 'postgresql',
      options: {
        host: 'analytics-db.example.com',
        database: 'analytics',
        pool: { connectionLimit: 5 }
      }
    },
    cacheDB: {
      type: 'sqlite',
      options: {
        filename: './cache.db'
      }
    },
    remoteAPI: {
      type: 'remote',
      options: {
        endpoint: 'https://api.example.com/data',
        bearerToken: process.env.API_TOKEN
      }
    }
  },
  repositories: {
    users: { provider: 'mainDB', table: 'users' },
    stats: { provider: 'analyticsDB', table: 'user_stats' },
    sessions: { provider: 'cacheDB', table: 'sessions' },
    products: { provider: 'remoteAPI', table: 'products' }
  }
};

const gateway = new DataGateway(config);
```

### Cross-Source Queries

```typescript
// Query from different sources
const user = await gateway.getRepository('users').findOne({
  field: 'id',
  op: '=',
  value: userId
});

const stats = await gateway.getRepository('stats').findOne({
  field: 'user_id',
  op: '=',
  value: userId
});

const session = await gateway.getRepository('sessions').findOne({
  field: 'user_id',
  op: '=',
  value: userId
});

// Combine data in application layer
const userProfile = {
  ...user,
  stats,
  session
};
```

## Performance

### Query Optimization

```typescript
// ✅ Good: Use indexed fields
const user = await userRepo.findOne({
  field: 'email', // indexed
  op: '=',
  value: 'user@example.com'
});

// ✅ Good: Limit result sets
const recent = await userRepo.find({
  limit: 100,
  orderBy: [{ field: 'created_at', direction: 'DESC' }]
});

// ✅ Good: Select only needed fields
const list = await userRepo.find({
  fields: ['id', 'name', 'avatar']
});

// ✅ Good: Batch operations
const users = await userRepo.findMany({
  field: 'id',
  op: 'IN',
  values: [1, 2, 3, 4, 5]
});

// ❌ Avoid: Non-indexed LIKE queries
const users = await userRepo.find({
  where: { like: { field: 'biography', pattern: '%keyword%' } }
});

// ❌ Avoid: Unbounded queries
const all = await userRepo.findMany(); // No limit!
```

### Connection Pooling

```typescript
// Production configuration
const prodConfig = {
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        pool: {
          usePool: true,
          connectionLimit: 20,
          queueLimit: 100,
          acquireTimeout: 30000,
          timeout: 300000,
          preConnect: true
        }
      }
    }
  }
};

// Monitor pool status
const status = gateway.getProviderPoolStatus('mysql');
console.log(`Pool: ${status.activeConnections}/${status.maxConnections}`);

// Check all pools
const allStatuses = gateway.getAllPoolStatuses();
for (const [name, status] of allStatuses) {
  console.log(`${name}: ${status.activeConnections}/${status.maxConnections}`);
}
```

### Batch Processing

```typescript
// Process large datasets with pagination
async function processAllUsers(batchSize = 1000) {
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const batch = await userRepo.find({
      limit: batchSize,
      offset,
      orderBy: [{ field: 'id', direction: 'ASC' }]
    });

    if (!batch.rows || batch.rows.length < batchSize) {
      hasMore = false;
    }

    await processBatch(batch.rows);
    offset += batchSize;
  }
}

// Cursor-based pagination (more efficient)
async function processCursorPagination(pageSize = 1000) {
  let lastId = 0;

  while (true) {
    const batch = await userRepo.find({
      where: { field: 'id', op: '>', value: lastId },
      limit: pageSize,
      orderBy: [{ field: 'id', direction: 'ASC' }]
    });

    if (!batch.rows || batch.rows.length === 0) break;

    await processBatch(batch.rows);
    lastId = batch.rows[batch.rows.length - 1].id;
  }
}
```

## Error Handling

```typescript
// Basic error handling
try {
  const user = await userRepo.findOne({
    field: 'id',
    op: '=',
    value: userId
  });
} catch (error) {
  console.error('Query failed:', error.message);
}

// Provider-specific errors
try {
  await userRepo.insert(data);
} catch (error) {
  if (error.code === 'ER_DUP_ENTRY') {
    throw new Error('Email already exists');
  } else if (error.code === '23505') {
    throw new Error('Unique constraint violation');
  }
  throw error;
}

// Graceful shutdown
async function shutdown() {
  await gateway.disconnectAll();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

## Best Practices

1. **Use connection pooling** in production
2. **Always limit** query results
3. **Select specific fields** instead of `*`
4. **Use batch operations** for multiple records
5. **Implement error handling** and retries
6. **Monitor pool status** regularly
7. **Use middleware** for cross-cutting concerns
8. **Map fields** for clean separation
9. **Close connections** on shutdown

## Next Steps

- [Field Mapping Guide](./field-mapping.md)
- [Middleware Guide](./middleware.md)
- [Performance Tuning](../advanced/performance.md)
- [Provider Documentation](../providers/)
- [FAQ](../faq.md)
