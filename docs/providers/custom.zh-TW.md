# 自訂 Provider

Data Gateway 支援建立自訂 Data Provider，讓您可以整合任何資料來源。本指南將詳細說明如何實現自訂 Provider，包括介面定義、實作範例和最佳實踐。

## DataProvider 介面

所有 Data Provider 都必須實現 `DataProvider` 介面：

```typescript
export interface DataProvider {
  // 基本 CRUD 操作
  insert(table: string, data: Record<string, any>): Promise<any>;
  findOne(table: string, condition: QueryCondition): Promise<Record<string, any> | null>;
  findMany(table: string, condition: QueryCondition): Promise<Record<string, any>[]>;
  find(table: string, options: QueryOptions): Promise<QueryResult>;
  update(table: string, data: Record<string, any>, condition: QueryCondition): Promise<number>;
  delete(table: string, condition: QueryCondition): Promise<number>;

  // 原始查詢支援
  query?(sql: string, params?: any[]): Promise<any>;

  // 連線管理
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // 連線池支援（可選）
  getPoolStatus?(): ConnectionPoolStatus | null;
}
```

### 相關介面定義

```typescript
// 查詢條件
export interface QueryCondition {
  field: string | AggregateField;
  op: QueryOperator;
  value?: any;
  values?: any[];
  subquery?: SubqueryCondition;
  and?: QueryCondition[];
  or?: QueryCondition[];
}

// 查詢選項
export interface QueryOptions {
  fields?: (string | AggregateField)[];
  where?: QueryCondition;
  groupBy?: string[];
  having?: QueryCondition;
  orderBy?: OrderByClause[];
  limit?: number;
  offset?: number;
}

// 查詢結果
export interface QueryResult {
  rows: Record<string, any>[];
  totalCount?: number;
  affectedRows?: number;
}

// 連線池狀態
export interface ConnectionPoolStatus {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  maxConnections: number;
}

// 聚合欄位
export interface AggregateField {
  type: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
  field: string;
  alias?: string;
}

// 排序子句
export interface OrderByClause {
  field: string | AggregateField;
  direction: 'ASC' | 'DESC';
}
```

## 基本實作範例

### 簡單記憶體 Provider

