# Architecture Design

Data Gateway adopts a modular and extensible architecture design, ensuring high flexibility and maintainability. This document details the core architectural concepts and design principles.

## Overall Architecture

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   User Code     │  │   Business      │  │  Controllers │ │
│  │                 │  │     Logic       │  │              │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                     DataGateway                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │  Repository     │  │   Connection    │  │   Provider   │ │
│  │    Manager      │  │   Pool Manager  │  │   Registry   │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                  Repository Layer                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │  Repository<T>  │  │   Middleware    │  │  EntityField │ │
│  │                 │  │     Chain       │  │    Mapper    │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   Provider Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ MySQLProvider│  │PostgreSQL    │  │  SQLiteProvider      │ │
│  │              │  │Provider      │  │                      │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │RemoteProvider│  │CustomProvider│  │    Future Providers  │ │
│  │              │  │              │  │                      │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Data Sources                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │    MySQL     │  │  PostgreSQL  │  │       SQLite         │ │
│  │   Database   │  │   Database   │  │      Database        │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │  Remote API  │  │ Microservice │  │   Custom Sources     │ │
│  │              │  │              │  │                      │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. DataGateway (Gateway Core)

DataGateway is the central coordinator of the entire system, responsible for:

- **Provider Management**: Register, initialize and manage multiple data providers
- **Repository Management**: Create and manage repository instances
- **Connection Lifecycle**: Unified management of all data source connections
- **Connection Pool Monitoring**: Provide connection pool status monitoring and management

```typescript
export class DataGateway {
  private providers: Map<string, DataProvider>;
  private repositories: Map<string, Repository<any>>;

  static async build(config: DataGatewayConfig): Promise<DataGateway>;
  getRepository<T>(name: string): Repository<T> | undefined;
  getProvider(name: string): DataProvider | undefined;
  async disconnectAll(): Promise<void>;
}
```

**Design Principles:**
- **Single Responsibility**: Focus on coordination and management, not specific data operations
- **Lazy Loading**: Providers are only loaded when actually used, reducing unnecessary dependencies
- **Error Isolation**: Failure of a single Provider doesn't affect other Providers

### 2. DataProvider (Data Provider)

DataProvider is the abstract interface for data sources, defining unified data access methods:

```typescript
export interface DataProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query<T = any>(query: Query): Promise<QueryResult<T>>;
  getPoolStatus?(): ConnectionPoolStatus | undefined;
  supportsConnectionPooling?(): boolean;
}
```

**Implementation Types:**
- **MySQLProvider**: MySQL/MariaDB database support
- **PostgreSQLProvider**: PostgreSQL database support
- **SQLiteProvider**: SQLite file database support
- **RemoteProvider**: HTTP/HTTPS API support
- **CustomProvider**: Custom data source support

**Design Principles:**
- **Unified Interface**: All Providers implement the same interface for consistency
- **Pluggable**: New Providers can be easily added without modifying core code
- **Connection Pool Support**: Each Provider implements appropriate connection pool strategies based on its characteristics

### 3. Repository (Repository)

Repository implements the business logic for data access, providing high-level CRUD operations:

```typescript
export class Repository<T = any> {
  constructor(
    private provider: DataProvider,
    private tableName: string,
    private fieldMapper?: EntityFieldMapper<T>,
    private middlewares: Middleware[] = []
  );

  async find(query?: Partial<Query>): Promise<QueryResult<T>>;
  async findMany(condition?: Condition, query?: Partial<Query>): Promise<T[]>;
  async findOne(condition: Condition): Promise<T | null>;
  async insert(data: Partial<T>): Promise<number | string>;
  async update(data: Partial<T>, condition: Condition): Promise<number>;
  async delete(condition: Condition): Promise<number>;
}
```

**Core Features:**
- **CRUD Operations**: Complete Create, Read, Update, Delete functionality
- **Query Construction**: Convert high-level queries to low-level Provider queries
- **Field Mapping**: Automatically handle mapping between application field names and database fields
- **Middleware Support**: Support custom processing logic before and after queries

### 4. Middleware (Middleware)

Middleware provides a mechanism to inject custom logic before and after query execution:

```typescript
export type Middleware = (
  query: Query,
  next: (query: Query) => Promise<QueryResult<any>>
) => Promise<QueryResult<any>>;
```

**Use Cases:**
- **Logging**: Track all database operations
- **Performance Monitoring**: Measure query execution time
- **Data Validation**: Validate data before insert/update
- **Caching**: Implement query result caching
- **Access Control**: Restrict data access based on user roles

### 5. EntityFieldMapper (Field Mapper)

EntityFieldMapper handles mapping between application object properties and database fields:

```typescript
export interface EntityFieldMapper<T> {
  mapToDatabase(appField: string): string;
  mapFromDatabase(dbField: string): string;
  transformToDatabase(data: Partial<T>): Record<string, any>;
  transformFromDatabase(data: Record<string, any>): Partial<T>;
}
```

**Implementation Types:**
- **DefaultFieldMapper**: Default implementation with no transformation
- **MappingFieldMapper**: Field transformation based on mapping tables

### 6. QueryObject (Query Object)

QueryObject defines a unified query language supporting complex query conditions:

