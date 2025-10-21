# Custom Providers

Data Gateway supports creating custom Data Providers, allowing you to integrate any data source. This guide will detail how to implement custom providers, including interface definitions, implementation examples, and best practices.

## DataProvider Interface

All Data Providers must implement the `DataProvider` interface:

```typescript
export interface DataProvider {
  // Basic CRUD operations
  insert(table: string, data: Record<string, any>): Promise<any>;
  findOne(table: string, condition: QueryCondition): Promise<Record<string, any> | null>;
  findMany(table: string, condition: QueryCondition): Promise<Record<string, any>[]>;
  find(table: string, options: QueryOptions): Promise<QueryResult>;
  update(table: string, data: Record<string, any>, condition: QueryCondition): Promise<number>;
  delete(table: string, condition: QueryCondition): Promise<number>;

  // Raw query support
  query?(sql: string, params?: any[]): Promise<any>;

  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Connection pool support (optional)
  getPoolStatus?(): ConnectionPoolStatus | null;
}
```

### Related Interface Definitions

```typescript
// Query condition
export interface QueryCondition {
  field: string | AggregateField;
  op: QueryOperator;
  value?: any;
  values?: any[];
  subquery?: SubqueryCondition;
  and?: QueryCondition[];
  or?: QueryCondition[];
}

// Query options
export interface QueryOptions {
  fields?: (string | AggregateField)[];
  where?: QueryCondition;
  groupBy?: string[];
  having?: QueryCondition;
  orderBy?: OrderByClause[];
  limit?: number;
  offset?: number;
}

// Query result
export interface QueryResult {
  rows: Record<string, any>[];
  totalCount?: number;
  affectedRows?: number;
}

// Connection pool status
export interface ConnectionPoolStatus {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  maxConnections: number;
}

// Aggregate field
export interface AggregateField {
  type: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
  field: string;
  alias?: string;
}

// Order by clause
export interface OrderByClause {
  field: string | AggregateField;
  direction: 'ASC' | 'DESC';
}
```

## Basic Implementation Example

### Simple Memory Provider

