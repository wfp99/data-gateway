# SQLite Provider

SQLite Provider is a Data Gateway data provider specifically designed for SQLite databases. It implements the `DataProvider` interface and supports file and in-memory databases, connection pooling, and efficient query building.

## Installation

SQLite Provider requires the `@sqlite/sqlite3` package as a peer dependency:

```bash
npm install @sqlite/sqlite3
```

For development environments, you can also use `sqlite3`:

```bash
npm install sqlite3
```

## Basic Usage

### File Database Configuration

```typescript
import { DataGateway } from '@wfp99/data-gateway';

const gateway = await DataGateway.build({
  providers: {
    sqlite: {
      type: 'sqlite',
      options: {
        filename: './database.db',  // Database file path
        // Optional settings
        mode: 'OPEN_READWRITE | OPEN_CREATE',
        verbose: false
      },
    },
  },
  repositories: {
    users: {
      provider: 'sqlite',
      table: 'users',
    },
  },
});
```

### In-Memory Database Configuration

```typescript
const gateway = await DataGateway.build({
  providers: {
    sqlite: {
      type: 'sqlite',
      options: {
        filename: ':memory:',  // In-memory database
        verbose: true         // Enable verbose logging for development
      },
    },
  },
  repositories: {
    users: { provider: 'sqlite', table: 'users' },
    cache: { provider: 'sqlite', table: 'cache_entries' },
  },
});
```

### Read Pool Configuration

SQLite Provider supports read connection pooling, suitable for read-intensive applications:

```typescript
const gateway = await DataGateway.build({
  providers: {
    sqlite: {
      type: 'sqlite',
      options: {
        filename: './app.db',
        pool: {
          usePool: true,              // Enable read connection pool
          readPoolSize: 5,           // Read pool size (default: 3)
          writeConnection: 'single', // Write connection mode (default: 'single')
          acquireTimeout: 30000,     // Connection acquire timeout (default: 30000ms)
          idleTimeout: 300000,       // Idle connection timeout (default: 300000ms)
          preConnect: false,         // Pre-establish connections at startup (default: false)
        },
      },
    },
  },
  repositories: {
    users: { provider: 'sqlite', table: 'users' },
  },
});
```

## Connection Options

SQLite Provider supports various connection options:

```typescript
interface SQLiteProviderOptions {
  // Database file path
  filename: string;  // File path or ':memory:' or ':memory:shared'

  // Open mode
  mode?: string;     // 'OPEN_READONLY' | 'OPEN_READWRITE' | 'OPEN_CREATE' etc.

  // Debug options
  verbose?: boolean; // Enable SQL statement logging

  // Connection pool settings (read pool only)
  pool?: {
    usePool: boolean;              // Whether to enable read connection pool
    readPoolSize?: number;         // Read pool size (default: 3)
    writeConnection?: 'single';    // Write connection mode (only 'single' supported)
    acquireTimeout?: number;       // Connection acquire timeout (default: 30000ms)
    idleTimeout?: number;          // Idle connection timeout (default: 300000ms)
    preConnect?: boolean;          // Pre-establish connections at startup (default: false)
  };
}
```

### File Mode Descriptions

```typescript
// Read-only mode
sqlite: {
  type: 'sqlite',
  options: {
    filename: './readonly.db',
    mode: 'OPEN_READONLY'
  }
}

// Read-write mode (create if not exists)
sqlite: {
  type: 'sqlite',
  options: {
    filename: './readwrite.db',
    mode: 'OPEN_READWRITE | OPEN_CREATE'  // Default mode
  }
}

// Shared cache in-memory database
sqlite: {
  type: 'sqlite',
  options: {
    filename: ':memory:shared',  // Multiple connections share same in-memory database
    mode: 'OPEN_READWRITE | OPEN_CREATE'
  }
}
```

## Query Features

### Basic CRUD Operations

