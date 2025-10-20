# DataGateway API 參考

`DataGateway` 是 Data Gateway 的核心類別，作為資料存取的中央協調器，整合多個資料提供者和儲存庫。

## 類別定義

```typescript
export class DataGateway {
  private providers: Map<string, DataProvider>;
  private repositories: Map<string, Repository<any>>;

  // 私有建構子，使用 build() 靜態方法建立實例
  private constructor();

  // 靜態建構方法
  static async build(config: DataGatewayConfig): Promise<DataGateway>;

  // 取得儲存庫
  getRepository<T = any>(name: string): Repository<T> | undefined;

  // 取得資料提供者
  getProvider(name: string): DataProvider | undefined;

  // 連線池狀態管理
  getProviderPoolStatus(providerName: string): ConnectionPoolStatus | undefined;
  getAllPoolStatuses(): Map<string, ConnectionPoolStatus>;

  // 連線管理
  async disconnectAll(): Promise<void>;
}
```

## 設定介面

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

## 靜態方法

### build()

建立並初始化 DataGateway 實例。

```typescript
static async build(config: DataGatewayConfig): Promise<DataGateway>
```

**參數:**
- `config`: DataGatewayConfig - 完整的設定物件

**回傳值:**
- `Promise<DataGateway>` - 初始化完成的 DataGateway 實例

**範例:**
```typescript
const config = {
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        user: 'root',
        password: 'password',
        database: 'testdb'
      }
    }
  },
  repositories: {
    users: { provider: 'mysql', table: 'users' }
  }
};

const gateway = await DataGateway.build(config);
```

**錯誤處理:**
- 如果任何 Provider 連線失敗，會拋出錯誤並清理已建立的連線
- 錯誤格式: `[DataGateway] Build failed: {具體錯誤訊息}`

## 實例方法

### getRepository()

透過名稱取得儲存庫實例。

```typescript
getRepository<T = any>(name: string): Repository<T> | undefined
```

**參數:**
- `name`: string - 儲存庫名稱（在設定中定義）

**回傳值:**
- `Repository<T> | undefined` - 儲存庫實例，如果找不到則回傳 undefined

**範例:**
```typescript
const userRepo = gateway.getRepository('users');
if (userRepo) {
  const users = await userRepo.findMany();
  console.log(users);
}

// 使用泛型指定類型
interface User {
  id: number;
  name: string;
  email: string;
}

const typedUserRepo = gateway.getRepository<User>('users');
```

### getProvider()

透過名稱取得資料提供者實例。

```typescript
getProvider(name: string): DataProvider | undefined
```

**參數:**
- `name`: string - 提供者名稱（在設定中定義）

**回傳值:**
- `DataProvider | undefined` - 資料提供者實例，如果找不到則回傳 undefined

**範例:**
```typescript
const mysqlProvider = gateway.getProvider('mysql');
if (mysqlProvider) {
  console.log('MySQL 提供者可用');

  // 檢查是否支援連線池
  if (mysqlProvider.supportsConnectionPooling?.()) {
    console.log('支援連線池');
  }
}
```

### getProviderPoolStatus()

取得特定提供者的連線池狀態。

```typescript
getProviderPoolStatus(providerName: string): ConnectionPoolStatus | undefined
```

**參數:**
- `providerName`: string - 提供者名稱

**回傳值:**
- `ConnectionPoolStatus | undefined` - 連線池狀態，如果提供者不存在或不支援連線池則回傳 undefined

**範例:**
```typescript
const poolStatus = gateway.getProviderPoolStatus('mysql');
if (poolStatus) {
  console.log(`總連線數: ${poolStatus.totalConnections}`);
  console.log(`使用中: ${poolStatus.activeConnections}`);
  console.log(`閒置: ${poolStatus.idleConnections}`);
  console.log(`最大: ${poolStatus.maxConnections}`);
}
```

### getAllPoolStatuses()

取得所有支援連線池的提供者狀態。

```typescript
getAllPoolStatuses(): Map<string, ConnectionPoolStatus>
```