```typescript
import { DataProvider, QueryCondition, QueryOptions, QueryResult } from '@wfp99/data-gateway';

export class MemoryProvider implements DataProvider {
  private data: Map<string, Record<string, any>[]> = new Map();
  private connected: boolean = false;
  private nextId: Map<string, number> = new Map();

  async connect(): Promise<void> {
    this.connected = true;
    console.log('Memory Provider 已連線');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.data.clear();
    this.nextId.clear();
    console.log('Memory Provider 已中斷連線');
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
    if (!this.connected) throw new Error('Provider 未連線');

    this.ensureTable(table);
    const tableData = this.data.get(table)!;

    // 自動產生 ID
    const id = this.getNextId(table);
    const record = { id, ...data, created_at: new Date() };

    tableData.push(record);
    return id;
  }

  async findOne(table: string, condition: QueryCondition): Promise<Record<string, any> | null> {
    if (!this.connected) throw new Error('Provider 未連線');

    this.ensureTable(table);
    const tableData = this.data.get(table)!;

    const filtered = this.filterData(tableData, condition);
    return filtered.length > 0 ? filtered[0] : null;
  }

  async findMany(table: string, condition: QueryCondition): Promise<Record<string, any>[]> {
    if (!this.connected) throw new Error('Provider 未連線');

    this.ensureTable(table);
    const tableData = this.data.get(table)!;

    return this.filterData(tableData, condition);
  }

  async find(table: string, options: QueryOptions): Promise<QueryResult> {
    if (!this.connected) throw new Error('Provider 未連線');

    this.ensureTable(table);
    let tableData = this.data.get(table)!;

    // 篩選
    if (options.where) {
      tableData = this.filterData(tableData, options.where);
    }

    // 排序
    if (options.orderBy) {
      tableData = this.sortData(tableData, options.orderBy);
    }

    const totalCount = tableData.length;

    // 分頁
    if (options.offset !== undefined) {
      tableData = tableData.slice(options.offset);
    }
    if (options.limit !== undefined) {
      tableData = tableData.slice(0, options.limit);
    }

    // 選擇欄位
    if (options.fields) {
      tableData = tableData.map(row => this.selectFields(row, options.fields!));
    }

    return {
      rows: tableData,
      totalCount
    };
  }

  async update(table: string, data: Record<string, any>, condition: QueryCondition): Promise<number> {
    if (!this.connected) throw new Error('Provider 未連線');

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
    if (!this.connected) throw new Error('Provider 未連線');

    this.ensureTable(table);
    const tableData = this.data.get(table)!;

    const originalLength = tableData.length;
    const filtered = tableData.filter(row => !this.matchesCondition(row, condition));

    this.data.set(table, filtered);
    return originalLength - filtered.length;
  }

  // 輔助方法
  private filterData(data: Record<string, any>[], condition: QueryCondition): Record<string, any>[] {
    return data.filter(row => this.matchesCondition(row, condition));
  }

  private matchesCondition(row: Record<string, any>, condition: QueryCondition): boolean {
    // AND 條件
    if (condition.and) {
      return condition.and.every(subCondition => this.matchesCondition(row, subCondition));
    }

    // OR 條件
    if (condition.or) {
      return condition.or.some(subCondition => this.matchesCondition(row, subCondition));
    }

    // 基本條件比較
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
        // 聚合欄位處理（簡化實作）
        const alias = field.alias || `${field.type.toLowerCase()}_${field.field}`;
        result[alias] = row[field.field]; // 簡化處理
      }
    }

    return result;
  }

  // 可選：原始查詢支援
  async query(sql: string, params?: any[]): Promise<any> {
    throw new Error('Memory Provider 不支援原始 SQL 查詢');
  }
}
```

