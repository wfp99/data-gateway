# Data Gateway

[English](./README.md) | [繁體中文](./README.zh-TW.md)

[![NPM version](https://img.shields.io/npm/v/@wfp99/data-gateway.svg)](https://www.npmjs.com/package/@wfp99/data-gateway)
[![License](https://img.shields.io/npm/l/@wfp99/data-gateway.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-238%20passing-brightgreen.svg)](./src)

一個輕量級、可擴展、**型別安全**的 Node.js 資料存取閘道。支援多種資料來源（MySQL、PostgreSQL、SQLite、遠端 API）、自訂資料提供者和中介軟體。非常適合建構現代、資料驅動的應用程式。

## ✨ 主要功能

- 🎯 **型別安全**: 完整的 TypeScript 支援,編譯時期錯誤檢測
- 🔄 **流暢 API**: QueryBuilder 模式,直觀的鏈式呼叫
- 🔍 **智慧警告**: 自動偵測 JOIN 查詢中的欄位衝突
- �� **多資料來源**: 支援 MySQL、PostgreSQL、SQLite、遠端 API
- �� **可擴展**: 輕鬆新增自訂資料提供者
- 🎭 **中介軟體**: 支援請求/回應攔截
- 📦 **輕量級**: 核心程式碼 < 15KB (壓縮後)
- 🧪 **高測試覆蓋**: 238 個測試全部通過，11 個測試套件

## 安裝

```bash
# 安裝核心函式庫
npm install @wfp99/data-gateway

# 依需求安裝資料庫驅動程式（延遲載入）
npm install mysql2              # MySQL 支援
npm install pg @types/pg        # PostgreSQL 支援
npm install sqlite3             # SQLite 支援
# 遠端 API 不需要額外依賴 🎉
```

**延遲載入**: 只需安裝實際使用的驅動程式。函式庫會按需匯入提供者。

## 快速入門

```typescript
import { DataGateway, MySQLProviderOptions } from '@wfp99/data-gateway';

const config = {
  providers: {
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'test'
      } as MySQLProviderOptions
    }
  },
  repositories: {
    user: { provider: 'mysql', table: 'users' }
  }
};

const gateway = await DataGateway.build(config);
const userRepo = gateway.getRepository('user');

// 查詢活躍使用者
const users = await userRepo?.find({ 
  where: { field: 'status', op: '=', value: 'active' } 
});

await gateway.disconnectAll();
```

## 型別安全功能 (2025-10) ✨

### 1. FieldReference 型別系統

具有 IDE 自動完成的型別安全欄位引用：

```typescript
import { tableField, repoField } from '@wfp99/data-gateway';

// 之前：容易出錯的字串
await userRepo.find({ fields: ['users.id', 'users.name'] });

// 現在：型別安全的引用
await userRepo.find({
  fields: [
    tableField('users', 'id'),      // 自動完成
    tableField('users', 'name')
  ]
});
```

### 2. QueryBuilder 模式

用於複雜查詢的流暢 API：

```typescript
import { QueryBuilder } from '@wfp99/data-gateway';

const query = new QueryBuilder('users')
  .select('id', 'name', 'email')
  .where(w => w
    .equals('status', 'active')
    .greaterThan('age', 18)
  )
  .orderBy('createdAt', 'DESC')
  .limit(10)
  .build();

const users = await userRepo.find(query);
```

### 3. 欄位衝突檢測

自動警告 JOIN 查詢中的模糊欄位：

```typescript
// ⚠️ 觸發警告
await userRepo.find({
  fields: ['id', 'name'],  // 哪個資料表的 'id'？
  joins: [{ type: 'LEFT', source: { repository: 'posts' }, ... }]
});

// ✅ 解決方案：使用前綴欄位
await userRepo.find({
  fields: [tableField('users', 'id'), tableField('posts', 'title')]
});
```

**了解更多**: [型別安全指南](./docs/guides/type-safety-2025-10.zh-TW.md)

## 核心概念

- **DataGateway**: 提供者和儲存庫的中央協調器
- **DataProvider**: 資料來源的抽象介面（MySQL、PostgreSQL、SQLite、遠端 API）
- **Repository**: 特定資料表的 CRUD 和查詢操作
- **QueryObject**: 統一的查詢格式，支援條件、分頁、排序、聚合
- **Middleware**: 攔截和處理查詢（驗證、日誌、快取）
- **EntityFieldMapper**: 資料庫欄位與應用程式屬性之間的轉換

## CRUD 操作

### 建立

```typescript
const userId = await userRepo.insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30
});
```

### 讀取

```typescript
const users = await userRepo.find({
  fields: ['id', 'name', 'email'],
  where: {
    and: [
      { field: 'status', op: '=', value: 'active' },
      { field: 'age', op: '>', value: 18 }
    ]
  },
  orderBy: [{ field: 'createdAt', direction: 'DESC' }],
  limit: 10
});
```

### 更新

```typescript
const affected = await userRepo.update(
  { status: 'inactive' },
  { field: 'id', op: '=', value: userId }
);
```

### 刪除

```typescript
const deleted = await userRepo.delete(
  { field: 'id', op: '=', value: userId }
);
```

## 進階功能

### JOIN 查詢

```typescript
const orders = await orderRepo.find({
  fields: ['id', 'total', 'user.name', 'user.email'],
  joins: [{
    type: 'INNER',
    source: { repository: 'users' },
    on: { field: 'user_id', op: '=', value: 'users.id' }
  }],
  where: { field: 'status', op: '=', value: 'completed' }
});
```

**支援的 JOIN 類型**: INNER, LEFT, RIGHT, FULL（MySQL/SQLite 不支援 FULL）

### 中介軟體

```typescript
import { Middleware } from '@wfp99/data-gateway';

const loggingMiddleware: Middleware = async (query, next) => {
  console.log('Query:', query);
  const result = await next(query);
  console.log('Result:', result);
  return result;
};

// 附加到儲存庫
repositories: {
  user: {
    provider: 'mysql',
    table: 'users',
    middlewares: [loggingMiddleware]
  }
}
```

### 連線池

```typescript
providers: {
  mysql: {
    type: 'mysql',
    options: {
      // ... 連線選項
      pool: {
        usePool: true,          // 啟用連線池（預設：true）
        connectionLimit: 10,    // 最大連線數（預設：10）
        acquireTimeout: 60000,  // 超時時間（預設：60000ms）
        timeout: 600000         // 閒置超時（預設：600000ms）
      }
    }
  }
}

// 監控連線池狀態
const status = gateway.getProviderPoolStatus('mysql');
console.log(`連線池: ${status.activeConnections}/${status.maxConnections}`);
```

### 日誌

```typescript
import { LogLevel } from '@wfp99/data-gateway';

const config = {
  // ...
  logging: {
    level: LogLevel.INFO,  // ALL, DEBUG, INFO, WARN, ERROR, OFF
    format: 'pretty'       // 'pretty' 或 'json'
  }
};
```

## 說明文件

📚 **[完整說明文件](./docs/README.zh-TW.md)**

### 指南
- [快速入門指南](./docs/guides/quick-start.zh-TW.md) - 5 分鐘快速上手
- [基本使用方法](./docs/guides/basic-usage.zh-TW.md) - 常用模式
- [型別安全](./docs/guides/type-safety-2025-10.zh-TW.md) - FieldReference 與 QueryBuilder
- [日誌功能](./docs/guides/logging.zh-TW.md) - 配置日誌
- [連線池管理](./docs/advanced/connection-pooling.zh-TW.md) - 效能優化

### 提供者
- [MySQL](./docs/providers/mysql.zh-TW.md)
- [PostgreSQL](./docs/providers/postgresql.zh-TW.md)
- [SQLite](./docs/providers/sqlite.zh-TW.md)
- [遠端 API](./docs/providers/remote.zh-TW.md)
- [自訂提供者](./docs/providers/custom.zh-TW.md)

### API 參考
- [DataGateway API](./docs/api/data-gateway.zh-TW.md)
- [架構設計](./docs/core/architecture.zh-TW.md)

## 自訂提供者

實作 `DataProvider` 介面：

```typescript
import { DataProvider, PreparedQuery, QueryResult } from '@wfp99/data-gateway';

class CustomProvider implements DataProvider {
  async connect(): Promise<void> { /* ... */ }
  async disconnect(): Promise<void> { /* ... */ }
  async executeQuery<T = any>(query: PreparedQuery): Promise<QueryResult<T>> { /* ... */ }
}
```

## 支援的資料來源

| 提供者 | 需要的套件 | 狀態 |
|----------|------------------|--------|
| MySQL | `mysql2` | ✅ 穩定 |
| PostgreSQL | `pg`, `@types/pg` | ✅ 穩定 |
| SQLite | `sqlite3` | ✅ 穩定 |
| 遠端 API | 無 | ✅ 穩定 |
| 自訂 | 實作介面 | ✅ 支援 |

## 需求

- **Node.js**: >= 18.0.0
- **TypeScript**: >= 5.0.0（可選）

## 授權

MIT License - 查看 [LICENSE](./LICENSE)

## 貢獻

歡迎在 [GitHub](https://github.com/wfp99/data-gateway) 上提出 Issue 和 Pull Request。

## 作者

Wang Feng Ping

---

**最新更新**: 2025 年 10 月 - FieldReference、QueryBuilder 和欄位衝突檢測的型別安全改進。[更新日誌](./CHANGELOG-2025-10.zh-TW.md)