```typescript
const userRepo = gateway.getRepository('users');

// Create user (SQLite auto-generates rowid)
const userId = await userRepo.insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  created_at: Date.now()  // SQLite supports Unix timestamps
});

// Query users
const users = await userRepo.findMany({
  field: 'age',
  op: '>',
  value: 18,
});

// Update user
const updatedRows = await userRepo.update(
  { email: 'john.doe@example.com', updated_at: Date.now() },
  { field: 'rowid', op: '=', value: userId }
);

// Delete user
const deletedRows = await userRepo.delete({
  field: 'rowid',
  op: '=',
  value: userId,
});
```

### SQLite-Specific Queries

```typescript
// Using GLOB pattern matching (SQLite-specific)
const users = await userRepo.findMany({
  field: 'name',
  op: 'GLOB',
  value: 'John*'
});

// Using REGEXP (requires REGEXP extension)
const emailUsers = await userRepo.findMany({
  field: 'email',
  op: 'REGEXP',
  value: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
});

// JSON queries (SQLite 3.45+)
const userPrefs = await userRepo.findMany({
  field: 'preferences',
  op: '->>',
  value: '$.theme'  // JSON path query
});
```

### Complex Queries

```typescript
// Full-text search (requires FTS5 extension)
const searchResults = await gateway.query(`
  SELECT * FROM users_fts
  WHERE users_fts MATCH ?
  ORDER BY rank
`, ['John OR engineer']);

// Window function queries
const rankedUsers = await gateway.query(`
  SELECT
    name,
    department,
    salary,
    ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) as rank
  FROM users
  WHERE rank <= 3
`);

// Common Table Expression (CTE)
const departmentHierarchy = await gateway.query(`
  WITH RECURSIVE dept_tree AS (
    SELECT id, name, parent_id, 0 as level
    FROM departments
    WHERE parent_id IS NULL

    UNION ALL

    SELECT d.id, d.name, d.parent_id, dt.level + 1
    FROM departments d
    JOIN dept_tree dt ON d.parent_id = dt.id
  )
  SELECT * FROM dept_tree ORDER BY level, name
`);
```

### Aggregation and Statistics

```typescript
// Basic statistics
const stats = await userRepo.find({
  fields: [
    { type: 'COUNT', field: '*', alias: 'total_users' },
    { type: 'AVG', field: 'age', alias: 'avg_age' },
    { type: 'MIN', field: 'created_at', alias: 'first_user' },
    { type: 'MAX', field: 'created_at', alias: 'latest_user' }
  ]
});

// Grouped statistics
const departmentStats = await userRepo.find({
  fields: [
    'department',
    { type: 'COUNT', field: '*', alias: 'count' },
    { type: 'AVG', field: 'salary', alias: 'avg_salary' },
    { type: 'SUM', field: 'salary', alias: 'total_salary' }
  ],
  groupBy: ['department'],
  orderBy: [{ field: 'avg_salary', direction: 'DESC' }]
});

// Median calculation (SQLite-specific function)
const medianSalary = await gateway.query(`
  SELECT
    department,
    AVG(salary) as median_salary
  FROM (
    SELECT
      department,
      salary,
      ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary) as row_num,
      COUNT(*) OVER (PARTITION BY department) as total_count
    FROM users
  )
  WHERE row_num IN ((total_count + 1) / 2, (total_count + 2) / 2)
  GROUP BY department
`);
```

## Read Connection Pool

SQLite Provider's read connection pool is designed for read-intensive applications:

```typescript
// High read load configuration
sqlite: {
  type: 'sqlite',
  options: {
    filename: './high_read_load.db',
    pool: {
      usePool: true,
      readPoolSize: 10,          // Increase read connections
      acquireTimeout: 5000,      // Shorter acquire timeout
      idleTimeout: 60000,        // Shorter idle timeout
      preConnect: true           // Pre-establish connections
    }
  }
}

// Monitor read pool status
const poolStatus = gateway.getProviderPoolStatus('sqlite');
if (poolStatus) {
  console.log('SQLite Read Pool Status:');
  console.log(`Active read connections: ${poolStatus.activeConnections}`);
  console.log(`Idle read connections: ${poolStatus.idleConnections}`);
  console.log(`Total read connections: ${poolStatus.totalConnections}`);
  console.log(`Max read connections: ${poolStatus.maxConnections}`);
}

// Read/write operation examples
const userRepo = gateway.getRepository('users');

// Write operation (uses single write connection)
await userRepo.insert({ name: 'New User', email: 'new@example.com' });

// Read operations (use read connections from pool)
const users = await userRepo.findMany();
const userCount = await userRepo.find({
  fields: [{ type: 'COUNT', field: '*', alias: 'count' }]
});
```