**回傳值:**
- `Map<string, ConnectionPoolStatus>` - 包含提供者名稱和對應連線池狀態的 Map

**範例:**
```typescript
const allStatuses = gateway.getAllPoolStatuses();
for (const [providerName, status] of allStatuses) {
  console.log(`${providerName} 連線池:`);
  console.log(`  使用中: ${status.activeConnections}/${status.maxConnections}`);
  console.log(`  閒置: ${status.idleConnections}`);
}
```

### disconnectAll()

關閉所有已註冊的資料提供者連線。

```typescript
async disconnectAll(): Promise<void>
```

**回傳值:**
- `Promise<void>` - 所有連線關閉完成後解析

**範例:**
```typescript
// 應用程式關閉時的優雅清理
process.on('SIGTERM', async () => {
  console.log('正在關閉應用程式...');
  await gateway.disconnectAll();
  console.log('所有資料庫連線已關閉');
  process.exit(0);
});

// 或在 try-finally 區塊中使用
try {
  // 執行資料庫操作
  const result = await userRepo.findMany();
} finally {
  await gateway.disconnectAll();
}
```

## 支援的提供者類型

### 內建提供者

```typescript
// MySQL 提供者
{
  type: 'mysql',
  options: MySQLProviderOptions
}

// PostgreSQL 提供者
{
  type: 'postgresql',
  options: PostgreSQLProviderOptions
}

// SQLite 提供者
{
  type: 'sqlite',
  options: SQLiteProviderOptions
}

// Remote API 提供者
{
  type: 'remote',
  options: RemoteProviderOptions
}

// 自訂提供者
{
  type: 'custom',
  options: { provider: DataProvider }
}
```

## 連線池狀態介面

### ConnectionPoolStatus

```typescript
export interface ConnectionPoolStatus {
  /** 連線池中的總連線數 */
  totalConnections: number;
  /** 閒置連線數 */
  idleConnections: number;
  /** 使用中連線數 */
  activeConnections: number;
  /** 最大允許連線數 */
  maxConnections: number;
  /** 維持的最小閒置連線數（可選） */
  minConnections?: number;
}
```

## 錯誤處理

### 建構階段錯誤

```typescript
try {
  const gateway = await DataGateway.build(config);
} catch (error) {
  if (error.message.includes('Build failed')) {
    console.error('DataGateway 建構失敗:', error.message);

    // 常見錯誤類型
    if (error.message.includes('Provider')) {
      console.error('提供者設定錯誤');
    } else if (error.message.includes('connection')) {
      console.error('資料庫連線失敗');
    } else if (error.message.includes('Unknown provider type')) {
      console.error('未知的提供者類型');
    }
  }
}
```

### 常見錯誤訊息

1. **Unknown provider type**: 設定中指定了不支援的提供者類型
2. **Provider 'name' not found for repository 'repo'**: 儲存庫引用了不存在的提供者
3. **MySQL provider requires 'mysql2' package**: 缺少必要的資料庫驅動程式
4. **Connection failed for provider 'name'**: 特定提供者連線失敗

## 完整使用範例

