# MySQL Provider

The MySQL Provider is a Data Gateway data provider specifically designed for MySQL and MariaDB databases. It implements the `DataProvider` interface, supporting connection pooling, query construction, and error handling.

## Installation

MySQL Provider requires the `mysql2` package as a peer dependency:

```bash
npm install mysql2
```

## Basic Usage

### Connection Configuration

```typescript
import { DataGateway } from '@wfp99/data-gateway';

const gateway = await DataGateway.build({
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: 'password',
        database: 'mydb',
      },
    },
  },
  repositories: {
    users: {
      provider: 'mysql',
      table: 'users',
    },
  },
});
```

### Connection Pool Configuration

MySQL Provider enables connection pooling by default, configurable through `pool` options:

```typescript
const gateway = await DataGateway.build({
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: 'password',
        database: 'mydb',
        pool: {
          usePool: true,              // Enable connection pool (default: true)
          connectionLimit: 10,        // Maximum connections (default: 10)
          queueLimit: 0,             // Maximum queued requests (default: 0, unlimited)
          acquireTimeout: 60000,     // Connection acquire timeout (default: 60000ms)
          timeout: 600000,           // Idle connection timeout (default: 600000ms)
          preConnect: false,         // Pre-establish connections on startup (default: false)
        },
      },
    },
  },
  repositories: {
    users: { provider: 'mysql', table: 'users' },
  },
});
```

### Disabling Connection Pool

To use a single connection instead of a connection pool:

```typescript
const gateway = await DataGateway.build({
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: 'password',
        database: 'mydb',
        pool: {
          usePool: false,  // Disable connection pool
        },
      },
    },
  },
  repositories: {
    users: { provider: 'mysql', table: 'users' },
  },
});
```

## Connection Options

MySQL Provider supports all `ConnectionOptions` from `mysql2/promise`:

```typescript
interface MySQLProviderOptions extends ConnectionOptions {
  // Basic connection options
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  charset?: string;
  timezone?: string;

  // SSL configuration
  ssl?: string | (tls.SecureContextOptions & {
    rejectUnauthorized?: boolean;
  });

  // Connection behavior
  connectTimeout?: number;
  acquireTimeout?: number;
  timeout?: number;
  reconnect?: boolean;

  // Other options
  multipleStatements?: boolean;
  dateStrings?: boolean | Array<'TIMESTAMP' | 'DATETIME' | 'DATE'>;
  supportBigNumbers?: boolean;
  bigNumberStrings?: boolean;
  insertIdAsNumber?: boolean;
  decimalNumbers?: boolean;

  // Connection pool configuration
  pool?: ConnectionPoolConfig;
}
```

## Character Set and Encoding Configuration

### UTF8MB4 Character Set (Highly Recommended)

**Important:** MySQL Provider uses `utf8mb4` character set by default, which is essential for full Unicode character support (including emoji, rare Chinese characters, etc.).

#### Why UTF8MB4?

MySQL's `utf8` character set only supports 3-byte UTF-8 characters and cannot properly store:
- Emoji characters: 😀, 🎉, ❤️
- Some rare Chinese characters: 𠮷, 𨋢
- Certain symbols: 𝕏, 🇹🇼

`utf8mb4` supports full 4-byte UTF-8 encoding and can correctly handle all Unicode characters.

#### Application Level Configuration

```typescript
const gateway = await DataGateway.build({
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        user: 'app_user',
        password: 'password',
        database: 'mydb',
        charset: 'utf8mb4',  // Default value, supports full Unicode
      },
    },
  },
  repositories: {
    users: { provider: 'mysql', table: 'users' },
  },
});
```

#### Database Level Configuration

In addition to application configuration, ensure your MySQL database and tables use the correct character set:

```sql
-- 1. Create database with character set
CREATE DATABASE mydb
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 2. Modify existing database character set
ALTER DATABASE mydb
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 3. Create table with character set
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  bio TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Modify existing table character set
ALTER TABLE users
  CONVERT TO CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

#### Verify Character Set Configuration

```sql
-- Check database character set
SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = 'mydb';

-- Check table character set
SHOW CREATE TABLE users;

