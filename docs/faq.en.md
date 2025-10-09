# Frequently Asked Questions (FAQ)

This document collects common questions and answers encountered when using Data Gateway.

## Installation & Setup

### Q: Why do I get "database driver not found" error after installation?

**A:** Data Gateway uses lazy loading mechanism, you need to manually install the corresponding database drivers:

```bash
# MySQL
npm install mysql2

# PostgreSQL
npm install pg @types/pg

# SQLite
npm install sqlite sqlite3
```

If you only use Remote API Provider, no additional drivers are needed.

### Q: What are the Node.js version requirements?

**A:** Data Gateway requires Node.js 18.0.0 or higher. You can check your version with:

```bash
node --version
```

If your version is too old, please upgrade to a supported version.

### Q: How to use Data Gateway in TypeScript projects?

**A:** Data Gateway has built-in TypeScript support, import directly:

```typescript
import { DataGateway, MySQLProviderOptions } from '@wfp99/data-gateway';

// Use generics to specify data types
interface User {
  id: number;
  name: string;
  email: string;
}

const userRepo = gateway.getRepository<User>('users');
```

## Connections & Providers

### Q: How to configure multiple database connections?

**A:** Define multiple providers in the configuration:

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
    },
    cache: {
      type: 'sqlite',
      options: { filename: './cache.db' }
    }
  },
  repositories: {
    users: { provider: 'mainDB', table: 'users' },
    stats: { provider: 'analyticsDB', table: 'user_stats' },
    sessions: { provider: 'cache', table: 'sessions' }
  }
};
```

### Q: Does Data Gateway support connection pooling?

**A:** Yes, Data Gateway supports connection pooling with different strategies for different providers:

- **MySQL/PostgreSQL**: Full connection pooling
- **SQLite**: Read connection pooling (single write connection)
- **Remote API**: HTTP connection reuse

```typescript
mysql: {
  type: 'mysql',
  options: {
    pool: {
      usePool: true,
      connectionLimit: 10,
      acquireTimeout: 60000,
      timeout: 600000
    }
  }
}
```

### Q: How to monitor connection pool status?

**A:** Use the built-in monitoring methods:

```typescript
// Get status for specific provider
const status = gateway.getProviderPoolStatus('mysql');
console.log(`Active: ${status?.activeConnections}/${status?.maxConnections}`);

// Get status for all providers
const allStatuses = gateway.getAllPoolStatuses();
for (const [name, status] of allStatuses) {
  console.log(`${name}: ${status.activeConnections}/${status.maxConnections}`);
}
```

### Q: How to handle connection failures?

**A:** Implement proper error handling and retry mechanisms:

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

const users = await withRetry(() => userRepo.findMany());
```

## Queries & Operations

### Q: What query operators are supported?

**A:** Data Gateway supports comprehensive query operators:

```typescript
// Comparison operators
{ field: 'age', op: '=', value: 30 }
{ field: 'age', op: '>', value: 18 }
{ field: 'age', op: '<=', value: 65 }

// String operators
{ field: 'name', op: 'LIKE', value: 'John%' }

// Array operators
{ field: 'status', op: 'IN', values: ['active', 'pending'] }
{ field: 'role', op: 'NOT IN', values: ['admin'] }

// Range operators
{ field: 'age', op: 'BETWEEN', values: [18, 65] }

// Null operators
{ field: 'deleted_at', op: 'IS NULL' }
{ field: 'email_verified_at', op: 'IS NOT NULL' }
```

### Q: How to perform complex queries with AND/OR conditions?

**A:** Use nested condition objects:

```typescript
const complexQuery = await userRepo.find({
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      {
        or: [
          { field: 'role', op: '=', value: 'admin' },
          { field: 'role', op: '=', value: 'moderator' }
        ]
      },
      { field: 'age', op: '>=', value: 18 }
    ]
  }
});
```

### Q: How to implement pagination?

**A:** Use `limit` and `offset` parameters:

```typescript
// Page 1 (first 20 records)
const page1 = await userRepo.find({
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 20,
  offset: 0
});

// Page 2 (next 20 records)
const page2 = await userRepo.find({
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 20,
  offset: 20
});

// Calculate total pages
const totalCount = page1.totalCount || 0;
const pageSize = 20;
const totalPages = Math.ceil(totalCount / pageSize);
```

### Q: How to perform aggregate queries?

**A:** Use aggregate fields in the query:

