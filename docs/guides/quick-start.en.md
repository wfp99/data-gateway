# Quick Start Guide

This guide will get you up and running with Data Gateway in 5 minutes!

## Step 1: Install Required Packages

```bash
# Install Data Gateway
npm install @wfp99/data-gateway

# Install the database drivers you need (choose one or more)
npm install mysql2        # MySQL/MariaDB
npm install pg @types/pg  # PostgreSQL
npm install sqlite sqlite3   # SQLite
# No additional package needed for Remote API
```

## Step 2: Create Basic Configuration

Create an `app.ts` file:

```typescript
import {
  DataGateway,
  MySQLProviderOptions,
  SQLiteProviderOptions,
  PostgreSQLProviderOptions,
  RemoteProviderOptions
} from '@wfp99/data-gateway';

// Configure providers and repositories
const config = {
  providers: {
    // MySQL configuration with connection pooling
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        user: 'root',
        password: 'your_password',
        database: 'your_database',
        // Connection pool configuration (optional)
        pool: {
          usePool: true,          // Enable connection pooling (default: true)
          connectionLimit: 10,    // Maximum connections in pool (default: 10)
          acquireTimeout: 60000,  // Connection acquisition timeout (default: 60000ms)
          timeout: 600000,        // Idle connection timeout (default: 600000ms)
        }
      } as MySQLProviderOptions
    },

    // PostgreSQL configuration with connection pooling
    postgresql: {
      type: 'postgresql',
      options: {
        host: 'localhost',
        user: 'postgres',
        password: 'your_password',
        database: 'your_database',
        port: 5432,
        // Connection pool configuration (optional)
        pool: {
          usePool: true,                    // Enable connection pooling (default: true)
          max: 10,                         // Maximum connections in pool (default: 10)
          min: 0,                          // Minimum connections to maintain (default: 0)
          idleTimeoutMillis: 10000,        // Idle connection timeout (default: 10000ms)
          connectionTimeoutMillis: 30000,  // Connection acquisition timeout (default: 30000ms)
        }
      } as PostgreSQLProviderOptions
    },

    // SQLite configuration with read connection pooling
    sqlite: {
      type: 'sqlite',
      options: {
        filename: './database.db',
        // Connection pool configuration for read operations (optional)
        pool: {
          usePool: true,              // Enable read connection pooling (default: false)
          maxReadConnections: 3,      // Maximum read-only connections (default: 3)
          enableWAL: true,           // Enable WAL mode for better concurrency (default: true when pooling)
        }
      } as SQLiteProviderOptions
    },

    // Remote API configuration
    remote: {
      type: 'remote',
      options: {
        endpoint: 'https://api.example.com/data',
        bearerToken: 'your-api-token',  // Optional
        headers: {                      // Optional
          'Content-Type': 'application/json'
        }
      } as RemoteProviderOptions
    }
  },

  repositories: {
    // User repository using MySQL
    users: { provider: 'mysql', table: 'users' },
    // Order repository using PostgreSQL
    orders: { provider: 'postgresql', table: 'orders' },
    // Log repository using SQLite
    logs: { provider: 'sqlite', table: 'logs' },
    // Product repository using Remote API
    products: { provider: 'remote' }
  }
};

export default config;
```

## Step 3: Basic Usage Example

```typescript
async function main() {
  // Build the DataGateway instance
  const gateway = await DataGateway.build(config);

  try {
    // Get the user repository
    const userRepo = gateway.getRepository('users');

    if (userRepo) {
      // === Create Data ===
      const newUserId = await userRepo.insert({
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
        status: 'active'
      });
      console.log(`New user ID: ${newUserId}`);

      // === Query Data ===
      // Simple query
      const activeUsers = await userRepo.findMany({
        field: 'status',
        op: '=',
        value: 'active'
      });
      console.log('Active users:', activeUsers);

      // Complex query
      const adultUsers = await userRepo.find({
        fields: ['id', 'name', 'email'],  // Specify fields
        where: {
          and: [
            { field: 'status', op: '=', value: 'active' },
            { field: 'age', op: '>=', value: 18 }
          ]
        },
        orderBy: [{ field: 'name', direction: 'ASC' }],
        limit: 10,
        offset: 0
      });
      console.log('Adult active users:', adultUsers);

      // === Update Data ===
      const updatedRows = await userRepo.update(
        { status: 'inactive' },  // Update values
        { field: 'id', op: '=', value: newUserId }  // Where condition
      );
      console.log(`Updated ${updatedRows} rows`);

      // === Delete Data ===
      const deletedRows = await userRepo.delete({
        field: 'id',
        op: '=',
        value: newUserId
      });
      console.log(`Deleted ${deletedRows} rows`);
    }

    // === Monitor Connection Pool Status ===
    const poolStatus = gateway.getProviderPoolStatus('mysql');
    if (poolStatus) {
      console.log(`MySQL Pool: ${poolStatus.activeConnections}/${poolStatus.maxConnections} connections active`);
    }

    // Get all pool statuses
    const allPoolStatuses = gateway.getAllPoolStatuses();
    for (const [providerName, status] of allPoolStatuses) {
      console.log(`${providerName} pool status:`, status);
    }

  } finally {
    // Disconnect all providers when done
    await gateway.disconnectAll();
  }
}

// Run the main function
main().catch(console.error);
```

## Step 4: Run Your Application

```bash
# If using TypeScript
npx ts-node app.ts

# If using compiled JavaScript
npm run build
node dist/app.js
```

## Simplified Example (Single Data Source)

If you only need one data source, you can use a simpler configuration:

```typescript
import { DataGateway, SQLiteProviderOptions } from '@wfp99/data-gateway';

const simpleConfig = {
  providers: {
    main: {
      type: 'sqlite',
      options: { filename: './app.db' } as SQLiteProviderOptions
    }
  },
  repositories: {
    users: { provider: 'main', table: 'users' }
  }
};

async function simpleExample() {
  const gateway = await DataGateway.build(simpleConfig);
  const userRepo = gateway.getRepository('users');

  // Insert user
  await userRepo?.insert({ name: 'Alice', email: 'alice@example.com' });

  // Query all users
  const users = await userRepo?.findMany();
  console.log('All users:', users);

  await gateway.disconnectAll();
}

simpleExample().catch(console.error);
```

## Common Error Handling

```typescript
async function withErrorHandling() {
  try {
    const gateway = await DataGateway.build(config);
    const userRepo = gateway.getRepository('users');

    const result = await userRepo?.insert({ name: 'Test User' });
    console.log('Success:', result);

  } catch (error) {
    console.error('Error:', error);

    // Handle different error types
    if (error instanceof Error) {
      if (error.message.includes('connection')) {
        console.error('Connection error - please check database settings');
      } else if (error.message.includes('Provider')) {
        console.error('Provider error - please check driver installation');
      }
    }
  }
}
```

## Next Steps

Now that you have Data Gateway set up successfully! You can:

- 📖 Read [Basic Usage](./basic-usage.en.md) to learn more features
- 🏗️ Learn [Architecture Design](../core/architecture.en.md) for deeper understanding
- ⚡ Explore [Connection Pooling](../advanced/connection-pooling.en.md) for performance
- 🔧 Check [Custom Providers](../providers/custom.en.md) to extend functionality