-- Check column character set
SELECT COLUMN_NAME, CHARACTER_SET_NAME, COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'mydb' AND TABLE_NAME = 'users';
```

#### Testing UTF8MB4 Support

```typescript
// Test inserting data with emoji and multi-language characters
const userRepo = gateway.getRepository('users');

await userRepo.insert({
  name: 'John Smith',
  bio: 'Software engineer 👨‍💻, loves traveling 🌍',
  status: 'Active ✨'
});

// Read data and verify
const user = await userRepo.findOne({
  field: 'name',
  op: '=',
  value: 'John Smith'
});

console.log(user.bio); // Should display correctly: Software engineer 👨‍💻, loves traveling 🌍
```

#### Common Questions

**Q: Why do my emoji show as `????`?**

A: This is usually because:
1. Database or table does not use `utf8mb4` character set
2. Connection does not specify `charset: 'utf8mb4'`
3. VARCHAR field length is insufficient (utf8mb4 uses up to 4 bytes per character)

**Q: How to calculate VARCHAR field length?**

A: In `utf8mb4`, VARCHAR(100) means up to 100 characters, but:
- Each ASCII character uses 1 byte
- Each Chinese character uses 3 bytes
- Each emoji uses 4 bytes

If you need to store 100 Chinese characters, ensure the table definition allows sufficient bytes.

**Q: How to migrate existing projects to utf8mb4?**

A: Recommended steps:
1. Backup existing data
2. Modify database character set
3. Modify table character set (using `ALTER TABLE ... CONVERT TO`)
4. Update application connection settings
5. Test data integrity

#### Character Set Warnings

If you explicitly specify a character set other than `utf8mb4`, the Provider will log a warning message:

```
[WARN] MySQL charset is not utf8mb4. Emoji and some Unicode characters may not be stored correctly.
```

We recommend always using `utf8mb4` to ensure full Unicode support.

## Query Features

### Basic CRUD Operations

```typescript
const userRepo = gateway.getRepository('users');

// Create user
const userId = await userRepo.insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  created_at: new Date()
});

// Query users
const users = await userRepo.findMany({
  field: 'age',
  op: '>',
  value: 18,
});

// Update user
const updatedRows = await userRepo.update(
  { email: 'john.doe@example.com', updated_at: new Date() },
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
    { field: 'status', op: '=', value: 'active' },
    { field: 'age', op: '>=', value: 18 },
  ],
});

// LIKE queries
const johnUsers = await userRepo.findMany({
  field: 'name',
  op: 'LIKE',
  value: 'John%'
});

// IN queries
const specificUsers = await userRepo.findMany({
  field: 'id',
  op: 'IN',
  values: [1, 2, 3, 4, 5],
});

// BETWEEN queries
const ageRangeUsers = await userRepo.findMany({
  field: 'age',
  op: 'BETWEEN',
  values: [18, 65]
});
```

### Aggregate Queries

```typescript
// Statistical queries
const stats = await userRepo.find({
  fields: [
    'department',
    { type: 'COUNT', field: 'id', alias: 'user_count' },
    { type: 'AVG', field: 'age', alias: 'avg_age' },
    { type: 'MIN', field: 'salary', alias: 'min_salary' },
    { type: 'MAX', field: 'salary', alias: 'max_salary' },
    { type: 'SUM', field: 'salary', alias: 'total_salary' }
  ],
  groupBy: ['department'],
  having: {
    field: { type: 'COUNT', field: 'id' },
    op: '>',
    value: 5
  },
  orderBy: [{ field: 'user_count', direction: 'DESC' }]
});
```

### Pagination

```typescript
// First page
const page1 = await userRepo.find({
  where: { field: 'status', op: '=', value: 'active' },
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 20,
  offset: 0
});

// Second page
const page2 = await userRepo.find({
  where: { field: 'status', op: '=', value: 'active' },
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 20,
  offset: 20
});
```

## Advanced Query Features

### Subquery Support

```typescript
// Find users with salary above average
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