```typescript
import { DataProvider, QueryCondition, QueryOptions, QueryResult } from '@wfp99/data-gateway';

export class MemoryProvider implements DataProvider {
  private data: Map<string, Record<string, any>[]> = new Map();
  private connected: boolean = false;
  private nextId: Map<string, number> = new Map();

  async connect(): Promise<void> {
    this.connected = true;
    console.log('Memory Provider connected');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.data.clear();
    this.nextId.clear();
    console.log('Memory Provider disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  private ensureTable(table: string): void {
    if (!this.data.has(table)) {
      this.data.set(table, []);
      this.nextId.set(table, 1);
    }
  }

  private getNextId(table: string): number {
    const current = this.nextId.get(table) || 1;
    this.nextId.set(table, current + 1);
    return current;
  }

  async insert(table: string, data: Record<string, any>): Promise<any> {
    if (!this.connected) throw new Error('Provider not connected');

    this.ensureTable(table);
    const tableData = this.data.get(table)!;

    // Auto-generate ID
    const id = this.getNextId(table);
    const record = { id, ...data, created_at: new Date() };

    tableData.push(record);
    return id;
  }

  async findOne(table: string, condition: QueryCondition): Promise<Record<string, any> | null> {
    if (!this.connected) throw new Error('Provider not connected');

    this.ensureTable(table);
    const tableData = this.data.get(table)!;

    const filtered = this.filterData(tableData, condition);
    return filtered.length > 0 ? filtered[0] : null;
  }

  async findMany(table: string, condition: QueryCondition): Promise<Record<string, any>[]> {
    if (!this.connected) throw new Error('Provider not connected');

    this.ensureTable(table);
    const tableData = this.data.get(table)!;

    return this.filterData(tableData, condition);
  }

  async find(table: string, options: QueryOptions): Promise<QueryResult> {
    if (!this.connected) throw new Error('Provider not connected');

    this.ensureTable(table);
    let tableData = this.data.get(table)!;

    // Filter
    if (options.where) {
      tableData = this.filterData(tableData, options.where);
    }

    // Sort
    if (options.orderBy) {
      tableData = this.sortData(tableData, options.orderBy);
    }

    const totalCount = tableData.length;

    // Pagination
    if (options.offset !== undefined) {
      tableData = tableData.slice(options.offset);
    }
    if (options.limit !== undefined) {
      tableData = tableData.slice(0, options.limit);
    }

    // Select fields
    if (options.fields) {
      tableData = tableData.map(row => this.selectFields(row, options.fields!));
    }

    return {
      rows: tableData,
      totalCount
    };
  }

  async update(table: string, data: Record<string, any>, condition: QueryCondition): Promise<number> {
    if (!this.connected) throw new Error('Provider not connected');

    this.ensureTable(table);
    const tableData = this.data.get(table)!;

    let updatedCount = 0;
    for (let i = 0; i < tableData.length; i++) {
      if (this.matchesCondition(tableData[i], condition)) {
        tableData[i] = { ...tableData[i], ...data, updated_at: new Date() };
        updatedCount++;
      }
    }

    return updatedCount;
  }

  async delete(table: string, condition: QueryCondition): Promise<number> {
    if (!this.connected) throw new Error('Provider not connected');

    this.ensureTable(table);
    const tableData = this.data.get(table)!;

    const originalLength = tableData.length;
    const filtered = tableData.filter(row => !this.matchesCondition(row, condition));

    this.data.set(table, filtered);
    return originalLength - filtered.length;
  }

  // Helper methods
  private filterData(data: Record<string, any>[], condition: QueryCondition): Record<string, any>[] {
    return data.filter(row => this.matchesCondition(row, condition));
  }

  private matchesCondition(row: Record<string, any>, condition: QueryCondition): boolean {
    // AND conditions
    if (condition.and) {
      return condition.and.every(subCondition => this.matchesCondition(row, subCondition));
    }

    // OR conditions
    if (condition.or) {
      return condition.or.some(subCondition => this.matchesCondition(row, subCondition));
    }

    // Basic condition comparison
    const fieldValue = row[condition.field as string];

    switch (condition.op) {
      case '=':
        return fieldValue === condition.value;
      case '!=':
      case '<>':
        return fieldValue !== condition.value;
      case '>':
        return fieldValue > condition.value;
      case '>=':
        return fieldValue >= condition.value;
      case '<':
        return fieldValue < condition.value;
      case '<=':
        return fieldValue <= condition.value;
      case 'LIKE':
        const pattern = condition.value.replace(/%/g, '.*').replace(/_/g, '.');
        return new RegExp(pattern, 'i').test(fieldValue);
      case 'IN':
        return condition.values?.includes(fieldValue) || false;
      case 'NOT IN':
        return !condition.values?.includes(fieldValue);
      case 'BETWEEN':
        return condition.values &&
               fieldValue >= condition.values[0] &&
               fieldValue <= condition.values[1];
      case 'IS NULL':
        return fieldValue === null || fieldValue === undefined;
      case 'IS NOT NULL':
        return fieldValue !== null && fieldValue !== undefined;
      default:
        return false;
    }
  }

  private sortData(data: Record<string, any>[], orderBy: OrderByClause[]): Record<string, any>[] {
    return [...data].sort((a, b) => {
      for (const clause of orderBy) {
        const field = clause.field as string;
        const aVal = a[field];
        const bVal = b[field];

        let comparison = 0;
        if (aVal < bVal) comparison = -1;
        else if (aVal > bVal) comparison = 1;

        if (comparison !== 0) {
          return clause.direction === 'DESC' ? -comparison : comparison;
        }
      }
      return 0;
    });
  }

  private selectFields(row: Record<string, any>, fields: (string | AggregateField)[]): Record<string, any> {
    const result: Record<string, any> = {};

    for (const field of fields) {
      if (typeof field === 'string') {
        result[field] = row[field];
      } else {
        // Aggregate field handling (simplified implementation)
        const alias = field.alias || `${field.type.toLowerCase()}_${field.field}`;
        result[alias] = row[field.field]; // Simplified handling
      }
    }

    return result;
  }

  // Optional: Raw query support
  async query(sql: string, params?: any[]): Promise<any> {
    throw new Error('Memory Provider does not support raw SQL queries');
  }
}
```

## Advanced Implementation Example

### RESTful API Provider

