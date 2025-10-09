# PostgreSQL Provider

PostgreSQL Provider is a Data Gateway data provider specifically designed for PostgreSQL databases. It implements the `DataProvider` interface and supports connection pooling, query building, and error handling.

## Installation

PostgreSQL Provider requires the `pg` package as a peer dependency:

```bash
npm install pg @types/pg
```

## Basic Usage

### Connection Configuration

```typescript
import { DataGateway } from '@wfp99/data-gateway';

const gateway = await DataGateway.build({
  providers: {
    postgres: {
      type: 'postgresql',
      options: {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'password',
        database: 'mydb',
      },
    },
  },
  repositories: {
    users: {
      provider: 'postgres',
      table: 'users',
    },
  },
});
```

### Connection Pool Configuration

PostgreSQL Provider enables connection pooling by default, configurable through the `pool` option:

```typescript
const gateway = await DataGateway.build({
  providers: {
    postgres: {
      type: 'postgresql',
      options: {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'password',
        database: 'mydb',
        pool: {
          usePool: true,                    // Enable connection pooling (default: true)
          max: 20,                         // Maximum connections (default: 10)
          min: 5,                          // Minimum connections (default: 0)
          idleTimeoutMillis: 30000,        // Idle timeout (default: 10000)
          connectionTimeoutMillis: 60000,  // Connection timeout (default: 30000)
          allowExitOnIdle: false,          // Allow exit when idle (default: false)
        },
      },
    },
  },
  repositories: {
    users: { provider: 'postgres', table: 'users' },
  },
});
```

### Disabling Connection Pool

To use a single connection instead of connection pooling:

```typescript
const gateway = await DataGateway.build({
  providers: {
    postgres: {
      type: 'postgresql',
      options: {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'password',
        database: 'mydb',
        pool: {
          usePool: false,  // Disable connection pooling
        },
      },
    },
  },
  repositories: {
    users: { provider: 'postgres', table: 'users' },
  },
});
```

## Connection Options

PostgreSQL Provider supports all `ClientConfig` options from the `pg` package:

```typescript
interface PostgreSQLProviderOptions extends ClientConfig {
  // Basic connection options
  host?: string;
  port?: number;
  user?: string;
  password?: string | (() => string | Promise<string>);
  database?: string;
  connectionString?: string;

  // SSL configuration
  ssl?: boolean | ConnectionOptions;

  // Timeout settings
  connectionTimeoutMillis?: number;
  statement_timeout?: false | number;
  query_timeout?: number;
  lock_timeout?: number;
  idle_in_transaction_session_timeout?: number;

  // Other options
  keepAlive?: boolean;
  keepAliveInitialDelayMillis?: number;
  application_name?: string;
  fallback_application_name?: string;
  client_encoding?: string;
  options?: string;

  // Connection pool configuration
  pool?: PostgreSQLConnectionPoolConfig;
}
```

## Query Features

### Basic CRUD Operations

```typescript
const userRepo = gateway.getRepository('users');

// Create user
const userId = await userRepo.insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
});

// Query users
const users = await userRepo.findMany({
  field: 'age',
  op: '>',
  value: 18,
});

// Update user
const updatedRows = await userRepo.update(
  { email: 'john.doe@example.com' },
  { field: 'id', op: '=', value: userId }
);

// Delete user
const deletedRows = await userRepo.delete({
  field: 'id',
  op: '=',
  value: userId,
});
```

### Complex Queries

```typescript
// AND/OR conditions
const activeAdults = await userRepo.findMany({
  and: [
    { field: 'active', op: '=', value: true },
    { field: 'age', op: '>=', value: 18 },
  ],
});

// LIKE queries
const johnUsers = await userRepo.findMany({
  like: { field: 'name', pattern: 'John%' },
});

// IN queries
const specificUsers = await userRepo.findMany({
  field: 'id',
  op: 'IN',
  values: [1, 2, 3, 4, 5],
});
```

### Aggregate Queries

```typescript
// Statistics queries
const stats = await userRepo.find({
  fields: [
    'department',
    { type: 'COUNT', field: 'id', alias: 'user_count' },
    { type: 'AVG', field: 'age', alias: 'avg_age' },
    { type: 'MAX', field: 'salary', alias: 'max_salary' },
  ],
  groupBy: ['department'],
  orderBy: [{ field: 'department', direction: 'ASC' }],
});
```

