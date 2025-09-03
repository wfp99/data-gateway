# Data Gateway

[English](./README.md) | [繁體中文](./README.zh-TW.md)

[![NPM version](https://img.shields.io/npm/v/@wfp99/data-gateway.svg)](https://www.npmjs.com/package/@wfp99/data-gateway)
[![License](https://img.shields.io/npm/l/@wfp99/data-gateway.svg)](./LICENSE)

一個輕量級、可擴展的 Node.js 資料存取閘道，支援多種資料來源（MySQL、SQLite、遠端 API）、自訂資料提供者和 middleware。非常適合建構現代、資料驅動的應用程式。

## 功能特性

- 支援多種資料來源：MySQL、SQLite、遠端 API
- 可自訂的資料提供者和 middleware
- 型別安全，使用 TypeScript 編寫
- 統一的查詢物件模型，支援 CRUD 和進階查詢
- 易於擴展和整合

## 安裝

```bash
# 安裝核心函式庫
npm install @wfp99/data-gateway

# 接著，安裝您想使用的資料庫驅動程式。
# 這些是 peer dependencies，讓您可以只安裝您需要的套件。
npm install mysql2
# 或
npm install sqlite sqlite3
```

## 快速入門

```typescript
import { DataGateway, MySQLProviderOptions, SQLiteProviderOptions, RemoteProviderOptions } from '@wfp99/data-gateway';

// 定義提供者和儲存庫的設定
const config = {
	providers: {
		// MySQL 提供者設定
		mysql: {
			type: 'mysql',
			options: {
				host: 'localhost',
				user: 'root',
				password: '',
				database: 'test'
			} as MySQLProviderOptions
		},
		// SQLite 提供者設定
		sqlite: {
			type: 'sqlite',
			options: { filename: './test.db' } as SQLiteProviderOptions
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
		// 使用 SQLite 的日誌儲存庫
		log: { provider: 'sqlite', table: 'logs' },
        // 使用遠端 API 的產品儲存庫
        product: { provider: 'remote' }
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

	// 完成後斷開所有資料提供者的連線
	await gateway.disconnectAll();
})();
```

## 說明文件

更詳細的資訊請參閱[說明文件](./docs/zh-TW/index.md)。

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

const newUserId = await userRepo.insert({
    name: 'John Doe',
    email: 'john.doe@example.com',
    age: 30,
    status: 'active'
});

console.log(`已建立新使用者，ID 為: ${newUserId}`);
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

- MySQL (需要 `mysql2`)
- SQLite (需要 `sqlite3`)
- 遠端 API (透過 `RemoteProvider`)
- 自訂資料提供者

## 授權

MIT License

## 貢獻

歡迎在 [GitHub](https://github.com/wfp99/data-gateway) 上提出 Issue 和 Pull Request。

## 作者

Wang Feng Ping