```typescript
import {
  DataGateway,
  DataGatewayConfig,
  MySQLProviderOptions,
  SQLiteProviderOptions,
  RemoteProviderOptions
} from '@wfp99/data-gateway';

async function completeExample() {
  const config: DataGatewayConfig = {
    providers: {
      // MySQL 提供者含連線池
      mysql: {
        type: 'mysql',
        options: {
          host: 'localhost',
          user: 'root',
          password: 'password',
          database: 'app_db',
          pool: {
            usePool: true,
            connectionLimit: 10,
            acquireTimeout: 60000,
            timeout: 600000
          }
        } as MySQLProviderOptions
      },

      // SQLite 提供者
      sqlite: {
        type: 'sqlite',
        options: {
          filename: './app.db',
          pool: {
            usePool: true,
            maxReadConnections: 3,
            enableWAL: true
          }
        } as SQLiteProviderOptions
      },

      // 遠端 API 提供者
      api: {
        type: 'remote',
        options: {
          endpoint: 'https://api.example.com/data',
          bearerToken: process.env.API_TOKEN
        } as RemoteProviderOptions
      }
    },

    repositories: {
      users: { provider: 'mysql', table: 'users' },
      sessions: { provider: 'sqlite', table: 'sessions' },
      products: { provider: 'api', table: 'products' }
    }
  };

  try {
    // 建立 Gateway
    const gateway = await DataGateway.build(config);
    console.log('✅ DataGateway 建立成功');

    // 使用儲存庫
    const userRepo = gateway.getRepository('users');
    const users = await userRepo?.findMany();
    console.log(`找到 ${users?.length} 位使用者`);

    // 監控連線池
    const mysqlStatus = gateway.getProviderPoolStatus('mysql');
    if (mysqlStatus) {
      console.log(`MySQL 連線池: ${mysqlStatus.activeConnections}/${mysqlStatus.maxConnections}`);
    }

    // 取得所有連線池狀態
    const allStatuses = gateway.getAllPoolStatuses();
    console.log(`監控 ${allStatuses.size} 個連線池`);

    // 清理資源
    await gateway.disconnectAll();
    console.log('✅ 所有連線已關閉');

  } catch (error) {
    console.error('❌ 執行失敗:', error);
  }
}

completeExample();
```

## 相關文件