```typescript
const stats = await userRepo.find({
  fields: [
    'department',
    { type: 'COUNT', field: 'id', alias: 'user_count' },
    { type: 'AVG', field: 'salary', alias: 'avg_salary' },
    { type: 'MAX', field: 'salary', alias: 'max_salary' },
    { type: 'MIN', field: 'salary', alias: 'min_salary' },
    { type: 'SUM', field: 'salary', alias: 'total_salary' }
  ],
  groupBy: ['department'],
  having: {
    field: { type: 'COUNT', field: 'id' },
    op: '>',
    value: 5
  },
  orderBy: [{ field: 'avg_salary', direction: 'DESC' }]
});
```

## Field Mapping

### Q: How to map application field names to database field names?

**A:** Use MappingFieldMapper:

```typescript
import { MappingFieldMapper } from '@wfp99/data-gateway';

const userMapper = new MappingFieldMapper({
  id: 'user_id',
  name: 'full_name',
  email: 'email_address',
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

// Now you can use application field names
const users = await userRepo.find({
  fields: ['id', 'name', 'email', 'createdAt'],
  where: { field: 'createdAt', op: '>', value: lastWeek },
  orderBy: [{ field: 'createdAt', direction: 'DESC' }]
});
```

### Q: How to handle boolean field mapping?

**A:** Extend MappingFieldMapper or create custom mapper:

```typescript
class CustomUserMapper extends MappingFieldMapper {
  transformToDatabase(data: Partial<User>): Record<string, any> {
    const mapped = super.transformToDatabase(data);

    // Convert boolean to database format
    if ('isActive' in data) {
      mapped.status = data.isActive ? 'active' : 'inactive';
      delete mapped.isActive;
    }

    return mapped;
  }

  transformFromDatabase(data: Record<string, any>): Partial<User> {
    const mapped = super.transformFromDatabase(data);

    // Convert database format to boolean
    if ('status' in data) {
      mapped.isActive = data.status === 'active';
      delete mapped.status;
    }

    return mapped;
  }
}
```

## Middleware

### Q: How to implement request logging middleware?

**A:** Create logging middleware:

```typescript
const loggingMiddleware: Middleware = async (query, next) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  console.log(`[${requestId}] ${query.type} ${query.table} started`);

  try {
    const result = await next(query);
    const duration = Date.now() - startTime;

    console.log(`[${requestId}] ${query.type} ${query.table} completed in ${duration}ms`);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] ${query.type} ${query.table} failed after ${duration}ms:`, error.message);
    throw error;
  }
};

// Apply to repository
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

### Q: How to implement data validation middleware?

**A:** Create validation middleware:

```typescript
const validationMiddleware: Middleware = async (query, next) => {
  if (query.type === 'INSERT' && query.data) {
    // Validate required fields
    const required = ['name', 'email'];
    for (const field of required) {
      if (!query.data[field]) {
        throw new Error(`Required field missing: ${field}`);
      }
    }

    // Validate email format
    if (query.data.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(query.data.email)) {
        throw new Error('Invalid email format');
      }
    }

    // Validate age range
    if (query.data.age !== undefined) {
      if (query.data.age < 0 || query.data.age > 150) {
        throw new Error('Age must be between 0 and 150');
      }
    }
  }

  return next(query);
};
```

### Q: How to implement caching middleware?

**A:** Create caching middleware:

```typescript
const cacheMiddleware: Middleware = (() => {
  const cache = new Map<string, { data: any; timestamp: number }>();
  const TTL = 5 * 60 * 1000; // 5 minutes

  return async (query, next) => {
    // Only cache read operations
    if (query.type !== 'SELECT') {
      return next(query);
    }

    const cacheKey = JSON.stringify(query);
    const cached = cache.get(cacheKey);

    // Check if cached data is still valid
    if (cached && Date.now() - cached.timestamp < TTL) {
      console.log('Cache hit');
      return cached.data;
    }

    // Execute query
    const result = await next(query);

    // Store in cache
    cache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    // Clean up expired entries periodically
    if (Math.random() < 0.1) { // 10% chance
      for (const [key, value] of cache.entries()) {
        if (Date.now() - value.timestamp > TTL) {
          cache.delete(key);
        }
      }
    }

    return result;
  };
})();
```

## Performance & Optimization

### Q: How to optimize query performance?

**A:** Follow these performance best practices:

1. **Use indexed fields for queries:**
```typescript
// Good: email is indexed
const user = await userRepo.findOne({
  field: 'email',
  op: '=',
  value: 'user@example.com'
});

// Avoid: non-indexed field queries
const user = await userRepo.findOne({
  field: 'biography', // not indexed
  op: 'LIKE',
  value: '%engineer%'
});
```

