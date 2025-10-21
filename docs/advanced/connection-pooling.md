# Connection Pool Management

Data Gateway supports connection pooling functionality that effectively improves performance and resource management efficiency. This is especially useful for high-traffic applications that need to handle large volumes of database operations.

## Overview

Connection pools allow multiple database connections to be reused for different query operations, reducing the overhead of creating and closing connections. This is particularly important for:

- High-concurrency applications
- Applications with frequent database operations
- Production environments with performance requirements

## Supported Providers

### MySQL Provider

The MySQL provider uses `mysql2` connection pools to provide full connection pooling functionality:

```typescript
import { DataGateway, MySQLProviderOptions } from '@wfp99/data-gateway';

const config = {
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        user: 'root',
        password: 'password',
        database: 'myapp',
        pool: {
          usePool: true,              // Enable connection pool (default: true)
          connectionLimit: 10,        // Maximum connections in pool (default: 10)
          queueLimit: 0,             // Maximum queued connection requests (default: 0, unlimited)
          acquireTimeout: 60000,     // Connection acquire timeout (default: 60000ms)
          timeout: 600000,           // Idle connection timeout (default: 600000ms)
          preConnect: false,         // Test connection pool on startup (default: false)
        }
      } as MySQLProviderOptions
    }
  },
  repositories: {
    user: { provider: 'mysql', table: 'users' }
  }
};

const gateway = await DataGateway.build(config);
```

### PostgreSQL Provider

PostgreSQL provider uses `pg` connection pools with comprehensive configuration options:

```typescript
import { DataGateway, PostgreSQLProviderOptions } from '@wfp99/data-gateway';

const config = {
  providers: {
    postgresql: {
      type: 'postgresql',
      options: {
        host: 'localhost',
        user: 'postgres',
        password: 'password',
        database: 'myapp',
        port: 5432,
        pool: {
          usePool: true,              // Enable connection pool (default: true)
          max: 20,                   // Maximum connections (default: 10)
          min: 2,                    // Minimum connections (default: 0)
          idleTimeoutMillis: 30000,  // Idle timeout (default: 30000ms)
          connectionTimeoutMillis: 2000, // Connection timeout (default: 0, no timeout)
          maxUses: 7500,            // Maximum uses per connection (default: Infinity)
          allowExitOnIdle: false,   // Allow exit when all connections idle (default: false)
        }
      } as PostgreSQLProviderOptions
    }
  },
  repositories: {
    user: { provider: 'postgresql', table: 'users' }
  }
};

const gateway = await DataGateway.build(config);
```

### SQLite Provider

SQLite provider supports read connection pools while using a single connection for writes:

```typescript
import { DataGateway, SQLiteProviderOptions } from '@wfp99/data-gateway';

const config = {
  providers: {
    sqlite: {
      type: 'sqlite',
      options: {
        filename: './database.db',
        pool: {
          usePool: true,              // Enable read connection pool (default: false)
          readPoolSize: 3,           // Read connection pool size (default: 3)
          writeConnection: 'single', // Write connection mode (only 'single' supported)
          acquireTimeout: 30000,     // Connection acquire timeout (default: 30000ms)
          idleTimeout: 300000,       // Idle connection timeout (default: 300000ms)
          preConnect: false,         // Pre-establish connections on startup (default: false)
        }
      } as SQLiteProviderOptions
    }
  },
  repositories: {
    user: { provider: 'sqlite', table: 'users' }
  }
};

const gateway = await DataGateway.build(config);
```

## Configuration Parameters

### Common Pool Parameters

All connection pool implementations support these common parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `usePool` | boolean | varies | Enable/disable connection pooling |
| `acquireTimeout` | number | 30000-60000 | Timeout for acquiring connections (ms) |
| `preConnect` | boolean | false | Pre-establish connections on startup |

### MySQL-Specific Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `connectionLimit` | number | 10 | Maximum number of connections |
| `queueLimit` | number | 0 | Maximum queued requests (0 = unlimited) |
| `timeout` | number | 600000 | Idle connection timeout (ms) |

### PostgreSQL-Specific Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `max` | number | 10 | Maximum connections in pool |
| `min` | number | 0 | Minimum connections maintained |
| `idleTimeoutMillis` | number | 30000 | Idle connection timeout |
| `connectionTimeoutMillis` | number | 0 | New connection timeout |
| `maxUses` | number | Infinity | Maximum uses per connection |
| `allowExitOnIdle` | boolean | false | Allow process exit when all idle |

### SQLite-Specific Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `readPoolSize` | number | 3 | Number of read connections |
| `writeConnection` | string | 'single' | Write connection mode |
| `idleTimeout` | number | 300000 | Idle connection timeout |

## Connection Pool Monitoring

Data Gateway provides comprehensive connection pool monitoring capabilities:

### Getting Pool Status

