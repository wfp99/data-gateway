# DataGateway API Reference

`DataGateway` is the core class of Data Gateway, serving as the central coordinator for data access, integrating multiple data providers and repositories.

## Class Definition

```typescript
export class DataGateway {
  private providers: Map<string, DataProvider>;
  private repositories: Map<string, Repository<any>>;

  // Private constructor, use build() static method to create instances
  private constructor();

  // Static construction method
  static async build(config: DataGatewayConfig): Promise<DataGateway>;

  // Get repository
  getRepository<T = any>(name: string): Repository<T> | undefined;

  // Get data provider
  getProvider(name: string): DataProvider | undefined;

  // Connection pool status management
  getProviderPoolStatus(providerName: string): ConnectionPoolStatus | undefined;
  getAllPoolStatuses(): Map<string, ConnectionPoolStatus>;

  // Connection management
  async disconnectAll(): Promise<void>;
}
```

## Configuration Interfaces

### DataGatewayConfig

```typescript
export interface DataGatewayConfig {
  providers: {
    [name: string]:
    | { type: 'mysql'; options: MySQLProviderOptions }
    | { type: 'sqlite'; options: SQLiteProviderOptions }
    | { type: 'postgresql'; options: PostgreSQLProviderOptions }
    | { type: 'remote'; options: RemoteProviderOptions }
    | { type: 'custom'; options: CustomProviderOptions }
    | { type: ProviderType; options: ProviderOptions };
  };

  repositories: {
    [name: string]: {
      provider: string;
      table: string;
      mapper?: EntityFieldMapper<any>;
      middlewares?: Middleware[];
    };
  };
}
```

### RepositoryConfig

```typescript
export interface RepositoryConfig {
  provider: string;                    // Provider name reference
  table: string;                      // Table/collection name
  mapper?: EntityFieldMapper<any>;    // Field mapper (optional)
  middlewares?: Middleware[];         // Middleware array (optional)
}
```

## Static Methods

### build(config: DataGatewayConfig): Promise\<DataGateway\>

Creates and initializes a DataGateway instance.

**Parameters:**
- `config`: Complete DataGateway configuration object

**Returns:**
- `Promise<DataGateway>`: Fully initialized DataGateway instance

**Example:**
```typescript
const gateway = await DataGateway.build({
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        user: 'root',
        password: 'password',
        database: 'myapp'
      }
    },
    sqlite: {
      type: 'sqlite',
      options: {
        filename: './data.db'
      }
    }
  },
  repositories: {
    users: {
      provider: 'mysql',
      table: 'users'
    },
    logs: {
      provider: 'sqlite',
      table: 'access_logs'
    }
  }
});
```

**Error Handling:**
```typescript
try {
  const gateway = await DataGateway.build(config);
} catch (error) {
  if (error.message.includes('Provider')) {
    console.error('Provider configuration error:', error.message);
  } else if (error.message.includes('connection')) {
    console.error('Database connection error:', error.message);
  } else {
    console.error('Unknown initialization error:', error.message);
  }
}
```

## Instance Methods

### getRepository\<T\>(name: string): Repository\<T\> | undefined

Gets a repository instance by name.

**Parameters:**
- `name`: Repository name (as defined in configuration)

**Returns:**
- `Repository<T> | undefined`: Repository instance or undefined if not found

**Type Parameter:**
- `T`: Entity type for type safety

**Example:**
```typescript
// Basic usage
const userRepo = gateway.getRepository('users');

// With type safety
interface User {
  id: number;
  name: string;
  email: string;
  created_at: Date;
}

const userRepo = gateway.getRepository<User>('users');

// Handle undefined case
const userRepo = gateway.getRepository('users');
if (!userRepo) {
  throw new Error('User repository not found');
}

const users = await userRepo.findMany();
```

### getProvider(name: string): DataProvider | undefined

Gets a data provider instance by name.

**Parameters:**
- `name`: Provider name (as defined in configuration)

**Returns:**
- `DataProvider | undefined`: Provider instance or undefined if not found