### Pagination

```typescript
// First page
const page1 = await userRepo.findMany(undefined, {
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 10,
  offset: 0,
});

// Second page
const page2 = await userRepo.findMany(undefined, {
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 10,
  offset: 10,
});
```

## Advanced Query Features

### Subquery Support

PostgreSQL Provider supports subqueries for complex filtering:

```typescript
// Find users in departments with more than 10 employees
const users = await userRepo.find({
  where: {
    field: 'department_id',
    op: 'IN',
    subquery: {
      type: 'SELECT',
      table: 'departments',
      fields: ['id'],
      where: {
        field: 'employee_count',
        op: '>',
        value: 10
      }
    }
  }
});

// Users with above-average salary
const aboveAverageUsers = await userRepo.find({
  where: {
    field: 'salary',
    op: '>',
    subquery: {
      type: 'SELECT',
      table: 'users',
      fields: [{ type: 'AVG', field: 'salary' }]
    }
  }
});
```

### Complex AND/OR Conditions

```typescript
// Complex filtering with nested conditions
const complexQuery = await userRepo.find({
  where: {
    and: [
      {
        or: [
          { field: 'department', op: '=', value: 'Engineering' },
          { field: 'department', op: '=', value: 'Product' }
        ]
      },
      {
        and: [
          { field: 'active', op: '=', value: true },
          { field: 'salary', op: '>', value: 50000 }
        ]
      }
    ]
  }
});
```

## Connection Pool Monitoring

PostgreSQL Provider provides connection pool status monitoring:

```typescript
// Get pool status for specific provider
const poolStatus = gateway.getProviderPoolStatus('postgres');
if (poolStatus) {
  console.log('Connection Pool Status:');
  console.log(`Total connections: ${poolStatus.totalConnections}`);
  console.log(`Active connections: ${poolStatus.activeConnections}`);
  console.log(`Idle connections: ${poolStatus.idleConnections}`);
  console.log(`Max connections: ${poolStatus.maxConnections}`);
  console.log(`Min connections: ${poolStatus.minConnections}`);
}

// Get pool status for all providers
const allPoolStatuses = gateway.getAllPoolStatuses();
for (const [providerName, status] of allPoolStatuses) {
  console.log(`${providerName} pool status:`, status);
}
```

## PostgreSQL-Specific Data Types

### Handling JSON Data

When using PostgreSQL's JSON features, store data as strings and handle JSON operations at the application layer:

```typescript
// Insert JSON data (stored as text)
await docRepo.insert({
  title: 'Product Information',
  metadata: JSON.stringify({
    version: '1.0',
    tags: ['product', 'info'],
    pricing: { currency: 'USD', amount: 29.99 }
  }),
});

// Query and parse JSON data
const docs = await docRepo.find({
  fields: ['title', 'metadata'],
  where: {
    like: { field: 'metadata', pattern: '%"version":"1.0"%' }
  }
});

// Parse JSON at application layer
const parsedDocs = docs.rows?.map(doc => ({
  ...doc,
  metadata: JSON.parse(doc.metadata)
}));
```

### Handling Arrays

```typescript
// Store array data as JSON strings
await userRepo.insert({
  name: 'John',
  skills: JSON.stringify(['JavaScript', 'TypeScript', 'PostgreSQL']),
  scores: JSON.stringify([8.5, 9.2, 7.8]),
});

// Query and parse array data
const users = await userRepo.find({
  where: {
    like: { field: 'skills', pattern: '%JavaScript%' }
  }
});

// Parse arrays at application layer
const parsedUsers = users.rows?.map(user => ({
  ...user,
  skills: JSON.parse(user.skills),
  scores: JSON.parse(user.scores)
}));
```

## Error Handling

PostgreSQL Provider provides detailed error messages:

```typescript
try {
  const result = await userRepo.insert({ name: 'Test User' });
} catch (error) {
  console.error('Insert failed:', error.message);
  // Error format: [PostgreSQLProvider.query] Specific error message
}
```