```typescript
import axios, { AxiosInstance } from 'axios';
import { DataProvider, QueryCondition, QueryOptions, QueryResult } from '@wfp99/data-gateway';

export interface RestProviderOptions {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
  auth?: {
    type: 'bearer' | 'basic' | 'apikey';
    token?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    apiKeyHeader?: string;
  };
  endpoints?: {
    list?: string;      // GET /{table}
    create?: string;    // POST /{table}
    read?: string;      // GET /{table}/{id}
    update?: string;    // PUT /{table}/{id}
    delete?: string;    // DELETE /{table}/{id}
  };
}

export class RestProvider implements DataProvider {
  private client: AxiosInstance;
  private connected: boolean = false;

  constructor(private options: RestProviderOptions) {
    this.client = axios.create({
      baseURL: options.baseURL,
      timeout: options.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    this.setupAuth();
  }

  private setupAuth(): void {
    const { auth } = this.options;
    if (!auth) return;

    switch (auth.type) {
      case 'bearer':
        if (auth.token) {
          this.client.defaults.headers.common['Authorization'] = `Bearer ${auth.token}`;
        }
        break;
      case 'basic':
        if (auth.username && auth.password) {
          const token = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
          this.client.defaults.headers.common['Authorization'] = `Basic ${token}`;
        }
        break;
      case 'apikey':
        if (auth.apiKey) {
          const header = auth.apiKeyHeader || 'X-API-Key';
          this.client.defaults.headers.common[header] = auth.apiKey;
        }
        break;
    }
  }

  async connect(): Promise<void> {
    try {
      // Test connection
      await this.client.get('/health');
      this.connected = true;
      console.log('REST Provider connected');
    } catch (error) {
      this.connected = false;
      throw new Error(`REST Provider connection failed: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    console.log('REST Provider disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async insert(table: string, data: Record<string, any>): Promise<any> {
    if (!this.connected) throw new Error('Provider not connected');

    try {
      const endpoint = this.options.endpoints?.create || '';
      const response = await this.client.post(`/${table}${endpoint}`, data);

      // Return created resource ID or full object
      return response.data.id || response.data;
    } catch (error) {
      throw this.handleApiError(error, 'create resource');
    }
  }

  async findOne(table: string, condition: QueryCondition): Promise<Record<string, any> | null> {
    if (!this.connected) throw new Error('Provider not connected');

    try {
      // If condition is ID, query directly
      if (this.isIdCondition(condition)) {
        const endpoint = this.options.endpoints?.read || '';
        const response = await this.client.get(`/${table}/${condition.value}${endpoint}`);
        return response.data;
      }

      // Otherwise query list and take first item
      const results = await this.findMany(table, condition);
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw this.handleApiError(error, 'query resource');
    }
  }

  async findMany(table: string, condition: QueryCondition): Promise<Record<string, any>[]> {
    if (!this.connected) throw new Error('Provider not connected');

    try {
      const endpoint = this.options.endpoints?.list || '';
      const params = this.buildQueryParams(condition);

      const response = await this.client.get(`/${table}${endpoint}`, { params });

      // Handle different response formats
      return Array.isArray(response.data) ? response.data : response.data.items || response.data.data || [];
    } catch (error) {
      throw this.handleApiError(error, 'query resource list');
    }
  }

  async find(table: string, options: QueryOptions): Promise<QueryResult> {
    if (!this.connected) throw new Error('Provider not connected');

    try {
      const endpoint = this.options.endpoints?.list || '';
      const params = this.buildQueryParamsFromOptions(options);

      const response = await this.client.get(`/${table}${endpoint}`, { params });

      // Handle paginated response
      if (response.data.items || response.data.data) {
        return {
          rows: response.data.items || response.data.data,
          totalCount: response.data.total || response.data.totalCount
        };
      }

      // Simple array response
      return {
        rows: Array.isArray(response.data) ? response.data : [],
        totalCount: Array.isArray(response.data) ? response.data.length : 0
      };
    } catch (error) {
      throw this.handleApiError(error, 'query resources');
    }
  }

  async update(table: string, data: Record<string, any>, condition: QueryCondition): Promise<number> {
    if (!this.connected) throw new Error('Provider not connected');

    try {
      // If condition is ID, update directly
      if (this.isIdCondition(condition)) {
        const endpoint = this.options.endpoints?.update || '';
        await this.client.put(`/${table}/${condition.value}${endpoint}`, data);
        return 1;
      }

      // Otherwise query first then batch update
      const items = await this.findMany(table, condition);
      let updatedCount = 0;

      for (const item of items) {
        const endpoint = this.options.endpoints?.update || '';
        await this.client.put(`/${table}/${item.id}${endpoint}`, data);
        updatedCount++;
      }

      return updatedCount;
    } catch (error) {
      throw this.handleApiError(error, 'update resource');
    }
  }

  async delete(table: string, condition: QueryCondition): Promise<number> {
    if (!this.connected) throw new Error('Provider not connected');

    try {
      // If condition is ID, delete directly
      if (this.isIdCondition(condition)) {
        const endpoint = this.options.endpoints?.delete || '';
        await this.client.delete(`/${table}/${condition.value}${endpoint}`);
        return 1;
      }

      // Otherwise query first then batch delete
      const items = await this.findMany(table, condition);
      let deletedCount = 0;

      for (const item of items) {
        const endpoint = this.options.endpoints?.delete || '';
        await this.client.delete(`/${table}/${item.id}${endpoint}`);
        deletedCount++;
      }

      return deletedCount;
    } catch (error) {
      throw this.handleApiError(error, 'delete resource');
    }
  }

  // Helper methods
  private isIdCondition(condition: QueryCondition): boolean {
    return (condition.field === 'id' || condition.field === '_id') &&
           condition.op === '=' &&
           condition.value !== undefined;
  }

  private buildQueryParams(condition: QueryCondition): Record<string, any> {
    const params: Record<string, any> = {};

    if (condition.and) {
      condition.and.forEach((subCondition, index) => {
        const subParams = this.buildQueryParams(subCondition);
        Object.keys(subParams).forEach(key => {
          params[`and_${index}_${key}`] = subParams[key];
        });
      });
    } else if (condition.or) {
      condition.or.forEach((subCondition, index) => {
        const subParams = this.buildQueryParams(subCondition);
        Object.keys(subParams).forEach(key => {
          params[`or_${index}_${key}`] = subParams[key];
        });
      });
    } else {
      const field = condition.field as string;
      const op = condition.op;

      if (op === '=') {
        params[field] = condition.value;
      } else {
        params[`${field}__${op.toLowerCase()}`] = condition.value || condition.values;
      }
    }

    return params;
  }

  private buildQueryParamsFromOptions(options: QueryOptions): Record<string, any> {
    const params: Record<string, any> = {};

    if (options.where) {
      Object.assign(params, this.buildQueryParams(options.where));
    }

    if (options.limit) {
      params.limit = options.limit;
    }

    if (options.offset) {
      params.offset = options.offset;
    }

    if (options.orderBy) {
      const orderFields = options.orderBy.map(clause =>
        `${clause.direction === 'DESC' ? '-' : ''}${clause.field}`
      );
      params.ordering = orderFields.join(',');
    }

    if (options.fields) {
      params.fields = options.fields.join(',');
    }

    return params;
  }

  private handleApiError(error: any, operation: string): Error {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.message || error.response.statusText;
      return new Error(`${operation} failed (${status}): ${message}`);
    } else if (error.request) {
      return new Error(`${operation} failed: Network error`);
    } else {
      return new Error(`${operation} failed: ${error.message}`);
    }
  }

  // Optional: Raw query support (GraphQL or custom endpoints)
  async query(endpoint: string, params?: any[]): Promise<any> {
    if (!this.connected) throw new Error('Provider not connected');

    try {
      const response = await this.client.post(endpoint, { params });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'custom query');
    }
  }
}
```

## Registering Custom Providers

### Dynamic Registration

```typescript
import { DataGateway } from '@wfp99/data-gateway';
import { MemoryProvider } from './providers/MemoryProvider';
import { RestProvider } from './providers/RestProvider';