2. **Limit result sets:**
```typescript
// Always use limit for large tables
const users = await userRepo.find({
  where: { field: 'status', op: '=', value: 'active' },
  limit: 100
});
```

3. **Select only needed fields:**
```typescript
// Good: only select needed fields
const users = await userRepo.find({
  fields: ['id', 'name', 'email'],
  where: { field: 'status', op: '=', value: 'active' }
});

// Avoid: selecting all fields when not needed
const users = await userRepo.findMany({
  field: 'status', op: '=', value: 'active'
}); // Selects all fields
```

4. **Use batch operations:**
```typescript
// Good: batch query
const userIds = [1, 2, 3, 4, 5];
const users = await userRepo.findMany({
  field: 'id',
  op: 'IN',
  values: userIds
});

// Avoid: multiple single queries
const users = [];
for (const id of userIds) {
  const user = await userRepo.findOne({ field: 'id', op: '=', value: id });
  if (user) users.push(user);
}
```

### Q: How to tune connection pool settings?

**A:** Adjust pool settings based on your environment:

```typescript
// Development
const devConfig = {
  pool: {
    connectionLimit: 3,
    acquireTimeout: 60000,
    timeout: 600000
  }
};

// Production (high traffic)
const prodConfig = {
  pool: {
    connectionLimit: 20,
    queueLimit: 100,
    acquireTimeout: 30000,
    timeout: 300000,
    preConnect: true
  }
};

// Production (batch processing)
const batchConfig = {
  pool: {
    connectionLimit: 5,
    acquireTimeout: 120000,
    timeout: 900000,
    preConnect: true
  }
};
```

### Q: How to monitor application performance?

**A:** Use performance monitoring middleware:

```typescript
const performanceMiddleware: Middleware = async (query, next) => {
  const startTime = process.hrtime.bigint();

  try {
    const result = await next(query);
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

    // Log slow queries
    if (duration > 1000) {
      console.warn(`Slow query detected: ${query.type} ${query.table} took ${duration.toFixed(2)}ms`);
    }

    // Metrics collection (if using metrics system)
    if (global.metrics) {
      global.metrics.histogram('query_duration', duration, {
        type: query.type,
        table: query.table
      });
    }

    return result;
  } catch (error) {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000;

    console.error(`Query failed: ${query.type} ${query.table} after ${duration.toFixed(2)}ms`);
    throw error;
  }
};
```

## Error Handling

### Q: How to handle connection timeouts?

**A:** Implement proper timeout handling and retries:

```typescript
class ConnectionManager {
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number = 30000
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
      )
    ]);
  }

  async safeQuery<T>(operation: () => Promise<T>): Promise<T> {
    const maxRetries = 3;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeWithTimeout(operation);
      } catch (error) {
        lastError = error;

        if (error.message.includes('timeout')) {
          console.warn(`Query timeout on attempt ${attempt}/${maxRetries}`);
        } else if (error.message.includes('connection')) {
          console.warn(`Connection error on attempt ${attempt}/${maxRetries}`);
        } else {
          // Non-recoverable error
          throw error;
        }

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }
}

// Usage
const connectionManager = new ConnectionManager();

const users = await connectionManager.safeQuery(() =>
  userRepo.findMany({ field: 'status', op: '=', value: 'active' })
);
```

### Q: How to handle database-specific errors?

**A:** Implement provider-specific error handling:

```typescript
class DatabaseErrorHandler {
  static handleMySQLError(error: any): never {
    switch (error.code) {
      case 'ER_DUP_ENTRY':
        throw new Error('Duplicate entry: This record already exists');
      case 'ER_NO_SUCH_TABLE':
        throw new Error('Table not found: Please check your table configuration');
      case 'ER_ACCESS_DENIED_ERROR':
        throw new Error('Access denied: Check your database credentials');
      case 'ECONNREFUSED':
        throw new Error('Connection refused: Database server may be down');
      default:
        throw new Error(`Database error: ${error.message}`);
    }
  }

  static handlePostgreSQLError(error: any): never {
    switch (error.code) {
      case '23505':
        throw new Error('Unique constraint violation');
      case '23503':
        throw new Error('Foreign key constraint violation');
      case '42P01':
        throw new Error('Table does not exist');
      case '28P01':
        throw new Error('Authentication failed');
      default:
        throw new Error(`Database error: ${error.message}`);
    }
  }

  static handle(error: any, providerType: string): never {
    switch (providerType) {
      case 'mysql':
        return DatabaseErrorHandler.handleMySQLError(error);
      case 'postgresql':
        return DatabaseErrorHandler.handlePostgreSQLError(error);
      default:
        throw new Error(`Unhandled error: ${error.message}`);
    }
  }
}

// Usage in middleware
const errorHandlingMiddleware: Middleware = async (query, next) => {
  try {
    return await next(query);
  } catch (error) {
    DatabaseErrorHandler.handle(error, query.providerType);
  }
};
```

