# Frequently Asked Questions (FAQ)

[中文版](./faq.zh-TW.md) | English

Common questions and solutions for Data Gateway.

## Installation & Setup

### Q: Why "database driver not found" after installation?

**A:** Install the required database driver:

```bash
npm install mysql2              # MySQL
npm install pg @types/pg        # PostgreSQL
npm install sqlite sqlite3      # SQLite
```

Remote API Provider requires no additional drivers.

### Q: Node.js version requirements?

**A:** Requires Node.js 18.0.0 or higher. Check with `node --version`.

### Q: TypeScript support?

**A:** Built-in TypeScript support with generics:

```typescript
import { DataGateway } from '@wfp99/data-gateway';

interface User {
  id: number;
  name: string;
  email: string;
}

const userRepo = gateway.getRepository<User>('users');
```

## Connections & Providers

### Q: Multiple database connections?

**A:** Configure multiple providers:

```typescript
const config = {
  providers: {
    mainDB: {
      type: 'mysql',
      options: { host: 'main-db.example.com', database: 'main' }
    },
    analyticsDB: {
      type: 'postgresql',
      options: { host: 'analytics-db.example.com', database: 'analytics' }
    }
  },
  repositories: {
    users: { provider: 'mainDB', table: 'users' },
    stats: { provider: 'analyticsDB', table: 'user_stats' }
  }
};
```

### Q: Connection pooling support?

**A:** Yes, with provider-specific strategies:

```typescript
mysql: {
  type: 'mysql',
  options: {
    pool: {
      usePool: true,
      connectionLimit: 10,
      acquireTimeout: 60000
    }
  }
}
```

Monitor pool status:

```typescript
const status = gateway.getProviderPoolStatus('mysql');
console.log(`Active: ${status?.activeConnections}/${status?.maxConnections}`);
```

### Q: SSL connections?

**A:** Configure SSL options:

```typescript
mysql: {
  type: 'mysql',
  options: {
    ssl: {
      ca: fs.readFileSync('ca.pem'),
      key: fs.readFileSync('client-key.pem'),
      cert: fs.readFileSync('client-cert.pem')
    }
  }
}
```

### Q: Handle connection failures?

**A:** Implement retry mechanism:

```typescript
async function withRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Max retries reached');
}
```

## Queries & Operations

### Q: Supported query operators?

**A:** Comprehensive operator support:

```typescript
// Comparison
{ field: 'age', op: '>', value: 18 }

// String matching
{ like: { field: 'name', pattern: 'John%' } }

// Array operations
{ field: 'status', op: 'IN', values: ['active', 'pending'] }

// Null checks
{ field: 'deleted_at', op: 'IS NULL' }
{ field: 'email', op: 'IS NOT NULL' }
```

### Q: Complex AND/OR conditions?

**A:** Use nested conditions:

```typescript
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

### Q: Pagination?

**A:** Use `limit` and `offset`:

```typescript
const page = await userRepo.find({
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 20,
  offset: 0
});

const totalPages = Math.ceil((page.totalCount || 0) / 20);
```

### Q: Aggregate queries?

**A:** Use aggregate fields:

```typescript
const stats = await userRepo.find({
  fields: [
    'department',
    { type: 'COUNT', field: 'id', alias: 'user_count' },
    { type: 'AVG', field: 'salary', alias: 'avg_salary' }
  ],
  groupBy: ['department'],
  having: {
    field: { type: 'COUNT', field: 'id' },
    op: '>',
    value: 5
  }
});
```

## Field Mapping

### Q: Map application fields to database fields?

**A:** Use `MappingFieldMapper`:

```typescript
import { MappingFieldMapper } from '@wfp99/data-gateway';