## 進階實作範例

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
      // 測試連線
      await this.client.get('/health');
      this.connected = true;
      console.log('REST Provider 已連線');
    } catch (error) {
      this.connected = false;
      throw new Error(`REST Provider 連線失敗: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    console.log('REST Provider 已中斷連線');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async insert(table: string, data: Record<string, any>): Promise<any> {
    if (!this.connected) throw new Error('Provider 未連線');

    try {
      const endpoint = this.options.endpoints?.create || '';
      const response = await this.client.post(`/${table}${endpoint}`, data);

      // 回傳建立的資源 ID 或完整物件
      return response.data.id || response.data;
    } catch (error) {
      throw this.handleApiError(error, '建立資源');
    }
  }

  async findOne(table: string, condition: QueryCondition): Promise<Record<string, any> | null> {
    if (!this.connected) throw new Error('Provider 未連線');

    try {
      // 如果條件是 ID，直接查詢
      if (this.isIdCondition(condition)) {
        const endpoint = this.options.endpoints?.read || '';
        const response = await this.client.get(`/${table}/${condition.value}${endpoint}`);
        return response.data;
      }

      // 否則查詢列表並取第一筆
      const results = await this.findMany(table, condition);
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw this.handleApiError(error, '查詢資源');
    }
  }

  async findMany(table: string, condition: QueryCondition): Promise<Record<string, any>[]> {
    if (!this.connected) throw new Error('Provider 未連線');

    try {
      const endpoint = this.options.endpoints?.list || '';
      const params = this.buildQueryParams(condition);

      const response = await this.client.get(`/${table}${endpoint}`, { params });

      // 處理不同的回應格式
      return Array.isArray(response.data) ? response.data : response.data.items || response.data.data || [];
    } catch (error) {
      throw this.handleApiError(error, '查詢資源列表');
    }
  }

  async find(table: string, options: QueryOptions): Promise<QueryResult> {
    if (!this.connected) throw new Error('Provider 未連線');

    try {
      const endpoint = this.options.endpoints?.list || '';
      const params = this.buildQueryParamsFromOptions(options);

      const response = await this.client.get(`/${table}${endpoint}`, { params });

      // 處理分頁回應
      if (response.data.items || response.data.data) {
        return {
          rows: response.data.items || response.data.data,
          totalCount: response.data.total || response.data.totalCount
        };
      }

      // 簡單陣列回應
      return {
        rows: Array.isArray(response.data) ? response.data : [],
        totalCount: Array.isArray(response.data) ? response.data.length : 0
      };
    } catch (error) {
      throw this.handleApiError(error, '查詢資源');
    }
  }

  async update(table: string, data: Record<string, any>, condition: QueryCondition): Promise<number> {
    if (!this.connected) throw new Error('Provider 未連線');

    try {
      // 如果條件是 ID，直接更新
      if (this.isIdCondition(condition)) {
        const endpoint = this.options.endpoints?.update || '';
        await this.client.put(`/${table}/${condition.value}${endpoint}`, data);
        return 1;
      }

      // 否則先查詢再批次更新
      const items = await this.findMany(table, condition);
      let updatedCount = 0;

      for (const item of items) {
        const endpoint = this.options.endpoints?.update || '';
        await this.client.put(`/${table}/${item.id}${endpoint}`, data);
        updatedCount++;
      }

      return updatedCount;
    } catch (error) {
      throw this.handleApiError(error, '更新資源');
    }
  }

  async delete(table: string, condition: QueryCondition): Promise<number> {
    if (!this.connected) throw new Error('Provider 未連線');

    try {
      // 如果條件是 ID，直接刪除
      if (this.isIdCondition(condition)) {
        const endpoint = this.options.endpoints?.delete || '';
        await this.client.delete(`/${table}/${condition.value}${endpoint}`);
        return 1;
      }

      // 否則先查詢再批次刪除
      const items = await this.findMany(table, condition);
      let deletedCount = 0;

      for (const item of items) {
        const endpoint = this.options.endpoints?.delete || '';
        await this.client.delete(`/${table}/${item.id}${endpoint}`);
        deletedCount++;
      }

      return deletedCount;
    } catch (error) {
      throw this.handleApiError(error, '刪除資源');
    }
  }

  // 輔助方法
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
      return new Error(`${operation}失敗 (${status}): ${message}`);
    } else if (error.request) {
      return new Error(`${operation}失敗: 網路錯誤`);
    } else {
      return new Error(`${operation}失敗: ${error.message}`);
    }
  }

  // 可選：原始查詢支援（GraphQL 或自訂端點）
  async query(endpoint: string, params?: any[]): Promise<any> {
    if (!this.connected) throw new Error('Provider 未連線');

    try {
      const response = await this.client.post(endpoint, { params });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, '自訂查詢');
    }
  }
}
```

## 連線池支援範例

### 帶連線池的資料庫 Provider

```typescript
import { DataProvider, ConnectionPoolStatus } from '@wfp99/data-gateway';

export interface PoolConfig {
  usePool: boolean;
  maxConnections: number;
  minConnections?: number;
  acquireTimeout?: number;
  idleTimeout?: number;
  preConnect?: boolean;
}

export abstract class PooledProvider implements DataProvider {
  protected pool: ConnectionPool | null = null;
  protected singleConnection: any = null;
  protected config: PoolConfig;

  constructor(config: PoolConfig) {
    this.config = {
      minConnections: 1,
      acquireTimeout: 30000,
      idleTimeout: 600000,
      preConnect: false,
      ...config
    };
  }

  async connect(): Promise<void> {
    if (this.config.usePool) {
      this.pool = new ConnectionPool(this.config);
      this.pool.createConnection = () => this.createConnection();
      await this.pool.initialize();

      if (this.config.preConnect) {
        await this.pool.preConnect();
      }
    } else {
      this.singleConnection = await this.createConnection();
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    } else if (this.singleConnection) {
      await this.closeConnection(this.singleConnection);
      this.singleConnection = null;
    }
  }

  isConnected(): boolean {
    return (this.pool?.isActive() || this.singleConnection !== null) || false;
  }

  getPoolStatus(): ConnectionPoolStatus | null {
    return this.pool?.getStatus() || null;
  }

  protected async getConnection(): Promise<any> {
    if (this.pool) {
      return await this.pool.acquire();
    } else if (this.singleConnection) {
      return this.singleConnection;
    } else {
      throw new Error('Provider 未連線');
    }
  }

  protected async releaseConnection(connection: any): Promise<void> {
    if (this.pool) {
      await this.pool.release(connection);
    }
    // 單一連線無需釋放
  }

  // 子類別必須實作的方法
  protected abstract createConnection(): Promise<any>;
  protected abstract closeConnection(connection: any): Promise<void>;

  // DataProvider 介面方法
  abstract insert(table: string, data: Record<string, any>): Promise<any>;
  abstract findOne(table: string, condition: QueryCondition): Promise<Record<string, any> | null>;
  abstract findMany(table: string, condition: QueryCondition): Promise<Record<string, any>[]>;
  abstract find(table: string, options: QueryOptions): Promise<QueryResult>;
  abstract update(table: string, data: Record<string, any>, condition: QueryCondition): Promise<number>;
  abstract delete(table: string, condition: QueryCondition): Promise<number>;
}

// 連線池實作
class ConnectionPool {
  private connections: PoolConnection[] = [];
  private acquireQueue: Array<{
    resolve: (connection: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];
  private active = false;

  public createConnection!: () => Promise<any>;

  constructor(private config: PoolConfig) {}

  async initialize(): Promise<void> {
    this.active = true;

    // 建立最小連線數
    for (let i = 0; i < (this.config.minConnections || 1); i++) {
      await this.addConnection();
    }
  }

  async preConnect(): Promise<void> {
    const targetConnections = Math.min(this.config.maxConnections, 5);
    while (this.connections.length < targetConnections) {
      await this.addConnection();
    }
  }

  private async addConnection(): Promise<void> {
    if (this.connections.length >= this.config.maxConnections) {
      return;
    }

    try {
      const rawConnection = await this.createConnection();
      const poolConnection: PoolConnection = {
        raw: rawConnection,
        inUse: false,
        createdAt: Date.now(),
        lastUsed: Date.now()
      };

      this.connections.push(poolConnection);
      this.startIdleTimer(poolConnection);
    } catch (error) {
      console.error('建立連線失敗:', error);
      throw error;
    }
  }

  async acquire(): Promise<any> {
    if (!this.active) {
      throw new Error('連線池已關閉');
    }

    // 尋找可用連線
    const available = this.connections.find(conn => !conn.inUse);
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      return available.raw;
    }

    // 如果未達最大連線數，建立新連線
    if (this.connections.length < this.config.maxConnections) {
      await this.addConnection();
      const newConnection = this.connections[this.connections.length - 1];
      newConnection.inUse = true;
      return newConnection.raw;
    }

    // 等待連線釋放
    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.acquireQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.acquireQueue.splice(index, 1);
        }
        reject(new Error('取得連線超時'));
      }, this.config.acquireTimeout);

      this.acquireQueue.push({ resolve, reject, timeout });
    });
  }

  async release(rawConnection: any): Promise<void> {
    const poolConnection = this.connections.find(conn => conn.raw === rawConnection);
    if (!poolConnection) {
      console.warn('嘗試釋放未知連線');
      return;
    }

    poolConnection.inUse = false;
    poolConnection.lastUsed = Date.now();

    // 處理等待中的請求
    if (this.acquireQueue.length > 0) {
      const waiter = this.acquireQueue.shift()!;
      clearTimeout(waiter.timeout);
      poolConnection.inUse = true;
      waiter.resolve(poolConnection.raw);
    } else {
      this.startIdleTimer(poolConnection);
    }
  }

  private startIdleTimer(connection: PoolConnection): void {
    setTimeout(() => {
      if (!connection.inUse &&
          Date.now() - connection.lastUsed > this.config.idleTimeout! &&
          this.connections.length > (this.config.minConnections || 1)) {
        this.removeConnection(connection);
      }
    }, this.config.idleTimeout);
  }

  private async removeConnection(connection: PoolConnection): Promise<void> {
    const index = this.connections.indexOf(connection);
    if (index !== -1) {
      this.connections.splice(index, 1);
      try {
        await this.closeConnection(connection.raw);
      } catch (error) {
        console.error('關閉連線失敗:', error);
      }
    }
  }

  private closeConnection(connection: any): Promise<void> {
    // 由子類別實作
    return Promise.resolve();
  }

  async close(): Promise<void> {
    this.active = false;

    // 清除等待佇列
    for (const waiter of this.acquireQueue) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error('連線池已關閉'));
    }
    this.acquireQueue = [];

    // 關閉所有連線
    for (const connection of this.connections) {
      try {
        await this.closeConnection(connection.raw);
      } catch (error) {
        console.error('關閉連線失敗:', error);
      }
    }
    this.connections = [];
  }

  isActive(): boolean {
    return this.active;
  }

  getStatus(): ConnectionPoolStatus {
    const activeConnections = this.connections.filter(conn => conn.inUse).length;
    return {
      totalConnections: this.connections.length,
      activeConnections,
      idleConnections: this.connections.length - activeConnections,
      maxConnections: this.config.maxConnections
    };
  }
}

interface PoolConnection {
  raw: any;
  inUse: boolean;
  createdAt: number;
  lastUsed: number;
}
```

## 註冊自訂 Provider

### 動態註冊

```typescript
import { DataGateway } from '@wfp99/data-gateway';
import { MemoryProvider } from './providers/MemoryProvider';
import { RestProvider } from './providers/RestProvider';

// 註冊自訂 Provider 類型
declare module '@wfp99/data-gateway' {
  interface ProviderTypeMap {
    memory: MemoryProvider;
    rest: RestProvider;
  }
}

// 使用自訂 Provider
const gateway = await DataGateway.build({
  providers: {
    memoryStore: {
      type: 'memory' as any,  // 自訂類型
      provider: new MemoryProvider()  // 直接提供實例
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

### Factory 模式註冊

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
      throw new Error(`未知的 Provider 類型: ${type}`);
    }
    return new ProviderClass(options);
  }

  static getRegisteredTypes(): string[] {
    return Array.from(this.providers.keys());
  }
}

// 註冊自訂 Provider
ProviderFactory.register('memory', MemoryProvider);
ProviderFactory.register('rest', RestProvider);

// 使用 Factory 建立 Provider
const memoryProvider = ProviderFactory.create('memory');
const restProvider = ProviderFactory.create('rest', {
  baseURL: 'https://api.example.com',
  auth: { type: 'bearer', token: 'your-token' }
});

// 在 DataGateway 中使用
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

## 高級功能實作

### 中介軟體支援

```typescript
export interface ProviderMiddleware {
  name: string;
  before?: (operation: string, table: string, data?: any) => Promise<void>;
  after?: (operation: string, table: string, result: any) => Promise<any>;
  error?: (operation: string, table: string, error: Error) => Promise<void>;
}

export abstract class MiddlewareProvider implements DataProvider {
  private middlewares: ProviderMiddleware[] = [];

  addMiddleware(middleware: ProviderMiddleware): void {
    this.middlewares.push(middleware);
  }

  removeMiddleware(name: string): void {
    const index = this.middlewares.findIndex(m => m.name === name);
    if (index !== -1) {
      this.middlewares.splice(index, 1);
    }
  }

  protected async executeWithMiddleware<T>(
    operation: string,
    table: string,
    executor: () => Promise<T>,
    data?: any
  ): Promise<T> {
    // Before middlewares
    for (const middleware of this.middlewares) {
      if (middleware.before) {
        await middleware.before(operation, table, data);
      }
    }

    try {
      let result = await executor();

      // After middlewares
      for (const middleware of this.middlewares) {
        if (middleware.after) {
          result = await middleware.after(operation, table, result);
        }
      }

      return result;
    } catch (error) {
      // Error middlewares
      for (const middleware of this.middlewares) {
        if (middleware.error) {
          await middleware.error(operation, table, error);
        }
      }
      throw error;
    }
  }

  // 範例實作
  async insert(table: string, data: Record<string, any>): Promise<any> {
    return this.executeWithMiddleware('insert', table, async () => {
      return await this.doInsert(table, data);
    }, data);
  }

  protected abstract doInsert(table: string, data: Record<string, any>): Promise<any>;
  // ... 其他方法
}

// 使用範例
const loggingMiddleware: ProviderMiddleware = {
  name: 'logging',
  before: async (operation, table, data) => {
    console.log(`[${new Date().toISOString()}] ${operation.toUpperCase()} ${table}`, data ? { data } : '');
  },
  after: async (operation, table, result) => {
    console.log(`[${new Date().toISOString()}] ${operation.toUpperCase()} ${table} completed`, { result });
    return result;
  },
  error: async (operation, table, error) => {
    console.error(`[${new Date().toISOString()}] ${operation.toUpperCase()} ${table} failed:`, error.message);
  }
};

const cachingMiddleware: ProviderMiddleware = {
  name: 'caching',
  after: async (operation, table, result) => {
    if (operation === 'findOne' || operation === 'findMany') {
      // 快取查詢結果
      await cache.set(`${table}:${operation}`, result, { ttl: 300 });
    }
    return result;
  }
};

// 套用中介軟體
provider.addMiddleware(loggingMiddleware);
provider.addMiddleware(cachingMiddleware);
```

### 交易支援

```typescript
export interface Transaction {
  id: string;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  isActive(): boolean;
}

export abstract class TransactionalProvider extends MiddlewareProvider {
  private transactions = new Map<string, Transaction>();

  async beginTransaction(): Promise<string> {
    const transactionId = this.generateTransactionId();
    const transaction = await this.createTransaction(transactionId);

    this.transactions.set(transactionId, transaction);
    await transaction.begin();

    return transactionId;
  }

  async commitTransaction(transactionId: string): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`交易不存在: ${transactionId}`);
    }

    await transaction.commit();
    this.transactions.delete(transactionId);
  }

  async rollbackTransaction(transactionId: string): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`交易不存在: ${transactionId}`);
    }

    await transaction.rollback();
    this.transactions.delete(transactionId);
  }

  async withTransaction<T>(callback: (transactionId: string) => Promise<T>): Promise<T> {
    const transactionId = await this.beginTransaction();

    try {
      const result = await callback(transactionId);
      await this.commitTransaction(transactionId);
      return result;
    } catch (error) {
      await this.rollbackTransaction(transactionId);
      throw error;
    }
  }

  protected abstract createTransaction(id: string): Promise<Transaction>;
  protected abstract generateTransactionId(): string;

  // 修改操作方法以支援交易
  protected async doInsert(
    table: string,
    data: Record<string, any>,
    transactionId?: string
  ): Promise<any> {
    const transaction = transactionId ? this.transactions.get(transactionId) : null;
    return await this.performInsert(table, data, transaction);
  }

  protected abstract performInsert(
    table: string,
    data: Record<string, any>,
    transaction?: Transaction | null
  ): Promise<any>;
}