```typescript
export interface Query {
  type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  fields?: (string | Aggregate)[];
  where?: Condition;
  orderBy?: OrderBy[];
  groupBy?: string[];
  having?: Condition;
  limit?: number;
  offset?: number;
  joins?: Join[];
  data?: Record<string, any>;
}
```

## Data Flow

### 1. Query Flow

```
Application Code
      │
      ▼
Repository.findMany()
      │
      ▼
Middleware Chain
      │
      ▼
EntityFieldMapper
      │
      ▼
Query Object Construction
      │
      ▼
DataProvider.query()
      │
      ▼
Database/API Call
      │
      ▼
Result Processing
      │
      ▼
EntityFieldMapper (reverse)
      │
      ▼
Middleware Chain (response)
      │
      ▼
Application Code
```

### 2. Connection Management Flow

```
DataGateway.build()
      │
      ▼
Provider Registration
      │
      ▼
Connection Pool Creation
      │
      ▼
Provider.connect()
      │
      ▼
Repository Initialization
      │
      ▼
Ready for Operations
      │
      ▼
[Application Operations]
      │
      ▼
DataGateway.disconnectAll()
      │
      ▼
Connection Pool Cleanup
```

## Design Patterns

### 1. Factory Pattern

DataGateway uses the factory pattern to dynamically create Provider instances:

```typescript
// Dynamically create Provider based on configuration
switch (providerConfig.type) {
  case 'mysql':
    const { MySQLProvider } = await import('./dataProviders/MySQLProvider.js');
    provider = new MySQLProvider(providerConfig.options);
    break;
  case 'postgresql':
    const { PostgreSQLProvider } = await import('./dataProviders/PostgreSQLProvider.js');
    provider = new PostgreSQLProvider(providerConfig.options);
    break;
  // ...
}
```

### 2. Repository Pattern

Abstract data access logic, providing consistent API:

```typescript
// Unified data access interface
const userRepo = gateway.getRepository('users');
const orderRepo = gateway.getRepository('orders');

// Same operation methods, different data sources
const users = await userRepo.findMany();  // MySQL
const orders = await orderRepo.findMany(); // PostgreSQL
```

### 3. Strategy Pattern

Different Providers implement different data access strategies:

```typescript
// MySQL Strategy: Use mysql2 connection pool
// PostgreSQL Strategy: Use pg connection pool
// SQLite Strategy: Use file connections
// Remote Strategy: Use HTTP requests
```

### 4. Chain of Responsibility Pattern

Middleware forms a chain of responsibility to process queries:

```typescript
const middlewares = [validationMiddleware, loggingMiddleware, cachingMiddleware];
// validation -> logging -> caching -> provider -> caching -> logging -> validation
```

## Extensibility Design

### 1. New Provider Extension

Adding new data source support:

```typescript
// 1. Implement DataProvider interface
export class MongoDBProvider implements DataProvider {
  async connect(): Promise<void> { /* ... */ }
  async disconnect(): Promise<void> { /* ... */ }
  async query<T>(query: Query): Promise<QueryResult<T>> { /* ... */ }
}

// 2. Register in DataGateway
case 'mongodb':
  const { MongoDBProvider } = await import('./dataProviders/MongoDBProvider.js');
  provider = new MongoDBProvider(providerConfig.options);
  break;
```

### 2. New Middleware Extension

Adding new middleware functionality:

```typescript
// Authorization middleware
const authorizationMiddleware: Middleware = async (query, next) => {
  const user = getCurrentUser();

  if (query.type === 'DELETE' && !user.hasRole('admin')) {
    throw new Error('Insufficient permissions');
  }

  return next(query);
};
```

### 3. New Query Feature Extension

Extending QueryObject to support more query types:

```typescript
// Support full-text search
interface FullTextSearch {
  type: 'FULLTEXT';
  fields: string[];
  query: string;
}

// Support geo queries
interface GeoQuery {
  type: 'GEO';
  field: string;
  center: [number, number];
  radius: number;
}
```

## Performance Considerations

### 1. Connection Pool Strategy

Different data sources adopt appropriate connection pool strategies:

- **MySQL/PostgreSQL**: Full connection pool with read-write separation support
- **SQLite**: Read connection pool with single write connection
- **Remote API**: No connection pool, using HTTP persistent connections

### 2. Lazy Loading Optimization

- **Provider Lazy Loading**: Only load actually used Providers
- **Query Optimization**: Only query needed fields
- **Result Pagination**: Support pagination for large result sets

### 3. Caching Strategy

- **Query Result Caching**: Implemented at middleware layer
- **Connection Reuse**: Automatically managed by connection pools
- **Metadata Caching**: Cache table schemas and other metadata

## Security Considerations

### 1. SQL Injection Protection

All Providers use parameterized queries:

```typescript
// Automatic parameterization prevents SQL injection
const users = await userRepo.findMany({
  field: 'email',
  op: '=',
  value: userInput  // Automatically escaped
});
```

### 2. Connection Security

- **SSL/TLS Support**: All database Providers support encrypted connections
- **Authentication Management**: Support multiple authentication methods
- **Access Control**: Fine-grained permission control implemented at middleware layer

### 3. Data Validation

- **Input Validation**: Data validation implemented at middleware layer
- **Type Safety**: TypeScript provides compile-time type checking
- **Range Checking**: Automatic validation of data ranges and formats

This architectural design ensures Data Gateway's flexibility, extensibility, and maintainability while providing excellent performance and security.