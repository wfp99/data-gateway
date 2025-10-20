# Data Gateway

[English](./README.md) | [繁體中文](./README.zh-TW.md)

[![NPM version](https://img.shields.io/npm/v/@wfp99/data-gateway.svg)](https://www.npmjs.com/package/@wfp99/data-gateway)
[![License](https://img.shields.io/npm/l/@wfp99/data-gateway.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-251%20passing-brightgreen.svg)](./src)

一個輕量級、可擴展、**型別安全**的 Node.js 資料存取閘道,支援多種資料來源 (MySQL、PostgreSQL、SQLite、遠端 API)、自訂資料提供者和中介軟體。非常適合建構現代、資料驅動的應用程式。

## ✨ 主要功能

- 🎯 **型別安全**: 完整的 TypeScript 支援,編譯時期錯誤檢測
- 🔄 **流暢 API**: QueryBuilder 模式,直觀的鏈式呼叫
- 🔍 **智慧警告**: 自動偵測 JOIN 查詢中的欄位衝突
- 🚀 **多資料來源**: 支援 MySQL、PostgreSQL、SQLite、遠端 API
- 🔌 **可擴展**: 輕鬆新增自訂資料提供者
- 🎭 **中介軟體**: 支援請求/回應攔截
- 📦 **輕量級**: 核心程式碼 < 15KB (壓縮後)
- 🧪 **高測試覆蓋**: 251 個測試全部通過

## 目錄

- [安裝](#安裝)
- [快速入門](#快速入門)
- [2025-10 版本更新:型別安全改進](#2025-10-版本更新型別安全改進)
  - [FieldReference 型別系統](#fieldreference-型別系統)
  - [QueryBuilder 模式](#querybuilder-模式)
  - [欄位衝突檢測](#欄位衝突檢測)
- [CRUD 操作](#crud-操作)
- [查詢功能](#查詢功能)
- [JOIN 查詢](#join-查詢)
- [中介軟體使用](#中介軟體使用)
- [欄位對應](#欄位對應)
- [多資料來源切換](#多資料來源切換)
- [錯誤處理](#錯誤處理)
- [效能最佳化](#效能最佳化)

## 安裝

```bash
# 安裝核心函式庫
npm install @wfp99/data-gateway

# 接著，只需安裝您實際要使用的資料庫驅動程式。
# 透過延遲載入技術，您只需要安裝實際使用的套件。

# 若需要 MySQL 支援：
npm install mysql2

# 若需要 PostgreSQL 支援：
npm install pg @types/pg

# 若需要 SQLite 支援：
npm install sqlite3

# 若只使用遠端 API（不需要額外依賴）：
# 您已經準備好了！🎉
```

### 延遲載入的優勢

- **只安裝需要的套件**：函式庫使用延遲載入技術，只在實際使用時才匯入資料庫提供者
- **無強制依賴**：您可以使用 RemoteProvider 而不需要安裝任何資料庫驅動程式

## 快速入門

```typescript
import { DataGateway, LogLevel, MySQLProviderOptions, RemoteProviderOptions } from '@wfp99/data-gateway';

// 定義提供者和儲存庫的設定
const config = {
	providers: {
		// MySQL 提供者設定，包含連線池設定
		mysql: {
			type: 'mysql',
			options: {
				host: 'localhost',
				user: 'root',
				password: '',
				database: 'test',
				// 連線池設定（可選）
				pool: {
					usePool: true,          // 啟用連線池（預設：true）
					connectionLimit: 10,    // 連線池最大連線數（預設：10）
					acquireTimeout: 60000,  // 連線獲取超時時間（預設：60000ms）
					timeout: 600000,        // 閒置連線超時時間（預設：600000ms）
				}
			} as MySQLProviderOptions
		},
        // 遠端 API 提供者設定
        remote: {
            type: 'remote',
            options: {
                endpoint: 'https://api.example.com/data',
                bearerToken: 'your-secret-token'
            } as RemoteProviderOptions
        }
	},
	repositories: {
		// 使用 MySQL 的使用者儲存庫
		user: { provider: 'mysql', table: 'users' },
        // 使用遠端 API 的產品儲存庫
        product: { provider: 'remote' }
	},
	// 日誌配置（可選）
	logging: {
		level: LogLevel.INFO,     // 日誌級別：ALL, DEBUG, INFO, WARN, ERROR, OFF
		format: 'pretty'          // 格式：'pretty' 或 'json'
	}
};

(async () => {
	// 建立 DataGateway 實例
	const gateway = await DataGateway.build(config);

	// 取得 user 儲存庫
	const userRepo = gateway.getRepository('user');

	// 查詢活躍 user
	const users = await userRepo?.find({ where: { field: 'status', op: '=', value: 'active' } });

	// 對 user 進行操作
	console.log(users);

	// 監控連線池狀態
	const poolStatus = gateway.getProviderPoolStatus('mysql');
	if (poolStatus) {
		console.log(`MySQL 連線池: ${poolStatus.activeConnections}/${poolStatus.maxConnections} 個連線活躍中`);
	}

	// 完成後斷開所有資料提供者的連線
	await gateway.disconnectAll();
})();
```

## 2025-10 版本更新:型別安全改進 ✨

### FieldReference 型別系統

使用新的型別安全欄位引用系統,提供更好的開發體驗:

```typescript
import { tableField, repoField } from '@wfp99/data-gateway';

// 之前: 容易拼錯的字串格式
await userRepo.find({
  fields: ['users.id', 'users.name'],
  where: { field: 'status', op: '=', value: 'active' }
});

// 現在: 型別安全的 FieldReference
await userRepo.find({
  fields: [
    tableField('users', 'id'),      // IDE 自動完成
    tableField('users', 'name')
  ],
  where: {
    field: tableField('users', 'status'),
    op: '=',
    value: 'active'
  }
});

// 使用 repository 前綴 (自動處理欄位映射)
await userRepo.find({
  fields: [
    repoField('user', 'userId'),    // 自動映射為 user_id
    repoField('user', 'userName')   // 自動映射為 user_name
  ]
});
```

### QueryBuilder 模式

使用流暢的 API 建構複雜查詢:

```typescript
import { QueryBuilder, tableField } from '@wfp99/data-gateway';

// 簡單查詢
const query = new QueryBuilder('users')
  .select('id', 'name', 'email')
  .where(w => w
    .equals('status', 'active')
    .greaterThan('age', 18)
  )
  .orderBy('createdAt', 'DESC')
  .limit(10)
  .build();

// 複雜的 JOIN 查詢
const complexQuery = new QueryBuilder('users')
  .select(
    tableField('users', 'id'),
    tableField('users', 'name'),
    tableField('posts', 'title')
  )
  .count('posts.id', 'postCount')
  .leftJoin(
    { table: 'posts' },
    on => on.equals(
      tableField('users', 'id'),
      tableField('posts', 'userId')
    )
  )
  .where(w => w
    .equals(tableField('users', 'status'), 'active')
    .or(or => or
      .equals(tableField('users', 'role'), 'admin')
      .equals(tableField('users', 'role'), 'moderator')
    )
  )
  .groupBy(tableField('users', 'id'))
  .orderBy(tableField('users', 'createdAt'), 'DESC')
  .limit(50)
  .build();

// 使用建構的查詢
const users = await userRepo.find(query);

// INSERT/UPDATE/DELETE 也支援
const insertQuery = QueryBuilder
  .insert('users', {
    name: 'John',
    email: 'john@example.com'
  })
  .build();

const updateQuery = QueryBuilder
  .update('users', { status: 'inactive' })
  .where(w => w.equals('id', 123))
  .build();
```

### 欄位衝突檢測

在 JOIN 查詢時自動偵測並警告欄位名稱衝突:

```typescript
// 這個查詢會觸發警告
await userRepo.find({
  fields: ['id', 'name'],  // 'id' 沒有加前綴
  joins: [{
    type: 'LEFT',
    source: { repository: 'posts' },
    on: { field: 'id', op: '=', value: 'posts.userId' }
  }]
});
// ⚠️ Warning: Field 'id' exists in multiple tables: ['users', 'posts'].
//    Consider using tableField('users', 'id') to avoid ambiguity.

// 解決方案: 使用 table-prefixed 欄位
await userRepo.find({
  fields: [
    tableField('users', 'id'),    // ✅ 不會警告
    tableField('users', 'name'),
    tableField('posts', 'title')
  ],
  joins: [{
    type: 'LEFT',
    source: { repository: 'posts' },
    on: { field: 'id', op: '=', value: 'posts.userId' }
  }]
});
```

**了解更多**: 詳細的功能說明和範例請參閱 [型別安全功能文件](./docs/guides/type-safety-2025-10.md)

---

## 說明文件

更詳細的資訊請參閱[說明文件](./docs/README.md)。

### 快速連結
- [安裝指南](./docs/guides/installation.md) - 詳細安裝說明
- [快速入門指南](./docs/guides/quick-start.md) - 5 分鐘快速上手
- [基本使用方法](./docs/guides/basic-usage.md) - 常用操作模式
- [日誌功能指南](./docs/guides/logging.md) - 配置和使用日誌系統
- [架構設計](./docs/core/architecture.md) - 理解核心概念
- [連線池管理](./docs/advanced/connection-pooling.md) - 進階效能功能

### 提供者指南
- [MySQL Provider](./docs/providers/mysql.md)
- [PostgreSQL Provider](./docs/providers/postgresql.md)
- [SQLite Provider](./docs/providers/sqlite.md)
- [Remote API Provider](./docs/providers/remote.md)
- [自訂 Provider](./docs/providers/custom.md)

### 其他指南
- [Date 物件處理](./docs/guides/date-handling.md) - Date 與資料庫的自動轉換

## 核心概念

- **DataProvider**: 資料來源的抽象介面。內建支援 MySQL、SQLite、RemoteProvider 和自訂提供者。
- **Repository**: 封裝特定資料表的 CRUD 和查詢邏輯。
- **Middleware**: 在查詢前後插入自訂邏輯（例如，驗證、日誌、快取）。
- **EntityFieldMapper**: 在資料庫資料列和應用程式物件之間進行轉換。它也會自動將查詢中使用的欄位名稱（例如 `where`、`orderBy`、`fields`）對應到資料庫的實際欄位名稱，讓您可以在程式碼中統一使用應用程式層級的屬性名稱。
- **QueryObject**: 統一的查詢物件格式，支援條件、分頁、排序、聚合等。


## 使用範例

`Repository` 為所有 CRUD 操作提供了一個簡單而強大的 API。

### 建立資料

```typescript
const userRepo = gateway.getRepository('user');

// 使用完整物件新增
const newUserId = await userRepo.insert({
    name: 'John Doe',
    email: 'john.doe@example.com',
    age: 30,
    status: 'active'
});

// 使用部分物件新增（允許使用資料庫預設值）
const anotherUserId = await userRepo.insert({
    name: 'Jane Smith',
    email: 'jane.smith@example.com'
    // age 和 status 將使用資料庫預設值（如果有定義的話）
});

console.log(`已建立新使用者，ID 為: ${newUserId}`);
console.log(`已建立另一位使用者，ID 為: ${anotherUserId}`);
```

### 讀取資料 (查詢)

`QueryObject` 提供了一種彈性且統一的方式來描述資料庫操作。以下是一個更複雜的查詢範例：

```typescript
// 查詢所有狀態為 active 且年齡大於 18 的使用者，
// 只選擇特定欄位，並依建立時間降冪排序，取得前 10 筆資料。
const userRepo = gateway.getRepository('user');
const users = await userRepo.find({
    fields: ['id', 'name', 'email'],
    where: {
        and: [
            { field: 'status', op: '=', value: 'active' },
            { field: 'age', op: '>', value: 18 }
        ]
    },
    orderBy: [{ field: 'createdAt', direction: 'DESC' }],
    limit: 10,
    offset: 0
});

console.log(users);
```

*注意：在上面的範例中，如果您為儲存庫設定了自訂的 `EntityFieldMapper`，像 `status`、`age` 和 `createdAt` 這樣的欄位名稱會被自動轉換成對應的資料庫欄位名稱（例如 `user_status`、`user_age`、`created_at`）。這讓您的應用程式碼保持簡潔，並與資料庫結構解耦。*

### 更新資料

```typescript
const userRepo = gateway.getRepository('user');

const affectedRows = await userRepo.update(
    { status: 'inactive' }, // 要更新的欄位值
    { field: 'id', op: '=', value: newUserId } // where 條件
);

console.log(`已更新 ${affectedRows} 位使用者。`);
```

### 刪除資料

```typescript
const userRepo = gateway.getRepository('user');

const deletedRows = await userRepo.delete(
    { field: 'id', op: '=', value: newUserId } // where 條件
);

console.log(`已刪除 ${deletedRows} 位使用者。`);
```

### JOIN 查詢

Data Gateway 支援資料表關聯查詢（JOIN），讓您可以從多個資料表中查詢相關資料。

```typescript
const orderRepo = gateway.getRepository('orders');

// 使用 repository 名稱進行 JOIN（推薦方式）
const ordersWithUsers = await orderRepo?.find({
  fields: ['id', 'order_date', 'total', 'user.name', 'user.email'],
  joins: [
    {
      type: 'INNER',
      source: { repository: 'users' },  // 引用另一個 repository
      on: { field: 'user_id', op: '=', value: 'users.id' }
    }
  ],
  where: { field: 'status', op: '=', value: 'completed' }
});

// 或直接使用資料表名稱進行 JOIN
const ordersWithProfiles = await orderRepo?.find({
  fields: ['id', 'order_date', 'profiles.address'],
  joins: [
    {
      type: 'LEFT',
      source: { table: 'user_profiles' },  // 直接指定資料表名稱
      on: { field: 'user_id', op: '=', value: 'user_profiles.user_id' }
    }
  ]
});

console.log('訂單及使用者資訊:', ordersWithUsers?.rows);
```

**支援的 JOIN 類型：**
- `INNER`: 內部連接，只返回兩個資料表中都匹配的記錄
- `LEFT`: 左外連接，返回左表所有記錄及右表匹配的記錄
- `RIGHT`: 右外連接，返回右表所有記錄及左表匹配的記錄
- `FULL`: 完全外連接（注意：MySQL 和 SQLite 不支援 FULL OUTER JOIN）

詳細使用方法請參考[基本使用方法](./docs/guides/basic-usage.md#join-查詢)。

## Middleware 範例

您可以加入 middleware 來攔截和處理查詢執行前後的邏輯。Middleware 對於日誌、驗證、快取等非常有用。

```typescript
import { Middleware } from '@wfp99/data-gateway';

// 範例：日誌 middleware
const loggingMiddleware: Middleware = async (query, next) => {
	console.log('Query:', query);
	const result = await next(query);
	console.log('Result:', result);
	return result;
};

// 在儲存庫設定中使用
const config = {
	providers: {
		// ...資料提供者設定
	},
	repositories: {
		user: {
			provider: 'mysql',
			table: 'users',
			middlewares: [loggingMiddleware] // 在此處附加 middleware
		}
	}
};
```

## 日誌功能

Data Gateway 提供完整的日誌功能，支援多種日誌級別和格式，幫助您監控和調試應用程式。

### 基本設定

```typescript
import { LogLevel } from '@wfp99/data-gateway';

const config = {
	providers: { /* ... */ },
	repositories: { /* ... */ },
	logging: {
		level: LogLevel.INFO,     // 設定日誌級別
		format: 'pretty'          // 'pretty' 或 'json'
	}
};

const gateway = await DataGateway.build(config);
```

### 日誌級別

```typescript
LogLevel.ALL    // 0  - 顯示所有日誌
LogLevel.DEBUG  // 10 - 除錯信息
LogLevel.INFO   // 20 - 一般信息（預設）
LogLevel.WARN   // 30 - 警告訊息
LogLevel.ERROR  // 40 - 錯誤訊息
LogLevel.OFF    // 50 - 關閉日誌
```

詳細的日誌配置和範例請參考[日誌功能指南](./docs/guides/logging.md)。



## 自訂資料提供者範例

```typescript
import { DataProvider, Query, QueryResult } from '@wfp99/data-gateway';

class CustomProvider implements DataProvider {
	async connect() { /* ... */ }
	async disconnect() { /* ... */ }
	async query<T = any>(query: Query): Promise<QueryResult<T>> { /* ... */ }
}
```

## 支援的資料來源

- **MySQL** (需要 `mysql2`)
- **PostgreSQL** (需要 `pg` 和 `@types/pg`)
- **SQLite** (需要 `sqlite3`)
- **遠端 API** (透過 `RemoteProvider`)
- **自訂資料提供者** (實現 `DataProvider` 介面)

## 授權

MIT License

## 貢獻

歡迎在 [GitHub](https://github.com/wfp99/data-gateway) 上提出 Issue 和 Pull Request。

## 作者

Wang Feng Ping