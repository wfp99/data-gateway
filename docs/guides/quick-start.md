# 快速入門指南

本指南將帶您在 5 分鐘內開始使用 Data Gateway！

## 第一步：安裝必要套件

```bash
# 安裝 Data Gateway
npm install @wfp99/data-gateway

# 安裝您需要的資料庫驅動程式（選擇其中一個或多個）
npm install mysql2        # MySQL/MariaDB
npm install pg @types/pg  # PostgreSQL
npm install sqlite sqlite3   # SQLite
# Remote API 無需額外安裝
```

## 第二步：建立基本設定

建立一個 `app.ts` 檔案：

```typescript
import {
  DataGateway,
  MySQLProviderOptions,
  SQLiteProviderOptions,
  PostgreSQLProviderOptions,
  RemoteProviderOptions
} from '@wfp99/data-gateway';

// 設定資料提供者和儲存庫
const config = {
  providers: {
    // MySQL 設定（含連線池）
    mysql: {
      type: 'mysql',
      options: {
        host: 'localhost',
        user: 'root',
        password: 'your_password',
        database: 'your_database',
        // 連線池設定（可選）
        pool: {
          usePool: true,          // 啟用連線池（預設：true）
          connectionLimit: 10,    // 最大連線數（預設：10）
          acquireTimeout: 60000,  // 連線取得超時（預設：60000ms）
          timeout: 600000,        // 閒置連線超時（預設：600000ms）
        }
      } as MySQLProviderOptions
    },

    // PostgreSQL 設定（含連線池）
    postgresql: {
      type: 'postgresql',
      options: {
        host: 'localhost',
        user: 'postgres',
        password: 'your_password',
        database: 'your_database',
        port: 5432,
        // 連線池設定（可選）
        pool: {
          usePool: true,                    // 啟用連線池（預設：true）
          max: 10,                         // 最大連線數（預設：10）
          min: 0,                          // 最小連線數（預設：0）
          idleTimeoutMillis: 10000,        // 閒置超時（預設：10000ms）
          connectionTimeoutMillis: 30000,  // 連線超時（預設：30000ms）
        }
      } as PostgreSQLProviderOptions
    },

    // SQLite 設定（含讀取連線池）
    sqlite: {
      type: 'sqlite',
      options: {
        filename: './database.db',
        // 讀取連線池設定（可選）
        pool: {
          usePool: true,              // 啟用讀取連線池（預設：false）
          maxReadConnections: 3,      // 最大讀取連線數（預設：3）
          enableWAL: true,           // 啟用 WAL 模式（預設：啟用池時為 true）
        }
      } as SQLiteProviderOptions
    },

    // 遠端 API 設定
    remote: {
      type: 'remote',
      options: {
        endpoint: 'https://api.example.com/data',
        bearerToken: 'your-api-token',  // 可選
        headers: {                      // 可選
          'Content-Type': 'application/json'
        }
      } as RemoteProviderOptions
    }
  },

  repositories: {
    // 使用者儲存庫（使用 MySQL）
    users: { provider: 'mysql', table: 'users' },
    // 訂單儲存庫（使用 PostgreSQL）
    orders: { provider: 'postgresql', table: 'orders' },
    // 日誌儲存庫（使用 SQLite）
    logs: { provider: 'sqlite', table: 'logs' },
    // 產品儲存庫（使用遠端 API）
    products: { provider: 'remote' }
  }
};

export default config;
```

## 第三步：基本使用範例