**Example:**
```typescript
// Get provider for direct operations
const mysqlProvider = gateway.getProvider('mysql');

if (mysqlProvider) {
  // Check if provider supports connection pooling
  if (mysqlProvider.supportsConnectionPooling?.()) {
    const poolStatus = mysqlProvider.getPoolStatus?.();
    console.log('Pool status:', poolStatus);
  }

  // Execute raw queries
  if (mysqlProvider.query) {
    const result = await mysqlProvider.query('SELECT VERSION()');
    console.log('Database version:', result);
  }
}
```

### getProviderPoolStatus(providerName: string): ConnectionPoolStatus | undefined

Gets connection pool status for a specific provider.

**Parameters:**
- `providerName`: Provider name

**Returns:**
- `ConnectionPoolStatus | undefined`: Pool status or undefined if provider doesn't support pooling

**Example:**
```typescript
const poolStatus = gateway.getProviderPoolStatus('mysql');

if (poolStatus) {
  console.log('MySQL Pool Status:');
  console.log(`  Total: ${poolStatus.totalConnections}`);
  console.log(`  Active: ${poolStatus.activeConnections}`);
  console.log(`  Idle: ${poolStatus.idleConnections}`);
  console.log(`  Max: ${poolStatus.maxConnections}`);

  // Calculate utilization
  const utilization = poolStatus.activeConnections / poolStatus.maxConnections;
  console.log(`  Utilization: ${Math.round(utilization * 100)}%`);

  // Check for issues
  if (utilization > 0.9) {
    console.warn('⚠️ High pool utilization!');
  }

  if (poolStatus.activeConnections === poolStatus.maxConnections) {
    console.error('🚨 Pool exhausted!');
  }
} else {
  console.log('Provider does not support connection pooling');
}
```

### getAllPoolStatuses(): Map\<string, ConnectionPoolStatus\>

Gets connection pool status for all providers that support pooling.

**Returns:**
- `Map<string, ConnectionPoolStatus>`: Map of provider names to their pool statuses

**Example:**
```typescript
const allStatuses = gateway.getAllPoolStatuses();

// Log all pool statuses
for (const [providerName, status] of allStatuses) {
  const utilization = status.activeConnections / status.maxConnections;
  console.log(`${providerName}: ${status.activeConnections}/${status.maxConnections} (${Math.round(utilization * 100)}%)`);
}

// Find providers with high utilization
const highUtilizationProviders = Array.from(allStatuses.entries())
  .filter(([_, status]) => status.activeConnections / status.maxConnections > 0.8)
  .map(([name, _]) => name);

if (highUtilizationProviders.length > 0) {
  console.warn('High utilization providers:', highUtilizationProviders);
}

// Calculate total connections across all providers
const totalStats = Array.from(allStatuses.values()).reduce(
  (acc, status) => ({
    total: acc.total + status.totalConnections,
    active: acc.active + status.activeConnections,
    max: acc.max + status.maxConnections
  }),
  { total: 0, active: 0, max: 0 }
);

console.log(`Total connections: ${totalStats.active}/${totalStats.max}`);
```

### disconnectAll(): Promise\<void\>

Disconnects all providers and cleans up resources.

**Returns:**
- `Promise<void>`: Promise that resolves when all disconnections are complete

**Example:**
```typescript
// Basic usage
await gateway.disconnectAll();

// With error handling
try {
  await gateway.disconnectAll();
  console.log('All providers disconnected successfully');
} catch (error) {
  console.error('Error during disconnection:', error);
}

// Graceful shutdown pattern
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');

  try {
    // Stop accepting new requests
    server.close();

    // Wait for pending operations
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Disconnect all providers
    await gateway.disconnectAll();

    console.log('Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});
```

## Supporting Interfaces

### ConnectionPoolStatus

```typescript
export interface ConnectionPoolStatus {
  totalConnections: number;    // Current total connections in pool
  activeConnections: number;   // Currently active (in-use) connections
  idleConnections: number;     // Currently idle connections
  maxConnections: number;      // Maximum allowed connections
}
```