## Security

### Q: How to prevent SQL injection attacks?

**A:** Data Gateway automatically uses parameterized queries to prevent SQL injection:

```typescript
// Safe: automatically parameterized
const users = await userRepo.findMany({
  field: 'email',
  op: '=',
  value: userInput // Automatically escaped
});

// Safe: complex conditions are also parameterized
const users = await userRepo.find({
  where: {
    and: [
      { field: 'name', op: 'LIKE', value: `${searchTerm}%` },
      { field: 'status', op: '=', value: userStatus }
    ]
  }
});

// Raw queries (if using provider.query directly) should still use parameters
const result = await provider.query(
  'SELECT * FROM users WHERE email = ? AND status = ?',
  [userEmail, userStatus]
);
```

### Q: How to implement data access authorization?

**A:** Use authorization middleware:

```typescript
interface UserContext {
  id: number;
  role: string;
  permissions: string[];
}

const authorizationMiddleware = (getUserContext: () => UserContext): Middleware => {
  return async (query, next) => {
    const user = getUserContext();

    // Check table-level permissions
    if (query.table === 'admin_logs' && user.role !== 'admin') {
      throw new Error('Access denied: Admin privileges required');
    }

    // Check operation-level permissions
    if (query.type === 'DELETE' && !user.permissions.includes('delete')) {
      throw new Error('Access denied: Delete permission required');
    }

    // Row-level security for user data
    if (query.table === 'users' && user.role !== 'admin') {
      // Users can only access their own data
      if (query.type === 'SELECT') {
        query.where = {
          and: [
            query.where || {},
            { field: 'id', op: '=', value: user.id }
          ]
        };
      } else if (query.type === 'UPDATE' || query.type === 'DELETE') {
        query.where = {
          and: [
            query.where || {},
            { field: 'id', op: '=', value: user.id }
          ]
        };
      }
    }

    return next(query);
  };
};
```

### Q: How to implement data encryption?

**A:** Use encryption middleware:

```typescript
import crypto from 'crypto';

const encryptionMiddleware: Middleware = async (query, next) => {
  const encryptedFields = ['ssn', 'credit_card', 'phone'];
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');

  function encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(algorithm, key);
    cipher.setAAD(iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  function decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipher(algorithm, key);
    decipher.setAAD(iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // Encrypt data before storing
  if ((query.type === 'INSERT' || query.type === 'UPDATE') && query.data) {
    for (const field of encryptedFields) {
      if (query.data[field]) {
        query.data[field] = encrypt(query.data[field]);
      }
    }
  }

  const result = await next(query);

  // Decrypt data after retrieving
  if (query.type === 'SELECT' && result.rows) {
    for (const row of result.rows) {
      for (const field of encryptedFields) {
        if (row[field]) {
          try {
            row[field] = decrypt(row[field]);
          } catch (error) {
            console.warn(`Failed to decrypt field ${field}:`, error.message);
          }
        }
      }
    }
  }

  return result;
};
```

## Troubleshooting

### Q: Application hangs when shutting down, what should I do?

**A:** Ensure proper resource cleanup:

```typescript
// Proper shutdown sequence
async function gracefulShutdown() {
  console.log('Starting graceful shutdown...');

  try {
    // 1. Stop accepting new requests
    server.close();

    // 2. Wait for existing requests to complete
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3. Close all database connections
    await gateway.disconnectAll();

    // 4. Exit process
    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
```

### Q: Getting "too many connections" error, how to fix?

**A:** Check and optimize connection pool settings:

```typescript
// 1. Check current pool status
const status = gateway.getProviderPoolStatus('mysql');
console.log('Pool status:', status);

// 2. Optimize pool configuration
const optimizedConfig = {
  pool: {
    connectionLimit: 10,           // Reduce if too high
    queueLimit: 50,               // Limit queue size
    acquireTimeout: 30000,        // Fail fast
    timeout: 300000,              // Shorter idle timeout
    preConnect: false             // Don't pre-create connections
  }
};

// 3. Monitor for connection leaks
setInterval(() => {
  const status = gateway.getProviderPoolStatus('mysql');
  if (status && status.activeConnections > status.maxConnections * 0.8) {
    console.warn('High connection usage:', status);
  }
}, 10000);
```