// Find users with orders
const usersWithOrders = await userRepo.find({
  where: {
    field: 'id',
    op: 'IN',
    subquery: {
      type: 'SELECT',
      table: 'orders',
      fields: ['user_id'],
      where: {
        field: 'status',
        op: '=',
        value: 'completed'
      }
    }
  }
});
```

### Complex AND/OR Conditions

```typescript
// Nested conditions for complex filtering
const complexQuery = await userRepo.find({
  where: {
    and: [
      {
        or: [
          { field: 'department', op: '=', value: 'Engineering' },
          { field: 'department', op: '=', value: 'Product' },
          { field: 'department', op: '=', value: 'Design' }
        ]
      },
      {
        and: [
          { field: 'status', op: '=', value: 'active' },
          { field: 'salary', op: '>', value: 50000 },
          {
            or: [
              { field: 'experience_years', op: '>=', value: 3 },
              { field: 'has_certification', op: '=', value: true }
            ]
          }
        ]
      }
    ]
  }
});
```

## Connection Pool Monitoring

MySQL Provider provides rich connection pool status monitoring:

```typescript
// Get connection pool status for specific provider
const poolStatus = gateway.getProviderPoolStatus('mysql');
if (poolStatus) {
  console.log('MySQL Connection Pool Status:');
  console.log(`Total connections: ${poolStatus.totalConnections}`);
  console.log(`Active connections: ${poolStatus.activeConnections}`);
  console.log(`Idle connections: ${poolStatus.idleConnections}`);
  console.log(`Max connections: ${poolStatus.maxConnections}`);

  // Calculate utilization rate
  const utilizationRate = (poolStatus.activeConnections / poolStatus.maxConnections * 100).toFixed(1);
  console.log(`Utilization: ${utilizationRate}%`);
}

// Set up connection pool monitoring
setInterval(() => {
  const status = gateway.getProviderPoolStatus('mysql');
  if (status) {
    const utilization = status.activeConnections / status.maxConnections;

    if (utilization > 0.8) {
      console.warn(`MySQL connection pool utilization too high: ${Math.round(utilization * 100)}%`);
    }

    if (status.activeConnections === status.maxConnections) {
      console.error('MySQL connection pool exhausted, consider increasing connectionLimit');
    }
  }
}, 30000); // Check every 30 seconds
```

## MySQL-Specific Features

### Handling Large Numbers

```typescript
// Configure large number handling
mysql: {
  type: 'mysql',
  options: {
    host: 'localhost',
    // ... other settings
    supportBigNumbers: true,      // Support large numbers
    bigNumberStrings: true,       // Convert large numbers to strings
    insertIdAsNumber: true,       // INSERT ID as number type
    decimalNumbers: true          // Decimal numbers as number type
  }
}

// Handle BIGINT fields
const result = await userRepo.insert({
  name: 'Test User',
  big_number_field: '9223372036854775807'  // BIGINT maximum value
});
```

### Date and Time Handling

```typescript
// Configure date string handling
mysql: {
  type: 'mysql',
  options: {
    host: 'localhost',
    // ... other settings
    dateStrings: ['DATE', 'DATETIME'],  // Specify field types to return as strings
    timezone: 'local'                   // Set timezone
  }
}

// Handle date fields
await userRepo.insert({
  name: 'Test User',
  birth_date: '1990-01-01',           // DATE field
  created_at: new Date(),             // DATETIME field
  updated_at: new Date().toISOString() // ISO format
});
```

### Multiple Statement Queries

```typescript
// Enable multiple statements (use with caution)
mysql: {
  type: 'mysql',
  options: {
    host: 'localhost',
    // ... other settings
    multipleStatements: true  // Enable multiple statements
  }
}
```

## Error Handling

MySQL Provider provides detailed error information:

```typescript
try {
  const result = await userRepo.insert({ name: 'Test User' });
} catch (error) {
  console.error('Insert failed:', error.message);

  if (error.code) {
    switch (error.code) {
      case 'ER_DUP_ENTRY':
        console.error('Duplicate entry, check unique constraints');
        break;
      case 'ER_NO_SUCH_TABLE':
        console.error('Table does not exist');
        break;
      case 'ER_ACCESS_DENIED_ERROR':
        console.error('Access denied, check user permissions');
        break;
      case 'ECONNREFUSED':
        console.error('Connection refused, check if MySQL server is running');
        break;
      case 'ER_BAD_DB_ERROR':
        console.error('Database does not exist');
        break;
      default:
        console.error('Unknown error:', error.code, error.message);
    }
  }
}
```

Common error codes:
- `ER_DUP_ENTRY`: Duplicate key value
- `ER_NO_SUCH_TABLE`: Table does not exist
- `ER_ACCESS_DENIED_ERROR`: Access denied
- `ER_BAD_DB_ERROR`: Database does not exist
- `ECONNREFUSED`: Connection refused
- `PROTOCOL_CONNECTION_LOST`: Connection lost

## Performance Optimization

### Connection Pool Tuning

```typescript
// High-traffic production environment
pool: {
  usePool: true,
  connectionLimit: 50,        // Adjust based on server capacity
  queueLimit: 200,           // Prevent infinite queuing
  acquireTimeout: 30000,     // 30 second connection timeout
  timeout: 300000,           // 5 minute idle timeout
  preConnect: true           // Pre-establish connections on startup
}