// 使用範例
await provider.withTransaction(async (transactionId) => {
  const userId = await userRepo.insert({
    name: 'John Doe',
    email: 'john@example.com'
  }, { transactionId });

  await orderRepo.insert({
    user_id: userId,
    total: 100
  }, { transactionId });

  // 如果任何操作失敗，交易會自動回滾
});
```

## 測試自訂 Provider

### 單元測試範例

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

  it('應該正確連線和中斷連線', async () => {
    expect(provider.isConnected()).toBe(true);

    await provider.disconnect();
    expect(provider.isConnected()).toBe(false);
  });

  it('應該能夠插入和查詢資料', async () => {
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

  it('應該支援複雜查詢條件', async () => {
    // 插入測試資料
    await provider.insert('users', { name: 'Alice', age: 25, department: 'Engineering' });
    await provider.insert('users', { name: 'Bob', age: 30, department: 'Marketing' });
    await provider.insert('users', { name: 'Charlie', age: 35, department: 'Engineering' });

    // 測試 AND 條件
    const engineeringUsers = await provider.findMany('users', {
      and: [
        { field: 'department', op: '=', value: 'Engineering' },
        { field: 'age', op: '>', value: 25 }
      ]
    });

    expect(engineeringUsers).toHaveLength(1);
    expect(engineeringUsers[0].name).toBe('Charlie');
  });

  it('應該正確處理更新操作', async () => {
    const id = await provider.insert('users', { name: 'John', email: 'john@example.com' });

    const updatedRows = await provider.update('users',
      { email: 'john.doe@example.com' },
      { field: 'id', op: '=', value: id }
    );

    expect(updatedRows).toBe(1);

    const user = await provider.findOne('users', {
      field: 'id',
      op: '=',
      value: id
    });

    expect(user?.email).toBe('john.doe@example.com');
  });

  it('應該正確處理刪除操作', async () => {
    const id = await provider.insert('users', { name: 'John', email: 'john@example.com' });

    const deletedRows = await provider.delete('users', {
      field: 'id',
      op: '=',
      value: id
    });

    expect(deletedRows).toBe(1);

    const user = await provider.findOne('users', {
      field: 'id',
      op: '=',
      value: id
    });

    expect(user).toBeNull();
  });

  it('應該支援分頁查詢', async () => {
    // 插入多筆資料
    for (let i = 1; i <= 10; i++) {
      await provider.insert('users', { name: `User ${i}`, age: 20 + i });
    }

    const result = await provider.find('users', {
      orderBy: [{ field: 'age', direction: 'ASC' }],
      limit: 3,
      offset: 2
    });

    expect(result.rows).toHaveLength(3);
    expect(result.totalCount).toBe(10);
    expect(result.rows[0].name).toBe('User 3');
  });
});
```