## Performance Optimization

### WAL Mode

SQLite Provider recommends using WAL (Write-Ahead Logging) mode in production:

```typescript
// Enable WAL mode (improves concurrent performance)
const gateway = await DataGateway.build({
  providers: {
    sqlite: {
      type: 'sqlite',
      options: {
        filename: './app.db',
        pool: { usePool: true, readPoolSize: 5 }
      }
    }
  },
  repositories: {
    users: { provider: 'sqlite', table: 'users' }
  }
});

// Set WAL mode and other optimization options
await gateway.query('PRAGMA journal_mode = WAL');
await gateway.query('PRAGMA synchronous = NORMAL');
await gateway.query('PRAGMA cache_size = 10000');
await gateway.query('PRAGMA temp_store = MEMORY');
await gateway.query('PRAGMA mmap_size = 268435456'); // 256MB
```

### Index Optimization

```typescript
// Create indexes to improve query performance
await gateway.query(`
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_department_salary ON users(department, salary);
  CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
`);

// Composite index examples
await gateway.query(`
  CREATE INDEX IF NOT EXISTS idx_users_status_dept_salary
  ON users(status, department, salary DESC);
`);

// Partial indexes (SQLite-specific)
await gateway.query(`
  CREATE INDEX IF NOT EXISTS idx_active_users
  ON users(email) WHERE status = 'active';
`);

// Expression indexes
await gateway.query(`
  CREATE INDEX IF NOT EXISTS idx_users_email_lower
  ON users(LOWER(email));
`);
```

### Batch Operations

```typescript
// Batch insert optimization
const users = [
  { name: 'User 1', email: 'user1@example.com' },
  { name: 'User 2', email: 'user2@example.com' },
  { name: 'User 3', email: 'user3@example.com' }
];

// Use transaction for batch inserts
await gateway.query('BEGIN TRANSACTION');
try {
  for (const user of users) {
    await userRepo.insert(user);
  }
  await gateway.query('COMMIT');
} catch (error) {
  await gateway.query('ROLLBACK');
  throw error;
}

// Or use batch INSERT
const placeholders = users.map(() => '(?, ?)').join(', ');
const values = users.flatMap(user => [user.name, user.email]);
await gateway.query(`
  INSERT INTO users (name, email) VALUES ${placeholders}
`, values);
```

### Memory Usage Optimization

```typescript
// Memory optimization settings
await gateway.query('PRAGMA cache_size = 2000');        // Reduce cache size
await gateway.query('PRAGMA temp_store = FILE');        // Use file for temp tables
await gateway.query('PRAGMA mmap_size = 67108864');     // 64MB mmap
await gateway.query('PRAGMA page_size = 4096');         // 4KB page size

// Periodic cleanup
setInterval(async () => {
  await gateway.query('PRAGMA optimize');               // Optimize query plans
  await gateway.query('VACUUM');                        // Reorganize database file
}, 3600000); // Execute every hour
```

## Data Type Handling

### SQLite Data Types

```typescript
// SQLite dynamic typing examples
await userRepo.insert({
  // Integer
  id: 1,
  age: 30,

  // Real
  salary: 75000.50,
  rating: 4.8,

  // Text
  name: 'John Doe',
  email: 'john@example.com',

  // BLOB
  avatar: Buffer.from('binary data'),

  // Boolean (stored as integer)
  is_active: true,    // Stored as 1
  is_deleted: false,  // Stored as 0

  // Dates (multiple formats)
  created_at: new Date(),           // ISO string
  updated_at: Date.now(),           // Unix timestamp
  birth_date: '1990-01-01',         // Date string

  // JSON (stored as text)
  preferences: JSON.stringify({ theme: 'dark', lang: 'en' }),

  // NULL
  deleted_at: null
});
```