```typescript
// Get status for specific provider
const mysqlStatus = gateway.getProviderPoolStatus('mysql');
if (mysqlStatus) {
  console.log('MySQL Pool Status:');
  console.log(`  Total Connections: ${mysqlStatus.totalConnections}`);
  console.log(`  Active Connections: ${mysqlStatus.activeConnections}`);
  console.log(`  Idle Connections: ${mysqlStatus.idleConnections}`);
  console.log(`  Max Connections: ${mysqlStatus.maxConnections}`);
}

// Get status for all providers
const allStatuses = gateway.getAllPoolStatuses();
for (const [providerName, status] of allStatuses) {
  console.log(`${providerName}: ${status.activeConnections}/${status.maxConnections} active`);
}
```

### Pool Status Interface

```typescript
interface ConnectionPoolStatus {
  totalConnections: number;    // Current total connections
  activeConnections: number;   // Currently active connections
  idleConnections: number;     // Currently idle connections
  maxConnections: number;      // Maximum allowed connections
}
```

### Real-time Monitoring

```typescript
// Set up periodic monitoring
function setupPoolMonitoring(gateway: DataGateway) {
  setInterval(() => {
    const allStatuses = gateway.getAllPoolStatuses();

    for (const [providerName, status] of allStatuses) {
      const utilizationRate = status.activeConnections / status.maxConnections;

      // Log current status
      console.log(`[${new Date().toISOString()}] ${providerName}:`);
      console.log(`  Utilization: ${Math.round(utilizationRate * 100)}%`);
      console.log(`  Connections: ${status.activeConnections}/${status.maxConnections}`);

      // Warning for high utilization
      if (utilizationRate > 0.8) {
        console.warn(`⚠️  High utilization on ${providerName}: ${Math.round(utilizationRate * 100)}%`);
      }

      // Alert for pool exhaustion
      if (status.activeConnections === status.maxConnections) {
        console.error(`🚨 Connection pool exhausted on ${providerName}!`);
      }

      // Info for low utilization (might indicate over-provisioning)
      if (utilizationRate < 0.1 && status.maxConnections > 5) {
        console.info(`ℹ️  Low utilization on ${providerName}: ${Math.round(utilizationRate * 100)}% (consider reducing pool size)`);
      }
    }
  }, 30000); // Check every 30 seconds
}

// Usage
const gateway = await DataGateway.build(config);
setupPoolMonitoring(gateway);
```

## Performance Tuning

### Environment-Based Configuration

```typescript
// Development environment
const devPoolConfig = {
  mysql: {
    pool: {
      usePool: true,
      connectionLimit: 3,
      acquireTimeout: 60000,
      timeout: 600000,
      preConnect: false
    }
  }
};

// Testing environment
const testPoolConfig = {
  mysql: {
    pool: {
      usePool: true,
      connectionLimit: 5,
      acquireTimeout: 30000,
      timeout: 300000,
      preConnect: false
    }
  }
};

// Production environment
const prodPoolConfig = {
  mysql: {
    pool: {
      usePool: true,
      connectionLimit: 20,
      queueLimit: 100,
      acquireTimeout: 30000,
      timeout: 300000,
      preConnect: true
    }
  }
};

// Select configuration based on environment
const poolConfig = process.env.NODE_ENV === 'production' ? prodPoolConfig :
                  process.env.NODE_ENV === 'test' ? testPoolConfig : devPoolConfig;
```

### Load-Based Optimization

```typescript
// High-traffic API server
const highTrafficConfig = {
  mysql: {
    pool: {
      connectionLimit: 50,      // Large pool for high concurrency
      queueLimit: 200,         // Allow queuing for burst traffic
      acquireTimeout: 10000,   // Shorter timeout for fast failure
      timeout: 180000,         // Shorter idle timeout
      preConnect: true         // Pre-warm pool
    }
  }
};

// Batch processing application
const batchProcessingConfig = {
  mysql: {
    pool: {
      connectionLimit: 10,     // Smaller pool for controlled processing
      queueLimit: 0,          // No queuing - immediate feedback
      acquireTimeout: 60000,   // Longer timeout for batch operations
      timeout: 900000,        // Longer idle timeout for processing gaps
      preConnect: true
    }
  }
};

// Analytics/Reporting application
const analyticsConfig = {
  mysql: {
    pool: {
      connectionLimit: 5,      // Few long-running connections
      acquireTimeout: 120000,  // Very long timeout for complex queries
      timeout: 1800000,       // 30 minutes idle timeout
      preConnect: true
    }
  }
};
```

### Dynamic Pool Sizing

```typescript
// Dynamic configuration based on system resources
function calculateOptimalPoolSize(): number {
  const cpuCount = require('os').cpus().length;
  const memoryGB = require('os').totalmem() / 1024 / 1024 / 1024;

  // Base calculation: 2 connections per CPU core, adjusted for memory
  let poolSize = cpuCount * 2;

  // Adjust for available memory
  if (memoryGB < 2) {
    poolSize = Math.max(poolSize / 2, 2);
  } else if (memoryGB > 8) {
    poolSize = Math.min(poolSize * 1.5, 50);
  }

  return Math.floor(poolSize);
}

// Apply dynamic sizing
const dynamicConfig = {
  mysql: {
    pool: {
      connectionLimit: calculateOptimalPoolSize(),
      acquireTimeout: 30000,
      timeout: 600000,
      preConnect: true
    }
  }
};
```