### 整合測試範例

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DataGateway } from '@wfp99/data-gateway';
import { MemoryProvider } from '../src/providers/MemoryProvider';

describe('DataGateway with MemoryProvider', () => {
  let gateway: DataGateway;

  beforeAll(async () => {
    gateway = await DataGateway.build({
      providers: {
        memory: {
          provider: new MemoryProvider()
        }
      },
      repositories: {
        users: { provider: 'memory', table: 'users' },
        orders: { provider: 'memory', table: 'orders' }
      }
    });
  });

  afterAll(async () => {
    await gateway.disconnectAll();
  });

  it('應該透過 Repository 正確操作資料', async () => {
    const userRepo = gateway.getRepository('users');

    // 插入使用者
    const userId = await userRepo?.insert({
      name: 'Test User',
      email: 'test@example.com'
    });

    expect(userId).toBeDefined();

    // 查詢使用者
    const users = await userRepo?.findMany({
      field: 'name',
      op: '=',
      value: 'Test User'
    });

    expect(users).toHaveLength(1);
    expect(users?.[0].email).toBe('test@example.com');
  });

  it('應該支援跨 Repository 操作', async () => {
    const userRepo = gateway.getRepository('users');
    const orderRepo = gateway.getRepository('orders');

    // 建立使用者
    const userId = await userRepo?.insert({
      name: 'Customer',
      email: 'customer@example.com'
    });

    // 建立訂單
    const orderId = await orderRepo?.insert({
      user_id: userId,
      total: 100,
      status: 'pending'
    });

    expect(orderId).toBeDefined();

    // 查詢使用者的訂單
    const orders = await orderRepo?.findMany({
      field: 'user_id',
      op: '=',
      value: userId
    });

    expect(orders).toHaveLength(1);
    expect(orders?.[0].total).toBe(100);
  });
});
```

## 最佳實踐

### 1. 錯誤處理

```typescript
// 定義特定的錯誤類型
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