// Register custom provider types
declare module '@wfp99/data-gateway' {
  interface ProviderTypeMap {
    memory: MemoryProvider;
    rest: RestProvider;
  }
}

// Use custom providers
const gateway = await DataGateway.build({
  providers: {
    memoryStore: {
      type: 'memory' as any,  // Custom type
      provider: new MemoryProvider()  // Provide instance directly
    },

    apiService: {
      type: 'rest' as any,
      provider: new RestProvider({
        baseURL: 'https://api.example.com',
        auth: {
          type: 'bearer',
          token: process.env.API_TOKEN
        }
      })
    }
  },

  repositories: {
    cache: { provider: 'memoryStore', table: 'cache' },
    users: { provider: 'apiService', table: 'users' },
    orders: { provider: 'apiService', table: 'orders' }
  }
});
```

### Factory Pattern Registration

```typescript
// Provider Factory
export class ProviderFactory {
  private static providers = new Map<string, new (...args: any[]) => DataProvider>();

  static register<T extends DataProvider>(
    type: string,
    providerClass: new (...args: any[]) => T
  ): void {
    this.providers.set(type, providerClass);
  }

  static create(type: string, options?: any): DataProvider {
    const ProviderClass = this.providers.get(type);
    if (!ProviderClass) {
      throw new Error(`Unknown provider type: ${type}`);
    }
    return new ProviderClass(options);
  }