- [Repository API](./repository.md) - 儲存庫操作詳細說明
- [DataProvider API](./data-provider.md) - 資料提供者介面
- [Query Object API](#query-object-api) - 查詢物件詳細說明
- [連線池管理](../advanced/connection-pooling.md) - 連線池詳細設定
- [錯誤處理](../advanced/error-handling.md) - 錯誤處理最佳實務

---

## Query Object API

### Query 介面

`Query` 物件描述一個 SQL 查詢操作（SELECT/INSERT/UPDATE/DELETE），支援欄位選擇、條件、JOIN、GROUP BY、ORDER BY、分頁等功能。

```typescript
export interface Query {
  /** 查詢類型：SELECT/INSERT/UPDATE/DELETE */
  type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

  /** 目標資料表名稱 */
  table: string;

  /** 要查詢或操作的欄位（可包含聚合函數） */
  fields?: (string | Aggregate)[];

  /** 要插入或更新的資料（用於 INSERT/UPDATE） */
  values?: Record<string, any>;

  /** 查詢條件 */
  where?: Condition;

  /** JOIN 設定 */
  joins?: Join[];

  /** GROUP BY 欄位 */
  groupBy?: string[];

  /** ORDER BY 設定 */
  orderBy?: { field: string; direction: 'ASC' | 'DESC' }[];

  /** 限制回傳列數 */
  limit?: number;

  /** 分頁偏移量 */
  offset?: number;
}
```

### Join 介面

描述 JOIN 操作，定義 JOIN 類型、目標資料表或 repository，以及連接條件。

```typescript
export interface Join {
  /** JOIN 類型 */
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';

  /** JOIN 來源（可使用 repository 名稱或資料表名稱） */
  source: JoinSource;

  /** JOIN 條件 */
  on: Condition;
}

export type JoinSource =
  | { repository: string }   // 引用 repository 名稱（推薦）
  | { table: string };        // 直接引用資料表名稱
```

#### JoinSource 說明

`JoinSource` 支援兩種方式指定 JOIN 的目標：

**1. 使用 repository 名稱（推薦）**

```typescript
{
  type: 'INNER',
  source: { repository: 'users' },
  on: { field: 'user_id', op: '=', value: 'users.id' }
}
```

優點：
- 自動使用該 repository 的 EntityFieldMapper
- 程式碼更易維護
- 保持一致性

**2. 直接使用資料表名稱**

```typescript
{
  type: 'LEFT',
  source: { table: 'user_profiles' },
  on: { field: 'user_id', op: '=', value: 'user_profiles.user_id' }
}
```

使用時機：
- 資料表未定義為 repository
- 臨時表或視圖
- 不需要欄位對應的情況

#### JOIN 類型支援

不同資料庫對 JOIN 類型的支援有差異：

| JOIN 類型 | MySQL | PostgreSQL | SQLite | 說明 |
|-----------|-------|------------|--------|------|
| INNER     | ✅    | ✅         | ✅     | 內部連接 |
| LEFT      | ✅    | ✅         | ✅     | 左外連接 |
| RIGHT     | ✅    | ✅         | ✅     | 右外連接 |
| FULL      | ❌    | ✅         | ❌     | 完全外連接 |

**重要提示：** 使用 `FULL` 類型前請確認您的資料庫支援。

### Condition 類型

描述 SQL WHERE 條件，支援基本運算子、AND/OR/NOT、IN、LIKE 等。

```typescript
export type Condition =
  // 基本比較運算
  | { field: string; op: '=' | '!=' | '>' | '<' | '>=' | '<='; value: any }

  // IN/NOT IN（使用子查詢）
  | { field: string; op: 'IN' | 'NOT IN'; subquery: Query }

  // IN/NOT IN（使用值陣列）
  | { field: string; op: 'IN' | 'NOT IN'; values: any[] }

  // AND 條件
  | { and: Condition[] }

  // OR 條件
  | { or: Condition[] }

  // NOT 條件
  | { not: Condition }

  // LIKE 模糊查詢
  | { like: { field: string; pattern: string } };
```

### Aggregate 介面

描述聚合函數，指定聚合類型、目標欄位和別名。

```typescript
export interface Aggregate {
  /** 聚合類型 */
  type: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';

  /** 目標欄位 */
  field: string;

  /** 結果別名（可選） */
  alias?: string;
}
```

### QueryResult 介面

描述查詢結果，適用於各種 CRUD 操作和不同類型的資料庫。

```typescript
export interface QueryResult<T = any> {
  /** SELECT 查詢結果資料列 */
  rows?: T[];

  /** INSERT、UPDATE 或 DELETE 操作影響的資料列數 */
  affectedRows?: number;

  /** 新插入資料的主鍵值（某些資料庫支援） */
  insertId?: number | string;

  /** 查詢失敗時的錯誤訊息 */
  error?: string;
}
```

### JOIN 使用範例

#### 基本 JOIN 查詢

```typescript
// 使用 repository 名稱（推薦）
const query: Query = {
  type: 'SELECT',
  table: 'orders',
  fields: ['orders.id', 'orders.total', 'users.name', 'users.email'],
  joins: [
    {
      type: 'INNER',
      source: { repository: 'users' },
      on: { field: 'user_id', op: '=', value: 'users.id' }
    }
  ],
  where: { field: 'orders.status', op: '=', value: 'completed' }
};

const result = await orderRepo.query(query);
```

#### 多個 JOIN

```typescript
const query: Query = {
  type: 'SELECT',
  table: 'orders',
  fields: [
    'orders.id',
    'users.name',
    'products.name',
    'products.price'
  ],
  joins: [
    {
      type: 'INNER',
      source: { repository: 'users' },
      on: { field: 'user_id', op: '=', value: 'users.id' }
    },
    {
      type: 'LEFT',
      source: { repository: 'products' },
      on: { field: 'product_id', op: '=', value: 'products.id' }
    }
  ]
};
```

#### 使用資料表名稱的 JOIN

```typescript
const query: Query = {
  type: 'SELECT',
  table: 'orders',
  fields: ['orders.id', 'profiles.address'],
  joins: [
    {
      type: 'LEFT',
      source: { table: 'user_profiles' },
      on: { field: 'user_id', op: '=', value: 'user_profiles.user_id' }
    }
  ]
};
```

### 從舊版遷移

舊版 JOIN 語法直接使用 `table` 屬性，新版使用 `source` 物件：

```typescript
// ❌ 舊版語法（已棄用）
joins: [{
  type: 'INNER',
  table: 'users',
  on: { ... }
}]

// ✅ 新版語法
joins: [{
  type: 'INNER',
  source: { table: 'users' },
  on: { ... }
}]

// ✅ 推薦使用 repository
joins: [{
  type: 'INNER',
  source: { repository: 'users' },
  on: { ... }
}]
```