Common error types:
- Connection errors: Database unreachable
- SQL syntax errors: Invalid query syntax
- Constraint violations: Database constraint violations
- Permission errors: Insufficient privileges

## Performance Optimization

### Connection Pool Tuning

```typescript
// High concurrency settings
pool: {
  max: 50,                        // Increase max connections
  min: 10,                        // Maintain minimum connections
  idleTimeoutMillis: 60000,       // Longer idle timeout
  connectionTimeoutMillis: 10000, // Shorter connection timeout
}

// Low load settings
pool: {
  max: 5,                         // Fewer max connections
  min: 1,                         // Minimum connections
  idleTimeoutMillis: 10000,       // Shorter idle timeout
}
```

### Query Optimization

```typescript
// Use indexed fields for queries
const users = await userRepo.findMany({
  field: 'email',  // Ensure email field is indexed
  op: '=',
  value: 'user@example.com',
});

// Limit result sets
const recentUsers = await userRepo.findMany(undefined, {
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 100,  // Limit results
});

// Query only needed fields
const userNames = await userRepo.find({
  fields: ['id', 'name'],  // Only query needed fields
});
```

## Security Considerations

### Parameterized Queries

PostgreSQL Provider automatically uses parameterized queries to prevent SQL injection:

```typescript
// Safe query (automatically parameterized)
const user = await userRepo.findOne({
  field: 'email',
  op: '=',
  value: userInput,  // Automatically escaped
});

// Complex safe query
const users = await userRepo.find({
  where: {
    and: [
      { field: 'department', op: '=', value: userDepartment },
      { field: 'salary', op: '>', value: minSalary }
    ]
  }
});

// All query objects are automatically protected against SQL injection
```

### Connection Security

```typescript
// SSL connection
const gateway = await DataGateway.build({
  providers: {
    postgres: {
      type: 'postgresql',
      options: {
        host: 'secure-db.example.com',
        port: 5432,
        user: 'app_user',
        password: process.env.DB_PASSWORD,
        database: 'production_db',
        ssl: {
          rejectUnauthorized: true,
          ca: fs.readFileSync('server-ca.pem'),
          key: fs.readFileSync('client-key.pem'),
          cert: fs.readFileSync('client-cert.pem'),
        },
      },
    },
  },
  repositories: {
    users: { provider: 'postgres', table: 'users' },
  },
});
```

## Complete Example

```typescript
import { DataGateway, PostgreSQLProviderOptions } from '@wfp99/data-gateway';

async function postgresExample() {
  const gateway = await DataGateway.build({
    providers: {
      postgres: {
        type: 'postgresql',
        options: {
          host: 'localhost',
          port: 5432,
          user: 'postgres',
          password: 'password',
          database: 'testdb',
          pool: {
            usePool: true,
            max: 20,
            min: 5,
            idleTimeoutMillis: 30000,
          }
        } as PostgreSQLProviderOptions
      }
    },
    repositories: {
      users: { provider: 'postgres', table: 'users' },
      orders: { provider: 'postgres', table: 'orders' }
    }
  });

  try {
    const userRepo = gateway.getRepository('users');

    // Insert user
    const userId = await userRepo?.insert({
      name: 'Alice Wang',
      email: 'alice@example.com',
      age: 28,
      department: 'Engineering'
    });

    // Complex query
    const engineeringUsers = await userRepo?.find({
      fields: ['id', 'name', 'email'],
      where: {
        and: [
          { field: 'department', op: '=', value: 'Engineering' },
          { field: 'age', op: '>=', value: 25 }
        ]
      },
      orderBy: [{ field: 'name', direction: 'ASC' }],
      limit: 10
    });

    console.log('Engineering department users:', engineeringUsers);

    // Monitor connection pool
    const poolStatus = gateway.getProviderPoolStatus('postgres');
    console.log('PostgreSQL connection pool status:', poolStatus);

  } finally {
    await gateway.disconnectAll();
  }
}

postgresExample().catch(console.error);
```

## Related Links

- [PostgreSQL Official Documentation](https://www.postgresql.org/docs/)
- [node-postgres (pg) Documentation](https://node-postgres.com/)
- [DataGateway API Documentation](../api/data-gateway.en.md)
- [Repository API Documentation](../api/repository.en.md)