  static getRegisteredTypes(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Register custom providers
ProviderFactory.register('memory', MemoryProvider);
ProviderFactory.register('rest', RestProvider);

// Create providers using factory
const memoryProvider = ProviderFactory.create('memory');
const restProvider = ProviderFactory.create('rest', {
  baseURL: 'https://api.example.com',
  auth: { type: 'bearer', token: 'your-token' }
});

// Use in DataGateway
const gateway = await DataGateway.build({
  providers: {
    cache: { provider: memoryProvider },
    api: { provider: restProvider }
  },
  repositories: {
    sessions: { provider: 'cache', table: 'sessions' },
    users: { provider: 'api', table: 'users' }
  }
});
```

## Testing Custom Providers

### Unit Test Example

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryProvider } from '../src/providers/MemoryProvider';

describe('MemoryProvider', () => {
  let provider: MemoryProvider;

  beforeEach(async () => {
    provider = new MemoryProvider();
    await provider.connect();
  });

  afterEach(async () => {
    await provider.disconnect();
  });

  it('should connect and disconnect properly', async () => {
    expect(provider.isConnected()).toBe(true);

    await provider.disconnect();
    expect(provider.isConnected()).toBe(false);
  });

  it('should insert and query data', async () => {
    const userData = { name: 'John Doe', email: 'john@example.com' };
    const id = await provider.insert('users', userData);

    expect(id).toBeDefined();

    const user = await provider.findOne('users', {
      field: 'id',
      op: '=',
      value: id
    });

    expect(user).toMatchObject(userData);
    expect(user?.id).toBe(id);
  });

  it('should support complex query conditions', async () => {
    // Insert test data
    await provider.insert('users', { name: 'Alice', age: 25, department: 'Engineering' });
    await provider.insert('users', { name: 'Bob', age: 30, department: 'Marketing' });
    await provider.insert('users', { name: 'Charlie', age: 35, department: 'Engineering' });

    // Test AND conditions
    const engineeringUsers = await provider.findMany('users', {
      and: [
        { field: 'department', op: '=', value: 'Engineering' },
        { field: 'age', op: '>', value: 25 }
      ]
    });

    expect(engineeringUsers).toHaveLength(1);
    expect(engineeringUsers[0].name).toBe('Charlie');
  });
});
```

## Best Practices

### 1. Error Handling

```typescript
// Define specific error types
export class ProviderError extends Error {
  constructor(
    message: string,
    public code: string,
    public operation: string,
    public table?: string
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class ConnectionError extends ProviderError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR', 'connect');
  }
}

export class QueryError extends ProviderError {
  constructor(message: string, operation: string, table?: string) {
    super(message, 'QUERY_ERROR', operation, table);
  }
}
```

### 2. Configuration Validation

```typescript
// Provider options validation
export function validateProviderOptions(options: any): void {
  if (!options) {
    throw new Error('Provider options cannot be empty');
  }

  // Validate required fields
  const requiredFields = ['host', 'port', 'database'];
  for (const field of requiredFields) {
    if (!options[field]) {
      throw new Error(`Missing required configuration: ${field}`);
    }
  }

  // Validate value ranges
  if (options.port && (options.port < 1 || options.port > 65535)) {
    throw new Error('Port must be in range 1-65535');
  }
}
```

### 3. Documentation Example

```typescript
/**
 * Custom MongoDB Provider
 *
 * @example
 * ```typescript
 * const provider = new MongoProvider({
 *   url: 'mongodb://localhost:27017/mydb',
 *   options: {
 *     maxPoolSize: 10,
 *     serverSelectionTimeoutMS: 5000
 *   }
 * });
 *
 * const gateway = await DataGateway.build({
 *   providers: {
 *     mongo: { provider }
 *   },
 *   repositories: {
 *     users: { provider: 'mongo', table: 'users' }
 *   }
 * });
 * ```
 */
export class MongoProvider implements DataProvider {
  /**
   * Create MongoDB Provider instance
   * @param options MongoDB connection options
   */
  constructor(private options: MongoProviderOptions) {
    validateProviderOptions(options);
  }

  /**
   * Insert a single document
   * @param table Collection name
   * @param data Data to insert
   * @returns Inserted document ID
   */
  async insert(table: string, data: Record<string, any>): Promise<any> {
    // Implementation...
  }

  // ... other methods
}
```

## Related Links

- [DataGateway API Documentation](../api/data-gateway.md)
- [Connection Pool Management](../advanced/connection-pooling.md)