### Date and Time Handling

```typescript
// Date and time query examples
const recentUsers = await userRepo.findMany({
  field: 'created_at',
  op: '>',
  value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
});

// Using SQLite date functions
const thisMonth = await gateway.query(`
  SELECT * FROM users
  WHERE DATE(created_at) >= DATE('now', 'start of month')
`);

// Date formatting
const formatted = await gateway.query(`
  SELECT
    name,
    STRFTIME('%Y-%m-%d', created_at) as creation_date,
    STRFTIME('%H:%M', created_at) as creation_time
  FROM users
`);
```

### JSON Data Handling

```typescript
// JSON data operations (SQLite 3.45+)
await userRepo.insert({
  name: 'John',
  preferences: JSON.stringify({
    theme: 'dark',
    notifications: {
      email: true,
      push: false
    },
    languages: ['en', 'zh-TW']
  })
});

// JSON queries
const darkThemeUsers = await gateway.query(`
  SELECT name, preferences
  FROM users
  WHERE JSON_EXTRACT(preferences, '$.theme') = 'dark'
`);

// JSON array queries
const multilingualUsers = await gateway.query(`
  SELECT name, preferences
  FROM users
  WHERE JSON_ARRAY_LENGTH(JSON_EXTRACT(preferences, '$.languages')) > 1
`);
```

## Full-Text Search

### FTS5 Setup

```typescript
// Create FTS5 full-text search table
await gateway.query(`
  CREATE VIRTUAL TABLE IF NOT EXISTS users_fts USING fts5(
    name,
    email,
    bio,
    content='users',
    content_rowid='rowid'
  );
`);

// Create triggers to sync data
await gateway.query(`
  CREATE TRIGGER IF NOT EXISTS users_fts_insert AFTER INSERT ON users
  BEGIN
    INSERT INTO users_fts(rowid, name, email, bio)
    VALUES (NEW.rowid, NEW.name, NEW.email, NEW.bio);
  END;
`);

await gateway.query(`
  CREATE TRIGGER IF NOT EXISTS users_fts_update AFTER UPDATE ON users
  BEGIN
    UPDATE users_fts SET name=NEW.name, email=NEW.email, bio=NEW.bio
    WHERE rowid = NEW.rowid;
  END;
`);

await gateway.query(`
  CREATE TRIGGER IF NOT EXISTS users_fts_delete AFTER DELETE ON users
  BEGIN
    DELETE FROM users_fts WHERE rowid = OLD.rowid;
  END;
`);

// Full-text search queries
const searchResults = await gateway.query(`
  SELECT users.*, users_fts.rank
  FROM users_fts
  JOIN users ON users.rowid = users_fts.rowid
  WHERE users_fts MATCH ?
  ORDER BY users_fts.rank
`, ['engineer OR developer']);

// Phrase search
const phraseSearch = await gateway.query(`
  SELECT * FROM users_fts WHERE users_fts MATCH '"software engineer"'
`);

// Proximity search
const proximitySearch = await gateway.query(`
  SELECT * FROM users_fts WHERE users_fts MATCH 'NEAR(software engineer, 5)'
`);
```

## Error Handling

SQLite Provider provides detailed error handling:

```typescript
try {
  const result = await userRepo.insert({ name: 'Test User' });
} catch (error) {
  console.error('SQLite operation failed:', error.message);

  if (error.code) {
    switch (error.code) {
      case 'SQLITE_CONSTRAINT_UNIQUE':
        console.error('Unique constraint violation');
        break;
      case 'SQLITE_CONSTRAINT_NOTNULL':
        console.error('Not null constraint violation');
        break;
      case 'SQLITE_CONSTRAINT_FOREIGNKEY':
        console.error('Foreign key constraint violation');
        break;
      case 'SQLITE_BUSY':
        console.error('Database is busy, please retry later');
        break;
      case 'SQLITE_LOCKED':
        console.error('Database is locked');
        break;
      case 'SQLITE_READONLY':
        console.error('Database is in read-only mode');
        break;
      case 'SQLITE_IOERR':
        console.error('I/O error, please check file permissions');
        break;
      case 'SQLITE_CORRUPT':
        console.error('Database file is corrupted');
        break;
      case 'SQLITE_CANTOPEN':
        console.error('Cannot open database file');
        break;
      default:
        console.error('Unknown SQLite error:', error.code, error.message);
    }
  }
}
```