// 在 Provider 中使用
async insert(table: string, data: Record<string, any>): Promise<any> {
  try {
    // 實作插入邏輯
    return result;
  } catch (error) {
    throw new QueryError(`插入 ${table} 失敗: ${error.message}`, 'insert', table);
  }
}
```

### 2. 資料驗證

```typescript
// 資料驗證中介軟體
const validationMiddleware: ProviderMiddleware = {
  name: 'validation',
  before: async (operation, table, data) => {
    if (operation === 'insert' || operation === 'update') {
      await validateData(table, data);
    }
  }
};

async function validateData(table: string, data: Record<string, any>): Promise<void> {
  const schema = getTableSchema(table);

  for (const [field, value] of Object.entries(data)) {
    const fieldSchema = schema[field];
    if (!fieldSchema) continue;

    // 必填欄位檢查
    if (fieldSchema.required && (value === null || value === undefined)) {
      throw new Error(`欄位 ${field} 為必填`);
    }

    // 類型檢查
    if (value !== null && value !== undefined) {
      if (fieldSchema.type === 'string' && typeof value !== 'string') {
        throw new Error(`欄位 ${field} 必須為字串類型`);
      }
      if (fieldSchema.type === 'number' && typeof value !== 'number') {
        throw new Error(`欄位 ${field} 必須為數字類型`);
      }
    }
  }
}
```

### 3. 效能監控

```typescript
// 效能監控中介軟體
const performanceMiddleware: ProviderMiddleware = {
  name: 'performance',
  before: async (operation, table, data) => {
    (data as any).__startTime = Date.now();
  },
  after: async (operation, table, result) => {
    const startTime = (result as any).__startTime;
    if (startTime) {
      const duration = Date.now() - startTime;
      console.log(`${operation} ${table} 耗時: ${duration}ms`);

      // 記錄慢查詢
      if (duration > 1000) {
        console.warn(`慢查詢警告: ${operation} ${table} 耗時 ${duration}ms`);
      }
    }
    return result;
  }
};
```

### 4. 設定驗證

```typescript
// Provider 選項驗證
export function validateProviderOptions(options: any): void {
  if (!options) {
    throw new Error('Provider 選項不能為空');
  }

  // 驗證必要欄位
  const requiredFields = ['host', 'port', 'database'];
  for (const field of requiredFields) {
    if (!options[field]) {
      throw new Error(`缺少必要設定: ${field}`);
    }
  }

  // 驗證數值範圍
  if (options.port && (options.port < 1 || options.port > 65535)) {
    throw new Error('連接埠必須在 1-65535 範圍內');
  }

  // 驗證連線池設定
  if (options.pool) {
    if (options.pool.maxConnections && options.pool.maxConnections < 1) {
      throw new Error('最大連線數必須大於 0');
    }
  }
}
```

### 5. 文件範例

```typescript
/**
 * 自訂 MongoDB Provider
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
   * 建立 MongoDB Provider 實例
   * @param options MongoDB 連線選項
   */
  constructor(private options: MongoProviderOptions) {
    validateProviderOptions(options);
  }

  /**
   * 插入單筆文件
   * @param table 集合名稱
   * @param data 要插入的資料
   * @returns 插入的文件 ID
   */
  async insert(table: string, data: Record<string, any>): Promise<any> {
    // 實作...
  }

  // ... 其他方法
}
```

## 相關連結

- [DataGateway API 文件](../api/data-gateway.zh-TW.md)
- [DataProvider API 文件](../api/data-provider.zh-TW.md)
- [中介軟體系統](../advanced/middleware.md)
- [連線池管理](../advanced/connection-pooling.zh-TW.md)