### Provider Types

```typescript
// Built-in provider types
export type BuiltInProviderType = 'mysql' | 'sqlite' | 'postgresql' | 'remote';

// All provider types (extensible)
export type ProviderType = BuiltInProviderType | string;
```

## Usage Patterns

### Multi-Provider Setup

```typescript
const gateway = await DataGateway.build({
  providers: {
    // Primary database
    mainDB: {
      type: 'mysql',
      options: {
        host: 'main-db.example.com',
        database: 'app_main',
        pool: { connectionLimit: 20 }
      }
    },

    // Analytics database
    analyticsDB: {
      type: 'postgresql',
      options: {
        host: 'analytics-db.example.com',
        database: 'analytics',
        pool: { max: 10 }
      }
    },

    // Cache database
    cache: {
      type: 'sqlite',
      options: {
        filename: './cache.db',
        pool: { usePool: true, readPoolSize: 5 }
      }
    },

    // External API
    api: {
      type: 'remote',
      options: {
        endpoint: 'https://api.example.com/data',
        bearerToken: process.env.API_TOKEN
      }
    }
  },

  repositories: {
    // Main data
    users: { provider: 'mainDB', table: 'users' },
    orders: { provider: 'mainDB', table: 'orders' },

    // Analytics data
    userStats: { provider: 'analyticsDB', table: 'user_statistics' },

    // Cache data
    sessions: { provider: 'cache', table: 'user_sessions' },

    // External data
    externalData: { provider: 'api', table: 'external_entities' }
  }
});

// Use different repositories
const userRepo = gateway.getRepository('users');        // MySQL
const statsRepo = gateway.getRepository('userStats');   // PostgreSQL
const sessionRepo = gateway.getRepository('sessions');  // SQLite
const apiRepo = gateway.getRepository('externalData');  // Remote API
```

### Connection Pool Monitoring

```typescript
class PoolMonitor {
  constructor(private gateway: DataGateway) {}

  startMonitoring(intervalMs: number = 30000) {
    setInterval(() => {
      this.logPoolStatuses();
      this.checkPoolHealth();
    }, intervalMs);
  }

  private logPoolStatuses() {
    const allStatuses = this.gateway.getAllPoolStatuses();

    if (allStatuses.size === 0) {
      console.log('No connection pools active');
      return;
    }

    console.log('\n=== Connection Pool Status ===');
    for (const [providerName, status] of allStatuses) {
      const utilization = (status.activeConnections / status.maxConnections * 100).toFixed(1);
      console.log(`${providerName}:`);
      console.log(`  Connections: ${status.activeConnections}/${status.totalConnections}/${status.maxConnections} (active/total/max)`);
      console.log(`  Utilization: ${utilization}%`);
      console.log(`  Idle: ${status.idleConnections}`);
    }
    console.log('==============================\n');
  }

  private checkPoolHealth() {
    const allStatuses = this.gateway.getAllPoolStatuses();

    for (const [providerName, status] of allStatuses) {
      const utilization = status.activeConnections / status.maxConnections;

      if (utilization >= 1.0) {
        console.error(`🚨 CRITICAL: ${providerName} pool exhausted!`);
      } else if (utilization > 0.9) {
        console.warn(`⚠️  WARNING: ${providerName} pool utilization high (${Math.round(utilization * 100)}%)`);
      } else if (utilization > 0.8) {
        console.info(`ℹ️  INFO: ${providerName} pool utilization elevated (${Math.round(utilization * 100)}%)`);
      }
    }
  }

  getHealthSummary() {
    const allStatuses = this.gateway.getAllPoolStatuses();
    const summary = {
      healthy: 0,
      warning: 0,
      critical: 0,
      providers: {} as Record<string, { status: string; utilization: number }>
    };

    for (const [providerName, status] of allStatuses) {
      const utilization = status.activeConnections / status.maxConnections;
      let healthStatus: string;

      if (utilization >= 1.0) {
        healthStatus = 'critical';
        summary.critical++;
      } else if (utilization > 0.8) {
        healthStatus = 'warning';
        summary.warning++;
      } else {
        healthStatus = 'healthy';
        summary.healthy++;
      }

      summary.providers[providerName] = {
        status: healthStatus,
        utilization: Math.round(utilization * 100)
      };
    }

    return summary;
  }
}

// Usage
const monitor = new PoolMonitor(gateway);
monitor.startMonitoring(30000); // Monitor every 30 seconds

// Health check endpoint
app.get('/health/pools', (req, res) => {
  const health = monitor.getHealthSummary();
  const status = health.critical > 0 ? 500 : health.warning > 0 ? 200 : 200;

  res.status(status).json({
    status: health.critical > 0 ? 'critical' : health.warning > 0 ? 'warning' : 'healthy',
    summary: health
  });
});
```