Common error codes:
- `SQLITE_CONSTRAINT_*`: Constraint violations
- `SQLITE_BUSY`: Database busy
- `SQLITE_LOCKED`: Database locked
- `SQLITE_READONLY`: Read-only mode
- `SQLITE_IOERR`: I/O error
- `SQLITE_CORRUPT`: File corruption
- `SQLITE_CANTOPEN`: Cannot open file

## Security Considerations

### File Permissions

```typescript
// Set appropriate file permissions
import fs from 'fs';
import path from 'path';

const dbPath = './app.db';
const dbDir = path.dirname(dbPath);

// Ensure directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { mode: 0o750, recursive: true });
}

// Set database file permissions
if (fs.existsSync(dbPath)) {
  fs.chmodSync(dbPath, 0o640);  // rw-r-----
}
```

### Parameterized Queries

```typescript
// SQLite Provider automatically uses parameterized queries
const safeQuery = await userRepo.findMany({
  field: 'email',
  op: '=',
  value: userInput  // Automatically escaped, prevents SQL injection
});

// Custom queries should also use parameters
const customResult = await gateway.query(`
  SELECT * FROM users
  WHERE department = ? AND salary > ?
`, [userDepartment, minSalary]);  // Parameterized query
```

### Access Control

```typescript
// Restrict file access
const secureConfig = {
  providers: {
    sqlite: {
      type: 'sqlite',
      options: {
        filename: process.env.DB_PATH || './secure.db',
        mode: 'OPEN_READWRITE',  // Don't auto-create files
        verbose: process.env.NODE_ENV === 'development'
      }
    }
  }
};

// Separate development and production environments
const config = process.env.NODE_ENV === 'production'
  ? productionConfig
  : developmentConfig;
```

## Backup and Recovery

### Online Backup

```typescript
// Use SQLite online backup API
import sqlite3 from '@sqlite/sqlite3';

async function backupDatabase(sourcePath: string, backupPath: string): Promise<void> {
  const source = new sqlite3.Database(sourcePath);
  const backup = new sqlite3.Database(backupPath);

  return new Promise((resolve, reject) => {
    source.backup(backup, (err) => {
      source.close();
      backup.close();

      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Periodic backup
setInterval(async () => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await backupDatabase('./app.db', `./backups/app-${timestamp}.db`);
    console.log(`Backup completed: app-${timestamp}.db`);
  } catch (error) {
    console.error('Backup failed:', error);
  }
}, 3600000); // Backup every hour
```

### VACUUM and Optimization

```typescript
// Regular maintenance
async function maintainDatabase() {
  try {
    // Analyze statistics
    await gateway.query('ANALYZE');

    // Rebuild database (clean up space)
    await gateway.query('VACUUM');

    // Optimize query plans
    await gateway.query('PRAGMA optimize');

    console.log('Database maintenance completed');
  } catch (error) {
    console.error('Database maintenance failed:', error);
  }
}

// Execute maintenance weekly
setInterval(maintainDatabase, 7 * 24 * 60 * 60 * 1000);
```

## Complete Example