```typescript
async function main() {
  // 建立 DataGateway 實例
  const gateway = await DataGateway.build(config);

  try {
    // 取得使用者儲存庫
    const userRepo = gateway.getRepository('users');

    if (userRepo) {
      // === 建立資料 ===
      const newUserId = await userRepo.insert({
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
        status: 'active'
      });
      console.log(`新建使用者 ID: ${newUserId}`);

      // === 查詢資料 ===
      // 簡單查詢
      const activeUsers = await userRepo.findMany({
        field: 'status',
        op: '=',
        value: 'active'
      });
      console.log('活躍使用者:', activeUsers);

      // 複雜查詢
      const adultUsers = await userRepo.find({
        fields: ['id', 'name', 'email'],  // 指定欄位
        where: {
          and: [
            { field: 'status', op: '=', value: 'active' },
            { field: 'age', op: '>=', value: 18 }
          ]
        },
        orderBy: [{ field: 'name', direction: 'ASC' }],
        limit: 10,
        offset: 0
      });
      console.log('成年活躍使用者:', adultUsers);

      // === 更新資料 ===
      const updatedRows = await userRepo.update(
        { status: 'inactive' },  // 更新內容
        { field: 'id', op: '=', value: newUserId }  // 條件
      );
      console.log(`更新了 ${updatedRows} 筆資料`);

      // === 刪除資料 ===
      const deletedRows = await userRepo.delete({
        field: 'id',
        op: '=',
        value: newUserId
      });
      console.log(`刪除了 ${deletedRows} 筆資料`);
    }

    // === 監控連線池狀態 ===
    const poolStatus = gateway.getProviderPoolStatus('mysql');
    if (poolStatus) {
      console.log(`MySQL 連線池: ${poolStatus.activeConnections}/${poolStatus.maxConnections} 個連線使用中`);
    }

    // 取得所有連線池狀態
    const allPoolStatuses = gateway.getAllPoolStatuses();
    for (const [providerName, status] of allPoolStatuses) {
      console.log(`${providerName} 連線池狀態:`, status);
    }

  } finally {
    // 關閉所有連線
    await gateway.disconnectAll();
  }
}

// 執行主程式
main().catch(console.error);
```

## 第四步：執行程式

```bash
# 如果使用 TypeScript
npx ts-node app.ts

# 如果使用編譯後的 JavaScript
npm run build
node dist/app.js
```

## 簡化版範例（僅使用一個資料來源）

如果您只需要使用一個資料來源，可以使用更簡單的設定：

```typescript
import { DataGateway, SQLiteProviderOptions } from '@wfp99/data-gateway';

const simpleConfig = {
  providers: {
    main: {
      type: 'sqlite',
      options: { filename: './app.db' } as SQLiteProviderOptions
    }
  },
  repositories: {
    users: { provider: 'main', table: 'users' }
  }
};

async function simpleExample() {
  const gateway = await DataGateway.build(simpleConfig);
  const userRepo = gateway.getRepository('users');

  // 插入使用者
  await userRepo?.insert({ name: 'Alice', email: 'alice@example.com' });

  // 查詢所有使用者
  const users = await userRepo?.findMany();
  console.log('所有使用者:', users);

  await gateway.disconnectAll();
}

simpleExample().catch(console.error);
```

## 常見錯誤處理

```typescript
async function withErrorHandling() {
  try {
    const gateway = await DataGateway.build(config);
    const userRepo = gateway.getRepository('users');

    const result = await userRepo?.insert({ name: 'Test User' });
    console.log('成功:', result);

  } catch (error) {
    console.error('錯誤:', error);

    // 根據錯誤類型處理
    if (error instanceof Error) {
      if (error.message.includes('connection')) {
        console.error('連線錯誤 - 請檢查資料庫設定');
      } else if (error.message.includes('Provider')) {
        console.error('提供者錯誤 - 請檢查驅動程式安裝');
      }
    }
  }
}
```

## 下一步

現在您已經成功設定 Data Gateway！接下來可以：

- 📖 閱讀 [基本使用方法](./basic-usage.md) 了解更多功能
- 🏗️ 學習 [架構設計](../core/architecture.md) 深入了解核心概念
- ⚡ 探索 [連線池管理](../advanced/connection-pooling.md) 提升效能
- 🔧 查看 [自訂 Provider](../providers/custom.md) 擴展功能