# Basic Usage Guide

This guide provides a comprehensive overview of Data Gateway's features and usage patterns, helping you make the most of this powerful data access gateway.

## Table of Contents

- [CRUD Operations](#crud-operations)
- [Query Features](#query-features)
- [Middleware Usage](#middleware-usage)
- [Field Mapping](#field-mapping)
- [Multiple Data Sources](#multiple-data-sources)
- [Error Handling](#error-handling)
- [Performance Optimization](#performance-optimization)

## CRUD Operations

### Create Data

```typescript
const userRepo = gateway.getRepository('users');

// Insert complete data
const newUserId = await userRepo?.insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  status: 'active',
  created_at: new Date()
});

// Insert partial data (allowing database defaults)
const anotherUserId = await userRepo?.insert({
  name: 'Jane Smith',
  email: 'jane@example.com'
  // age and status will use database defaults
});

console.log(`New user ID: ${newUserId}`);
```

### Read Data

```typescript
// Query all data
const allUsers = await userRepo?.findMany();

// Conditional query
const activeUsers = await userRepo?.findMany({
  field: 'status',
  op: '=',
  value: 'active'
});

// Find single record
const user = await userRepo?.findOne({
  field: 'id',
  op: '=',
  value: 1
});

// Complex query
const adultActiveUsers = await userRepo?.find({
  fields: ['id', 'name', 'email'],  // Specify fields
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      { field: 'age', op: '>=', value: 18 }
    ]
  },
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 20,
  offset: 0
});
```

### Update Data

```typescript
// Update specific record
const updatedRows = await userRepo?.update(
  { status: 'inactive', updated_at: new Date() },  // Data to update
  { field: 'id', op: '=', value: userId }          // Condition
);

// Batch update
const batchUpdated = await userRepo?.update(
  { last_login: new Date() },
  {
    and: [
      { field: 'status', op: '=', value: 'active' },
      { field: 'age', op: '>=', value: 18 }
    ]
  }
);

console.log(`Updated ${updatedRows} records`);
```

### Delete Data

```typescript
// Delete specific record
const deletedRows = await userRepo?.delete({
  field: 'id',
  op: '=',
  value: userId
});

// Conditional delete
const batchDeleted = await userRepo?.delete({
  and: [
    { field: 'status', op: '=', value: 'inactive' },
    { field: 'last_login', op: '<', value: oneYearAgo }
  ]
});

console.log(`Deleted ${deletedRows} records`);
```

## Query Features

### Query Operators

Data Gateway supports various query operators:

```typescript
// Equals
await userRepo?.findMany({ field: 'status', op: '=', value: 'active' });

// Not equals
await userRepo?.findMany({ field: 'status', op: '!=', value: 'deleted' });

// Greater than/Less than
await userRepo?.findMany({ field: 'age', op: '>', value: 18 });
await userRepo?.findMany({ field: 'age', op: '<=', value: 65 });

// LIKE pattern matching
await userRepo?.findMany({ field: 'name', op: 'LIKE', value: 'John%' });

// IN query
await userRepo?.findMany({ field: 'status', op: 'IN', values: ['active', 'pending'] });

// NOT IN query
await userRepo?.findMany({ field: 'role', op: 'NOT IN', values: ['admin', 'super_admin'] });

// Null checks
await userRepo?.findMany({ field: 'deleted_at', op: 'IS NULL' });
await userRepo?.findMany({ field: 'email_verified_at', op: 'IS NOT NULL' });
```

### Complex Query Conditions

```typescript
// AND conditions
const result1 = await userRepo?.find({
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      { field: 'age', op: '>=', value: 18 },
      { field: 'email_verified', op: '=', value: true }
    ]
  }
});

// OR conditions
const result2 = await userRepo?.find({
  where: {
    or: [
      { field: 'role', op: '=', value: 'admin' },
      { field: 'role', op: '=', value: 'moderator' }
    ]
  }
});

// Nested conditions
const result3 = await userRepo?.find({
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      {
        or: [
          { field: 'subscription', op: '=', value: 'premium' },
          { field: 'trial_expires', op: '>', value: new Date() }
        ]
      }
    ]
  }
});
```

### Sorting and Pagination

```typescript
// Single field sorting
const users = await userRepo?.find({
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 10
});

// Multi-field sorting
const sortedUsers = await userRepo?.find({
  orderBy: [
    { field: 'status', direction: 'ASC' },
    { field: 'last_login', direction: 'DESC' },
    { field: 'name', direction: 'ASC' }
  ]
});

// Pagination
const page1 = await userRepo?.find({
  orderBy: [{ field: 'id', direction: 'ASC' }],
  limit: 20,   // 20 records per page
  offset: 0    // First page
});

const page2 = await userRepo?.find({
  orderBy: [{ field: 'id', direction: 'ASC' }],
  limit: 20,   // 20 records per page
  offset: 20   // Second page
});
```

### Aggregate Queries

```typescript
// Statistical queries
const stats = await userRepo?.find({
  fields: [
    'department',
    { type: 'COUNT', field: 'id', alias: 'total_users' },
    { type: 'AVG', field: 'age', alias: 'average_age' },
    { type: 'MIN', field: 'salary', alias: 'min_salary' },
    { type: 'MAX', field: 'salary', alias: 'max_salary' },
    { type: 'SUM', field: 'salary', alias: 'total_salary' }
  ],
  groupBy: ['department'],
  orderBy: [{ field: 'total_users', direction: 'DESC' }]
});

console.log('Department statistics:', stats?.rows);
```

## Middleware Usage

Middleware allows you to inject custom logic before and after query execution.

### Creating Middleware

```typescript
import { Middleware } from '@wfp99/data-gateway';

// Logging middleware
const loggingMiddleware: Middleware = async (query, next) => {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Executing query:`, query.type, query.table);

  try {
    const result = await next(query);
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] Query completed in: ${duration}ms`);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] Query failed after: ${duration}ms`, error);
    throw error;
  }
};

// Validation middleware
const validationMiddleware: Middleware = async (query, next) => {
  if (query.type === 'INSERT' && query.data) {
    // Validate required fields
    if (!query.data.name || !query.data.email) {
      throw new Error('Missing required fields: name, email');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(query.data.email)) {
      throw new Error('Invalid email format');
    }
  }

  return next(query);
};

// Caching middleware
const cacheMiddleware: Middleware = (() => {
  const cache = new Map();

  return async (query, next) => {
    // Only cache read operations
    if (query.type !== 'SELECT') {
      return next(query);
    }

    const cacheKey = JSON.stringify(query);

    // Check cache
    if (cache.has(cacheKey)) {
      console.log('Retrieved from cache');
      return cache.get(cacheKey);
    }

    // Execute query
    const result = await next(query);

    // Store in cache (5 minutes expiry)
    cache.set(cacheKey, result);
    setTimeout(() => cache.delete(cacheKey), 5 * 60 * 1000);

    return result;
  };
})();
```

### Using Middleware

```typescript
const config = {
  providers: {
    mysql: {
      type: 'mysql',
      options: { /* configuration */ }
    }
  },
  repositories: {
    users: {
      provider: 'mysql',
      table: 'users',
      middlewares: [
        validationMiddleware,  // Validate first
        loggingMiddleware,     // Then log
        cacheMiddleware        // Finally cache
      ]
    }
  }
};
```

## Field Mapping

Field mapping allows you to use friendly field names in your application layer that automatically map to database fields.

### Creating Field Mappers

```typescript
import { MappingFieldMapper } from '@wfp99/data-gateway';

// Define field mappings
const userFieldMapper = new MappingFieldMapper({
  // Application field -> Database field
  id: 'user_id',
  name: 'full_name',
  email: 'email_address',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  isActive: 'status'  // Boolean mapping to status
});

// Use in repository
const config = {
  providers: { /* provider configuration */ },
  repositories: {
    users: {
      provider: 'mysql',
      table: 'users',
      mapper: userFieldMapper  // Use field mapper
    }
  }
};
```

### Using Mapped Fields

```typescript
// Use application-layer field names
const users = await userRepo?.find({
  fields: ['id', 'name', 'email', 'createdAt'],  // Auto-mapped to DB fields
  where: {
    and: [
      { field: 'isActive', op: '=', value: true },     // Maps to status = 'active'
      { field: 'createdAt', op: '>', value: lastWeek } // Maps to created_at
    ]
  },
  orderBy: [{ field: 'createdAt', direction: 'DESC' }]  // Maps to created_at
});

// Insert with automatic mapping
await userRepo?.insert({
  name: 'John Doe',      // Maps to full_name
  email: 'john@example.com',  // Maps to email_address
  isActive: true         // Maps to status = 'active'
});
```

## Multiple Data Sources

One of Data Gateway's powerful features is using multiple data sources within the same application.

### Configuring Multiple Data Sources

```typescript
const config = {
  providers: {
    // Main database (user data)
    mainDB: {
      type: 'mysql',
      options: {
        host: 'main-db.example.com',
        database: 'app_main'
      }
    },

    // Analytics database (read-only)
    analyticsDB: {
      type: 'postgresql',
      options: {
        host: 'analytics-db.example.com',
        database: 'analytics'
      }
    },

    // Cache database
    cache: {
      type: 'sqlite',
      options: {
        filename: './cache.db'
      }
    },

    // External API
    externalAPI: {
      type: 'remote',
      options: {
        endpoint: 'https://api.external.com/data',
        bearerToken: process.env.EXTERNAL_API_TOKEN
      }
    }
  },

  repositories: {
    // Main business data
    users: { provider: 'mainDB', table: 'users' },
    orders: { provider: 'mainDB', table: 'orders' },

    // Analytics data
    userStats: { provider: 'analyticsDB', table: 'user_statistics' },
    orderAnalytics: { provider: 'analyticsDB', table: 'order_analytics' },

    // Cache data
    sessions: { provider: 'cache', table: 'user_sessions' },
    tempData: { provider: 'cache', table: 'temporary_data' },

    // External data
    externalProducts: { provider: 'externalAPI', table: 'products' }
  }
};
```

### Cross-Data Source Queries

```typescript
async function crossDataSourceExample() {
  const gateway = await DataGateway.build(config);

  try {
    // Get user from main database
    const userRepo = gateway.getRepository('users');
    const user = await userRepo?.findOne({ field: 'id', op: '=', value: 123 });

    // Get statistics from analytics database
    const statsRepo = gateway.getRepository('userStats');
    const stats = await statsRepo?.findOne({ field: 'user_id', op: '=', value: 123 });

    // Get session from cache
    const sessionRepo = gateway.getRepository('sessions');
    const session = await sessionRepo?.findOne({ field: 'user_id', op: '=', value: 123 });

    // Get products from external API
    const productRepo = gateway.getRepository('externalProducts');
    const products = await productRepo?.findMany({ field: 'category', op: '=', value: 'electronics' });

    // Combine data
    const completeUserProfile = {
      user,
      statistics: stats,
      session,
      recommendedProducts: products
    };

    return completeUserProfile;

  } finally {
    await gateway.disconnectAll();
  }
}
```

## Error Handling

### Unified Error Handling

```typescript
async function robustDataAccess() {
  let gateway: DataGateway | null = null;

  try {
    gateway = await DataGateway.build(config);
    const userRepo = gateway.getRepository('users');

    if (!userRepo) {
      throw new Error('Unable to get user repository');
    }

    const result = await userRepo.findMany();
    return result;

  } catch (error) {
    console.error('Data access error:', error);

    if (error instanceof Error) {
      // Connection errors
      if (error.message.includes('connection')) {
        console.error('Database connection failed, please check network or configuration');
      }
      // Authentication errors
      else if (error.message.includes('authentication') || error.message.includes('401')) {
        console.error('Authentication failed, please check username and password');
      }
      // Query errors
      else if (error.message.includes('query') || error.message.includes('syntax')) {
        console.error('Query syntax error, please check query conditions');
      }
      // Unknown errors
      else {
        console.error('Unknown error:', error.message);
      }
    }

    throw error;

  } finally {
    if (gateway) {
      await gateway.disconnectAll();
    }
  }
}
```

### Retry Mechanism

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      console.warn(`Operation failed, retrying in ${delay}ms (${attempt}/${maxRetries}):`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }

  throw new Error('Should not reach here');
}

// Use retry mechanism
const users = await withRetry(async () => {
  const gateway = await DataGateway.build(config);
  const userRepo = gateway.getRepository('users');
  const result = await userRepo?.findMany();
  await gateway.disconnectAll();
  return result;
});
```

## Performance Optimization

### Connection Pool Optimization

```typescript
// Adjust connection pool settings based on load
const optimizedConfig = {
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        // ... other settings
        pool: {
          usePool: true,
          connectionLimit: process.env.NODE_ENV === 'production' ? 20 : 5,
          acquireTimeout: 30000,
          timeout: 300000,
          preConnect: process.env.NODE_ENV === 'production'
        }
      }
    }
  }
};
```

### Query Optimization

```typescript
// Use indexed fields for queries
const users = await userRepo?.findMany({
  field: 'email',  // Ensure email field is indexed
  op: '=',
  value: 'user@example.com'
});

// Limit query results
const recentOrders = await orderRepo?.find({
  fields: ['id', 'total', 'created_at'],  // Only query needed fields
  where: { field: 'status', op: '=', value: 'completed' },
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 50  // Limit result count
});

// Use batch operations
const userIds = [1, 2, 3, 4, 5];
const users = await userRepo?.findMany({
  field: 'id',
  op: 'IN',
  values: userIds  // Query multiple records at once instead of looping
});
```

### Monitoring and Tuning

```typescript
async function monitorPerformance() {
  const gateway = await DataGateway.build(config);

  // Monitor connection pool status
  setInterval(() => {
    const allStatuses = gateway.getAllPoolStatuses();

    for (const [providerName, status] of allStatuses) {
      const utilizationRate = status.activeConnections / status.maxConnections;

      if (utilizationRate > 0.8) {
        console.warn(`${providerName} connection pool utilization too high: ${Math.round(utilizationRate * 100)}%`);
      }

      console.log(`${providerName}: ${status.activeConnections}/${status.maxConnections} connections active`);
    }
  }, 30000); // Check every 30 seconds

  return gateway;
}
```

These basic usage patterns should help you leverage Data Gateway's powerful features effectively. For more in-depth content, please refer to the [API Reference](../api/README.md) and [Advanced Features Guide](../advanced/README.md).