```typescript
import { DataGateway, SQLiteProviderOptions } from '@wfp99/data-gateway';
import fs from 'fs';
import path from 'path';

async function sqliteExample() {
  // Ensure database directory exists
  const dbDir = './data';
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { mode: 0o750, recursive: true });
  }

  const gateway = await DataGateway.build({
    providers: {
      sqlite: {
        type: 'sqlite',
        options: {
          filename: path.join(dbDir, 'app.db'),
          verbose: process.env.NODE_ENV === 'development',
          pool: {
            usePool: true,
            readPoolSize: 5,
            acquireTimeout: 30000,
            idleTimeout: 300000,
            preConnect: true
          }
        } as SQLiteProviderOptions
      }
    },
    repositories: {
      users: { provider: 'sqlite', table: 'users' },
      posts: { provider: 'sqlite', table: 'posts' },
      cache: { provider: 'sqlite', table: 'cache_entries' }
    }
  });

  try {
    // Initialize database structure
    await gateway.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        age INTEGER,
        department TEXT,
        salary REAL,
        preferences TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await gateway.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT NOT NULL,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Create indexes
    await gateway.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);
      CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
    `);

    // Set WAL mode and optimizations
    await gateway.query('PRAGMA journal_mode = WAL');
    await gateway.query('PRAGMA synchronous = NORMAL');
    await gateway.query('PRAGMA cache_size = 10000');
    await gateway.query('PRAGMA temp_store = MEMORY');

    const userRepo = gateway.getRepository('users');
    const postRepo = gateway.getRepository('posts');

    // Insert test data
    const userId = await userRepo?.insert({
      name: 'Alice Chen',
      email: 'alice@example.com',
      age: 28,
      department: 'Engineering',
      salary: 75000,
      preferences: JSON.stringify({
        theme: 'dark',
        notifications: { email: true, push: false }
      }),
      created_at: new Date().toISOString()
    });

    console.log(`New user ID: ${userId}`);

    // Complex query example
    const engineeringUsers = await userRepo?.find({
      fields: ['id', 'name', 'email', 'salary'],
      where: {
        and: [
          { field: 'department', op: '=', value: 'Engineering' },
          { field: 'is_active', op: '=', value: 1 },
          { field: 'salary', op: '>', value: 50000 }
        ]
      },
      orderBy: [{ field: 'salary', direction: 'DESC' }],
      limit: 10
    });

    console.log('Engineering department users:', engineeringUsers?.rows);

    // JSON query example
    const darkThemeUsers = await gateway.query(`
      SELECT name, email, preferences
      FROM users
      WHERE JSON_EXTRACT(preferences, '$.theme') = 'dark'
    `);

    console.log('Dark theme users:', darkThemeUsers);

    // Statistics query
    const stats = await userRepo?.find({
      fields: [
        'department',
        { type: 'COUNT', field: '*', alias: 'employee_count' },
        { type: 'AVG', field: 'salary', alias: 'avg_salary' },
        { type: 'MAX', field: 'salary', alias: 'max_salary' }
      ],
      groupBy: ['department'],
      orderBy: [{ field: 'avg_salary', direction: 'DESC' }]
    });

    console.log('Department statistics:', stats?.rows);

    // Monitor connection pool status
    const poolStatus = gateway.getProviderPoolStatus('sqlite');
    if (poolStatus) {
      console.log(`SQLite pool status: ${poolStatus.activeConnections}/${poolStatus.maxConnections}`);
    }

    // Database maintenance
    await gateway.query('PRAGMA optimize');
    console.log('Database optimization completed');

  } catch (error) {
    console.error('SQLite operation error:', error);
  } finally {
    await gateway.disconnectAll();
  }
}

sqliteExample().catch(console.error);
```

## Best Practices

1. **Use WAL Mode**: Improves concurrent read performance
2. **Create Appropriate Indexes**: Build indexes based on query patterns
3. **Enable Read Connection Pool**: Suitable for read-intensive applications
4. **Regular Maintenance**: Execute VACUUM and ANALYZE
5. **Monitor File Size**: Regular cleanup and compression
6. **Backup Strategy**: Implement regular backups
7. **Error Handling**: Properly handle file and permission errors
8. **Security Settings**: Appropriate file permissions and access control

## Related Links

- [SQLite Official Documentation](https://www.sqlite.org/docs.html)
- [@sqlite/sqlite3 Package Documentation](https://github.com/sqlite/sqlite3)
- [DataGateway API Documentation](../api/data-gateway.md)
- [Connection Pool Management Guide](../advanced/connection-pooling.md)