### Q: Queries are very slow, how to diagnose?

**A:** Use performance debugging:

```typescript
const debugMiddleware: Middleware = async (query, next) => {
  const startTime = Date.now();

  // Log query details
  console.log('Executing query:', {
    type: query.type,
    table: query.table,
    fields: query.fields,
    where: query.where,
    limit: query.limit
  });

  try {
    const result = await next(query);
    const duration = Date.now() - startTime;

    console.log('Query completed:', {
      duration: `${duration}ms`,
      rowCount: result.rows?.length || 0
    });

    // Warn about slow queries
    if (duration > 1000) {
      console.warn('SLOW QUERY DETECTED:', {
        duration: `${duration}ms`,
        query: JSON.stringify(query, null, 2)
      });
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Query failed:', {
      duration: `${duration}ms`,
      error: error.message,
      query: JSON.stringify(query, null, 2)
    });
    throw error;
  }
};
```

### Q: How to debug connection issues?

**A:** Enable connection debugging:

```typescript
// Add connection event handlers
gateway.on('connection:established', (providerName) => {
  console.log(`✅ Connection established: ${providerName}`);
});

gateway.on('connection:lost', (providerName, error) => {
  console.error(`❌ Connection lost: ${providerName}`, error);
});

gateway.on('connection:retry', (providerName, attempt) => {
  console.log(`🔄 Connection retry: ${providerName} (attempt ${attempt})`);
});

// Test connections periodically
setInterval(async () => {
  for (const [name, provider] of gateway.getAllProviders()) {
    try {
      if (provider.isConnected && !provider.isConnected()) {
        console.warn(`⚠️ Provider ${name} is disconnected`);
        await provider.connect();
      }
    } catch (error) {
      console.error(`❌ Failed to reconnect ${name}:`, error.message);
    }
  }
}, 30000);
```

## Migration & Upgrades

### Q: How to migrate from version 0.1.x to 0.2.x?

**A:** Follow these migration steps:

```typescript
// Old configuration (0.1.x)
const oldConfig = {
  databases: {
    mysql: { host: 'localhost', user: 'root', password: 'pass' }
  },
  tables: {
    users: { database: 'mysql', table: 'users' }
  }
};

// New configuration (0.2.x)
const newConfig = {
  providers: {
    mysql: {
      type: 'mysql',
      options: { host: 'localhost', user: 'root', password: 'pass' }
    }
  },
  repositories: {
    users: { provider: 'mysql', table: 'users' }
  }
};

// Update import statements
// Old: import { DataGateway } from '@wfp99/data-gateway/v1';
// New: import { DataGateway } from '@wfp99/data-gateway';

// Update method calls
// Old: gateway.getTable('users')
// New: gateway.getRepository('users')
```

### Q: How to handle breaking changes?

**A:** Check the changelog and update accordingly:

1. **Review breaking changes** in CHANGELOG.md
2. **Update TypeScript types** if using TypeScript
3. **Test thoroughly** in development environment
4. **Update documentation** and examples

## Community & Support

### Q: Where can I report bugs or request features?

**A:** Use the GitHub repository:

- **Bug reports**: [GitHub Issues](https://github.com/wfp99/data-gateway/issues)
- **Feature requests**: [GitHub Discussions](https://github.com/wfp99/data-gateway/discussions)
- **Documentation**: This documentation or GitHub Wiki

### Q: How to contribute to the project?

**A:** See the [Contributing Guide](../development/contributing.en.md):

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Q: Is Data Gateway suitable for production use?

**A:** Yes, but follow these guidelines:

- **Use connection pooling** for better performance
- **Implement proper error handling** and monitoring
- **Set up health checks** for your providers
- **Use environment-specific configurations**
- **Monitor performance** and connection pool usage
- **Keep dependencies updated**
- **Implement proper logging** and observability

### Q: What's the roadmap for future features?

**A:** Check the project roadmap:

- Enhanced query capabilities (joins, subqueries)
- More built-in providers (MongoDB, Redis, etc.)
- Advanced caching strategies
- Migration tools
- Performance optimization tools
- Enhanced monitoring and observability

For the latest updates, check the [GitHub repository](https://github.com/wfp99/data-gateway) and [project discussions](https://github.com/wfp99/data-gateway/discussions).