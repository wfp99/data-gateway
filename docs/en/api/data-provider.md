# DataProvider and Data Sources

## What is a DataProvider?

A `DataProvider` is the abstraction layer in [Data Gateway](../architecture.md) that communicates with the actual data source (e.g., a database or a remote API). It defines a standardized interface that allows a [`Repository`](./repository.md) to execute queries in a unified way, without needing to know the specific implementation details of the underlying data source.

Each different data source requires a corresponding `DataProvider` implementation.

## `DataProvider` Interface Definition

All providers must implement this interface.

```typescript
interface DataProvider {
  /**
   * Connects to the data source.
   * For a database, this usually means creating a connection pool or a single connection.
   * For a stateless API, this method may be empty.
   */
  connect(): Promise<void>;

  /**
   * Disconnects from the data source.
   * Releases database connections or performs other cleanup tasks.
   */
  disconnect(): Promise<void>;

  /**
   * Executes a query.
   * This is the core method of the provider. It receives a standard `Query` object,
   * converts it to the native query language of the specific data source (e.g., SQL),
   * executes it, and returns the result encapsulated in a standard `QueryResult` object.
   * @param query The standardized query object.
   * @returns A `QueryResult` object containing the query results.
   */
  query<T = any>(query: Query): Promise<QueryResult<T>>;
}
```

## Built-in Providers

Data Gateway comes with three common providers:

### `MySQLProvider`
- **Purpose**: Connects to a MySQL or MariaDB database.
- **Dependencies**: Requires the `mysql2` package (`npm install mysql2`).
- **Configuration Options (`MySQLProviderOptions`)**: Inherits from `mysql2/promise`'s `ConnectionOptions`, so you can pass in `host`, `user`, `password`, `database`, and all other options supported by `mysql2`.

### `SQLiteProvider`
- **Purpose**: Connects to a SQLite database file.
- **Dependencies**: Requires the `sqlite` and `sqlite3` packages (`npm install sqlite sqlite3`).
- **Configuration Options (`SQLiteProviderOptions`)**:
  - `filename`: The path to the SQLite database file.

### `RemoteProvider`
- **Purpose**: Communicates with a remote RESTful API via an HTTP POST request. It sends the entire [`Query`](./query-object.md) object as a JSON payload to the specified endpoint.
- **Dependencies**: Uses the built-in `fetch` API, no additional dependencies required.
- **Configuration Options (`RemoteProviderOptions`)**:
  - `endpoint`: The URL of the remote API.
  - `bearerToken` (optional): A Bearer Token for the `Authorization` header.

## Custom Provider Example

You can create your own provider by implementing the `DataProvider` interface to support any data source you need, such as PostgreSQL, MongoDB, or other cloud services.

```typescript
import { DataProvider, Query, QueryResult } from '@wfp99/data-gateway';

class MyCustomProvider implements DataProvider {
  constructor(private options: any) {
    // ... Initialize settings ...
  }

  async connect(): Promise<void> {
    console.log('Connecting to custom data source...');
    // ... Connection logic ...
  }

  async disconnect(): Promise<void> {
    console.log('Disconnecting from custom data source...');
    // ... Disconnection logic ...
  }

  async query<T = any>(query: Query): Promise<QueryResult<T>> {
    console.log('Executing query on custom data source:', query);
    // 1. Generate the corresponding query command based on the query object
    // 2. Execute the query
    // 3. Convert the query result to the QueryResult<T> format
    // Example:
    if (query.type === 'SELECT') {
      // const results = await myCustomApiClient.get(...);
      // return { rows: results };
    }
    return { error: 'Not implemented' };
  }
}
```

## How to Configure a Provider

In the [`DataGateway`](./data-gateway.md) configuration file, define all the data sources you want to use in the `providers` object.

```typescript
const config = {
  providers: {
    // Give this provider a name, e.g., 'mainDb'
    mainDb: {
      type: 'mysql', // Specify the provider type to use
      options: { host: 'localhost', user: 'root', database: 'test' }
    },
    // Another provider
    analyticsDb: {
      type: 'sqlite',
      options: { filename: './analytics.db' }
    },
    // A remote service
    remoteApi: {
      type: 'remote',
      options: { endpoint: 'https://api.example.com/data' }
    },
    // A custom provider
    myProvider: {
      type: 'custom',
      options: { provider: new MyCustomProvider({ apiKey: '...' }) }
    }
  },
  repositories: {
    // ... Reference the provider by name in the repository ...
    user: { provider: 'mainDb', table: 'users' },
    event: { provider: 'analyticsDb', table: 'events' }
  }
};
```

---

See also [Repository and Query Objects](./repository.md) and [QueryObject](./query-object.md).