## Best Practices

### 1. Pool Size Guidelines

```typescript
// Rule of thumb for pool sizing:
// - Development: 3-5 connections
// - Testing: 5-10 connections
// - Production: 10-50 connections (based on load)
// - Never exceed database server limits

const poolSizeGuidelines = {
  development: 3,
  testing: 5,
  staging: 10,
  production: Math.min(20, maxServerConnections * 0.8) // Leave 20% buffer
};
```

### 2. Timeout Configuration

```typescript
// Balanced timeout configuration
const timeoutConfig = {
  // Quick operations (< 1 second expected)
  acquireTimeout: 5000,    // 5 seconds max to get connection

  // Medium operations (1-10 seconds expected)
  acquireTimeout: 15000,   // 15 seconds max to get connection

  // Long operations (> 10 seconds expected)
  acquireTimeout: 60000,   // 1 minute max to get connection

  // Idle timeout should be longer than longest expected operation
  timeout: 300000          // 5 minutes idle timeout
};
```

### 3. Error Handling

```typescript
async function robustPoolUsage() {
  const gateway = await DataGateway.build(config);

  try {
    const userRepo = gateway.getRepository('users');

    // Monitor pool before operation
    const poolStatus = gateway.getProviderPoolStatus('mysql');
    if (poolStatus && poolStatus.activeConnections === poolStatus.maxConnections) {
      console.warn('Pool near capacity, consider delaying non-critical operations');
    }

    const result = await userRepo?.findMany();
    return result;

  } catch (error) {
    if (error.message.includes('timeout')) {
      console.error('Pool acquisition timeout - check pool size and query performance');
    } else if (error.message.includes('connection')) {
      console.error('Connection error - check database availability');
    }
    throw error;
  } finally {
    // Connections are automatically returned to pool
    // Only disconnect all when shutting down application
  }
}
```

### 4. Graceful Shutdown

```typescript
// Proper application shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');

  try {
    // Stop accepting new requests
    server.close();

    // Wait for existing operations to complete
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Disconnect all pools
    await gateway.disconnectAll();

    console.log('Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});
```

### 5. Health Checks

```typescript
// Health check endpoint
async function healthCheck() {
  const gateway = await DataGateway.build(config);

  try {
    const allStatuses = gateway.getAllPoolStatuses();
    const health = {
      status: 'healthy',
      pools: {} as Record<string, any>
    };

    for (const [providerName, status] of allStatuses) {
      const utilization = status.activeConnections / status.maxConnections;

      health.pools[providerName] = {
        status: utilization > 0.9 ? 'warning' : 'healthy',
        utilization: Math.round(utilization * 100),
        connections: {
          active: status.activeConnections,
          total: status.totalConnections,
          max: status.maxConnections
        }
      };

      if (utilization > 0.9) {
        health.status = 'warning';
      }
    }

    return health;
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}
```

## Troubleshooting

### Common Issues

1. **Pool Exhaustion**
   ```typescript
   // Symptoms: "Pool exhausted" or "Connection timeout" errors
   // Solutions:
   - Increase pool size
   - Reduce query execution time
   - Check for connection leaks
   - Add connection queuing limits
   ```

2. **High Latency**
   ```typescript
   // Symptoms: Slow response times despite adequate pool size
   // Solutions:
   - Enable preConnect
   - Optimize query performance
   - Check network latency to database
   - Consider read replicas
   ```

3. **Memory Usage**
   ```typescript
   // Symptoms: High memory consumption
   // Solutions:
   - Reduce pool size
   - Shorter idle timeouts
   - Check for result set size
   - Enable query result streaming
   ```

### Debugging Tools

```typescript
// Enable debug logging
const debugConfig = {
  mysql: {
    pool: {
      usePool: true,
      connectionLimit: 10,
      debug: process.env.NODE_ENV === 'development', // Enable debug logging
      acquireTimeout: 30000,
      timeout: 600000
    }
  }
};

// Pool event monitoring
gateway.on('pool:acquire', (providerName) => {
  console.log(`Connection acquired from ${providerName} pool`);
});

gateway.on('pool:release', (providerName) => {
  console.log(`Connection released to ${providerName} pool`);
});

gateway.on('pool:error', (providerName, error) => {
  console.error(`Pool error in ${providerName}:`, error);
});
```

## Related Links

- [MySQL Provider Guide](../providers/mysql.md)
- [PostgreSQL Provider Guide](../providers/postgresql.md)
- [SQLite Provider Guide](../providers/sqlite.md)
- [Performance Optimization](./performance.md)
- [DataGateway API](../api/data-gateway.md)