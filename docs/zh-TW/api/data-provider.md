# DataProvider 與資料來源

## 什麼是 DataProvider？

`DataProvider` 是 [Data Gateway](../architecture.md) 中負責與實際資料來源（如資料庫、遠端 API）進行溝通的抽象層。它定義了一個標準化的介面，讓 [`Repository`](./repository.md) 可以用統一的方式來執行查詢，而無需關心底層資料來源的具體實作細節。

每種不同的資料來源都需要一個對應的 `DataProvider` 實作。

## `DataProvider` 介面定義

所有 Provider 都必須實作此介面。

```typescript
interface DataProvider {
  /**
   * 連接到資料來源。
   * 對於資料庫，這通常意味著建立一個連線池或單一連線。
   * 對於無狀態的 API，此方法可能為空。
   */
  connect(): Promise<void>;

  /**
   * 斷開與資料來源的連線。
   * 釋放資料庫連線或執行其他清理工作。
   */
  disconnect(): Promise<void>;

  /**
   * 執行一個查詢。
   * 這是 Provider 的核心方法，它接收一個標準的 `Query` 物件，
   * 將其轉換為特定資料來源的原生查詢語言（如 SQL），
   * 然後執行並將結果封裝成標準的 `QueryResult` 物件回傳。
   * @param query 標準化的查詢物件。
   * @returns 一個包含查詢結果的 `QueryResult` 物件。
   */
  query<T = any>(query: Query): Promise<QueryResult<T>>;
}
```

## 內建 Provider

Data Gateway 內建了三種常用的 Provider：

### `MySQLProvider`
- **用途**: 連接 MySQL 或 MariaDB 資料庫。
- **依賴**: 需要安裝 `mysql2` 套件 (`npm install mysql2`)。
- **設定選項 (`MySQLProviderOptions`)**: 繼承自 `mysql2/promise` 的 `ConnectionOptions`，您可以傳入 `host`, `user`, `password`, `database` 等所有 `mysql2` 支援的選項。

### `SQLiteProvider`
- **用途**: 連接 SQLite 資料庫檔案。
- **依賴**: 需要安裝 `sqlite` 和 `sqlite3` 套件 (`npm install sqlite sqlite3`)。
- **設定選項 (`SQLiteProviderOptions`)**:
  - `filename`: SQLite 資料庫檔案的路徑。

### `RemoteProvider`
- **用途**: 透過 HTTP POST 請求與遠端 RESTful API 進行通訊。它會將整個 [`Query`](./query-object.md) 物件作為 JSON payload 發送到指定的端點。
- **依賴**: 使用內建的 `fetch` API，無需額外依賴。
- **設定選項 (`RemoteProviderOptions`)**:
  - `endpoint`: 遠端 API 的 URL。
  - `bearerToken` (可選): 用於 `Authorization` 標頭的 Bearer Token。

## 自訂 Provider 範例

您可以透過實作 `DataProvider` 介面來建立自己的 Provider，以支援任何您需要的資料來源，例如 PostgreSQL、MongoDB 或其他雲端服務。

```typescript
import { DataProvider, Query, QueryResult } from '@wfp99/data-gateway';

class MyCustomProvider implements DataProvider {
  constructor(private options: any) {
    // ... 初始化設定 ...
  }

  async connect(): Promise<void> {
    console.log('Connecting to custom data source...');
    // ... 連線邏輯 ...
  }

  async disconnect(): Promise<void> {
    console.log('Disconnecting from custom data source...');
    // ... 斷線邏輯 ...
  }

  async query<T = any>(query: Query): Promise<QueryResult<T>> {
    console.log('Executing query on custom data source:', query);
    // 1. 根據 query 物件，產生對應的查詢指令
    // 2. 執行查詢
    // 3. 將查詢結果轉換為 QueryResult<T> 格式
    // 範例：
    if (query.type === 'SELECT') {
      // const results = await myCustomApiClient.get(...);
      // return { rows: results };
    }
    return { error: 'Not implemented' };
  }
}
```

## 如何設定 Provider

在 [`DataGateway`](./data-gateway.md) 的設定檔中，於 `providers` 物件內定義您要使用的所有資料來源。

```typescript
const config = {
  providers: {
    // 給這個 provider 一個名稱，例如 'mainDb'
    mainDb: {
      type: 'mysql', // 指定要使用的 provider 類型
      options: { host: 'localhost', user: 'root', database: 'test' }
    },
    // 另一個 provider
    analyticsDb: {
      type: 'sqlite',
      options: { filename: './analytics.db' }
    },
    // 遠端服務
    remoteApi: {
      type: 'remote',
      options: { endpoint: 'https://api.example.com/data' }
    },
    // 自訂的 provider
    myProvider: {
      type: 'custom',
      options: { provider: new MyCustomProvider({ apiKey: '...' }) }
    }
  },
  repositories: {
    // ... 在 repository 中透過名稱引用 provider ...
    user: { provider: 'mainDb', table: 'users' },
    event: { provider: 'analyticsDb', table: 'events' }
  }
};
```

---

詳細參見 [Repository 與查詢物件](./repository.md) 與 [QueryObject](./query-object.md)。
