# 架構設計

Data Gateway 採用模組化和可擴展的架構設計，確保高度的靈活性和可維護性。本文件詳細說明核心架構概念和設計原則。

## 整體架構

### 架構圖

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

## 核心元件

### 1. DataGateway（閘道核心）

DataGateway 是整個系統的中央協調器，負責：

- **Provider 管理**: 註冊、初始化和管理多個資料提供者
- **Repository 管理**: 建立和管理儲存庫實例
- **連線生命週期**: 統一管理所有資料來源的連線
- **連線池監控**: 提供連線池狀態監控和管理

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

**設計原則:**
- **單一職責**: 專注於協調和管理，不處理具體的資料操作
- **懶載入**: Provider 只在實際使用時才載入，減少不必要的依賴
- **錯誤隔離**: 單一 Provider 的失敗不會影響其他 Provider

### 2. DataProvider（資料提供者）

DataProvider 是資料來源的抽象介面，定義了統一的資料存取方法：

```typescript
export interface DataProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query<T = any>(query: Query): Promise<QueryResult<T>>;
  getPoolStatus?(): ConnectionPoolStatus | undefined;
  supportsConnectionPooling?(): boolean;
}
```

**實現類型:**
- **MySQLProvider**: MySQL/MariaDB 資料庫支援
- **PostgreSQLProvider**: PostgreSQL 資料庫支援
- **SQLiteProvider**: SQLite 檔案資料庫支援
- **RemoteProvider**: HTTP/HTTPS API 支援
- **CustomProvider**: 自訂資料來源支援

**設計原則:**
- **統一介面**: 所有 Provider 實現相同的介面，確保一致性
- **可插拔**: 新的 Provider 可以輕鬆加入，無需修改核心程式碼
- **連線池支援**: 各 Provider 根據特性實現適合的連線池策略

### 3. Repository（儲存庫）

Repository 實現了資料存取的業務邏輯，提供高層次的 CRUD 操作：

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

**核心功能:**
- **CRUD 操作**: 完整的建立、讀取、更新、刪除功能
- **查詢建構**: 將高層次查詢轉換為底層 Provider 查詢
- **欄位對應**: 自動處理應用程式欄位名稱與資料庫欄位的對應
- **中介軟體支援**: 支援查詢前後的自訂處理邏輯

### 4. Middleware（中介軟體）

Middleware 提供了在查詢執行前後插入自訂邏輯的機制：

```typescript
export type Middleware = (
  query: Query,
  next: (query: Query) => Promise<QueryResult<any>>
) => Promise<QueryResult<any>>;
```

**應用場景:**
- **日誌記錄**: 追蹤所有資料庫操作
- **效能監控**: 測量查詢執行時間
- **資料驗證**: 在插入/更新前驗證資料
- **快取**: 實現查詢結果快取
- **權限控制**: 基於使用者角色限制資料存取

### 5. EntityFieldMapper（欄位對應器）

EntityFieldMapper 處理應用程式物件屬性與資料庫欄位之間的對應：

```typescript
export interface EntityFieldMapper<T> {
  mapToDatabase(appField: string): string;
  mapFromDatabase(dbField: string): string;
  transformToDatabase(data: Partial<T>): Record<string, any>;
  transformFromDatabase(data: Record<string, any>): Partial<T>;
}
```

**實現類型:**
- **DefaultFieldMapper**: 預設實現，不進行任何轉換
- **MappingFieldMapper**: 基於對應表的欄位轉換

### 6. QueryObject（查詢物件）

QueryObject 定義了統一的查詢語言，支援複雜的查詢條件：

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

## 資料流程

### 1. 查詢流程

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

### 2. 連線管理流程

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

## 設計模式

### 1. 工廠模式（Factory Pattern）

DataGateway 使用工廠模式動態建立 Provider 實例：

```typescript
// 根據設定動態建立 Provider
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

### 2. 儲存庫模式（Repository Pattern）

抽象資料存取邏輯，提供一致的 API：

```typescript
// 統一的資料存取介面
const userRepo = gateway.getRepository('users');
const orderRepo = gateway.getRepository('orders');

// 相同的操作方法，不同的資料來源
const users = await userRepo.findMany();  // MySQL
const orders = await orderRepo.findMany(); // PostgreSQL
```

### 3. 策略模式（Strategy Pattern）

不同的 Provider 實現不同的資料存取策略：

```typescript
// MySQL 策略：使用 mysql2 連線池
// PostgreSQL 策略：使用 pg 連線池
// SQLite 策略：使用檔案連線
// Remote 策略：使用 HTTP 請求
```

### 4. 責任鏈模式（Chain of Responsibility）

Middleware 形成責任鏈處理查詢：

```typescript
const middlewares = [validationMiddleware, loggingMiddleware, cachingMiddleware];
// validation -> logging -> caching -> provider -> caching -> logging -> validation
```

## 可擴展性設計

### 1. 新 Provider 擴展

添加新的資料來源支援：

```typescript
// 1. 實現 DataProvider 介面
export class MongoDBProvider implements DataProvider {
  async connect(): Promise<void> { /* ... */ }
  async disconnect(): Promise<void> { /* ... */ }
  async query<T>(query: Query): Promise<QueryResult<T>> { /* ... */ }
}

// 2. 在 DataGateway 中註冊
case 'mongodb':
  const { MongoDBProvider } = await import('./dataProviders/MongoDBProvider.js');
  provider = new MongoDBProvider(providerConfig.options);
  break;
```

### 2. 新 Middleware 擴展

添加新的中介軟體功能：

```typescript
// 權限控制中介軟體
const authorizationMiddleware: Middleware = async (query, next) => {
  const user = getCurrentUser();

  if (query.type === 'DELETE' && !user.hasRole('admin')) {
    throw new Error('權限不足');
  }

  return next(query);
};
```

### 3. 新查詢功能擴展

擴展 QueryObject 支援更多查詢類型：

```typescript
// 支援全文搜索
interface FullTextSearch {
  type: 'FULLTEXT';
  fields: string[];
  query: string;
}

// 支援地理查詢
interface GeoQuery {
  type: 'GEO';
  field: string;
  center: [number, number];
  radius: number;
}
```

## 效能考量

### 1. 連線池策略

不同資料來源採用適合的連線池策略：

- **MySQL/PostgreSQL**: 完整連線池，支援讀寫分離
- **SQLite**: 讀取連線池，寫入單一連線
- **Remote API**: 無連線池，使用 HTTP 持久連線

### 2. 懶載入優化

- **Provider 懶載入**: 只載入實際使用的 Provider
- **查詢優化**: 只查詢需要的欄位
- **結果分頁**: 支援大結果集的分頁處理

### 3. 快取策略

- **查詢結果快取**: Middleware 層實現
- **連線重用**: 連線池自動管理
- **元數據快取**: 表結構等元數據快取

## 安全性考量

### 1. SQL 注入防護

所有 Provider 使用參數化查詢：

```typescript
// 自動參數化，防止 SQL 注入
const users = await userRepo.findMany({
  field: 'email',
  op: '=',
  value: userInput  // 自動轉義
});
```

### 2. 連線安全

- **SSL/TLS 支援**: 所有資料庫 Provider 支援加密連線
- **認證管理**: 支援多種認證方式
- **權限控制**: Middleware 層實現細粒度權限控制

### 3. 資料驗證

- **輸入驗證**: Middleware 層實現資料驗證
- **型別安全**: TypeScript 提供編譯時型別檢查
- **範圍檢查**: 自動驗證資料範圍和格式

這個架構設計確保了 Data Gateway 的靈活性、可擴展性和可維護性，同時提供了優秀的效能和安全性。