// Medium traffic environment
pool: {
  usePool: true,
  connectionLimit: 20,
  queueLimit: 100,
  acquireTimeout: 60000,
  timeout: 600000,
  preConnect: false
}

// Low traffic or development environment
pool: {
  usePool: true,
  connectionLimit: 5,
  acquireTimeout: 60000,
  timeout: 600000
}
```

### Query Optimization

```typescript
// Use indexed fields
const users = await userRepo.findMany({
  field: 'email',  // Ensure email field is indexed
  op: '=',
  value: 'user@example.com'
});

// Limit result count
const recentUsers = await userRepo.find({
  orderBy: [{ field: 'created_at', direction: 'DESC' }],
  limit: 100  // Limit results
});

// Query only needed fields
const userList = await userRepo.find({
  fields: ['id', 'name', 'email'],  // Only query necessary fields
  where: { field: 'status', op: '=', value: 'active' }
});

// Batch operations
const userIds = [1, 2, 3, 4, 5];
const users = await userRepo.findMany({
  field: 'id',
  op: 'IN',
  values: userIds  // Query multiple records at once
});
```

## Security Considerations

### Parameterized Queries

MySQL Provider automatically uses parameterized queries to prevent SQL injection:

```typescript
// Safe query (automatically parameterized)
const user = await userRepo.findOne({
  field: 'email',
  op: '=',
  value: userInput  // Automatically escaped, prevents SQL injection
});

// Complex conditions are also automatically parameterized
const users = await userRepo.find({
  where: {
    and: [
      { field: 'department', op: '=', value: userDepartment },
      { field: 'salary', op: '>', value: minSalary },
      { field: 'name', op: 'LIKE', value: `${searchTerm}%` }
    ]
  }
});
```

### SSL Connection

```typescript
// SSL connection configuration
mysql: {
  type: 'mysql',
  options: {
    host: 'secure-db.example.com',
    port: 3306,
    user: 'app_user',
    password: process.env.DB_PASSWORD,
    database: 'production_db',
    ssl: {
      rejectUnauthorized: true,
      ca: fs.readFileSync('ca.pem'),
      key: fs.readFileSync('client-key.pem'),
      cert: fs.readFileSync('client-cert.pem')
    }
  }
}

// Or use simplified SSL configuration
mysql: {
  type: 'mysql',
  options: {
    host: 'secure-db.example.com',
    // ... other settings
    ssl: 'Amazon RDS'  // Default SSL configuration
  }
}
```

### Connection Security

```typescript
// Secure connection configuration
mysql: {
  type: 'mysql',
  options: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',              // Support full UTF-8
    timezone: 'Z',                   // Use UTC timezone
    multipleStatements: false,       // Disable multiple statements (security)
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: true
    } : false
  }
}
```

## High Availability Setup

### Read-Write Separation

```typescript
// Master-slave separation example
const config = {
  providers: {
    // Master database (writes)
    mysqlMaster: {
      type: 'mysql',
      options: {
        host: 'master-db.example.com',
        user: 'app_user',
        password: process.env.MASTER_DB_PASSWORD,
        database: 'app_db',
        pool: {
          connectionLimit: 10
        }
      }
    },

    // Slave database (reads)
    mysqlSlave: {
      type: 'mysql',
      options: {
        host: 'slave-db.example.com',
        user: 'readonly_user',
        password: process.env.SLAVE_DB_PASSWORD,
        database: 'app_db',
        pool: {
          connectionLimit: 20  // Usually more for reads
        }
      }
    }
  },

  repositories: {
    // Write operations use master database
    usersWrite: { provider: 'mysqlMaster', table: 'users' },
    // Read operations use slave database
    usersRead: { provider: 'mysqlSlave', table: 'users' }
  }
};