### Resource Cleanup

```typescript
class GatewayManager {
  private gateway?: DataGateway;

  async initialize(config: DataGatewayConfig) {
    try {
      this.gateway = await DataGateway.build(config);
      console.log('DataGateway initialized successfully');

      // Set up graceful shutdown
      this.setupShutdownHandlers();

      return this.gateway;
    } catch (error) {
      console.error('Failed to initialize DataGateway:', error);
      throw error;
    }
  }

  async shutdown() {
    if (this.gateway) {
      try {
        console.log('Shutting down DataGateway...');
        await this.gateway.disconnectAll();
        console.log('DataGateway shutdown complete');
      } catch (error) {
        console.error('Error during DataGateway shutdown:', error);
        throw error;
      } finally {
        this.gateway = undefined;
      }
    }
  }

  getGateway(): DataGateway {
    if (!this.gateway) {
      throw new Error('DataGateway not initialized');
    }
    return this.gateway;
  }

  private setupShutdownHandlers() {
    // Handle graceful shutdown signals
    const signals = ['SIGINT', 'SIGTERM'] as const;

    signals.forEach(signal => {
      process.on(signal, async () => {
        console.log(`Received ${signal}, initiating graceful shutdown...`);

        try {
          await this.shutdown();
          process.exit(0);
        } catch (error) {
          console.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('Uncaught exception:', error);

      try {
        await this.shutdown();
      } catch (shutdownError) {
        console.error('Error during emergency shutdown:', shutdownError);
      }

      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason) => {
      console.error('Unhandled promise rejection:', reason);

      try {
        await this.shutdown();
      } catch (shutdownError) {
        console.error('Error during emergency shutdown:', shutdownError);
      }

      process.exit(1);
    });
  }
}

// Usage
const gatewayManager = new GatewayManager();

async function startApplication() {
  try {
    const gateway = await gatewayManager.initialize(config);

    // Application logic using gateway
    const userRepo = gateway.getRepository('users');
    // ... rest of application

  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

startApplication();
```

## Error Handling

Common error scenarios and how to handle them:

```typescript
try {
  const gateway = await DataGateway.build(config);
} catch (error) {
  if (error.message.includes('Unknown provider type')) {
    console.error('Invalid provider type in configuration');
  } else if (error.message.includes('Failed to connect')) {
    console.error('Database connection failed - check connection parameters');
  } else if (error.message.includes('Provider')) {
    console.error('Provider initialization error:', error.message);
  } else {
    console.error('Unexpected error during DataGateway initialization:', error);
  }
}

// Repository access errors
const userRepo = gateway.getRepository('nonexistent');
if (!userRepo) {
  throw new Error('Repository "nonexistent" not found in configuration');
}

// Provider access errors
const provider = gateway.getProvider('nonexistent');
if (!provider) {
  console.warn('Provider "nonexistent" not found');
}
```

## Related Links

- [Repository API](./repository.en.md)
- [DataProvider API](./data-provider.en.md)
- [Query Object API](./query-object.en.md)
- [Connection Pooling Guide](../advanced/connection-pooling.en.md)