const userMapper = new MappingFieldMapper({
  id: 'user_id',
  name: 'full_name',
  createdAt: 'created_at'
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
```

### Q: Custom field transformations?

**A:** Extend `MappingFieldMapper`:

```typescript
class CustomUserMapper extends MappingFieldMapper {
  transformToDatabase(data: Partial<User>): Record<string, any> {
    const mapped = super.transformToDatabase(data);

    if ('isActive' in data) {
      mapped.status = data.isActive ? 'active' : 'inactive';
      delete mapped.isActive;
    }

    return mapped;
  }
}
```

## Middleware

### Q: Request logging?

**A:** Create logging middleware:

```typescript
const loggingMiddleware: Middleware = async (query, next) => {
  const startTime = Date.now();
  console.log(`${query.type} ${query.table} started`);

  try {
    const result = await next(query);
    console.log(`Completed in ${Date.now() - startTime}ms`);
    return result;
  } catch (error) {
    console.error(`Failed after ${Date.now() - startTime}ms:`, error.message);
    throw error;
  }
};
```

### Q: Data validation?

**A:** Create validation middleware:

```typescript
const validationMiddleware: Middleware = async (query, next) => {
  if (query.type === 'INSERT' && query.data) {
    if (!query.data.email?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new Error('Invalid email format');
    }
  }
  return next(query);
};
```

### Q: Caching?

**A:** Implement cache middleware:

```typescript
const cacheMiddleware: Middleware = (() => {
  const cache = new Map();
  const TTL = 5 * 60 * 1000;

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

## Performance & Optimization

### Q: Query optimization tips?

**A:** Follow best practices:

```typescript
// 1. Use indexed fields
const user = await userRepo.findOne({
  field: 'email', // indexed
  op: '=',
  value: 'user@example.com'
});

// 2. Limit result sets
const users = await userRepo.find({
  limit: 100
});

// 3. Select only needed fields
const users = await userRepo.find({
  fields: ['id', 'name', 'email']
});

// 4. Batch operations
const users = await userRepo.findMany({
  field: 'id',
  op: 'IN',
  values: [1, 2, 3, 4, 5]
});
```

### Q: Connection pool tuning?

**A:** Adjust based on environment:

```typescript
// Development
pool: { connectionLimit: 3 }

// Production (high traffic)
pool: {
  connectionLimit: 20,
  queueLimit: 100,
  preConnect: true
}

// Batch processing
pool: {
  connectionLimit: 5,
  acquireTimeout: 120000
}
```

### Q: Monitor performance?

**A:** Use performance middleware:

```typescript
const performanceMiddleware: Middleware = async (query, next) => {
  const start = Date.now();
  const result = await next(query);
  const duration = Date.now() - start;

  if (duration > 1000) {
    console.warn(`Slow query: ${query.type} ${query.table} (${duration}ms)`);
  }

  return result;
};
```

## Error Handling

### Q: Handle connection timeouts?

**A:** Implement timeout handling:

```typescript
async function executeWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs = 30000
): Promise<T> {
  return Promise.race([
    operation(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    )
  ]);
}
```

### Q: Database-specific errors?

**A:** Handle provider-specific errors:

```typescript
try {
  await userRepo.create(data);
} catch (error) {
  if (error.code === 'ER_DUP_ENTRY') {
    throw new Error('Duplicate entry');
  } else if (error.code === '23505') {
    throw new Error('Unique constraint violation');
  }
  throw error;
}
```

## Security

### Q: SQL injection prevention?

**A:** Data Gateway automatically uses parameterized queries:

```typescript
// Automatically parameterized and safe
const users = await userRepo.findMany({
  field: 'email',
  op: '=',
  value: userInput // Automatically escaped
});
```

### Q: Data access authorization?

**A:** Use authorization middleware:

```typescript
const authMiddleware = (getUserContext: () => UserContext): Middleware => {
  return async (query, next) => {
    const user = getUserContext();

    if (query.table === 'admin_logs' && user.role !== 'admin') {
      throw new Error('Access denied');
    }

    return next(query);
  };
};
```

## Troubleshooting

### Q: Application hangs on shutdown?

**A:** Implement graceful shutdown:

```typescript
async function gracefulShutdown() {
  server.close();
  await new Promise(resolve => setTimeout(resolve, 5000));
  await gateway.disconnectAll();
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
```

### Q: "Too many connections" error?

**A:** Check and optimize pool settings:

```typescript
const status = gateway.getProviderPoolStatus('mysql');
console.log('Pool status:', status);

// Monitor pool usage
setInterval(() => {
  const status = gateway.getProviderPoolStatus('mysql');
  if (status && status.activeConnections / status.maxConnections > 0.8) {
    console.warn('High connection usage:', status);
  }
}, 10000);
```

### Q: Debug slow queries?

**A:** Enable query debugging:

```typescript
const debugMiddleware: Middleware = async (query, next) => {
  console.log('Query:', JSON.stringify(query, null, 2));

  const start = Date.now();
  const result = await next(query);
  const duration = Date.now() - start;

  if (duration > 1000) {
    console.warn(`SLOW QUERY (${duration}ms):`, query);
  }

  return result;
};
```

## Remote API Provider

### Q: API response format requirements?

**A:** Must return `QueryResult` JSON:

```json
{
  "rows": [{"id": 1, "name": "John"}]
}
```

### Q: API authentication?

**A:** Use `bearerToken` or custom headers:

```typescript
remote: {
  type: 'remote',
  options: {
    endpoint: 'https://api.example.com/data',
    bearerToken: process.env.API_TOKEN
  }
}
```

### Q: Rate limiting?

**A:** Implement rate limit middleware:

```typescript
const rateLimitMiddleware: Middleware = (() => {
  const requests = new Map();
  const limit = 100; // per minute

  return async (query, next) => {
    const now = Date.now();
    const window = Math.floor(now / 60000) * 60000;

    const count = requests.get(window) || 0;
    if (count >= limit) {
      throw new Error('Rate limit exceeded');
    }

    requests.set(window, count + 1);
    return next(query);
  };
})();
```

## More Resources

- [Basic Usage Guide](./guides/basic-usage.md)
- [Provider Documentation](./providers/)
- [GitHub Issues](https://github.com/wfp99/data-gateway/issues)
- [GitHub Discussions](https://github.com/wfp99/data-gateway/discussions)