// Usage example
const writeRepo = gateway.getRepository('usersWrite');
const readRepo = gateway.getRepository('usersRead');

// Write operation
await writeRepo.insert({ name: 'New User', email: 'new@example.com' });

// Read operation
const users = await readRepo.findMany();
```

### Connection Retry

```typescript
// Connection configuration with retry mechanism
mysql: {
  type: 'mysql',
  options: {
    host: 'db.example.com',
    // ... other settings
    reconnect: true,           // Enable auto-reconnect
    pool: {
      usePool: true,
      connectionLimit: 10,
      acquireTimeout: 30000,   // Connection acquire timeout
      timeout: 600000,         // Idle timeout
      preConnect: true         // Pre-test connections
    }
  }
}
```

## Complete Example

```typescript
import { DataGateway, MySQLProviderOptions } from '@wfp99/data-gateway';
import fs from 'fs';

async function mysqlExample() {
  const gateway = await DataGateway.build({
    providers: {
      mysql: {
        type: 'mysql',
        options: {
          host: 'localhost',
          port: 3306,
          user: 'app_user',
          password: process.env.MYSQL_PASSWORD,
          database: 'ecommerce',
          charset: 'utf8mb4',
          timezone: 'Z',
          pool: {
            usePool: true,
            connectionLimit: 15,
            queueLimit: 100,
            acquireTimeout: 30000,
            timeout: 300000,
            preConnect: true
          },
          ssl: process.env.NODE_ENV === 'production' ? {
            rejectUnauthorized: true,
            ca: fs.readFileSync('mysql-ca.pem')
          } : false
        } as MySQLProviderOptions
      }
    },
    repositories: {
      users: { provider: 'mysql', table: 'users' },
      orders: { provider: 'mysql', table: 'orders' },
      products: { provider: 'mysql', table: 'products' }
    }
  });

  try {
    const userRepo = gateway.getRepository('users');
    const orderRepo = gateway.getRepository('orders');

    // Create user
    const userId = await userRepo?.insert({
      name: 'Alice Wang',
      email: 'alice@example.com',
      age: 28,
      department: 'Engineering',
      salary: 75000,
      created_at: new Date()
    });

    console.log(`New user ID: ${userId}`);

    // Complex query
    const engineeringUsers = await userRepo?.find({
      fields: ['id', 'name', 'email', 'salary'],
      where: {
        and: [
          { field: 'department', op: '=', value: 'Engineering' },
          { field: 'age', op: '>=', value: 25 },
          { field: 'salary', op: '>', value: 60000 }
        ]
      },
      orderBy: [{ field: 'salary', direction: 'DESC' }],
      limit: 10
    });

    console.log('High-paid Engineering users:', engineeringUsers?.rows);

    // Aggregate query
    const departmentStats = await userRepo?.find({
      fields: [
        'department',
        { type: 'COUNT', field: 'id', alias: 'employee_count' },
        { type: 'AVG', field: 'salary', alias: 'avg_salary' },
        { type: 'MAX', field: 'salary', alias: 'max_salary' }
      ],
      groupBy: ['department'],
      having: {
        field: { type: 'COUNT', field: 'id' },
        op: '>',
        value: 5
      },
      orderBy: [{ field: 'avg_salary', direction: 'DESC' }]
    });

    console.log('Department statistics:', departmentStats?.rows);

    // Monitor connection pool
    const poolStatus = gateway.getProviderPoolStatus('mysql');
    if (poolStatus) {
      console.log(`MySQL connection pool status: ${poolStatus.activeConnections}/${poolStatus.maxConnections} active`);
    }

  } catch (error) {
    console.error('MySQL operation error:', error);
  } finally {
    await gateway.disconnectAll();
  }
}

mysqlExample().catch(console.error);
```

## Related Links

- [MySQL Official Documentation](https://dev.mysql.com/doc/)
- [mysql2 Package Documentation](https://github.com/sidorares/node-mysql2)
- [DataGateway API Documentation](../api/data-gateway.en.md)
- [Connection Pooling Guide](../advanced/connection-pooling.en.md)